#!/usr/bin/env node
// Run the head-to-head benchmark and print only the rendered table.
//
// Vitest's own benchmark reporter prints ten columns — `hz`, `min`, `max`, `mean` and four
// percentiles — of which this project publishes exactly one; the rest invite a reader to quote a
// figure the methodology rejects. Replacing the reporter to silence it is not an option: the same
// class writes `--outputJson`, so a custom reporter silently produces no results file. This wrapper
// keeps the stock reporter and buffers its output instead, surfacing it only when the run fails.

import { spawn } from 'node:child_process';
import { argv, env, execPath, exit, stderr } from 'node:process';
import { fileURLToPath } from 'node:url';

import { repoRoot, runBenchPass } from './bench-vitest.mjs';

const RESULTS = 'bench-results.json';

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
    await runBenchPass({
      config: 'vitest.bench.vs.config.mts',
      outputPath,
      label: repeat === 1 ? 'measuring…' : `pass ${pass}/${repeat}`,
      env: childEnv,
    });
    outputs.push(outputPath);
  }

  stderr.write('\n');

  const report = spawn(execPath, [fileURLToPath(new URL('bench-report.mjs', import.meta.url)), ...outputs, ...passthrough], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: childEnv,
  });

  report.on('close', (reportCode) => exit(reportCode ?? 0));
}

run();
