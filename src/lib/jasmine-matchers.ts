/**
 * The eight asymmetric matchers jasmine has and Vitest does not.
 *
 * `jasmine.any`, `anything`, `objectContaining`, `arrayContaining`, `stringMatching` and
 * `stringContaining` all have `expect.*` twins, so a migrating suite renames them and moves on.
 * These eight have no twin, and there is no workaround that keeps the assertion readable: an
 * asymmetric matcher is the only thing that can stand *inside* `objectContaining({ … })` or
 * `toHaveBeenCalledWith(…)`, and `expect(x).toBeTruthy()` cannot go there.
 *
 * **Why the registered names are prefixed.** Three of jasmine's names — `empty`, `is`, and the
 * `not`/`any`/`all` family around them — are already taken on Vitest's assertion object: chai
 * publishes `.empty` as a *getter* and `.is` as a language chain, so `expect.extend({ empty })`
 * fails outright with `Cannot set property empty of #<Assertion> which has only a getter`. Each
 * matcher is therefore registered under a `jasmine`-prefixed name and republished under jasmine's
 * own name by the {@link jasmine-global} namespace, which is where a migrating suite reads it.
 */
import { expect } from 'vitest';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- declaration merging requires the type parameter list (defaults included) to match Vitest's own `interface Matchers<T = any>` exactly.
  interface Matchers<T = any> {
    /** See {@link AsymmetricMatchersContaining.jasmineTruthy}. */
    jasmineTruthy(): T;
    /** See {@link AsymmetricMatchersContaining.jasmineFalsy}. */
    jasmineFalsy(): T;
    /** See {@link AsymmetricMatchersContaining.jasmineEmpty}. */
    jasmineEmpty(): T;
    /** See {@link AsymmetricMatchersContaining.jasmineNotEmpty}. */
    jasmineNotEmpty(): T;
    /** See {@link AsymmetricMatchersContaining.jasmineIs}. */
    jasmineIs(sample: unknown): T;
    /** See {@link AsymmetricMatchersContaining.jasmineMapContaining}. */
    jasmineMapContaining(sample: Map<unknown, unknown>): T;
    /** See {@link AsymmetricMatchersContaining.jasmineSetContaining}. */
    jasmineSetContaining(sample: Set<unknown>): T;
    /** See {@link AsymmetricMatchersContaining.jasmineArrayWithExactContents}. */
    jasmineArrayWithExactContents(sample: unknown[]): T;
  }

  interface AsymmetricMatchersContaining {
    /** jasmine's `jasmine.truthy()` — any value that is loosely true. */
    jasmineTruthy(): unknown;
    /** jasmine's `jasmine.falsy()` — any value that is loosely false. */
    jasmineFalsy(): unknown;
    /** jasmine's `jasmine.empty()` — `''`, `[]`, `{}`, an empty `Map` or an empty `Set`. */
    jasmineEmpty(): unknown;
    /** jasmine's `jasmine.notEmpty()` — anything {@link AsymmetricMatchersContaining.jasmineEmpty} rejects. */
    jasmineNotEmpty(): unknown;
    /** jasmine's `jasmine.is(sample)` — reference identity, where every other matcher deep-compares. */
    jasmineIs(sample: unknown): unknown;
    /** jasmine's `jasmine.mapContaining(sample)` — a `Map` holding at least these entries. */
    jasmineMapContaining(sample: Map<unknown, unknown>): unknown;
    /** jasmine's `jasmine.setContaining(sample)` — a `Set` holding at least these members. */
    jasmineSetContaining(sample: Set<unknown>): unknown;
    /** jasmine's `jasmine.arrayWithExactContents(sample)` — the same members, in any order. */
    jasmineArrayWithExactContents(sample: unknown[]): unknown;
  }
}

/** What a matcher hands back to the runner. */
interface MatcherResult {
  pass: boolean;
  message: () => string;
}

/** How the runner compares two values, threaded through so custom equality testers still apply. */
type Equals = (a: unknown, b: unknown) => boolean;

/** Whether a value is "empty" in jasmine's sense. */
function isEmpty(value: unknown): boolean {
  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length === 0;
  }

  if (value instanceof Map || value instanceof Set) {
    return value.size === 0;
  }

  if (typeof value === 'object' && value !== null) {
    return Object.keys(value).length === 0;
  }

  return false;
}

/** Whether every entry of `sample` appears in `received`, comparing values with the runner's equality. */
function mapContains(received: Map<unknown, unknown>, sample: Map<unknown, unknown>, equals: Equals): boolean {
  for (const [key, value] of sample) {
    if (!received.has(key) || !equals(received.get(key), value)) {
      return false;
    }
  }

  return true;
}

/** Whether every member of `sample` appears in `received` — by equality, not by reference. */
function setContains(received: Set<unknown>, sample: Set<unknown>, equals: Equals): boolean {
  const members = [...received];

  return [...sample].every((wanted) => members.some((member) => equals(member, wanted)));
}

/**
 * Whether the two arrays hold the same members in any order, duplicates counted.
 *
 * Each match consumes its counterpart, so `['a', 'a']` does not satisfy `['a', 'b']` by matching
 * `'a'` twice — which is what makes this "exact contents" rather than "contains everything".
 */
function hasExactContents(received: unknown[], sample: unknown[], equals: Equals): boolean {
  if (received.length !== sample.length) {
    return false;
  }

  const remaining = [...received];

  return sample.every((wanted) => {
    const index = remaining.findIndex((candidate) => equals(candidate, wanted));

    if (index === -1) {
      return false;
    }

    remaining.splice(index, 1);

    return true;
  });
}

/** Build the standard "expected … to be …" message for a matcher that took no argument. */
function describeAs(pass: boolean, printed: string, description: string): () => string {
  return (): string => `expected ${printed} ${pass ? 'not ' : ''}to be ${description}`;
}

let registered = false;

/**
 * Register jasmine's eight orphan asymmetric matchers with the runner.
 *
 * Called for you the first time anything on the `jasmine` namespace is used, so a migrating suite
 * needs no setup step; exported because `expect.jasmineEmpty()` and friends are usable directly, and
 * a suite that only wants those should be able to ask for them. Idempotent.
 */
export function registerJasmineMatchers(): void {
  if (registered) {
    return;
  }

  registered = true;
  registerValueMatchers();
  registerCollectionMatchers();
}

/** The four that ask a question about one value. */
function registerValueMatchers(): void {
  expect.extend({
    jasmineTruthy(received: unknown): MatcherResult {
      const pass = Boolean(received);

      return { pass, message: describeAs(pass, this.utils.printReceived(received), 'truthy') };
    },

    jasmineFalsy(received: unknown): MatcherResult {
      const pass = !received;

      return { pass, message: describeAs(pass, this.utils.printReceived(received), 'falsy') };
    },

    jasmineEmpty(received: unknown): MatcherResult {
      const pass = isEmpty(received);

      return { pass, message: describeAs(pass, this.utils.printReceived(received), 'empty') };
    },

    jasmineNotEmpty(received: unknown): MatcherResult {
      const pass = !isEmpty(received);

      return { pass, message: describeAs(pass, this.utils.printReceived(received), 'non-empty') };
    },

    jasmineIs(received: unknown, sample: unknown): MatcherResult {
      const pass = Object.is(received, sample);

      return {
        pass,
        message: (): string =>
          `expected ${this.utils.printReceived(received)} ${pass ? 'not ' : ''}to be the same reference as ` +
          this.utils.printExpected(sample),
      };
    },
  });
}

/** The three that compare a collection against a sample. */
function registerCollectionMatchers(): void {
  expect.extend({
    jasmineMapContaining(received: unknown, sample: Map<unknown, unknown>): MatcherResult {
      const pass = received instanceof Map && mapContains(received, sample, this.equals.bind(this));

      return {
        pass,
        message: (): string =>
          `expected ${this.utils.printReceived(received)} ${pass ? 'not ' : ''}to be a Map containing ` + this.utils.printExpected(sample),
      };
    },

    jasmineSetContaining(received: unknown, sample: Set<unknown>): MatcherResult {
      const pass = received instanceof Set && setContains(received, sample, this.equals.bind(this));

      return {
        pass,
        message: (): string =>
          `expected ${this.utils.printReceived(received)} ${pass ? 'not ' : ''}to be a Set containing ` + this.utils.printExpected(sample),
      };
    },

    jasmineArrayWithExactContents(received: unknown, sample: unknown[]): MatcherResult {
      const pass = Array.isArray(received) && hasExactContents(received, sample, this.equals.bind(this));

      return {
        pass,
        message: (): string =>
          `expected ${this.utils.printReceived(received)} ${pass ? 'not ' : ''}to hold exactly the members of ` +
          this.utils.printExpected(sample),
      };
    },
  });
}

/** Undo {@link registerJasmineMatchers}'s idempotence latch. Internal — for the spec that proves it latches. */
export function resetJasmineMatchers(): void {
  registered = false;
}
