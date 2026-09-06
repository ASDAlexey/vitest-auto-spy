#!/usr/bin/env node
// Run the benchmark harness end to end on one throwaway case, in seconds, and check what came out.
//
// This exists because of how the harness broke: Vitest 5 removed both `--outputJson` and the `bench`
// export, every `bench*` command died, and nothing noticed — `bench*` is in no gate, and the
// benchmark workflow only fires on paths under `bench/`, which a runner upgrade does not touch. A
// harness nobody runs rots. This is the cheapest run that would have caught it: a real `vitest bench`
// pass over `bench/smoke.bench.ts`, through the real reporter, checked for the fields the downstream
// scripts read, and then handed to `bench-check.mjs` against a throwaway baseline so a consumer runs
// too. It measures nothing anybody should quote and it says so.
//
// Usage:
//   node scripts/bench-smoke.mjs           run the check; exit 1 on the first thing that is wrong
//   node scripts/bench-smoke.mjs --keep    keep the results file and the throwaway baseline

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { argv, execPath, exit, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

import { repoRoot, runBenchPass } from './bench-vitest.mjs';

const CONFIG = 'vitest.bench.smoke.config.mts';
const RESULTS = 'bench-results.smoke.json';

// Exactly what `bench-report.mjs`, `bench-self.mjs`, `bench-check.mjs` and `bench-angular/run.mjs`
// read off a row. A rename upstream that drops one of these is the failure this lane is here for.
const REQUIRED_FIELDS = ['p75', 'median', 'rme', 'sampleCount', 'hz'];

function usage() {
  // The file's own header, so the help and the comment cannot drift apart.
  stdout.write(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 14).join('\n').replace(/^\/\/ ?/gm, ''));
  stdout.write('\n');
}

function fail(message) {
  stdout.write(`bench:smoke — ${message}\n`);
  exit(1);
}

/** The producer's half: the file exists, and every field a consumer reads is a usable number. */
function checkResults(path) {
  if (!existsSync(path)) {
    fail(`the run produced no ${path}. The reporter did not write, or the run wrote somewhere else.`);
  }

  const json = JSON.parse(readFileSync(path, 'utf8'));
  const groups = (json.files ?? []).flatMap((file) => file.groups ?? []);

  if (groups.length === 0) {
    fail(`${path} carries no groups. A case is a \`test()\` whose body calls \`bench.compare()\`; nothing recorded one.`);
  }

  for (const group of groups) {
    if (typeof group.fullName !== 'string' || group.fullName.length === 0) {
      fail('a group came back without a `fullName` — the case titles the tables and baselines are keyed by.');
    }

    if ((group.benchmarks ?? []).length < 2) {
      fail(`case "${group.fullName}" came back with fewer than two arms; the smoke case compares two.`);
    }

    for (const arm of group.benchmarks) {
      for (const field of REQUIRED_FIELDS) {
        if (!Number.isFinite(arm[field]) || arm[field] <= 0) {
          fail(`case "${group.fullName}" arm "${arm.name}" has no usable \`${field}\` (${JSON.stringify(arm[field])}).`);
        }
      }
    }
  }

  return groups;
}

/** The consumers' half: `bench-check.mjs` writes a baseline from this file and then reads it back. */
function checkGate(resultsPath, baselinePath) {
  const check = fileURLToPath(new URL('bench-check.mjs', import.meta.url));

  for (const args of [[resultsPath, '--baseline', baselinePath, '--update'], [resultsPath, '--baseline', baselinePath, '--strict']]) {
    const run = spawnSync(execPath, [check, ...args], { cwd: repoRoot, encoding: 'utf8' });

    if (run.status !== 0) {
      stdout.write(`${run.stdout ?? ''}${run.stderr ?? ''}`);
      fail(`bench-check.mjs ${args.join(' ')} exited ${run.status}.`);
    }
  }
}

async function main() {
  const args = argv.slice(2);

  if (args.includes('-h') || args.includes('--help')) {
    usage();
    exit(0);
  }

  const keep = args.includes('--keep');
  const stray = args.find((arg) => arg !== '--keep');

  if (stray) {
    fail(`unknown argument "${stray}". Known flags: --keep.`);
  }

  const resultsPath = join(repoRoot, RESULTS);
  const baselineDirectory = mkdtempSync(join(tmpdir(), 'vitest-auto-spy-bench-smoke-'));
  const baselinePath = join(baselineDirectory, 'baseline.json');

  await runBenchPass({ config: CONFIG, outputPath: RESULTS, label: 'smoke…' });

  const groups = checkResults(resultsPath);

  checkGate(resultsPath, baselinePath);

  if (!keep) {
    rmSync(resultsPath, { force: true });
    rmSync(baselineDirectory, { recursive: true, force: true });
  }

  stdout.write(`bench:smoke — ${groups.length} case(s) measured, written, parsed and gated. The harness is intact.\n`);
}

main();
