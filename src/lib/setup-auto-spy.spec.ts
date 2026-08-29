/**
 * `setupAutoSpy()` is the one call a project makes, so what it installs has to be observable from
 * the outside: a patched property is undone after the test that made it, a `vi.spyOn` stub is gone
 * when asked for, and a second install of the library stops the run instead of corrupting it.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import '../index';
import { getPackageCopies, registerPackageCopy, resetPackageCopies } from './package-identity';
import { countMockedProps, mockValueProp, restoreMockedProps } from './prop-mock';
import { describeStrayRejections, reportStrayRejections, setupAutoSpy } from './setup-auto-spy';
import { type StrayRejection, flushStrayRejections } from './stray-rejections';
import { countStrayTimers, trackStrayTimers } from './stray-timers';

const DUPLICATE = 'file:///app/node_modules/other/node_modules/vitest-auto-spy/dist/index.js';
const REAL_ROOTS = getPackageCopies();

const patchTarget = { value: 'real' };
const stubTarget = {
  compute(): string {
    return 'real';
  },
};

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

describe('network blocking (opted in)', () => {
  setupAutoSpy({ duplicateCopies: 'off', blockNetwork: true });

  it('rejects instead of reaching the network, and names what was requested', async () => {
    await expect(fetch('https://cdn.example.test/icon.svg')).rejects.toThrow(/fetch is stubbed[\s\S]*icon\.svg/);
  });

  it('re-installs the stub for the next test, after restoreProps took it off', async () => {
    await expect(fetch('https://cdn.example.test/other.svg')).rejects.toThrow(/fetch is stubbed/);
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

  it('is not claimed twice when setupAutoSpy runs again', () => {
    const claimed: unknown = Reflect.get(zoneStub, rejectionSlot);

    setupAutoSpy({ duplicateCopies: 'off', restoreProps: false, strayRejections: true });

    expect(Reflect.get(zoneStub, rejectionSlot)).toBe(claimed);
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
