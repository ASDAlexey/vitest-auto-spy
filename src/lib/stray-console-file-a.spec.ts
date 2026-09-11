/**
 * One of two identical files. Under `isolate: false` (`npm run test:shared-env`) whichever of them
 * runs second meets a `vitest-auto-spy/console` the first one already evaluated — the case an
 * import-time install got wrong, silencing every later file of the worker.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ConsoleSpies } from '../console';
import '../index';
import { setupAutoSpy } from './setup-auto-spy';
import { stopGuardingConsole } from './stray-console';

// Silenced before the guard wraps it, so the output the failing test forwards stays out of the log.
const realError = console.error;

console.error = (): void => undefined;

afterAll(() => {
  stopGuardingConsole();
  console.error = realError;
});

describe('the console entry under the stray-console guard (file a)', () => {
  setupAutoSpy({ duplicateCopies: 'off', strayConsole: 'throw' });

  let entry: typeof import('../console');

  beforeAll(async () => {
    // Imported once the guard is armed, as a spec file is once a setup file has called setupAutoSpy.
    entry = await import('../console');
  });

  it('installs nothing on import', () => {
    expect(console.error).not.toBe(entry.consoleErrorSpy);
  });

  describe('with installConsoleSpies() in beforeEach and restoreConsole() in afterEach', () => {
    let consoleSpies: ConsoleSpies;

    beforeEach(() => {
      consoleSpies = entry.installConsoleSpies();
    });

    afterEach(() => {
      entry.restoreConsole();
    });

    it('absorbs what the test expects, on the bag and on the exported constant alike', () => {
      console.error('expected in file a');

      expect(consoleSpies.consoleErrorSpy).toHaveBeenCalledWith('expected in file a');
      expect(entry.consoleErrorSpy).toBe(consoleSpies.consoleErrorSpy);
    });

    it('starts the next test with nothing recorded', () => {
      expect(consoleSpies.consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  it.fails('fails a test that prints without installing the spies', () => {
    console.error('unexpected in file a');
  });
});
