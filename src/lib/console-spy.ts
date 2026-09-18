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
  /**
   * The real console methods, shared by every copy of this module in the worker.
   *
   * `vi.resetModules()` gives the next import a fresh copy of this module with empty maps, while the
   * spies of the previous copy are still on `console`. That copy then recorded a spy nobody can reach
   * any more as "the original", and `restoreConsole()` put that dead spy back on `console` for good —
   * every log of the rest of the worker swallowed, and every assertion against a spy that is not the
   * installed one failing. The real methods are remembered here instead, where a new copy finds them.
   */
  var __vitestAutoSpyConsoleOriginals__: Map<string, Func> | undefined;
}

/** Marks a function as a console spy of *some* copy of this module — `Symbol.for`, so the copies agree. */
const CONSOLE_SPY_MARK = Symbol.for('vitest-auto-spy.console-spy');

function sharedOriginals(): Map<string, Func> {
  return (globalThis.__vitestAutoSpyConsoleOriginals__ ??= new Map());
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

  Object.defineProperty(spy, CONSOLE_SPY_MARK, { value: true });
  activeSpies.set(method, spy);

  return spy;
}

/**
 * What `console[method]` was before any copy of this module touched it.
 *
 * A spy of another copy is never taken for the original: after `vi.resetModules()` it is exactly
 * what sits on `console`, and putting it back at the end of the test would install a dead function.
 */
function realConsoleMethod(method: SpiedConsoleMethod): Func {
  const current = getConsoleMethod(method);
  const shared = sharedOriginals();

  if (Reflect.get(current, CONSOLE_SPY_MARK) === true) {
    return shared.get(method) ?? current;
  }

  if (!shared.has(method)) {
    shared.set(method, current);
  }

  return current;
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
      originalMethods.set(method, realConsoleMethod(method));
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
