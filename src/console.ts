/**
 * `vitest-auto-spy/console` — silent, fully-typed spies over the global `console`.
 *
 * ```ts
 * import { type ConsoleSpies, installConsoleSpies, restoreConsole } from 'vitest-auto-spy/console';
 *
 * let consoleSpies: ConsoleSpies;
 *
 * beforeEach(() => {
 *   consoleSpies = installConsoleSpies();
 * });
 * afterEach(() => restoreConsole());
 *
 * it('reports the failure', () => {
 *   service.doWork();
 *   expect(consoleSpies.consoleErrorSpy).toHaveBeenCalledWith('boom');
 * });
 * ```
 *
 * The exported `consoleErrorSpy` & co. are the same objects. Importing the entry also installs them,
 * once per worker — unless `setupAutoSpy({ strayConsole })` owns the console, where it installs nothing.
 */
import { consoleSpiesForImport } from './lib/console-spy';
import { hasMockAdapter, registerMockAdapter } from './lib/mock-adapter';
import { vitestMockAdapter } from './lib/vitest-adapter';

// This entry may be imported without the core, so it needs an adapter — but it
// is not runtime-specific: register the default Vitest adapter only when no
// runtime entry (e.g. `vitest-auto-spy/bun`, imported first) installed its own.
if (!hasMockAdapter()) {
  registerMockAdapter(vitestMockAdapter);
}

export const {
  consoleDebugSpy,
  consoleErrorSpy,
  consoleInfoSpy,
  consoleLogSpy,
  consoleTimeEndSpy,
  consoleTimeSpy,
  consoleTraceSpy,
  consoleWarnSpy,
} = consoleSpiesForImport();

export { installConsoleSpies, resetConsoleSpies, restoreConsole } from './lib/console-spy';
export type { ConsoleMethodSpy, ConsoleSpies } from './lib/console-spy';
