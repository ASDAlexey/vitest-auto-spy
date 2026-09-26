#!/usr/bin/env node
// Usage: node setup-arm.mjs <A|B|C> <specFiles> [--work <dir>] [--lib <version>] [--seed <n>]
// Creates <work>/arms/<arm>-<files>/ with a generated workspace and a fresh npm install of the
// published vitest-auto-spy tarball. Nothing is installed into this repository.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { ARMS, DEFAULT_LIB, DEFAULT_SEED, DEFAULT_WORK, HERE, armDir, isMain, ngEnv } from './common.mjs';

const VERSION_PICK = [
  '@angular/core',
  '@angular/build',
  '@angular/cli',
  '@angular/compiler-cli',
  'vitest',
  '@vitest/coverage-v8',
  '@vitest/coverage-istanbul',
  'vite',
  'esbuild',
  'jsdom',
  'typescript',
  'vitest-auto-spy',
];

export function ensureTarball(work, lib) {
  mkdirSync(work, { recursive: true });
  const out = execFileSync('npm', ['pack', `vitest-auto-spy@${lib}`, '--json', '--pack-destination', work], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return join(work, JSON.parse(out)[0].filename);
}

const pkgJson = (arm, files, tarball) => {
  const { ng, ngTool, vitest } = ARMS[arm];
  return {
    name: `bench-${arm}-${files}`,
    version: '0.0.0',
    private: true,
    scripts: { ng: 'ng', test: 'ng test' },
    dependencies: {
      '@angular/common': ng,
      '@angular/compiler': ng,
      '@angular/core': ng,
      '@angular/forms': ng,
      '@angular/platform-browser': ng,
      '@angular/router': ng,
      rxjs: '7.8.2',
      tslib: '2.8.1',
    },
    devDependencies: {
      '@angular/build': ngTool,
      '@angular/cli': ngTool,
      '@angular/compiler-cli': ng,
      '@vitest/coverage-istanbul': vitest,
      '@vitest/coverage-v8': vitest,
      jsdom: '30.1.1',
      typescript: '6.0.3',
      vitest,
      'vitest-auto-spy': `file:${tarball}`,
    },
  };
};

// The builder has no provider option and picks v8 when both packages are installed, so each
// provider gets a runner config that sets nothing else.
const runnerConfig = (provider) =>
  `import { defineConfig } from 'vitest/config';\n\nexport default defineConfig({ test: { coverage: { provider: '${provider}' } } });\n`;

export function setupArm({ work = DEFAULT_WORK, arm, files, seed = DEFAULT_SEED, tarball, reinstall = false }) {
  if (!ARMS[arm]) throw new Error(`unknown arm ${arm}`);
  const dir = armDir(work, arm, files);
  const stamp = JSON.stringify({ arm, files, seed, tarball, ...ARMS[arm] });
  const stampPath = join(dir, 'bench-stamp.json');
  if (!reinstall && existsSync(join(dir, 'versions.json')) && existsSync(stampPath) && readFileSync(stampPath, 'utf8') === stamp) {
    return dir;
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const summary = execFileSync(process.execPath, [join(HERE, 'gen.mjs'), dir, String(files), String(seed)], { encoding: 'utf8' });
  writeFileSync(join(dir, 'gen-summary.json'), summary);
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkgJson(arm, files, tarball), null, 2) + '\n');
  for (const provider of ['v8', 'istanbul']) writeFileSync(join(dir, `vitest-${provider}.config.mts`), runnerConfig(provider));
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir, env: ngEnv(), stdio: 'inherit' });
  const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8')).packages;
  const versions = Object.fromEntries(VERSION_PICK.map((p) => [p, lock[`node_modules/${p}`]?.version ?? null]));
  writeFileSync(join(dir, 'versions.json'), JSON.stringify(versions) + '\n');
  writeFileSync(stampPath, stamp);
  return dir;
}

if (isMain(import.meta.url)) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { work: { type: 'string' }, lib: { type: 'string' }, seed: { type: 'string' }, reinstall: { type: 'boolean' } },
  });
  const [arm, files] = positionals;
  if (!arm || !files) {
    console.error('usage: node setup-arm.mjs <A|B|C> <specFiles> [--work <dir>] [--lib <version>] [--seed <n>] [--reinstall]');
    process.exit(2);
  }
  const work = values.work ?? DEFAULT_WORK;
  const tarball = ensureTarball(work, values.lib ?? DEFAULT_LIB);
  const dir = setupArm({
    work,
    arm,
    files: Number(files),
    seed: Number(values.seed ?? DEFAULT_SEED),
    tarball,
    reinstall: values.reinstall,
  });
  console.log(readFileSync(join(dir, 'versions.json'), 'utf8').trim());
}
