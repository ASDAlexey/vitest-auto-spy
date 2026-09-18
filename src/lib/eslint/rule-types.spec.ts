/**
 * The subtree walk the rules share, against a real AST.
 *
 * Every rule reaches it through ESLint, where the parser's visitor keys are always there; what is
 * checked here is the other side — the enumeration fallback ESLint's own traverser keeps for a node
 * type no table lists. A parser that ships no keys for a shape it emits would otherwise make the
 * walk stop at that node, and the rule above it go quiet without saying so.
 */
import * as tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

import { type EsNode, type RuleContext, anyInSubtree, countInSubtree, isCallExpression, isRunnerFnCall } from './rule-types';

// The hole in `deps` is deliberate: an array element that is not a node at all, which the walk has
// to step over whichever set of keys brought it there.
const CODE = 'const p = { provide: Cart, useValue: { total: vi.fn(), save: vi.fn() }, deps: [Cart, , Nav] };';

/** A context carrying nothing but the visitor keys the walk reads. */
function contextWith(visitorKeys: Record<string, readonly string[]>): RuleContext {
  return { sourceCode: { visitorKeys } } as RuleContext;
}

/** The program of `CODE`, with the keys the parser publishes for it. */
function parsed(): { keys: Record<string, readonly string[]>; program: EsNode } {
  const { ast, visitorKeys } = tsParser.parseForESLint(CODE, { range: true, loc: true });

  return { keys: visitorKeys as Record<string, readonly string[]>, program: ast as unknown as EsNode };
}

describe('countInSubtree', () => {
  it('finds the same nodes by enumeration as by the parser’s visitor keys', () => {
    const { keys, program } = parsed();

    expect(countInSubtree(contextWith(keys), program, isRunnerFnCall, true)).toBe(2);
    expect(countInSubtree(contextWith({}), program, isRunnerFnCall, true)).toBe(2);
  });

  it('stops at the first match when only the answer is asked for', () => {
    const { keys, program } = parsed();
    let seen = 0;

    const counted = (node: EsNode): boolean => {
      seen += isCallExpression(node) ? 1 : 0;

      return isRunnerFnCall(node);
    };

    expect(anyInSubtree(contextWith(keys), program, counted, true)).toBe(true);
    expect(seen).toBe(1);
  });
});
