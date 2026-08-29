/**
 * The `vitest-auto-spy` executable.
 *
 * It imports nothing from the library core on purpose: `init` writes files rather than creating
 * spies, and the core would drag Vitest — which refuses to be loaded outside a test run — into a
 * plain Node process.
 */
import { runCli } from './cli/main';

process.exitCode = runCli(process.argv.slice(2), {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
});
