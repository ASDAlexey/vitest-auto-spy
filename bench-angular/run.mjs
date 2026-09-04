#!/usr/bin/env node
// Run the Angular render benchmark and print the two columns it publishes.
//
// Same wrapper as `scripts/bench-self.mjs`, pointed at `vitest.bench.angular.config.mts`: buffer
// Vitest's ten-column reporter, read `--outputJson`, and render a table per case with each arm's
// ratio against the fastest arm in its own block.
//
// Two figures per arm, not one. The rest of this repository publishes `p75`, because its cases
// allocate spy objects by the hundred thousand and a GC pause lands in some samples and not others.
// These cases build whole component trees and take milliseconds rather than microseconds, so the
// median is the stable statistic here — and it is the one the earlier hand-run Angular numbers
// reported, which is what makes the two comparable. `p75` is printed beside it so the spread stays
// visible.
//
// `--repeat N` is the one flag that changes a number's worth. A single pass of this benchmark moves
// 20-30 % between runs on a quiet laptop — `TestBed.createComponent` at 100 children came back as
// 1.21, 1.39, 1.49 and 1.54 ms on four consecutive unmodified runs — because a whole-process JIT
// warm-up is still finishing while the first blocks measure. Raising the rep count does not help;
// more whole passes do. Each pass runs in its own process and the arms are merged by taking the
// median across passes, exactly as `bench:vs:precise` does for the head-to-head report.
//
// Usage:
//   npm run bench:angular                   one pass, ~40 s
//   npm run bench:angular -- --repeat 5     five passes merged by median — what a quotable number needs
//   npm run bench:angular -- --markdown     the same table as markdown, for pasting into a page
//   npm run bench:angular -- --json <p>     also keep the (merged) results at <p>
//
// The gate is `scripts/bench-check.mjs`, which is generic — it takes any results file and any
// baseline:
//   npm run bench:angular -- --repeat 5 --json bench-results.angular.json
//   npm run bench:check -- bench-results.angular.json --baseline bench-angular/baseline.json
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { argv, exit, stderr, stdout } from 'node:process';

import { renderHeading, renderTable, styleFor } from '../scripts/bench-table.mjs';
import { runBenchPass } from '../scripts/bench-vitest.mjs';

const DEFAULT_RESULTS = 'bench-results.angular.json';
const CONFIG = 'vitest.bench.angular.config.mts';

function usage() {
  // The file's own header, so the help and the comment cannot drift apart.
  stdout.write(
    readFileSync(new URL(import.meta.url), 'utf8')
      .split('\n')
      .slice(1, 29)
      .join('\n')
      .replace(/^\/\/ ?/gm, ''),
  );
  stdout.write('\n');
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);

  return (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2;
}

/**
 * Merge N passes into one results file, arm by arm, taking the median of each figure.
 *
 * The shape is Vitest's own, because `scripts/bench-check.mjs` reads it and there is no reason for
 * this command to own a second format. The first pass supplies the structure; every later pass only
 * contributes numbers to the arms it shares with it.
 */
function mergePasses(paths) {
  const passes = paths.map((path) => JSON.parse(readFileSync(path, 'utf8')));
  const [first] = passes;

  for (const file of first.files ?? []) {
    for (const group of file.groups ?? []) {
      for (const arm of group.benchmarks ?? []) {
        const samples = passes
          .flatMap((pass) => pass.files ?? [])
          .flatMap((other) => other.groups ?? [])
          .filter((other) => other.fullName === group.fullName)
          .flatMap((other) => other.benchmarks ?? [])
          .filter((other) => other.name === arm.name);

        arm.median = median(samples.map((sample) => sample.median));
        arm.p75 = median(samples.map((sample) => sample.p75));
        arm.rme = median(samples.map((sample) => sample.rme));
        arm.passes = samples.length;
      }
    }
  }

  return first;
}

/** Every case in the results file, each with its arms, in milliseconds. */
function readGroups(path) {
  const json = JSON.parse(readFileSync(path, 'utf8'));

  return (json.files ?? []).flatMap((file) =>
    (file.groups ?? []).map((group) => ({
      title: group.fullName.replace(/^.*?>\s*/, ''),
      arms: (group.benchmarks ?? []).map((row) => ({
        name: row.name,
        median: row.median,
        p75: row.p75,
        rme: row.rme,
        samples: row.sampleCount,
      })),
    })),
  );
}

/**
 * One block per case, with the fastest arm as the reference.
 *
 * The reference is the fastest arm rather than a fixed one because which arm wins is the result:
 * `renderShallow` loses to a plain `TestBed.createComponent` on a childless component, and a table
 * that hid that by always dividing by the same arm would be selling rather than measuring.
 */
function renderGroup(group, style) {
  const best = Math.min(...group.arms.map((arm) => arm.median));

  const rows = group.arms.map((arm) => [
    arm.median === best ? `${arm.name} ✓` : arm.name,
    `${arm.median.toFixed(4)} ms`,
    `${arm.p75.toFixed(4)} ms`,
    arm.median === best ? '—' : `${(arm.median / best).toFixed(2)}×`,
    `±${arm.rme.toFixed(1)}%`,
    arm.samples.toLocaleString('en-US'),
  ]);

  return [
    ...renderHeading(group.title, style),
    '',
    ...renderTable(['case', 'median ↓', 'p75 ↓', 'vs fastest', 'rme ↓', 'reps'], rows, { style }),
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
  const repeatIndex = args.indexOf('--repeat');
  const keptPath = jsonIndex === -1 ? undefined : args[jsonIndex + 1];
  const repeat = repeatIndex === -1 ? 1 : Math.max(1, Number(args[repeatIndex + 1]) || 1);
  const known = new Set(['--markdown', '--json', '--repeat']);
  const valueOf = new Set([jsonIndex, repeatIndex].filter((index) => index !== -1).map((index) => index + 1));
  const stray = args.find((arg, index) => (arg.startsWith('-') ? !known.has(arg) : !valueOf.has(index)));

  if (stray) {
    stdout.write(`Unknown argument "${stray}". Known flags: --markdown, --repeat <n>, --json <path>.\n`);
    exit(1);
  }

  const outputPath = keptPath ?? DEFAULT_RESULTS;
  const passPaths = [];

  for (let pass = 1; pass <= repeat; pass += 1) {
    const passPath = repeat === 1 ? outputPath : `${outputPath}.pass${pass}`;

    // Sequentially, never concurrently: two passes at once would contend for the cores and report
    // the scheduler instead of the `TestBed`.
    // eslint-disable-next-line no-await-in-loop
    await runBenchPass({ config: CONFIG, outputPath: passPath, label: repeat === 1 ? 'measuring…' : `pass ${pass}/${repeat}` });
    passPaths.push(passPath);
  }

  if (repeat > 1) {
    writeFileSync(outputPath, `${JSON.stringify(mergePasses(passPaths), undefined, 2)}\n`);
    passPaths.forEach((path) => rmSync(path, { force: true }));
    stderr.write(`  merged ${repeat} passes by median\n`);
  }

  const style = styleFor(stdout, args);
  const groups = readGroups(outputPath);

  if (groups.length === 0) {
    stdout.write('No benchmark groups in the results file.\n');
    exit(1);
  }

  stdout.write(
    [
      '',
      ...renderHeading('renderShallow against a plain TestBed cycle', style, 2),
      '',
      style === 'markdown'
        ? `Median of 60 reps after 30 warm-up reps, in milliseconds, over ${repeat} pass(es). \`✓\` marks the fastest arm of that case.`
        : `Median of 60 reps after 30 warm-up reps, in milliseconds, over ${repeat} pass(es). ✓ marks the fastest arm of that case.`,
      '',
      ...groups.flatMap((group) => renderGroup(group, style)),
    ].join('\n'),
  );

  if (!keptPath) {
    rmSync(outputPath, { force: true });
  }
}

main();
