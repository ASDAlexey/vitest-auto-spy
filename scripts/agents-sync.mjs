#!/usr/bin/env node
/**
 * Formats `AGENTS.md` and `agent-docs/*.md`, strips the column padding prettier adds to tables (a
 * third of the bytes an agent reads), and regenerates the section outlines in the `AGENTS.md` stubs.
 *
 * Usage:
 *   node scripts/agents-sync.mjs          # rewrite the files
 *   node scripts/agents-sync.mjs --check  # fail if any of them is out of date or a link is broken
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = 'AGENTS.md';
const TOPICS_DIR = 'agent-docs';
const OUTLINE = /(<!-- agents-outline: (\S+) -->\n)[\s\S]*?(<!-- \/agents-outline -->)/g;

// GFM splits a row on every unescaped pipe before it parses code spans, so this does the same.
function splitCells(row) {
  return row.split(/(?<!\\)\|/);
}

function visible(text) {
  return text.replace(/-+/g, '-').replace(/\s+/g, '');
}

function compactRow(line) {
  const indent = /^\s*/.exec(line)[0];
  const cells = splitCells(line.trim())
    .slice(1, -1)
    .map((cell) => cell.trim());
  const isDelimiter = cells.every((cell) => /^:?-+:?$/.test(cell));
  const out = `${indent}| ${(isDelimiter ? cells.map((cell) => cell.replace(/-+/, '---')) : cells).join(' | ')} |`;

  if (visible(out) !== visible(line)) {
    throw new Error(`Compacting would change the content of this row:\n${line}`);
  }

  return out;
}

export function compactTables(markdown) {
  let fence;

  return markdown
    .split('\n')
    .map((line) => {
      const opener = /^\s*(`{3,}|~{3,})/.exec(line);

      if (opener !== null) {
        if (fence === undefined) {
          fence = opener[1];
        } else if (opener[1].startsWith(fence)) {
          fence = undefined;
        }

        return line;
      }

      return fence === undefined && /^\s*\|.*\|\s*$/.test(line) ? compactRow(line) : line;
    })
    .join('\n');
}

function headings(markdown, level) {
  const prefix = `${'#'.repeat(level)} `;
  let fence = false;

  return markdown.split('\n').filter((line) => {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      fence = !fence;
    }

    return !fence && line.startsWith(prefix);
  });
}

function withOutlines(index, topics, problems) {
  const linked = new Set();
  const result = index.replace(OUTLINE, (_match, open, path, close) => {
    linked.add(path);

    if (!topics.has(path)) {
      problems.push(`${INDEX} links ${path}, which does not exist.`);

      return `${open}${close}`;
    }

    const section = headings(topics.get(path), 2);

    if (section.length !== 1 || !index.includes(`\n${section[0]}\n`)) {
      problems.push(`${path} must hold exactly one "## N. Title" heading, repeated as its stub in ${INDEX}.`);
    }

    const items = headings(topics.get(path), 3).map((line) => `- ${line.slice(4)}`);

    return items.length === 0 ? `${open}${close}` : `${open}\n${items.join('\n')}\n\n${close}`;
  });

  for (const path of topics.keys()) {
    if (!linked.has(path)) {
      problems.push(`${path} has no "<!-- agents-outline: ${path} -->" stub in ${INDEX}.`);
    }
  }

  return result;
}

async function formatted(path, source) {
  const filepath = join(ROOT, path);

  return compactTables(await format(source, { ...(await resolveConfig(filepath)), filepath }));
}

async function main() {
  const check = process.argv.includes('--check');
  const problems = [];
  const topicNames = existsSync(join(ROOT, TOPICS_DIR)) ? readdirSync(join(ROOT, TOPICS_DIR)).filter((name) => name.endsWith('.md')) : [];
  const sources = new Map(
    [INDEX, ...topicNames.map((name) => `${TOPICS_DIR}/${name}`)].map((path) => [path, readFileSync(join(ROOT, path), 'utf8')]),
  );
  const expected = new Map();

  for (const [path, source] of sources) {
    if (path !== INDEX) {
      expected.set(path, await formatted(path, source));
    }
  }

  const topics = new Map([...expected].map(([path, text]) => [path, text]));

  expected.set(INDEX, await formatted(INDEX, withOutlines(sources.get(INDEX), topics, problems)));

  const stale = [...expected].filter(([path, text]) => sources.get(path) !== text).map(([path]) => path);

  if (!check) {
    for (const path of stale) {
      writeFileSync(join(ROOT, path), expected.get(path));
    }

    console.log(stale.length === 0 ? 'Agent docs are up to date.' : `Rewrote ${stale.join(', ')}.`);
  } else if (stale.length > 0) {
    problems.push(`Not formatted, compacted or outlined: ${stale.join(', ')}. Run \`npm run agents:sync\`.`);
  }

  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }

  if (check) {
    console.log('Agent docs are formatted, compact and linked.');
  }
}

await main();
