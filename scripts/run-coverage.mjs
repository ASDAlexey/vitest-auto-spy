// vitest 5.0.0 can lose a worker's v8 coverage contribution during mergeScriptCovs
// (zero-count blocks from one worker occasionally erase covered blocks of another),
// which fails the 100% threshold with all tests green — roughly 1 run in 10 on this
// repo, always in a file imported by many spec files. The failure is pure data loss,
// never a real hole: a line is either covered by a spec that always runs, or it is
// not, so one retry cannot turn a genuine regression green. Evidence and measurement:
// tasks/2026-09-06-session/coverage-flake.md. Drop this wrapper when vitest fixes the
// merge upstream.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vitestCli = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

function runVitest(args) {
  const result = spawnSync(process.execPath, [vitestCli, ...args], {
    encoding: 'utf8',
    env: process.env,
  });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  return result;
}

const args = process.argv.slice(2);
const first = runVitest(args);

if (first.status === 0) {
  process.exit(0);
}

const output = `${first.stdout ?? ''}\n${first.stderr ?? ''}`;
const lostCoverage =
  output.includes('does not meet global threshold') &&
  /Test Files\s+\d+ passed \(\d+\)/.test(output) &&
  !/\d+ failed/.test(output);

if (!lostCoverage) {
  process.exit(first.status ?? 1);
}

console.log('\nrun-coverage: every test passed but the coverage data arrived incomplete —\n' +
  'retrying once (known vitest 5.0.0 v8-merge flake, see tasks/2026-09-06-session/coverage-flake.md).\n');

const second = runVitest(args);
process.exit(second.status ?? 1);
