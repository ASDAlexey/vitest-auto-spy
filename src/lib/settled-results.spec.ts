/**
 * The `mock.settledResults` polyfill in isolation (the Bun / `node:test` path,
 * which Vitest never exercises because it tracks `settledResults` natively) plus
 * the public contract that `spy.method.mock.settledResults` reflects
 * `resolveWith` / `rejectWith` on the default Vitest runtime.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type Spy, clearAutoSpy, createSpyFromClass, resetAutoSpy } from '../index';
import { createFunctionSpy } from './function-spy';
import { type MockAdapter, getMockAdapter, hasMockAdapter, registerMockAdapter, resetMockAdapter } from './mock-adapter';
import { installSettledResultsPolyfill } from './settled-results';

/** A host mock whose `.mock` state has no native `settledResults` (Bun / node:test shape). */
function makeStubMock(): { mock: Record<string, unknown> } {
  return { mock: { calls: [] } };
}

class Api {
  load(_id?: number): Promise<number> {
    return Promise.resolve(0);
  }
}

describe('installSettledResultsPolyfill', () => {
  // `record` is optional on the interface — a runtime that tracks settled results itself gets a
  // recorder without one, so the spy's dispatch can skip the call rather than run an identity
  // function on every invocation. Every recorder in this block is a polyfilled one, which has it.
  it('records a non-thenable return as an immediately fulfilled entry, returning it unchanged', () => {
    const stub = makeStubMock();
    const recorder = installSettledResultsPolyfill(stub);

    expect(recorder.record?.(42)).toBe(42);
    expect(stub.mock['settledResults']).toEqual([{ type: 'fulfilled', value: 42 }]);
  });

  it('marks a pending promise incomplete, then mutates it to fulfilled on settle', async () => {
    const stub = makeStubMock();
    const recorder = installSettledResultsPolyfill(stub);
    const promise = Promise.resolve('ok');

    recorder.record?.(promise);
    expect(stub.mock['settledResults']).toEqual([{ type: 'incomplete', value: undefined }]);

    await promise;
    await Promise.resolve();
    expect(stub.mock['settledResults']).toEqual([{ type: 'fulfilled', value: 'ok' }]);
  });

  it('mutates a rejected promise entry to rejected with its reason', async () => {
    const stub = makeStubMock();
    const recorder = installSettledResultsPolyfill(stub);
    const reason = new Error('boom');

    recorder.record?.(Promise.reject(reason));
    await Promise.resolve();
    await Promise.resolve();
    expect(stub.mock['settledResults']).toEqual([{ type: 'rejected', value: reason }]);
  });

  it('keeps entries index-aligned with the call order and clears them on demand', () => {
    const stub = makeStubMock();
    const recorder = installSettledResultsPolyfill(stub);

    recorder.record?.('a');
    recorder.record?.(Promise.resolve('b'));
    expect(stub.mock['settledResults']).toEqual([
      { type: 'fulfilled', value: 'a' },
      { type: 'incomplete', value: undefined },
    ]);

    recorder.clear();
    expect(stub.mock['settledResults']).toEqual([]);
  });

  it('hands back nothing to record when the runner already tracks settledResults natively', () => {
    const stub = { mock: { settledResults: ['native'] } };
    const recorder = installSettledResultsPolyfill(stub);

    // No `record` at all, so the spy's dispatch skips the call entirely rather than running an
    // identity function on every invocation.
    expect(recorder.record).toBeUndefined();
    recorder.clear();
    expect(stub.mock.settledResults).toEqual(['native']);
  });

  it('hands back nothing to record when the mock exposes no state at all', () => {
    expect(installSettledResultsPolyfill({}).record).toBeUndefined();
  });
});

/**
 * The polyfill through a real function spy, on a runtime that does not track settled results.
 *
 * Vitest tracks them itself and this library's own spy does too, so under this runner the dispatch
 * never reaches the recorder — the branch that Bun and `node:test` take every call. A stub adapter
 * standing in for those runtimes is the only way to exercise it here, and it is worth exercising:
 * the recorder is what makes `spy.method.mock.settledResults` mean the same thing on all three.
 */
describe('the recorder inside a function spy on a runtime without settledResults', () => {
  let previousAdapter: MockAdapter | undefined;

  beforeEach(() => {
    previousAdapter = hasMockAdapter() ? getMockAdapter() : undefined;
    resetMockAdapter();
    registerMockAdapter({
      createMockFn: (implementation?: (...args: unknown[]) => unknown) => {
        const host = (...args: unknown[]): unknown => implementation?.(...args);

        return Object.assign(host, { mock: { calls: [] } });
      },
      spyOnGetter: () => (): undefined => undefined,
      spyOnSetter: () => (): undefined => undefined,
      getCalls: () => [],
      reset: () => undefined,
      clear: () => undefined,
      restoreImplementation: () => undefined,
    });
  });

  afterEach(() => {
    resetMockAdapter();

    if (previousAdapter) {
      registerMockAdapter(previousAdapter);
    }
  });

  it('records what the spy returned', async () => {
    const spy = createFunctionSpy<(value: number) => Promise<string>>('load');

    spy.resolveWith('value');

    const returned: unknown = spy(1);
    const state = Reflect.get(spy, 'mock');

    expect(Reflect.get(state as object, 'settledResults')).toEqual([{ type: 'incomplete', value: undefined }]);

    await returned;

    expect(Reflect.get(state as object, 'settledResults')).toEqual([{ type: 'fulfilled', value: 'value' }]);
  });
});

describe('mock.settledResults on the public spy', () => {
  it('reflects resolveWith and rejectWith outcomes on the Vitest runtime', async () => {
    const resolving: Spy<Api> = createSpyFromClass(Api);
    resolving.load.resolveWith(7);

    await resolving.load(1);
    expect(resolving.load.mock.settledResults).toEqual([{ type: 'fulfilled', value: 7 }]);

    const rejecting: Spy<Api> = createSpyFromClass(Api);
    const reason = new Error('nope');
    rejecting.load.rejectWith(reason);

    await rejecting.load(1).catch(() => undefined);
    expect(rejecting.load.mock.settledResults).toEqual([{ type: 'rejected', value: reason }]);
  });

  it('empties settledResults on clearAutoSpy and resetAutoSpy', async () => {
    const spy: Spy<Api> = createSpyFromClass(Api);
    spy.load.resolveWith(1);

    await spy.load(1);
    expect(spy.load.mock.settledResults).toHaveLength(1);

    clearAutoSpy(spy);
    expect(spy.load.mock.settledResults).toEqual([]);

    await spy.load(1);
    expect(spy.load.mock.settledResults).toHaveLength(1);

    resetAutoSpy(spy);
    expect(spy.load.mock.settledResults).toEqual([]);
  });
});
