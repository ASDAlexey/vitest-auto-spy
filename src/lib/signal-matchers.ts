/**
 * `toHaveSignalValue` — assert the value behind a signal instead of the signal itself.
 *
 * `expect(component.total).toBeTruthy()` passes for every signal ever created (a signal is a
 * function), and `expect(component.total()).toBe(3)` loses the name in the failure output. The
 * matcher reads the signal, compares with the runner's own deep equality, and reports which signal
 * was wrong — while refusing anything that is not a zero-argument getter, so the "forgot the
 * parentheses" mistake fails instead of silently passing.
 */
import { expect } from 'vitest';

/** Anything readable like a signal: `signal()`, `computed()`, `input()`, or a plain getter. */
export type SignalLike<T> = () => T;

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- declaration merging requires the type parameter list (defaults included) to match Vitest's own `interface Matchers<T = any>` exactly.
  interface Matchers<T = any> {
    /** Read the signal under test and deep-compare its current value. */
    toHaveSignalValue(expected: unknown): T;
  }
}

/** What a matcher hands back to the runner. */
interface MatcherResult {
  pass: boolean;
  message: () => string;
  actual?: unknown;
  expected?: unknown;
}

/**
 * Register {@link toHaveSignalValue} with the runner. Call once, from your setup file.
 *
 * @example
 * ```ts
 * registerSignalMatchers(); // once, in the setup file
 *
 * expect(component.total).toHaveSignalValue(3);
 * ```
 */
export function registerSignalMatchers(): void {
  expect.extend({
    toHaveSignalValue(received: unknown, expected: unknown): MatcherResult {
      if (typeof received !== 'function') {
        return {
          pass: false,
          message: (): string => `expected a signal (a zero-argument getter), received ${this.utils.printReceived(received)}`,
        };
      }

      const actual: unknown = received();
      const pass = this.equals(actual, expected);

      return {
        pass,
        actual,
        expected,
        message: (): string =>
          `expected signal ${pass ? 'not ' : ''}to have value ${this.utils.printExpected(expected)}, got ${this.utils.printReceived(actual)}`,
      };
    },
  });
}
