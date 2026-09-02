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
import { type ObservableStream } from './observable-support';
import { decorate, detachedHelperError } from './spy-decoration';
import { hooksOf } from './spy-mark';
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
    //
    // The guards test *presence* (`'value' in config`), and that is the whole check: an entry that
    // carries the key is an emission whatever the value is. Adding `&& config.value` on top — which
    // is what stood here — silently dropped `{ value: false }`, `{ value: 0 }`, `{ value: '' }` and
    // `{ value: null }`, i.e. an ordinary boolean or counter stream. Nothing was emitted, nothing
    // was reported, and the symptom arrived a test away as a timed-out `expectEmission` or as a
    // component still holding its initial state.
    concatMap((config) => {
      if (isNextValueConfig(config)) {
        return config.delay ? of(config.value).pipe(delay(config.delay)) : of(config.value);
      }

      if (isErrorConfig(config)) {
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
 * The backing subject of one observable target, created on first use and replaced after it closes.
 *
 * A class with two fields rather than a closure over two variables: every function spy the rxjs
 * layer touches used to allocate the handle as an object plus three closures, on top of six more
 * closures for the helpers themselves — a dozen objects per method a spec called, before the mock.
 * The targets below extend it, so a function spy's whole observable state is one object.
 *
 * `terminated` is tracked here rather than read off the subject: rxjs's own `isStopped` is
 * deprecated, and the three helpers that close it are the only things that can, so this cannot drift.
 */
abstract class ObservableTarget<T> {
  subject: ReplaySubject<T> | undefined = undefined;
  terminated = false;

  get(): ReplaySubject<T> {
    if (!this.subject || this.terminated) {
      this.subject = createReplaySubject<T>();
      this.terminated = false;
    }

    return this.subject;
  }

  terminate(): void {
    this.terminated = true;
  }

  reset(): void {
    this.subject = undefined;
    this.terminated = false;
  }

  /** Where a configured stream goes: the spy's return container, a `calledWith` slot, or a prop's published stream. */
  abstract publish(stream: Observable<T>): void;
}

/** What `nextWithPerCall` needs on top: the container it fills, and a hook for a target that has to register it. */
interface PerCallTarget {
  readonly container: ReturnValueContainer;
  configured(): void;
}

/** How a helper finds its target from `this` — a closure over one target, or a lookup through the spy's mark. */
type Resolve<Self, Target> = (self: Self, helper: string) => Target;

/**
 * Close the target's subject the way `close` says, then publish it.
 *
 * Closed for good, so the next configuration on this target has to start a new subject — otherwise
 * it pushes into a dead one and emits nothing, which is what used to happen.
 */
function closeAndPublish<T>(target: ObservableTarget<T>, close: (subject: ReplaySubject<T>) => void): void {
  const subject = target.get();
  close(subject);
  target.terminate();
  target.publish(subject);
}

/**
 * The six stream helpers, written against `this` and built once per *resolver*.
 *
 * On a function spy the resolver reads the spy's state through its mark, so one set of six
 * functions serves every spy in the run and materialising a method allocates none of them. A
 * `calledWith` chain and an observable prop still get a set each, because their resolver closes
 * over the one target — a chain is configuration built on demand, and a class has a handful of
 * observable props, so there is nothing to save there.
 */
function observableHelpers<Self, T>(
  resolve: Resolve<Self, ObservableTarget<T>>,
): {
  nextWith(this: Self, value: T): void;
  nextOneTimeWith(this: Self, value: T): void;
  nextWithValues(this: Self, valuesConfigs: ValueConfig<T>[]): void;
  throwWith(this: Self, value: unknown): void;
  complete(this: Self): void;
  returnSubject(this: Self): ReplaySubject<T>;
} {
  return {
    nextWith(this: Self, value: T): void {
      const target = resolve(this, 'nextWith');
      const subject = target.get();
      subject.next(value);
      target.publish(subject);
    },
    nextOneTimeWith(this: Self, value: T): void {
      closeAndPublish(resolve(this, 'nextOneTimeWith'), (subject) => {
        subject.next(value);
        subject.complete();
      });
    },
    nextWithValues(this: Self, valuesConfigs: ValueConfig<T>[]): void {
      if (valuesConfigs.length === 0) {
        return;
      }

      const target = resolve(this, 'nextWithValues');
      target.publish(mergeSubjectWithDefaultValues(target.get(), valuesConfigs));
    },
    throwWith(this: Self, value: unknown): void {
      closeAndPublish(resolve(this, 'throwWith'), (subject) => subject.error(value));
    },
    complete(this: Self): void {
      closeAndPublish(resolve(this, 'complete'), (subject) => subject.complete());
    },
    returnSubject(this: Self): ReplaySubject<T> {
      const target = resolve(this, 'returnSubject');
      const subject = target.get();
      target.publish(subject);

      return subject;
    },
  };
}

function clearPreviousConfig(container: ReturnValueContainer): void {
  container._isRejectedPromise = false;
  container._isThrown = false;
  delete container.valuesPerCalls;
}

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

/** `nextWithPerCall`, written against `this` like the six above — see {@link observableHelpers}. */
function nextWithPerCallHelper<Self, T>(
  resolve: Resolve<Self, PerCallTarget>,
): { nextWithPerCall(this: Self, valueConfigsPerCall: ValueConfigPerCall<T>[]): ReplaySubject<T>[] } {
  return {
    nextWithPerCall(this: Self, valueConfigsPerCall: ValueConfigPerCall<T>[]): ReplaySubject<T>[] {
      const returnedSubjects: ReplaySubject<T>[] = [];

      if (valueConfigsPerCall.length === 0) {
        return returnedSubjects;
      }

      const target = resolve(this, 'nextWithPerCall');
      const valuesPerCalls: ReturnValueContainer['valuesPerCalls'] = [];
      valueConfigsPerCall.forEach((config) => {
        const replaySubject = createReplaySubject<T>();
        replaySubject.next(config.value);
        returnedSubjects.push(replaySubject);

        valuesPerCalls.push({ wrappedValue: buildPerCallObservable(replaySubject, config) });
      });
      clearPreviousConfig(target.container);
      target.container.valuesPerCalls = valuesPerCalls;

      target.configured();

      return returnedSubjects;
    },
  };
}

/**
 * A function spy's observable state: the subject handle and the spy's own return container, in one
 * object. Reached from `this` through the spy's mark, so it costs no property of its own on the
 * spy; `reset` — inherited — is what `resetAutoSpy` calls to drop the buffered subject.
 */
class SpyObservableState<T> extends ObservableTarget<T> implements ObservableStream, PerCallTarget {
  constructor(readonly container: ReturnValueContainer) {
    super();
  }

  publish(stream: Observable<T>): void {
    clearPreviousConfig(this.container);
    this.container.value = stream;
  }

  configured(): void {
    // The spy's own container is what its dispatch already reads; there is nothing to register.
  }
}

/** The observable state behind `this`, for a helper installed on a function spy. */
function spyObservableStateOf(self: unknown, helper: string): SpyObservableState<unknown> {
  const state = typeof self === 'function' || (typeof self === 'object' && self !== null) ? hooksOf(self)?.observable : undefined;

  if (state instanceof SpyObservableState) {
    return state;
  }

  throw detachedHelperError(helper);
}

/** One set for every function spy in the run — see {@link observableHelpers}. `@__PURE__` keeps it out of entries that build no spy. */
const SPY_OBSERVABLE_HELPERS = /* @__PURE__ */ Object.assign(
  /* @__PURE__ */ observableHelpers<unknown, unknown>(spyObservableStateOf),
  /* @__PURE__ */ nextWithPerCallHelper<unknown, unknown>(spyObservableStateOf),
);

export function addObservableHelpersToFunctionSpy(spyFunction: object, valueContainer: ReturnValueContainer): ObservableStream {
  decorate(spyFunction, SPY_OBSERVABLE_HELPERS);

  return new SpyObservableState(valueContainer);
}

/** A `calledWith` chain's observable target: its own container, registered for the chain's arguments once configured. */
class ChainObservableTarget<T> extends ObservableTarget<T> implements PerCallTarget {
  readonly container: ReturnValueContainer = { value: undefined };

  constructor(
    private readonly calledWithObject: CalledWithObject,
    private readonly calledWithArgs: unknown[],
  ) {
    super();
  }

  publish(stream: Observable<T>): void {
    clearPreviousConfig(this.container);
    this.container.value = stream;
    this.configured();
  }

  configured(): void {
    this.calledWithObject.argsToValuesMap.set(this.calledWithArgs, this.container);
  }
}

export function addObservableHelpersToCalledWithObject(calledWithObject: CalledWithObject, calledWithArgs: unknown[]): void {
  const target = new ChainObservableTarget<unknown>(calledWithObject, calledWithArgs);
  const resolve = (): ChainObservableTarget<unknown> => target;

  decorate(calledWithObject, {
    ...observableHelpers<CalledWithObject, unknown>(resolve),
    ...nextWithPerCallHelper<CalledWithObject, unknown>(resolve),
  });
}

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
/**
 * An observable prop's target: the currently-published stream. It starts as the backing subject,
 * but `nextWithValues` swaps in a merged observable; `defer` re-reads it on each subscription, so
 * late reconfiguration is honoured — and it re-reads the *subject* too, so a `nextWith` after a
 * `complete()` publishes the fresh subject rather than pushing into the closed one.
 */
class PropObservableTarget<T> extends ObservableTarget<T> {
  published$: Observable<T> = defer(() => this.get());

  publish(stream: Observable<T>): void {
    this.published$ = stream;
  }
}

export function createObservablePropSpy<T>(): AddObservableSpyMethods<T> & Observable<T> {
  const target = new PropObservableTarget<T>();
  // Read back as the plain `Observable<T>` it is at the type level: a prop spy carries the six
  // stream helpers but not `nextWithPerCall`, and the public type below claims the full set.
  const observableSpy: Observable<T> = decorate(
    defer(() => target.published$),
    observableHelpers<Observable<T>, T>(() => target),
  );

  // `observableHelpers` attaches the `AddObservableSpyMethods<T>` helpers onto the deferred
  // observable at runtime, as methods that read `this`; the assertion restates them as the
  // public interface, whose methods carry no `this` parameter.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the helpers are assembled at runtime via `decorate`; their `this`-typed signatures cannot be stated as the public interface without an assertion.
  return observableSpy as AddObservableSpyMethods<T> & Observable<T>;
}
