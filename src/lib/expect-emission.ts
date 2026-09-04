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
import { emissionTimeout } from './emission-timeout';
import { serializeValue } from './serialize-args';

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

/**
 * The other subscription contract: `subscribe` takes a bare `next` **callback**.
 *
 * Two very different things speak it, and both were broken before it existed.
 *
 * **Angular `output()`.** `OutputEmitterRef.subscribe(callback)` accepts nothing but a function, so
 * handing it an observer object stored an object in its listener list; `emit()` then called it,
 * `TypeError: listenerFn is not a function` went into Angular's `ErrorHandler` instead of out to
 * the spec, and `await expectEmission(component.selectionChange)` simply hung until the watchdog —
 * a minute of a suite, with no clue in it. The type rejected the call, so this was a compile error
 * for anyone typing the output precisely and a hang for anyone who did not.
 *
 * **Type inference for rxjs.** `Observable<T>.subscribe` is overloaded, and TypeScript infers a
 * type argument from an overloaded source method by pairing the *trailing* signatures. In rxjs 7
 * the last one is the deprecated positional `subscribe(next?, error?, complete?)`; inferring `T`
 * from `((value: number) => void) | null` into `Partial<EmissionObserver<T>>` matches nothing, so
 * `T` fell back to `unknown` — `expectEmission(of(1))` was `Promise<unknown>`,
 * `.resolves.toBe(1)` passed anyway, and the loss surfaced only when somebody read a field off the
 * awaited value (`TS2339`) or destructured it (`TS2488`). Matching the callback shape pairs with
 * that overload in rxjs 7 and with the `Partial<Observer<T>> | ((value: T) => void) | null` union
 * that is all rxjs 8 leaves behind, so `T` is inferred on both.
 *
 * It is the *first* overload of each helper, with {@link SubscribableLike} behind it for
 * hand-rolled sources that only accept an observer object — those do not satisfy this signature and
 * fall through unchanged.
 */
export interface CallbackSubscribable<T> {
  subscribe(next: (value: T) => void, ...rest: never[]): { unsubscribe(): void };
}

/** Either subscription contract — what every helper here accepts. */
export type EmissionSource<T> = CallbackSubscribable<T> | SubscribableLike<T>;

/**
 * A `next` callback that is *also* an observer object, so one value satisfies both contracts.
 *
 * It cannot simply be handed to everything, which is what {@link subscribeToSource} is about: rxjs
 * branches on `typeof observerOrNext === 'function'` and, having found one, uses it as `next` and
 * drops `error` and `complete` — so an rxjs source must get the plain object, and a stream that
 * errors would otherwise time out instead of reporting the error.
 */
interface HybridObserver<T> extends EmissionObserver<T> {
  (value: T): void;
}

/**
 * Subscribe through whichever contract the source speaks.
 *
 * The dispatch is a positive test for rxjs — `pipe` is on `Observable`, on every `Subject`, and on
 * Angular's `EventEmitter`, and it is absent from `OutputEmitterRef` — rather than a test for the
 * callback style, because being wrong in the two directions costs differently. Sending the hybrid
 * to rxjs loses `error`/`complete` (a timeout where there should be a message); sending the plain
 * observer to a callback-only source loses *everything* (the hang this exists to remove). So the
 * observer object goes only where it is known to be understood, and the hybrid — which satisfies
 * the observer contract as well, through its own `next` / `error` / `complete` properties — covers
 * every other source, hand-rolled ones included.
 */
function subscribeToSource<T>(source$: EmissionSource<T>, observer: EmissionObserver<T>): { unsubscribe(): void } {
  if (isRxjsSource(source$)) {
    return source$.subscribe(observer);
  }

  return source$.subscribe(asHybridObserver(observer));
}

/** Whether the source follows rxjs's `Subscribable` contract, where a function argument means "next only". */
function isRxjsSource<T>(source$: EmissionSource<T>): source$ is SubscribableLike<T> {
  return typeof Reflect.get(source$, 'pipe') === 'function';
}

/** One observer, usable as a callback. */
function asHybridObserver<T>(observer: EmissionObserver<T>): HybridObserver<T> {
  const listener = (value: T): void => observer.next(value);

  return Object.assign(listener, observer);
}

/** Timeout, labelling and emission selection for the emission helpers. */
export interface EmissionOptions<T = unknown> {
  /** Milliseconds to wait before failing. `0` disables the timer (useful under fake timers). Default `1000`. */
  timeout?: number;
  /** Name used in the failure message instead of the generic "the observable". */
  label?: string;
  /**
   * Ignore the first `skip` emissions.
   *
   * For the stream whose first value is always stale: a `shareReplay`, a `BehaviorSubject`, an
   * Angular signal read through `toObservable()`. `source$.pipe(skip(1))` says the same thing and
   * costs an rxjs import in a spec whose whole point was that it did not need one.
   */
  skip?: number;
  /**
   * Wait for the first emission that satisfies this predicate, ignoring the ones before it.
   *
   * The dominant shape on a replayed stream is not "it emitted" but "it emitted *the* value", and
   * writing that as `source$.pipe(filter(…))` moves the interesting condition out of the assertion
   * and into the source. Emissions that do not match are still counted, so the failure says how
   * many arrived and that none of them matched.
   */
  until?: (value: T) => boolean;
  /**
   * Run once, immediately after the subscription exists and before the promise is handed back.
   *
   * This is the window a spec cannot otherwise reach. Under fake timers a stream driven by a
   * `debounceTime`, a retry or a poll needs the clock advanced *after* something is listening, and
   * `await` gives control away before the next statement runs — which is why specs end up holding
   * the promise in a variable, advancing, then awaiting, a form that silently breaks the moment
   * somebody adds an `await` one line up.
   *
   * ```ts
   * await expect(expectEmission(purchased$, { advance: () => vi.runAllTimers() })).resolves.toBe(false);
   * ```
   *
   * A callback rather than an `advanceTimers: true` flag because these helpers live in the core
   * entry, which has no test runner in it: `vi` / `bun:test` / `node:test` all drive their clocks
   * differently, and the spec is the only place that knows which one it is on.
   */
  advance?: () => void;
}

// Re-exported so the public surface of the emission helpers stays one import for consumers.
export { setEmissionTimeout } from './emission-timeout';

/**
 * The real timers, captured at import time — and it has to be import time, twice over.
 *
 * **The watchdog must not be stoppable by the code under test.** `vi.useFakeTimers()` replaces
 * `setTimeout`, and a helper whose watchdog is itself faked never fires: a silent stream would hang
 * until the runner's own test timeout, reporting "test timed out" instead of naming the stream.
 * These helpers *are* the assertion, so their clock is the one thing a spec cannot stop.
 *
 * **A virtual watchdog would also race the source.** Under fake timers there is one clock, and the
 * spec drives it: `expectEmission(source$, { timeout: 200 })` followed by
 * `vi.advanceTimersByTime(5_000)` would fire a virtual watchdog at 200 ms and reject the stream the
 * spec was about to advance into. The spec named "still resolves a stream a spec advances by hand"
 * is the canary for that. A timeout here is a wall-clock safety net, not a deadline the source has
 * to beat.
 *
 * Reading `globalThis.setTimeout` at *call* time would give the fake one, so the capture cannot
 * move; and it is not order-dependent in any way that matters, because a fake clock is installed
 * from `beforeAll`/`beforeEach` (see `setupFakeTimers`), which the module graph is fully evaluated
 * before.
 */
const setTimer: typeof setTimeout = globalThis.setTimeout.bind(globalThis);
const clearTimer: typeof clearTimeout = globalThis.clearTimeout.bind(globalThis);

function describeSource(options: AnyEmissionOptions | undefined): string {
  return options?.label ?? 'the observable';
}

/**
 * The emissions that count, out of every emission seen: past `skip`, and matching `until`.
 *
 * Applied on read rather than at `next`, so `values` stays the full record of what arrived. That is
 * what lets the failure say "4 emission(s) received" about a stream that emitted four times and
 * matched none — the distinction a spec needs in order to tell "nothing fired" from "the wrong
 * thing fired", and the one a `pipe(filter(…))` in front of the helper throws away.
 */
function accepted<T>(values: T[], options: EmissionOptions<T> | undefined): T[] {
  const past = options?.skip ? values.slice(options.skip) : values;
  const until = options?.until;

  return until ? past.filter((value) => until(value)) : past;
}

/**
 * A caller's options seen from inside the collector.
 *
 * `never` rather than `unknown`, because `until` puts `T` in a contravariant position: every
 * `EmissionOptions<T>` is assignable to `EmissionOptions<never>`, and nothing in here reads a value
 * through the predicate — the generic helpers do that, with the `T` they know.
 */
type AnyEmissionOptions = EmissionOptions<never>;

/** How the failure should describe what it was waiting for, given the selection options. */
function describeExpectation(count: number, options: AnyEmissionOptions | undefined): string {
  return options?.until ? `${count} matching` : String(count);
}

/** One subscription plus its timeout, torn down whichever way the promise settles. */
interface Collector<T> {
  values: T[];
  stop: () => void;
}

/**
 * The half of {@link Settle} a handler that only ever fails needs.
 *
 * `Settle<T>` is invariant in `T` — its `resolve` takes a `T[]` — so a shared error handler typed
 * against `Settle<unknown>` would not be assignable to `CollectorHandlers<T>`. Naming just the
 * `reject` half keeps those handlers usable from every helper.
 */
interface Rejecter {
  reject: (error: Error) => void;
}

/** Settle callbacks of the promise a collector drives. */
interface Settle<T> extends Rejecter {
  resolve: (values: T[]) => void;
}

/**
 * What one helper makes of each thing the source can do.
 *
 * An object rather than four positional callbacks because the set grew with `expectCompletion`,
 * whose failures are the *opposite* of the emission helpers': it fails on a stream that keeps
 * running, so "did not emit" and "errored instead of emitting" would both be lies coming out of it.
 * The wording therefore travels with the helper instead of living in the collector.
 */
interface CollectorHandlers<T> {
  /** Whether what has arrived so far settles the promise successfully. */
  isDone: (values: T[]) => boolean;
  /** The source completed — resolve, reject, or ignore, depending on the helper. */
  onComplete: (values: T[]) => void;
  /**
   * The watchdog expired: build the failure this helper reports.
   *
   * `options` is threaded through rather than captured in a closure so every helper can hand over a
   * plain module-level function. A per-call arrow would be a function the coverage gate counts, and
   * `expectNoEmission` runs with the watchdog disabled — its arrow would never be called, and 100 %
   * function coverage would fail on a branch that cannot be reached.
   */
  onTimeout: (values: T[], options: AnyEmissionOptions | undefined, waited: number) => Error;
  /**
   * The source errored — settle the promise.
   *
   * An action rather than an error factory because `expectError` settles it the other way: for that
   * helper the stream erroring is the success, and the value it resolves with is the error itself.
   */
  onError: (error: unknown, options: AnyEmissionOptions | undefined, settle: Settle<T>) => void;
}

function subscribeAndCollect<T>(
  source$: EmissionSource<T>,
  options: AnyEmissionOptions | undefined,
  settle: Settle<T>,
  handlers: CollectorHandlers<T>,
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

  const timeout = options?.timeout ?? emissionTimeout();
  const timer =
    timeout > 0
      ? setTimer(() => {
          stop();
          settle.reject(handlers.onTimeout(values, options, timeout));
        }, timeout)
      : undefined;

  subscription = subscribeToSource(source$, {
    next: (value) => {
      values.push(value);

      if (handlers.isDone(values)) {
        stop();
        settle.resolve(values);
      }
    },
    error: (error) => {
      stop();
      handlers.onError(error, options, settle);
    },
    complete: () => {
      stop();
      handlers.onComplete(values);
    },
  });

  // A synchronous source (`of(…)`, a `BehaviorSubject`) settled while `subscription` was still
  // unassigned, so the `stop()` above could not unsubscribe. Do it now.
  if (stopped) {
    subscription.unsubscribe();
  }

  // After the subscription and before the caller gets its promise — the one moment a spec cannot
  // reach on its own. Skipped once the source has already settled: advancing a clock into a
  // stream nobody is listening to is how a stray timer outlives the test.
  if (!stopped) {
    options?.advance?.();
  }

  return { values, stop };
}

function timeoutError(values: unknown[], options: AnyEmissionOptions | undefined, waited: number): Error {
  return new Error(
    `${describeSource(options)} did not emit within ${waited} ms (${values.length} emission(s) received). ` +
      'Either the stream never fired — check the trigger and any provider spy feeding it — or it is slower than the ' +
      'timeout; raise it with `{ timeout: … }`. This wait is real time even under fake timers, on purpose: a virtual ' +
      'watchdog would race the timers your spec advances. Lower it with `setEmissionTimeout(100)` in the setup file ' +
      'rather than disabling it with `{ timeout: 0 }`, which leaves the next silent stream with no message at all.',
  );
}

/**
 * The stream errored where a value was expected: reject, wrapping.
 *
 * Wrapped rather than passed through, because the message is the point — "products$ errored instead
 * of emitting" names the stream, and a bare rethrow of `'BOOM'` names nothing. The original travels
 * on `cause`, so `rejects.toThrow(expect.objectContaining({ cause: original }))` can still reach
 * it — but for `rejects.toBe(original)` or `rejects.toBeInstanceOf(HttpErrorResponse)`, use
 * {@link expectError}, which resolves *with* the error and needs no unwrapping at all.
 */
function rejectAsSourceError(error: unknown, options: AnyEmissionOptions | undefined, settle: Rejecter): void {
  settle.reject(new Error(`${describeSource(options)} errored instead of emitting: ${String(error)}`, { cause: error }));
}

function completedError(values: unknown[], expected: number, options: AnyEmissionOptions | undefined): Error {
  return new Error(
    `${describeSource(options)} completed after ${values.length} emission(s), expected ${describeExpectation(expected, options)}. ` +
      'A completed-but-empty stream is the usual sign that the value was produced before the subscription.',
  );
}

/**
 * Await **the first value** of `source$` — not a list of them — failing loudly when it never
 * arrives.
 *
 * ```ts
 * await expect(expectEmission(component.visible$)).resolves.toBe(true);
 * await expect(expectEmission(tasks$)).resolves.toEqual({ id: 1 }); // the task, not `[task]`
 * await expectEmission(saved$, { label: 'saved$', timeout: 2_000 });
 * ```
 *
 * **It subscribes when you call it, not when you await it.** That is what makes it the tool for a
 * source somebody has to poke *after* a listener exists — `router.events`, a `Subject` the spec
 * pushes into, anything that does not replay. Hold the promise, poke, then await:
 *
 * ```ts
 * const crumbs = expectEmission(service.buildDynamicBreadcrumbs({ root })); // subscribed already
 *
 * router.events.nextWith(navigationEnd);                                    // …so this is not missed
 * await expect(crumbs).resolves.toEqual([…]);
 * ```
 *
 * `firstValueFrom` cannot express that shape: it subscribes eagerly too, but the `await` is the
 * same statement, so there is nowhere to put the line that triggers the source and the test
 * deadlocks.
 *
 * **For the error branch, reach for `firstValueFrom` instead.** A stream that errors rejects this
 * promise with a *new* `Error` describing the failure, so the original is only in the message:
 * `rejects.toBe(originalError)` and `rejects.toBeInstanceOf(HttpErrorResponse)` cannot pass here.
 * `await expect(firstValueFrom(source$)).rejects.toBe(originalError)` is the assertion that can.
 */
export function expectEmission<T>(source$: CallbackSubscribable<T>, options?: EmissionOptions<T>): Promise<T>;
export function expectEmission<T>(source$: SubscribableLike<T>, options?: EmissionOptions<T>): Promise<T>;
export function expectEmission<T>(source$: EmissionSource<T>, options?: EmissionOptions<T>): Promise<T> {
  return collectEmissions(source$, 1, options).then((values) => firstOf(values));
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
export function expectEmissions<T>(source$: CallbackSubscribable<T>, count: number, options?: EmissionOptions<T>): Promise<T[]>;
export function expectEmissions<T>(source$: SubscribableLike<T>, count: number, options?: EmissionOptions<T>): Promise<T[]>;
export function expectEmissions<T>(source$: EmissionSource<T>, count: number, options?: EmissionOptions<T>): Promise<T[]> {
  return collectEmissions(source$, count, options);
}

/**
 * The body both emission helpers share.
 *
 * Separate from `expectEmissions` because that one is overloaded, and an overloaded function cannot
 * be called from its own implementation signature — the union it accepts there matches neither
 * overload.
 */
function collectEmissions<T>(source$: EmissionSource<T>, count: number, options: EmissionOptions<T> | undefined): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    subscribeAndCollect(
      source$,
      options,
      // Resolved with everything that arrived, then narrowed to the accepted ones: the collector's
      // job is to record, and `skip` / `until` decide what the caller is handed.
      { resolve: (values) => resolve(accepted(values, options).slice(0, count)), reject },
      {
        isDone: (values) => accepted(values, options).length >= count,
        onComplete: (values) => reject(completedError(values, count, options)),
        onTimeout: timeoutError,
        onError: rejectAsSourceError,
      },
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
export function expectNoEmission<T>(source$: EmissionSource<T>, options?: EmissionOptions<T>): Promise<void> {
  const quietFor = options?.timeout ?? 0;
  let quietWindow: ReturnType<typeof setTimer> | undefined = undefined;

  return new Promise<void>((resolve, reject) => {
    const collector = subscribeAndCollect<T>(
      source$,
      { ...options, timeout: 0 },
      {
        resolve: (emitted) => reject(unexpectedEmissionError(accepted(emitted, options), options)),
        reject,
      },
      {
        isDone: (values) => accepted(values, options).length > 0,
        onComplete: () => undefined,
        // Never reached — the watchdog is off (`timeout: 0`) and the quiet window below is this
        // helper's own timer. Named rather than inlined so it is not an uncalled arrow.
        onTimeout: timeoutError,
        onError: rejectAsSourceError,
      },
    );

    // No `values.length === 0` guard: an emission settles the promise as a rejection, and the
    // `finally` below cancels this timer in the microtask that follows — before a macrotask can
    // run. So reaching this callback *is* the proof that the window stayed quiet.
    quietWindow = setTimer(() => {
      collector.stop();
      resolve();
    }, quietFor);
  }).finally(() => {
    // An emission or a source error settles the promise before the window is up, and a settled
    // promise ignores whatever the timer does next — but the timer itself does not go away. It
    // outlives the test, and under `isolate: false` fires inside a *later* file, which is exactly
    // the kind of stray this package exists to catch.
    clearTimer(quietWindow);
  });
}

/**
 * Assert that `source$` **completes** — the assertion for a stream whose value is not the point.
 *
 * The shape it covers is a save, a purge, a `Subject` a teardown closes: `Observable<void>`, or one
 * that finishes without ever emitting. `firstValueFrom` rejects such a stream with rxjs's
 * `EmptyError`, and the workaround people arrive at — `lastValueFrom(source$, { defaultValue:
 * undefined })` — reads as if the default were the interesting part, when the whole assertion is
 * "it finished".
 *
 * ```ts
 * await expectCompletion(service.purgeCache());
 * await expectCompletion(closed$, { label: 'closed$', timeout: 2_000 });
 * ```
 *
 * Emissions are *not* a failure here: this asserts termination, nothing about what came before it.
 * Use {@link expectNoEmission} when silence is the thing being asserted, and {@link expectEmission}
 * when a value is.
 */
export function expectCompletion(source$: EmissionSource<unknown>, options?: EmissionOptions): Promise<void> {
  // Resolved with the collected values and mapped to `void` afterwards, rather than declared
  // `Promise<void>` with a `() => resolve()` wrapper: `staysOpen` means the collector's success path
  // runs only from `onComplete`, so a separate `resolve` wrapper would be a function no test can
  // ever call — an unreachable line the 100 % coverage gate would (rightly) fail on.
  return new Promise<unknown[]>((resolve, reject) => {
    subscribeAndCollect<unknown>(
      source$,
      options,
      { resolve, reject },
      {
        // Emissions are collected for the failure message, but only completion settles this.
        isDone: staysOpen,
        onComplete: resolve,
        onTimeout: notCompletedError,
        onError: rejectAsNotCompleted,
      },
    );
  }).then(() => undefined);
}

/** `isDone` for a helper that no emission can satisfy — only `complete` settles it. */
function staysOpen(): boolean {
  return false;
}

function notCompletedError(values: unknown[], options: AnyEmissionOptions | undefined, waited: number): Error {
  return new Error(
    `${describeSource(options)} did not complete within ${waited} ms (${values.length} emission(s) received). ` +
      'A stream that keeps running usually means the completing operator never ran — check `take`, `first`, ' +
      '`takeUntil`, or a Subject nobody calls `complete()` on. The wait is real time even under fake timers; ' +
      'raise it with `{ timeout: … }`, or lower the suite default with `setEmissionTimeout(…)`.',
  );
}

function rejectAsNotCompleted(error: unknown, options: AnyEmissionOptions | undefined, settle: Rejecter): void {
  settle.reject(new Error(`${describeSource(options)} errored instead of completing: ${String(error)}`, { cause: error }));
}

/**
 * Await the error `source$` fails with, and hand it back **as it was thrown**.
 *
 * The assertion the other helpers cannot make. A stream that errors rejects them with a *new*
 * `Error` whose message names the stream, which is right for a helper whose job is to report an
 * unexpected failure — and useless when the failure is the thing under test:
 * `rejects.toBe(originalError)`, `rejects.toBeInstanceOf(UdmsStatusError)` and an exact
 * `expect(err.message).toBe('websso fail')` all fail against the wrapper. Here the error is the
 * resolved value, so every one of them is an ordinary assertion:
 *
 * ```ts
 * await expect(expectError(service.load())).resolves.toBe(originalError);
 * expect(await expectError(process$)).toBeInstanceOf(UdmsStatusError);
 * ```
 *
 * It waits for the error however late it is — a stream that emits first and then fails still
 * settles here on the failure — and fails, naming the stream, if the stream completes or stays
 * quiet instead.
 */
export function expectError(source$: EmissionSource<unknown>, options?: EmissionOptions): Promise<unknown> {
  return new Promise<unknown[]>((resolve, reject) => {
    subscribeAndCollect<unknown>(
      source$,
      options,
      { resolve, reject },
      {
        // Only `error` settles this one: an emission is not the answer, and neither is completion.
        isDone: staysOpen,
        onComplete: (values) => reject(completedWithoutErrorError(values, options)),
        onTimeout: notErroredError,
        onError: resolveWithError,
      },
    );
  }).then((values) => firstOf(values));
}

function completedWithoutErrorError(values: unknown[], options: AnyEmissionOptions | undefined): Error {
  return new Error(
    `${describeSource(options)} completed after ${values.length} emission(s) without erroring, but an error was expected. ` +
      'Check that the failure path is the one the spec set up — a spy configured with `resolveWith`/`nextWith` rather ' +
      'than `rejectWith`/`throwWith` produces exactly this.',
  );
}

function notErroredError(values: unknown[], options: AnyEmissionOptions | undefined, waited: number): Error {
  return new Error(
    `${describeSource(options)} did not error within ${waited} ms (${values.length} emission(s) received). ` +
      'The stream is still running: nothing failed, and nothing completed either.',
  );
}

/** `expectError`'s error path: the stream erroring is the success, and the error is the value. */
function resolveWithError(error: unknown, _options: AnyEmissionOptions | undefined, settle: Settle<unknown>): void {
  settle.resolve([error]);
}

function unexpectedEmissionError(values: unknown[], options: AnyEmissionOptions | undefined): Error {
  // `serializeValue`, not `JSON.stringify`: what a spec asserts stays silent is routinely a
  // component, a DOM node or a store slice with back-references, and stringifying one throws
  // `Converting circular structure to JSON` — losing the value the message exists to show.
  return new Error(`${describeSource(options)} emitted ${serializeValue(values[0])} but was expected to stay silent.`);
}
