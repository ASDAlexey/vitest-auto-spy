/**
 * `toHaveSignalValue` — assert the value behind a signal instead of the signal itself.
 *
 * `expect(component.total).toBeTruthy()` passes for every signal ever created (a signal is a
 * function), and `expect(component.total()).toBe(3)` loses the name in the failure output. The
 * matcher reads the signal, compares with the runner's own deep equality, and reports which signal
 * was wrong — while refusing anything that is not a zero-argument getter, so the "forgot the
 * parentheses" mistake fails instead of silently passing.
 *
 * A spy is refused without being read: it is callable and takes no argument, so the shape check
 * alone would let the matcher call it, pass on the `undefined` an unconfigured spy returns, and
 * leave a phantom call in the record for the next `toHaveBeenCalledTimes` to trip over.
 */
import { ɵSIGNAL } from '@angular/core';
import { expect } from 'vitest';

/** Anything readable like a signal: `signal()`, `computed()`, `input()`, or a plain getter. */
export type SignalLike<T> = () => T;

// Chai's `Assertion`, not Vitest's `Matchers`: `Matchers` is `<T>` on Vitest 4 and `<R, T>` on
// Vitest 5, and declaration merging demands an exact type-parameter match — this one merges on both.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Chai publishes `Assertion` inside a namespace; merging into it is the only way in.
  namespace Chai {
    interface Assertion {
      /** Read the signal under test and deep-compare its current value. */
      toHaveSignalValue(expected: unknown): void;
    }
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
 * Whether a callable is a spy rather than a signal or a getter.
 *
 * `mock` is on this library's spies and on every runner's own — Vitest, Jest, Bun and `node:test`;
 * `calls` is the jasmine surface, which a spy built through `/jasmine` carries instead.
 */
function isSpy(received: object): boolean {
  return 'mock' in received || 'calls' in received;
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
        throw new Error(`expected a signal (a zero-argument getter), received ${this.utils.printReceived(received)}`);
      }

      // Angular brands every signal it makes; a plain getter carries no brand, so a spy is what is
      // left to tell apart by shape — and the brand is per copy of `@angular/core`, hence the order.
      if (!(ɵSIGNAL in received) && isSpy(received)) {
        throw new Error(
          `expected a signal (a zero-argument getter), received a spy: ${this.utils.printReceived(received)}. Reading it would have recorded a call — put a real signal on the property with mockSignalProp(), or assert the spy itself.`,
        );
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
