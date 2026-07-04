/**
 * `vitest-auto-spy/console` — opt-in console spies.
 *
 * Importing this entry (in a test file or your Vitest setup file) replaces
 * `console.debug` / `error` / `info` / `log` / `time` / `timeEnd` / `trace` /
 * `warn` with silent, fully-typed spies and exports each one ready to assert:
 *
 * ```ts
 * import { consoleInfoSpy, consoleWarnSpy } from 'vitest-auto-spy/console';
 *
 * service.doWork();
 *
 * expect(consoleInfoSpy).toHaveBeenCalledWith('done');
 * expect(consoleWarnSpy).not.toHaveBeenCalled();
 * ```
 *
 * `restoreConsole()` undoes the patching; `resetConsoleSpies()` clears the
 * recorded calls between tests (or let Vitest's `clearMocks: true` do it).
 */
import { installConsoleSpies } from './lib/console-spy';
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
} = installConsoleSpies();

export { installConsoleSpies, resetConsoleSpies, restoreConsole } from './lib/console-spy';
export type { ConsoleMethodSpy, ConsoleSpies } from './lib/console-spy';
