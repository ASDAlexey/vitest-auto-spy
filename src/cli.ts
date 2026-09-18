/**
 * The `vitest-auto-spy` executable.
 *
 * It imports nothing from the library core on purpose: `init` writes files rather than creating
 * spies, and the core would drag Vitest — which refuses to be loaded outside a test run — into a
 * plain Node process.
 */
import { guardBrokenPipe, runCli } from './cli/main';

// Before the first write: `npx vitest-auto-spy codemod | head` closes the pipe mid-report, and an
// unhandled EPIPE turned that into a stack trace over a run that had already answered.
for (const stream of [process.stdout, process.stderr]) {
  guardBrokenPipe(stream, () => process.exit(typeof process.exitCode === 'number' ? process.exitCode : 0));
}

process.exitCode = runCli(process.argv.slice(2), {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
});
