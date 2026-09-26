#!/usr/bin/env node

/**
 * `npm run check`: the gate in waves — static checks, suites, build, `dist/` checks, invariants.
 * The first failure kills the rest and prints that stage's output whole.
 *
 * ESLint's cache misses a type change in a file another file depends on: CI lints uncached.
 *
 * Usage:
 *   node scripts/check.mjs             # the gate
 *   node scripts/check.mjs --serial    # one stage at a time, in the same order
 *   node scripts/check.mjs --verbose   # print the output of passing stages too
 *   node scripts/check.mjs --no-cache  # no prettier / tsc / ESLint caches
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = new Set(process.argv.slice(2));
const unknown = [...argv].filter((flag) => !['--serial', '--verbose', '--no-cache'].includes(flag));

if (unknown.length > 0) {
  process.stderr.write(`check: unknown option ${unknown.join(', ')} (known: --serial, --verbose, --no-cache)\n`);
  process.exit(2);
}

const SERIAL = argv.has('--serial');
const VERBOSE = argv.has('--verbose');
const CACHE = !argv.has('--no-cache');

// Beside the tree rather than in `node_modules/.cache`: worktrees share one symlinked `node_modules`.
function cacheDir() {
  const base = join(root, '.cache', 'check');
  const lockHash = createHash('sha256')
    .update(readFileSync(join(root, 'package-lock.json')))
    .digest('hex')
    .slice(0, 12);

  mkdirSync(join(base, lockHash), { recursive: true });
  for (const entry of readdirSync(base)) {
    if (entry !== lockHash) {
      rmSync(join(base, entry), { recursive: true, force: true });
    }
  }

  return join(base, lockHash);
}

const cache = CACHE ? cacheDir() : null;
const cached = (args) => (cache ? args : []);

const stage = (script, args = [], name = script) => ({ name, script, args });

const WAVES = [
  {
    name: 'static',
    lanes: [
      [stage('deps:check')],
      [stage('typecheck', cached(['--incremental', '--tsBuildInfoFile', join(cache ?? '', 'typecheck.tsbuildinfo')]))],
      [stage('lint', cached(['--cache', '--cache-strategy', 'content', '--cache-location', join(cache ?? '', 'eslint/')]))],
      [stage('format:check', cached(['--cache', '--cache-strategy', 'content', '--cache-location', join(cache ?? '', 'prettier')]))],
      [stage('agents:sync:check')],
      [stage('jscpd')],
      [stage('export-map:check')],
      [stage('llms:check')],
      [stage('docs:check')],
      [stage('ru:check')],
      [stage('plugin:sync:check')],
      [stage('skill:check')],
      [stage('alias:sync:check')],
      [stage('test:types')],
      [stage('types:budget')],
    ],
  },
  {
    name: 'tests',
    // Coverage and happy-dom in one lane: two 16-worker passes side by side peak near 16 GB.
    lanes: [
      [stage('test:coverage'), stage('test:happy-dom')],
      [stage('test:shared-env', ['--shard=1/2'], 'test:shared-env 1/2')],
      [stage('test:shared-env', ['--shard=2/2'], 'test:shared-env 2/2')],
      [stage('test:zone'), stage('test:node'), stage('test:rstest')],
      [stage('test:bun'), stage('test:bun:angular'), stage('test:bun:isolate')],
    ],
  },
  { name: 'build', lanes: [[stage('build')]] },
  {
    name: 'dist',
    lanes: [
      [stage('smoke:dist')],
      [stage('size:entries:check')],
      [stage('size:badge:check')],
      [stage('test:bun:preload')],
      [stage('cold-import:check')],
    ],
  },
  // Heap plateau and teardown shape are properties of one quiet process.
  { name: 'invariants', lanes: [[stage('test:invariants')]] },
];

const running = new Set();
let failed = null;

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

function npmCommand(script, args) {
  const npmArgs = ['run', script, ...(args.length > 0 ? ['--', ...args] : [])];
  const execPath = process.env.npm_execpath;

  return execPath && /\.[cm]?js$/.test(execPath) ? [process.execPath, [execPath, ...npmArgs]] : ['npm', npmArgs];
}

function run({ name, script, args }) {
  const [command, commandArgs] = npmCommand(script, args);
  const started = performance.now();

  return new Promise((done) => {
    // Its own process group, so a failure elsewhere can stop the whole tree it spawned.
    const child = spawn(command, commandArgs, {
      cwd: root,
      detached: process.platform !== 'win32',
      shell: process.platform === 'win32',
      env: process.stdout.isTTY ? { ...process.env, FORCE_COLOR: '1' } : process.env,
    });
    const output = [];

    running.add(child);
    child.stdout.on('data', (chunk) => output.push(chunk));
    child.stderr.on('data', (chunk) => output.push(chunk));
    child.on('close', (code, signal) => {
      running.delete(child);
      done({ name, code: code ?? 1, signal, ms: performance.now() - started, output: Buffer.concat(output).toString() });
    });
  });
}

function killAll() {
  for (const child of running) {
    try {
      process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }
}

function report(result) {
  if (result.code === 0) {
    process.stdout.write(`  ✓ ${result.name.padEnd(20)} ${seconds(result.ms)}\n`);
    if (VERBOSE && result.output.trim()) {
      process.stdout.write(`${result.output.replace(/\n?$/, '\n')}`);
    }
    return;
  }

  if (failed && failed !== result) {
    process.stdout.write(`  - ${result.name.padEnd(20)} stopped\n`);
    return;
  }

  const rule = '─'.repeat(78);
  const cause = result.signal ? `killed by ${result.signal}` : `exit code ${result.code}`;
  process.stdout.write(`  ✗ ${result.name.padEnd(20)} ${seconds(result.ms)}\n\n${rule}\n${result.name} failed (${cause}):\n${rule}\n`);
  process.stdout.write(`${result.output.replace(/\n?$/, '\n')}${rule}\n\n`);
}

async function runLane(lane) {
  for (const next of lane) {
    if (failed) {
      return;
    }
    const result = await run(next);

    if (result.code !== 0 && !failed) {
      failed = result;
      killAll();
    }
    report(result);
  }
}

async function main() {
  process.on('SIGINT', () => {
    killAll();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    killAll();
    process.exit(143);
  });

  const started = performance.now();
  const timings = [];

  for (const wave of WAVES) {
    const waveStarted = performance.now();
    process.stdout.write(`\n▶ ${wave.name}\n`);

    if (SERIAL) {
      await runLane(wave.lanes.flat());
    } else {
      await Promise.all(wave.lanes.map(runLane));
    }

    timings.push(`${wave.name} ${seconds(performance.now() - waveStarted)}`);
    if (failed) {
      break;
    }
  }

  const verdict = failed ? `FAILED at ${failed.name}` : 'passed';
  process.stdout.write(`\ncheck ${verdict} in ${seconds(performance.now() - started)} (${timings.join(', ')})\n`);
  process.exit(failed ? failed.code || 1 : 0);
}

await main();
