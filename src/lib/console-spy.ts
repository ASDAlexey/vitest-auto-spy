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
 * Call `useConsoleSpies()` in the `describe` (or at the top of the file) that asserts on the console, or
 * `installConsoleSpies()` in a `beforeEach` and `restoreConsole()` in an `afterEach` yourself; the
 * entry also installs them on import, unless the stray-console guard owns the console.
 */
import { createFunctionSpy, reinstallDispatch } from './function-spy';
import { getMockAdapter, hasMockAdapter } from './mock-adapter';
import { getRunnerHooks } from './runner-hooks';
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
// The channel of every call in the order they came, for `consoleLines()`: no runner keeps an order across mocks.
let callOrder: ConsoleChannel[] = [];

// Live bindings: where the runner's adapter registers after the entry is imported, the spies are
// built by the first install and these pick them up.
export let consoleDebugSpy: ConsoleMethodSpy;
export let consoleErrorSpy: ConsoleMethodSpy;
export let consoleInfoSpy: ConsoleMethodSpy;
export let consoleLogSpy: ConsoleMethodSpy;
export let consoleTimeEndSpy: ConsoleMethodSpy;
export let consoleTimeSpy: ConsoleMethodSpy;
export let consoleTraceSpy: ConsoleMethodSpy;
export let consoleWarnSpy: ConsoleMethodSpy;

function getConsoleMethod(method: SpiedConsoleMethod): Func {
  // eslint-disable-next-line no-console -- capturing the original implementation so `restoreConsole()` can put it back
  return console[method];
}

function setConsoleMethod(method: SpiedConsoleMethod, implementation: Func): void {
  // eslint-disable-next-line no-console -- swapping a console method for its spy (and back) is this module's entire purpose
  console[method] = implementation;
}

function createMethodSpy(method: SpiedConsoleMethod): ConsoleMethodSpy {
  const spy = createFunctionSpy<ConsoleMethodFn>(`console.${method}`, {
    className: undefined,
    implementation: true,
    handle: (): undefined => {
      if (isChannel(method)) {
        callOrder.push(method);
      }

      return undefined;
    },
  });

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

  ({ consoleDebugSpy, consoleErrorSpy, consoleInfoSpy, consoleLogSpy, consoleTimeEndSpy, consoleTimeSpy, consoleTraceSpy, consoleWarnSpy } =
    installedSpies);

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
 * expect(spies.consoleWarnSpy).toHaveBeenCalledWith('deprecated');
 * ```
 */
export function installConsoleSpies(): ConsoleSpies {
  const spies = createConsoleSpies();

  mountConsoleSpies();

  return spies;
}

/**
 * Install the console spies before every test of the enclosing block and restore the console after
 * each. The bag is the same object in every test, so it is returned directly.
 *
 * Registers the hooks of the runner whose entry was imported (`vitest-auto-spy/node`, `/bun`,
 * `/rstest`), or Vitest's own.
 *
 * @example
 * ```ts
 * describe('cli', () => {
 *   const { consoleInfoSpy } = useConsoleSpies();
 *
 *   it('reports the result', () => {
 *     run(['--dry-run']);
 *     expect(consoleInfoSpy).toHaveBeenCalledWith('done');
 *   });
 * });
 * ```
 */
export function useConsoleSpies(): ConsoleSpies {
  const hooks = getRunnerHooks('useConsoleSpies()');

  hooks.beforeEach(() => {
    installConsoleSpies();
  });
  hooks.afterEach(() => {
    restoreConsole();
  });

  return createConsoleSpies();
}

/**
 * The `/console` entry's import: installed unless the stray-console guard owns the console, since under
 * `isolate: false` an import runs once per worker and cannot scope itself to a file. Before any runner
 * entry registered an adapter, nothing is built: the first install does it.
 */
export function consoleSpiesForImport(): ConsoleSpies | undefined {
  if (!hasMockAdapter()) {
    return undefined;
  }

  const spies = createConsoleSpies();

  if (Reflect.get(globalThis, '__vitestAutoSpyStrayConsole__') === undefined) {
    mountConsoleSpies();
  }

  return spies;
}

/** A console method that writes, as `consoleOutput()` keys it. */
export type ConsoleChannel = 'debug' | 'error' | 'info' | 'log' | 'trace' | 'warn';

/** What a test wrote, per channel: the arguments of each call. A channel nothing wrote to is absent; keys come in alphabetical order. */
export type ConsoleOutput = Partial<Record<ConsoleChannel, unknown[][]>>;

const CHANNEL_LIST: readonly ConsoleChannel[] = ['debug', 'error', 'info', 'log', 'trace', 'warn'];

const CHANNELS: ReadonlySet<string> = new Set<ConsoleChannel>(CHANNEL_LIST);

function isChannel(method: string): method is ConsoleChannel {
  return CHANNELS.has(method);
}

/**
 * Everything the console spies recorded, as one value. Only the channels written to appear, so an
 * exact comparison pins the whole output and a stray warning fails it with a diff.
 *
 * @example
 * ```ts
 * cli.run(['--dry-run']);
 * expect(consoleOutput()).toStrictEqual({ info: [['done']] });
 * expect(consoleOutput()).toStrictEqual({}); // wrote nothing at all
 * expect(Object.keys(consoleOutput())).toStrictEqual(['info']); // only info, whatever it said
 * ```
 */
export function consoleOutput(): ConsoleOutput {
  const output: ConsoleOutput = {};

  for (const [channel, calls] of recordedCalls('consoleOutput()')) {
    if (calls.length > 0) {
      output[channel] = calls.map((args) => [...args]);
    }
  }

  return output;
}

/** One call to a console channel: the channel, then the arguments it was called with. */
export type ConsoleLine = [channel: ConsoleChannel, ...args: unknown[]];

/**
 * Everything the console spies recorded, as one list in call order across channels — what
 * `consoleOutput()` cannot say, since it groups per channel.
 *
 * @example
 * ```ts
 * cli.run(['--dry-run']);
 * expect(consoleLines()).toStrictEqual([['warn', 'deprecated flag'], ['info', 'done']]);
 * ```
 */
export function consoleLines(): ConsoleLine[] {
  const calls: Record<ConsoleChannel, readonly unknown[][]> = { debug: [], error: [], info: [], log: [], trace: [], warn: [] };

  for (const [channel, recorded] of recordedCalls('consoleLines()')) {
    calls[channel] = recorded;
  }

  const left = {
    debug: calls.debug.length,
    error: calls.error.length,
    info: calls.info.length,
    log: calls.log.length,
    trace: calls.trace.length,
    warn: calls.warn.length,
  };
  const lines: ConsoleLine[] = [];
  const kept: ConsoleChannel[] = [];

  // A clear the spies went through without this module (`vi.clearAllMocks()`, `clearMocks: true`)
  // drops a channel's oldest calls, so the calls still recorded are its last entries here.
  for (const channel of [...callOrder].reverse()) {
    const args = calls[channel][left[channel] - 1];

    if (args !== undefined) {
      left[channel] -= 1;
      lines.push([channel, ...args]);
      kept.push(channel);
    }
  }

  callOrder = kept.reverse();

  const unordered = CHANNEL_LIST.filter((channel) => left[channel] > 0).map((channel) => `console.${channel}`);

  if (unordered.length > 0) {
    throw new Error(
      `[vitest-auto-spy] consoleLines() cannot order the calls of ${unordered.join(', ')}: a mockImplementation or ` +
        'mockReturnValue on that spy answered them instead of the spy itself. Assert on consoleOutput(), or drop the override.',
    );
  }

  return lines.reverse();
}

/** The recorded calls of every written channel's spy, refusing while no spy is on `console`. */
function recordedCalls(reader: string): [ConsoleChannel, readonly unknown[][]][] {
  const adapter = getMockAdapter();
  const recorded: [ConsoleChannel, readonly unknown[][]][] = [];
  let installed = false;

  for (const [method, spy] of activeSpies) {
    installed ||= getConsoleMethod(method) === spy;

    if (isChannel(method)) {
      recorded.push([method, adapter.getCalls(spy)]);
    }
  }

  // Spies that are not on `console` recorded nothing, and an empty result would read as silence.
  if (!installed) {
    throw new Error(
      `[vitest-auto-spy] ${reader} reads the console spies, and none is on console now. Call useConsoleSpies() in ` +
        'the describe, or installConsoleSpies() in a beforeEach, first (under setupAutoSpy({ strayConsole }) importing the entry installs nothing).',
    );
  }

  return recorded;
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
  callOrder = [];

  if (activeSpies.size === 0) {
    return;
  }

  const adapter = getMockAdapter();

  // Bun's `mockReset` drops the spy's own implementation, and `consoleLines()` learns the order from it.
  for (const spy of activeSpies.values()) {
    adapter.reset(spy);
    reinstallDispatch(spy);
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
