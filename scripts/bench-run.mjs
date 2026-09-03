#!/usr/bin/env node
// Run the head-to-head benchmark and print only the rendered table.
//
// Vitest's own benchmark reporter prints ten columns — `hz`, `min`, `max`, `mean` and four
// percentiles — of which this project publishes exactly one; the rest invite a reader to quote a
// figure the methodology rejects. Replacing the reporter to silence it is not an option: the same
// class writes `--outputJson`, so a custom reporter silently produces no results file. This wrapper
// keeps the stock reporter and buffers its output instead, surfacing it only when the run fails.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { argv, env, execPath, exit, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULTS = 'bench-results.json';
const TICK_MS = 5000;

const root = fileURLToPath(new URL('..', import.meta.url));
// `vitest/vitest.mjs` is not an export, so resolve the package and join the file. The `.bin` shim is
// avoided on purpose — it is a `.cmd` on Windows and cannot be spawned as a Node script.
const vitest = join(dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs');

/**
 * One measurement pass, in its own process.
 *
 * Separate processes matter: repeating inside one would inherit the previous pass's heap and JIT
 * state, which is exactly the variation the repeats exist to expose.
 */
function measure(outputPath, label, childEnv) {
  return new Promise((resolve) => {
    const started = Date.now();
    const buffered = [];

    const child = spawn(
      execPath,
      [vitest, 'bench', '--run', '--config', 'vitest.bench.vs.config.mts', '--outputJson', outputPath],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: childEnv },
    );

    child.stdout.on('data', (chunk) => buffered.push(chunk));
    child.stderr.on('data', (chunk) => buffered.push(chunk));

    const ticker = setInterval(() => {
      stdout.write(`  ${label} ${Math.round((Date.now() - started) / 1000)}s\n`);
    }, TICK_MS);

    child.on('close', (code) => {
      clearInterval(ticker);

      if (code !== 0) {
        stderr.write(Buffer.concat(buffered).toString());
        stderr.write(`\nBenchmark run failed with exit code ${code}.\n`);
        exit(code ?? 1);
      }

      stdout.write(`  ${label} done in ${Math.round((Date.now() - started) / 1000)}s\n`);
      resolve();
    });
  });
}

async function run() {
  const args = argv.slice(2);
  const repeatIndex = args.indexOf('--repeat');

  // Two profiles, because one budget cannot serve both purposes. `--fast` is for editing this file
  // and its numbers are not quotable; `--precise` buys accuracy where it is actually available —
  // more whole runs. Raising the iteration count lowers `rme`, which bounds the mean; it does
  // nothing for the run-to-run spread of the published p75, and that spread is what a reader needs.
  const fast = args.includes('--fast');
  const precise = args.includes('--precise');
  const scale = fast ? 0.125 : precise ? 2 : 1;
  const defaultRepeat = precise ? 7 : 1;
  const repeat = repeatIndex === -1 ? defaultRepeat : Math.max(1, Number(args[repeatIndex + 1]) || 1);
  // Guard the -1: without it `repeatIndex + 1` is 0 when `--repeat` is absent, and the filter eats
  // the first argument the caller actually passed.
  const passthrough = (repeatIndex === -1 ? args : args.filter((_, index) => index !== repeatIndex && index !== repeatIndex + 1)).filter(
    (arg) => arg !== '--fast' && arg !== '--precise',
  );
  const childEnv = { ...env, BENCH_SCALE: String(scale) };

  // Validate before measuring, not after: a stray argument used to be caught by the report, which
  // runs last, so an eleven-minute `--precise` pass was thrown away over a pasted box-drawing
  // character.
  const known = new Set(['--fast', '--precise', '--repeat', '--lang']);
  const stray = passthrough.find((arg, index) => arg.startsWith('-') ? !known.has(arg) : passthrough[index - 1] !== '--lang');

  if (stray) {
    stderr.write(`Unknown argument "${stray}". Known flags: --fast, --precise, --repeat <n>, --lang <code>.\n`);
    exit(1);
  }

  const outputs = [];

  for (let pass = 1; pass <= repeat; pass += 1) {
    const outputPath = repeat === 1 ? RESULTS : `bench-results.${pass}.json`;

    // Sequentially, never concurrently: two passes at once would contend for the cores and report
    // the scheduler instead of the libraries.
    // eslint-disable-next-line no-await-in-loop
    await measure(outputPath, repeat === 1 ? 'measuring…' : `pass ${pass}/${repeat}`, childEnv);
    outputs.push(outputPath);
  }

  stdout.write('\n');

  const report = spawn(execPath, [fileURLToPath(new URL('bench-report.mjs', import.meta.url)), ...outputs, ...passthrough], {
    cwd: root,
    stdio: 'inherit',
    env: childEnv,
  });

  report.on('close', (reportCode) => exit(reportCode ?? 0));
}

run();
