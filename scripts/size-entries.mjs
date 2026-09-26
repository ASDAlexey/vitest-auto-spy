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
//   node scripts/size-entries.mjs --release  # mark the recorded sizes as the release baseline
//   node scripts/size-entries.mjs --markdown # print the table as markdown
//
// `--check` also fails when an entry is more than 3 % above the last release (`released`) and the
// pending CHANGELOG section has no note on that entry's size — see scripts/changelog-notes.mjs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

import { renderTable, styleFor } from './bench-table.mjs';
import { hasSizeNote, readPendingChangelog } from './changelog-notes.mjs';
import { minGzip } from './min-gzip.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = join(repoRoot, 'size-entries.json');
const DIST = join(repoRoot, 'dist');

// Peers and host runtimes a consumer already has are excluded by one rule rather than by a list —
// see scripts/externals.mjs. The package ships zero runtime dependencies (check-dist.mjs enforces
// it), so every bare specifier left in dist/ is somebody else's code and none of it is weight this
// gate is measuring.

// Growth (or a shrink) smaller than both of these is noise from a minifier or a Node bump.
const TOLERANCE_RATIO = 0.02;
const TOLERANCE_BYTES = 200;

// Growth over the last release that needs a CHANGELOG note. Release to release since 4.2.0 the core
// entries grew 0–3 % when only fixes shipped (5.33.0 +1.2 %, 5.35.0 +1.0 %); every step above that
// was a feature or a build change worth naming: 5.19.0 +15 %, 5.25.0 `/setup` +11 %, 5.32.0 +12 %.
const NOTE_RATIO = 0.03;

const NOTE =
  'Baseline for scripts/size-entries.mjs: min+gzip bytes per entry point, peers external. ' +
  'Regenerate with `npm run size:entries:update` and explain the diff in the commit. ' +
  '`released` moves only in the `version` script; growth over it past 3 % needs a CHANGELOG note.';

function usage() {
  // The file's own header, so the help and the comment cannot drift apart.
  stdout.write(
    readFileSync(new URL(import.meta.url), 'utf8')
      .split('\n')
      .slice(1, 25)
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

    // `./package.json` is exported so tools can resolve the manifest; it is not a module and has no
    // bundled weight.
    if (!file.endsWith('.js')) {
      continue;
    }

    entries.push({ name, file, path: join(repoRoot, file) });
  }

  if (entries.length === 0) {
    fail('package.json declares no `exports` — nothing to measure.');
  }

  return entries;
}

async function measure(entry) {
  return minGzip(entry.path);
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

function readBaselineFile() {
  return existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : undefined;
}

function readBaseline() {
  const parsed = readBaselineFile();

  return parsed ? (parsed.entries ?? {}) : undefined;
}

function writeBaselineFile(entries, released) {
  // `entries` before `note`: that is the order prettier's sort-json plugin would impose anyway.
  writeFileSync(BASELINE, `${JSON.stringify({ entries, note: NOTE, released }, undefined, 2)}\n`);
}

function writeBaseline(measurements) {
  writeBaselineFile(Object.fromEntries(measurements.map((row) => [row.name, row.bytes])), readBaselineFile()?.released);
}

// No measurement: it runs in the `version` script, where `dist/` may predate the bump.
function markReleased() {
  const parsed = readBaselineFile();

  if (!parsed?.entries) {
    fail('no size-entries.json to mark as released.');
  }

  const { version } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

  writeBaselineFile(parsed.entries, { version, entries: parsed.entries });
  stdout.write(`size-entries: the recorded sizes are now the ${version} release baseline\n`);
}

/** Entries more than `NOTE_RATIO` above the last release that the pending CHANGELOG does not explain. */
function unexplainedGrowth(measurements) {
  const released = readBaselineFile()?.released;

  if (!released?.entries) {
    return ['size-entries.json has no `released` block — run `node scripts/size-entries.mjs --release` once.'];
  }

  const { pending } = readPendingChangelog(repoRoot);

  return measurements.flatMap(({ name, bytes }) => {
    const before = released.entries[name];

    if (before === undefined || bytes - before <= Math.max(TOLERANCE_BYTES, before * NOTE_RATIO) || hasSizeNote(pending, name)) {
      return [];
    }

    const percent = (((bytes - before) / before) * 100).toFixed(1);
    const label = name === '.' ? 'the root entry' : `\`${name.slice(1)}\``;

    return [
      `${name} is ${bytes - before} B (+${percent}%) above ${released.version} (${before} -> ${bytes}), and the pending ` +
        `CHANGELOG section does not mention its size. Add a line that names ${label} and says what the bytes buy.`,
    ];
  });
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

  if (argv.includes('--release')) {
    markReleased();

    return;
  }

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

  const drift = baseline && !update ? violations(measurements, baseline) : [];
  const unexplained = baseline && !update ? unexplainedGrowth(measurements) : [];
  const problems = [...drift, ...unexplained];
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
  if (drift.length > 0) {
    stderr.write('size-entries: if the change is intended, run `npm run size:entries:update` and say why in the commit.\n');
  }

  // Re-recording does not clear this one: `released` is not what `--update` writes.
  if (unexplained.length > 0) {
    stderr.write('size-entries: growth since the last release is explained in CHANGELOG.md, not by refreshing the baseline.\n');
  }

  if (check) {
    exit(1);
  }
}

await main();
