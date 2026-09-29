/* eslint-disable vitest-auto-spy/no-console-in-spec -- the console spies are the subject: the spec writes to them on purpose */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { consoleInfoSpy, consoleOutput, installConsoleSpies, restoreConsole, useConsoleSpies } from './console';

describe('useConsoleSpies', () => {
  let realInfo: typeof console.info;

  beforeAll(() => {
    // Importing the entry installs the spies once per worker; start from the real console.
    restoreConsole();
    realInfo = console.info;
  });

  afterAll(() => {
    expect(console.info).toBe(realInfo);
  });

  describe('in the block that calls it', () => {
    const spies = useConsoleSpies();

    it('returns the bag the entry exports, before any test runs', () => {
      expect(spies.consoleInfoSpy).toBe(consoleInfoSpy);
      expect(installConsoleSpies()).toBe(spies);
    });

    it('has the spies on console in every test, recording nothing from the previous one', () => {
      expect(console.info).toBe(spies.consoleInfoSpy);
      expect(consoleOutput()).toStrictEqual({});

      console.info('first');
      restoreConsole();
    });

    it('puts them back after a test took them off', () => {
      expect(console.info).toBe(spies.consoleInfoSpy);
      expect(consoleOutput()).toStrictEqual({});

      console.info('second');
      expect(consoleOutput()).toStrictEqual({ info: [['second']] });
    });
  });

  it('leaves the real console in place outside that block', () => {
    expect(console.info).toBe(realInfo);
    expect(vi.isMockFunction(console.info)).toBe(false);
  });
});
