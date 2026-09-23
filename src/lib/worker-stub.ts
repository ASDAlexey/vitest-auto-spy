/**
 * A `Worker` a spec can talk to from the worker's side.
 *
 * Neither jsdom nor happy-dom runs a worker script, and Node has no `Worker` global at all. Code that
 * builds one — `new Worker(new URL('./tree.worker', import.meta.url))` — therefore meets a spec that
 * has to intercept the construction, remember the listeners, and fake the reply. The copies of that
 * stub that projects write for themselves go wrong in the same three ways:
 *
 *  1. **One listener slot.** `addEventListener('message', …)` is written as an assignment to
 *     `onmessage`, so the second subscriber silently replaces the first and `removeEventListener`
 *     does nothing. Code that correlates replies by request id — one listener per pending call —
 *     is exactly the code that breaks, and its spec cannot see it. Here the stub *is* an
 *     `EventTarget`: listeners stack, `once` and `removeEventListener` work, and `onmessage` /
 *     `onerror` sit alongside them as the platform has them.
 *  2. **The reply arrives synchronously**, from inside `postMessage`, which no browser does. A
 *     subscriber attached a line after the post never runs in production and always runs in the
 *     spec. Replies here are queued, as a task would be — on a microtask, so fake timers do not
 *     have to be advanced for them.
 *  3. **The stub is never taken off.** Assigned to `globalThis.Worker` directly, it survives into the
 *     next file under `isolate: false`. Installation goes through {@link mockValueProp}, so
 *     `restoreMockedProps()` — which {@link setupAutoSpy} runs after every test — puts the real one
 *     back.
 *
 * Messages are passed through `structuredClone` in both directions, the way the platform copies
 * them: a component that posts a callback or a class with a private field fails here with the same
 * `DataCloneError` it would throw in the browser, rather than passing the spec and failing in
 * production.
 */
import { DOCS_LINKS, withDocs } from './docs-links';
import { type MockFn, getMockAdapter } from './mock-adapter';
import { mockValueProp } from './prop-mock';

/** One worker the code under test constructed. */
export interface WorkerInstance<TIn = unknown, TOut = unknown> {
  /** The script URL as the code under test passed it, stringified — `URL` objects included. */
  readonly url: string;
  /** The second constructor argument — `{ type: 'module', name }` and the like. */
  readonly options: WorkerOptions | undefined;
  /** The object the code under test holds: what `new Worker(…)` returned. */
  readonly host: Worker;
  /** Every message posted to the worker so far, as the worker would receive it (cloned). */
  readonly messages: TIn[];
  /** The spy behind `postMessage`. */
  readonly postMessage: MockFn;
  /** The spy behind `terminate`, which is how a spec checks that teardown ran. */
  readonly terminate: MockFn;
  /** Whether `terminate()` has been called. A terminated worker neither receives nor answers. */
  readonly terminated: boolean;
  /**
   * Post `data` from the worker to the code under test: a `message` event on the host, delivered
   * synchronously so the assertion can follow on the next line.
   *
   * Throws on a terminated worker, where the browser would drop it silently — a spec emitting into a
   * worker the code already tore down is asserting on something that cannot happen.
   */
  emit(data: TOut): void;
  /**
   * Fail the worker, as an uncaught exception inside its script does: an `error` event (an
   * `ErrorEvent` where the environment has one) carrying `message` and `error`.
   */
  fail(error: unknown): void;
}

/** The handle {@link stubWorker} returns: the workers built so far, and the newest one. */
export interface WorkerStub<TIn = unknown, TOut = unknown> {
  /** Every worker constructed since the stub was installed, in construction order. */
  readonly instances: WorkerInstance<TIn, TOut>[];
  /**
   * The most recently constructed worker. Throws when the code under test has constructed none,
   * rather than letting the next line fail against `undefined`.
   */
  readonly last: WorkerInstance<TIn, TOut>;
}

/** How a stubbed worker behaves beyond recording. */
export interface WorkerStubOptions<TIn = unknown, TOut = unknown> {
  /**
   * The worker script, reduced to what the spec needs: called for every posted message, on a
   * microtask after `postMessage` returns.
   *
   * Return the reply, or `undefined` to stay silent. A throw becomes an `error` event, as an
   * uncaught exception in a real worker does; `worker.emit` / `worker.fail` are there for
   * several replies to one message. Omitted, the worker is inert and the spec answers through
   * {@link WorkerInstance.emit} at a moment it chooses.
   */
  respond?: WorkerScript<TIn, TOut>;
}

/** The `respond` option: the reply to one message, or `undefined` for none. */
export type WorkerScript<TIn, TOut> = (data: TIn, worker: WorkerInstance<TIn, TOut>) => TOut | undefined;

interface MutableInstance<TIn, TOut> extends WorkerInstance<TIn, TOut> {
  terminated: boolean;
}

type EventHandler = ((this: Worker, event: Event) => unknown) | null;

/**
 * The part of a worker that is the same for every stub: an `EventTarget` with the three handler
 * properties, called after the listeners registered before them, with the worker as `this`.
 */
class WorkerHost extends EventTarget {
  // Accessors rather than fields: happy-dom's `dispatchEvent` calls an own `on<type>` property of an
  // `EventTarget` subclass itself (without `this`), and the listeners below would then call it twice.
  #onmessage: EventHandler = null;
  #onmessageerror: EventHandler = null;
  #onerror: EventHandler = null;

  constructor() {
    super();

    const host = asWorker(this);

    this.addEventListener('message', (event) => this.#onmessage?.call(host, event));
    this.addEventListener('messageerror', (event) => this.#onmessageerror?.call(host, event));
    this.addEventListener('error', (event) => this.#onerror?.call(host, event));
  }

  get onmessage(): EventHandler {
    return this.#onmessage;
  }

  set onmessage(handler: EventHandler) {
    this.#onmessage = handler;
  }

  get onmessageerror(): EventHandler {
    return this.#onmessageerror;
  }

  set onmessageerror(handler: EventHandler) {
    this.#onmessageerror = handler;
  }

  get onerror(): EventHandler {
    return this.#onerror;
  }

  set onerror(handler: EventHandler) {
    this.#onerror = handler;
  }
}

function asWorker(target: EventTarget): Worker {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the host carries every member code reads off a worker; `postMessage` and `terminate` are assigned by `createInstance`.
  return target as Worker;
}

function errorEvent(error: unknown): Event {
  const message = error instanceof Error ? error.message : String(error);

  if (typeof ErrorEvent === 'function') {
    return new ErrorEvent('error', { message, error, cancelable: true });
  }

  // Node has no `ErrorEvent`; the two fields a handler reads are put where the platform has them.
  return Object.defineProperties(new Event('error', { cancelable: true }), {
    message: { value: message },
    error: { value: error },
  });
}

function transferOf(transfer: unknown): Transferable[] {
  if (Array.isArray(transfer)) {
    return transfer;
  }

  const list: unknown = Reflect.get(Object(transfer), 'transfer');

  return Array.isArray(list) ? list : [];
}

function terminatedEmitError(url: string): Error {
  return new Error(
    withDocs(
      `[vitest-auto-spy] stubWorker(): emit() on a terminated worker (${url}). ` +
        'The browser drops messages from a worker after terminate(), so the code under test would never see this one.',
      DOCS_LINKS.workerStub,
    ),
  );
}

function answer<TIn, TOut>(instance: MutableInstance<TIn, TOut>, data: TIn, script: WorkerScript<TIn, TOut>): void {
  if (instance.terminated) {
    return;
  }

  let reply: TOut | undefined;

  try {
    reply = script(data, instance);
  } catch (error) {
    instance.fail(error);

    return;
  }

  if (reply !== undefined && !instance.terminated) {
    instance.emit(reply);
  }
}

function createInstance<TIn, TOut>(
  target: WorkerHost,
  scriptURL: URL | string,
  options: WorkerOptions | undefined,
  respond: WorkerScript<TIn, TOut> | undefined,
): MutableInstance<TIn, TOut> {
  const adapter = getMockAdapter();

  const instance: MutableInstance<TIn, TOut> = {
    url: String(scriptURL),
    options,
    host: asWorker(target),
    messages: [],
    terminated: false,
    postMessage: adapter.createMockFn((message: unknown, transfer?: unknown) => {
      if (instance.terminated) {
        return;
      }

      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the payload type is the spec's declaration of the protocol.
      const data = structuredClone(message, { transfer: transferOf(transfer) }) as TIn;

      instance.messages.push(data);

      if (respond) {
        queueMicrotask(() => answer(instance, data, respond));
      }
    }, 'postMessage'),
    terminate: adapter.createMockFn(() => {
      instance.terminated = true;
    }, 'terminate'),
    emit: (data: TOut): void => {
      if (instance.terminated) {
        throw terminatedEmitError(instance.url);
      }

      target.dispatchEvent(new MessageEvent('message', { data: structuredClone(data) }));
    },
    fail: (error: unknown): void => {
      if (!instance.terminated) {
        target.dispatchEvent(errorEvent(error));
      }
    },
  };

  Object.assign(target, { postMessage: instance.postMessage, terminate: instance.terminate });

  return instance;
}

/**
 * Replace the global `Worker` with one whose instances a spec drives from the worker's side.
 *
 * ```ts
 * const workers = stubWorker<TreeRequest, TreeResponse>({
 *   respond: (request) => ({ requestId: request.requestId, nodes: [] }),
 * });
 *
 * await firstValueFrom(service.visibleNodes(request));
 *
 * expect(workers.last.messages).toEqual([request]);
 * ```
 *
 * The replacement is registered with {@link restoreMockedProps}, so a suite running
 * {@link setupAutoSpy} gets the previous `Worker` (or none) back after the test.
 *
 * @returns A handle over the workers the code under test constructs from now on.
 */
export function stubWorker<TIn = unknown, TOut = unknown>(options: WorkerStubOptions<TIn, TOut> = {}): WorkerStub<TIn, TOut> {
  const instances: MutableInstance<TIn, TOut>[] = [];

  class StubWorker extends WorkerHost {
    constructor(scriptURL: URL | string, workerOptions?: WorkerOptions) {
      super();
      instances.push(createInstance<TIn, TOut>(this, scriptURL, workerOptions, options.respond));
    }
  }

  mockValueProp(globalThis, 'Worker', StubWorker);

  return {
    instances,
    get last(): WorkerInstance<TIn, TOut> {
      const instance = instances.at(-1);

      if (!instance) {
        throw new Error(
          withDocs(
            '[vitest-auto-spy] stubWorker(): the code under test has not constructed a Worker. ' +
              'Run the code that creates it before reaching for `last`, and check that the stub was installed ' +
              'before the construction rather than after it.',
            DOCS_LINKS.workerStub,
          ),
        );
      }

      return instance;
    },
  };
}
