#!/usr/bin/env node
// Measures the real min+gzip weight of the package's main entry and writes it
// into the README badge.
//
// Why this exists: the badge used to point at bundlephobia, which is effectively
// unmaintained and answers `429 rate limited by upstream service` most of the
// time. Every live alternative measures the wrong thing —
// `npm/unpacked-size` reports the whole tarball (10 entry points x 2 formats +
// types + README, ~325 kB) and bundlejs reports ~91 kB; the main entry a
// consumer actually imports is an order of magnitude smaller than both.
//
// Methodology mirrors what bundlephobia did: bundle the main entry, minify it,
// gzip it, and exclude peer dependencies the consumer already has. The
// published bundles stay unminified on purpose (see tsup.config.ts) — the
// minification here happens in memory and never touches dist/.
//
// Usage:
//   node scripts/size-badge.mjs           # rewrite the README badge
//   node scripts/size-badge.mjs --check   # exit 1 if the badge is stale (CI)
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const ENTRY = 'dist/index.js';
const README = 'README.md';

// Peer/runtime deps a consumer already has — same list as tsup's `external`.
// Bundling them in would inflate the number with code we never ship.
const EXTERNAL = ['@angular/core', '@angular/core/testing', 'bun:test', 'node:test', 'rxjs', 'rxjs/operators', 'vitest'];

// Matches the shields.io badge, capturing everything around the size so the
// label, colour and link survive a rewrite untouched.
const BADGE_RE = /(\[!\[minzipped size\]\(https:\/\/img\.shields\.io\/badge\/minzip-)([^-)]+)(-[^)]*\)\][^\n]*)/;

async function measure() {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'neutral',
    external: EXTERNAL,
    write: false,
    logLevel: 'silent',
  });

  const [output] = result.outputFiles;

  return gzipSync(output.contents, { level: 9 }).length;
}

function format(bytes) {
  // shields.io treats `-` as a field separator, so the space must be encoded.
  return `${(bytes / 1000).toFixed(1)}%20kB`;
}

const check = process.argv.includes('--check');
const bytes = await measure();
const size = format(bytes);
const readme = readFileSync(README, 'utf8');
const match = readme.match(BADGE_RE);

if (!match) {
  console.error(`size-badge: no minzip badge found in ${README} — did the badge markup change?`);
  process.exit(1);
}

const current = match[2];
const pretty = size.replace('%20', ' ');

if (current === size) {
  console.info(`size-badge: up to date (${pretty}, ${bytes} B gzipped)`);
  process.exit(0);
}

if (check) {
  console.error(`size-badge: stale badge — README says ${current.replace('%20', ' ')}, actual is ${pretty}.`);
  console.error('size-badge: run `npm run size:badge` and commit the result.');
  process.exit(1);
}

writeFileSync(README, readme.replace(BADGE_RE, `$1${size}$3`));
console.info(`size-badge: updated ${current.replace('%20', ' ')} -> ${pretty} (${bytes} B gzipped)`);
