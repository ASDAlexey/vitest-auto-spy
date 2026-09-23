// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import '../index';
import { restoreMockedProps } from './prop-mock';
import { stubWorker } from './worker-stub';

/**
 * The DOM-less half: Node has `EventTarget` and `MessageEvent` but no `Worker`, and before 26 no `ErrorEvent`,
 * so this is where the stub installs over nothing and builds its error event by hand.
 */
describe('stubWorker in a node environment', () => {
  afterEach(() => {
    restoreMockedProps();
    vi.unstubAllGlobals();
  });

  it('installs a Worker where the runtime has none, and takes it away again', () => {
    stubWorker();

    expect(typeof Reflect.get(globalThis, 'Worker')).toBe('function');

    restoreMockedProps();

    expect(Reflect.get(globalThis, 'Worker')).toBeUndefined();
  });

  it('carries message and error on a plain Event where there is no ErrorEvent', () => {
    // Node 26 ships a global ErrorEvent; the fallback is still what Node 22 and 24 run.
    vi.stubGlobal('ErrorEvent', undefined);
    const workers = stubWorker();
    const failure = new Error('boom');
    const onerror = vi.fn();

    new Worker('worker.js').onerror = onerror;
    workers.last.fail(failure);

    const event: unknown = onerror.mock.calls[0]?.[0];

    expect(typeof Reflect.get(globalThis, 'ErrorEvent')).toBe('undefined');
    expect(event).toBeInstanceOf(Event);
    expect(event).toMatchObject({ type: 'error', message: 'boom', error: failure });
  });
});
