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
import { consoleSpiesForImport } from './lib/console-spy';

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
    // How `setupAutoSpy()` reaches the reset without importing this entry: installing publishes it.
    expect(globalThis.__vitestAutoSpyResetConsoleSpies__).toBe(resetConsoleSpies);

    console.warn('to be cleared');
    expect(consoleWarnSpy).toHaveBeenCalledWith('to be cleared');

    resetConsoleSpies();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('restoreConsole puts the original methods back, and a later install puts the same spies back, emptied', () => {
    console.info('before the restore');
    restoreConsole();
    expect(vi.isMockFunction(console.info)).toBe(false);

    const reinstalled = installConsoleSpies();
    // The same spy, so the exported constant another file imported is not left detached.
    expect(reinstalled.consoleInfoSpy).toBe(consoleInfoSpy);
    expect(console.info).toBe(consoleInfoSpy);
    expect(consoleInfoSpy).not.toHaveBeenCalled();

    restoreConsole();
    expect(vi.isMockFunction(console.info)).toBe(false);
    expect(globalThis.__vitestAutoSpyResetConsoleSpies__).toBe(resetConsoleSpies);
  });

  it('takes the spies off through the detach seam and puts the same ones back on the next install', () => {
    const spies = installConsoleSpies();

    globalThis.__vitestAutoSpyDetachConsoleSpies__?.();
    expect(vi.isMockFunction(console.warn)).toBe(false);

    // Detaching twice finds nothing of its own on the console and leaves it alone.
    globalThis.__vitestAutoSpyDetachConsoleSpies__?.();
    expect(vi.isMockFunction(console.warn)).toBe(false);

    expect(installConsoleSpies()).toBe(spies);
    expect(console.warn).toBe(spies.consoleWarnSpy);

    restoreConsole();
    expect(vi.isMockFunction(console.warn)).toBe(false);
  });

  it('never takes another copy of itself for the real console method', () => {
    // What `vi.resetModules()` leaves behind: the spy of the previous copy of this module is still
    // on `console`, and the new copy has empty maps. Recording that spy as "the original" made
    // `restoreConsole()` install a function nothing can reach — every log of the rest of the worker
    // swallowed. The mark is a `Symbol.for`, so the copies recognise each other's spies.
    const real = installConsoleSpies() && console.log;

    restoreConsole();

    const realLog = console.log;
    const orphan = (): void => undefined;

    Object.defineProperty(orphan, Symbol.for('vitest-auto-spy.console-spy'), { value: true });
    console.log = orphan;

    installConsoleSpies();

    expect(console.log).not.toBe(orphan);

    restoreConsole();

    expect(console.log).toBe(realLog);
    expect(vi.isMockFunction(real)).toBe(true);
  });

  it('keeps the orphan as the original where the shared registry has nothing to offer', () => {
    restoreConsole();

    const realLog = console.log;
    const orphan = (): void => undefined;

    Object.defineProperty(orphan, Symbol.for('vitest-auto-spy.console-spy'), { value: true });
    Reflect.set(globalThis, '__vitestAutoSpyConsoleOriginals__', undefined);
    console.log = orphan;

    installConsoleSpies();
    restoreConsole();

    // Nothing better is on offer: the registry was emptied, so the orphan is what goes back — and
    // the real method is put back here so the rest of the file is not left with it.
    expect(console.log).toBe(orphan);
    console.log = realLog;
  });

  it('builds the spies without installing them when the stray-console guard owns the console', () => {
    Reflect.set(globalThis, '__vitestAutoSpyStrayConsole__', { host: console });

    const spies = consoleSpiesForImport();

    Reflect.set(globalThis, '__vitestAutoSpyStrayConsole__', undefined);
    // Never installed, so there is nothing recorded to put back.
    globalThis.__vitestAutoSpyDetachConsoleSpies__?.();

    expect(vi.isMockFunction(console.error)).toBe(false);
    expect(installConsoleSpies()).toBe(spies);
    expect(console.error).toBe(spies.consoleErrorSpy);

    restoreConsole();
  });
});
