#!/usr/bin/env node
// What every published entry point costs to import, measured two ways.
//
// `docs-site/core/performance.md` publishes a cold-import table, and until now nothing produced it:
// the numbers were measured by hand, once, and no committed harness could reproduce them or notice
// them getting worse. This repository has already paid for that gap — every entry point used to
// inline its own copy of the core, which is invisible in a test run and obvious in a module graph.
//
// So this measures two different things and keeps them apart, because only one of them can be gated:
//
//   A. The module graph per entry — how many modules esbuild pulls in and how many bytes they weigh,
//      read off a `metafile` with the peer dependencies external. Exact, identical on every machine,
//      and therefore gateable: `cold-import.json` holds the baseline and `--check` fails on drift.
//   B. Cold `import()` time per entry — a fresh `node` process per measurement, best and median of a
//      few runs. Useful, and a property of the machine it ran on, so it is printed and never gated.
//
// Usage:
//   node scripts/cold-import.mjs               measure and print both tables
//   node scripts/cold-import.mjs --check       compare part A against the baseline, exit 1 on drift
//   node scripts/cold-import.mjs --update      rewrite the baseline from this run
//   node scripts/cold-import.mjs --no-timing   part A only, no child processes (fast, for CI)
//   node scripts/cold-import.mjs --runs <n>    timing runs per entry (default 7)
//   node scripts/cold-import.mjs --markdown    render the tables as markdown
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { argv, execPath, exit, stderr, stdout, version } from 'node:process';
import { fileURLToPath } from 'node:url';

import { renderHeading, renderTable, styleFor } from './bench-table.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(REPO, 'cold-import.json');

// tsup's `external`, in full — scripts/size-badge.mjs carries the subset the main entry can reach,
// and the adapters reach the rest. Anything here is a peer the consumer already has, so counting it
// would measure Angular's module graph instead of ours.
const EXTERNAL = [
  '@angular/common',
  '@angular/common/http',
  '@angular/common/http/testing',
  '@angular/compiler',
  '@angular/core',
  '@angular/core/testing',
  '@angular/platform-browser',
  '@angular/platform-browser/testing',
  '@happy-dom/global-registrator',
  'bun',
  'bun:test',
  'jsdom',
  'node:test',
  'rxjs',
  'rxjs/operators',
  'vitest',
];

// Growth over the baseline that still passes: 2 % of the recorded value, but never less than one
// module — a graph of eight modules has no meaningful percentage.
const TOLERANCE_RATIO = 0.02;
const MIN_MODULE_SLACK = 1;

const DEFAULT_RUNS = 7;

function usage() {
  // The file's own header, so the help and the comment cannot drift apart.
  stdout.write(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 23).join('\n').replace(/^\/\/ ?/gm, ''));
  stdout.write('\n');
}

function fail(message) {
  stderr.write(`cold-import: ${message}\n`);
  exit(1);
}

/** Every subpath in `exports`, in the order the package declares them, with the file each resolves to. */
function readEntries() {
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));

  return Object.entries(pkg.exports ?? {}).map(([subpath, condition]) => {
    const target = condition.import?.default ?? condition.import ?? condition.default;

    if (typeof target !== 'string') {
      fail(`no ESM target for the "${subpath}" export — has the exports map changed shape?`);
    }

    return {
      subpath,
      specifier: subpath === '.' ? pkg.name : `${pkg.name}${subpath.slice(1)}`,
      file: join(REPO, target),
    };
  });
}

/** Part A: the module graph of one entry, straight off esbuild's metafile. */
async function measureGraph(entry) {
  const result = await build({
    entryPoints: [entry.file],
    bundle: true,
    metafile: true,
    write: false,
    format: 'esm',
    // `node`, not `neutral`: builtins are external here rather than unresolvable, which is what a
    // consumer's graph looks like too.
    platform: 'node',
    external: EXTERNAL,
    logLevel: 'silent',
  });

  const inputs = Object.values(result.metafile.inputs);

  return {
    modules: inputs.length,
    bytes: inputs.reduce((total, input) => total + input.bytes, 0),
  };
}

/**
 * Part B: one cold `import()` in a process that has never seen the package.
 *
 * The timer lives inside the child and brackets the import alone, so Node's own startup — the other
 * half of what a worker pays — stays out of the number.
 */
function timeImport(specifier) {
  const source = `
    const started = performance.now();
    await import(${JSON.stringify(specifier)});
    process.stdout.write(String(performance.now() - started));
  `;
  const child = spawnSync(execPath, ['--input-type=module', '-e', source], { cwd: REPO, encoding: 'utf8' });

  if (child.status !== 0) {
    // The thrown message, not the code frame above it — the frame is the source line of the `throw`.
    const lines = (child.stderr || '').split('\n');
    const thrown = lines.find((line) => /^[A-Za-z]*Error: /.test(line));
    const message = thrown ? thrown.replace(/^[A-Za-z]*Error: /, '') : (lines.find(Boolean) ?? 'import failed');
    const reason = message.replace('[vitest-auto-spy] ', '').split('. ')[0].trim();

    return { error: reason.length > 64 ? `${reason.slice(0, 64)}…` : reason };
  }

  return { milliseconds: Number(child.stdout) };
}

/** Why an entry cannot be timed in Node at all, or `undefined` when it can. */
function timingSkipReason(subpath) {
  // `bun:test` has no Node resolution, so these two throw before the import is even attempted. They
  // are still measured in part A, where the peers are external.
  return subpath === './bun' || subpath === './bun-angular' ? 'imports bun:test' : undefined;
}

function measureTimings(entries, runs) {
  return entries.map((entry) => {
    const skip = timingSkipReason(entry.subpath);

    if (skip) {
      return { ...entry, skipped: skip };
    }

    const samples = [];

    for (let run = 0; run < runs; run += 1) {
      const attempt = timeImport(entry.specifier);

      if (attempt.error) {
        return { ...entry, skipped: attempt.error };
      }

      samples.push(attempt.milliseconds);
    }

    samples.sort((left, right) => left - right);

    return { ...entry, best: samples[0], median: samples[Math.floor(samples.length / 2)], runs: samples.length };
  });
}

function formatBytes(bytes) {
  return `${(bytes / 1000).toFixed(1)} kB`;
}

function formatDelta(current, baseline, format) {
  const delta = current - baseline;

  if (delta === 0) {
    return '=';
  }

  const percent = baseline === 0 ? 0 : (delta / baseline) * 100;

  return `${delta > 0 ? '+' : '-'}${format(Math.abs(delta))} (${percent > 0 ? '+' : ''}${percent.toFixed(1)}%)`;
}

function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE, 'utf8'));
  } catch {
    return undefined;
  }
}

function writeBaseline(measurements) {
  const entries = {};

  for (const { subpath, modules, bytes } of [...measurements].sort((left, right) => left.subpath.localeCompare(right.subpath))) {
    entries[subpath] = { modules, bytes };
  }

  const baseline = {
    measuredOn: new Date().toISOString().slice(0, 10),
    node: version,
    tolerance: { ratio: TOLERANCE_RATIO, minModuleSlack: MIN_MODULE_SLACK },
    entries,
  };

  writeFileSync(BASELINE, `${JSON.stringify(baseline, undefined, 2)}\n`);
}

/** Compare one metric against its baseline; `undefined` when it is inside tolerance. */
function violation(label, current, recorded, slack) {
  const allowance = Math.max(recorded * TOLERANCE_RATIO, slack);

  if (current > recorded + allowance) {
    return `${label} grew ${recorded} -> ${current}`;
  }

  if (current < recorded - allowance) {
    return `${label} shrank ${recorded} -> ${current}`;
  }

  return undefined;
}

function checkAgainstBaseline(measurements, baseline) {
  const recorded = baseline.entries ?? {};
  const problems = [];

  for (const measurement of measurements) {
    const entry = recorded[measurement.subpath];

    if (!entry) {
      problems.push(`${measurement.subpath}: not in the baseline`);
      continue;
    }

    const found = [
      violation('modules', measurement.modules, entry.modules, MIN_MODULE_SLACK),
      violation('bytes', measurement.bytes, entry.bytes, 0),
    ].filter(Boolean);

    if (found.length > 0) {
      problems.push(`${measurement.subpath}: ${found.join(', ')}`);
    }
  }

  for (const subpath of Object.keys(recorded)) {
    if (!measurements.some((measurement) => measurement.subpath === subpath)) {
      problems.push(`${subpath}: in the baseline but no longer exported`);
    }
  }

  return problems;
}

function printGraphTable(measurements, baseline, style) {
  const compare = Boolean(baseline);
  const headers = compare ? ['Entry', 'Modules', 'Δ modules', 'Bytes', 'Δ bytes'] : ['Entry', 'Modules', 'Bytes'];
  const rows = measurements.map((measurement) => {
    const entry = baseline?.entries?.[measurement.subpath];

    if (!compare) {
      return [measurement.subpath, String(measurement.modules), formatBytes(measurement.bytes)];
    }

    return [
      measurement.subpath,
      String(measurement.modules),
      entry ? formatDelta(measurement.modules, entry.modules, (value) => String(value)) : 'new',
      formatBytes(measurement.bytes),
      entry ? formatDelta(measurement.bytes, entry.bytes, formatBytes) : 'new',
    ];
  });

  stdout.write(`${renderHeading('Module graph per entry (deterministic, gated)', style).join('\n')}\n`);
  stdout.write(`${renderTable(headers, rows, { style }).join('\n')}\n`);
}

function printTimingTable(timings, runs, style) {
  const headers = ['Entry', 'Best, ms', 'Median, ms', 'Runs'];
  const rows = timings.map((timing) =>
    timing.skipped
      ? [timing.subpath, 'skipped', timing.skipped, '—']
      : [timing.subpath, timing.best.toFixed(1), timing.median.toFixed(1), String(timing.runs)],
  );

  stdout.write(`${renderHeading(`Cold import, ${runs} runs per entry (machine-local, never gated)`, style).join('\n')}\n`);
  stdout.write(`${renderTable(headers, rows, { style }).join('\n')}\n`);
  stdout.write(`\nThese milliseconds describe this machine and this ${version} only — they are documentation, not a\n`);
  stdout.write('gate, and a number from another machine is not comparable. Only the table above is checked.\n');
}

async function main() {
  if (argv.includes('--help') || argv.includes('-h')) {
    usage();

    return;
  }

  const check = argv.includes('--check');
  const update = argv.includes('--update');
  const timing = !argv.includes('--no-timing') && !check;
  const runsFlag = argv.indexOf('--runs');
  const runs = runsFlag === -1 ? DEFAULT_RUNS : Number(argv[runsFlag + 1]);

  if (!Number.isInteger(runs) || runs < 1) {
    fail('--runs needs a positive integer');
  }

  const entries = readEntries();
  const missing = entries.filter((entry) => {
    try {
      readFileSync(entry.file);

      return false;
    } catch {
      return true;
    }
  });

  if (missing.length > 0) {
    fail(`dist/ is missing ${missing.map((entry) => entry.subpath).join(', ')} — run \`npm run build\` first.`);
  }

  const style = styleFor(stdout, argv);
  const measurements = [];

  for (const entry of entries) {
    measurements.push({ ...entry, ...(await measureGraph(entry)) });
  }

  if (update) {
    writeBaseline(measurements);
    printGraphTable(measurements, undefined, style);
    stdout.write(`\ncold-import: baseline written to cold-import.json (${measurements.length} entries, ${version}).\n`);

    return;
  }

  const baseline = readBaseline();

  if (check && !baseline) {
    fail('no cold-import.json to check against — run `node scripts/cold-import.mjs --update` first.');
  }

  printGraphTable(measurements, baseline, style);

  if (check) {
    const problems = checkAgainstBaseline(measurements, baseline);

    if (problems.length > 0) {
      stderr.write(`\ncold-import: the module graph moved beyond tolerance (${TOLERANCE_RATIO * 100}% or one module):\n`);

      for (const problem of problems) {
        stderr.write(`  - ${problem}\n`);
      }

      stderr.write('cold-import: if the change is intended, run `npm run cold-import:update` and commit the baseline.\n');
      exit(1);
    }

    stdout.write(`\ncold-import: ${measurements.length} entries within tolerance of the baseline.\n`);

    return;
  }

  if (timing) {
    stdout.write('\n');
    printTimingTable(measureTimings(entries, runs), runs, style);
  }
}

await main();
