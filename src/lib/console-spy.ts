/**
 * Console spies — silent, fully-typed spies over the global `console` methods.
 *
 * `installConsoleSpies()` swaps each spied method (`debug`, `error`, `info`,
 * `log`, `time`, `timeEnd`, `trace`, `warn`) for a {@link createFunctionSpy}
 * mock, so a test asserts logging without hand-rolling `vi.spyOn(console, …)`
 * in every suite — and without the real output polluting the test run:
 *
 * ```ts
 * import { consoleInfoSpy } from 'vitest-auto-spy/console';
 *
 * service.doWork();
 * expect(consoleInfoSpy).toHaveBeenCalledWith('done');
 * ```
 *
 * The `vitest-auto-spy/console` entry calls `installConsoleSpies()` on import,
 * so importing any spy is enough. `restoreConsole()` puts the original methods
 * back; `resetConsoleSpies()` clears recorded calls between tests (Vitest's
 * `clearMocks: true` already does that — the helper covers other setups).
 */
import { createFunctionSpy } from './function-spy';
import { getMockAdapter } from './mock-adapter';
import type { AddSpyMethodsByReturnTypes, Func } from './types';

/** The call shape shared by every spied console method. */
type ConsoleMethodFn = (...data: unknown[]) => void;

/** A spy standing in for one `console` method: silent, with all sync helpers attached. */
export type ConsoleMethodSpy = AddSpyMethodsByReturnTypes<ConsoleMethodFn>;

/** The bag of installed console spies, one per spied method. */
export interface ConsoleSpies {
  consoleDebugSpy: ConsoleMethodSpy;
  consoleErrorSpy: ConsoleMethodSpy;
  consoleInfoSpy: ConsoleMethodSpy;
  consoleLogSpy: ConsoleMethodSpy;
  consoleTimeEndSpy: ConsoleMethodSpy;
  consoleTimeSpy: ConsoleMethodSpy;
  consoleTraceSpy: ConsoleMethodSpy;
  consoleWarnSpy: ConsoleMethodSpy;
}

type SpiedConsoleMethod = 'debug' | 'error' | 'info' | 'log' | 'time' | 'timeEnd' | 'trace' | 'warn';

// The originals are kept as the loose `Func`: the global `console` methods are
// overloaded (DOM + Node type merge), which no single strict signature matches.
const originalMethods = new Map<SpiedConsoleMethod, Func>();
const activeSpies = new Map<SpiedConsoleMethod, ConsoleMethodSpy>();
let installedSpies: ConsoleSpies | undefined;

function getConsoleMethod(method: SpiedConsoleMethod): Func {
  // eslint-disable-next-line no-console -- capturing the original implementation so `restoreConsole()` can put it back
  return console[method];
}

function setConsoleMethod(method: SpiedConsoleMethod, implementation: Func): void {
  // eslint-disable-next-line no-console -- swapping a console method for its spy (and back) is this module's entire purpose
  console[method] = implementation;
}

function installMethodSpy(method: SpiedConsoleMethod): ConsoleMethodSpy {
  originalMethods.set(method, getConsoleMethod(method));

  const spy = createFunctionSpy<ConsoleMethodFn>(`console.${method}`);
  setConsoleMethod(method, spy);
  activeSpies.set(method, spy);

  return spy;
}

/**
 * Replace the spied console methods with silent typed spies. Idempotent:
 * repeated calls return the already-installed bag.
 */
export function installConsoleSpies(): ConsoleSpies {
  if (installedSpies) {
    return installedSpies;
  }

  installedSpies = {
    consoleDebugSpy: installMethodSpy('debug'),
    consoleErrorSpy: installMethodSpy('error'),
    consoleInfoSpy: installMethodSpy('info'),
    consoleLogSpy: installMethodSpy('log'),
    consoleTimeEndSpy: installMethodSpy('timeEnd'),
    consoleTimeSpy: installMethodSpy('time'),
    consoleTraceSpy: installMethodSpy('trace'),
    consoleWarnSpy: installMethodSpy('warn'),
  };

  return installedSpies;
}

/** Clear the recorded calls of every installed console spy (the spies stay installed). */
export function resetConsoleSpies(): void {
  const adapter = getMockAdapter();

  for (const spy of activeSpies.values()) {
    adapter.reset(spy);
  }
}

/** Put the original console methods back and forget the installed spies. */
export function restoreConsole(): void {
  for (const [method, original] of originalMethods) {
    setConsoleMethod(method, original);
  }

  originalMethods.clear();
  activeSpies.clear();
  installedSpies = undefined;
}
