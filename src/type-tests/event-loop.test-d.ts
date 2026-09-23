/**
 * `flushEventLoopUntil` takes one budget: turns, or real milliseconds. Both at once would leave the
 * reader guessing which one ends the wait, so the options refuse the pair.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { type FlushUntilOptions, flushEventLoopUntil } from '../index';

describe('flushEventLoopUntil options', () => {
  it('accepts a turn budget, a time budget, or neither', () => {
    expectTypeOf<{ turns: 5; label: 'x' }>().toExtend<FlushUntilOptions>();
    expectTypeOf<{ timeoutMs: 1000; label: 'x' }>().toExtend<FlushUntilOptions>();
    expectTypeOf(flushEventLoopUntil(() => true)).resolves.toBeVoid();
    expectTypeOf(flushEventLoopUntil(() => true, { timeoutMs: 500 })).resolves.toBeVoid();
  });

  it('rejects both budgets at once', () => {
    expectTypeOf<{ turns: 5; timeoutMs: 1000 }>().not.toExtend<FlushUntilOptions>();
  });
});
