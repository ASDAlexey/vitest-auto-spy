#!/usr/bin/env node

/**
 * Fail when `node_modules` no longer matches `package-lock.json`.
 *
 * CI installs with `npm ci`, which reads the lockfile and nothing else; a local checkout drifts
 * ahead of it as soon as anything resolves a caret range to a newer release without the lock
 * being rewritten. Every local check then runs against versions CI will never install. That is
 * how six unformatted files reached `master` in run 33809331896: the tree had prettier 3.9.6, the
 * lock pinned 3.8.4, and the two disagreed about those six files — with seventeen other packages
 * drifted the same way, waiting to do the same to lint, jscpd or the suites.
 *
 * Only direct dependencies are compared. A transitive drift is real but is a symptom of the same
 * stale lock, and listing the whole tree would bury the line that matters.
 *
 * Usage:
 *   node scripts/check-dep-drift.mjs   # fails when the installed tree differs from the lockfile
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const readJson = (...parts) => JSON.parse(readFileSync(join(root, ...parts), 'utf8'));

function fail(message) {
  process.stderr.write(`check-dep-drift: ${message}\n`);
  process.exit(1);
}

function main() {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).sort();

  const missing = [];
  const drifted = [];

  for (const name of names) {
    const locked = lock.packages?.[`node_modules/${name}`]?.version;

    if (!locked) continue;

    let installed;

    try {
      installed = JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
    } catch {
      missing.push(name);
      continue;
    }

    if (installed !== locked) drifted.push(`${name}: lockfile ${locked}, installed ${installed}`);
  }

  if (missing.length) {
    fail(`${missing.length} dependencies are not installed — run \`npm ci\`.\n  ${missing.join('\n  ')}`);
  }

  if (drifted.length) {
    fail(
      `${drifted.length} dependencies differ from the lockfile, so this gate is not testing what CI installs.\n  ` +
        drifted.join('\n  ') +
        `\n  Run \`npm ci\` to match the lockfile, or \`npm update\` and commit the lockfile to keep the newer versions.`,
    );
  }

  process.stdout.write(`check-dep-drift: ${names.length} direct dependencies match the lockfile\n`);
}

main();
