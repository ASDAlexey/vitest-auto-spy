/**
 * `jasmine.addMatchers` over `expect.extend`.
 *
 * A jasmine custom matcher is a factory, `(matchersUtil) => ({ compare, negativeCompare? })`, where
 * Vitest wants the comparing function itself. Each factory is wrapped into a Vitest matcher that
 * builds the jasmine matcher with a `matchersUtil` over the current `MatcherState`, runs `compare`
 * (or `negativeCompare` under `.not`) and translates the result. A matcher already written in
 * Vitest's shape is told apart by what it returns and passed through.
 */
import type { expect } from 'vitest';

type VitestMatchers = Parameters<typeof expect.extend>[0];
type VitestMatcher = VitestMatchers[string];
type MatcherState = ThisParameterType<VitestMatcher>;
type MatcherResult = ReturnType<VitestMatcher>;

/** A custom equality tester: `undefined` means "no opinion". jasmine's `(a, b) => …` form fits. */
export type JasmineCustomEqualityTester = MatcherState['customTesters'][number];

/** The `matchersUtil` jasmine hands a matcher factory. */
export interface JasmineMatchersUtil {
  equals(a: unknown, b: unknown, customTesters?: readonly JasmineCustomEqualityTester[]): boolean;
  contains(haystack: unknown, needle: unknown, customTesters?: readonly JasmineCustomEqualityTester[]): boolean;
  pp(value: unknown): string;
  buildFailureMessage(matcherName: string, isNot: boolean, actual: unknown, ...expected: unknown[]): string;
}

/** What jasmine's `compare` / `negativeCompare` return. */
export interface JasmineCustomMatcherResult {
  pass: boolean;
  message?: string | (() => string);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jasmine's own signature; a matcher narrows its arguments itself
type JasmineCompare = (actual: any, ...expected: any[]) => JasmineCustomMatcherResult;

/** The object a jasmine matcher factory builds. */
export interface JasmineCustomMatcher {
  compare: JasmineCompare;
  negativeCompare?: JasmineCompare;
}

/** A jasmine custom matcher, as `jasmine.addMatchers` receives it. */
export type JasmineCustomMatcherFactory = (
  matchersUtil: JasmineMatchersUtil,
  customEqualityTesters: readonly JasmineCustomEqualityTester[],
) => JasmineCustomMatcher;

/** What `jasmine.addMatchers` takes: matcher factories keyed by matcher name. */
export type JasmineCustomMatcherFactories = Record<string, JasmineCustomMatcherFactory>;

/** Either shape, called through `Function.prototype.call` before it is known which one it is. */
interface EitherMatcher {
  call(this: unknown, state: MatcherState, ...args: unknown[]): JasmineCustomMatcher | MatcherResult;
}

function isJasmineMatcher(value: unknown): value is JasmineCustomMatcher {
  return typeof value === 'object' && value !== null && typeof Reflect.get(value, 'compare') === 'function';
}

function matchersUtilFor(state: MatcherState): JasmineMatchersUtil {
  const util: JasmineMatchersUtil = {
    equals: (a, b, customTesters) => state.equals(a, b, customTesters ? [...customTesters] : state.customTesters),
    contains(haystack, needle, customTesters) {
      if (haystack instanceof Set) {
        return haystack.has(needle);
      }

      if (Array.isArray(haystack)) {
        return haystack.some((item) => util.equals(item, needle, customTesters));
      }

      return typeof haystack === 'string' && typeof needle === 'string' && haystack.includes(needle);
    },
    pp: (value) => state.utils.stringify(value),
    buildFailureMessage(matcherName, isNot, actual, ...expected) {
      const predicate = matcherName.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`);
      const tail = expected.map((value) => ` ${util.pp(value)}`).join(',');

      return `Expected ${util.pp(actual)}${isNot ? ' not ' : ' '}${predicate}${tail}.`;
    },
  };

  return util;
}

function runJasmineMatcher(
  state: MatcherState,
  name: string,
  matcher: JasmineCustomMatcher,
  received: unknown,
  expected: unknown[],
): MatcherResult {
  const negative = state.isNot ? matcher.negativeCompare : undefined;
  const result = (negative ?? matcher.compare)(received, ...expected);
  const { message } = result;

  return {
    pass: negative ? !result.pass : result.pass,
    message: (): string => {
      if (!message) {
        return matchersUtilFor(state).buildFailureMessage(name, state.isNot, received, ...expected);
      }

      return typeof message === 'function' ? message() : message;
    },
  };
}

function adaptMatcher(name: string, matcher: EitherMatcher): VitestMatcher {
  let isJasmine = false;

  return function (this: MatcherState, received: unknown, ...expected: unknown[]): MatcherResult {
    if (!isJasmine) {
      const produced = matcher.call(this, received, ...expected);

      if (!isJasmineMatcher(produced)) {
        return produced;
      }

      isJasmine = true;
    }

    const built = matcher.call(this, matchersUtilFor(this), this.customTesters);

    return isJasmineMatcher(built) ? runJasmineMatcher(this, name, built, received, expected) : built;
  };
}

/** Translate `jasmine.addMatchers` input into what `expect.extend` takes. */
export function toVitestMatchers(matchers: JasmineCustomMatcherFactories | VitestMatchers): VitestMatchers {
  return Object.fromEntries(Object.entries(matchers).map(([name, matcher]) => [name, adaptMatcher(name, matcher)]));
}
