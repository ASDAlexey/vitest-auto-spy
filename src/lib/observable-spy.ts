/**
 * Observable-returning spy helpers.
 *
 * Attaches `nextWith` / `nextWithValues` / `throwWith` / `complete` / … to
 * function spies, `calledWith` objects and observable properties, all backed by
 * a controllable `ReplaySubject`.
 */

import { defer, EMPTY, from, merge, Observable, of, ReplaySubject, throwError, timer } from 'rxjs';
import { concatMap, delay, switchMap, take, takeUntil, takeWhile } from 'rxjs/operators';

import { REPLAY_BUFFER_SIZE } from './constants';
import type { AddObservableSpyMethods, ValueConfig, ValueConfigPerCall } from './types';
import type { CalledWithObject, ReturnValueContainer } from './internal-types';
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
      isCompleteConfig(config) && config.complete && config.delay
        ? of(config).pipe(delay(config.delay))
        : of(config),
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
 */
function addObservableHelpers<T>(
  objectToDecorate: any,
  providedSubject: ReplaySubject<T>,
  onSubjectConfigured: (subject: Observable<T>) => void,
): void {
  objectToDecorate.nextWith = (value: T): void => {
    providedSubject.next(value);
    onSubjectConfigured(providedSubject);
  };
  objectToDecorate.nextOneTimeWith = (value: T): void => {
    providedSubject.next(value);
    providedSubject.complete();
    onSubjectConfigured(providedSubject);
  };
  objectToDecorate.nextWithValues = (valuesConfigs: ValueConfig<T>[]): void => {
    if (valuesConfigs.length === 0) {
      return;
    }
    onSubjectConfigured(mergeSubjectWithDefaultValues(providedSubject, valuesConfigs));
  };
  objectToDecorate.throwWith = (value: any): void => {
    providedSubject.error(value);
    onSubjectConfigured(providedSubject);
  };
  objectToDecorate.complete = (): void => {
    providedSubject.complete();
    onSubjectConfigured(providedSubject);
  };
  objectToDecorate.returnSubject = (): ReplaySubject<T> => {
    onSubjectConfigured(providedSubject);
    return providedSubject;
  };
}

/** Build the per-call observable for one `ValueConfigPerCall` entry. */
function buildPerCallObservable(replaySubject: ReplaySubject<any>, config: ValueConfigPerCall<any>): Observable<any> {
  let observable: Observable<any> = replaySubject.asObservable();
  if (config.delay) {
    observable = observable.pipe(delay(config.delay));
  }
  if (!config.doNotComplete) {
    observable = observable.pipe(take(1));
  }
  return observable;
}

/** Attach `nextWithPerCall`, which returns one controllable subject per call. */
function addNextWithPerCall(
  objectToDecorate: any,
  returnValueContainer: ReturnValueContainer,
  onConfigured: (container: ReturnValueContainer) => void = () => undefined,
): void {
  objectToDecorate.nextWithPerCall = (valueConfigsPerCall: ValueConfigPerCall<any>[]): ReplaySubject<any>[] => {
    const returnedSubjects: ReplaySubject<any>[] = [];
    if (valueConfigsPerCall.length === 0) {
      return returnedSubjects;
    }

    returnValueContainer.valuesPerCalls = [];
    valueConfigsPerCall.forEach((config) => {
      const replaySubject = new ReplaySubject<any>(REPLAY_BUFFER_SIZE);
      replaySubject.next(config.value);
      returnedSubjects.push(replaySubject);

      returnValueContainer.valuesPerCalls!.push({ wrappedValue: buildPerCallObservable(replaySubject, config) });
    });

    onConfigured(returnValueContainer);
    return returnedSubjects;
  };
}

export function addObservableHelpersToFunctionSpy(spyFunction: any, valueContainer: ReturnValueContainer): void {
  const subject = createReplaySubject();
  addObservableHelpers(spyFunction, subject, (configuredSubject) => {
    valueContainer.value = configuredSubject;
  });
  addNextWithPerCall(spyFunction, valueContainer);
}

export function addObservableHelpersToCalledWithObject(
  calledWithObject: CalledWithObject,
  calledWithArgs: any[],
): void {
  const subject = createReplaySubject();
  const returnValueContainer: ReturnValueContainer = { value: undefined };
  addObservableHelpers(calledWithObject, subject, (configuredSubject) => {
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
export function createObservablePropSpy<T>(): Observable<T> & AddObservableSpyMethods<T> {
  let subject = createReplaySubject<T>();
  const observableSpy: any = defer(() => subject);
  addObservableHelpers(observableSpy, subject, (configuredSubject) => {
    subject = configuredSubject as ReplaySubject<T>;
  });
  return observableSpy;
}
