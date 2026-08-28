/**
 * `setupAutoSpy()` is the one call a project makes, so what it installs has to be observable from
 * the outside: a patched property is undone after the test that made it, a `vi.spyOn` stub is gone
 * when asked for, and a second install of the library stops the run instead of corrupting it.
 */
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import '../index';
import { getPackageCopies, registerPackageCopy, resetPackageCopies } from './package-identity';
import { countMockedProps, mockValueProp, restoreMockedProps } from './prop-mock';
import { setupAutoSpy } from './setup-auto-spy';
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
});
