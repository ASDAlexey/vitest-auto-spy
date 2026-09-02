/**
 * `setupAutoSpy()` is the one call a project makes, so what it installs has to be observable from
 * the outside: a patched property is undone after the test that made it, a `vi.spyOn` stub is gone
 * when asked for, and a second install of the library stops the run instead of corrupting it.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import '../index';
import { createSpyFromClass } from './create-spy-from-class';
import { getMockRegistrySize, resetMockRegistryTracking } from './mock-registry';
import { getPackageCopies, registerPackageCopy, resetPackageCopies } from './package-identity';
import { countMockedProps, mockValueProp, restoreMockedProps } from './prop-mock';
import {
  annotateFrozenClockTimeouts,
  annotateTimedOutHooks,
  describeStrayRejections,
  reportStrayRejections,
  reportStrayTimers,
  reportedErrors,
  runTeardown,
  setupAutoSpy,
  warnAboutSuppressedLeaks,
} from './setup-auto-spy';
import { type StrayRejection, flushStrayRejections } from './stray-rejections';
import { countStrayTimers, trackStrayTimers } from './stray-timers';

const DUPLICATE = 'file:///app/node_modules/other/node_modules/vitest-auto-spy/dist/index.js';
const REAL_ROOTS = getPackageCopies();

/** A double built inside a test, to show what the suite-wide strict default did to it. */
class Cart {
  total(): number {
    return 0;
  }
}

const patchTarget = { value: 'real' };
const stubTarget = {
  compute(): string {
    return 'real';
  },
};

/**
 * The suite-wide strict-mode default, and — the half that matters — its release.
 *
 * `setDefaultStrictMode` writes a module-level binding, so under `isolate: false` it is shared by
 * every file in the worker. A default that outlived the file that armed it would fail specs that
 * never opted in, with a message ("Nothing configured X.load, and strict mode is on") naming a
 * switch their setup never touched.
 *
 * First in the file on purpose, and the only block here that arms it. `setupAutoSpy()` installs the
 * default when the suite factory runs — during collection, before any test — so the window in which
 * it is live is "from collection until this block's `afterAll`", and putting the block anywhere
 * else would put unrelated tests inside that window.
 */
describe('suite-wide strict mode (opted in)', () => {
  setupAutoSpy({ duplicateCopies: 'off', restoreProps: false, strict: true });

  it('reaches a double built afterwards, without that call site mentioning it', () => {
    expect(() => createSpyFromClass(Cart).total()).toThrow(/Nothing configured Cart\.total, and strict mode is on/);
  });

  it('is still overridden by a double that opted out explicitly', () => {
    expect(createSpyFromClass(Cart, { strict: false }).total()).toBeUndefined();
  });
});

describe('suite-wide strict mode, after the block that armed it', () => {
  it('finds the default released, so it cannot travel into the next file', () => {
    expect(createSpyFromClass(Cart).total()).toBeUndefined();
  });
});

describe('duplicate installs', () => {
  afterEach(() => {
    resetPackageCopies();
    REAL_ROOTS.forEach((root) => registerPackageCopy(root));
  });

  it('stops the run by default, explaining how to collapse the tree', () => {
    registerPackageCopy(DUPLICATE);

    expect(() => setupAutoSpy()).toThrow(/loaded 2 times from different installs[\s\S]*npm ls vitest-auto-spy/);
  });

  it('only warns when asked to', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    registerPackageCopy(DUPLICATE);
    setupAutoSpy({ duplicateCopies: 'warn', restoreProps: false });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('loaded 2 times'));

    warn.mockRestore();
  });

  it('says nothing when the check is off, or when the tree is clean', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    registerPackageCopy(DUPLICATE);
    setupAutoSpy({ duplicateCopies: 'off', restoreProps: false });

    resetPackageCopies();
    registerPackageCopy(DUPLICATE);
    setupAutoSpy({ duplicateCopies: 'warn', restoreProps: false });

    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });
});

describe('property restoration (default)', () => {
  setupAutoSpy({ duplicateCopies: 'off' });

  it('leaves the patch in place for the test that made it', () => {
    mockValueProp(patchTarget, 'value', 'patched');

    expect(patchTarget.value).toBe('patched');
  });

  it('has undone it by the next test', () => {
    expect(patchTarget.value).toBe('real');
    expect(countMockedProps()).toBe(0);
  });
});

describe('property restoration (opted out)', () => {
  setupAutoSpy({ duplicateCopies: 'off', restoreProps: false });

  afterAll(restoreMockedProps);

  it('patches', () => {
    mockValueProp(patchTarget, 'value', 'sticky');

    expect(patchTarget.value).toBe('sticky');
  });

  it('still sees the patch in the next test', () => {
    expect(patchTarget.value).toBe('sticky');
  });
});

describe('runner mock restoration (opted in)', () => {
  setupAutoSpy({ duplicateCopies: 'off', restoreProps: false, restoreMocks: true });

  it('keeps a spyOn stub inside its own test', () => {
    vi.spyOn(stubTarget, 'compute').mockReturnValue('stubbed');

    expect(stubTarget.compute()).toBe('stubbed');
  });

  it('finds the stub restored in the next test', () => {
    expect(stubTarget.compute()).toBe('real');
  });
});

describe('the teardown net, for the run where the hook never happened', () => {
  // Vitest runs `afterEach` in reverse registration order, so this one — registered *after*
  // `setupAutoSpy()` — runs *first*, and taking it down takes the library's hook with it. That is
  // the shape that let a patch travel: a long-standing `afterEach(() => vi.restoreAllMocks())`
  // started throwing once a restored getter came back `undefined` and `ngOnDestroy` called it.
  const target = { cookie: 'real' };

  setupAutoSpy({ duplicateCopies: 'off' });

  afterEach(() => {
    if (target.cookie === 'patched') {
      throw new Error('the hook that runs first, and throws');
    }
  });

  const warnings: string[] = [];

  it.fails('leaves a patch behind when the hook above the library throws', () => {
    vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
    mockValueProp(target, 'cookie', 'patched');

    expect(countMockedProps()).toBe(1);
  });

  it('finds it put back all the same, and says why it had to be', () => {
    vi.restoreAllMocks();

    // Without `onTestFinished` this would still read `patched`, and the failure would have surfaced
    // in whichever later test happened to care.
    expect(target.cookie).toBe('real');
    expect(countMockedProps()).toBe(0);
    // The net says what happened, because the symptom is two tests away from the cause.
    expect(warnings.join('\n')).toMatch(/afterEach did not run for this test, so 1 mock\*Prop patch/);
    expect(warnings.join('\n')).toContain('reverse registration order');
  });
});

describe('network blocking (opted in)', () => {
  setupAutoSpy({ duplicateCopies: 'off', blockNetwork: true });

  it('rejects instead of reaching the network, and names what was requested', async () => {
    await expect(fetch('https://cdn.example.test/icon.svg')).rejects.toThrow(/fetch is stubbed[\s\S]*icon\.svg/);
  });

  it('re-installs the stub for the next test, after restoreProps took it off', async () => {
    await expect(fetch('https://cdn.example.test/other.svg')).rejects.toThrow(/fetch is stubbed/);
  });
});

describe('network blocking, narrowed to one channel', () => {
  setupAutoSpy({ duplicateCopies: 'off', blockNetwork: { fetch: false, xhr: 'empty' } });

  it('reads the options once, and applies exactly the ones it was given', async () => {
    const answered = await new Promise<string>((resolve) => {
      const xhr = new XMLHttpRequest();

      xhr.addEventListener('load', () => resolve(`${xhr.status} ${JSON.stringify(xhr.responseText)}`));
      xhr.open('GET', 'https://tracker.example.test/ping.gif');
      xhr.send();
    });

    // Blocked, but answered rather than failed — and `fetch` was left as the environment had it,
    // which is what proves the object reached `blockNetwork` instead of a `TestContext`.
    expect(answered).toBe(`200 ""`);
    expect(typeof fetch).toBe('function');
    await expect(fetch('data:text/plain;charset=utf-8,ok').then((response) => response.text())).resolves.toBe('ok');
  });
});

describe('timer globals (on by default)', () => {
  setupAutoSpy({ duplicateCopies: 'off', restoreProps: false });

  it('puts back a timer global that went missing during the previous test', () => {
    // Standing in for what happy-dom's realm does when the fakes come off: the global is gone,
    // not replaced. The hook installed above repaired it before this test started.
    expect(typeof Date).toBe('function');
    expect(typeof clearInterval).toBe('function');
  });
});

describe('timer globals (opted out)', () => {
  setupAutoSpy({ duplicateCopies: 'off', restoreProps: false, restoreTimerGlobals: false });

  it('installs no repair hook, leaving the environment entirely to the suite', () => {
    // Nothing observable to assert beyond the run staying healthy: the point of the option is that
    // a project managing its own globals is not second-guessed.
    expect(typeof Date).toBe('function');
  });
});

describe('stray-timer containment (opted in)', () => {
  // Installs the wrappers immediately and registers the per-file sweep. The sweep itself runs after
  // this file's last test, so what is asserted here is that tracking is live and counting.
  setupAutoSpy({ duplicateCopies: 'off', restoreProps: false, strayTimers: true });

  afterAll(() => {
    // Hand the globals back, so the option under test does not colour the rest of the run.
    trackStrayTimers()();
  });

  it('records a timeout the test leaves behind', () => {
    const before = countStrayTimers();

    setTimeout(() => undefined, 60_000);

    expect(countStrayTimers()).toBe(before + 1);
  });

  it('is not installed twice when setupAutoSpy runs again', () => {
    const scheduler = globalThis.setTimeout;

    setupAutoSpy({ duplicateCopies: 'off', restoreProps: false, strayTimers: true });

    expect(globalThis.setTimeout).toBe(scheduler);
  });
});

/**
 * What the per-file sweep says about what it swept.
 *
 * Asserted on the reporter directly rather than through the option, because the sweep runs in an
 * `afterAll` at the very end of a file: a test can neither choose the count it will see nor watch
 * what it printed. The pairing that matters is the one with Vitest 4.1's `detectAsyncLeaks` —
 * cancelling in `afterAll` empties that report, and saying nothing about it leaves a leaking suite
 * with a clean bill of health.
 */
describe('reporting what the stray-timer sweep cancelled', () => {
  /** Turn the runner's own flag on for the duration of `run`, whatever it was before. */
  function withLeakDetection<T>(run: () => T): T {
    const config: object = Object(Reflect.get(Object(Reflect.get(globalThis, '__vitest_worker__')), 'config'));
    const before: unknown = Reflect.get(config, 'detectAsyncLeaks');

    Reflect.set(config, 'detectAsyncLeaks', true);

    try {
      return run();
    } finally {
      Reflect.set(config, 'detectAsyncLeaks', before);
    }
  }

  /** Watch the channel the warning actually uses — stderr, not the intercepted console. */
  function captureStderr(): { written: string[]; restore: () => void } {
    const written: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      written.push(String(chunk));

      return true;
    });

    return { written, restore: () => spy.mockRestore() };
  }

  it('says nothing when the file left nothing behind', () => {
    const { written, restore } = captureStderr();
    const handler = vi.fn();

    try {
      withLeakDetection(() => reportStrayTimers(0, handler));
    } finally {
      restore();
    }

    expect(handler).not.toHaveBeenCalled();
    expect(written).toEqual([]);
  });

  it('hands the count to a handler instead of printing anything', () => {
    const { written, restore } = captureStderr();
    const handler = vi.fn();

    try {
      withLeakDetection(() => reportStrayTimers(3, handler));
    } finally {
      restore();
    }

    expect(handler).toHaveBeenCalledWith({ cancelled: 3 });
    expect(written).toEqual([]);
  });

  it('stays quiet with no handler when the run is not looking for leaks', () => {
    const { written, restore } = captureStderr();

    try {
      reportStrayTimers(3, undefined);
    } finally {
      restore();
    }

    expect(written).toEqual([]);
  });

  it('warns when the sweep emptied a leak report nobody else will fill', () => {
    const { written, restore } = captureStderr();

    try {
      withLeakDetection(() => reportStrayTimers(2, undefined));
    } finally {
      restore();
    }

    expect(written).toHaveLength(1);
    expect(written[0]).toContain('cancelled 2 scheduled callback(s)');
  });

  it('names the count, the reason the leak report is empty, and both ways out', () => {
    const printed: string[] = [];

    warnAboutSuppressedLeaks(4, (message) => printed.push(message));

    expect(printed[0]).toContain('cancelled 4 scheduled callback(s)');
    expect(printed[0]).toContain('before Vitest collected async leaks');
    expect(printed[0]).toContain('`strayTimers` off');
    expect(printed[0]).toContain('onStrayTimers');
  });

  it('falls back to the console where the environment has no process', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const real = globalThis.process;

    Reflect.deleteProperty(globalThis, 'process');

    try {
      warnAboutSuppressedLeaks(1);
    } finally {
      Reflect.set(globalThis, 'process', real);
    }

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('mock-registry pruning (opted in)', () => {
  // The capture happens in the `beforeAll` the option registers, so a size at all is the proof that
  // it ran; the prune it pairs with runs after this block's last test.
  setupAutoSpy({ duplicateCopies: 'off', restoreProps: false, pruneMockRegistry: true });

  afterAll(resetMockRegistryTracking);

  it('captures the registry the runner does not expose', () => {
    expect(getMockRegistrySize()).toBeGreaterThan(0);
  });
});

/**
 * A stand-in for zone.js, on the globals for exactly as long as the option below needs it.
 *
 * `setupAutoSpy({ strayRejections: true })` refuses to arm without zone.js — deliberately, since a
 * silent no-op would read as "the check is on" — and this repository's suite is zoneless. Vitest
 * runs every suite factory *after* the file body, so the stub cannot be taken off between the two
 * describes; it comes off in the file's own `afterAll`, which is late enough for the option under
 * test and early enough that nothing outside this file ever sees a `Zone`.
 */
const zoneStub = Object.assign(() => undefined, { __symbol__: (name: string): string => `__zone_symbol__${name}` });
const rejectionSlot = zoneStub.__symbol__('unhandledPromiseRejectionHandler');

Object.defineProperty(globalThis, 'Zone', { configurable: true, writable: true, value: zoneStub });

afterAll(() => {
  Reflect.deleteProperty(globalThis, 'Zone');
});

/** What zone.js does after its `console.error`, minus zone.js. */
function fireRejection(error: unknown): void {
  const handler = Reflect.get(zoneStub, rejectionSlot);

  handler(error);
}

describe('stray-rejection containment (opted in)', () => {
  // Claims the handler slot immediately and registers the per-test check. Every test here has to
  // hand back what it fired, because that check's job is to fail the test it runs after.
  setupAutoSpy({ duplicateCopies: 'off', restoreProps: false, strayRejections: true });

  it('captures what zone.js would have swallowed into console.error', () => {
    const reason = new Error('nobody awaited me');

    fireRejection({ rejection: reason, zone: { name: 'ProxyZone' }, task: { source: 'Promise.then' } });

    expect(flushStrayRejections().map((rejection) => rejection.reason)).toEqual([reason]);
  });

  it('turns one into a failure that names the assertion and the test it belongs to', () => {
    fireRejection(Object.assign(new Error('expected 1 to be 2'), { matcherResult: { pass: false } }));

    expect(() => reportStrayRejections()).toThrow(/expected 1 to be 2[\s\S]*attributed to .*names the assertion/);
  });

  it('does not report again what the runner has already blamed the test for', () => {
    const failure = Object.assign(new Error('expected 1 to be 2'), { matcherResult: { pass: false } });

    fireRejection(failure);

    // An `async` test that fails an assertion leaves its own error here as well: the runner names it
    // once, and a second message about the same throw sends the reader looking for a defect that is
    // not there.
    expect(() => reportStrayRejections({ task: { result: { errors: [failure] } } })).not.toThrow();
  });

  it('recognises the runner’s copy of the same throw, not only the object itself', () => {
    const thrown = new Error('expected 1 to be 2');
    const processed = { message: thrown.message, stack: thrown.stack };

    fireRejection(thrown);

    expect(() => reportStrayRejections({ task: { result: { errors: [processed] } } })).not.toThrow();
  });

  it('still reports a rejection the runner said nothing about', () => {
    fireRejection(new Error('nobody awaited me'));

    expect(() => reportStrayRejections({ task: { result: { errors: [new Error('a different failure')] } } })).toThrow(/nobody awaited me/);
    fireRejection(new Error('nobody awaited me'));
    // Same message, different throw: the stacks part company, so it keeps its own message.
    expect(() => reportStrayRejections({ task: { result: { errors: [new Error('nobody awaited me')] } } })).toThrow(/nobody awaited me/);
    fireRejection('a bare string');
    // A reason with no message at all is nothing the runner's error list can be mistaken for.
    expect(() => reportStrayRejections({ task: { result: { errors: [new Error('something else')] } } })).toThrow(
      /rejected with a bare string/,
    );
  });

  it('reads an empty list out of every shape of context the runner might not have filled in', () => {
    expect(reportedErrors(undefined)).toEqual([]);
    expect(reportedErrors({})).toEqual([]);
    expect(reportedErrors({ task: {} })).toEqual([]);
    expect(reportedErrors({ task: { result: {} } })).toEqual([]);
    expect(reportedErrors({ task: { result: { errors: ['boom'] } } })).toEqual(['boom']);
  });

  it('is not claimed twice when setupAutoSpy runs again', () => {
    const claimed: unknown = Reflect.get(zoneStub, rejectionSlot);

    setupAutoSpy({ duplicateCopies: 'off', restoreProps: false, strayRejections: true });

    expect(Reflect.get(zoneStub, rejectionSlot)).toBe(claimed);
  });
});

/**
 * The bug this covers: the diagnostics and the restores used to be separate `afterEach`
 * registrations, so which ran first was decided by `sequence.hooks` — and under its default
 * `'stack'` the throwing diagnostic went first and took every restore with it. Both settings are
 * exercised because a project that pins `'list'` is accidentally immune and would not see a
 * regression the other half of the world does.
 *
 * `it.fails` is what lets the throwing hook be asserted on: the runner flips the result after the
 * `afterEach` hooks have run, so the failure the diagnostic causes is the expected outcome here.
 */
describe.each(['list', 'stack'] as const)('a diagnostic that throws, with sequence.hooks: %s', (hooks) => {
  const guarded = { value: 'real' };

  setupAutoSpy({ duplicateCopies: 'off', strayRejections: true });

  beforeAll(() => {
    vi.setConfig({ sequence: { hooks } });
  });

  afterAll(() => {
    vi.resetConfig();
  });

  it.fails('fails the test its finding is attributed to', () => {
    mockValueProp(guarded, 'value', 'patched');
    fireRejection(new Error('nobody awaited me'));
  });

  it('had the restores run all the same', () => {
    expect(guarded.value).toBe('real');
    expect(countMockedProps()).toBe(0);
  });
});

describe('runTeardown', () => {
  const step = (log: string[], name: string, error?: Error) => (): void => {
    log.push(name);

    if (error) {
      throw error;
    }
  };

  it('runs every step even after one threw, and reports the first failure', () => {
    const ran: string[] = [];
    const diagnostic = new Error('the finding');

    expect(() =>
      runTeardown([step(ran, 'diagnostic', diagnostic), step(ran, 'restore'), step(ran, 'late', new Error('a restore'))]),
    ).toThrow(diagnostic);
    expect(ran).toEqual(['diagnostic', 'restore', 'late']);
  });

  it('throws nothing when every step succeeded', () => {
    const ran: string[] = [];

    runTeardown([step(ran, 'restore')]);

    expect(ran).toEqual(['restore']);
  });
});

describe('the report a captured rejection turns into', () => {
  const rejection = (overrides: Partial<StrayRejection>): StrayRejection => ({
    reason: new Error('boom'),
    assertion: false,
    testName: 'a suite > a test',
    ...overrides,
  });

  it('points a late assertion at the missing await', () => {
    const message = describeStrayRejections([rejection({ assertion: true })]);

    expect(message).toContain('Error: boom — attributed to a suite > a test');
    expect(message).toMatch(/cannot fail it[\s\S]*without `await`/);
  });

  it('says something else for an error nothing handled, and for a reason that is not one', () => {
    const message = describeStrayRejections([rejection({ reason: 'a bare string', testName: '' })]);

    expect(message).toContain('rejected with a bare string — attributed to no test');
    expect(message).toMatch(/never asserted on[\s\S]*rejects\.toThrow/);
  });
});

describe('global-patch guard (opted in)', () => {
  // What the guard reports is covered in `global-patch-guard.spec.ts`, on a hand-built snapshot: a
  // finding here would mean sealing a real global, which is by definition permanent. What this pair
  // covers is the wiring — snapshot before the test, check after it, as one of the teardown steps.
  setupAutoSpy({ duplicateCopies: 'off', guardGlobals: 'throw' });

  it('lets a patch of a global that can be undone through', () => {
    mockValueProp(globalThis, 'aStubbedGlobal', 'stub');

    expect(Reflect.get(globalThis, 'aStubbedGlobal')).toBe('stub');
  });

  it('reported nothing about it, and the patch is off again', () => {
    expect('aStubbedGlobal' in globalThis).toBe(false);
  });
});

describe('console-spy clearing (on by default)', () => {
  const reset = vi.fn();

  setupAutoSpy({ duplicateCopies: 'off', restoreProps: false });

  beforeAll(() => {
    // Standing in for what `vitest-auto-spy/console` registers on import: the setup entry must not
    // pull that module in, so the hook only ever reaches it through this slot.
    globalThis.__vitestAutoSpyResetConsoleSpies__ = reset;
  });

  afterAll(() => {
    globalThis.__vitestAutoSpyResetConsoleSpies__ = undefined;
  });

  it('leaves the recorded calls alone while a test is running', () => {
    expect(reset).not.toHaveBeenCalled();
  });

  it('cleared them once the test was over', () => {
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe('every step opted out', () => {
  const reset = vi.fn();

  setupAutoSpy({
    duplicateCopies: 'off',
    frozenClockHint: false,
    hookTimeoutHint: false,
    resetConsoleSpies: false,
    restoreProps: false,
    restoreTimerGlobals: false,
  });

  beforeAll(() => {
    globalThis.__vitestAutoSpyResetConsoleSpies__ = reset;
  });

  afterAll(() => {
    globalThis.__vitestAutoSpyResetConsoleSpies__ = undefined;
  });

  it('registers a first test to be followed by nothing', () => {
    expect(reset).not.toHaveBeenCalled();
  });

  it('installed no per-test hook at all', () => {
    expect(reset).not.toHaveBeenCalled();
  });
});

describe('setupAutoSpy({ globalFakeTimers })', () => {
  setupAutoSpy({ duplicateCopies: 'off', globalFakeTimers: { toFake: ['Date'] } });

  it('installs fake timers for the first test', () => {
    expect(vi.isFakeTimers()).toBe(true);
  });

  it('installs them again for the next one, without a double uninstall in between', () => {
    expect(vi.isFakeTimers()).toBe(true);
  });
});

describe('setupAutoSpy({ globalFakeTimers: true })', () => {
  setupAutoSpy({ duplicateCopies: 'off', globalFakeTimers: true });

  it('accepts the boolean shorthand', () => {
    expect(vi.isFakeTimers()).toBe(true);
  });

  it('runs a test before the nested block below, so its beforeAll meets an afterEach', () => {
    expect(vi.isFakeTimers()).toBe(true);
  });

  /**
   * The gap that arming in `beforeEach` alone leaves: a nested `beforeAll` runs *after* the previous
   * test's `afterEach`, so it meets whatever that hook left behind. A suite preparing its samples
   * there — an animation clock driven with `vi.advanceTimersByTimeAsync`, say — failed with
   * `A function to advance timers was called but the timers APIs are not mocked`, in a set whose own
   * tests never touch a timer.
   */
  describe('a nested block whose beforeAll drives the clock', () => {
    let advanced = false;

    beforeAll(() => {
      expect(vi.isFakeTimers()).toBe(true);

      setTimeout(() => {
        advanced = true;
      }, 10);
      vi.advanceTimersByTime(10);
    });

    it('found the clock already fake', () => {
      expect(advanced).toBe(true);
    });
  });
});

/**
 * The hint appended to a `beforeEach` that ran out of the run-wide `hookTimeout`.
 *
 * Vitest resolves `hookTimeout` (10 000 ms by default) independently of `testTimeout` (5 000 ms),
 * where Jest applied one number to both. A suite that carried its Jest preset's `testTimeout: 30000`
 * across and left `hookTimeout` alone gives hooks a third of the budget — and the timeout is
 * reported against the *test*, its duration pinned at the limit, so the log reads as a slow test
 * whose body never ran.
 *
 * The step is called directly here: making a hook actually time out would cost the budget under
 * discussion, once per case, and would fail the test doing the asserting. That it is reachable at
 * all was settled against the real runner with a `beforeEach(fn, 300)` probe.
 */
describe('hook timeout hint', () => {
  afterEach(() => {
    vi.resetConfig();
  });

  function timedOutHook(limit: number): Error {
    return new Error(`Hook timed out in ${limit}ms.`);
  }

  it('explains the asymmetry once the budgets are the migrated shape', () => {
    // Also the check that the budgets are read live: `vi.setConfig` is the public writer, and the
    // step has to see what it wrote rather than a pair cached when the setup file ran.
    vi.setConfig({ testTimeout: 30_000, hookTimeout: 10_000 });

    const error = timedOutHook(10_000);

    annotateTimedOutHooks({ task: { result: { errors: [error] } } });

    expect(error.message).toContain('[vitest-auto-spy] hookTimeout is 10000ms while testTimeout is 30000ms');
  });

  it("stays quiet on this suite's own budgets, where the hook has the larger one", () => {
    const error = timedOutHook(10_000);

    annotateTimedOutHooks({ task: { result: { errors: [error] } } });

    expect(error.message).toBe('Hook timed out in 10000ms.');
  });
});

/**
 * The sentence a timeout gets when the clock, not the code, is what stalled.
 *
 * Called directly for the same reason as its neighbour above: a real timeout costs the budget it
 * reports on. That the pieces line up under the real runner was settled with a probe test —
 * `setImmediate` awaited under `vi.useFakeTimers()` with a 300 ms limit produced
 * `Test timed out in 300ms.`, an `afterEach` that ran anyway, and `vi.getTimerCount() === 1`.
 */
describe('frozen clock hint', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('explains a timeout the frozen clock accounts for', () => {
    vi.useFakeTimers();
    setTimeout(() => undefined, 10_000);

    const error = new Error('Test timed out in 5000ms.');

    annotateFrozenClockTimeouts({ task: { result: { errors: [error] } } });

    expect(error.message).toContain('[vitest-auto-spy] the clock is frozen and 1 callback(s) are queued on it');
  });

  it('stays quiet while the clock is real, which is how the rest of this file runs', () => {
    const error = new Error('Test timed out in 5000ms.');

    annotateFrozenClockTimeouts({ task: { result: { errors: [error] } } });

    expect(error.message).toBe('Test timed out in 5000ms.');
  });
});
