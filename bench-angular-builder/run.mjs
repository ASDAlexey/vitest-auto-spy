#!/usr/bin/env node
// The whole measurement: generate and install the arms, one warm-up per cell, then interleaved
// rounds, then the median table. See README.md in this directory for the method.
//
// Usage:
//   npm run bench:angular-builder                                 700 specs, 5 rounds, A/B/C x v8/istanbul
//   npm run bench:angular-builder -- --files 150                  the supplementary size
//   npm run bench:angular-builder -- --files 20 --runs 1 --arms B,C --providers v8 --skip-warmup   smoke
//
// Options: --work <dir> (default: <os tmpdir>/vitest-auto-spy-bench-angular-builder), --lib <version>
// (published vitest-auto-spy to install, default 5.34.0), --seed <n>, --start <round>, --reinstall,
// --setup-only.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { analyze, readJsonl } from './analyze.mjs';
import { ARMS, DEFAULT_LIB, DEFAULT_SEED, DEFAULT_WORK, PROVIDERS, armDir, cellsFor } from './common.mjs';
import { runOnce } from './run-once.mjs';
import { ensureTarball, setupArm } from './setup-arm.mjs';

const { values } = parseArgs({
  options: {
    files: { type: 'string', default: '700' },
    runs: { type: 'string', default: '5' },
    start: { type: 'string', default: '1' },
    arms: { type: 'string', default: Object.keys(ARMS).join(',') },
    providers: { type: 'string', default: PROVIDERS.join(',') },
    work: { type: 'string', default: DEFAULT_WORK },
    lib: { type: 'string', default: DEFAULT_LIB },
    seed: { type: 'string', default: String(DEFAULT_SEED) },
    'skip-warmup': { type: 'boolean', default: false },
    'setup-only': { type: 'boolean', default: false },
    reinstall: { type: 'boolean', default: false },
  },
});

const files = Number(values.files);
const rounds = Number(values.runs);
const start = Number(values.start);
const arms = values.arms.split(',').map((a) => a.trim().toUpperCase());
const providers = values.providers.split(',').map((p) => p.trim());
const { work } = values;
for (const arm of arms) if (!ARMS[arm]) throw new Error(`unknown arm ${arm}; expected ${Object.keys(ARMS).join(', ')}`);
for (const p of providers) if (!PROVIDERS.includes(p)) throw new Error(`unknown provider ${p}; expected ${PROVIDERS.join(', ')}`);

console.error(`work directory: ${work}`);
const tarball = ensureTarball(work, values.lib);
for (const arm of arms) {
  console.error(`setting up arm ${arm}-${files}`);
  setupArm({ work, arm, files, seed: Number(values.seed), tarball, reinstall: values.reinstall });
}
if (values['setup-only']) process.exit(0);

const resultsDir = join(work, 'results');
const logDir = join(work, 'logs', String(files));
mkdirSync(resultsDir, { recursive: true });
const runsPath = join(resultsDir, `runs-${files}.jsonl`);
const warmupPath = join(resultsDir, `warmup-${files}.jsonl`);
const cells = cellsFor(arms, providers);

async function run({ arm, provider }, tag, out) {
  const res = await runOnce(armDir(work, arm, files), provider, `${arm}-${files}-${provider}-${tag}`, logDir);
  const line = JSON.stringify({ arm, provider, files_n: files, run: tag, ...res });
  appendFileSync(out, line + '\n');
  console.error(line);
}

if (!values['skip-warmup']) for (const cell of cells) await run(cell, 'warmup', warmupPath);
for (let r = start; r < start + rounds; r++) {
  for (let k = 0; k < cells.length; k++) await run(cells[(k + r) % cells.length], `r${r}`, runsPath);
}

console.error(`\nresults: ${runsPath} (appended; delete it to start a fresh series)\n`);
console.log(analyze(readJsonl(runsPath)));
