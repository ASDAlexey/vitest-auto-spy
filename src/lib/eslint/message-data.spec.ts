import { describe, expect, it } from 'vitest';

import { argumentList, bindingName, excerpt, excerptOr, nameList, propertyLabel, receiverOf } from './message-data';
import type { EsNode, RuleContext } from './rule-types';

const source = new Map<EsNode, string>();
const context = { sourceCode: { getText: (node: EsNode) => source.get(node) ?? '' } } as unknown as RuleContext;

function node(text: string, extra: object = {}): EsNode {
  const made = { type: 'Identifier', ...extra } as unknown as EsNode;

  source.set(made, text);

  return made;
}

describe('message data', () => {
  it('quotes a node on one line and cuts a long one', () => {
    expect(excerpt(context, node('a(\n  b,\n  c)'))).toBe('a( b, c)');
    expect(excerpt(context, node('x'.repeat(20)), 10)).toBe(`${'x'.repeat(9)}…`);
  });

  it('falls back when the node is missing', () => {
    expect(excerptOr(context, node('a'), 'x')).toBe('a');
    expect(excerptOr(context, undefined, 'x')).toBe('x');
    expect(excerptOr(context, null, 'x')).toBe('x');
  });

  it('names a binding without its annotation', () => {
    expect(bindingName(context, node('svc: Api', { name: 'svc' }))).toBe('svc');
    expect(bindingName(context, node('this.svc', { type: 'MemberExpression' }))).toBe('this.svc');
  });

  it('labels a property with a dot where the key is a plain quoted name', () => {
    expect(propertyLabel('window', "'name'")).toBe('window.name');
    expect(propertyLabel('window', 'key')).toBe('window[key]');
    expect(propertyLabel('window', "'x-y'")).toBe("window['x-y']");
  });

  it('names what a call is made on', () => {
    const object = node('api.load');
    const member = node('api.load.calledWith', { type: 'MemberExpression', object });
    const bare = node('load');

    expect(receiverOf(context, node('c', { type: 'CallExpression', callee: member, arguments: [] }))).toBe('api.load');
    expect(receiverOf(context, node('c', { type: 'CallExpression', callee: bare, arguments: [] }))).toBe('load');
    expect(receiverOf(context, member)).toBe('api.load');
    expect(receiverOf(context, undefined)).toBe('source$');
  });

  it('lists names, bounded', () => {
    expect(nameList(['a'])).toBe('`a`');
    expect(nameList(['a', 'b'])).toBe('`a` and `b`');
    expect(nameList(['a', 'b', 'c'])).toBe('`a`, `b` and `c`');
    expect(nameList(['a', 'b', 'c', 'd', 'e'])).toBe('`a`, `b`, `c` and 2 more');
  });

  it('lists the arguments of a call, and nothing for anything else', () => {
    const call = node('f(a, b)', { type: 'CallExpression', arguments: [node('a'), node('b')] });

    expect(argumentList(context, call)).toBe('a, b');
    expect(argumentList(context, node('f'))).toBe('');
  });
});
