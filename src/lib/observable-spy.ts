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
  getSubject: () => ReplaySubject<T>,
  onSubjectConfigured: (subject: Observable<T>) => void,
): void {
  decorate(objectToDecorate, {
    nextWith: (value: T): void => {
      const subject = getSubject();
      subject.next(value);
      onSubjectConfigured(subject);
    },
    nextOneTimeWith: (value: T): void => {
      const subject = getSubject();
      subject.next(value);
      subject.complete();
      onSubjectConfigured(subject);
    },
    nextWithValues: (valuesConfigs: ValueConfig<T>[]): void => {
      if (valuesConfigs.length === 0) {
        return;
      }

      onSubjectConfigured(mergeSubjectWithDefaultValues(getSubject(), valuesConfigs));
    },
    throwWith: (value: unknown): void => {
      const subject = getSubject();
      subject.error(value);
      onSubjectConfigured(subject);
    },
    complete: (): void => {
      const subject = getSubject();
      subject.complete();
      onSubjectConfigured(subject);
    },
    returnSubject: (): ReplaySubject<T> => {
      const subject = getSubject();
      onSubjectConfigured(subject);

      return subject;
    },
  });
}

/** A memoizing lazy factory: the `ReplaySubject` is created on first use, then reused. */
function lazySubject<T>(): () => ReplaySubject<T> {
  let subject: ReplaySubject<T> | undefined;

  return (): ReplaySubject<T> => (subject ??= createReplaySubject<T>());
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
      returnValueContainer.valuesPerCalls = valuesPerCalls;

      onConfigured(returnValueContainer);

      return returnedSubjects;
    },
  });
}

export function addObservableHelpersToFunctionSpy(spyFunction: object, valueContainer: ReturnValueContainer): void {
  addObservableHelpers(spyFunction, lazySubject(), (configuredSubject) => {
    valueContainer.value = configuredSubject;
  });
  addNextWithPerCall(spyFunction, valueContainer);
}

export function addObservableHelpersToCalledWithObject(calledWithObject: CalledWithObject, calledWithArgs: unknown[]): void {
  const returnValueContainer: ReturnValueContainer = { value: undefined };
  addObservableHelpers(calledWithObject, lazySubject(), (configuredSubject) => {
    returnValueContainer.value = configuredSubject;
    calledWithObject.argsToValuesMap.set(calledWithArgs, returnValueContainer);
  });
  addNextWithPerCall(calledWithObject, returnValueContainer, (configured) => {
    calledWithObject.argsToValuesMap.set(calledWithArgs, configured);
  });
}

/** Build a standalone Observable that emits the provided value configs. */
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
  const providedSubject = createReplaySubject<T>();
  // The currently-published stream: starts as the backing subject, but
  // `nextWithValues` swaps in a merged observable. `defer` re-reads it on each
  // subscription, so late reconfiguration is honoured. The backing
  // `providedSubject` is captured separately, so `nextWith`/`complete` after a
  // `nextWithValues` keep operating on a real Subject.
  let published$: Observable<T> = providedSubject;
  const observableSpy: Observable<T> = defer(() => published$);
  addObservableHelpers(observableSpy, () => providedSubject, (configuredSubject) => {
    published$ = configuredSubject;
  });

  // `addObservableHelpers` attaches the `AddObservableSpyMethods<T>` helpers onto
  // `observableSpy` at runtime; the assertion re-exposes those dynamically-attached
  // methods to the type system.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the helpers are assembled at runtime via `decorate`; their presence cannot be expressed without an assertion on the in-place-mutated Observable.
  return observableSpy as AddObservableSpyMethods<T> & Observable<T>;
}
