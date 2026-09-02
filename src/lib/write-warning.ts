/**
 * The channel for a warning that has to survive the runner: stderr where there is one, the console
 * where there is not.
 *
 * Not `console.warn` under Vitest: it attributes intercepted console output to the task that
 * produced it, and a line written outside any task — from a setup file, or after a file's last
 * test — is dropped and never seen (checked on 4.1.9: it reappears only under
 * `disableConsoleIntercept`). `process.stderr` is the channel that survives.
 */
export function writeWarning(message: string): void {
  const stderr = globalThis.process?.stderr;

  if (stderr) {
    stderr.write(`${message}\n`);

    return;
  }

  // eslint-disable-next-line no-console -- browser-like environment with no `process`: the console is the only channel left.
  console.warn(message);
}
