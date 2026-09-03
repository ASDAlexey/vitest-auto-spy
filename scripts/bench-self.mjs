#!/usr/bin/env node
// Run the self-comparison benchmark and print the one column this project publishes.
//
// `bench/auto-spy.bench.ts` measures this package against itself — lazy against eager, one option
// against another — and until now it handed the terminal Vitest's stock reporter: ten columns, of
// which nine are noise here, and no ratio at all, so the one question the file exists to answer
// ("is lazy still worth it at this width?") had to be done in the reader's head.
//
// This is the same wrapper `bench:vs` uses, pointed at the self-comparison config: buffer the stock
// reporter, read `--outputJson`, and render p75 — the statistic a garbage-collection pause does not
// move — as a table per case, with each arm's ratio against the fastest one in its own block.
//
// It prints two things, because a double costs time *and* heap and this package's whole argument is
// about the second one: the timing tables from `bench/auto-spy.bench.ts`, then the retained-heap
// table from `bench/memory.bench.ts` run with `BENCH_ARMS=self` — the same harness the full
// `bench:memory` uses, with the five competitor arms switched off so this command still needs no
// install of its own.
//
// Usage:
//   npm run bench                  measure and print both tables
//   npm run bench -- --no-memory   timing only, about ten seconds quicker
//   npm run bench -- --markdown    the same tables as markdown, for pasting into a page
//   npm run bench -- --json <p>    also keep the raw timing results at <p>

import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { argv, env, execPath, exit, stdout } from 'node:process';

import { renderHeading, renderTable, styleFor } from './bench-table.mjs';
import { repoRoot, runBenchPass } from './bench-vitest.mjs';

const DEFAULT_RESULTS = 'bench-results.self.json';

function usage() {
  // The file's own header, so the help and the comment cannot drift apart.
  stdout.write(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 18).join('\n').replace(/^\/\/ ?/gm, ''));
  stdout.write('\n');
}

/** Every case in the results file, each with its arms and their p75 in microseconds. */
function readGroups(path) {
  const json = JSON.parse(readFileSync(path, 'utf8'));

  return (json.files ?? []).flatMap((file) =>
    (file.groups ?? []).map((group) => ({
      title: group.fullName.replace(/^.*?>\s*/, ''),
      arms: (group.benchmarks ?? []).map((row) => ({
        name: row.name,
        microseconds: row.p75 * 1000,
        rme: row.rme,
        samples: row.sampleCount,
      })),
    })),
  );
}

/**
 * One block per case.
 *
 * The reference is the fastest arm in that block rather than a fixed one: these cases compare a
 * setting against another setting, so which arm is the baseline changes from block to block — that
 * is the result, and marking it `✓` is how the block says so without a sentence.
 */
function renderGroup(group, style) {
  const best = Math.min(...group.arms.map((arm) => arm.microseconds));

  const rows = group.arms.map((arm) => [
    arm.microseconds === best ? `${arm.name} ✓` : arm.name,
    `${arm.microseconds.toFixed(2)} µs`,
    Math.round(1e6 / arm.microseconds).toLocaleString('en-US'),
    arm.microseconds === best ? '—' : `${(arm.microseconds / best).toFixed(2)}×`,
    `±${arm.rme.toFixed(1)}%`,
    arm.samples.toLocaleString('en-US'),
  ]);

  return [
    ...renderHeading(group.title, style),
    '',
    ...renderTable(['case', 'per operation ↓', 'operations/sec ↑', 'vs fastest', 'rme ↓', 'samples'], rows, { style }),
    '',
  ];
}

async function main() {
  const args = argv.slice(2);

  if (args.includes('-h') || args.includes('--help')) {
    usage();
    exit(0);
  }

  const jsonIndex = args.indexOf('--json');
  const keptPath = jsonIndex === -1 ? undefined : args[jsonIndex + 1];
  const known = new Set(['--markdown', '--json', '--no-memory']);
  const stray = args.find((arg, index) => (arg.startsWith('-') ? !known.has(arg) : args[index - 1] !== '--json'));

  if (stray) {
    stdout.write(`Unknown argument "${stray}". Known flags: --markdown, --json <path>.\n`);
    exit(1);
  }

  const outputPath = keptPath ?? DEFAULT_RESULTS;

  await runBenchPass({ config: 'vitest.bench.config.mts', outputPath, label: 'measuring…' });

  const style = styleFor(stdout, args);
  const groups = readGroups(outputPath);

  if (groups.length === 0) {
    stdout.write('No benchmark groups in the results file.\n');
    exit(1);
  }

  stdout.write(
    [
      '',
      ...renderHeading('vitest-auto-spy against itself', style, 2),
      '',
      style === 'markdown'
        ? 'The published figure is `p75`, in microseconds. `✓` marks the fastest arm of that case.'
        : 'The published figure is p75, in microseconds. ✓ marks the fastest arm of that case.',
      '',
      ...groups.flatMap((group) => renderGroup(group, style)),
    ].join('\n'),
  );

  if (!keptPath) {
    rmSync(outputPath, { force: true });
  }

  if (!args.includes('--no-memory')) {
    await printRetainedHeap(style);
  }
}

/**
 * The retained-heap table, from the memory harness run against this package alone.
 *
 * Its output is filtered rather than inherited: Vitest prints a run banner and a summary around it,
 * and the table is the only part of that process anybody wants. The style travels down by
 * environment variable — a child writing through a pipe cannot see the parent's terminal.
 */
function printRetainedHeap(style) {
  return new Promise((resolve) => {
    const vitest = join(dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs');
    const child = spawn(execPath, [vitest, 'run', '--config', 'vitest.bench.memory.config.mts'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...env, BENCH_ARMS: 'self', BENCH_TABLE_STYLE: style },
    });

    const chunks = [];

    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));

    child.on('close', (code) => {
      const output = Buffer.concat(chunks).toString();

      if (code !== 0) {
        stdout.write(`${output}\nRetained-heap pass failed with exit code ${code}.\n`);
        exit(code ?? 1);
      }

      const lines = output.split('\n');
      const start = lines.findIndex((line) => line.includes('Retained heap per test double'));
      const end = lines.findIndex((line, index) => index > start && /^\s*(Test Files|Tests|Start at|Duration)\b/.test(line));

      stdout.write(`${lines.slice(start === -1 ? 0 : start, end === -1 ? lines.length : end).join('\n').trimEnd()}\n`);
      resolve();
    });
  });
}

main();
