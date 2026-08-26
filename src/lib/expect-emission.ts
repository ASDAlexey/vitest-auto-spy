/**
 * Observable assertions without `subscribe()`.
 *
 * `expect(...)` inside a `subscribe()` callback is the most common way to write a test that passes
 * while asserting nothing: if the stream never emits, the callback never runs, no expectation is
 * evaluated and the test is green and empty. These helpers invert that — the assertion is the
 * `await`, so a stream that stays silent fails with a message naming the stream and the timeout.
 *
 * The source is duck-typed (anything with `subscribe`), so the core stays free of any runtime rxjs
 * dependency and the helpers work with rxjs `Observable`s, Angular `toObservable()` results, signals
 * wrapped in `toObservable`, or a hand-rolled subscribable.
 */

/** Minimal observer accepted by {@link SubscribableLike}. */
export interface EmissionObserver<T> {
  next: (value: T) => void;
  error: (error: unknown) => void;
  complete: () => void;
}

/** Anything that can be subscribed to — an rxjs `Observable`, a `Subject`, a custom source. */
export interface SubscribableLike<T> {
  subscribe(observer: Partial<EmissionObserver<T>>): { unsubscribe(): void };
}

/** Timeout and labelling for the emission helpers. */
export interface EmissionOptions {
  /** Milliseconds to wait before failing. `0` disables the timer (useful under fake timers). Default `1000`. */
  timeout?: number;
  /** Name used in the failure message instead of the generic "the observable". */
  label?: string;
}

const DEFAULT_TIMEOUT_MS = 1000;

/**
 * The real timers, captured at import time.
 *
 * `vi.useFakeTimers()` replaces `setTimeout`, and a helper whose watchdog is itself faked never
 * fires: a stream that stays silent would hang until the runner's own test timeout, reporting
 * "test timed out" instead of "the stream did not emit". These helpers are the assertion, so their
 * clock must be the one thing a spec cannot stop.
 */
const setTimer: typeof setTimeout = globalThis.setTimeout.bind(globalThis);
const clearTimer: typeof clearTimeout = globalThis.clearTimeout.bind(globalThis);

function describeSource(options: EmissionOptions | undefined): string {
  return options?.label ?? 'the observable';
}

/** One subscription plus its timeout, torn down whichever way the promise settles. */
interface Collector<T> {
  values: T[];
  stop: () => void;
}

/** Settle callbacks of the promise a collector drives. */
interface Settle<T> {
  resolve: (values: T[]) => void;
  reject: (error: Error) => void;
}

function subscribeAndCollect<T>(
  source$: SubscribableLike<T>,
  options: EmissionOptions | undefined,
  settle: Settle<T>,
  isDone: (values: T[]) => boolean,
  onComplete: (values: T[]) => void,
): Collector<T> {
  const values: T[] = [];
  let subscription: { unsubscribe(): void } | undefined = undefined;
  let stopped = false;

  // Idempotent: called from `next`/`error`/`complete` (possibly before `subscribe` returned, for a
  // synchronous source) and again from the caller's own timer.
  const stop = (): void => {
    stopped = true;
    clearTimer(timer);
    subscription?.unsubscribe();
  };

  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
  const timer =
    timeout > 0
      ? setTimer(() => {
          stop();
          settle.reject(timeoutError(values, options, timeout));
        }, timeout)
      : undefined;

  subscription = source$.subscribe({
    next: (value) => {
      values.push(value);

      if (isDone(values)) {
        stop();
        settle.resolve(values);
      }
    },
    error: (error) => {
      stop();
      settle.reject(sourceError(error, options));
    },
    complete: () => {
      stop();
      onComplete(values);
    },
  });

  // A synchronous source (`of(…)`, a `BehaviorSubject`) settled while `subscription` was still
  // unassigned, so the `stop()` above could not unsubscribe. Do it now.
  if (stopped) {
    subscription.unsubscribe();
  }

  return { values, stop };
}

function timeoutError(values: unknown[], options: EmissionOptions | undefined, waited: number): Error {
  return new Error(
    `${describeSource(options)} did not emit within ${waited} ms (${values.length} emission(s) received). ` +
      'Either the stream never fired — check the trigger and any provider spy feeding it — or it is slower than the ' +
      'timeout; raise it with `{ timeout: … }`, or pass `{ timeout: 0 }` when running under fake timers.',
  );
}

function sourceError(error: unknown, options: EmissionOptions | undefined): Error {
  return new Error(`${describeSource(options)} errored instead of emitting: ${String(error)}`);
}

function completedError(values: unknown[], expected: number, options: EmissionOptions | undefined): Error {
  return new Error(
    `${describeSource(options)} completed after ${values.length} emission(s), expected ${expected}. ` +
      'A completed-but-empty stream is the usual sign that the value was produced before the subscription.',
  );
}

/**
 * Await the first value of `source$`, failing loudly when it never arrives.
 *
 * @example
 * ```ts
 * await expect(expectEmission(component.visible$)).resolves.toEqual([task]);
 * await expectEmission(saved$, { label: 'saved$', timeout: 2_000 });
 * ```
 */
export function expectEmission<T>(source$: SubscribableLike<T>, options?: EmissionOptions): Promise<T> {
  return expectEmissions(source$, 1, options).then((values) => firstOf(values));
}

/** `values[0]` for a list the collector guarantees is non-empty (`noUncheckedIndexedAccess` widens it to `T | undefined`). */
function firstOf<T>(values: T[]): T {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the collector resolves only once `values.length >= 1`, so index 0 holds the emission even when that emission is `undefined`.
  return values[0] as T;
}

/**
 * Await the first `count` values of `source$` as an array.
 *
 * @example
 * ```ts
 * await expect(expectEmissions(source$, 3)).resolves.toEqual([1, 2, 3]);
 * ```
 */
export function expectEmissions<T>(source$: SubscribableLike<T>, count: number, options?: EmissionOptions): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    subscribeAndCollect(
      source$,
      options,
      { resolve, reject },
      (values) => values.length >= count,
      (values) => reject(completedError(values, count, options)),
    );
  });
}

/**
 * Assert that `source$` stays silent for `timeout` ms (default 0 — one macrotask).
 *
 * @example
 * ```ts
 * await expectNoEmission(source$, { timeout: 50 });
 * ```
 */
export function expectNoEmission<T>(source$: SubscribableLike<T>, options?: EmissionOptions): Promise<void> {
  const quietFor = options?.timeout ?? 0;

  return new Promise<void>((resolve, reject) => {
    const collector = subscribeAndCollect<T>(
      source$,
      { ...options, timeout: 0 },
      {
        resolve: (emitted) => reject(unexpectedEmissionError(emitted, options)),
        reject,
      },
      (values) => values.length > 0,
      () => undefined,
    );

    setTimer(() => {
      collector.stop();

      if (collector.values.length === 0) {
        resolve();
      }
    }, quietFor);
  });
}

function unexpectedEmissionError(values: unknown[], options: EmissionOptions | undefined): Error {
  return new Error(`${describeSource(options)} emitted ${JSON.stringify(values[0])} but was expected to stay silent.`);
}
