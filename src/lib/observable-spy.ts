/**
 * Observable-returning spy helpers.
 *
 * Attaches `nextWith` / `nextWithValues` / `throwWith` / `complete` / … to
 * function spies, `calledWith` objects and observable properties, all backed by
 * a controllable `ReplaySubject`.
 */
import { EMPTY, Observable, ReplaySubject, defer, from, merge, of, throwError, timer } from 'rxjs';
import { concatMap, delay, switchMap, take, takeUntil, takeWhile } from 'rxjs/operators';

import { REPLAY_BUFFER_SIZE } from './constants';
import type { CalledWithObject, ReturnValueContainer } from './internal-types';
import { decorate } from './spy-decoration';
import type { AddObservableSpyMethods, ValueConfig, ValueConfigPerCall } from './types';
import { isCompleteConfig, isErrorConfig, isNextValueConfig } from './value-config-guards';

function createReplaySubject<T>(): ReplaySubject<T> {
  return new ReplaySubject<T>(REPLAY_BUFFER_SIZE);
}

/**
 * Turn a sequence of `ValueConfig`s into an observable that emits values,
 * errors and completion in order — while still forwarding anything pushed onto
 * `subject` until an explicit `{ complete: true }` entry is reached.
 */
function mergeSubjectWithDefaultValues<T>(subject: ReplaySubject<T>, valuesConfigs: ValueConfig<T>[]): Observable<T> {
  const onCompleteSubject = new ReplaySubject<void>(REPLAY_BUFFER_SIZE);

  const results$ = from(valuesConfigs).pipe(
    // Honor a delay on a completion entry before it stops the stream.
    concatMap((config) =>
      isCompleteConfig(config) && config.complete && config.delay ? of(config).pipe(delay(config.delay)) : of(config),
    ),
    // Stop (and signal completion) as soon as a `{ complete: true }` entry arrives.
    takeWhile((config) => {
      if (!isCompleteConfig(config)) {
        return true;
      }

      if (config.complete) {
        onCompleteSubject.next();

        return false;
      }

      return true;
    }),
    // Map each remaining entry to its emission: a value, an error, or nothing.
    concatMap((config) => {
      if (isNextValueConfig(config) && config.value) {
        return config.delay ? of(config.value).pipe(delay(config.delay)) : of(config.value);
      }

      if (isErrorConfig(config) && config.errorValue) {
        return config.delay
          ? timer(config.delay).pipe(switchMap(() => throwError(() => config.errorValue)))
          : throwError(() => config.errorValue);
      }

      return EMPTY;
    }),
  );

  return merge(results$, subject.pipe(takeUntil(onCompleteSubject)));
}

/**
 * Attach the core observable helpers to `objectToDecorate`. Every helper calls
 * `onSubjectConfigured` so the caller can publish the resulting observable.
 *
 * The backing subject is reached through `getSubject`, not a live instance, so a
 * function spy that never uses an observable helper (the common case for a
 * sync/promise method once rxjs is loaded) never allocates a `ReplaySubject`.
 * `getSubject` is expected to memoize, so every helper sees the same instance.
 */
function addObservableHelpers<T>(
  objectToDecorate: object,
  handle: SubjectHandle<T>,
  onSubjectConfigured: (subject: Observable<T>) => void,
): void {
  decorate(objectToDecorate, {
    nextWith: (value: T): void => {
      const subject = handle.get();
      subject.next(value);
      onSubjectConfigured(subject);
    },
    nextOneTimeWith: (value: T): void => {
      const subject = handle.get();
      subject.next(value);
      subject.complete();
      // Closed for good, so the next configuration on this spy has to start a new one — otherwise
      // it pushes into a dead subject and emits nothing, which is what used to happen.
      handle.terminate();
      onSubjectConfigured(subject);
    },
    nextWithValues: (valuesConfigs: ValueConfig<T>[]): void => {
      if (valuesConfigs.length === 0) {
        return;
      }

      onSubjectConfigured(mergeSubjectWithDefaultValues(handle.get(), valuesConfigs));
    },
    throwWith: (value: unknown): void => {
      const subject = handle.get();
      subject.error(value);
      handle.terminate();
      onSubjectConfigured(subject);
    },
    complete: (): void => {
      const subject = handle.get();
      subject.complete();
      handle.terminate();
      onSubjectConfigured(subject);
    },
    returnSubject: (): ReplaySubject<T> => {
      const subject = handle.get();
      onSubjectConfigured(subject);

      return subject;
    },
  });
}

/**
 * Forget what the previous configuration of `container` left behind.
 *
 * A function spy owns one container for its whole life, and `unwrapContainer` reads
 * `_isRejectedPromise` and `valuesPerCalls` *before* it reads `value`. Without this, a
 * `rejectWith(err)` (or a `*PerCall` batch) keeps answering for every later `nextWith` /
 * `nextWithPerCall` on the same spy, silently ignoring the newer configuration. The promise
 * helpers clear both on every store; the observable helpers publish through this instead of
 * repeating it at each of their two publication points.
 */
function clearPreviousConfig(container: ReturnValueContainer): void {
  container._isRejectedPromise = false;
  delete container.valuesPerCalls;
}

/**
 * The backing subject of one spy, and its lifetime.
 *
 * It used to be a plain memoizing factory — one `ReplaySubject(1)` created on first use and kept
 * for the life of the spy — and that made the buffer outlive the configuration that filled it. Two
 * failures came out of it, both silent, and the first is the quietest defect in this library's
 * history: **a failing call became a successful one carrying the previous test's data.**
 *
 * ```ts
 * // test 1
 * service.createSeamlessTransition.nextWith(uri); // buffered, for the rest of the run
 *
 * // test 2 — the failure path is what this test is about
 * service.createSeamlessTransition.throwWith(error);
 * // the subscriber gets `uri` first, and the error only after it
 * ```
 *
 * The code under test therefore walks the *success* branch on stale data, and the branch the test
 * was written for is reached — if at all — one emission late. Nothing in the failure points at the
 * previous test. It needs a spy that outlives a test, which is the ordinary shape when the TestBed
 * is built in `beforeAll`.
 *
 * The second is worse in a quieter way: `error()` and `complete()` **close a Subject permanently**,
 * so every later `nextWith` on that spy pushed into a dead subject and emitted nothing at all —
 * even after `resetAutoSpy`, which is supposed to return the spy to pristine and could not reach
 * this state.
 *
 * Hence a handle rather than a factory. `get()` hands back a live subject, making a fresh one when
 * the current one has been terminated; `terminate()` records that a helper closed it; `reset()`
 * drops it, and is wired into the spy's configuration reset — the buffer *is* configuration, in
 * exactly the sense `calledWith` is.
 */
interface SubjectHandle<T> {
  /** The current subject — a new one when there is none, or when the last was closed. */
  get(): ReplaySubject<T>;
  /** Record that a helper has just errored or completed the subject. */
  terminate(): void;
  /** Forget the subject, so the next configuration starts from an empty stream. */
  reset(): void;
}

function subjectHandle<T>(): SubjectHandle<T> {
  let subject: ReplaySubject<T> | undefined;
  // Tracked here rather than read off the subject: rxjs's own `isStopped` is deprecated, and the
  // three helpers that close it are the only things that can, so this cannot drift.
  let terminated = false;

  return {
    get: (): ReplaySubject<T> => {
      if (!subject || terminated) {
        subject = createReplaySubject<T>();
        terminated = false;
      }

      return subject;
    },
    terminate: (): void => {
      terminated = true;
    },
    reset: (): void => {
      subject = undefined;
      terminated = false;
    },
  };
}

/** Build the per-call observable for one `ValueConfigPerCall` entry. */
function buildPerCallObservable<T>(replaySubject: ReplaySubject<T>, config: ValueConfigPerCall<T>): Observable<T> {
  let observable: Observable<T> = replaySubject.asObservable();

  if (config.delay) {
    observable = observable.pipe(delay(config.delay));
  }

  if (!config.doNotComplete) {
    observable = observable.pipe(take(1));
  }

  return observable;
}

/** Attach `nextWithPerCall`, which returns one controllable subject per call. */
function addNextWithPerCall<T>(
  objectToDecorate: object,
  returnValueContainer: ReturnValueContainer,
  onConfigured: (container: ReturnValueContainer) => void = (): void => undefined,
): void {
  decorate(objectToDecorate, {
    nextWithPerCall: (valueConfigsPerCall: ValueConfigPerCall<T>[]): ReplaySubject<T>[] => {
      const returnedSubjects: ReplaySubject<T>[] = [];

      if (valueConfigsPerCall.length === 0) {
        return returnedSubjects;
      }

      const valuesPerCalls: ReturnValueContainer['valuesPerCalls'] = [];
      valueConfigsPerCall.forEach((config) => {
        const replaySubject = createReplaySubject<T>();
        replaySubject.next(config.value);
        returnedSubjects.push(replaySubject);

        valuesPerCalls.push({ wrappedValue: buildPerCallObservable(replaySubject, config) });
      });
      clearPreviousConfig(returnValueContainer);
      returnValueContainer.valuesPerCalls = valuesPerCalls;

      onConfigured(returnValueContainer);

      return returnedSubjects;
    },
  });
}

/**
 * @returns the spy's observable reset, for {@link createFunctionSpy} to fold into its configuration
 *   reset. Returned rather than attached here because a spy owns exactly one reset hook, and the
 *   core already uses it for the container and the dispatch.
 */
export function addObservableHelpersToFunctionSpy(spyFunction: object, valueContainer: ReturnValueContainer): () => void {
  const handle = subjectHandle();
  addObservableHelpers(spyFunction, handle, (configuredSubject) => {
    clearPreviousConfig(valueContainer);
    valueContainer.value = configuredSubject;
  });
  addNextWithPerCall(spyFunction, valueContainer);

  return handle.reset;
}

export function addObservableHelpersToCalledWithObject(calledWithObject: CalledWithObject, calledWithArgs: unknown[]): void {
  const returnValueContainer: ReturnValueContainer = { value: undefined };
  addObservableHelpers(calledWithObject, subjectHandle(), (configuredSubject) => {
    clearPreviousConfig(returnValueContainer);
    returnValueContainer.value = configuredSubject;
    calledWithObject.argsToValuesMap.set(calledWithArgs, returnValueContainer);
  });
  addNextWithPerCall(calledWithObject, returnValueContainer, (configured) => {
    calledWithObject.argsToValuesMap.set(calledWithArgs, configured);
  });
}

/**
 * Build a standalone Observable that emits the provided value configs.
 *
 * @example
 * ```ts
 * const source$ = createObservableWithValues([{ value: 'a' }, { value: 'b', delay: 100 }, { complete: true }]);
 * ```
 */
export function createObservableWithValues<T>(valuesConfigs: ValueConfig<T>[]): Observable<T>;
export function createObservableWithValues<T>(
  valuesConfigs: ValueConfig<T>[],
  config: { returnSubject: true },
): { values$: Observable<T>; subject: ReplaySubject<T> };
export function createObservableWithValues<T>(
  valuesConfigs: ValueConfig<T>[],
  config?: { returnSubject: boolean },
): Observable<T> | { values$: Observable<T>; subject: ReplaySubject<T> } {
  const subject = createReplaySubject<T>();
  const values$ = mergeSubjectWithDefaultValues(subject, valuesConfigs);

  return config?.returnSubject ? { values$, subject } : values$;
}

/** Create an observable property spy (deferred subscription to a controllable subject). */
export function createObservablePropSpy<T>(): AddObservableSpyMethods<T> & Observable<T> {
  const handle = subjectHandle<T>();
  // The currently-published stream: starts as the backing subject, but `nextWithValues` swaps in a
  // merged observable. `defer` re-reads it on each subscription, so late reconfiguration is
  // honoured — and it re-reads the *handle* too, so a `nextWith` after a `complete()` publishes the
  // fresh subject rather than pushing into the closed one.
  let published$: Observable<T> = defer(() => handle.get());
  const observableSpy: Observable<T> = defer(() => published$);
  addObservableHelpers(observableSpy, handle, (configuredSubject) => {
    published$ = configuredSubject;
  });

  // `addObservableHelpers` attaches the `AddObservableSpyMethods<T>` helpers onto
  // `observableSpy` at runtime; the assertion re-exposes those dynamically-attached
  // methods to the type system.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the helpers are assembled at runtime via `decorate`; their presence cannot be expressed without an assertion on the in-place-mutated Observable.
  return observableSpy as AddObservableSpyMethods<T> & Observable<T>;
}
