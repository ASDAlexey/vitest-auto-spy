/**
 * The `jasmine` global, as an import.
 *
 * A jasmine suite reaches for `jasmine.objectContaining(…)`, `jasmine.any(String)`,
 * `jasmine.createSpyObj(…)` and `jasmine.clock().tick(…)` in files that have nothing to do with
 * auto-spies, and under Vitest every one of them is a `ReferenceError`. Rewriting them is the right
 * end state and the codemod does it — but a suite of two thousand specs has to *run* before anyone
 * can tell whether the rewrite was correct.
 *
 * So: one import restores the whole namespace.
 *
 * ```ts
 * import { jasmine } from 'vitest-auto-spy/jasmine';
 * ```
 *
 * Nothing here is a reimplementation. Each member forwards to the Vitest primitive that means the
 * same thing, and the members with no Vitest twin forward to this package's own
 * ({@link jasmine-matchers}, {@link jasmine-factories}). What it deliberately does *not* do is
 * install itself on `globalThis`: a global that appears because something imported a library is
 * exactly the kind of action-at-a-distance that makes a migration hard to reason about, and an
 * explicit import is one line per file that the codemod later deletes.
 */
import { expect, vi } from 'vitest';

import { createFunctionSpy, createSpyObj } from './jasmine-factories';
import { registerJasmineMatchers } from './jasmine-matchers';
import { getMockAdapter } from './mock-adapter';
import type { Func } from './types';

/** Register the matchers on first use, so a migrating suite needs no setup call. */
function matcher<Args extends unknown[]>(build: (...args: Args) => unknown): (...args: Args) => unknown {
  return (...args: Args): unknown => {
    registerJasmineMatchers();

    return build(...args);
  };
}

/** jasmine's `clock()` handle, over Vitest's fake timers. */
export interface JasmineClock {
  install(): JasmineClock;
  uninstall(): void;
  /**
   * Advance the fake clock synchronously, as jasmine does.
   *
   * A promise that a timer resolves is *not* settled by this — jasmine has the same limitation.
   * `advanceTimers(ms)` from the core entry awaits the microtask queue as well, and is what a spec
   * that awaits something after ticking actually wants.
   */
  tick(ms: number): void;
  mockDate(date?: Date): void;
  withMock(body: () => void): void;
}

const clockHandle: JasmineClock = {
  install(): JasmineClock {
    vi.useFakeTimers();

    return clockHandle;
  },
  uninstall(): void {
    vi.useRealTimers();
  },
  tick(ms: number): void {
    vi.advanceTimersByTime(ms);
  },
  mockDate(date?: Date): void {
    vi.setSystemTime(date ?? new Date());
  },
  withMock(body: () => void): void {
    vi.useFakeTimers();

    try {
      body();
    } finally {
      vi.useRealTimers();
    }
  },
};

let warnedAboutTimeout = false;

/**
 * `jasmine.DEFAULT_TIMEOUT_INTERVAL` — readable, and writable with a warning.
 *
 * There is nothing to assign to. Vitest's equivalent is configuration (`testTimeout`, and the
 * separate `hookTimeout` that defaults to a different number), read once when the run starts, so a
 * statement in a `beforeEach` cannot change it. Silently swallowing the write would leave a suite
 * believing it had raised its timeout; throwing would stop a suite that is otherwise fine. It warns,
 * once, naming the two settings.
 */
function warnAboutTimeoutInterval(): void {
  if (warnedAboutTimeout) {
    return;
  }

  warnedAboutTimeout = true;

  // eslint-disable-next-line no-console -- a dev-time misconfiguration warning, the same class as the ones in `create-spy-from-class.ts`.
  console.warn(
    '[vitest-auto-spy] jasmine.DEFAULT_TIMEOUT_INTERVAL has no runtime equivalent under Vitest and was ignored. ' +
      'Set `test.testTimeout` in your Vitest config instead — and `test.hookTimeout` too, which is a separate ' +
      'setting with its own default, and is what a slow beforeEach actually trips.',
  );
}

/** Reset the warn-once latch. Internal — for the spec that proves it latches. */
export function resetTimeoutIntervalWarning(): void {
  warnedAboutTimeout = false;
}

/** jasmine's default, reported unchanged so a spec that reads it still reads a number. */
const DEFAULT_TIMEOUT_INTERVAL = 5000;

/**
 * A spy under jasmine's own factory name.
 *
 * jasmine's second argument is the function `.and.callThrough()` should call. An auto-spy has no
 * original, so `callThrough` normally restores this library's dispatch; when an original is given
 * here, it restores that instead — which is what the two-argument form means.
 */
function createSpy(name = 'unknown', originalFn?: Func): ReturnType<typeof createFunctionSpy<Func>> {
  const spy = createFunctionSpy<Func>(name);

  if (originalFn) {
    const and: unknown = Reflect.get(spy, 'and');

    if (typeof and === 'object' && and !== null) {
      Reflect.set(and, 'callThrough', (): unknown => {
        getMockAdapter().restoreImplementation(spy, originalFn);

        return spy;
      });
    }
  }

  return spy;
}

/**
 * The `jasmine` namespace, as an importable object.
 *
 * Every member either forwards to its Vitest twin or, where there is none, to this package's own
 * implementation. Four of jasmine's members are deliberately absent, because forwarding them would
 * be a lie: `getEnv()` (Vitest's ordering and bail are config, not a runtime environment),
 * `addCustomObjectFormatter` (snapshot serializers are a different mechanism with different rules),
 * `addSpy`/`pp` (jasmine internals), and `Spy` / `SpyObj` as *values* — those are types, and they
 * are exported as types from `vitest-auto-spy/jasmine`.
 */
export const jasmine = {
  // Matchers with an exact `expect.*` twin — forwarded verbatim.
  any: (constructor: unknown): unknown => expect.any(constructor),
  anything: (): unknown => expect.anything(),
  objectContaining: (sample: Record<string, unknown>): unknown => expect.objectContaining(sample),
  arrayContaining: (sample: unknown[]): unknown => expect.arrayContaining(sample),
  stringMatching: (sample: RegExp | string): unknown => expect.stringMatching(sample),
  stringContaining: (sample: string): unknown => expect.stringContaining(sample),

  // Matchers Vitest does not have — see `jasmine-matchers.ts`.
  truthy: matcher(() => expect.jasmineTruthy()),
  falsy: matcher(() => expect.jasmineFalsy()),
  empty: matcher(() => expect.jasmineEmpty()),
  notEmpty: matcher(() => expect.jasmineNotEmpty()),
  is: matcher((sample: unknown) => expect.jasmineIs(sample)),
  mapContaining: matcher((sample: Map<unknown, unknown>) => expect.jasmineMapContaining(sample)),
  setContaining: matcher((sample: Set<unknown>) => expect.jasmineSetContaining(sample)),
  arrayWithExactContents: matcher((sample: unknown[]) => expect.jasmineArrayWithExactContents(sample)),

  // Spy factories.
  createSpy,
  createSpyObj,

  // Timers.
  clock: (): JasmineClock => clockHandle,

  // Matcher registration.
  addMatchers: (matchers: Parameters<typeof expect.extend>[0]): void => {
    expect.extend(matchers);
  },
  addCustomEqualityTester: (tester: Parameters<typeof expect.addEqualityTesters>[0][number]): void => {
    expect.addEqualityTesters([tester]);
  },

  get DEFAULT_TIMEOUT_INTERVAL(): number {
    return DEFAULT_TIMEOUT_INTERVAL;
  },

  set DEFAULT_TIMEOUT_INTERVAL(_value: number) {
    warnAboutTimeoutInterval();
  },
};
