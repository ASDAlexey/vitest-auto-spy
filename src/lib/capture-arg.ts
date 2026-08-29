/**
 * `captureArg` — take hold of an argument the code under test passed, instead of describing it.
 *
 * `expect.any(Function)` and `expect.objectContaining({…})` answer *what kind of thing* was passed.
 * That is enough for a value the test already knows, and it is not enough for the case this exists
 * for: a callback, a config object, an `AbortSignal` — something the code under test *constructed*,
 * where the assertion worth making is not "a function was passed" but "call the function that was
 * passed and see what it does".
 *
 * Written out by hand that is a reach into `mock.calls`, by index, into a tuple position, with a
 * cast at the end because `mock.calls` is `unknown[][]` at the boundary — four chances to be wrong
 * about a call that has already happened. A captor is the same reach, typed, and it reads at the
 * assertion rather than after it:
 *
 * ```ts
 * const onDone = captureArg<() => void>();
 *
 * expect(spy.subscribe).toHaveBeenCalledWith('ready', onDone);
 *
 * onDone.value();                       // and now exercise it
 * expect(component.finished()).toBe(true);
 * ```
 *
 * Mechanically it is an asymmetric matcher — an object with `asymmetricMatch` that records and
 * returns `true` — so the runner's own `toHaveBeenCalledWith` family consults it with no new
 * machinery anywhere, on Vitest, Bun and `node:test` alike; nothing here touches a runner API.
 *
 * It belongs in an **assertion**, not in a `calledWith` configuration, and the types enforce that.
 * A captor matches every value, so `spy.load.calledWith(captor)` would configure a return for every
 * call — which is `mockReturnValue`, spelled less clearly. `calledWith` is typed to the method's own
 * parameters, so that line does not compile in the first place.
 */
import { DOCS_LINKS, withDocs } from './docs-links';

/** A captor: matches any argument in its position, and keeps what it saw. */
export interface ArgCaptor<T> {
  /**
   * Every value this captor has matched, oldest first.
   *
   * A captor placed in an assertion that runs against several calls collects one entry per call,
   * which is the difference between "the last handler" and "the handler from the second call".
   */
  readonly values: readonly T[];
  /** The most recent captured value. Throws when nothing has been captured yet. */
  readonly value: T;
  /** Whether anything has been captured — for asserting the negative without triggering the throw. */
  readonly captured: boolean;
  /** Forget everything seen so far, so one captor can serve two phases of a test. */
  reset(): void;
  /** The asymmetric-matcher hook. Records the value and always matches. */
  asymmetricMatch(actual: unknown): boolean;
  /** What the runner prints for this captor inside a diff. */
  toString(): string;
  /** What Vitest's pretty-format prints for it. */
  toAsymmetricMatcher(): string;
}

/**
 * Create a captor for one argument position.
 *
 * ```ts
 * const config = captureArg<RequestInit>();
 *
 * await service.save(payload);
 *
 * expect(fetchSpy).toHaveBeenCalledWith('/api/save', config);
 * expect(config.value.method).toBe('POST');
 * expect(JSON.parse(String(config.value.body))).toEqual(payload);
 * ```
 *
 * A captor matches **anything** in its position — that is the trade. It is the right tool when the
 * value is one the test could not have written down, and the wrong one when it could: prefer the
 * literal, or `expect.objectContaining`, whenever the assertion can state what it expects, because
 * a captor that matches everything moves the check from the expectation to the lines after it.
 *
 * @typeParam T What the captured argument is. Unchecked at run time — a captor matches any value —
 *   so this is the test author's claim about the position, exactly like a cast at `mock.calls`, but
 *   made once and read everywhere the captor is used.
 */
/**
 * The captor itself.
 *
 * A class rather than an object literal for one load-bearing reason: accessors declared in a
 * literal are **enumerable own properties**, and the runner walks those when it serialises the
 * expected side of a failed assertion — which called `value` on a captor that had matched nothing
 * and turned a readable assertion failure into this helper's own throw. On a class the accessors
 * live on the prototype and are not enumerable, so a captor can be printed, diffed and logged
 * without being read.
 */
class Captor<T> implements ArgCaptor<T> {
  readonly #values: T[] = [];
  // The last capture, boxed. `#values[#values.length - 1]` is `T | undefined` to the compiler no
  // matter what the length guard above it proved, and the two ways out of that are a non-null
  // assertion or this — a box that narrows honestly, for one object per captured argument.
  #latest: { value: T } | undefined = undefined;

  get values(): readonly T[] {
    return this.#values;
  }

  get value(): T {
    // The box, not `length === 0`: capturing an actual `undefined` argument is a real thing a spec
    // asserts about, and it is not the same as never having matched.
    if (this.#latest === undefined) {
      throw new Error(
        withDocs(
          '[vitest-auto-spy] captureArg: nothing was captured, so there is no value to read. A captor only records ' +
            'while it is being matched — put it in the expectation first (`expect(spy.method).toHaveBeenCalledWith(captor)`) ' +
            'and read `.value` after. If the expectation did run, then the call it describes never happened, and that ' +
            'assertion is the one to look at.',
          DOCS_LINKS.controlHelpers,
        ),
      );
    }

    return this.#latest.value;
  }

  get captured(): boolean {
    return this.#values.length > 0;
  }

  reset(): void {
    this.#values.length = 0;
    this.#latest = undefined;
  }

  asymmetricMatch(actual: unknown): boolean {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `T` is the test author's claim about this argument position, not something a captor can check: it matches every value by design, and the alternative is the same assertion made at every `.value` read instead of once here.
    const captured = actual as T;

    this.#values.push(captured);
    this.#latest = { value: captured };

    return true;
  }

  toString(): string {
    return 'captureArg';
  }

  toAsymmetricMatcher(): string {
    return `captureArg<${this.#values.length} captured>`;
  }
}

/**
 * Create a captor for one argument position.
 *
 * ```ts
 * const config = captureArg<RequestInit>();
 *
 * await service.save(payload);
 *
 * expect(fetchSpy).toHaveBeenCalledWith('/api/save', config);
 * expect(config.value.method).toBe('POST');
 * expect(JSON.parse(String(config.value.body))).toEqual(payload);
 * ```
 *
 * A captor matches **anything** in its position — that is the trade. It is the right tool when the
 * value is one the test could not have written down, and the wrong one when it could: prefer the
 * literal, or `expect.objectContaining`, whenever the assertion can state what it expects, because
 * a captor that matches everything moves the check from the expectation to the lines after it.
 *
 * @typeParam T What the captured argument is. Unchecked at run time — a captor matches any value —
 *   so this is the test author's claim about the position, exactly like a cast at `mock.calls`, but
 *   made once and read everywhere the captor is used.
 */
export function captureArg<T = unknown>(): ArgCaptor<T> {
  return new Captor<T>();
}
