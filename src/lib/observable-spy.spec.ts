/**
 * A function spy owns one return-value container for its whole life, and the promise helpers
 * publish onto it flags (`_isRejectedPromise`, `valuesPerCalls`) that the dispatcher reads *before*
 * the plain value. These specs pin that the observable helpers take those leftovers down when they
 * publish, so the configuration written last is the one that answers — `rejectWith` used to win
 * forever, silently ignoring every `nextWith` after it.
 */
import { type Observable, firstValueFrom } from 'rxjs';
import { beforeAll, describe, expect, it } from 'vitest';

import { createFunctionSpy } from './function-spy';
import { registerMockAdapter } from './mock-adapter';
import { addObservableHelpersToCalledWithObject, addObservableHelpersToFunctionSpy, createObservablePropSpy } from './observable-spy';
import { registerObservableSupport } from './observable-support';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
  registerObservableSupport({
    addToFunctionSpy: addObservableHelpersToFunctionSpy,
    addToCalledWithObject: addObservableHelpersToCalledWithObject,
    createPropSpy: createObservablePropSpy,
  });
});

/** The promise helpers sit on every function spy; the typed surface only exposes them on a promise-returning one. */
interface PromiseHelpers {
  rejectWith(value?: unknown): void;
  resolveWithPerCall(configs: { delay?: number; value: unknown }[]): void;
}

/** A spy of a method the specs configure through both the promise and the observable helpers. */
function createMixedSpy(): PromiseHelpers & ReturnType<typeof createFunctionSpy<() => Observable<string>>> {
  return createFunctionSpy<() => Observable<string>>('load') as PromiseHelpers &
    ReturnType<typeof createFunctionSpy<() => Observable<string>>>;
}

describe('observable helpers, publishing over a previous configuration', () => {
  it('lets nextWith override an earlier rejectWith instead of being ignored', async () => {
    const load = createMixedSpy();

    load.rejectWith(new Error('stale'));
    load.nextWith('fresh');

    await expect(firstValueFrom(load())).resolves.toBe('fresh');
  });

  it('lets nextWith override an earlier per-call batch', async () => {
    const load = createMixedSpy();

    load.resolveWithPerCall([{ value: 'stale' }]);
    load.nextWith('fresh');

    await expect(firstValueFrom(load())).resolves.toBe('fresh');
  });

  it('lets nextWithPerCall override an earlier rejectWith', async () => {
    const load = createMixedSpy();

    load.rejectWith(new Error('stale'));
    load.nextWithPerCall([{ value: 'fresh' }]);

    await expect(firstValueFrom(load())).resolves.toBe('fresh');
  });

  it('does the same on a calledWith chain, which reuses one container across its own helpers', async () => {
    const load = createMixedSpy();
    const chain = load.calledWith();

    chain.nextWithPerCall([{ value: 'stale' }]);
    chain.nextWith('fresh');

    await expect(firstValueFrom(load())).resolves.toBe('fresh');
  });
});
