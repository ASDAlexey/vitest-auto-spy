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
import * as DOCS_LINKS from './docs-links';
import { type PendingEmissionWait, emissionTimeout, forgetEmissionWait, registerEmissionWait } from './emission-timeout';
import { type StackAnchor, captureAnchor, ownFailure } from './error-anchor';
import { fakeClockAdvice } from './fake-clock-state';
import { withDocs } from './message-link';
import { count as countOf } from './message-text';
import { serializeValue } from './serialize-args';
import { unpatchedClearTimeout as clearTimer, unpatchedSetTimeout as setTimer } from './unpatched-timers';

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
function subscribeToSource<T>(
  source$: EmissionSource<T>,
  observer: EmissionObserver<T>,
  holdEarly: (handle: { unsubscribe(): void }) => void,
): { unsubscribe(): void } {
  if (isRxjsSource(source$)) {
    const stoppable = stoppableObserver(observer);

    // Handed over *before* the producer runs, and that is the whole point of it: a synchronous
    // source emits everything from inside `subscribe`, so the collector must already have something
    // to close when the value it was waiting for arrives.
    holdEarly(stoppable);

    // The subscription becomes one of the teardowns: rxjs hands back the subscriber it was given,
    // so this is usually `stoppable` itself — adding it to its own set is harmless, because
    // `unsubscribe()` closes before it drains. Where a future rxjs wraps the observer instead, the
    // wrapper's subscription is in there and gets torn down with everything else.
    stoppable.add(source$.subscribe(stoppable));

    return stoppable;
  }

  return source$.subscribe(asHybridObserver(observer));
}

/**
 * An observer rxjs accepts *as a subscriber*, so a synchronous source can be stopped mid-flight.
 *
 * Handed a plain observer, rxjs wraps it in its own `SafeSubscriber` and hands the subscription
 * back only once `subscribe` returns — which for `of`, `from`, `range`, `expand` or anything with
 * `repeat()` is after the whole sequence has been produced. Everything the source emits is then
 * collected although one value was asked for, every side effect after the first value runs (a `tap`
 * or a `finalize` calling a spy, so `toHaveBeenCalledTimes(1)` lies), and an infinite synchronous
 * source hangs the worker where no watchdog can reach it. `firstValueFrom` does not have the
 * problem because it subscribes *with* a subscriber and closes it from inside `next`.
 *
 * rxjs's test for one is structural — `closed` plus `add`/`remove`/`unsubscribe` beside the three
 * observer methods — so satisfying it needs no rxjs import and no `Subscriber` subclass. A version
 * that stops recognising the shape falls back to the wrapped-observer behaviour of before: the
 * collector still unsubscribes through the subscription it was handed.
 */
interface StoppableObserver<T> extends EmissionObserver<T> {
  closed: boolean;
  add(teardown: unknown): void;
  remove(teardown: unknown): void;
  unsubscribe(): void;
}

function stoppableObserver<T>(observer: EmissionObserver<T>): StoppableObserver<T> {
  const teardowns = new Set<unknown>();
  const self: StoppableObserver<T> = {
    closed: false,
    add: (teardown) => {
      if (self.closed) {
        runTeardown(teardown);

        return;
      }

      teardowns.add(teardown);
    },
    remove: (teardown) => {
      teardowns.delete(teardown);
    },
    unsubscribe: () => {
      if (self.closed) {
        return;
      }

      self.closed = true;
      teardowns.forEach(runTeardown);
      teardowns.clear();
    },
    next: (value) => {
      if (!self.closed) {
        observer.next(value);
      }
    },
    error: (error) => {
      if (!self.closed) {
        self.unsubscribe();
        observer.error(error);
      }
    },
    complete: () => {
      if (!self.closed) {
        self.unsubscribe();
        observer.complete();
      }
    },
  };

  return self;
}

/** rxjs teardowns come as a function or as anything with `unsubscribe`; `undefined` is a legal one too. */
function runTeardown(teardown: unknown): void {
  if (typeof teardown === 'function') {
    teardown();

    return;
  }

  const unsubscribe: unknown = Reflect.get(Object(teardown), 'unsubscribe');

  if (typeof unsubscribe === 'function') {
    unsubscribe.call(teardown);
  }
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

function describeSource(options: AnyEmissionOptions | undefined): string {
  return options?.label ?? 'the observable';
}

/**
 * What one wait is, as its failures name it: `expectEmission(user$)`, or `expectEmission(source$)`
 * when the call gave no `label`.
 */
interface WaitContext {
  readonly helper: string;
  readonly options: AnyEmissionOptions | undefined;
  /** How many accepted emissions settle the wait; `0` for the helpers that wait for termination. */
  readonly expected: number;
}

function callOf({ helper, options, expected }: WaitContext): string {
  const source = options?.label ?? 'source$';

  return helper === 'expectEmissions' ? `${helper}(${source}, ${expected})` : `${helper}(${source})`;
}

function emissionFailure(context: WaitContext, text: string, options?: ErrorOptions): Error {
  return ownFailure(withDocs(`[vitest-auto-spy] ${callOf(context)}: ${text}`, DOCS_LINKS.observableFailures), options);
}

/**
 * A caller's options seen from inside the collector.
 *
 * `never` rather than `unknown`, because `until` puts `T` in a contravariant position: every
 * `EmissionOptions<T>` is assignable to `EmissionOptions<never>`, and nothing in here reads a value
 * through the predicate — the generic helpers do that, with the `T` they know.
 */
type AnyEmissionOptions = EmissionOptions<never>;

/**
 * How the failure should describe what it was waiting for, given the selection options.
 *
 * `skip` is part of the answer: `expectEmission(of(1, 2), { skip: 5 })` was asked for the sixth
 * emission, and a message reading "expected 1" made two emissions sound like plenty.
 */
function describeExpectation(count: number, options: AnyEmissionOptions | undefined): string {
  const matching = options?.until ? `${count} matching` : String(count);

  return options?.skip ? `${matching} after skipping ${options.skip}` : matching;
}

/** One subscription plus its timeout, torn down whichever way the promise settles. */
interface Collector {
  stop: () => void;
  /**
   * One more teardown for `stop()` to run, assigned after construction.
   *
   * It has a single user: the quiet window of `expectNoEmission` is the helper's own timer rather
   * than the collector's, and a wait abandoned at the end of its test never reaches the `finally`
   * that would otherwise clear it.
   */
  alsoStop?: () => void;
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
  /** `onSubscribe`: the value came out of `subscribe` itself — a replay rather than a push. */
  resolve: (values: T[], onSubscribe: boolean) => void;
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
  /**
   * Whether what has arrived so far settles the promise successfully, given how many emissions were
   * accepted.
   *
   * A count rather than the buffer, because the buffer used to be re-scanned on every emission: with
   * `skip` that copied it per value, and with `until` it re-ran the caller's predicate over every
   * value seen so far — quadratic both ways, and 30–300× on an emission-heavy wait. Acceptance is
   * decided once per value now, where the value arrives.
   */
  isDone: (accepted: number) => boolean;
  /** The source completed — resolve, reject, or ignore, depending on the helper. */
  onComplete: (accepted: T[], received: number) => void;
  /**
   * The watchdog expired: build the failure this helper reports.
   *
   * `options` is threaded through rather than captured in a closure so every helper can hand over a
   * plain module-level function. A per-call arrow would be a function the coverage gate counts, and
   * `expectNoEmission` runs with the watchdog disabled — its arrow would never be called, and 100 %
   * function coverage would fail on a branch that cannot be reached.
   */
  onTimeout: (received: number, context: WaitContext, waited: number) => Error;
  /**
   * The source errored — settle the promise.
   *
   * An action rather than an error factory because `expectError` settles it the other way: for that
   * helper the stream erroring is the success, and the value it resolves with is the error itself.
   */
  onError: (error: unknown, context: WaitContext, settle: Settle<T>) => void;
  /**
   * Whether an emission can settle this helper.
   *
   * `false` for the two that wait for termination. They report how many values arrived and never
   * read one, so the values are counted rather than kept — a stream feeding `expectError` for a
   * whole second used to retain every component it emitted — and `skip` / `until`, which only
   * choose *which* emission settles a helper, are not evaluated at all.
   *
   * Where they are, only the emissions that *count* are kept: `received` is what the failures
   * report ("4 emission(s) received", the distinction between "nothing fired" and "the wrong thing
   * fired"), and the values a `skip` or an `until` ruled out are of no further use to anybody.
   */
  emissionsSettle: boolean;
  /** The helper's own name, so every failure opens with the call that failed. */
  helper: string;
  /** See {@link WaitContext.expected}. */
  expected: number;
}

/** The largest delay a timer accepts: Node truncates anything above it to 1 ms, with a warning. */
const MAX_TIMER_DELAY = 2 ** 31 - 1;

/**
 * Whether the source can be subscribed to at all.
 *
 * Without this the two ordinary mistakes — passing the value instead of the stream, or a source a
 * spy was never configured with — reached rxjs's machinery and came back as
 * `TypeError: Reflect.get called on non-object` or `source$.subscribe is not a function`: no helper
 * name, no `label`, no anchor.
 */
function isSubscribable(source$: unknown): boolean {
  return (
    (typeof source$ === 'object' || typeof source$ === 'function') &&
    source$ !== null &&
    typeof Reflect.get(source$, 'subscribe') === 'function'
  );
}

function notSubscribableError(source$: unknown, context: WaitContext): Error {
  const hint =
    typeof Reflect.get(Object(source$), 'then') === 'function'
      ? 'That is a promise — `await` it directly, or pass the observable it came from.'
      : source$ === undefined
        ? 'Usually a spy nobody configured: give the method a stream with `nextWith(…)`, or pass the observable itself.'
        : 'Pass the observable itself, not the value it emits.';

  return emissionFailure(context, `the source is not subscribable (${serializeValue(source$)}). ${hint}`);
}

/** What one collector has seen, shared between it and the observer that fills it. */
interface Collected<T> {
  /** The emissions that count: past `skip`, matching `until`, and only where they can settle the wait. */
  readonly accepted: T[];
  /** Every emission, counted — what the failures report, and all they report. */
  received: number;
  /** True while `subscribe` runs, so a failure can tell a replayed value from a pushed one. */
  subscribing: boolean;
  readonly stop: () => void;
}

/**
 * The observer half of {@link subscribeAndCollect}.
 *
 * `next` is the one place caller-supplied code runs: the `until` predicate. Left to escape, rxjs
 * routes the throw to `reportUnhandledError` on a fresh macrotask — the run gets an unhandled
 * error, the subscription and the watchdog stay alive until the timeout, and the eventual message
 * blames the silence instead of the predicate. `complete` needs no such guard: every `onComplete`
 * settles the promise with a message it builds itself.
 */
function collectingObserver<T>(
  collected: Collected<T>,
  context: WaitContext,
  settle: Settle<T>,
  handlers: CollectorHandlers<T>,
): EmissionObserver<T> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the context carries the caller's options as `EmissionOptions<never>`; the predicate is only ever handed this helper's own `T`.
  const options = context.options as EmissionOptions<T> | undefined;
  const skip = options?.skip ?? 0;
  const until = options?.until;

  const fail = (error: unknown): void => {
    collected.stop();
    settle.reject(
      emissionFailure(
        context,
        `the \`until\` predicate threw on emission ${collected.received}: ${String(error)}. ` +
          'Make it safe for every value the stream emits, not only the one it waits for.',
        { cause: error },
      ),
    );
  };

  return {
    next: (value): void => {
      collected.received += 1;

      try {
        if (handlers.emissionsSettle && collected.received > skip && (until === undefined || until(value))) {
          collected.accepted.push(value);
        }

        if (handlers.isDone(collected.accepted.length)) {
          collected.stop();
          settle.resolve(collected.accepted, collected.subscribing);
        }
      } catch (error) {
        fail(error);
      }
    },
    error: (error): void => {
      collected.stop();
      handlers.onError(error, context, settle);
    },
    complete: (): void => {
      collected.stop();
      handlers.onComplete(collected.accepted, collected.received);
    },
  };
}

/**
 * Run the caller's `advance`, reporting a throw as this helper's own failure.
 *
 * It is ordinary spec code — `vi.runAllTimers()`, `fixture.detectChanges()` — and it throws like
 * ordinary code. Unguarded, the throw came out of the promise raw, with no anchor and no `label`,
 * and nothing tore the collector down: for `expectNoEmission`, whose watchdog is off, the
 * subscription then lived on for the rest of the run.
 */
function runAdvance<T>(context: WaitContext, collected: Collected<T>, settle: Rejecter): void {
  try {
    context.options?.advance?.();
  } catch (error) {
    collected.stop();
    settle.reject(
      emissionFailure(context, `the \`advance\` callback threw: ${String(error)}. The wait was torn down; the error is on \`cause\`.`, {
        cause: error,
      }),
    );
  }
}

function subscribeAndCollect<T>(
  source$: EmissionSource<T>,
  options: EmissionOptions<T> | undefined,
  settle: Settle<T>,
  handlers: CollectorHandlers<T>,
): Collector {
  let subscription: { unsubscribe(): void } | undefined = undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimer> | undefined = undefined;

  // Idempotent: called from `next`/`error`/`complete` (possibly before `subscribe` returned, for a
  // synchronous source), from the watchdog, and from the teardown of a test that never awaited.
  function stop(): void {
    stopped = true;
    clearTimer(timer);
    collector.alsoStop?.();
    subscription?.unsubscribe();
    forgetEmissionWait(wait);
  }

  const collected: Collected<T> = { accepted: [], received: 0, subscribing: true, stop };
  const wait: PendingEmissionWait = { describe: describeSource(options), abandon: stop };
  const collector: Collector = { stop };
  const context: WaitContext = { helper: handlers.helper, options, expected: handlers.expected };

  if (!isSubscribable(source$)) {
    settle.reject(notSubscribableError(source$, context));

    return collector;
  }

  subscription = subscribeToSource(source$, collectingObserver(collected, context, settle, handlers), (early) => {
    subscription = early;
  });
  collected.subscribing = false;

  // A synchronous source (`of(…)`, a `BehaviorSubject`) settled while `subscription` was still
  // unassigned — which only a source that is not rxjs's can now do, since an rxjs one hands its
  // subscriber over up front. The `stop()` above could not unsubscribe; do it now.
  if (stopped) {
    subscription.unsubscribe();

    return collector;
  }

  // Armed after the subscription, not before it: a source that throws out of `subscribe` used to
  // leave the watchdog running for its whole timeout. `Infinity` — the natural way to say "no
  // deadline" while debugging — would fire after 1 ms, because that is what Node does with a delay
  // above 2³¹−1, so a non-finite wait disables the watchdog instead.
  const timeout = options?.timeout ?? emissionTimeout();

  if (Number.isFinite(timeout) && timeout > 0) {
    timer = setTimer(
      () => {
        stop();
        settle.reject(handlers.onTimeout(collected.received, context, timeout));
      },
      Math.min(timeout, MAX_TIMER_DELAY),
    );
  }

  registerEmissionWait(wait);

  // After the subscription and before the caller gets its promise — the one moment a spec cannot
  // reach on its own.
  runAdvance(context, collected, settle);

  return collector;
}

/**
 * Reject with a failure this module built, pinned to the stack taken at helper entry.
 *
 * Every failure here is constructed inside a subscribe or timer callback, where the caller's frame
 * is long gone — so the rejection, not the construction, is where the anchor goes on. One shared
 * factory rather than an arrow per helper, so the wrapping is impossible to forget at a new
 * rejection site.
 */
function anchoredRejecter(reject: (error: Error) => void, anchor: StackAnchor): (error: Error) => void {
  return (error) => reject(anchor(error));
}

function timeoutError(received: number, context: WaitContext, waited: number): Error {
  const { expected, options } = context;
  const diagnosis =
    received === 0
      ? `no value within ${waited} ms (0 received). Nothing triggered the stream — check the call that should make it emit, ` +
        'or the spy feeding it (`nextWith`).'
      : `${countOf(received, 'emission')} within ${waited} ms, expected ${describeExpectation(expected, options)}. ` +
        (options?.until
          ? 'None of the rest matched `until` — check the predicate against the values the stream really emits.'
          : 'Check what should push the rest, or raise `{ timeout }` if the stream is just slow.');

  return emissionFailure(context, diagnosis + fakeClockAdvice());
}

/**
 * The stream errored where a value was expected: reject, wrapping.
 *
 * Wrapped rather than passed through, because the message is the point — it names the call and the
 * stream, and a bare rethrow of `'BOOM'` names nothing. The original travels on `cause`, so
 * `rejects.toThrow(expect.objectContaining({ cause: original }))` can still reach it — but for
 * `rejects.toBe(original)` or `rejects.toBeInstanceOf(HttpErrorResponse)`, use {@link expectError},
 * which resolves *with* the error and needs no unwrapping at all.
 */
function rejectAsSourceError(error: unknown, context: WaitContext, settle: Rejecter): void {
  settle.reject(
    emissionFailure(
      context,
      `the stream errored instead of emitting: ${String(error)}. ` +
        'If that error is what the test is about, await `expectError(source$)` — it resolves with the error itself.',
      { cause: error },
    ),
  );
}

function completedError(received: number, context: WaitContext): Error {
  const { expected, options } = context;
  const action =
    received === 0
      ? 'The value was most likely emitted before this subscribed: start the wait first (hold the promise), then trigger.'
      : options?.until
        ? 'None of them matched `until` — check the predicate against what the stream emits.'
        : 'The stream ends too early — check the `take` / `first` upstream, or ask for fewer values.';

  return emissionFailure(
    context,
    `the stream completed after ${countOf(received, 'emission')}, expected ${describeExpectation(expected, options)}. ${action}`,
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
 * await expect(expectEmission(status$, { until: (s) => s === 'ready' })).resolves.toBe('ready'); // not `filter`
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
  return collectEmissions(source$, 1, options, captureAnchor(expectEmission), 'expectEmission').then((values) => firstOf(values));
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
  return collectEmissions(source$, count, options, captureAnchor(expectEmissions), 'expectEmissions');
}

/**
 * The body both emission helpers share.
 *
 * Separate from `expectEmissions` because that one is overloaded, and an overloaded function cannot
 * be called from its own implementation signature — the union it accepts there matches neither
 * overload.
 */
function collectEmissions<T>(
  source$: EmissionSource<T>,
  count: number,
  options: EmissionOptions<T> | undefined,
  anchor: StackAnchor,
  helper: string,
): Promise<T[]> {
  // `count: 0` could never be satisfied: `isDone` is consulted only when something arrives, so the
  // wait either timed out or was told "completed after 0 emission(s), expected 0". Thrown rather
  // than rejected, so the stack is the caller's own — this is a bad argument, not a failed wait.
  if (count < 1) {
    throw new Error(
      withDocs(
        `[vitest-auto-spy] expectEmissions(source$, ${count}) can never succeed: no stream can emit fewer than one value and satisfy it. ` +
          'Use `expectNoEmission(source$)` to assert silence.',
        DOCS_LINKS.observableFailures,
      ),
    );
  }

  return new Promise<T[]>((resolve, reject) => {
    const fail = anchoredRejecter(reject, anchor);

    subscribeAndCollect(
      source$,
      options,
      // Resolved with everything that arrived, then narrowed to the accepted ones: the collector's
      // job is to record, and `skip` / `until` decide what the caller is handed.
      { resolve: (values) => resolve(values.slice(0, count)), reject: fail },
      {
        isDone: (acceptedCount) => acceptedCount >= count,
        onComplete: (_values, received) => fail(completedError(received, { helper, options, expected: count })),
        onTimeout: timeoutError,
        onError: rejectAsSourceError,
        emissionsSettle: true,
        helper,
        expected: count,
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
  const anchor = captureAnchor(expectNoEmission);
  let quietWindow: ReturnType<typeof setTimer> | undefined = undefined;
  const context: WaitContext = { helper: 'expectNoEmission', options, expected: 1 };

  return new Promise<void>((resolve, reject) => {
    const fail = anchoredRejecter(reject, anchor);
    const collector = subscribeAndCollect<T>(
      source$,
      { ...options, timeout: 0 },
      {
        resolve: (emitted, onSubscribe) => fail(unexpectedEmissionError(emitted, context, onSubscribe)),
        reject: fail,
      },
      {
        isDone: (acceptedCount) => acceptedCount > 0,
        // A completed source can emit no more, so silence is proven; waiting for the window instead
        // hung, because the collector's teardown clears the window timer.
        onComplete: () => resolve(),
        // Never reached — the watchdog is off (`timeout: 0`) and the quiet window below is this
        // helper's own timer. Named rather than inlined so it is not an uncalled arrow.
        onTimeout: timeoutError,
        onError: rejectAsSourceError,
        emissionsSettle: true,
        helper: context.helper,
        expected: context.expected,
      },
    );

    // No `values.length === 0` guard: an emission settles the promise as a rejection, and the
    // `finally` below cancels this timer in the microtask that follows — before a macrotask can
    // run. So reaching this callback *is* the proof that the window stayed quiet.
    quietWindow = setTimer(() => {
      collector.stop();
      resolve();
    }, quietFor);

    // A test that ended without awaiting this promise has no `finally` to reach: the collector's
    // teardown clears the window too.
    collector.alsoStop = (): void => clearTimer(quietWindow);
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
  return collectUntilComplete(source$, options, captureAnchor(expectCompletion), 'expectCompletion').then(() => undefined);
}

/**
 * Await **every** value of `source$`, once it completes — the assertion for "emits exactly these, and
 * nothing after". `expectEmissions(source$, n)` stops at `n` and cannot see an `n + 1`-th.
 *
 * ```ts
 * await expect(expectAllEmissions(source$.pipe(trueMap()))).resolves.toEqual([true, true]);
 * ```
 *
 * Fails like {@link expectCompletion}: on the timeout, and on an error instead of completing.
 */
export function expectAllEmissions<T>(source$: CallbackSubscribable<T>, options?: EmissionOptions<T>): Promise<T[]>;
export function expectAllEmissions<T>(source$: SubscribableLike<T>, options?: EmissionOptions<T>): Promise<T[]>;
export function expectAllEmissions<T>(source$: EmissionSource<T>, options?: EmissionOptions<T>): Promise<T[]> {
  return collectUntilComplete(source$, options, captureAnchor(expectAllEmissions), 'expectAllEmissions');
}

function collectUntilComplete<T>(
  source$: EmissionSource<T>,
  options: EmissionOptions<T> | undefined,
  anchor: StackAnchor,
  helper: 'expectAllEmissions' | 'expectCompletion',
): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    subscribeAndCollect<T>(
      source$,
      options,
      { resolve, reject: anchoredRejecter(reject, anchor) },
      {
        // Only completion settles this; `collect` decides whether `skip` and `until` pick values.
        isDone: staysOpen,
        onComplete: resolve,
        onTimeout: notCompletedError,
        onError: rejectAsNotCompleted,
        emissionsSettle: helper === 'expectAllEmissions',
        helper,
        expected: 0,
      },
    );
  });
}

/** `isDone` for a helper that no emission can satisfy — only `complete` settles it. */
function staysOpen(): boolean {
  return false;
}

function notCompletedError(received: number, context: WaitContext, waited: number): Error {
  return emissionFailure(
    context,
    `the stream did not complete within ${waited} ms (${countOf(received, 'emission')} received). ` +
      'Nothing completed it — end it upstream with `take` / `first` / `takeUntil`, or call `complete()` on the Subject ' +
      'that feeds it.' +
      fakeClockAdvice(),
  );
}

function rejectAsNotCompleted(error: unknown, context: WaitContext, settle: Rejecter): void {
  settle.reject(
    emissionFailure(
      context,
      `the stream errored instead of completing: ${String(error)}. ` +
        'If that error is what the test is about, await `expectError(source$)` — it resolves with the error itself.',
      { cause: error },
    ),
  );
}

/**
 * Await the error `source$` fails with, and hand it back **as it was thrown**.
 *
 * The assertion the other helpers cannot make. A stream that errors rejects them with a *new*
 * `Error` whose message names the stream, which is right for a helper whose job is to report an
 * unexpected failure — and useless when the failure is the thing under test:
 * `rejects.toBe(originalError)`, `rejects.toBeInstanceOf(UpstreamStatusError)` and an exact
 * `expect(err.message).toBe('websso fail')` all fail against the wrapper. Here the error is the
 * resolved value, so every one of them is an ordinary assertion:
 *
 * ```ts
 * await expect(expectError(service.load())).resolves.toBe(originalError);
 * expect(await expectError(process$)).toBeInstanceOf(UpstreamStatusError);
 * ```
 *
 * It waits for the error however late it is — a stream that emits first and then fails still
 * settles here on the failure — and fails, naming the stream, if the stream completes or stays
 * quiet instead.
 */
export function expectError(source$: EmissionSource<unknown>, options?: EmissionOptions): Promise<unknown> {
  // The anchor covers this helper's own failures only. The error it resolves with is the caller's,
  // and rewriting its stack would move the reader away from where that error was really made.
  const anchor = captureAnchor(expectError);
  const context: WaitContext = { helper: 'expectError', options, expected: 0 };

  return new Promise<unknown[]>((resolve, reject) => {
    const fail = anchoredRejecter(reject, anchor);

    subscribeAndCollect<unknown>(
      source$,
      options,
      { resolve, reject: fail },
      {
        // Only `error` settles this one: an emission is not the answer, and neither is completion.
        isDone: staysOpen,
        onComplete: (_values, received) => fail(completedWithoutErrorError(received, context)),
        onTimeout: notErroredError,
        onError: resolveWithError,
        emissionsSettle: false,
        helper: context.helper,
        expected: context.expected,
      },
    );
  }).then((values) => firstOf(values));
}

function completedWithoutErrorError(received: number, context: WaitContext): Error {
  return emissionFailure(
    context,
    `the stream completed after ${countOf(received, 'emission')} without erroring. ` +
      'The failure path never ran — the spy feeding it answers with a value; configure it with `throwWith` / `rejectWith`.',
  );
}

function notErroredError(received: number, context: WaitContext, waited: number): Error {
  return emissionFailure(
    context,
    `no error within ${waited} ms (${countOf(received, 'emission')} received), and the stream is still open. ` +
      'Check that the call under test reaches the failing path.' +
      fakeClockAdvice(),
  );
}

/** `expectError`'s error path: the stream erroring is the success, and the error is the value. */
function resolveWithError(error: unknown, _context: WaitContext, settle: Settle<unknown>): void {
  settle.resolve([error], false);
}

function unexpectedEmissionError(values: unknown[], context: WaitContext, onSubscribe: boolean): Error {
  // `serializeValue`, not `JSON.stringify`: what a spec asserts stays silent is routinely a
  // component, a DOM node or a store slice with back-references, and stringifying one throws
  // `Converting circular structure to JSON` — losing the value the message exists to show.
  const shown = serializeValue(values[0]);

  return emissionFailure(
    context,
    onSubscribe
      ? `emitted ${shown} the moment it subscribed, but was expected to stay silent. That is a replayed value ` +
          '(`BehaviorSubject`, `shareReplay`, `startWith`) — ignore it with `{ skip: 1 }`.'
      : `emitted ${shown} but was expected to stay silent. Something the test ran pushed it — check the calls before this wait.`,
  );
}
