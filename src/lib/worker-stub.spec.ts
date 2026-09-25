import { afterEach, describe, expect, it, vi } from 'vitest';

// Registers the Vitest mock adapter, which the stub uses to build its `postMessage` / `terminate` spies.
import '../index';
import { restoreMockedProps } from './prop-mock';
import { stubWorker } from './worker-stub';

interface Request {
  requestId: string;
  value: number;
}

interface Response {
  requestId: string;
  doubled: number;
}

/** Stands in for the code under test: one worker, one listener per pending request, correlated by id. */
class DoublingService {
  private readonly worker = new Worker(new URL('./doubling.worker.ts', 'file:///app/'), { type: 'module' });

  double(request: Request): Promise<Response> {
    return new Promise((resolve) => {
      const handler = (event: MessageEvent<Response>): void => {
        if (event.data.requestId !== request.requestId) {
          return;
        }

        this.worker.removeEventListener('message', handler);
        resolve(event.data);
      };

      this.worker.addEventListener('message', handler);
      this.worker.postMessage(request);
    });
  }

  destroy(): void {
    this.worker.terminate();
  }
}

const doubling = (request: Request): Response => ({ requestId: request.requestId, doubled: request.value * 2 });

describe('stubWorker', () => {
  afterEach(() => {
    restoreMockedProps();
  });

  it('records the construction and every message the code under test posts', () => {
    const workers = stubWorker<Request, Response>();
    const worker = new Worker(new URL('./doubling.worker.ts', 'file:///app/'), { type: 'module', name: 'doubling' });

    worker.postMessage({ requestId: 'a', value: 1 });

    expect(workers.instances).toHaveLength(1);
    expect(workers.last.host).toBe(worker);
    expect(workers.last.url).toBe('file:///app/doubling.worker.ts');
    expect(workers.last.options).toEqual({ type: 'module', name: 'doubling' });
    expect(workers.last.messages).toEqual([{ requestId: 'a', value: 1 }]);
    expect(workers.last.postMessage).toHaveBeenCalledOnce();
  });

  it('answers through `respond` after postMessage returns, not from inside it', async () => {
    stubWorker<Request, Response>({ respond: doubling });
    const worker = new Worker('doubling.js');
    const received: unknown[] = [];

    worker.postMessage({ requestId: 'a', value: 2 });
    worker.addEventListener('message', (event: MessageEvent) => received.push(event.data));

    expect(received).toEqual([]);

    await Promise.resolve();

    expect(received).toEqual([{ requestId: 'a', doubled: 4 }]);
  });

  it('keeps every listener, so replies correlated by request id reach their own caller', async () => {
    stubWorker<Request, Response>({ respond: doubling });
    const service = new DoublingService();

    const [first, second] = await Promise.all([service.double({ requestId: 'a', value: 1 }), service.double({ requestId: 'b', value: 5 })]);

    expect(first).toEqual({ requestId: 'a', doubled: 2 });
    expect(second).toEqual({ requestId: 'b', doubled: 10 });
  });

  it('calls onmessage beside the listeners, with the worker as `this`', () => {
    const workers = stubWorker<Request, Response>();
    const worker = new Worker('doubling.js');
    const onmessage = vi.fn();
    const listener = vi.fn();

    worker.onmessage = onmessage;
    worker.addEventListener('message', listener, { once: true });
    workers.last.emit({ requestId: 'a', doubled: 2 });
    workers.last.emit({ requestId: 'b', doubled: 4 });

    expect(onmessage).toHaveBeenCalledTimes(2);
    expect(onmessage.mock.contexts[0]).toBe(worker);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('reads the handler properties back, null until assigned', () => {
    stubWorker();
    const worker = new Worker('doubling.js');
    const handler = vi.fn();

    expect([worker.onmessage, worker.onmessageerror, worker.onerror]).toEqual([null, null, null]);

    worker.onmessage = handler;
    worker.onmessageerror = handler;
    worker.onerror = handler;

    expect([worker.onmessage, worker.onmessageerror, worker.onerror]).toEqual([handler, handler, handler]);
  });

  it('stays silent when `respond` returns undefined', async () => {
    const workers = stubWorker<Request, Response>({ respond: () => undefined });
    const worker = new Worker('doubling.js');
    const listener = vi.fn();

    worker.addEventListener('message', listener);
    worker.postMessage({ requestId: 'a', value: 1 });
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
    expect(workers.last.messages).toHaveLength(1);
  });

  it('turns a throw from `respond` into an error event, as an uncaught exception in a worker does', async () => {
    const failure = new Error('out of memory');

    stubWorker<Request, Response>({
      respond: () => {
        throw failure;
      },
    });
    const worker = new Worker('doubling.js');
    const onerror = vi.fn();

    worker.onerror = onerror;
    worker.postMessage({ requestId: 'a', value: 1 });
    await Promise.resolve();

    const event: unknown = onerror.mock.calls[0]?.[0];

    expect(event).toBeInstanceOf(Event);
    expect(event).toMatchObject({ type: 'error', message: 'out of memory', error: failure });
  });

  it('reports a non-Error failure by its string form', () => {
    const workers = stubWorker();
    const worker = new Worker('doubling.js');
    const listener = vi.fn();

    worker.addEventListener('error', listener);
    workers.last.fail('script not found');

    expect(listener.mock.calls[0]?.[0]).toMatchObject({ message: 'script not found', error: 'script not found' });
  });

  it('copies messages the way the platform does, and refuses what it cannot copy', () => {
    const workers = stubWorker();
    const worker = new Worker('doubling.js');
    const payload = { nested: { value: 1 } };

    worker.postMessage(payload);
    payload.nested.value = 2;

    expect(workers.last.messages).toEqual([{ nested: { value: 1 } }]);
    expect(() => worker.postMessage({ callback: () => undefined })).toThrow(/could not be cloned/);
  });

  it('transfers buffers passed as a list or as `{ transfer }`', () => {
    stubWorker();
    const worker = new Worker('doubling.js');
    const first = new ArrayBuffer(8);
    const second = new ArrayBuffer(8);

    worker.postMessage(first, [first]);
    worker.postMessage(second, { transfer: [second] });

    expect(first.byteLength).toBe(0);
    expect(second.byteLength).toBe(0);
  });

  it('neither receives nor answers once terminated', async () => {
    const respond = vi.fn(doubling);
    const workers = stubWorker<Request, Response>({ respond });
    const service = new DoublingService();

    void service.double({ requestId: 'a', value: 1 });
    service.destroy();
    new Worker('other.js').postMessage({ requestId: 'b', value: 1 });
    await Promise.resolve();

    const [terminated] = workers.instances;

    expect(terminated?.terminated).toBe(true);
    expect(terminated?.terminate).toHaveBeenCalledOnce();
    expect(respond).toHaveBeenCalledOnce();

    terminated?.host.postMessage({ requestId: 'c', value: 1 });

    expect(terminated?.messages).toHaveLength(1);
  });

  it('drops the reply when `respond` itself terminates the worker', async () => {
    const workers = stubWorker<Request, Response>({
      respond: (request, worker) => {
        worker.host.terminate();

        return doubling(request);
      },
    });
    const worker = new Worker('doubling.js');
    const listener = vi.fn();

    worker.addEventListener('message', listener);
    worker.postMessage({ requestId: 'a', value: 1 });
    await Promise.resolve();

    expect(workers.last.terminated).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it('drops a failure on a terminated worker, and refuses to emit from one', () => {
    const workers = stubWorker();
    const worker = new Worker('doubling.js');
    const onerror = vi.fn();

    worker.onerror = onerror;
    worker.terminate();
    workers.last.fail(new Error('late'));

    expect(onerror).not.toHaveBeenCalled();
    expect(() => workers.last.emit('late')).toThrow(
      /emit\(\) on a terminated worker \(doubling\.js\)[\s\S]*Emit before the code under test terminates the worker/,
    );
  });

  it('calls onmessageerror for a messageerror event', () => {
    const workers = stubWorker();
    const worker = new Worker('doubling.js');
    const onmessageerror = vi.fn();

    worker.onmessageerror = onmessageerror;
    workers.last.host.dispatchEvent(new MessageEvent('messageerror'));

    expect(onmessageerror).toHaveBeenCalledOnce();
  });

  it('says what to check when the code under test built no worker', () => {
    const workers = stubWorker();

    expect(() => workers.last).toThrow(/the stub is installed, but the code under test has not constructed a Worker yet/);
  });

  it('says the stub was taken off when a restore already removed it', () => {
    const workers = stubWorker();

    restoreMockedProps();

    expect(() => workers.last).toThrow(/this stub is no longer the global Worker[\s\S]*#the-stub-nobody-takes-off$/);
  });

  it('puts the previous Worker back through restoreMockedProps', () => {
    const before: unknown = Reflect.get(globalThis, 'Worker');

    stubWorker();
    expect(Reflect.get(globalThis, 'Worker')).not.toBe(before);

    restoreMockedProps();

    expect(Reflect.get(globalThis, 'Worker')).toBe(before);
  });
});
