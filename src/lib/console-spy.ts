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
 * Call `installConsoleSpies()` in a `beforeEach` and `restoreConsole()` in an `afterEach`; the entry
 * also installs them on import, unless the stray-console guard owns the console.
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

/**
 * The seam `setupAutoSpy()` clears these spies through, and the one the stray-console guard takes
 * them off by: slots on `globalThis`, so `/setup` never imports this entry.
 */
declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyResetConsoleSpies__: (() => void) | undefined;
  var __vitestAutoSpyDetachConsoleSpies__: (() => void) | undefined;
}

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

function createMethodSpy(method: SpiedConsoleMethod): ConsoleMethodSpy {
  const spy = createFunctionSpy<ConsoleMethodFn>(`console.${method}`);

  activeSpies.set(method, spy);

  return spy;
}

function createConsoleSpies(): ConsoleSpies {
  if (installedSpies) {
    return installedSpies;
  }

  globalThis.__vitestAutoSpyResetConsoleSpies__ = resetConsoleSpies;
  globalThis.__vitestAutoSpyDetachConsoleSpies__ = detachConsoleSpies;

  installedSpies = {
    consoleDebugSpy: createMethodSpy('debug'),
    consoleErrorSpy: createMethodSpy('error'),
    consoleInfoSpy: createMethodSpy('info'),
    consoleLogSpy: createMethodSpy('log'),
    consoleTimeEndSpy: createMethodSpy('timeEnd'),
    consoleTimeSpy: createMethodSpy('time'),
    consoleTraceSpy: createMethodSpy('trace'),
    consoleWarnSpy: createMethodSpy('warn'),
  };

  return installedSpies;
}

/** Put every spy on `console`, remembering what it replaced; a spy already in place is left alone. */
function mountConsoleSpies(): void {
  for (const [method, spy] of activeSpies) {
    if (getConsoleMethod(method) !== spy) {
      originalMethods.set(method, getConsoleMethod(method));
      setConsoleMethod(method, spy);
    }
  }
}

/** Take the spies off `console` but keep them, so the exported bindings stay valid for a later install. */
function detachConsoleSpies(): void {
  for (const [method, spy] of activeSpies) {
    const original = originalMethods.get(method);

    if (original && getConsoleMethod(method) === spy) {
      setConsoleMethod(method, original);
    }
  }
}

/**
 * Replace the spied console methods with silent typed spies. Idempotent:
 * repeated calls return the already-installed bag, putting its spies back on
 * `console` if something took them off.
 *
 * @example
 * ```ts
 * const spies = installConsoleSpies();
 *
 * service.doWork();
 * expect(spies.warn).toHaveBeenCalledWith('deprecated');
 * ```
 */
export function installConsoleSpies(): ConsoleSpies {
  const spies = createConsoleSpies();

  mountConsoleSpies();

  return spies;
}

/**
 * The `/console` entry's import: installed unless the stray-console guard owns the console, since under
 * `isolate: false` an import runs once per worker and cannot scope itself to a file.
 */
export function consoleSpiesForImport(): ConsoleSpies {
  const spies = createConsoleSpies();

  if (Reflect.get(globalThis, '__vitestAutoSpyStrayConsole__') === undefined) {
    mountConsoleSpies();
  }

  return spies;
}

/**
 * Clear the recorded calls of every installed console spy (the spies stay installed).
 *
 * @example
 * ```ts
 * resetConsoleSpies(); // recorded calls dropped, the spies stay installed
 * ```
 */
export function resetConsoleSpies(): void {
  const adapter = getMockAdapter();

  for (const spy of activeSpies.values()) {
    adapter.reset(spy);
  }
}

/**
 * Put the original console methods back and clear what the spies recorded. The spies are kept, so the
 * exported `consoleErrorSpy` & co. stay live in every file of the worker for the next install.
 *
 * @example
 * ```ts
 * afterEach(() => restoreConsole()); // the real console methods are back
 * ```
 */
export function restoreConsole(): void {
  for (const [method, original] of originalMethods) {
    setConsoleMethod(method, original);
  }

  originalMethods.clear();
  resetConsoleSpies();
}
