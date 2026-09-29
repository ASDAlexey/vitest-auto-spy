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
 * `useConsoleSpies()` registers the `installConsoleSpies()` / `restoreConsole()` hook pair on the runner
 * whose entry was imported; the entry never imports `vitest`, so it loads on `node:test`, Bun and Rstest.
 * The exported `consoleErrorSpy` & co. are the same objects. Importing the entry also installs them,
 * once per worker — unless `setupAutoSpy({ strayConsole })` owns the console, where it installs nothing,
 * or no runner entry registered an adapter yet, where the first install builds them.
 */
import { consoleSpiesForImport } from './lib/console-spy';
import { useRunnerAdapter } from './lib/vitest-runner-adapter';

useRunnerAdapter();
consoleSpiesForImport();

export {
  consoleDebugSpy,
  consoleErrorSpy,
  consoleInfoSpy,
  consoleLines,
  consoleLogSpy,
  consoleOutput,
  consoleTimeEndSpy,
  consoleTimeSpy,
  consoleTraceSpy,
  consoleWarnSpy,
  installConsoleSpies,
  resetConsoleSpies,
  restoreConsole,
  useConsoleSpies,
} from './lib/console-spy';
export type { ConsoleChannel, ConsoleLine, ConsoleMethodSpy, ConsoleOutput, ConsoleSpies } from './lib/console-spy';
