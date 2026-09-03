#!/usr/bin/env node

/**
 * Build the body of a GitHub Release for one version.
 *
 * The text comes from CHANGELOG.md — the section written by hand is the one worth reading, and
 * `gh release --generate-notes` cannot produce it: this repository pushes straight to master, so
 * the auto-generated notes are an empty "Full Changelog" line and nothing else.
 *
 * When a version has no section (a release cut before the changelog caught up), the notes are
 * derived from the Conventional Commits between the previous tag and this one instead, so a
 * release is never left blank.
 *
 * Usage:
 *   node scripts/release-notes.mjs v3.0.0            # print to stdout
 *   node scripts/release-notes.mjs 3.0.0 --out notes.md
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const REPO = PKG.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
const DOCS = 'https://asdalexey.github.io/vitest-auto-spy/';

/** Conventional-commit type -> release-notes heading, in the order they should appear. */
const COMMIT_GROUPS = [
  ['⚠️ Breaking changes', (c) => c.breaking],
  ['Features', (c) => c.type === 'feat'],
  ['Fixes', (c) => c.type === 'fix'],
  ['Performance', (c) => c.type === 'perf'],
  ['Build & packaging', (c) => c.type === 'build' || c.type === 'refactor'],
  ['Documentation', (c) => c.type === 'docs'],
];

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/** All `v*` tags, oldest first, so a version can find the one released before it. */
function tagsInOrder() {
  return git('tag', '--list', 'v*', '--sort=v:refname').split('\n').filter(Boolean);
}

function previousTag(tag) {
  const tags = tagsInOrder();
  const index = tags.indexOf(tag);

  if (index > 0) {
    return tags[index - 1];
  }

  // Unknown tag (the release is being cut right now and nothing is pushed yet): fall back to the
  // newest tag that sorts below it.
  const below = tags.filter((candidate) => compareVersions(candidate, tag) < 0);

  return below.at(-1) ?? '';
}

function compareVersions(a, b) {
  const parse = (value) => value.replace(/^v/, '').split('.').map(Number);
  const [aParts, bParts] = [parse(a), parse(b)];

  for (let i = 0; i < 3; i += 1) {
    if ((aParts[i] ?? 0) !== (bParts[i] ?? 0)) {
      return (aParts[i] ?? 0) - (bParts[i] ?? 0);
    }
  }

  return 0;
}

/** The `## [x.y.z]` block of CHANGELOG.md, without its own heading. */
function changelogSection(version) {
  const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));

  if (start === -1) {
    return '';
  }

  const rest = lines.slice(start + 1);
  // The section ends at the next version — or, for the oldest one, at the block of link
  // definitions that closes the file.
  const end = rest.findIndex((line) => line.startsWith('## ') || /^\[[^\]]+\]: https?:/.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();

  // `### Added` inside a release page reads one level too deep — the version is the page title.
  return body.replace(/^### /gm, '## ');
}

function parseCommit(subject) {
  const match = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?: (?<summary>.+)$/.exec(subject);

  if (!match) {
    return null;
  }

  const { type, scope, bang, summary } = match.groups;

  return { type, scope, breaking: Boolean(bang), summary };
}

/** Release notes assembled from the commits in `previous..tag`, for a version the changelog misses. */
function notesFromCommits(tag) {
  const previous = previousTag(tag);
  const range = previous ? `${previous}..${tag}` : tag;
  const lines = git('log', range, '--format=%h %s').split('\n').filter(Boolean);
  const commits = [];

  for (const line of lines) {
    const space = line.indexOf(' ');
    const commit = parseCommit(line.slice(space + 1));

    if (!commit) {
      continue;
    }

    // `chore` is the machinery of releasing (the version bump, the badge sync), and a note about
    // the changelog or the TODO list is not a change to the package.
    if (commit.type === 'chore' || (commit.type === 'docs' && /^(changelog|todo)$/.test(commit.scope ?? ''))) {
      continue;
    }

    // A follow-up commit that repeats the message is one line carrying both hashes, not two
    // identical lines.
    const earlier = commits.find(
      (candidate) =>
        candidate.breaking === commit.breaking &&
        candidate.type === commit.type &&
        candidate.scope === commit.scope &&
        candidate.summary === commit.summary,
    );

    if (earlier) {
      earlier.hashes.push(line.slice(0, space));
    } else {
      commits.push({ ...commit, hashes: [line.slice(0, space)] });
    }
  }

  const sections = [];

  for (const [heading, matches] of COMMIT_GROUPS) {
    const group = commits.filter(matches);

    if (group.length === 0) {
      continue;
    }

    const items = group.map((commit) => {
      const hashes = commit.hashes.map((hash) => `[${hash}](${REPO}/commit/${hash})`).join(', ');

      return `- ${commit.scope ? `**${commit.scope}:** ` : ''}${commit.summary} (${hashes})`;
    });
    sections.push(`## ${heading}\n\n${items.join('\n')}`);
  }

  return sections.join('\n\n');
}

function fileExistsAtTag(tag, path) {
  try {
    execFileSync('git', ['cat-file', '-e', `${tag}:${path}`], { cwd: ROOT, stdio: 'ignore' });

    return true;
  } catch {
    return false;
  }
}

function build(version) {
  const tag = `v${version}`;
  const previous = previousTag(tag);
  const body = changelogSection(version) || notesFromCommits(tag);
  // Driven by what the notes actually say, not by the version number — 1.0.0 is a major with
  // nothing to break.
  const hasBreaking = /^## (⚠️ Breaking changes|BREAKING CHANGES)/m.test(body);

  const parts = [];

  parts.push(`### \`npm i -D vitest-auto-spy@${version}\``);

  if (hasBreaking) {
    parts.push(
      `> [!IMPORTANT]\n> This is a major release and it changes behaviour you may depend on. Read the breaking changes below before upgrading — the [migration notes](${REPO}/blob/${tag}/CHANGELOG.md) spell out what to do for each one.`,
    );
  }

  parts.push(body || '_No user-facing changes._');

  parts.push('---');

  const compare = previous
    ? `[\`${previous}...${tag}\`](${REPO}/compare/${previous}...${tag})`
    : `[\`${tag}\`](${REPO}/releases/tag/${tag})`;

  const links = [`📖 [Documentation](${DOCS})`, `📦 [npm](https://www.npmjs.com/package/vitest-auto-spy/v/${version})`];

  if (fileExistsAtTag(tag, 'CHANGELOG.md')) {
    links.push(`📝 [CHANGELOG](${REPO}/blob/${tag}/CHANGELOG.md)`);
  }

  // AGENTS.md only exists from 1.13.0 on; linking it from an older release would 404.
  if (fileExistsAtTag(tag, 'AGENTS.md')) {
    links.push(`🤖 [AGENTS.md](${REPO}/blob/${tag}/AGENTS.md)`);
  }

  parts.push([links.join(' · '), '', `**Full changelog:** ${compare}`].join('\n'));

  return `${parts.join('\n\n')}\n`;
}

function main(argv) {
  const args = argv.slice(2);
  const outIndex = args.indexOf('--out');
  const out = outIndex === -1 ? '' : args[outIndex + 1];
  const target = args.find((arg) => !arg.startsWith('--') && arg !== out);
  const version = (target ?? PKG.version).replace(/^v/, '');

  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`Not a version: ${version}\nUsage: node scripts/release-notes.mjs <version> [--out FILE]`);
    process.exit(1);
  }

  const notes = build(version);

  if (out) {
    writeFileSync(out, notes);
    console.error(`Wrote release notes for v${version} to ${out}`);

    return;
  }

  process.stdout.write(notes);
}

main(process.argv);
