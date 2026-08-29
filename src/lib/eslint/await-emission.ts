/**
 * Turning the commonest shape of `no-expect-in-subscribe` back into an awaited assertion.
 *
 * One template accounted for 111 of the 133 violations in a batch of 22 migrated spec files, and it
 * is the same template every time:
 *
 * ```ts
 * it('maps the products', () =>
 *   new Promise<void>((done) => {
 *     service.getProducts(id).subscribe((products) => {
 *       expect(products).toEqual(expected);
 *       done();
 *     });
 *   }));
 * ```
 *
 * The `done` callback is a Jasmine habit Vitest never had, and the `new Promise` around it is what a
 * mechanical migration produced when `done` stopped being a parameter. What the test means is one
 * line:
 *
 * ```ts
 * it('maps the products', async () => {
 *   const products = await firstValueFrom(service.getProducts(id));
 *
 *   expect(products).toEqual(expected);
 * });
 * ```
 *
 * It is offered as a **suggestion**, never as a fix. The rewrite is only equivalent while the
 * assertions are the whole of what the callback does and nothing else in the file depends on the
 * subscription outliving them — true of every occurrence seen so far, and not something the shape
 * alone can promise. A wrong rewrite here would leave a test that still passes, which is exactly the
 * failure this rule exists to catch, so it does not run unattended.
 */
import { type BindingState, bindingState, insertImport } from './bindings';
import {
  type EsFix,
  type EsFixer,
  type EsFunction,
  type EsIdentifier,
  type EsNode,
  type EsSourceCode,
  type RuleContext,
  type SuggestionDescriptor,
  isBlockStatement,
  isCallExpression,
  isExpressionStatement,
  isIdentifier,
  isMemberExpression,
  isObjectExpression,
  propertyName,
  propertyValue,
} from './rule-types';

/** A `…subscribe(…)` call, with the source expression its callee reads. */
export interface EsSubscribeCall extends EsNode {
  callee: { object: EsNode };
  arguments: EsNode[];
}

/**
 * The `(done) => { … }` of `it(name, () => new Promise((done) => { … }))`.
 *
 * The frame above it is guaranteed by the selector that matches this node, so the walk back up to
 * the test callback and the call around it is declared here rather than re-checked at runtime —
 * the same convention the other rules use for what a selector has already established.
 */
export interface EsPromiseExecutor extends EsFunction {
  parent: EsNode & { parent: EsFunction };
}

/** The rewrite, and the `subscribe` call whose report it will be offered on. */
export interface AwaitedRewrite {
  subscribeCall: EsNode;
  suggestion: SuggestionDescriptor;
}

/** Whether a node is the `…subscribe(…)` call itself. */
export function isSubscribeCall(node: EsNode): node is EsSubscribeCall {
  return (
    isCallExpression(node) &&
    isMemberExpression(node.callee) &&
    isIdentifier(node.callee.property) &&
    node.callee.property.name === 'subscribe'
  );
}

/** The two function forms a callback is written as. */
const FUNCTION_EXPRESSIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

/** A function whose body is a block — the only form whose statements can be lifted out of it. */
function isBlockBodied(node: EsNode): node is EsFunction {
  return FUNCTION_EXPRESSIONS.has(node.type) && isBlockStatement(Reflect.get(node, 'body'));
}

/** The lone parameter of a function, when it has exactly one and it is a plain name. */
function soleName(fn: EsFunction): EsIdentifier | undefined {
  const names = fn.params.filter(isIdentifier);

  return fn.params.length === 1 ? names[0] : undefined;
}

/** The statements of a block-bodied function. */
function statementsOf(fn: EsFunction): EsNode[] {
  return isBlockStatement(fn.body) ? fn.body.body : [];
}

/** The whitespace the line containing `offset` starts with, so a replacement can sit at that depth. */
function lineIndent(source: string, offset: number): string {
  const line = source.slice(source.lastIndexOf('\n', offset) + 1, offset);

  return line.slice(0, line.length - line.trimStart().length);
}

/**
 * Move a block of source to a new depth, keeping the shape inside it.
 *
 * The first line is dropped in wherever the caller puts it; every later line is shifted by the
 * common indentation of the block, so nesting inside the lifted statements survives.
 */
function reindent(text: string, indent: string): string {
  const lines = text.split('\n');
  const depths = lines.slice(1).flatMap((line) => (line.trim().length > 0 ? [line.length - line.trimStart().length] : []));
  const strip = Math.min(...depths, Number.MAX_SAFE_INTEGER);

  // A blank line keeps no indentation of its own: prefixing one would leave trailing whitespace
  // in the middle of the rewritten test, which every formatter then has to take back out.
  return lines.map((line, index) => (index === 0 || line.trim().length === 0 ? line : `${indent}${line.slice(strip)}`)).join('\n');
}

/** The lone `subscribe(…)` statement of the promise executor, when that is all the executor does. */
function soleSubscribeCall(executor: EsPromiseExecutor): EsSubscribeCall | undefined {
  const statements = statementsOf(executor);
  const calls = statements.flatMap((statement) =>
    isExpressionStatement(statement) && isSubscribeCall(statement.expression) ? [statement.expression] : [],
  );

  // More than one statement means the executor also does something the rewrite would have to place,
  // and the commonest such statement is the one that *triggers* the source — which has to stay
  // before the await, not after it.
  return statements.length === 1 ? calls[0] : undefined;
}

/** The lone callback handed to `subscribe`, and which of the observer's three it is. */
interface SubscribeHandler {
  handler: EsFunction;
  /** `undefined` for the positional form, which is always `next`. */
  name: string | undefined;
}

/**
 * The one callback `subscribe` was given, positionally or as a single-property observer.
 *
 * The single-property requirement is what keeps `subscribe({ next: assert, complete: done })` out.
 * A one-off codemod that looked for `done()` as the last line of *a* callback found it in
 * `complete`, took `next` for the body, and broke the file — and the shape is not exotic: it is
 * what somebody writes when they suspect the stream may complete without emitting. There is no
 * single awaited expression that stands for both halves, so this declines rather than guesses.
 */
function soleHandler(call: EsSubscribeCall): SubscribeHandler | undefined {
  const [argument, ...extra] = call.arguments;

  if (!argument || extra.length > 0) {
    return undefined;
  }

  if (isBlockBodied(argument)) {
    return { handler: argument, name: undefined };
  }

  if (!isObjectExpression(argument)) {
    return undefined;
  }

  const named = argument.properties.flatMap((property) => {
    const value = propertyValue(property);
    const name = propertyName(property);

    return name !== undefined && isBlockBodied(value) ? [{ handler: value, name }] : [];
  });

  return argument.properties.length === 1 ? named[0] : undefined;
}

/** The rxjs awaiter that stands for a subscription, chosen by the handler the assertions were written on. */
interface Awaiter {
  /** Extra arguments the awaiter needs beyond the source. */
  extra: string;
  helper: string;
}

/**
 * Which awaiter replaces the subscription.
 *
 * `complete` is not `next` with a different name: it fires after the last value and *also* after a
 * stream that emitted nothing, so the awaiter has to tolerate an empty source — which
 * `firstValueFrom` does not, and `lastValueFrom` does once it is given a default. Seven places in
 * one file were written that way. An `error` handler has no awaited value at all: that one is
 * `await expect(firstValueFrom(src)).rejects…`, which is a different assertion rather than a
 * different call, so it is left to the message.
 */
function awaiterFor(name: string | undefined): Awaiter | undefined {
  if (name === undefined || name === 'next') {
    return { extra: '', helper: 'firstValueFrom' };
  }

  return name === 'complete' ? { extra: ', { defaultValue: undefined }', helper: 'lastValueFrom' } : undefined;
}

/** Whether the statement is a bare call of `name`, with nothing passed to it. */
function isSettleCall(statement: EsNode, name: string): boolean {
  if (!isExpressionStatement(statement) || !isCallExpression(statement.expression)) {
    return false;
  }

  const { callee, arguments: passed } = statement.expression;

  return isIdentifier(callee) && callee.name === name && passed.length === 0;
}

/**
 * How many times the settle callback is mentioned anywhere in the executor.
 *
 * Counted in the source text rather than through the scope manager, because a name that is only
 * *mentioned* is what matters and the count has to be wrong in the safe direction: a `done` inside
 * a comment or a string inflates it and costs a suggestion, while nothing can deflate it into
 * hiding a second call the rewrite would drop.
 */
function settleMentions(source: string, name: string): number {
  return source.match(new RegExp(`\\b${name}\\b`, 'g'))?.length ?? 0;
}

/** The awaited line that replaces the subscription. */
function awaitLine(source: EsSourceCode, call: EsSubscribeCall, awaiter: Awaiter, value: EsIdentifier | undefined): string {
  const awaited = `await ${awaiter.helper}(${source.getText(call.callee.object)}${awaiter.extra});`;

  return value ? `const ${value.name} = ${awaited}` : awaited;
}

/**
 * The whole rewrite, or nothing when any part of the shape is not the one this is about.
 *
 * Every guard below is a case that looks like the template and is not it, and each of them was
 * cheaper to decline than to be clever about.
 */
export function awaitedRewriteFor(context: RuleContext, executor: EsPromiseExecutor): AwaitedRewrite | undefined {
  const testCallback = executor.parent.parent;
  const settle = soleName(executor);
  const call = soleSubscribeCall(executor);

  if (!settle || !call || testCallback.params.length > 0) {
    return undefined;
  }

  const observed = soleHandler(call);
  const awaiter = observed && awaiterFor(observed.name);
  const statements = observed ? statementsOf(observed.handler) : [];
  const kept = statements.slice(0, -1);
  const settled = statements.slice(-1).filter((statement) => isSettleCall(statement, settle.name));

  // The mention count comes before the shape of the last statement on purpose: it is the check that
  // has an answer for a callback which never settles the promise at all.
  if (
    !observed ||
    !awaiter ||
    kept.length === 0 ||
    settleMentions(context.sourceCode.getText(executor.body), settle.name) !== 1 ||
    settled.length === 0
  ) {
    return undefined;
  }

  const value = soleName(observed.handler);
  const state = bindingState(context.sourceCode.getScope(executor), awaiter.helper);

  if ((observed.handler.params.length > 0 && !value) || state === 'taken') {
    return undefined;
  }

  return { subscribeCall: call, suggestion: buildSuggestion(context, { awaiter, call, kept, state, testCallback, value }) };
}

/** What {@link buildSuggestion} needs that the shape check has already established. */
interface RewriteParts {
  awaiter: Awaiter;
  call: EsSubscribeCall;
  kept: EsNode[];
  state: BindingState;
  testCallback: EsFunction;
  value: EsIdentifier | undefined;
}

/** Assemble the replacement text for the whole test callback, at the depth the test already sits at. */
function buildSuggestion(context: RuleContext, parts: RewriteParts): SuggestionDescriptor {
  const source = context.sourceCode.getText();
  const base = lineIndent(source, parts.testCallback.parent.range[0]);
  const inner = `${base}  `;
  const body = source.slice(
    Math.min(...parts.kept.map((statement) => statement.range[0])),
    Math.max(...parts.kept.map((statement) => statement.range[1])),
  );
  const replacement = `async () => {\n${inner}${awaitLine(context.sourceCode, parts.call, parts.awaiter, parts.value)}\n\n${inner}${reindent(body, inner)}\n${base}}`;

  return {
    desc: `Await the stream instead of resolving a done callback: ${parts.awaiter.helper}()`,
    fix: (fixer: EsFixer): EsFix[] => {
      const edits = [fixer.replaceText(parts.testCallback, replacement)];

      if (parts.state === 'free') {
        edits.push(insertImport(fixer, `import { ${parts.awaiter.helper} } from 'rxjs';`));
      }

      return edits;
    },
  };
}
