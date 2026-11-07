#!/usr/bin/env node
// The tarball carries the latest releases of the changelog and the npm part of the README.
//
// `CHANGELOG.md` ships so a consumer bumping the version can read what changed without leaving
// `node_modules` (5.26.0); the last ten releases cover that, the rest is on GitHub. `README.md` is
// cut at its `<!-- npm-readme-cut` marker, which is all npmjs.com renders anyway. npm cannot pack a
// file under another name, so `prepack` swaps in the trimmed text and `postpack` puts the full back.
//
// Usage:
//   node scripts/pack-changelog.mjs --trim      write the trimmed files, keep the full ones aside
//   node scripts/pack-changelog.mjs --restore   put the full files back (no-op when nothing is aside)
//   node scripts/pack-changelog.mjs --print     print the trimmed changelog, touch nothing
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY = 'https://github.com/ASDAlexey/vitest-auto-spy';
const FULL_HISTORY = `${REPOSITORY}/blob/master/CHANGELOG.md`;
const KEPT_RELEASES = 10;
const README_CUT = '<!-- npm-readme-cut';

// The aside copies are outside `files`, so never packed, and visible in `git status` if a pack died.
const FILES = [
  {
    path: join(REPO, 'CHANGELOG.md'),
    aside: join(REPO, '.changelog-full.md'),
    trim: (text) => trimChangelog(text, currentMajor(), KEPT_RELEASES),
  },
  { path: join(REPO, 'README.md'), aside: join(REPO, '.readme-full.md'), trim: trimReadme },
];

const VERSION_HEADING = /^## \[(?<version>(?<major>\d+)\.\d+\.\d+)\]/;
const LINK_DEFINITION = /^\[(?<label>[^\]]+)\]: \S+$/;

/**
 * The newest major's sections, at most `keep` of them, the link definitions they use, and a pointer
 * to the full file.
 *
 * @param {string} text
 * @param {number} major
 * @param {number} [keep]
 * @returns {string}
 */
export function trimChangelog(text, major, keep = Number.POSITIVE_INFINITY) {
  const lines = text.replace(/\n+$/, '').split('\n');
  const headings = lines.flatMap((line, index) => {
    const heading = VERSION_HEADING.exec(line);

    return heading === null ? [] : [{ index, version: heading.groups.version, major: Number(heading.groups.major) }];
  });
  const firstOlder = headings.findIndex((heading) => heading.major < major);
  const byMajor = firstOlder === -1 ? headings.length : firstOlder;
  const cut = Math.min(byMajor, keep);

  if (cut >= headings.length) {
    return text;
  }

  const kept = lines.slice(0, headings[cut].index);

  while (kept.at(-1) === '') {
    kept.pop();
  }

  const keptVersions = new Set(headings.slice(0, cut).map((heading) => heading.version));
  const definitions = lines.slice(headings[cut].index).filter((line) => {
    const label = LINK_DEFINITION.exec(line)?.groups.label;

    return label !== undefined && (label === 'Unreleased' || keptVersions.has(label));
  });
  const pointer =
    cut < byMajor
      ? [`This copy ships with the package and carries the latest ${cut} releases. Every earlier one is in the`]
      : [`This copy ships with the package and carries ${major}.x only. Releases before ${major}.0.0 are in the`];

  return [...kept, '', '## Earlier releases', '', ...pointer, `[full changelog](${FULL_HISTORY}).`, '', ...definitions, ''].join('\n');
}

function githubSlug(heading) {
  return heading
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

/**
 * The README up to its npm cut. An in-page link whose heading is below the cut points at GitHub.
 *
 * @param {string} text
 * @returns {string}
 */
export function trimReadme(text) {
  const cut = text.indexOf(README_CUT);

  if (cut === -1) {
    throw new Error(`README.md has no \`${README_CUT}\` marker`);
  }

  const kept = text.slice(0, cut).replace(/\s+$/, '');
  const anchors = new Set([...kept.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) => githubSlug(heading)));

  return `${kept.replace(/\]\(#([^)\s]+)\)/g, (link, anchor) => (anchors.has(anchor) ? link : `](${REPOSITORY}#${anchor})`))}\n`;
}

function currentMajor() {
  const { version } = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));

  return Number(version.split('.')[0]);
}

function trim() {
  const stale = FILES.filter((file) => existsSync(file.aside));

  if (stale.length > 0) {
    stderr.write(
      `pack-changelog: ${stale.map((file) => file.aside).join(', ')} still aside from an earlier pack — run with --restore first.\n`,
    );
    exit(1);
  }

  const texts = FILES.map((file) => {
    const full = readFileSync(file.path, 'utf8');

    return { file, full, trimmed: file.trim(full) };
  });

  for (const { file, full, trimmed } of texts) {
    renameSync(file.path, file.aside);
    writeFileSync(file.path, trimmed);
    stdout.write(
      `pack-changelog: ${file.path.slice(REPO.length + 1)} ${Buffer.byteLength(full)} -> ${Buffer.byteLength(trimmed)} B for the tarball\n`,
    );
  }
}

function restore() {
  for (const file of FILES) {
    if (existsSync(file.aside)) {
      renameSync(file.aside, file.path);
      stdout.write(`pack-changelog: full ${file.path.slice(REPO.length + 1)} restored\n`);
    }
  }
}

function main() {
  if (argv.includes('--trim')) {
    trim();
  } else if (argv.includes('--restore')) {
    restore();
  } else if (argv.includes('--print')) {
    stdout.write(FILES[0].trim(readFileSync(FILES[0].path, 'utf8')));
  } else {
    stdout.write(
      `${readFileSync(new URL(import.meta.url), 'utf8')
        .split('\n')
        .slice(1, 12)
        .join('\n')
        .replace(/^\/\/ ?/gm, '')}\n`,
    );
  }
}

if (argv[1] !== undefined && import.meta.url === pathToFileURL(argv[1]).href) {
  main();
}
