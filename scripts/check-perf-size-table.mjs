#!/usr/bin/env node
// Holds the "Bundle size" table of docs-site/core/performance.md (and its Russian twin) to
// size-entries.json, the baseline `size:entries:check` already guards.
//
// Why this exists: the table is prose the gate never read, so it drifted a release at a time while
// size-entries.json stayed honest — `/angular/matchers` read 1.8 kB against a baseline of 2.9 kB.
//
// Every row names its entries in backticks (`.`, `vitest-auto-spy/angular`, `/vue`); its figure is
// the baseline in kB (1000 bytes, as the badge counts) to one decimal, a range when the named
// entries round apart. The sentence that quotes the badge is held to the root entry the same way.
//
// Usage:
//   node scripts/check-perf-size-table.mjs          # exit 1 when a figure differs from the baseline
//   node scripts/check-perf-size-table.mjs --write  # rewrite the figures from size-entries.json
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { argv, exit, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const PACKAGE = 'vitest-auto-spy';

const PAGES = [
  {
    file: join(repoRoot, 'docs-site/core/performance.md'),
    heading: '## Bundle size',
    unit: 'kB',
    decimal: '.',
    badge: /(The badge says )([\d.,]+ kB)/,
  },
  {
    file: join(repoRoot, 'docs-site/ru/core/performance.md'),
    heading: '## Размер бандла',
    unit: 'кБ',
    decimal: ',',
    badge: /(Бейдж говорит )([\d.,]+ кБ)/,
  },
];

const write = argv.includes('--write');
const unknown = argv.slice(2).filter((arg) => arg !== '--write');

if (unknown.length > 0) {
  stderr.write(`check-perf-size-table: unknown option ${unknown.join(', ')} (known: --write)\n`);
  exit(2);
}

const entries = JSON.parse(readFileSync(join(repoRoot, 'size-entries.json'), 'utf8')).entries;

function entryName(token) {
  if (token === '.' || token === PACKAGE) {
    return '.';
  }

  if (token.startsWith(`${PACKAGE}/`)) {
    return `./${token.slice(PACKAGE.length + 1)}`;
  }

  return token.startsWith('/') ? `.${token}` : undefined;
}

function figure(names, page) {
  const values = [...new Set(names.map((name) => (entries[name] / 1000).toFixed(1)))].sort((a, b) => a - b);
  const text = values.length === 1 ? values[0] : `${values[0]}–${values.at(-1)}`;

  return `${text.replaceAll('.', page.decimal)} ${page.unit}`;
}

function cells(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());
}

function renderTable(rows, alignRow) {
  const widths = rows[0].map((_, column) => Math.max(3, ...rows.map((row) => [...row[column]].length)));
  const pad = (text, column) => {
    const gap = ' '.repeat(widths[column] - [...text].length);

    return alignRow[column].endsWith(':') ? gap + text : text + gap;
  };
  const line = (row) => `| ${row.map(pad).join(' | ')} |`;
  const separator = `| ${alignRow.map((align, column) => (align.endsWith(':') ? `${'-'.repeat(widths[column] - 1)}:` : '-'.repeat(widths[column]))).join(' | ')} |`;

  return [line(rows[0]), separator, ...rows.slice(1).map(line)];
}

function processPage(page) {
  const path = relative(repoRoot, page.file);
  const lines = readFileSync(page.file, 'utf8').split('\n');
  const problems = [];
  const structural = [];
  const start = lines.findIndex((line) => line.startsWith(page.heading));

  if (start === -1) {
    return { problems: [`${path}: no \`${page.heading}\` heading`] };
  }

  const tableStart = lines.findIndex((line, index) => index > start && line.startsWith('|'));
  let tableEnd = tableStart;

  while (tableEnd < lines.length && lines[tableEnd].startsWith('|')) {
    tableEnd += 1;
  }

  if (tableStart === -1 || tableEnd - tableStart < 3) {
    return { problems: [`${path}: no table under \`${page.heading}\``] };
  }

  const header = cells(lines[tableStart]);
  const align = cells(lines[tableStart + 1]);
  const body = lines.slice(tableStart + 2, tableEnd).map(cells);
  const rows = body.map(([label, value], index) => {
    const names = [...label.matchAll(/`([^`]+)`/g)].map((match) => entryName(match[1]));
    const lineNumber = tableStart + 3 + index;

    if (names.length === 0 || names.some((name) => name === undefined || entries[name] === undefined)) {
      structural.push(`${path}:${lineNumber}: every entry a row names must be in size-entries.json — ${label}`);

      return [label, value];
    }

    const bold = value.startsWith('**');
    const expected = figure(names, page);
    const rendered = bold ? `**${expected}**` : expected;

    if (rendered !== value) {
      problems.push(`${path}:${lineNumber}: ${label} says ${value}, size-entries.json says ${rendered}`);
    }

    return [label, rendered];
  });

  for (const [index, line] of lines.entries()) {
    const match = page.badge.exec(line);

    if (match) {
      const expected = figure(['.'], page);

      if (match[2] !== expected) {
        problems.push(`${path}:${index + 1}: the badge sentence says ${match[2]}, size-entries.json says ${expected}`);
        lines[index] = line.replace(page.badge, `$1${expected}`);
      }
    }
  }

  lines.splice(tableStart, tableEnd - tableStart, ...renderTable([header, ...rows], align));

  return { problems, structural, text: lines.join('\n') };
}

let failed = false;

for (const page of PAGES) {
  const { problems, structural, text } = processPage(page);
  const path = relative(repoRoot, page.file);

  if (write && structural.length === 0) {
    if (text !== readFileSync(page.file, 'utf8')) {
      writeFileSync(page.file, text);
      stdout.write(`check-perf-size-table: rewrote ${path}\n`);
    }

    continue;
  }

  if (problems.length + structural.length > 0) {
    failed = true;
    stderr.write(`${[...structural, ...problems].join('\n')}\n`);
  }
}

if (failed) {
  stderr.write('check-perf-size-table: run `node scripts/check-perf-size-table.mjs --write` to take the figures from size-entries.json\n');
  exit(1);
}
