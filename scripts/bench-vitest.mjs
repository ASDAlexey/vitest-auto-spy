#!/usr/bin/env node
// Running one `vitest bench` pass and keeping its output out of the way.
//
// Vitest's benchmark reporter prints ten columns, of which this project publishes exactly one; the
// rest invite a reader to quote a figure the methodology rejects. So every command here buffers the
// stock reporter and renders its own table from the JSON. The buffer is surfaced only when the run
// fails, where it is the only diagnosis there is.
//
// Vitest 5 removed `--outputJson`; results reach the outside world through a reporter instead, so
// the results file is written by `bench-json-reporter.mjs`, added *beside* the stock one rather than
// replacing it — the stock reporter's output is the diagnosis when a run fails.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { env as processEnv, execPath, exit, stderr } from 'node:process';
import { fileURLToPath } from 'node:url';

const TICK_MS = 5000;

// Relative to the repository root, which is every bench config's Vite root and this child's cwd.
const REPORTER = './scripts/bench-json-reporter.mjs';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// `vitest/vitest.mjs` is not an export, so resolve the package and join the file. The `.bin` shim is
// avoided on purpose — it is a `.cmd` on Windows and cannot be spawned as a Node script.
const vitest = join(dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs');

function elapsed(started) {
  return Math.round((Date.now() - started) / 1000);
}

// Progress rewrites one line on stderr: the table on stdout stays clean for `> table.md`, and the
// text only ever grows, so `\r` alone overwrites it without an erase sequence a log file would keep.
function progress(text) {
  stderr.write(`\r${text}`);
}

/**
 * One measurement pass, in its own process.
 *
 * Separate processes matter: repeating inside one would inherit the previous pass's heap and JIT
 * state, which is exactly the variation the repeats exist to expose.
 *
 * @param {{ config: string, outputPath: string, label: string, env?: NodeJS.ProcessEnv }} options
 */
export function runBenchPass({ config, outputPath, label, env }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const buffered = [];

    const child = spawn(
      execPath,
      [vitest, 'bench', '--run', '--config', config, '--reporter', 'default', '--reporter', REPORTER],
      {
        cwd: repoRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        // The reporter takes no command-line arguments of its own, so the destination travels by
        // environment. Relative paths land in `repoRoot`, which is the child's cwd.
        env: { ...(env ?? processEnv), BENCH_OUTPUT_JSON: outputPath },
      },
    );

    child.stdout.on('data', (chunk) => buffered.push(chunk));
    child.stderr.on('data', (chunk) => buffered.push(chunk));

    const ticker = setInterval(() => {
      progress(`  ${label} ${elapsed(started)}s`);
    }, TICK_MS);

    child.on('close', (code) => {
      clearInterval(ticker);

      if (code !== 0) {
        stderr.write(`\n${Buffer.concat(buffered).toString()}`);
        stderr.write(`\nBenchmark run failed with exit code ${code}.\n`);
        exit(code ?? 1);
      }

      progress(`  ${label} done in ${elapsed(started)}s\n`);
      resolve();
    });
  });
}
