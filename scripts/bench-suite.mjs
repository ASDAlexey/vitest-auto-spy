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
//   --isolate <bool>     Vitest test.isolate for the generated project. Default: true
//   --ours-source <mode> src | dist — what the `ours`/`ours-proxy` arms import. Default: dist.
//                        'dist' is the fair comparison: a consumer loads prebuilt dist/, under
//                        node_modules once installed, exactly like `hirez` does. 'src' imports
//                        this repo's TypeScript directly and is measurably slower — it pays an
//                        esbuild transform per worker AND, unlike node_modules code, is not
//                        exempt from @vitest/coverage-v8's RPC-level coverage collection.
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

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

const KNOWN_ARMS = ['ours', 'ours-proxy', 'hirez', 'manual'];
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
  --isolate <bool>     Vitest test.isolate for the generated project. Default: true
  --ours-source <mode> src | dist — what ours/ours-proxy import. Default: dist (see script header).
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
  console.log('=== Environment ===');
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
    // 'src' goes through esbuild on every worker and is NOT under node_modules, so
    // @vitest/coverage-v8 collects and RPC-transfers its coverage; 'dist' is prebuilt and,
    // once installed as a real dependency, sits under node_modules like `hirez` does —
    // that is what a consumer actually loads, so it is the default and the fair comparison.
    const entry = path.join(REPO_ROOT, oursSource === 'src' ? 'src/index.ts' : 'dist/index.js');
    let rel = path.relative(fixturesDir, entry).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    const options = arm === 'ours-proxy' ? ", { lazySpies: 'proxy' }" : '';
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

function generateProject(dir, { arm, totalTests, methodCount, coverage, isolate, oursSource }) {
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
      provider: 'v8',
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
    ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Json -Compress'],
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

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function fmt(n, digits = 2) {
  return Number(n).toFixed(digits);
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
    console.log(`About to install (pinned, per project that needs it): @bugsplat/vitest-auto-spies@${PINNED_DEPS['@bugsplat/vitest-auto-spies']}`);
  }
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
        console.log(`=== size=${size} coverage=${coverage ? 'on' : 'off'} isolate=${opts.isolate} ours-source=${opts.oursSource} ===`);

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
            isolate: opts.isolate,
            oursSource: opts.oursSource,
          });
          if (arm === 'hirez') installHirez(cellDir);
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

  if (roundRatios.length > 0) {
    console.log('=== Ratio vs. ours, per round (interleaved — same round, back-to-back) ===');
    console.log('size\tarm\tround\tratio');
    for (const r of roundRatios) {
      console.log(`${r.size}\t${r.arm}\t${r.round}\t${fmt(r.ratioVsOurs, 3)}`);
    }
    console.log('');
  }

  console.log('=== Results ===');
  console.log('size\tcov\tarm\tmedian_s\tmin_s\tmax_s\trss_mb\tfailures');
  for (const r of results) {
    console.log(
      `${r.size}\t${r.coverage ? 'on' : 'off'}\t${r.arm}\t${r.wallMedian === null ? 'FAIL' : fmt(r.wallMedian)}\t` +
        `${r.wallMin === null ? '-' : fmt(r.wallMin)}\t${r.wallMax === null ? '-' : fmt(r.wallMax)}\t` +
        `${r.rssMedian === null ? (r.rssSampled ? '-' : 'n/a') : fmt(r.rssMedian, 0)}\t${r.failures}`,
    );
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
