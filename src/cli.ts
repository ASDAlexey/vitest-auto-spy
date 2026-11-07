/**
 * The `vitest-auto-spy` executable.
 *
 * It imports nothing from the library core on purpose: `init` writes files rather than creating
 * spies, and the core would drag Vitest — which refuses to be loaded outside a test run — into a
 * plain Node process.
 */
import type { CliIo } from './cli/main';
import { guardBrokenPipe, runCli, settle } from './cli/main';

// Before the first write: `npx vitest-auto-spy codemod | head` closes the pipe mid-report, and an
// unhandled EPIPE turned that into a stack trace over a run that had already answered.
for (const stream of [process.stdout, process.stderr]) {
  guardBrokenPipe(stream, () => process.exit(typeof process.exitCode === 'number' ? process.exitCode : 0));
}

const io: CliIo = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

void settle(() => runCli(process.argv.slice(2), io), io).then((code) => {
  process.exitCode = code;
});
