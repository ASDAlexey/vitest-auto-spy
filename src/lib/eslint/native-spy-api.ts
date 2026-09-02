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

/** One edit, and the two spellings the message quotes. */
export interface NativeRewrite {
  /** The node the edit replaces. */
  node: EsNode;
  /** What it becomes. */
  text: string;
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

  return { base: node.object, member, call };
}

/** An optional link inside the chain being replaced — the rewrite would drop it without a word. */
function reachesThroughOptional(context: RuleContext, node: EsNode): boolean {
  return context.sourceCode.getText(node).includes('?.');
}

/** A `withArgs(…)` call, split into the spy it was called on and the call itself. */
interface WithArgsChain {
  receiver: EsNode;
  call: EsCallExpression;
}

/** The `withArgs(…)` call a `.and` hangs off, when the `.and` belongs to one. */
function withArgsCall(node: EsNode): WithArgsChain | undefined {
  if (!isCallExpression(node) || !isMemberExpression(node.callee) || memberName(node.callee) !== 'withArgs') {
    return undefined;
  }

  return { receiver: node.callee.object, call: node };
}

/** The arguments of a call, as they are written. */
function argumentText(context: RuleContext, call: EsCallExpression): string {
  return call.arguments.map((argument) => context.sourceCode.getText(argument)).join(', ');
}

/** `spy.withArgs(a).and.returnValue(v)` → `spy.calledWith(a).mockReturnValue(v)`. */
function chainRewrite(context: RuleContext, found: NamespaceCall, withArgs: WithArgsChain, target: string): NativeRewrite {
  const receiver = context.sourceCode.getText(withArgs.receiver);
  const text = `${receiver}.calledWith(${argumentText(context, withArgs.call)}).${target}(${argumentText(context, found.call)})`;

  return { node: found.call, text, from: `.withArgs(…).and.${found.member}(…)`, to: `.calledWith(…).${target}(…)` };
}

/** `spy.and.returnValue(v)` → `spy.mockReturnValue(v)`, the receiver and the argument untouched. */
function renameRewrite(context: RuleContext, found: NamespaceCall, target: string): NativeRewrite {
  return {
    node: found.call.callee,
    text: `${context.sourceCode.getText(found.base)}.${target}`,
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
    return { node: found.call, text: `${base}.mock.calls.length`, from: '.calls.count()', to: '.mock.calls.length' };
  }

  if (found.member === 'reset') {
    return { node: found.call, text: `${base}.mockClear()`, from: '.calls.reset()', to: '.mockClear()' };
  }

  // Without an index there is nothing to write between the brackets, and `mock.calls[undefined]` is
  // not what the line meant.
  if (found.member !== 'argsFor' || !index) {
    return undefined;
  }

  const text = `${base}.mock.calls[${context.sourceCode.getText(index)}]`;

  return { node: found.call, text, from: '.calls.argsFor(i)', to: '.mock.calls[i]' };
}

/** The `<base>.calls.saveArgumentsByValue()` call — the one namespace call that has no replacement. */
export function saveArgumentsByValueCall(node: EsMemberExpression): EsNode | undefined {
  const found = namespaceCall(node, 'calls');

  return found?.member === 'saveArgumentsByValue' ? found.call : undefined;
}
