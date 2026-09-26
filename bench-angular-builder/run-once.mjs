#!/usr/bin/env node
// One measured `ng test --watch=false --coverage` run.
//
// Usage: node run-once.mjs <armDir> <v8|istanbul|none> <label> <logDir>
// Prints one JSON line: wall seconds, peak RSS of the whole process tree (ps sampled every 200 ms),
// `/usr/bin/time` max RSS of the top process, test counts and Vitest's own duration line.
// `none` is diagnostic only: it splits the test stage from coverage and is never a counted run.
import { execFile, spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

import { isMain, ngEnv, ngTestArgs } from './common.mjs';

const execFileAsync = promisify(execFile);
const TIME_BIN = '/usr/bin/time';

// BSD time (macOS) reports bytes, GNU time (Linux) reports kilobytes.
const timeWrapper = (timePath) => {
  if (!existsSync(TIME_BIN)) return null;
  if (process.platform === 'darwin')
    return { args: ['-l', '-o', timePath], re: /(\d+)\s+maximum resident set size/, toMb: (n) => n / 1024 / 1024 };
  return { args: ['-v', '-o', timePath], re: /Maximum resident set size \(kbytes\):\s*(\d+)/, toMb: (n) => n / 1024 };
};

async function treeRssKb(root) {
  const { stdout } = await execFileAsync('ps', ['-A', '-o', 'pid=,ppid=,rss=']);
  const kids = new Map();
  const rss = new Map();
  for (const line of stdout.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p.length !== 3) continue;
    const [pid, ppid, r] = p.map(Number);
    rss.set(pid, r);
    if (!kids.has(ppid)) kids.set(ppid, []);
    kids.get(ppid).push(pid);
  }
  let total = 0;
  let n = 0;
  const stack = [root];
  while (stack.length) {
    const pid = stack.pop();
    total += rss.get(pid) ?? 0;
    n++;
    stack.push(...(kids.get(pid) ?? []));
  }
  return { kb: total, n };
}

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

export async function runOnce(armDirArg, provider, label, logDirArg) {
  const armDir = resolve(armDirArg);
  const logDir = resolve(logDirArg);
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, `${label}.log`);
  const timePath = join(logDir, `${label}.time`);
  const wrapper = timeWrapper(timePath);
  const [cmd, args] = wrapper
    ? [TIME_BIN, [...wrapper.args, process.execPath, ...ngTestArgs(provider)]]
    : [process.execPath, ngTestArgs(provider)];

  const loadBefore = loadavg()[0];
  const log = createWriteStream(logPath);
  await new Promise((r) => log.once('open', r));
  const t0 = performance.now();
  const child = spawn(cmd, args, { cwd: armDir, env: ngEnv(), stdio: ['ignore', log, log] });
  let wall = 0;
  let rc = null;
  const exited = new Promise((r) =>
    child.once('exit', (code) => {
      wall = (performance.now() - t0) / 1000;
      rc = code;
      r();
    }),
  );
  let peak = 0;
  let peakProcs = 0;
  while (rc === null) {
    const { kb, n } = await treeRssKb(child.pid);
    if (kb > peak && rc === null) [peak, peakProcs] = [kb, n];
    await Promise.race([sleep(200), exited]);
  }
  await new Promise((r) => log.end(r));

  const text = readFileSync(logPath, 'utf8');
  let topMb = null;
  if (wrapper && existsSync(timePath)) {
    const m = wrapper.re.exec(readFileSync(timePath, 'utf8'));
    if (m) topMb = round(wrapper.toMb(Number(m[1])), 1);
  }
  const grab = (re) => re.exec(text)?.[1].trim() ?? null;
  return {
    label,
    rc,
    wall_s: round(wall, 2),
    peak_tree_rss_mb: round(peak / 1024, 1),
    peak_tree_procs: peakProcs,
    time_top_maxrss_mb: topMb,
    files: grab(/Test Files\s+(.*)/),
    tests: grab(/Tests\s+(\d+ passed.*|\d+ failed.*)/),
    vitest_duration: grab(/Duration\s+(.*)/),
    bundle: grab(/Application bundle generation complete\. \[([\d.]+) seconds\]/),
    provider_seen: grab(/Coverage enabled with\s+(\w+)/),
    load1_before: round(loadBefore, 2),
  };
}

if (isMain(import.meta.url)) {
  const [armDir, provider, label, logDir] = process.argv.slice(2);
  if (!logDir) {
    console.error('usage: node run-once.mjs <armDir> <v8|istanbul|none> <label> <logDir>');
    process.exit(2);
  }
  console.log(JSON.stringify(await runOnce(armDir, provider, label, logDir)));
}
