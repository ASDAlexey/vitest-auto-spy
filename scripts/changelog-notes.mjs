// Growth over the last release has to be written down, not just re-recorded.
//
// `size-entries.json` and `cold-import.json` are records: `--update` rewrites them, and every
// release used to do exactly that. Between 4.2.0 and 5.34.0 the root entry grew +84 % and `/setup`
// +112 % min+gzip across ~40 refresh commits with not one stop, because a refreshed baseline agrees
// with whatever it was refreshed from. So each file also keeps the numbers of the last release, which
// only the `version` lifecycle script moves, and growth past a threshold against *those* passes only
// when the pending CHANGELOG section says so for that entry.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION_HEADING = /^## \[(?<version>[^\]]+)\]/;

function compareVersions(left, right) {
  const parse = (version) => version.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const [a, b] = [parse(left), parse(right)];

  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);

    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

/**
 * The CHANGELOG text not yet released: `## [Unreleased]` plus any section stamped with a version
 * above the one in `package.json` (a release section written ahead of the bump).
 */
export function pendingChangelog(text, releasedVersion) {
  const pending = [];
  let keep = false;

  for (const line of text.split('\n')) {
    const heading = VERSION_HEADING.exec(line);

    if (heading) {
      const { version } = heading.groups;

      keep = version === 'Unreleased' || compareVersions(version, releasedVersion) > 0;
      continue;
    }

    if (keep) {
      pending.push(line);
    }
  }

  return pending.join('\n');
}

/** List items and paragraphs, each joined into one line so a wrapped sentence is still one unit. */
function notes(text) {
  return text
    .split(/\n(?=\s*[-*] )|\n\s*\n/)
    .map((block) => block.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const SIZE_WORDS = /\b(?:size|sizes|min\+gzip|minzip|gzip|bytes?|kB|modules?|cold[- ]import|bundle)\b|\d\s?B\b/i;

const EVERY_ENTRY = /\b(?:every|all) entr(?:y|ies)\b/i;

/** How a CHANGELOG sentence names an entry: `/angular`, `vitest-auto-spy/angular`, or the root. */
function entryPattern(subpath) {
  if (subpath === '.') {
    return /\broot entry\b|\bthe root\b|`vitest-auto-spy`/i;
  }

  const name = subpath.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(`(?:^|[\\s\`'"(])(?:vitest-auto-spy)?${name}(?![\\w/-])`, 'i');
}

/** Whether the pending CHANGELOG has a note that talks about the size of `subpath`. */
export function hasSizeNote(pending, subpath) {
  const names = entryPattern(subpath);

  return notes(pending).some((note) => SIZE_WORDS.test(note) && (EVERY_ENTRY.test(note) || names.test(note)));
}

export function readPendingChangelog(repoRoot) {
  const { version } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

  return { version, pending: pendingChangelog(readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8'), version) };
}
