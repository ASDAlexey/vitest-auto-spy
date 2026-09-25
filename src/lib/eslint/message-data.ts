/** Values a lint message quotes from the file it reports on. */
import { type EsNode, type RuleContext, isCallExpression, isIdentifier, isMemberExpression } from './rule-types';

/** The source of `node` on one line, cut to `max` characters so a long argument cannot bury the diagnosis. */
export function excerpt(context: RuleContext, node: EsNode, max = 60): string {
  const text = context.sourceCode.getText(node).replace(/\s+/g, ' ');

  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** {@link excerpt} of a node that may be absent — a missing argument reads as `fallback`. */
export function excerptOr(context: RuleContext, node: EsNode | null | undefined, fallback: string, max = 60): string {
  return node ? excerpt(context, node, max) : fallback;
}

/** The name a binding introduces — `svc` for `svc: Api`, whose source text carries the annotation. */
export function bindingName(context: RuleContext, node: EsNode): string {
  return isIdentifier(node) ? node.name : excerpt(context, node, 40);
}

/** `window.name` for a quoted identifier key, `window[key]` for anything else. */
export function propertyLabel(object: string, key: string): string {
  const name = /^(["'`])([$A-Z_a-z][\w$]*)\1$/.exec(key)?.[2];

  return name ? `${object}.${name}` : `${object}[${key}]`;
}

/** What a call is made on — `api.load` for `api.load.calledWith(1)` — or the callee when it is a bare name. */
export function receiverOf(context: RuleContext, call: EsNode | undefined, fallback = 'source$'): string {
  if (!call) {
    return fallback;
  }

  const callee = isCallExpression(call) ? call.callee : call;

  return excerpt(context, isMemberExpression(callee) ? callee.object : callee, 40);
}

/** `a`, `a` and `b`, `a`, `b` and 3 more — the names a message lists, quoted and bounded. */
export function nameList(names: readonly string[], shown = 3): string {
  const quoted = names.slice(0, shown).map((name) => `\`${name}\``);
  const rest = names.length - quoted.length;

  if (rest > 0) {
    return `${quoted.join(', ')} and ${rest} more`;
  }

  return quoted.length > 1 ? `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}` : String(quoted[0]);
}

/** The arguments of a call as written, each cut to `max`; empty for anything that is not a call. */
export function argumentList(context: RuleContext, node: EsNode, max = 40): string {
  return isCallExpression(node) ? node.arguments.map((argument) => excerpt(context, argument, max)).join(', ') : '';
}
