/**
 * End-to-end: the public `vitest-auto-spy/node` entry must drive the whole core
 * on `node:test` mocks. Per-file isolation (vitest `isolate: true`) means this
 * file registers the node adapter on its own, with no Vitest adapter present.
 *
 * Assertions use the runtime-agnostic auto-spy helpers (`calledWith`,
 * `resolveWith`) and the node adapter's `getCalls` — never Vitest's native mock
 * surface, which a `node:test` mock does not expose.
 */
import { describe, expect, it } from 'vitest';

import { nodeMockAdapter } from './lib/node-adapter';
import { createSpyFromClass } from './node';

class Service {
  syncMethod(_a?: number): string {
    return 'real';
  }

  getPromise(): Promise<string> {
    return Promise.resolve('real');
  }
}

describe('vitest-auto-spy/node (end-to-end)', () => {
  it('builds a working spy on node:test mocks via calledWith + resolveWith', async () => {
    const spy = createSpyFromClass(Service);

    spy.syncMethod.calledWith(1).mockReturnValue('one');
    expect(spy.syncMethod(1)).toBe('one');
    expect(spy.syncMethod(2)).toBeUndefined();

    spy.getPromise.resolveWith('p');
    await expect(spy.getPromise()).resolves.toBe('p');
  });

  it('records calls through the node:test mock shape', () => {
    const spy = createSpyFromClass(Service);

    spy.syncMethod(1);
    spy.syncMethod(2);

    expect(nodeMockAdapter.getCalls(spy.syncMethod)).toEqual([[1], [2]]);
  });
});
