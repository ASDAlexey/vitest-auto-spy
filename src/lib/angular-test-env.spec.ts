/**
 * `resetTestEnvironment` is stubbed rather than allowed to run: this suite has an initialised
 * zoneless platform of its own, and tearing it down for real would take every following spec in the
 * worker with it — which is the very failure mode the helper exists to prevent.
 *
 * The mode decision is driven through {@link installAngularTestEnv} rather than through the hook:
 * the hook makes it once per file, and a platform switch is by definition what happens between two
 * files. `setupAngularTestEnv` itself is exercised the way it is used — installed for this whole file.
 */
import { getTestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { type AngularTestEnvOptions, installAngularTestEnv, setupAngularTestEnv } from './angular-test-env';
import { mockValueProp, restoreMockedProps } from './prop-mock';

const initZone = vi.fn();
const initZoneless = vi.fn();
const reset = vi.fn();

/** Stub the teardown, so the platform this suite runs on survives the call. */
function stubResetTestEnvironment(): void {
  const resetKey: PropertyKey = 'resetTestEnvironment';
  mockValueProp(getTestBed(), resetKey, reset);
}

function options(zoneless: boolean, seenPaths: string[] = []): AngularTestEnvOptions {
  return {
    zoneless: (testPath) => {
      seenPaths.push(testPath);

      return zoneless;
    },
    initZone,
    initZoneless,
  };
}

describe('installAngularTestEnv', () => {
  beforeEach(() => {
    stubResetTestEnvironment();
    initZone.mockClear();
    initZoneless.mockClear();
    reset.mockClear();
  });

  afterEach(restoreMockedProps);

  it('initialises the mode the first file needs', () => {
    const seenPaths: string[] = [];

    expect(installAngularTestEnv(options(false, seenPaths), undefined)).toBe('zone');
    expect(seenPaths).toEqual([expect.getState().testPath]);
    expect(initZone).toHaveBeenCalledTimes(1);
    expect(initZoneless).not.toHaveBeenCalled();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('leaves the environment alone while the mode does not change', () => {
    expect(installAngularTestEnv(options(false), 'zone')).toBe('zone');
    expect(reset).not.toHaveBeenCalled();
    expect(initZone).not.toHaveBeenCalled();
  });

  it('tears the platform down before initialising the other one', () => {
    expect(installAngularTestEnv(options(true), 'zone')).toBe('zoneless');
    expect(reset).toHaveBeenCalledTimes(1);
    expect(initZoneless).toHaveBeenCalledTimes(1);
    expect(initZone).not.toHaveBeenCalled();
  });

  it('still decides when the runner reports no file path', () => {
    const seenPaths: string[] = [];

    // The runner does not always know the file — a spec collected from an in-memory module, a
    // custom pool. The mode decision still has to be made, so the path falls back to empty.
    const stateKey: PropertyKey = 'getState';
    const restorePath = mockValueProp(expect, stateKey, () => ({}));
    const installed = installAngularTestEnv(options(false, seenPaths), undefined);

    // Restored before the assertions: a matcher that cannot read the runner state fails for reasons
    // of its own, which would say nothing about the decision being checked here.
    restorePath();

    expect(installed).toBe('zone');
    expect(seenPaths).toEqual(['']);
  });
});

describe('setupAngularTestEnv, installed for this file', () => {
  const seenPaths: string[] = [];

  // Registered before the helper's own hook, so the stub is in place by the time it runs: within one
  // suite Vitest runs `beforeAll` hooks in registration order.
  beforeAll(() => {
    stubResetTestEnvironment();
    initZone.mockClear();
    reset.mockClear();
  });

  setupAngularTestEnv(options(false, seenPaths));

  afterAll(restoreMockedProps);

  it('decides from the path of the file about to run', () => {
    expect(seenPaths).toEqual([expect.getState().testPath]);
    expect(initZone).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('does not ask again for the next test of the same file', () => {
    // The whole of the change: `testPath` is the file, so a second test of it has nothing to decide.
    expect(seenPaths).toHaveLength(1);
    expect(initZone).toHaveBeenCalledTimes(1);
  });
});
