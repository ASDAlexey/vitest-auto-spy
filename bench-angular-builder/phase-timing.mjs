#!/usr/bin/env node
// Diagnostic only: timestamps each output line of one coverage run to split the phases.
// Usage: node phase-timing.mjs <armDir> <v8|istanbul>
import { spawn } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';

import { ngEnv, ngTestArgs } from './common.mjs';

const [armArg, provider] = process.argv.slice(2);
if (!armArg || !provider) {
  console.error('usage: node phase-timing.mjs <armDir> <v8|istanbul>');
  process.exit(2);
}
const arm = resolve(armArg);
const NEEDLES = [
  ['bundle_done', 'Application bundle generation complete'],
  ['run_banner', ' RUN '],
  ['summary', 'Test Files'],
  ['report_header', 'Coverage report from'],
  ['report_end', 'Lines        :'],
];
const round = (x) => Math.round(x * 100) / 100;

const t0 = performance.now();
const child = spawn(process.execPath, [...ngTestArgs(provider), '--reporters=verbose'], {
  cwd: arm,
  env: ngEnv(),
  stdio: ['ignore', 'pipe', 'pipe'],
});
const marks = {};
const onLine = (line) => {
  const t = round((performance.now() - t0) / 1000);
  if (line.includes('✓') && !('summary' in marks)) {
    marks.last_test_line = t;
    marks.first_test_line ??= t;
  }
  for (const [key, needle] of NEEDLES) if (line.includes(needle) && !(key in marks)) marks[key] = t;
};
createInterface({ input: child.stdout }).on('line', onLine);
createInterface({ input: child.stderr }).on('line', onLine);
await new Promise((r) => child.once('close', r));
marks.exit = round((performance.now() - t0) / 1000);
console.log(JSON.stringify({ arm: basename(arm), provider, ...marks }));
