/**
 * The bug being covered here is not reproducible with `vi.useRealTimers()` under this repo's Node
 * environment — there the globals are own properties of `globalThis` and the uninstall does put
 * them back. What happy-dom does instead is delete them, so the deletion is what the specs stage:
 * the contract is "anything missing comes back, anything present is left exactly as it is".
 */
import { afterEach, describe, expect, it } from 'vitest';

import { getWatchedTimerGlobals, restoreTimerGlobals } from './timer-globals';

const environment: object = globalThis;

const readGlobal = (name: string): unknown => Reflect.get(environment, name);
const writeGlobal = (name: string, value: unknown): void => {
  Reflect.set(environment, name, value);
};
const removeGlobal = (name: string): void => {
  Reflect.deleteProperty(environment, name);
};

describe('restoreTimerGlobals', () => {
  const realDate = readGlobal('Date');
  const realClearInterval = readGlobal('clearInterval');

  afterEach(() => {
    writeGlobal('Date', realDate);
    writeGlobal('clearInterval', realClearInterval);
  });

  it('puts back a global the uninstall deleted', () => {
    removeGlobal('Date');

    restoreTimerGlobals();

    expect(readGlobal('Date')).toBe(realDate);
  });

  it('puts back several at once', () => {
    removeGlobal('Date');
    removeGlobal('clearInterval');

    restoreTimerGlobals();

    expect(readGlobal('Date')).toBe(realDate);
    expect(readGlobal('clearInterval')).toBe(realClearInterval);
  });

  it('leaves a replacement a spec installed on purpose alone', () => {
    const replacement = (): number => 0;

    writeGlobal('clearInterval', replacement);

    restoreTimerGlobals();

    expect(readGlobal('clearInterval')).toBe(replacement);
  });

  it('is safe to call when nothing is missing', () => {
    expect(() => {
      restoreTimerGlobals();
      restoreTimerGlobals();
    }).not.toThrow();

    expect(readGlobal('Date')).toBe(realDate);
  });
});

describe('getWatchedTimerGlobals', () => {
  it('reports the globals it captured', () => {
    expect(getWatchedTimerGlobals()).toContain('Date');
    expect(getWatchedTimerGlobals()).toContain('setTimeout');
  });

  it('omits what this environment does not have', () => {
    // The snapshot is taken at import time and only records globals that exist, so a name present
    // in the list is a name the environment really has — never one invented for the code under test.
    for (const name of getWatchedTimerGlobals()) {
      expect(readGlobal(name)).toBeDefined();
    }
  });
});
