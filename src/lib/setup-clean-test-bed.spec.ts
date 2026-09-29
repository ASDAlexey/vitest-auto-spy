/**
 * The core half of the clean-bed check: `setupAutoSpy` never imports Angular, so it runs whatever
 * check the Angular helpers left on `globalThis`, and grades the report like every other guard.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import '../index';
import { useConsoleSpies } from './console-spy';
import { setupAutoSpy } from './setup-auto-spy';
import { CLEAN_TEST_BED_CHECK, cleanTestBedSweeps } from './setup-clean-test-bed';

// Top level on purpose: an explicit grade is the one `setupAutoSpy` branch the other setup specs leave out.
setupAutoSpy({ cleanTestBed: 'off' });

const previous: unknown = Reflect.get(globalThis, CLEAN_TEST_BED_CHECK);

afterEach(() => {
  Reflect.set(globalThis, CLEAN_TEST_BED_CHECK, previous);
  vi.restoreAllMocks();
});

function runSweep(reaction: 'throw' | 'warn'): (() => void) | undefined {
  const [sweep] = cleanTestBedSweeps(reaction);

  return sweep?.();
}

describe('cleanTestBedSweeps', () => {
  const { consoleWarnSpy: warn } = useConsoleSpies();

  it('adds no sweep when turned off', () => {
    expect(cleanTestBedSweeps('off')).toEqual([]);
  });

  it('has nothing to report when no check is armed, or the check found nothing', () => {
    Reflect.set(globalThis, CLEAN_TEST_BED_CHECK, undefined);
    expect(runSweep('throw')).toBeUndefined();

    Reflect.set(globalThis, CLEAN_TEST_BED_CHECK, () => undefined);
    expect(runSweep('throw')).toBeUndefined();
  });

  it('throws the report under throw', () => {
    Reflect.set(globalThis, CLEAN_TEST_BED_CHECK, () => 'dirty bed');

    expect(runSweep('throw')).toThrow('dirty bed');
  });

  it('prints the report under warn', () => {
    Reflect.set(globalThis, CLEAN_TEST_BED_CHECK, () => 'dirty bed');
    runSweep('warn')?.();

    expect(warn).toHaveBeenCalledWith('dirty bed');
  });

  it('turns a check that throws into a report rather than breaking the other file-end sweeps', () => {
    Reflect.set(globalThis, CLEAN_TEST_BED_CHECK, () => {
      throw new Error('broken check');
    });
    expect(runSweep('throw')).toThrow('Checking the TestBed at the end of the file threw: broken check');

    Reflect.set(globalThis, CLEAN_TEST_BED_CHECK, () => {
      throw 'broken';
    });
    expect(runSweep('throw')).toThrow('threw: broken');
  });
});
