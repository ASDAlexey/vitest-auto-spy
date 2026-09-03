#!/usr/bin/env node
//
// Suite-scale benchmark: what does the choice of auto-spy library cost across a whole
// Vitest suite, in wall-clock and peak RSS, at realistic suite sizes? The existing
// `bench/*.bench.ts` files measure per-operation cost; this measures the aggregate by
// actually generating and running synthetic suites — no number here is extrapolated.
//
// Usage:
//   node scripts/bench-suite.mjs [options]
//
// Options:
//   --sizes <list>       Comma-separated test counts, 10 tests/file. Default: 1000,3000,10000
//   --arms <list>        Comma-separated from: ours,ours-proxy,hirez,manual. Default: ours,hirez,manual
//   --repeats <n>        Measured runs per cell, after one discarded warm-up. Default: 3
//   --methods <n>        Prototype methods on the generated subject class. Default: 20
//   --coverage <mode>    on | off | both. Default: on
//   --coverage-provider <p>
//                        v8 | istanbul. Default: v8 — what the published numbers use. Istanbul
//                        inserts its counters at transform time instead of reading V8's, so it
//                        adds a larger constant to every arm and compresses the ratios between
//                        them; a suite whose CI runs istanbul should read that column, not this
//                        one. Installed into node_modules on demand, saved to nothing.
//   --isolate <bool>     Vitest test.isolate for the generated project. Default: true
//   --ours-source <mode> src | dist — what the `ours`/`ours-proxy` arms import. Default: dist.
//                        'dist' is the fair comparison: the package is packed and unpacked into
//                        the cell's own node_modules, so Vitest externalises it exactly like
//                        `hirez` — one native import per worker, which is what a consumer pays.
//                        'src' imports this repo's TypeScript by relative path and is measurably
//                        slower: outside node_modules it pays an esbuild transform per worker, is
//                        re-evaluated once per spec file under `isolate: true`, and is not exempt
//                        from @vitest/coverage-v8's RPC-level coverage collection.
//   --out <file>         Write full JSON results to this path in addition to the table.
//   --keep               Do not delete the generated temp directory (debugging only).
//   -h, --help           Show this help and exit.
//
// Smoke test (verifies the harness in well under a minute):
//   node scripts/bench-suite.mjs --sizes 100 --repeats 1
//
// Full matrix (this is the one that takes a long time — tens of minutes at 10 000 tests
// under coverage, times every arm and coverage mode requested):
//   node scripts/bench-suite.mjs --sizes 1000,3000,10000 --arms ours,hirez,manual --repeats 3
//
// What it does: generates a throwaway Vitest project per cell (a subject class with
// `--methods` trivial prototype methods, one spec file per 10 tests, each test builds a
// double, configures one method's return value, calls three methods, and makes two
// assertions), runs `vitest run` [--coverage] against it, and measures wall-clock plus
// peak RSS across the whole process tree Vitest spawns. Every run is real — nothing is
// simulated or extrapolated, and a cell that fails is reported as a failure, not skipped.
//
// Dependencies: the `hirez` arm needs `@bugsplat/vitest-auto-spies`, pinned at the exact
// version this script installs on demand (see PINNED_DEPS below) into the temp project
// that needs it — it does not assume that package is present anywhere else. Everything
// else (Vitest itself, `@vitest/coverage-v8`, and this repository's own source for the
// `ours` / `ours-proxy` arms) is resolved from this repository's own `node_modules`, so
// `npm install` at the repository root is the only other prerequisite.
//
// Platform notes: wall-clock timing works everywhere. Peak RSS is sampled by walking the
// live process tree every 200 ms — via `ps` on macOS/Linux, via PowerShell's
// `Get-CimInstance Win32_Process` on Windows. If neither is available the run still
// completes; its RSS is reported as "not sampled on this platform" rather than a false 0.

import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { paint, renderHeading, renderTable, styleFor } from './bench-table.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

const KNOWN_ARMS = ['ours', 'ours-proxy', 'hirez', 'manual'];
const PACKAGE_NAME = 'vitest-auto-spy';
// `manual` is the floor, not a rival: it imports no library at all, so no library can beat it and
// the frame must not turn red when this one merely fails to. Colour is decided against these.
const COMPETITOR_ARMS = ['hirez'];
const TESTS_PER_FILE = 10;
const SAMPLE_INTERVAL_MS = 200;

// Pinned so a stranger running this script gets the same numbers this report was built
// from — `hirez` wraps `@hirez_io/auto-spies-core`, the exact core `jest-auto-spies` uses.
const PINNED_DEPS = { '@bugsplat/vitest-auto-spies': '1.0.0' };

const USAGE = `Suite-scale auto-spy benchmark — wall-clock and peak RSS across a whole synthetic Vitest suite.

Usage:
  node scripts/bench-suite.mjs [options]

Options:
  --sizes <list>       Comma-separated test counts, 10 tests/file. Default: 1000,3000,10000
  --arms <list>        Comma-separated from: ${KNOWN_ARMS.join(',')}. Default: ours,hirez,manual
  --repeats <n>        Measured runs per cell, after one discarded warm-up. Default: 3
  --methods <n>        Prototype methods on the generated subject class. Default: 20
  --coverage <mode>    on | off | both. Default: on
  --coverage-provider <p>  v8 | istanbul. Default: v8 (what the published numbers use).
                       Istanbul instruments at transform time, so it adds a bigger constant to
                       every arm and compresses the ratios. Installed on demand, unsaved.
  --isolate <bool>     Vitest test.isolate for the generated project. Default: true
  --ours-source <mode> src | dist — what ours/ours-proxy import. Default: dist, packed and
                       unpacked into the cell's node_modules like hirez (see script header).
  --out <file>         Write full JSON results to this path in addition to the table.
  --keep               Do not delete the generated temp directory (debugging only).
  -h, --help           Show this help and exit.

Smoke test (verifies the harness in well under a minute):
  node scripts/bench-suite.mjs --sizes 100 --repeats 1

Full matrix (takes tens of minutes at 10 000 tests under coverage):
  node scripts/bench-suite.mjs --sizes 1000,3000,10000 --arms ours,hirez,manual --repeats 3

Rough per-run cost on a 16-core Apple M4 Max, coverage on: ~2 s at 1 000 tests, ~5 s at
3 000, ~15 s at 10 000 — actual cost depends entirely on the machine; this script prints
its own calibration as it runs, it never assumes a number.

Dependencies: needs \`npm install\` already run at the repository root (for Vitest and
\`@vitest/coverage-v8\`). The \`hirez\` arm additionally needs network access the first
time it runs, to install \`@bugsplat/vitest-auto-spies@${PINNED_DEPS['@bugsplat/vitest-auto-spies']}\`
into its own temp project — this script does that itself and prints what it installs.
`;

function parseArgs(argv) {
  const opts = {
    sizes: [1000, 3000, 10000],
    arms: ['ours', 'hirez', 'manual'],
    repeats: 3,
    methods: 20,
    coverage: 'on',
    coverageProvider: 'v8',
    isolate: true,
    oursSource: 'dist',
    out: null,
    keep: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];

    switch (arg) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--sizes':
        opts.sizes = next()
          .split(',')
          .map((s) => Number.parseInt(s.trim(), 10));
        break;
      case '--arms':
        opts.arms = next()
          .split(',')
          .map((s) => s.trim());
        break;
      case '--repeats':
        opts.repeats = Number.parseInt(next(), 10);
        break;
      case '--methods':
        opts.methods = Number.parseInt(next(), 10);
        break;
      case '--coverage':
        opts.coverage = next();
        break;
      case '--coverage-provider':
        opts.coverageProvider = next();
        break;
      case '--isolate':
        opts.isolate = next() !== 'false';
        break;
      case '--ours-source':
        opts.oursSource = next();
        break;
      case '--out':
        opts.out = next();
        break;
      case '--keep':
        opts.keep = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}\n\n${USAGE}`);
    }
  }

  if (opts.sizes.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new Error(`--sizes must be positive integers\n\n${USAGE}`);
  }
  if (opts.arms.some((a) => !KNOWN_ARMS.includes(a))) {
    throw new Error(`--arms must be from: ${KNOWN_ARMS.join(', ')}\n\n${USAGE}`);
  }
  if (!Number.isInteger(opts.repeats) || opts.repeats <= 0) {
    throw new Error(`--repeats must be a positive integer\n\n${USAGE}`);
  }
  if (!['on', 'off', 'both'].includes(opts.coverage)) {
    throw new Error(`--coverage must be on, off or both\n\n${USAGE}`);
  }
  if (!['v8', 'istanbul'].includes(opts.coverageProvider)) {
    throw new Error(`--coverage-provider must be v8 or istanbul\n\n${USAGE}`);
  }
  if (!['src', 'dist'].includes(opts.oursSource)) {
    throw new Error(`--ours-source must be src or dist\n\n${USAGE}`);
  }

  opts.coverageModes = opts.coverage === 'both' ? [true, false] : [opts.coverage === 'on'];

  return opts;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function requireResolvable(pkgJsonPath, what) {
  if (!existsSync(pkgJsonPath)) {
    throw new Error(
      `${what} not found at ${pkgJsonPath}. Run "npm install" at the repository root first.\n\n${USAGE}`,
    );
  }
}

function collectEnvironment() {
  requireResolvable(path.join(REPO_ROOT, 'node_modules/vitest/package.json'), 'Vitest');
  const vitestVersion = readJson(path.join(REPO_ROOT, 'node_modules/vitest/package.json')).version;

  const cpus = os.cpus();
  const env = {
    date: new Date().toISOString(),
    node: process.version,
    vitest: vitestVersion,
    os: `${os.type()} ${os.release()} (${process.platform}/${os.arch()})`,
    cpuModel: cpus[0]?.model ?? 'unknown',
    cpuCores: cpus.length,
    totalRamGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
  };

  return env;
}

function printEnvironment(env) {
  console.log(renderHeading('Environment', styleFor(process.stdout, process.argv.slice(2)), 3).join('\n'));
  console.log(`Date:        ${env.date}`);
  console.log(`Node:        ${env.node}`);
  console.log(`Vitest:      ${env.vitest}`);
  console.log(`OS:          ${env.os}`);
  console.log(`CPU:         ${env.cpuModel} (${env.cpuCores} cores)`);
  console.log(`RAM:         ${env.totalRamGb} GB`);
  console.log('');
}

// --- Synthetic project generation -------------------------------------------------------

function subjectClassSource(methodCount) {
  const methods = [];
  for (let i = 0; i < methodCount; i += 1) {
    methods.push(`  m${i}(x: number): number {\n    return x + ${i};\n  }`);
  }
  return `export class Subject {\n${methods.join('\n\n')}\n}\n`;
}

function doubleFactorySource(arm, fixturesDir, oursSource) {
  const subjectImport = "import { Subject } from './subject';";

  if (arm === 'ours' || arm === 'ours-proxy') {
    const options = arm === 'ours-proxy' ? ", { lazySpies: 'proxy' }" : '';

    // 'dist' is installed into the cell's own node_modules by installOurs, so Vitest externalises
    // it exactly as it does `hirez` — one native import per worker. A relative path outside
    // node_modules is inlined instead: Vite transforms it and `isolate: true` re-evaluates the
    // whole bundle once per spec file, which cost this arm ~1.1 s per 10 000 tests that no
    // consumer ever pays. 'src' keeps the relative path on purpose — it measures the sources.
    if (oursSource !== 'src') {
      return `import { createSpyFromClass } from '${PACKAGE_NAME}';\n${subjectImport}\n\nexport function createDouble() {\n  return createSpyFromClass(Subject${options});\n}\n`;
    }

    let rel = path.relative(fixturesDir, path.join(REPO_ROOT, 'src/index.ts')).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return `import { createSpyFromClass } from '${rel}';\n${subjectImport}\n\nexport function createDouble() {\n  return createSpyFromClass(Subject${options});\n}\n`;
  }

  // arm === 'hirez' — the only remaining caller of this function (`manual` builds its own
  // factory in manualFactorySource, since it has no class to read a method count from).
  return `import { createSpyFromClass } from '@bugsplat/vitest-auto-spies';\n${subjectImport}\n\nexport function createDouble() {\n  return createSpyFromClass(Subject);\n}\n`;
}

// `manual` hard-codes 20 fields above because it has no class to read at runtime — keep the
// generated subject at 20 methods when `manual` is one of the requested arms.
function manualFactorySource(methodCount) {
  const fields = Array.from({ length: methodCount }, (_, i) => `m${i}: vi.fn()`);
  return `import { vi } from 'vitest';\n\nexport function createDouble() {\n  return {\n    ${fields.join(',\n    ')},\n  };\n}\n`;
}

function specFileSource(index) {
  const tests = [];
  for (let t = 0; t < TESTS_PER_FILE; t += 1) {
    tests.push(
      `  it('test ${t}', () => {\n` +
        `    double.m0.mockReturnValue(${index * TESTS_PER_FILE + t});\n` +
        `    const result = double.m0();\n` +
        `    double.m1();\n` +
        `    double.m2();\n` +
        `    expect(result).toBe(${index * TESTS_PER_FILE + t});\n` +
        `    expect(double.m0).toHaveBeenCalledTimes(1);\n` +
        `  });`,
    );
  }

  return (
    `import { beforeEach, describe, expect, it } from 'vitest';\n` +
    `import { createDouble } from '../fixtures/double-factory';\n\n` +
    `describe('suite ${index}', () => {\n` +
    `  let double: ReturnType<typeof createDouble>;\n\n` +
    `  beforeEach(() => {\n    double = createDouble();\n  });\n\n` +
    `${tests.join('\n\n')}\n` +
    `});\n`
  );
}

function generateProject(dir, { arm, totalTests, methodCount, coverage, coverageProvider, isolate, oursSource }) {
  const fixturesDir = path.join(dir, 'fixtures');
  const specsDir = path.join(dir, 'specs');
  mkdirSync(fixturesDir, { recursive: true });
  mkdirSync(specsDir, { recursive: true });

  writeFileSync(path.join(fixturesDir, 'subject.ts'), subjectClassSource(methodCount));
  writeFileSync(
    path.join(fixturesDir, 'double-factory.ts'),
    arm === 'manual' ? manualFactorySource(methodCount) : doubleFactorySource(arm, fixturesDir, oursSource),
  );

  const fileCount = totalTests / TESTS_PER_FILE;
  for (let i = 0; i < fileCount; i += 1) {
    writeFileSync(path.join(specsDir, `suite-${String(i).padStart(5, '0')}.spec.ts`), specFileSource(i));
  }

  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'bench-suite-project', private: true, type: 'module' }, null, 2));

  // Identical for every arm at a given (coverage, isolate) — the whole point of the shared
  // constant is that only the double-factory import differs between cells.
  const config = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['specs/**/*.spec.ts'],
    environment: 'node',
    globals: false,
    isolate: ${isolate},
    coverage: {
      provider: '${coverageProvider}',
      reporter: ['text-summary'],
      include: ['fixtures/**/*.ts'],
    },
  },
});
`;
  writeFileSync(path.join(dir, 'vitest.config.mts'), config);

  return dir;
}

function installHirez(dir) {
  const spec = `@bugsplat/vitest-auto-spies@${PINNED_DEPS['@bugsplat/vitest-auto-spies']}`;
  console.log(`Installing ${spec} into ${path.relative(REPO_ROOT, dir)} ...`);
  try {
    execFileSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', '--silent', '--prefix', dir, spec], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch (err) {
    const detail = err.stderr ? err.stderr.toString() : err.message;
    throw new Error(`Could not install ${spec} (needed for the "hirez" arm) — no network, or npm failed:\n${detail}`);
  }
}

// `npm pack` and unpack, rather than `npm install <tarball>`: installing would make npm resolve
// this package's peers (Angular, rxjs, Vitest) into the cell and drag the network into a run that
// otherwise needs none. Unpacking the tarball puts the published tree — and only it — under
// node_modules, which is all the arm needs and exactly what a consumer resolves.
let oursTarball = null;

function packOurs(runRoot) {
  if (oursTarball) return oursTarball;

  const out = execFileSync('npm', ['pack', '--ignore-scripts', '--silent', '--pack-destination', runRoot], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  oursTarball = path.join(runRoot, out.trim().split('\n').pop().trim());

  return oursTarball;
}

function installOurs(dir, runRoot) {
  const target = path.join(dir, 'node_modules', PACKAGE_NAME);
  mkdirSync(target, { recursive: true });
  execFileSync('tar', ['-xzf', packOurs(runRoot), '-C', target, '--strip-components=1'], { stdio: ['ignore', 'ignore', 'pipe'] });
}

// Into the repository root, not the temp project like `hirez`: Vitest imports the coverage provider
// from its own file under `node_modules/vitest/`, so Node resolves it upward from there and never
// sees a copy installed beside the generated config. `--no-save --no-package-lock` keeps the
// manifest and the lockfile untouched — this repo's own gate runs `v8` and must not gain a
// devDependency for an opt-in flag. Pinned to the installed Vitest: the coverage packages are
// released in lockstep with it.
function ensureCoverageIstanbul(vitestVersion) {
  const installed = path.join(REPO_ROOT, 'node_modules/@vitest/coverage-istanbul/package.json');
  if (existsSync(installed) && readJson(installed).version === vitestVersion) return;

  const spec = `@vitest/coverage-istanbul@${vitestVersion}`;
  console.log(`Installing ${spec} into node_modules (not saved to package.json) ...`);
  try {
    execFileSync('npm', ['install', '--no-save', '--no-package-lock', '--no-audit', '--no-fund', '--silent', spec], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch (err) {
    const detail = err.stderr ? err.stderr.toString() : err.message;
    throw new Error(`Could not install ${spec} (needed for --coverage-provider istanbul) — no network, or npm failed:\n${detail}`);
  }
}

// Rebuilds dist/ when it is missing or older than the newest file under src/ — the `ours` /
// `ours-proxy` arms must measure what a consumer actually installs, never a stale build.
function ensureDistBuilt() {
  const distEntry = path.join(REPO_ROOT, 'dist/index.js');
  const srcDir = path.join(REPO_ROOT, 'src');

  const newestSrcMtime = Math.max(
    ...readdirSync(srcDir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => statSync(path.join(e.parentPath ?? e.path, e.name)).mtimeMs),
  );

  const distMtime = existsSync(distEntry) ? statSync(distEntry).mtimeMs : -Infinity;

  if (distMtime >= newestSrcMtime) {
    const version = readJson(path.join(REPO_ROOT, 'dist', '..', 'package.json')).version;
    console.log(`Using existing dist/ (vitest-auto-spy@${version}, built ${new Date(distMtime).toISOString()})`);
    return;
  }

  console.log('dist/ is missing or stale — running "npm run build" at the repository root ...');
  execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
  const version = readJson(path.join(REPO_ROOT, 'package.json')).version;
  const builtAt = statSync(distEntry).mtimeMs;
  console.log(`Built dist/ (vitest-auto-spy@${version}, built ${new Date(builtAt).toISOString()})`);
}

// --- Process-tree RSS sampling ------------------------------------------------------------

let rssSamplingBroken = false;

function sampleProcessTablePosix() {
  const out = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' });
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pid, ppid, rssKb] = line.split(/\s+/).map(Number);
      return { pid, ppid, rssKb };
    });
}

function sampleProcessTableWindows() {
  const out = execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Json -Compress',
    ],
    { encoding: 'utf8' },
  );
  const parsed = JSON.parse(out);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.map((r) => ({ pid: r.ProcessId, ppid: r.ParentProcessId, rssKb: r.WorkingSetSize / 1024 }));
}

function sumTreeRssMb(rootPid) {
  const table = process.platform === 'win32' ? sampleProcessTableWindows() : sampleProcessTablePosix();
  const byPid = new Map(table.map((r) => [r.pid, r]));
  if (!byPid.has(rootPid)) return 0;

  const childrenOf = new Map();
  for (const row of table) {
    if (!childrenOf.has(row.ppid)) childrenOf.set(row.ppid, []);
    childrenOf.get(row.ppid).push(row.pid);
  }

  let totalKb = 0;
  const stack = [rootPid];
  const seen = new Set();
  while (stack.length > 0) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    const row = byPid.get(pid);
    if (row) totalKb += row.rssKb;
    for (const child of childrenOf.get(pid) ?? []) stack.push(child);
  }

  return totalKb / 1024;
}

function trackPeakRss(rootPid) {
  let peakMb = 0;
  let sampled = false;
  let running = true;

  const loop = (async () => {
    while (running) {
      if (!rssSamplingBroken) {
        try {
          const mb = sumTreeRssMb(rootPid);
          peakMb = Math.max(peakMb, mb);
          sampled = true;
        } catch {
          rssSamplingBroken = true;
        }
      }
      await new Promise((r) => setTimeout(r, SAMPLE_INTERVAL_MS));
    }
  })();

  return {
    stop: async () => {
      running = false;
      await loop;
      return { peakMb, sampled };
    },
  };
}

// --- Running one Vitest process -----------------------------------------------------------

function vitestEntry() {
  const pkg = readJson(path.join(REPO_ROOT, 'node_modules/vitest/package.json'));
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.vitest;
  return path.join(REPO_ROOT, 'node_modules/vitest', bin);
}

async function runVitestOnce(dir, { coverage }) {
  const args = [vitestEntry(), 'run'];
  if (coverage) args.push('--coverage');

  const start = process.hrtime.bigint();
  const child = spawn(process.execPath, args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });

  const rss = trackPeakRss(child.pid);

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', (d) => (stderr += d));

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  const { peakMb, sampled } = await rss.stop();
  const wallSeconds = Number(process.hrtime.bigint() - start) / 1e9;

  return { wallSeconds, peakMb, rssSampled: sampled, exitCode, stdout, stderr };
}

// --- Stats ----------------------------------------------------------------------------------

/** The name a column carries — the flag value is what you type, not what a reader should have to decode. */
function armLabel(arm) {
  return (
    {
      ours: 'vitest-auto-spy',
      'ours-proxy': "vitest-auto-spy, lazySpies: 'proxy'",
      hirez: '@bugsplat/vitest-auto-spies',
      manual: 'hand-written vi.fn()',
    }[arm] ?? arm
  );
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function fmt(n, digits = 2) {
  return Number(n).toFixed(digits);
}

// The table prints ratios and a colour; both mean nothing without saying what they are measured
// against, and the one arm a reader is most likely to misread is `manual`. Written from the numbers
// actually in hand, so it can never claim a win the table does not show.
function resultsFootnote(arms, sizes, cellOf) {
  const lines = ['Reading the table', ''];
  lines.push('  Ratios are against vitest-auto-spy: below 1.00× is faster than this package, above it slower.');

  const competitors = arms.filter((arm) => COMPETITOR_ARMS.includes(arm));
  if (arms.includes('ours') && competitors.length > 0) {
    lines.push(`  The frame is green only while vitest-auto-spy beats ${competitors.map(armLabel).join(' and ')} at every size.`);
  }

  if (arms.includes('manual') && arms.includes('ours')) {
    const ratios = sizes
      .map((size) => {
        const ours = cellOf(size, 'ours')?.wallMedian;
        const manual = cellOf(size, 'manual')?.wallMedian;

        return typeof ours === 'number' && typeof manual === 'number' && manual > 0 ? ours / manual : null;
      })
      .filter((value) => value !== null);

    lines.push('');
    lines.push('  hand-written vi.fn() is the floor, not a rival, and it does not decide the colour: it imports no');
    lines.push('  library, so no library can be faster than it — parity is the best result available.');

    if (ratios.length > 0) {
      const span =
        ratios.length === 1
          ? `${fmt(ratios[0], 2)}×`
          : `${fmt(Math.min(...ratios), 2)}×–${fmt(Math.max(...ratios), 2)}× across the sizes measured`;
      lines.push(`  This run puts vitest-auto-spy at ${span} of it.`);
    }
  }

  // A single-digit ratio gap next to a double-digit spread is machine state, not a result. The
  // reader cannot know which they are looking at unless the run says how noisy it was.
  const spreads = roundSpreads(arms, sizes, cellOf);
  if (spreads.length > 0) {
    lines.push('');
    lines.push(`  Widest round-to-round spread in this run: ${fmt(Math.max(...spreads) * 100, 0)}% of the cell's median.`);
    lines.push('  Read any ratio closer to 1.00 than that as noise, not as a result.');
  }

  lines.push('');

  return lines;
}

function roundSpreads(arms, sizes, cellOf) {
  const spreads = [];
  for (const size of sizes) {
    for (const arm of arms) {
      const cell = cellOf(size, arm);
      const times = (cell?.runs ?? []).filter((run) => !run.failed).map((run) => run.wallSeconds);
      if (times.length > 1 && cell.wallMedian > 0) spreads.push((Math.max(...times) - Math.min(...times)) / cell.wallMedian);
    }
  }

  return spreads;
}

// --- Main ------------------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(USAGE);
    return;
  }

  const env = collectEnvironment();
  printEnvironment(env);

  if (opts.arms.includes('hirez')) {
    console.log(
      `About to install (pinned, per project that needs it): @bugsplat/vitest-auto-spies@${PINNED_DEPS['@bugsplat/vitest-auto-spies']}`,
    );
  }
  if (opts.coverage !== 'off' && opts.coverageProvider === 'istanbul') ensureCoverageIstanbul(env.vitest);
  if (opts.oursSource === 'dist' && (opts.arms.includes('ours') || opts.arms.includes('ours-proxy'))) {
    ensureDistBuilt();
  }

  const runRoot = mkdtempSync(path.join(REPO_ROOT, `.bench-suite-${randomUUID().slice(0, 8)}-`));
  console.log(`Working directory: ${path.relative(REPO_ROOT, runRoot)}\n`);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned || opts.keep) return;
    cleaned = true;
    try {
      rmSync(runRoot, { recursive: true, force: true });
    } catch {
      // best-effort — nothing more useful to do on the way out
    }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });

  const results = [];
  const roundRatios = [];

  try {
    for (const size of opts.sizes) {
      for (const coverage of opts.coverageModes) {
        console.log(
          renderHeading(
            `${size.toLocaleString('en-US')} tests · coverage ${coverage ? opts.coverageProvider : 'off'} · isolate ${opts.isolate} · ours from ${opts.oursSource}`,
            styleFor(process.stdout, process.argv.slice(2)),
            3,
          ).join('\n'),
        );

        // Generate + install every arm's project before running anything, so timing rounds
        // below are pure round-robin — no arm pays a first-touch cost the others don't.
        const cellDirs = {};
        for (const arm of opts.arms) {
          const cellDir = path.join(runRoot, `s${size}-c${coverage ? 1 : 0}-${arm}`);
          mkdirSync(cellDir, { recursive: true });
          generateProject(cellDir, {
            arm,
            totalTests: size,
            methodCount: opts.methods,
            coverage,
            coverageProvider: opts.coverageProvider,
            isolate: opts.isolate,
            oursSource: opts.oursSource,
          });
          if (arm === 'hirez') installHirez(cellDir);
          if ((arm === 'ours' || arm === 'ours-proxy') && opts.oursSource !== 'src') installOurs(cellDir, runRoot);
          cellDirs[arm] = cellDir;
        }

        // Round-robin, not blocked by arm: any drift across the invocation (thermal, cache,
        // a background process) lands on every arm equally instead of on whoever runs last.
        process.stdout.write('  warm-up round: ');
        for (const arm of opts.arms) {
          const warm = await runVitestOnce(cellDirs[arm], { coverage });
          if (warm.exitCode !== 0) {
            throw new Error(`Warm-up run failed (exit ${warm.exitCode}) for arm "${arm}" in ${cellDirs[arm]}\n${warm.stderr.slice(-4000)}`);
          }
          process.stdout.write(`${arm}=${fmt(warm.wallSeconds)}s `);
        }
        console.log('(discarded)');

        const perArmRuns = Object.fromEntries(opts.arms.map((a) => [a, []]));

        for (let round = 0; round < opts.repeats; round += 1) {
          process.stdout.write(`  round ${round + 1}/${opts.repeats}: `);
          for (const arm of opts.arms) {
            const res = await runVitestOnce(cellDirs[arm], { coverage });
            if (res.exitCode !== 0) {
              process.stdout.write(`${arm}=FAILED `);
              perArmRuns[arm].push({ ...res, failed: true });
              console.error(`\n${res.stderr.slice(-4000)}`);
              continue;
            }
            process.stdout.write(`${arm}=${fmt(res.wallSeconds)}s `);
            perArmRuns[arm].push({ ...res, failed: false });
          }
          console.log('');

          if (opts.arms.includes('ours')) {
            const oursRun = perArmRuns.ours[round];
            if (!oursRun.failed) {
              for (const arm of opts.arms) {
                if (arm === 'ours') continue;
                const armRun = perArmRuns[arm][round];
                if (armRun.failed) continue;
                roundRatios.push({ size, coverage, round: round + 1, arm, ratioVsOurs: armRun.wallSeconds / oursRun.wallSeconds });
              }
            }
          }
        }

        for (const arm of opts.arms) {
          const runs = perArmRuns[arm];
          const ok = runs.filter((r) => !r.failed);
          const wallMedian = ok.length ? median(ok.map((r) => r.wallSeconds)) : null;
          const wallMin = ok.length ? Math.min(...ok.map((r) => r.wallSeconds)) : null;
          const wallMax = ok.length ? Math.max(...ok.map((r) => r.wallSeconds)) : null;
          const rssValues = ok.filter((r) => r.rssSampled).map((r) => r.peakMb);
          const rssMedian = rssValues.length ? median(rssValues) : null;

          results.push({
            size,
            coverage,
            coverageProvider: coverage ? opts.coverageProvider : null,
            isolate: opts.isolate,
            methods: opts.methods,
            oursSource: opts.oursSource,
            arm,
            repeats: opts.repeats,
            failures: opts.repeats - ok.length,
            wallMedian,
            wallMin,
            wallMax,
            rssMedian,
            rssSampled: rssValues.length > 0,
            runs,
          });
        }
        console.log('');
      }
    }
  } finally {
    if (!opts.keep) cleanup();
  }

  const style = styleFor(process.stdout, process.argv.slice(2));
  const sizes = [...new Set(results.map((r) => r.size))];
  const arms = [...new Set(results.map((r) => r.arm))];
  const cellOf = (size, arm) => results.find((r) => r.size === size && r.arm === arm);

  // Green only when this package beats every competing *library* at every size measured, red the
  // moment it does not: the suite-scale row this project loses to a rival is the one a reader most
  // needs to notice, and the frame says so before the numbers are read. `manual` is excluded on
  // purpose — see COMPETITOR_ARMS.
  const competitors = arms.filter((arm) => COMPETITOR_ARMS.includes(arm));
  const oursWinsEverywhere = sizes.every((size) => {
    const ours = cellOf(size, 'ours')?.wallMedian;

    return (
      typeof ours === 'number' &&
      competitors.every((arm) => {
        const rival = cellOf(size, arm)?.wallMedian;

        return typeof rival !== 'number' || ours < rival;
      })
    );
  });
  const color = arms.includes('ours') && competitors.length > 0 ? (oursWinsEverywhere ? 'green' : 'red') : undefined;

  // One cell per arm rather than one row: wall-clock and peak RSS are read together — an arm that
  // wins the clock and loses the heap is the whole reason this harness measures both — and a
  // long-format table made the reader assemble that pairing themselves.
  console.log(paint(renderHeading('Results', style, 3).join('\n'), style === 'box' ? color : undefined));
  console.log('');
  console.log(
    renderTable(
      ['tests', ...arms.map(armLabel)],
      sizes.map((size) => {
        const ours = cellOf(size, 'ours');

        return [
          size.toLocaleString('en-US'),
          ...arms.map((arm) => {
            const cell = cellOf(size, arm);

            if (!cell || cell.wallMedian === null) {
              return 'FAIL';
            }

            const ratio = ours && ours.wallMedian && arm !== 'ours' ? ` (${fmt(cell.wallMedian / ours.wallMedian, 2)}×)` : '';
            const rss = cell.rssMedian === null ? (cell.rssSampled ? '' : '') : ` · ${fmt(cell.rssMedian, 0)} MB`;

            return `${fmt(cell.wallMedian)} s${ratio}${rss}`;
          }),
        ];
      }),
      { style, color: style === 'box' ? color : undefined },
    ).join('\n'),
  );
  console.log('');
  for (const line of resultsFootnote(arms, sizes, cellOf)) console.log(line);

  // The spread the medians above hide: same cell, same machine, minutes apart.
  console.log(renderHeading('Wall-clock per round, and the ratio to ours', style, 3).join('\n'));
  console.log('');
  console.log(
    renderTable(
      ['tests', ...arms.map(armLabel)],
      sizes.map((size) => [
        size.toLocaleString('en-US'),
        ...arms.map((arm) => {
          const cell = cellOf(size, arm);

          if (!cell) {
            return '—';
          }

          const rounds = cell.runs
            .filter((run) => !run.failed)
            .map((run) => {
              const ratio = roundRatios.find((r) => r.size === size && r.arm === arm && r.round === cell.runs.indexOf(run) + 1);

              return arm === 'ours' ? `${fmt(run.wallSeconds)}s` : `${fmt(ratio?.ratioVsOurs ?? 0, 2)}×`;
            });

          return rounds.join('  ');
        }),
      ]),
      { style, color: style === 'box' ? color : undefined },
    ).join('\n'),
  );
  console.log('');

  const failed = results.filter((r) => r.failures > 0);

  if (failed.length > 0) {
    console.log(renderHeading('Failed rounds', style, 3).join('\n'));
    console.log('');
    console.log(
      renderTable(
        ['tests', 'arm', 'failed rounds', 'of'],
        failed.map((r) => [r.size.toLocaleString('en-US'), r.arm, String(r.failures), String(r.repeats)]),
        { style, align: ['right', 'left', 'right', 'right'] },
      ).join('\n'),
    );
    console.log('');
  }

  if (opts.out) {
    writeFileSync(opts.out, JSON.stringify({ env, options: opts, results, roundRatios }, null, 2));
    console.log(`\nFull JSON written to ${opts.out}`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exitCode = 1;
});
