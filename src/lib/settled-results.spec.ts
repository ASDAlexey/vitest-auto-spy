/**
 * The `mock.settledResults` polyfill in isolation (the Bun / `node:test` path,
 * which Vitest never exercises because it tracks `settledResults` natively) plus
 * the public contract that `spy.method.mock.settledResults` reflects
 * `resolveWith` / `rejectWith` on the default Vitest runtime.
 */
import { describe, expect, it } from 'vitest';

import { type Spy, clearAutoSpy, createSpyFromClass, resetAutoSpy } from '../index';
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
  it('records a non-thenable return as an immediately fulfilled entry, returning it unchanged', () => {
    const stub = makeStubMock();
    const recorder = installSettledResultsPolyfill(stub);

    expect(recorder.record(42)).toBe(42);
    expect(stub.mock['settledResults']).toEqual([{ type: 'fulfilled', value: 42 }]);
  });

  it('marks a pending promise incomplete, then mutates it to fulfilled on settle', async () => {
    const stub = makeStubMock();
    const recorder = installSettledResultsPolyfill(stub);
    const promise = Promise.resolve('ok');

    recorder.record(promise);
    expect(stub.mock['settledResults']).toEqual([{ type: 'incomplete', value: undefined }]);

    await promise;
    await Promise.resolve();
    expect(stub.mock['settledResults']).toEqual([{ type: 'fulfilled', value: 'ok' }]);
  });

  it('mutates a rejected promise entry to rejected with its reason', async () => {
    const stub = makeStubMock();
    const recorder = installSettledResultsPolyfill(stub);
    const reason = new Error('boom');

    recorder.record(Promise.reject(reason));
    await Promise.resolve();
    await Promise.resolve();
    expect(stub.mock['settledResults']).toEqual([{ type: 'rejected', value: reason }]);
  });

  it('keeps entries index-aligned with the call order and clears them on demand', () => {
    const stub = makeStubMock();
    const recorder = installSettledResultsPolyfill(stub);

    recorder.record('a');
    recorder.record(Promise.resolve('b'));
    expect(stub.mock['settledResults']).toEqual([
      { type: 'fulfilled', value: 'a' },
      { type: 'incomplete', value: undefined },
    ]);

    recorder.clear();
    expect(stub.mock['settledResults']).toEqual([]);
  });

  it('is a no-op when the runner already tracks settledResults natively', () => {
    const stub = { mock: { settledResults: ['native'] } };
    const recorder = installSettledResultsPolyfill(stub);

    expect(recorder.record('x')).toBe('x');
    recorder.clear();
    expect(stub.mock.settledResults).toEqual(['native']);
  });

  it('is a no-op when the mock exposes no state at all', () => {
    const recorder = installSettledResultsPolyfill({});

    expect(recorder.record('x')).toBe('x');
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
