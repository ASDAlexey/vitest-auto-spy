#!/usr/bin/env node
/**
 * Fail when an error string the skill description triggers on is no longer emitted.
 *
 * The quoted strings in the description are what an agent matches a failing test against. A message
 * reworded in `src/lib` leaves the old wording in the description, and nothing notices: the skill
 * simply stops firing for that failure. Every quoted trigger has to be a substring of a string or
 * template literal under `src/lib` (specs excluded), or be listed in `FOREIGN` with the place the
 * message actually comes from.
 *
 * Usage:
 *   node scripts/check-skill-triggers.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = 'skills/vitest-auto-spy/SKILL.md';

/** Messages the runtime, TypeScript or another library prints, not this package. */
const FOREIGN = new Map([
  ['is not a constructor', 'the JavaScript runtime'],
  ["Expected to be running in 'ProxyZone'", 'zone.js'],
  ['jasmine is not defined', 'the JavaScript runtime'],
  ['localStorage.setItem is not a function', 'Node 25 and later'],
  ['Spy<T> is not assignable', 'the TypeScript compiler'],
]);

function description(source) {
  const match = /^description:[^\S\n]*(.*)$/m.exec(source.startsWith('---\n') ? source.slice(4) : '');

  return match === null ? '' : match[1].trim();
}

function triggers(text) {
  return [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      yield* sourceFiles(path);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.d.ts')) {
      yield path;
    }
  }
}

function literals(path) {
  const found = [];
  const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, false);

  const visit = (node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      found.push(node.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(file);

  return found;
}

function main() {
  const wanted = triggers(description(readFileSync(join(root, SKILL), 'utf8')));
  const corpus = [...sourceFiles(join(root, 'src/lib'))].flatMap(literals);
  const missing = wanted.filter((trigger) => !FOREIGN.has(trigger) && !corpus.some((text) => text.includes(trigger)));
  const stale = [...FOREIGN.keys()].filter((trigger) => !wanted.includes(trigger));

  if (wanted.length === 0) {
    missing.push('(no quoted trigger found — the description lost its error strings)');
  }

  for (const trigger of missing) {
    console.error(`check-skill-triggers: "${trigger}" in ${SKILL} is not a literal anywhere under src/lib.`);
  }

  for (const trigger of stale) {
    console.error(`check-skill-triggers: FOREIGN lists "${trigger}", which the description no longer quotes.`);
  }

  if (missing.length > 0 || stale.length > 0) {
    process.exit(1);
  }

  console.log(
    `check-skill-triggers: all ${wanted.length} triggers in ${relative(root, join(root, SKILL))} are emitted (${FOREIGN.size} by the runtime or a dependency).`,
  );
}

main();
