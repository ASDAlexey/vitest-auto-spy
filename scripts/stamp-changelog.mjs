#!/usr/bin/env node
/**
 * Move `## [Unreleased]` of CHANGELOG.md into the section of the version being released.
 *
 * Run by the `version` lifecycle script, so the stamp lands in the `chore(release)` commit that
 * `npm version` creates in `auto-release.yml`. It used to be a hand-made follow-up commit, and
 * 4.2.0 and 5.24.0 shipped without it.
 *
 * Usage:
 *   node scripts/stamp-changelog.mjs   # stamps the version in package.json with today's UTC date
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const UNRELEASED_LINK = /^\[Unreleased\]: (?<base>\S+\/compare\/)(?<previous>v\S+?)\.\.\.HEAD$/m;

/**
 * @param {string} text
 * @param {string} version
 * @param {string} date
 * @returns {string}
 */
export function stampChangelog(text, version, date) {
  if (text.includes(`\n## [${version}]`)) {
    return text;
  }

  if (!text.includes('\n## [Unreleased]\n')) {
    throw new Error('CHANGELOG.md has no "## [Unreleased]" heading to stamp.');
  }

  const stamped = text.replace('\n## [Unreleased]\n', `\n## [Unreleased]\n\n## [${version}] - ${date}\n`);
  const link = UNRELEASED_LINK.exec(stamped);

  if (link?.groups === undefined) {
    throw new Error('CHANGELOG.md has no "[Unreleased]: …/compare/vX.Y.Z...HEAD" link to repoint.');
  }

  const { base, previous } = link.groups;

  return stamped.replace(link[0], `[Unreleased]: ${base}v${version}...HEAD\n[${version}]: ${base}${previous}...v${version}`);
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const path = join(root, 'CHANGELOG.md');
  const before = readFileSync(path, 'utf8');
  const after = stampChangelog(before, version, new Date().toISOString().slice(0, 10));

  if (after !== before) {
    writeFileSync(path, after);
    console.log(`CHANGELOG.md: [Unreleased] -> [${version}]`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
