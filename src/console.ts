/**
 * `vitest-auto-spy/console` — silent, fully-typed spies over the global `console`.
 *
 * ```ts
 * import { useConsoleSpies } from 'vitest-auto-spy/console';
 *
 * const { consoleErrorSpy } = useConsoleSpies();
 *
 * it('reports the failure', () => {
 *   service.doWork();
 *   expect(consoleErrorSpy).toHaveBeenCalledWith('boom');
 * });
 * ```
 *
 * `useConsoleSpies()` registers the `installConsoleSpies()` / `restoreConsole()` hook pair; on `node:test`
 * and Rstest register that pair yourself. The exported `consoleErrorSpy` & co. are the same objects. Importing the entry also installs them,
 * once per worker — unless `setupAutoSpy({ strayConsole })` owns the console, where it installs nothing.
 */
import { consoleSpiesForImport } from './lib/console-spy';
import { useVitestAdapter } from './lib/use-vitest-adapter';

useVitestAdapter();

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

export { consoleOutput, installConsoleSpies, resetConsoleSpies, restoreConsole, useConsoleSpies } from './lib/console-spy';
export type { ConsoleChannel, ConsoleMethodSpy, ConsoleOutput, ConsoleSpies } from './lib/console-spy';
