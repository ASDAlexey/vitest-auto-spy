#!/usr/bin/env node
// Keeps the part of README.md that npmjs.com shows a whole document.
//
// Why this exists: the registry stores a README only up to its first 65 536 characters, and the
// package page renders exactly that. This README is several hundred kB, so npm's copy used to stop
// mid-sentence inside "How to mock", and nothing noticed when an edit above the cut moved it.
//
// The README carries a `<!-- npm-readme-cut` comment right after the section that closes the npm
// part. The cut has to fall inside that comment: npm renders everything above it and treats the
// unclosed comment as the rest of the file, so the page ends on a clean boundary. The dots in the
// comment are filler that holds the comment open across the cut; `--write` resizes them.
//
// The check fails when the cut lands outside the comment, when a code fence above it is left open,
// or when a section the npm page must carry has moved below it.
//
// Usage:
//   node scripts/check-readme-npm-cut.mjs          # exit 1 when npm's copy would end mid-document
//   node scripts/check-readme-npm-cut.mjs --write  # resize the filler around the current cut
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const README = join(fileURLToPath(new URL('..', import.meta.url)), 'README.md');
const LIMIT = 65_536;
// Room the cut keeps inside the comment when the text above it shrinks, in characters.
const SHRINK_ROOM = 2_000;
const FILLER_WIDTH = 100;
const OPEN = '<!-- npm-readme-cut';
const CLOSE = '-->';
const REQUIRED = ['Install', 'Availability', 'Quick start', 'How to mock', 'Everything else'];

const write = argv.includes('--write');
const unknown = argv.slice(2).filter((arg) => arg !== '--write');

if (unknown.length > 0) {
  stderr.write(`check-readme-npm-cut: unknown option ${unknown.join(', ')} (known: --write)\n`);
  exit(2);
}

function fail(problems) {
  stderr.write(`${problems.map((problem) => `check-readme-npm-cut: ${problem}`).join('\n')}\n`);
  exit(1);
}

/** Where the cut falls, in UTF-16 units, under both ways of counting a character; the registry counts code points. */
function cutPositions(text) {
  const byCodePoint = [...text].slice(0, LIMIT).join('').length;

  return [Math.min(LIMIT, text.length), Math.min(byCodePoint, text.length)];
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function openFence(text) {
  let fence;
  let line = 0;

  for (const [index, row] of text.split('\n').entries()) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(row)?.[1];

    if (marker === undefined) {
      continue;
    }

    if (fence === undefined) {
      fence = marker;
      line = index + 1;
    } else if (marker[0] === fence[0] && marker.length >= fence.length && row.trim() === marker) {
      fence = undefined;
    }
  }

  return fence === undefined ? undefined : line;
}

const text = readFileSync(README, 'utf8');
const start = text.indexOf(`\n${OPEN}`) + 1;

if (start === 0) {
  fail([`README.md has no \`${OPEN}\` comment after the part npm shows — add one after its last section.`]);
}

const end = text.indexOf(CLOSE, start) + CLOSE.length;

if (end < CLOSE.length) {
  fail([`the \`${OPEN}\` comment is never closed.`]);
}

const shown = text.slice(0, start);
const problems = [];

if (shown.length >= LIMIT) {
  problems.push(
    `the part npm shows is ${shown.length} characters, over the ${LIMIT} it keeps — move a section below the \`${OPEN}\` comment.`,
  );
}

const fenceLine = openFence(shown);

if (fenceLine !== undefined) {
  problems.push(`README.md:${fenceLine} opens a code fence that is still open where the npm part ends.`);
}

const headings = new Set([...shown.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim()));

for (const heading of REQUIRED.filter((name) => !headings.has(name))) {
  problems.push(`"## ${heading}" is not above the \`${OPEN}\` comment, so npmjs.com does not show it.`);
}

if (problems.length > 0) {
  fail(problems);
}

if (write) {
  const head = text
    .slice(start, end)
    .split('\n')
    .filter((row) => !/^\.+$/.test(row) && row !== CLOSE);
  const bare = `${head.join('\n')}\n`;
  const fill = Math.max(0, LIMIT + SHRINK_ROOM - (start + bare.length + CLOSE.length));
  const rows = Array.from({ length: Math.ceil(fill / (FILLER_WIDTH + 1)) }, () => '.'.repeat(FILLER_WIDTH));
  const comment = `${bare}${rows.map((row) => `${row}\n`).join('')}${CLOSE}`;
  const next = text.slice(0, start) + comment + text.slice(end);

  if (next !== text) {
    writeFileSync(README, next);
    stdout.write(`check-readme-npm-cut: filler resized to ${rows.length} lines\n`);
  }

  exit(0);
}

const outside = cutPositions(text).filter((cut) => cut <= start || cut >= end - CLOSE.length);

if (outside.length > 0) {
  const cut = outside[0];

  fail([
    cut <= start
      ? `npm cuts README.md at line ${lineOf(text, cut)}, above the \`${OPEN}\` comment — move a section below it.`
      : `npm cuts README.md at line ${lineOf(text, cut)}, past the \`${OPEN}\` comment, so its page ends mid-document — run \`node scripts/check-readme-npm-cut.mjs --write\`.`,
  ]);
}
