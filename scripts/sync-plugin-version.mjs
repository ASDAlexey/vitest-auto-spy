#!/usr/bin/env node
/**
 * Keep the Claude Code plugin manifests on the same version as `package.json`.
 *
 * The skill in `skills/` describes the API of a specific release, so a plugin installed from this
 * repository advertising a stale version is actively misleading. `npm version` runs the `version`
 * lifecycle script and stages whatever it changes, so the bump reaches both manifests inside the
 * release commit itself.
 *
 * Usage:
 *   node scripts/sync-plugin-version.mjs           # write
 *   node scripts/sync-plugin-version.mjs --check   # fail when out of sync
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/** `[file, mutate]` — each mutate returns `true` when it changed something. */
const TARGETS = [
  [
    join(ROOT, '.claude-plugin', 'plugin.json'),
    (manifest) => {
      const changed = manifest.version !== version;
      manifest.version = version;

      return changed;
    },
  ],
  [
    join(ROOT, '.claude-plugin', 'marketplace.json'),
    (manifest) => {
      let changed = false;

      for (const plugin of manifest.plugins) {
        changed ||= plugin.version !== version;
        plugin.version = version;
      }

      return changed;
    },
  ],
];

const check = process.argv.includes('--check');
const stale = [];

for (const [path, mutate] of TARGETS) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'));

  if (!mutate(manifest)) {
    continue;
  }

  if (check) {
    stale.push(relative(ROOT, path));
    continue;
  }

  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${relative(ROOT, path)} → ${version}\n`);
}

if (stale.length > 0) {
  process.stderr.write(`Plugin manifests are not on ${version}: ${stale.join(', ')}. Run \`npm run plugin:sync\`.\n`);
  process.exitCode = 1;
} else if (check) {
  process.stdout.write(`Plugin manifests are on ${version}\n`);
}
