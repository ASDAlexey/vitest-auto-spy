// `npm run test:coverage`, wrapped so that a failure says why.
//
// A failing coverage run ends with a 180-row table, so the log's last line is `Process completed
// with exit code 1` and the reason is 300 lines up. Every exit through here therefore ends with a
// block naming what fell short and by how much, and under GitHub Actions the same lines go out as
// an `::error` annotation and into the job summary, where they are the first thing on the run page
// rather than something to scroll for.
//
// This used to retry up to three times: under `@vitest/coverage-v8` the 100 % threshold failed with
// every spec green, blaming a different handful of lines each run. That was the provider losing
// covered blocks while merging the workers' raw script coverages, not a hole — the suite now runs
// on istanbul, which instruments the source and sums counters, and reports the same numbers in
// every mode. Measurements: tasks/2026-09-06-session/coverage-flake.md. So there is nothing left to
// retry: a red run here is a real hole or a real test failure.
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const vitestCli = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

// A runner colours this output and a local pipe does not, so the summary below arrives as
// `ESC[32m113 passed` in CI, where none of the patterns here would match it.
const ANSI = /\u001B\[[0-9;]*m/g;

const ON_ACTIONS = Boolean(process.env.GITHUB_ACTIONS);

function runVitest(args) {
  // Folded, so the coverage table stops burying the reason the step failed.
  if (ON_ACTIONS) {
    process.stdout.write('::group::vitest --coverage\n');
  }

  const result = spawnSync(process.execPath, [vitestCli, ...args], { encoding: 'utf8', env: process.env });

  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');

  if (ON_ACTIONS) {
    process.stdout.write('::endgroup::\n');
  }

  return { status: result.status ?? 1, text: `${result.stdout ?? ''}\n${result.stderr ?? ''}`.replace(ANSI, '') };
}

/** `ERROR: Coverage for branches (99.84%) does not meet global threshold (100%)` → the three parts. */
function thresholdMisses(text) {
  return [...text.matchAll(/Coverage for (\w+) \(([\d.]+)%\) does not meet global threshold \(([\d.]+)%\)/g)].map(
    ([, metric, actual, required]) => ({ metric, actual, required }),
  );
}

/** The rows of the coverage table that are neither fully covered nor fully absent. */
function shortfalls(text) {
  const rows = [];

  for (const line of text.split('\n')) {
    const columns = line.split('|').map((cell) => cell.trim());

    if (columns.length !== 6 || !/\.[cm]?ts$/.test(columns[0])) {
      continue;
    }

    const [file, statements, branches, functions, lines, uncovered] = columns;
    const numbers = [statements, branches, functions, lines];

    if (numbers.every((value) => value === '100') || numbers.every((value) => value === '0')) {
      continue;
    }

    rows.push({ file, statements, branches, functions, lines, uncovered });
  }

  return rows;
}

function testFileCount(text) {
  const match = /Test Files\s+(\d+) passed \((\d+)\)/.exec(text);

  return match ? { passed: Number(match[1]), total: Number(match[2]) } : null;
}

function annotate(title, message) {
  if (ON_ACTIONS) {
    process.stdout.write(`::error title=${title}::${message.replaceAll('\n', '%0A')}\n`);
  }
}

function writeJobSummary(lines) {
  const path = process.env.GITHUB_STEP_SUMMARY;

  if (!path) {
    return;
  }

  try {
    appendFileSync(path, `${lines.join('\n')}\n`);
  } catch {
    // A summary is a nicety; never let writing one be the reason a run reports differently.
  }
}

/** The block every failing exit ends with, so the reason is the last thing in the log. */
function explain(result) {
  const misses = thresholdMisses(result.text);
  const rows = shortfalls(result.text);
  const files = testFileCount(result.text);
  const allSpecsPassed = files !== null && files.passed === files.total && !/\d+ failed/.test(result.text);

  const headline =
    misses.length > 0 ? misses.map((m) => `${m.metric} ${m.actual}% (needs ${m.required}%)`).join(', ') : 'the test run failed';

  const report = ['', '─'.repeat(78), `run-coverage: FAILED — ${headline}`];

  if (rows.length > 0) {
    report.push('', 'not fully covered:');
    for (const row of rows.slice(0, 12)) {
      report.push(`  ${row.file.padEnd(24)} branches ${row.branches.padStart(6)}   lines ${row.lines.padStart(6)}   ${row.uncovered}`);
    }
    if (rows.length > 12) {
      report.push(`  … and ${rows.length - 12} more rows`);
    }
  }

  if (files) {
    report.push('', `${files.passed} of ${files.total} test files passed.`);
  }

  report.push(
    '',
    allSpecsPassed
      ? 'Every spec passed, so the rows above are uncovered code: cover them.'
      : 'A test failed, so read the run above — the coverage numbers are a consequence.',
  );

  report.push('─'.repeat(78), '');
  process.stdout.write(report.join('\n'));

  annotate('Coverage', `${headline}${rows.length > 0 ? `\nnot fully covered: ${rows.map((row) => row.file).join(', ')}` : ''}`);

  writeJobSummary([
    '### `Test + coverage` failed',
    '',
    `**${headline}**`,
    ...(rows.length > 0
      ? [
          '',
          '| file | branches | lines | uncovered |',
          '| --- | --- | --- | --- |',
          ...rows.map((row) => `| \`${row.file}\` | ${row.branches} | ${row.lines} | ${row.uncovered} |`),
        ]
      : []),
    ...(files ? ['', `${files.passed} of ${files.total} test files passed.`] : []),
  ]);
}

const result = runVitest(process.argv.slice(2));

if (result.status === 0) {
  process.exit(0);
}

explain(result);
process.exit(result.status);
