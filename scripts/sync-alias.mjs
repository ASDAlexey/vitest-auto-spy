#!/usr/bin/env node
/**
 * Regenerate the `vitest-auto-spies` alias package from the canonical `package.json`.
 *
 * The alias is a separate npm package whose whole content is one re-export stub per entry point.
 * Written by hand it drifts silently: it sat on 1.9.3 with no `/bun-angular`, `/setup`, `/zone` or
 * `/eslint-plugin` long after those shipped, and it advertised `require` for entries that are
 * ESM-only — a promise the canonical package does not make and cannot keep.
 *
 * So the entry list, the condition shapes, the peer range and the version all come from
 * `package.json` here, and `--check` fails CI the moment they diverge. Publishing the alias stays
 * manual (`cd alias && npm publish`), because it is a different package on npm.
 *
 * Usage:
 *   node scripts/sync-alias.mjs           # write
 *   node scripts/sync-alias.mjs --check   # fail when out of sync
 */
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ALIAS_DIR = join(ROOT, 'alias');
const CANONICAL = 'vitest-auto-spy';

const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const check = process.argv.includes('--check');

/** `'.'` → `index`, `'./bun-angular'` → `bun-angular`. */
function stemOf(subpath) {
  return subpath === '.' ? 'index' : subpath.slice(2);
}

/** What the stub for `subpath` re-exports: `vitest-auto-spy`, or `vitest-auto-spy/angular`. */
function targetOf(subpath) {
  return subpath === '.' ? CANONICAL : `${CANONICAL}/${stemOf(subpath)}`;
}

/**
 * The entries, each with the file set it needs.
 *
 * A `require` condition on the canonical entry is the only reason to emit CJS: everything else is
 * ESM-only, and a `.cjs` stub for it would resolve to an ESM file and throw `ERR_REQUIRE_ESM` on
 * every Node that does not load ESM from `require` — which is every Node below 22.12.
 */
const entries = Object.entries(root.exports).map(([subpath, conditions]) => ({
  subpath,
  stem: stemOf(subpath),
  target: targetOf(subpath),
  dual: typeof conditions === 'object' && conditions !== null && 'require' in conditions,
}));

/**
 * `export * from` does **not** carry the default export, so an entry that has one needs a second
 * line — and an entry that has none must not get it, or Node throws `SyntaxError: The requested
 * module does not provide an export named 'default'` on import. The source is the authority
 * because `dist/` need not exist when this runs (`npm run check` does not build).
 */
function hasDefaultExport(stem) {
  try {
    return /^export default /m.test(readFileSync(join(ROOT, 'src', `${stem}.ts`), 'utf8'));
  } catch {
    return false;
  }
}

/** The generated files, `name → content`. */
const files = new Map();

for (const { stem, target, dual } of entries) {
  const reexport = `export * from '${target}';\n` + (hasDefaultExport(stem) ? `export { default } from '${target}';\n` : '');

  files.set(`${stem}.js`, reexport);
  files.set(`${stem}.d.ts`, reexport);

  if (dual) {
    files.set(`${stem}.cjs`, `module.exports = require('${target}');\n`);
    files.set(`${stem}.d.cts`, reexport);
  }
}

const exportsMap = {};

for (const { subpath, stem, dual } of entries) {
  exportsMap[subpath] = dual
    ? {
        import: { types: `./${stem}.d.ts`, default: `./${stem}.js` },
        require: { types: `./${stem}.d.cts`, default: `./${stem}.cjs` },
      }
    : { types: `./${stem}.d.ts`, import: `./${stem}.js`, default: `./${stem}.js` };
}

const alias = JSON.parse(readFileSync(join(ALIAS_DIR, 'package.json'), 'utf8'));

// Only the generated half is overwritten — name, description and keywords stay hand-written.
const generated = {
  version: root.version,
  main: './index.js',
  module: './index.js',
  types: './index.d.ts',
  exports: exportsMap,
  files: ['*.js', '*.cjs', '*.d.ts', '*.d.cts', 'README.md'],
  // Every entry registers a mock adapter (or installs a patch) on import, so no stub is prunable.
  sideEffects: [...files.keys()].filter((name) => name.endsWith('.js') || name.endsWith('.cjs')).map((name) => `./${name}`),
  dependencies: { [CANONICAL]: `^${root.version}` },
  peerDependencies: { ...root.peerDependencies },
  peerDependenciesMeta: { ...root.peerDependenciesMeta },
  engines: { ...root.engines },
};

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const before = serialize(alias);

Object.assign(alias, generated);

const manifest = serialize(alias);
const stale = [];

if (manifest !== before) {
  stale.push('package.json');
}

for (const [name, content] of files) {
  let current;

  try {
    current = readFileSync(join(ALIAS_DIR, name), 'utf8');
  } catch {
    current = undefined;
  }

  if (current !== content) {
    stale.push(name);
  }
}

/** Stubs left behind by an entry point that has since been renamed or dropped its CJS build. */
const orphans = readdirSync(ALIAS_DIR).filter((name) => /\.(?:js|cjs|d\.ts|d\.cts)$/.test(name) && !files.has(name));

if (check) {
  const problems = [...stale, ...orphans.map((name) => `${name} (orphan)`)];

  if (problems.length > 0) {
    process.stderr.write(`The alias package is out of sync with package.json: ${problems.join(', ')}. Run \`npm run alias:sync\`.\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Alias package is in sync (${entries.length} entry points, v${root.version})\n`);
  }
} else {
  writeFileSync(join(ALIAS_DIR, 'package.json'), manifest);

  for (const [name, content] of files) {
    writeFileSync(join(ALIAS_DIR, name), content);
  }

  for (const name of orphans) {
    rmSync(join(ALIAS_DIR, name));
  }

  const removed = orphans.length > 0 ? `, removed ${orphans.length} orphan(s): ${orphans.join(', ')}` : '';

  process.stdout.write(`${relative(ROOT, ALIAS_DIR)}/ → v${root.version}, ${entries.length} entry points${removed}\n`);
}
