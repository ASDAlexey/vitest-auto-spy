/**
 * `resetTestEnvironment` is stubbed rather than allowed to run: this suite has an initialised
 * zoneless platform of its own, and tearing it down for real would take every following spec in the
 * worker with it — which is the very failure mode the helper exists to prevent.
 */
import { getTestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupAngularTestEnv } from './angular-test-env';
import { type RestoreProp, mockValueProp, restoreMockedProps } from './prop-mock';

const initZone = vi.fn();
const initZoneless = vi.fn();
const reset = vi.fn();
const seenPaths: string[] = [];

let zoneless = false;
let hidePath = false;
let restorePath: RestoreProp | undefined;

// Registered before the helper's own hook, so the stubs are in place by the time it runs: within one
// suite Vitest runs `beforeEach` hooks in registration order.
beforeEach(() => {
  const resetKey: PropertyKey = 'resetTestEnvironment';
  mockValueProp(getTestBed(), resetKey, reset);

  if (hidePath) {
    const stateKey: PropertyKey = 'getState';
    restorePath = mockValueProp(expect, stateKey, () => ({}));
  }
});

setupAngularTestEnv({
  zoneless: (testPath) => {
    seenPaths.push(testPath);

    return zoneless;
  },
  initZone,
  initZoneless,
});

// Registered after the helper, so `expect` is itself again by the time the test body runs — a
// suite whose matchers cannot read the runner state would fail for reasons of its own.
beforeEach(() => {
  restorePath?.();
  restorePath = undefined;
});

afterEach(restoreMockedProps);

describe('setupAngularTestEnv', () => {
  it('initialises the mode the first file needs', () => {
    expect(initZone).toHaveBeenCalledTimes(1);
    expect(initZoneless).not.toHaveBeenCalled();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('leaves the environment alone while the mode does not change', () => {
    expect(initZone).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('decides from the path of the file about to run', () => {
    expect(seenPaths.at(-1)).toBe(expect.getState().testPath);

    // Flipped from inside a test rather than from a nested `beforeEach`: a nested hook runs *after*
    // the one the helper registered at the top level, so the switch would only be seen a test too late.
    zoneless = true;
  });

  it('tears the platform down before initialising the other one', () => {
    expect(reset).toHaveBeenCalledTimes(2);
    expect(initZoneless).toHaveBeenCalledTimes(1);

    // The runner does not always know the file — a spec collected from an in-memory module, a
    // custom pool. The mode decision still has to be made, so the path falls back to empty.
    hidePath = true;
    zoneless = false;
  });

  it('still decides when the runner reports no file path', () => {
    expect(seenPaths.at(-1)).toBe('');
    expect(initZone).toHaveBeenCalledTimes(2);
  });
});
