#!/usr/bin/env node
// The tarball carries the current major's changelog; the repository keeps every release.
//
// `CHANGELOG.md` ships so a consumer bumping the version can read what changed without leaving
// `node_modules` (5.26.0). The history behind the current major is ~40 % of the file and nobody
// upgrading within it reads that part there. npm has no way to pack a file under another name, and
// npm 11 includes a changelog only because `files` names it, so `prepack` swaps in the trimmed text
// and `postpack` puts the full one back.
//
// Usage:
//   node scripts/pack-changelog.mjs --trim      write the trimmed CHANGELOG.md, keep the full one aside
//   node scripts/pack-changelog.mjs --restore   put the full CHANGELOG.md back (no-op when nothing is aside)
//   node scripts/pack-changelog.mjs --print     print the trimmed text, touch nothing
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHANGELOG = join(REPO, 'CHANGELOG.md');
// Outside `files`, so it is never packed, and visible in `git status` if a pack died half-way.
const ASIDE = join(REPO, '.changelog-full.md');
const FULL_HISTORY = 'https://github.com/ASDAlexey/vitest-auto-spy/blob/master/CHANGELOG.md';

const VERSION_HEADING = /^## \[(?<version>\d+)\.\d+\.\d+\]/;
const LINK_DEFINITION = /^\[(?<label>[^\]]+)\]: \S+$/;

/**
 * Everything up to and including the newest major's sections, the link definitions those sections
 * use, and a pointer to the full file.
 *
 * @param {string} text
 * @param {number} major
 * @returns {string}
 */
export function trimChangelog(text, major) {
  const lines = text.replace(/\n+$/, '').split('\n');
  const firstOlder = lines.findIndex((line) => {
    const heading = VERSION_HEADING.exec(line);

    return heading !== null && Number(heading.groups.version) < major;
  });

  if (firstOlder === -1) {
    return text;
  }

  const kept = lines.slice(0, firstOlder);

  while (kept.at(-1) === '') {
    kept.pop();
  }

  const definitions = lines.slice(firstOlder).filter((line) => {
    const definition = LINK_DEFINITION.exec(line);
    const label = definition?.groups.label;

    return label !== undefined && (label === 'Unreleased' || label.startsWith(`${major}.`));
  });

  return [
    ...kept,
    '',
    '## Earlier releases',
    '',
    `This copy ships with the package and carries ${major}.x only. Releases before ${major}.0.0 are in the`,
    `[full changelog](${FULL_HISTORY}).`,
    '',
    ...definitions,
    '',
  ].join('\n');
}

function currentMajor() {
  const { version } = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));

  return Number(version.split('.')[0]);
}

function trim() {
  if (existsSync(ASIDE)) {
    stderr.write('pack-changelog: .changelog-full.md is still aside from an earlier pack — run with --restore first.\n');
    exit(1);
  }

  const full = readFileSync(CHANGELOG, 'utf8');
  const trimmed = trimChangelog(full, currentMajor());

  renameSync(CHANGELOG, ASIDE);
  writeFileSync(CHANGELOG, trimmed);
  stdout.write(`pack-changelog: CHANGELOG.md ${Buffer.byteLength(full)} -> ${Buffer.byteLength(trimmed)} B for the tarball\n`);
}

function restore() {
  if (existsSync(ASIDE)) {
    renameSync(ASIDE, CHANGELOG);
    stdout.write('pack-changelog: full CHANGELOG.md restored\n');
  }
}

function main() {
  if (argv.includes('--trim')) {
    trim();
  } else if (argv.includes('--restore')) {
    restore();
  } else if (argv.includes('--print')) {
    stdout.write(trimChangelog(readFileSync(CHANGELOG, 'utf8'), currentMajor()));
  } else {
    stdout.write(
      `${readFileSync(new URL(import.meta.url), 'utf8')
        .split('\n')
        .slice(1, 14)
        .join('\n')
        .replace(/^\/\/ ?/gm, '')}\n`,
    );
  }
}

if (argv[1] !== undefined && import.meta.url === pathToFileURL(argv[1]).href) {
  main();
}
