/**
 * `subscribeSpyTo` — the `@hirez_io/observer-spy` surface, for a suite that arrives carrying it.
 *
 * A `jasmine-auto-spies` suite almost always has this package beside it: the two are by the same
 * author, and observer-spy is the larger of the two by downloads. It was last published in 2022 and
 * its oldest open issue is from 2023, so a suite moving to Vitest has to bring it along or rewrite
 * every stream assertion at the same time as everything else. This is the smaller of those.
 *
 * **It is a bridge, and the destination is different in kind.** observer-spy is *synchronous
 * inspection*: subscribe, let things happen, then read the spy. The failure mode that design has is
 * silence — a stream that never emits produces a spy with no values, and a spec that reads
 * `getValues()` gets `[]` and asserts something about it, so the test passes having observed
 * nothing. `expectEmission` and friends invert that: the assertion *is* the await, and silence is a
 * failure with a watchdog rather than an empty array. Land the suite green on this, then move the
 * assertions over.
 *
 * Three deliberate departures from upstream, each closing a defect rather than adding a feature:
 *
 * - `getValues()` returns a **copy**. Upstream hands back its live internal array, so a spec that
 *   sorts or splices what it read corrupts the spy it is still reading.
 * - `getValues()` is typed `T[]`. Upstream types it `any[]` (its own issue #69), which silently
 *   turns every downstream inference in the assertion into `any`.
 * - `getFirstValue()` / `getValueAt(i)` **throw** when there is nothing there. Upstream types them
 *   `T` and returns `undefined`, which is the same lie this library refuses everywhere else — but
 *   the signature is kept, so a migrated spec still compiles.
 * - An **unexpected error** is thrown by the value readers rather than out of the subscription. See
 *   {@link ObserverSpy.error}: upstream's rethrow stopped reaching the subscriber in rxjs 7.
 */
import type { Observable, Subscription } from 'rxjs';

/** Upstream's one configuration flag. */
export interface ObserverSpyConfig {
  /**
   * Treat an error as an expected outcome, so reading the spy's values stays legal.
   *
   * Without it, an unexpected error is still recorded — but every *value* reader throws it, naming
   * it, at the line that asked. See the note on {@link ObserverSpy.error}.
   */
  expectErrors: boolean;
}

/** Nothing was emitted, and the caller asked for a value anyway. */
function noValue(what: string): Error {
  return new Error(
    `[vitest-auto-spy] ${what}, but the observable emitted nothing. ` +
      'Check `receivedNext()` first, read `getLastValue()` (which admits `undefined`), or await ' +
      '`expectEmission(source$)`, which fails with a timeout naming the stream instead of reading past its end.',
  );
}

/**
 * The recording observer — upstream's `ObserverSpy<T>`, usable as an `Observer<T>` anywhere rxjs
 * takes one.
 */
export class ObserverSpy<T> {
  #values: T[] = [];
  #error: unknown = undefined;
  #receivedError = false;
  #receivedComplete = false;
  #expectErrors: boolean;
  #onCompleteCallbacks: (() => void)[] = [];
  #onErrorCallbacks: (() => void)[] = [];

  constructor(config?: ObserverSpyConfig) {
    this.#expectErrors = config?.expectErrors ?? false;
  }

  next(value: T): void {
    this.#values.push(value);
  }

  /**
   * Record the error — and, when nothing said to expect one, arm every value reader to throw it.
   *
   * Upstream rethrows from here, and under rxjs 6 that surfaced at the subscription. It cannot any
   * more: rxjs 7 routes anything thrown out of an observer callback through `reportUnhandledError`,
   * which reports it *asynchronously*, so the throw no longer reaches the line that subscribed —
   * `expect(() => subscribeSpyTo(failing$)).toThrow()` does not see it, and Vitest reports an
   * unhandled error attributed to the file rather than to the assertion. Loud, and unattributable.
   *
   * Deferring it to the readers keeps the loudness and puts it back where it can be read: a spec
   * that forgot `{ expectErrors: true }` fails at `getValues()` with the original error, and one
   * that meant to assert on the failure reads `getError()` as before.
   */
  error(errorValue: unknown): void {
    this.#error = errorValue;
    this.#receivedError = true;
    this.#onErrorCallbacks.splice(0).forEach((resolve) => resolve());
  }

  /** Throw the recorded error when nothing declared it expected. Guards the value readers only. */
  #assertNoUnexpectedError(): void {
    if (this.#receivedError && !this.#expectErrors) {
      throw new Error(
        `[vitest-auto-spy] the observable errored, and this spy was not configured to expect that: ${String(this.#error)}. ` +
          'Pass `{ expectErrors: true }` to subscribeSpyTo (or call `.expectErrors()`) and read `getError()`, ' +
          'or await `expectError(source$)`, which resolves with the error itself.',
        { cause: this.#error },
      );
    }
  }

  complete(): void {
    this.#receivedComplete = true;
    this.#onCompleteCallbacks.splice(0).forEach((resolve) => resolve());
  }

  /** Record errors rather than rethrowing them, after construction. Chainable, as upstream's is. */
  expectErrors(): this {
    this.#expectErrors = true;

    return this;
  }

  /** Resolves (or invokes `callback`) when the stream completes — immediately if it already has. */
  onComplete(): Promise<void>;
  onComplete(callback: () => void): void;
  onComplete(callback?: () => void): Promise<void> | void {
    return this.#settle(this.#receivedComplete, this.#onCompleteCallbacks, callback);
  }

  /** Resolves when the stream errors — immediately if it already has. */
  onError(): Promise<void>;
  onError(callback: () => void): void;
  onError(callback?: () => void): Promise<void> | void {
    return this.#settle(this.#receivedError, this.#onErrorCallbacks, callback);
  }

  /** Shared by {@link onComplete} and {@link onError}: run now if it already happened, else queue. */
  #settle(alreadyHappened: boolean, queue: (() => void)[], callback?: () => void): Promise<void> | void {
    if (callback) {
      if (alreadyHappened) {
        callback();
      } else {
        queue.push(callback);
      }

      return undefined;
    }

    return alreadyHappened ? Promise.resolve() : new Promise<void>((resolve) => queue.push(resolve));
  }

  getValuesLength(): number {
    this.#assertNoUnexpectedError();

    return this.#values.length;
  }

  /** Every value emitted so far — a copy, so sorting or splicing it cannot corrupt the spy. */
  getValues(): T[] {
    this.#assertNoUnexpectedError();

    return [...this.#values];
  }

  /** The value at `index`. Throws rather than returning `undefined` past the end. */
  getValueAt(index: number): T {
    this.#assertNoUnexpectedError();

    if (index < 0 || index >= this.#values.length) {
      throw noValue(`getValueAt(${index}) was asked for value ${index}`);
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `noUncheckedIndexedAccess` widens every index read to `T | undefined`; the bounds check above has already ruled that out, and narrowing on the value instead would throw for a stream that legitimately emitted `undefined`.
    return this.#values[index] as T;
  }

  /** The first value. Throws when there is none — see the note at the top of this module. */
  getFirstValue(): T {
    this.#assertNoUnexpectedError();

    if (this.#values.length === 0) {
      throw noValue('getFirstValue() was called');
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see `getValueAt`: the emptiness check above is the narrowing, and a stream may legitimately emit `undefined`.
    return this.#values[0] as T;
  }

  /** The last value, or `undefined` — the one reader upstream already types honestly. */
  getLastValue(): T | undefined {
    this.#assertNoUnexpectedError();

    return this.#values[this.#values.length - 1];
  }

  getError(): unknown {
    return this.#error;
  }

  receivedNext(): boolean {
    this.#assertNoUnexpectedError();

    return this.#values.length > 0;
  }

  receivedError(): boolean {
    return this.#receivedError;
  }

  receivedComplete(): boolean {
    return this.#receivedComplete;
  }
}

/** An {@link ObserverSpy} that owns its subscription — what {@link subscribeSpyTo} hands back. */
export class SubscriberSpy<T> extends ObserverSpy<T> {
  readonly subscription: Subscription;

  constructor(observableUnderTest: Observable<T>, config?: ObserverSpyConfig) {
    super(config);
    this.subscription = observableUnderTest.subscribe({
      next: (value: T) => {
        this.next(value);
      },
      error: (error: unknown) => {
        this.error(error);
      },
      complete: () => {
        this.complete();
      },
    });
  }

  unsubscribe(): void {
    this.subscription.unsubscribe();
  }

  /**
   * Unsubscribe at the end of a `using` block.
   *
   * This is what `autoUnsubscribe()` exists for upstream — a global `afterEach` that tears down
   * every spy the file created. `using` scopes it to the block that made it instead, so there is no
   * setup file to remember and no registry that has to be right.
   */
  [Symbol.dispose](): void {
    this.unsubscribe();
  }
}

/**
 * Subscribe to `observableUnderTest` and record everything it does.
 *
 * ```ts
 * const spy = subscribeSpyTo(service.load());
 *
 * expect(spy.getValues()).toEqual(['a', 'b']);
 * expect(spy.receivedComplete()).toBe(true);
 * ```
 *
 * The subscription is live until `unsubscribe()`, or until the end of a `using` block. Prefer
 * `expectEmission(source$)` / `expectEmissions(source$, n)` in new specs: they fail on silence,
 * which this cannot.
 */
export function subscribeSpyTo<T>(observableUnderTest: Observable<T>, config?: ObserverSpyConfig): SubscriberSpy<T> {
  return new SubscriberSpy<T>(observableUnderTest, config);
}
