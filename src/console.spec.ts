/**
 * `vitest-auto-spy/console` — importing the entry must patch the global
 * console with silent typed spies. Per-file isolation (vitest `isolate: true`)
 * keeps the patching local to this spec.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  consoleDebugSpy,
  consoleErrorSpy,
  consoleInfoSpy,
  consoleLogSpy,
  consoleTimeEndSpy,
  consoleTimeSpy,
  consoleTraceSpy,
  consoleWarnSpy,
  installConsoleSpies,
  resetConsoleSpies,
  restoreConsole,
} from './console';

describe('vitest-auto-spy/console', () => {
  it('replaces every console method with a silent typed spy on import', () => {
    const cases: [keyof Console, unknown][] = [
      ['debug', consoleDebugSpy],
      ['error', consoleErrorSpy],
      ['info', consoleInfoSpy],
      ['log', consoleLogSpy],
      ['time', consoleTimeSpy],
      ['timeEnd', consoleTimeEndSpy],
      ['trace', consoleTraceSpy],
      ['warn', consoleWarnSpy],
    ];

    for (const [method, spy] of cases) {
      expect(vi.isMockFunction(spy)).toBe(true);
      expect(console[method]).toBe(spy);
    }

    expect(console.info('done')).toBeUndefined(); // silent — no real output
    expect(consoleInfoSpy).toHaveBeenCalledWith('done');
  });

  it('is idempotent and resets recorded calls via resetConsoleSpies', () => {
    expect(installConsoleSpies().consoleInfoSpy).toBe(consoleInfoSpy);

    console.warn('to be cleared');
    expect(consoleWarnSpy).toHaveBeenCalledWith('to be cleared');

    resetConsoleSpies();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('restoreConsole puts the original methods back and allows a fresh install', () => {
    restoreConsole();
    expect(vi.isMockFunction(console.info)).toBe(false);

    const reinstalled = installConsoleSpies();
    expect(reinstalled.consoleInfoSpy).not.toBe(consoleInfoSpy);
    expect(console.info).toBe(reinstalled.consoleInfoSpy);

    restoreConsole();
    expect(vi.isMockFunction(console.info)).toBe(false);
  });
});
