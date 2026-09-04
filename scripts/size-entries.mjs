#!/usr/bin/env node
// Weighs every entry point in `package.json` `exports` and holds each one against a committed
// baseline.
//
// Why this exists: this package has already shipped an entry point that silently gained a second
// copy of the core. While CommonJS was built for every subpath, esbuild could not code-split it, so
// each `.cjs` inlined its own `MockAdapter` / `ObservableSupport` registries — two bundles, two
// disconnected registries, and `require('vitest-auto-spy/rxjs')` next to `require(.../node)` died
// with "Observable spies require rxjs" (docs-site/core/performance.md, "Bundle size"). Nothing
// caught it by weight: `size:badge` measures `dist/index.js` and nothing else, so an adapter that
// stops sharing a chunk looks exactly like an adapter that does.
//
// Methodology is `scripts/size-badge.mjs` applied to all of `exports`: bundle the entry from
// `dist/`, minify and gzip it in memory, and exclude the peers a consumer already has. Nothing is
// written to `dist/`; the published bundles stay unminified on purpose (see tsup.config.ts).
//
// Usage:
//   node scripts/size-entries.mjs            # measure every entry and print the table
//   node scripts/size-entries.mjs --check    # exit 1 when an entry moved past tolerance (CI)
//   node scripts/size-entries.mjs --update   # rewrite size-entries.json from this measurement
//   node scripts/size-entries.mjs --markdown # print the table as markdown
import { build } from 'esbuild';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { renderTable, styleFor } from './bench-table.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = join(repoRoot, 'size-entries.json');
const DIST = join(repoRoot, 'dist');

// Peer/runtime deps a consumer already has — same list as tsup's `external` and as size-badge.mjs.
const EXTERNAL = ['@angular/core', '@angular/core/testing', 'bun:test', 'node:test', 'rxjs', 'rxjs/operators', 'vitest'];

// The subpaths past the main entry reach further than that list: `node:fs`, `bun`, `jsdom`,
// `@happy-dom/global-registrator`. The package ships zero runtime dependencies (check-dist.mjs
// enforces it), so every bare specifier left in dist/ is somebody else's code and none of it is
// weight this gate is measuring.
const externalizeBareImports = {
  name: 'externalize-bare-imports',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^[^./]/ }, (args) => (args.kind === 'entry-point' ? undefined : { external: true }));
  },
};

// Growth (or a shrink) smaller than both of these is noise from a minifier or a Node bump.
const TOLERANCE_RATIO = 0.02;
const TOLERANCE_BYTES = 200;

const NOTE =
  'Baseline for scripts/size-entries.mjs: min+gzip bytes per entry point, peers external. ' +
  'Regenerate with `npm run size:entries:update` and explain the diff in the commit.';

function usage() {
  // The file's own header, so the help and the comment cannot drift apart.
  stdout.write(
    readFileSync(new URL(import.meta.url), 'utf8')
      .split('\n')
      .slice(1, 21)
      .join('\n')
      .replace(/^\/\/ ?/gm, ''),
  );
  stdout.write('\n');
}

function fail(message) {
  stderr.write(`size-entries: ${message}\n`);
  exit(1);
}

/** The file an `import` of this subpath resolves to, walking whichever condition shape it uses. */
function resolveImport(target) {
  if (typeof target === 'string') {
    return target;
  }

  if (target && typeof target === 'object') {
    for (const condition of ['import', 'default']) {
      const resolved = resolveImport(target[condition]);

      if (resolved) {
        return resolved;
      }
    }
  }

  return undefined;
}

function readEntries() {
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const entries = [];

  for (const [name, target] of Object.entries(manifest.exports ?? {})) {
    const file = resolveImport(target);

    if (!file) {
      fail(`\`exports["${name}"]\` has no import condition — this script cannot weigh it.`);
    }

    entries.push({ name, file, path: join(repoRoot, file) });
  }

  if (entries.length === 0) {
    fail('package.json declares no `exports` — nothing to measure.');
  }

  return entries;
}

async function measure(entry) {
  const result = await build({
    entryPoints: [entry.path],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'neutral',
    external: EXTERNAL,
    plugins: [externalizeBareImports],
    write: false,
    logLevel: 'silent',
  });

  const [output] = result.outputFiles;

  return gzipSync(output.contents, { level: 9 }).length;
}

function formatBytes(bytes) {
  return bytes < 1000 ? `${bytes} B` : `${(bytes / 1000).toFixed(2)} kB`;
}

function formatDelta(bytes, baseline) {
  if (baseline === undefined) {
    return 'new';
  }

  const delta = bytes - baseline;

  if (delta === 0) {
    return '—';
  }

  const sign = delta > 0 ? '+' : '−';
  const percent = ((Math.abs(delta) / baseline) * 100).toFixed(1);

  return `${sign}${formatBytes(Math.abs(delta))} ${sign}${percent}%`;
}

function tolerance(baseline) {
  return Math.max(TOLERANCE_BYTES, Math.round(baseline * TOLERANCE_RATIO));
}

function readBaseline() {
  if (!existsSync(BASELINE)) {
    return undefined;
  }

  const parsed = JSON.parse(readFileSync(BASELINE, 'utf8'));

  return parsed.entries ?? {};
}

function writeBaseline(measurements) {
  const entries = Object.fromEntries(measurements.map((row) => [row.name, row.bytes]));

  // `entries` before `note`: that is the order prettier's sort-json plugin would impose anyway.
  writeFileSync(BASELINE, `${JSON.stringify({ entries, note: NOTE }, undefined, 2)}\n`);
}

/** Every way the measurement can disagree with the baseline, as sentences a reader can act on. */
function violations(measurements, baseline) {
  const problems = [];

  for (const { name, bytes } of measurements) {
    const recorded = baseline[name];

    if (recorded === undefined) {
      problems.push(`${name} is not in the baseline — a new entry point must be recorded.`);
      continue;
    }

    const delta = bytes - recorded;
    const allowed = tolerance(recorded);

    if (delta > allowed) {
      problems.push(`${name} grew by ${delta} B (${recorded} -> ${bytes}), past the ${allowed} B allowance.`);
    } else if (-delta > allowed) {
      problems.push(`${name} shrank by ${-delta} B (${recorded} -> ${bytes}), past the ${allowed} B allowance.`);
    }
  }

  const measured = new Set(measurements.map((row) => row.name));

  for (const name of Object.keys(baseline)) {
    if (!measured.has(name)) {
      problems.push(`${name} is in the baseline but no longer exported.`);
    }
  }

  return problems;
}

async function main() {
  if (argv.includes('--help') || argv.includes('-h')) {
    usage();

    return;
  }

  const check = argv.includes('--check');
  const update = argv.includes('--update');

  if (!existsSync(DIST)) {
    fail('dist/ is missing — run `npm run build` first.');
  }

  const entries = readEntries();
  const missing = entries.filter((entry) => !existsSync(entry.path));

  if (missing.length > 0) {
    fail(`${missing.map((entry) => entry.file).join(', ')} missing from dist/ — run \`npm run build\` first.`);
  }

  const measurements = [];

  for (const entry of entries) {
    try {
      measurements.push({ name: entry.name, bytes: await measure(entry) });
    } catch (error) {
      fail(`could not bundle ${entry.file}: ${error.message.split('\n')[0]}`);
    }
  }

  // Read before writing, so `--update` still shows what it is about to record over.
  const baseline = readBaseline();

  if (update) {
    writeBaseline(measurements);
    stdout.write(`size-entries: baseline rewritten for ${measurements.length} entries\n`);
  }

  const problems = baseline && !update ? violations(measurements, baseline) : [];
  const style = styleFor(stdout, argv);
  const rows = measurements.map(({ name, bytes }) => [name, formatBytes(bytes), formatDelta(bytes, baseline?.[name])]);
  const total = measurements.reduce((sum, row) => sum + row.bytes, 0);

  rows.push(['total', formatBytes(total), '']);

  const color = problems.length > 0 ? 'red' : 'green';

  stdout.write(`${renderTable(['entry', 'min+gzip', 'delta'], rows, { style, color }).join('\n')}\n`);

  if (!baseline && !update) {
    stderr.write('size-entries: no size-entries.json yet — run `npm run size:entries:update` to record one.\n');
    exit(check ? 1 : 0);
  }

  if (problems.length === 0) {
    return;
  }

  for (const problem of problems) {
    stderr.write(`size-entries: ${problem}\n`);
  }

  // A shrink is a violation too: the baseline is a record, and an entry that lost a fifth of its
  // weight is either a win worth writing down or a chunk that stopped being bundled at all.
  stderr.write('size-entries: if the change is intended, run `npm run size:entries:update` and say why in the commit.\n');

  if (check) {
    exit(1);
  }
}

await main();
