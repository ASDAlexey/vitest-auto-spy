/**
 * The mechanical half of `prefer-native-spy-api`: which jasmine namespace call has a spelling of
 * this library's own, and what the edit is.
 *
 * Every rewrite here stays inside one call expression and keeps the same receiver, so what changes
 * is the name of the member and nothing else — `.and.returnValue(x)` and `.mockReturnValue(x)` reach
 * the same adapter with the same value. That is the whole licence for an autofix, and it is drawn
 * as narrowly as it sounds: a strategy with no equivalent (`.and.returnValues`, `.and.callThrough`,
 * `.and.stub`, `.and.throwError`, `.and.resolveTo`) and a bookkeeping call whose shape differs
 * (`.calls.mostRecent()`, `.calls.all()`) are not here at all, because there is no rename that says
 * the same thing.
 *
 * A chain carrying an optional link is left alone: the replacement is built from the receiver's
 * source text plus a member name, so `spy?.and.returnValue(1)` would come back as `spy.mockReturnValue(1)`
 * — the same call with the guard silently removed.
 *
 * A comment inside the replaced span that the replacement does not carry over marks the rewrite
 * `dropsComments`, and the rule then offers it as a suggestion instead of applying it.
 */
import {
  type EsCallExpression,
  type EsMemberExpression,
  type EsNode,
  type RuleContext,
  isCallExpression,
  isMemberExpression,
  memberName,
} from './rule-types';

export interface RewriteEdit {
  range: [number, number];
  text: string;
}

/** One edit, and the two spellings the message quotes. */
export interface NativeRewrite {
  /** The node the report points at. */
  node: EsNode;
  /** The spans the edit replaces, and what each becomes. */
  edits: RewriteEdit[];
  /** Whether a replaced span holds a comment the replacement does not carry over. */
  dropsComments: boolean;
  /** The compatibility layer's spelling. */
  from: string;
  /** The spy's own. */
  to: string;
}

/** `.and.<member>` where the library's name for the same thing is a different one. */
const AND_RENAMES = new Map([
  ['returnValue', 'mockReturnValue'],
  ['callFake', 'mockImplementation'],
]);

/**
 * `.and.<helper>` where the helper is already on the spy and `.and` only re-publishes it.
 *
 * These are the async helpers `jasmine-auto-spies` keeps behind `.and` because that is where
 * jasmine's own strategies live; here they sit on the spy itself, so the edit is deleting `.and`.
 */
const AND_DELEGATED = new Set([
  'complete',
  'nextOneTimeWith',
  'nextWith',
  'nextWithPerCall',
  'nextWithValues',
  'rejectWith',
  'resolveWith',
  'resolveWithPerCall',
  'returnSubject',
  'throwWith',
]);

/** The `.and` member this library answers to, or `undefined` where it has no single answer. */
function andTarget(member: string): string | undefined {
  return AND_RENAMES.get(member) ?? (AND_DELEGATED.has(member) ? member : undefined);
}

/** `<base>.<namespace>.<member>(…)`, taken apart. */
interface NamespaceCall {
  /** What the namespace hangs off. */
  base: EsNode;
  /** The namespace's own name, `and` or `calls`. */
  namespace: EsNode;
  /** The member's name as written after the namespace. */
  name: EsNode;
  /** The name read off the namespace. */
  member: string;
  /** The call itself. */
  call: EsCallExpression;
}

/** Read `<base>.<namespace>.<member>(…)` off the namespace node, when that is the shape it is in. */
function namespaceCall(node: EsMemberExpression, namespace: string): NamespaceCall | undefined {
  const method = node.parent;

  if (memberName(node) !== namespace || !isMemberExpression(method) || method.object !== node) {
    return undefined;
  }

  const member = memberName(method);
  const call = method.parent;

  if (member === undefined || !isCallExpression(call) || call.callee !== method) {
    return undefined;
  }

  return { base: node.object, namespace: node.property, name: method.property, member, call };
}

/** Whether the source of `range`, minus the nodes the replacement copies verbatim, holds a comment. */
function losesComment(context: RuleContext, range: [number, number], kept: readonly EsNode[]): boolean {
  const source = context.sourceCode.getText();
  let rest = '';
  let from = range[0];

  for (const node of kept) {
    rest += source.slice(from, node.range[0]);
    from = node.range[1];
  }

  return /\/[*/]/.test(rest + source.slice(from, range[1]));
}

/** An edit that replaces `node` whole with `text` built from the source of `kept`, in source order. */
function replaceNode(
  context: RuleContext,
  node: EsNode,
  text: string,
  kept: readonly EsNode[],
): Pick<NativeRewrite, 'dropsComments' | 'edits' | 'node'> {
  return { node, edits: [{ range: node.range, text }], dropsComments: losesComment(context, node.range, kept) };
}

/** `and.returnValue` → `mockReturnValue`: the namespace through the member name, and nothing around it. */
function memberEdit(context: RuleContext, found: NamespaceCall, target: string): { edit: RewriteEdit; dropsComments: boolean } {
  const range: [number, number] = [found.namespace.range[0], found.name.range[1]];

  return { edit: { range, text: target }, dropsComments: losesComment(context, range, []) };
}

/** An optional link inside the chain being replaced — the rewrite would drop it without a word. */
function reachesThroughOptional(context: RuleContext, node: EsNode): boolean {
  return context.sourceCode.getText(node).includes('?.');
}

/** A `withArgs(…)` call, split into the spy it was called on and the call itself. */
interface WithArgsChain {
  /** The `withArgs` name itself. */
  name: EsNode;
  call: EsCallExpression;
}

/** The `withArgs(…)` call a `.and` hangs off, when the `.and` belongs to one. */
function withArgsCall(node: EsNode): WithArgsChain | undefined {
  if (!isCallExpression(node) || !isMemberExpression(node.callee) || memberName(node.callee) !== 'withArgs') {
    return undefined;
  }

  return { name: node.callee.property, call: node };
}

/** `spy.withArgs(a).and.returnValue(v)` → `spy.calledWith(a).mockReturnValue(v)`, two renames and nothing else. */
function chainRewrite(context: RuleContext, found: NamespaceCall, withArgs: WithArgsChain, target: string): NativeRewrite {
  const { edit, dropsComments } = memberEdit(context, found, target);

  return {
    node: found.call,
    edits: [{ range: withArgs.name.range, text: 'calledWith' }, edit],
    dropsComments,
    from: `.withArgs(…).and.${found.member}(…)`,
    to: `.calledWith(…).${target}(…)`,
  };
}

/** `spy.and.returnValue(v)` → `spy.mockReturnValue(v)`: only `and.returnValue` is rewritten, so the receiver and the arguments stay as written. */
function renameRewrite(context: RuleContext, found: NamespaceCall, target: string): NativeRewrite {
  const { edit, dropsComments } = memberEdit(context, found, target);

  return {
    node: found.call.callee,
    edits: [edit],
    dropsComments,
    from: `.and.${found.member}(…)`,
    to: `.${target}(…)`,
  };
}

/** What replaces a `.and` call, when this library spells the same thing itself. */
export function andRewrite(context: RuleContext, node: EsMemberExpression): NativeRewrite | undefined {
  const found = namespaceCall(node, 'and');

  if (!found || reachesThroughOptional(context, found.call.callee)) {
    return undefined;
  }

  const target = andTarget(found.member);

  if (target === undefined) {
    return undefined;
  }

  const withArgs = withArgsCall(found.base);

  return withArgs ? chainRewrite(context, found, withArgs, target) : renameRewrite(context, found, target);
}

/** What replaces a `.calls` call — the three whose native shape is one expression. */
export function callsRewrite(context: RuleContext, node: EsMemberExpression): NativeRewrite | undefined {
  const found = namespaceCall(node, 'calls');

  if (!found || reachesThroughOptional(context, found.call.callee)) {
    return undefined;
  }

  const base = context.sourceCode.getText(found.base);
  const [index] = found.call.arguments;

  if (found.member === 'count') {
    return {
      ...replaceNode(context, found.call, `${base}.mock.calls.length`, [found.base]),
      from: '.calls.count()',
      to: '.mock.calls.length',
    };
  }

  if (found.member === 'reset') {
    return { ...replaceNode(context, found.call, `${base}.mockClear()`, [found.base]), from: '.calls.reset()', to: '.mockClear()' };
  }

  // Without an index there is nothing to write between the brackets, and `mock.calls[undefined]` is
  // not what the line meant.
  if (found.member !== 'argsFor' || !index) {
    return undefined;
  }

  const text = `${base}.mock.calls[${context.sourceCode.getText(index)}]`;

  return { ...replaceNode(context, found.call, text, [found.base, index]), from: '.calls.argsFor(i)', to: '.mock.calls[i]' };
}

/** The `<base>.calls.saveArgumentsByValue()` call — the one namespace call that has no replacement. */
export function saveArgumentsByValueCall(node: EsMemberExpression): EsNode | undefined {
  const found = namespaceCall(node, 'calls');

  return found?.member === 'saveArgumentsByValue' ? found.call : undefined;
}
