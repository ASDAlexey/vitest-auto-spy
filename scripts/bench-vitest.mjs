#!/usr/bin/env node
// Running one `vitest bench` pass and keeping its output out of the way.
//
// Vitest's benchmark reporter prints ten columns, of which this project publishes exactly one; the
// rest invite a reader to quote a figure the methodology rejects. Replacing the reporter is not an
// option — the same class writes `--outputJson`, so a custom reporter silently produces no results
// file — so every command here buffers the stock reporter instead and renders its own table from
// the JSON. The buffer is surfaced only when the run fails, where it is the only diagnosis there is.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { execPath, exit, stderr } from 'node:process';
import { fileURLToPath } from 'node:url';

const TICK_MS = 5000;

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

    const child = spawn(execPath, [vitest, 'bench', '--run', '--config', config, '--outputJson', outputPath], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

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
