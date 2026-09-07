// vitest 5.0.0 can lose a worker's v8 coverage contribution during mergeScriptCovs
// (zero-count blocks from one worker occasionally erase covered blocks of another),
// which fails the 100% threshold with all tests green — measured at 3 failures in 26
// runs on this repo, and seen twice in a row in one CI job. The failure is pure data
// loss, never a real hole: a line is either covered by a spec that always runs, or it
// is not, so a retry cannot turn a genuine regression green. Evidence and measurement:
// tasks/2026-09-06-session/coverage-flake.md.
//
// The merge itself is now fixed in `scripts/coverage-v8-merge.mjs`, which merges each script's
// payloads in one call instead of folding them a pair at a time, so the retry below is a backstop:
// if it ever fires again the cause is something the fold did not explain. Drop both when vitest
// merges the payloads in one call upstream.
//
// The other half of this file is about reading the failure. A failing coverage run ends
// with a 180-row table, so the log's last line is `Process completed with exit code 1`
// and the reason is 300 lines up. Every exit through here therefore ends with a block
// naming what fell short and by how much, and under GitHub Actions the same lines go out
// as `::error` annotations and into the job summary, where they are the first thing on
// the run page rather than something to scroll for.
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const vitestCli = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

// A runner colours this output and a local pipe does not, so the summary below arrives as
// `ESC[32m113 passed` in CI — where the guard silently never matched and the retry never ran.
const ANSI = /\u001B\[[0-9;]*m/g;

const ATTEMPTS = 3;
const ON_ACTIONS = Boolean(process.env.GITHUB_ACTIONS);
const FLAKE_NOTE = 'tasks/2026-09-06-session/coverage-flake.md';

function runVitest(args, attempt) {
  // Folded, so the coverage table stops burying the reason the step failed.
  if (ON_ACTIONS) {
    process.stdout.write(`::group::vitest --coverage (attempt ${attempt} of ${ATTEMPTS})\n`);
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

/** The shape this wrapper exists for: nothing failed, and the thresholds still did. */
function looksLikeLostCoverage(text) {
  const files = testFileCount(text);

  return thresholdMisses(text).length > 0 && files !== null && files.passed === files.total && !/\d+ failed/.test(text);
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
function explain(attempts) {
  const last = attempts.at(-1);
  const misses = thresholdMisses(last.text);
  const rows = shortfalls(last.text);
  const files = testFileCount(last.text);
  const lostShape = attempts.every((attempt) => looksLikeLostCoverage(attempt.text));

  // The one thing that separates the flake from a hole, and it needs two attempts to see: an
  // uncovered line is uncovered every time, while lost data blames a different file on each run.
  const blamed = attempts.map((attempt) => shortfalls(attempt.text).map((row) => `${row.file} ${row.uncovered}`));
  const stable = blamed.every((names) => names.length === blamed[0].length && names.every((name, index) => name === blamed[0][index]));

  const headline =
    misses.length > 0 ? misses.map((m) => `${m.metric} ${m.actual}% (needs ${m.required}%)`).join(', ') : 'the test run failed';

  const report = ['', '─'.repeat(78), `run-coverage: FAILED after ${attempts.length} attempt(s) — ${headline}`];

  if (rows.length > 0) {
    report.push('', 'not fully covered on the last attempt:');
    for (const row of rows.slice(0, 12)) {
      report.push(`  ${row.file.padEnd(24)} branches ${row.branches.padStart(6)}   lines ${row.lines.padStart(6)}   ${row.uncovered}`);
    }
    if (rows.length > 12) {
      report.push(`  … and ${rows.length - 12} more rows`);
    }
  }

  if (files) {
    report.push('', `${files.passed} of ${files.total} test files passed, so no spec regressed.`);
  }

  if (!lostShape) {
    report.push('', 'A test failed, so this is not the coverage flake: read the run above.');
  } else if (attempts.length === 1) {
    report.push('', 'Only one attempt ran, so there is nothing to compare it against.');
  } else if (stable) {
    report.push(
      '',
      `All ${attempts.length} attempts blamed the same lines, and lost data never repeats itself:`,
      'treat the rows above as a real hole and cover them.',
    );
  } else {
    report.push(
      '',
      'Each attempt blamed different lines, which is lost coverage data rather than a hole',
      `(vitest 5 v8 merge, see ${FLAKE_NOTE}):`,
      ...attempts.map((attempt, index) => `  attempt ${index + 1}: ${blamed[index].join(', ') || '—'}`),
      '',
      'Re-run the job. If the same file keeps coming back across pushes, cover it instead.',
    );
  }

  report.push('─'.repeat(78), '');
  process.stdout.write(report.join('\n'));

  annotate('Coverage', `${headline}${rows.length > 0 ? `\nnot fully covered: ${rows.map((row) => row.file).join(', ')}` : ''}`);

  writeJobSummary([
    '### `Test + coverage` failed',
    '',
    `**${headline}** — after ${attempts.length} attempt(s).`,
    ...(rows.length > 0
      ? [
          '',
          '| file | branches | lines | uncovered |',
          '| --- | --- | --- | --- |',
          ...rows.map((row) => `| \`${row.file}\` | ${row.branches} | ${row.lines} | ${row.uncovered} |`),
        ]
      : []),
    ...(files ? ['', `${files.passed} of ${files.total} test files passed.`] : []),
    ...(lostShape && attempts.length > 1
      ? [
          '',
          stable
            ? 'Every attempt blamed the same lines — a real hole, not the coverage flake.'
            : `Each attempt blamed different lines — lost coverage data (\`${FLAKE_NOTE}\`), so re-run the job.`,
        ]
      : []),
  ]);
}

const args = process.argv.slice(2);
const attempts = [];

for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  const result = runVitest(args, attempt);

  if (result.status === 0) {
    if (attempt > 1) {
      process.stdout.write(`\nrun-coverage: attempt ${attempt} is green — the earlier failure was lost coverage data, not a hole.\n`);
    }

    process.exit(0);
  }

  attempts.push(result);

  // A real test failure is not what the retry is for: report it as it happened.
  if (!looksLikeLostCoverage(result.text)) {
    break;
  }

  if (attempt < ATTEMPTS) {
    process.stdout.write(
      `\nrun-coverage: every test passed but the coverage data arrived incomplete — ` +
        `retrying (attempt ${attempt + 1} of ${ATTEMPTS}, known vitest 5.0.0 v8-merge flake, see ${FLAKE_NOTE}).\n`,
    );
  }
}

explain(attempts);
process.exit(attempts.at(-1).status);
