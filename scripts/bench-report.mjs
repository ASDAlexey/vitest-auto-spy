#!/usr/bin/env node
// Turn `vitest bench --outputJson` into the markdown table that gets published.
//
// The ratio column is the point of this script. Absolute times from a shared CI runner are not
// portable — GitHub's own runners vary 10-30% between runs — but every arm here is measured
// back-to-back in one process on one machine, so the ratio cancels the dominant noise terms.
// Read `p75`, not `hz`: these cases allocate by the hundred thousand and a GC pause lands in some
// samples and not others, which swings `hz` several-fold while `p75` reproduces.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cpus, totalmem, type as osType, release } from 'node:os';
import { argv, exit, stdout, version } from 'node:process';

const BASELINE_PREFIX = 'vitest-auto-spy';

function usage() {
  stdout.write(
    [
      'Render a markdown benchmark table from `vitest bench --outputJson` output.',
      '',
      'Usage:',
      '  node scripts/bench-report.mjs <results.json>',
      '',
      'Writes markdown to stdout. In CI, append it to $GITHUB_STEP_SUMMARY:',
      '  npm run bench:vs -- --outputJson bench-results.json',
      '  node scripts/bench-report.mjs bench-results.json >> "$GITHUB_STEP_SUMMARY"',
      '',
    ].join('\n'),
  );
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    stdout.write(`Cannot read ${path}: ${error.message}\n`);
    exit(1);
  }
}

/** The measured competitors and their exact pins — a table without them cannot be checked. */
function competitorVersions() {
  const bench = readJson(fileURLToPath(new URL('../bench/package.json', import.meta.url)));

  return Object.entries(bench.devDependencies ?? {}).map(([name, range]) => `\`${name}@${range}\``);
}

function environment() {
  const cpu = cpus()[0]?.model ?? 'unknown CPU';

  return [
    `- **Date** ${new Date().toISOString().slice(0, 10)}`,
    `- **Node** ${version}, **${osType()}** ${release()}`,
    `- **Machine** ${cpu}, ${cpus().length} cores, ${Math.round(totalmem() / 1e9)} GB`,
    `- **Measured** ${competitorVersions().join(', ')}`,
  ].join('\n');
}

function renderGroup(group) {
  const rows = group.benchmarks ?? [];
  const baseline = rows.find((row) => row.name.startsWith(BASELINE_PREFIX));
  const title = group.fullName.replace(/^.*?>\s*/, '');

  const lines = [
    `#### ${title}`,
    '',
    '| Library | p75 | vs this package | rme |',
    '| --- | ---: | ---: | ---: |',
  ];

  for (const row of rows) {
    const ratio = baseline ? `${(row.p75 / baseline.p75).toFixed(2)}×` : '—';
    const self = row === baseline;

    lines.push(
      `| ${self ? `**${row.name}**` : row.name} | ${(row.p75 * 1000).toFixed(2)} µs | ${self ? '—' : ratio} | ±${row.rme.toFixed(1)}% |`,
    );
  }

  return [...lines, ''].join('\n');
}

function main() {
  const [path] = argv.slice(2);

  if (!path || path === '-h' || path === '--help') {
    usage();
    exit(path ? 0 : 1);
  }

  const results = readJson(path);
  const groups = (results.files ?? []).flatMap((file) => file.groups ?? []);

  if (groups.length === 0) {
    stdout.write('No benchmark groups in the results file.\n');
    exit(1);
  }

  stdout.write(
    [
      '## Head-to-head benchmarks',
      '',
      environment(),
      '',
      'A ratio above 1.00× means the other library took longer. Every arm ran back-to-back in one',
      'process on one machine, so the ratio is the durable figure; the absolute times describe this',
      'runner only. Rows where this package loses are published for the same reason as the rest.',
      '',
      ...groups.map(renderGroup),
      'Reproduce: `npm ci && npm ci --prefix bench && npm run bench:vs`',
      '',
    ].join('\n'),
  );
}

main();
