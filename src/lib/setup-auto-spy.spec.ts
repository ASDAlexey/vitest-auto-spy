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
