/**
 * Type-level tests for the `/setup` entry's option surfaces — the slice a setup file writes once
 * and then trusts.
 *
 * The options here are mostly literal unions and small record shapes, which is exactly what a
 * silent widening eats: `preset: 'loose'` compiling means every grade word compiles, an option
 * object accepting an unknown key means a misspelling survives, and a handler parameter widened
 * off its record turns a typo into `undefined` at runtime. None of that fails a runtime test —
 * `setupAutoSpy({ strayTimer: true })` runs green and does nothing — so the unions and the record
 * shapes are pinned instead.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { type OutsideHookReaction, type UnstubbedCall, type UnstubbedCallHandler } from '../auto-spy';
// `/setup` reads a global the `/console` entry declares; this program has to see the declaration too.
import type {} from '../console';
import type { WebStorageKey } from '../dom-stubs';
import {
  type SetupAutoSpyPreset,
  type StorageSpyKey,
  type StrayListener,
  type StrayListenerReport,
  type StrayTimerReport,
  advanceTimers,
  blockNetwork,
  countStrayListeners,
  countStrayRejections,
  countStrayTimers,
  mockNow,
  removeStrayListeners,
  restoreGlobals,
  restoreStorageSpies,
  restoreWebStorage,
  setupAutoSpy,
  setupFakeTimers,
  useCountingClock,
  withSystemTime,
} from '../setup';

describe('setupAutoSpy grades', () => {
  it('offers exactly one preset, and the grade is not free text', () => {
    expectTypeOf<SetupAutoSpyPreset>().toEqualTypeOf<'strict'>();

    setupAutoSpy();
    setupAutoSpy({ preset: 'strict' });

    // @ts-expect-error -- 'strict' is the only grade there is
    setupAutoSpy({ preset: 'loose' });
  });

  it('rejects an option it does not know', () => {
    // A misspelling here leaves the real option at its default with nothing said — the failure
    // these pins exist for.
    // @ts-expect-error -- no such option; the clock one is `globalFakeTimers`
    setupAutoSpy({ fakeTimersGlobally: true });
  });
});

describe('the clock options', () => {
  it('narrows the fakes to a list of timer names, and keeps them between tests on request only', () => {
    setupFakeTimers({ toFake: ['setTimeout', 'Date'] });
    setupFakeTimers(undefined, { betweenTests: true });

    // @ts-expect-error -- `toFake` is the list of names to fake, not one name
    setupFakeTimers({ toFake: 'Date' });
    // @ts-expect-error -- between tests is a switch
    setupFakeTimers(undefined, { betweenTests: 'yes' });
  });

  it('advances by milliseconds and awaits what the timers scheduled', () => {
    expectTypeOf(advanceTimers(300)).toEqualTypeOf<Promise<void>>();
    expectTypeOf(advanceTimers()).toEqualTypeOf<Promise<void>>();

    // @ts-expect-error -- a duration is a number of milliseconds
    advanceTimers('300');
  });

  it('feeds mockNow a source of the time, not a time', () => {
    mockNow(() => 1);

    // @ts-expect-error -- it takes what Date.now should say, as a function
    mockNow(1);
    // @ts-expect-error -- the clock answers numbers
    mockNow(() => '1');
  });

  it("freezes the clock for a body, at a Date, a number or a string, and keeps the body's type", () => {
    expectTypeOf(withSystemTime('2025-04-30T00:00:00Z', async () => 42)).toEqualTypeOf<Promise<number>>();
    expectTypeOf(withSystemTime(0, () => 'kept')).toEqualTypeOf<Promise<string>>();

    // @ts-expect-error -- null is not a time
    withSystemTime(null, () => 1);
    // @ts-expect-error -- the body is the code to run under the frozen clock
    withSystemTime(0, 42);
  });

  it('counts from a start by a step, both numbers', () => {
    const clock = useCountingClock({ start: 10, step: 5 });

    expectTypeOf(clock.value).toEqualTypeOf<number>();
    expectTypeOf(clock.reset()).toBeVoid();

    // @ts-expect-error -- the first value is a number
    useCountingClock({ start: '10' });
    // @ts-expect-error -- the step is called `step`
    useCountingClock({ tick: 5 });
  });
});

describe('blockNetwork', () => {
  it('blocks everything by default, or names the channels and how', () => {
    blockNetwork();
    blockNetwork({ fetch: false, xhr: 'empty', beacon: false });
    setupAutoSpy({ blockNetwork: true });
    setupAutoSpy({ blockNetwork: { xhr: 'empty' } });

    // @ts-expect-error -- xhr fails or answers empty; it does not pretend
    blockNetwork({ xhr: 'stub' });
    // @ts-expect-error -- fetch is blocked or not
    blockNetwork({ fetch: 'no' });
    // @ts-expect-error -- no such channel
    blockNetwork({ websocket: true });
    // @ts-expect-error -- through setupAutoSpy the same union applies
    setupAutoSpy({ blockNetwork: { xhr: 'silently' } });
  });
});

describe('the reactions', () => {
  it('propsOutsideHooks is one of three words', () => {
    expectTypeOf<OutsideHookReaction>().toEqualTypeOf<'off' | 'throw' | 'warn'>();

    setupAutoSpy({ propsOutsideHooks: 'throw' });

    // @ts-expect-error -- the reaction is off, warn or throw
    setupAutoSpy({ propsOutsideHooks: 'explode' });
  });

  it('onUnstubbedCall receives the class, the method and the arguments', () => {
    setupAutoSpy({
      onUnstubbedCall: (call) => {
        expectTypeOf(call).toEqualTypeOf<UnstubbedCall>();
        expectTypeOf(call.className).toEqualTypeOf<string | undefined>();
        expectTypeOf(call.method).toEqualTypeOf<string>();
        expectTypeOf(call.args).toEqualTypeOf<unknown[]>();

        return call.method.length;
      },
    });

    expectTypeOf<UnstubbedCallHandler>().parameters.items.toEqualTypeOf<UnstubbedCall>();

    // @ts-expect-error -- the call is class, method and arguments — there is no status code
    setupAutoSpy({ onUnstubbedCall: (call) => call.statusCode });
  });
});

describe('the file-boundary repairs', () => {
  it('are switches, and the listener report carries the count and each origin', () => {
    setupAutoSpy({ restoreStorageSpies: false, strayListeners: true, restoreGlobals: true });
    setupAutoSpy({
      strayListeners: true,
      onStrayListeners: (report) => {
        expectTypeOf(report).toEqualTypeOf<StrayListenerReport>();
        expectTypeOf(report.removed).toEqualTypeOf<number>();
        expectTypeOf(report.listeners).toEqualTypeOf<readonly StrayListener[]>();
        expectTypeOf(report.listeners[0]?.file).toEqualTypeOf<string | undefined>();
      },
    });

    // @ts-expect-error -- the listener sweep is a switch
    setupAutoSpy({ strayListeners: 'warn' });
    // @ts-expect-error -- the report counts what was removed, not what was cancelled
    setupAutoSpy({ onStrayListeners: ({ cancelled }) => cancelled });
  });

  it('fail the file on a stray through a handler or the one built-in reaction', () => {
    setupAutoSpy({ strayTimers: true, onStrayTimers: 'throw', strayListeners: true, onStrayListeners: 'throw' });
    setupAutoSpy({
      onStrayTimers: (report) => {
        expectTypeOf(report).toEqualTypeOf<StrayTimerReport>();
      },
    });

    // @ts-expect-error -- with no handler the sweep is already quiet, so there is no 'warn' to ask for
    setupAutoSpy({ onStrayTimers: 'warn' });
    // @ts-expect-error -- the same for listeners
    setupAutoSpy({ onStrayListeners: 'off' });
  });
});

describe('the runtime-thin counters', () => {
  it('answer the shapes a setup file reads once', () => {
    expectTypeOf(countStrayTimers()).toEqualTypeOf<number>();
    expectTypeOf(countStrayRejections()).toEqualTypeOf<number>();
    expectTypeOf(countStrayListeners()).toEqualTypeOf<number>();
    expectTypeOf(removeStrayListeners()).toEqualTypeOf<number>();
    expectTypeOf(restoreWebStorage()).toEqualTypeOf<WebStorageKey[]>();
    expectTypeOf(restoreStorageSpies()).toEqualTypeOf<readonly StorageSpyKey[]>();
    expectTypeOf(restoreGlobals()).toEqualTypeOf<readonly PropertyKey[]>();
  });
});
