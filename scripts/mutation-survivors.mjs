#!/usr/bin/env node

/**
 * Lists the mutants the last `npm run test:mutation` left alive, one `file:line:column` per line —
 * a link in the WebStorm and VS Code consoles. Reads `reports/mutation/mutation.json`; runs nothing.
 *
 * Usage:
 *   node scripts/mutation-survivors.mjs                 # every survived and uncovered mutant
 *   node scripts/mutation-survivors.mjs args-map prop   # only files whose path contains one of these
 *   node scripts/mutation-survivors.mjs --github        # GitHub annotations and a job summary
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const REPORT = 'reports/mutation/mutation.json';
const SHOWN = new Set(['Survived', 'NoCoverage']);
const MAX_SNIPPET = 90;

function main() {
  const args = process.argv.slice(2);
  const github = args.includes('--github');
  const filters = args.filter((arg) => !arg.startsWith('--'));

  if (!existsSync(REPORT)) {
    process.stderr.write(`mutation-survivors: ${REPORT} not found — run \`npm run test:mutation\` first\n`);
    process.exit(2);
  }

  const report = JSON.parse(readFileSync(REPORT, 'utf8'));
  const files = Object.entries(report.files)
    .filter(([path]) => filters.length === 0 || filters.some((filter) => path.includes(filter)))
    .sort(([a], [b]) => a.localeCompare(b));

  const rows = files.flatMap(([path, file]) => {
    const lines = file.source.split('\n');

    return file.mutants
      .filter((mutant) => SHOWN.has(mutant.status))
      .sort((a, b) => a.location.start.line - b.location.start.line || a.location.start.column - b.location.start.column)
      .map((mutant) => ({ path, mutant, original: originalOf(lines, mutant.location) }));
  });

  for (const { path, mutant, original } of rows) {
    const { line, column } = mutant.location.start;
    const change = `${clip(original)} → ${clip(mutant.replacement ?? '')}`;
    const status = mutant.status === 'NoCoverage' ? ' (no coverage)' : '';

    process.stdout.write(`${path}:${line}:${column}  ${mutant.mutatorName}${status}  ${change}\n`);

    if (github) {
      const { line: endLine, column: endColumn } = mutant.location.end;
      const title = `${mutant.status} mutant: ${mutant.mutatorName}`;
      process.stdout.write(
        `::warning file=${path},line=${line},endLine=${endLine},col=${column},endColumn=${endColumn},title=${escape(title)}::${escape(change)}\n`,
      );
    }
  }

  const survived = rows.filter(({ mutant }) => mutant.status === 'Survived').length;
  process.stdout.write(`\n${survived} survived, ${rows.length - survived} without coverage, in ${files.length} file(s)\n`);

  if (github && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryOf(files));
  }
}

function originalOf(lines, { start, end }) {
  if (start.line === end.line) {
    return lines[start.line - 1].slice(start.column - 1, end.column - 1);
  }

  return `${lines[start.line - 1].slice(start.column - 1)} …`;
}

function clip(text) {
  const flat = text.replace(/\s+/g, ' ').trim();

  return flat.length > MAX_SNIPPET ? `${flat.slice(0, MAX_SNIPPET - 1)}…` : flat;
}

// Workflow commands end at a newline and treat `%` as an escape.
function escape(text) {
  return text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function summaryOf(files) {
  const table = files.map(([path, file]) => {
    const count = (status) => file.mutants.filter((mutant) => mutant.status === status).length;
    const detected = count('Killed') + count('Timeout');
    const valid = file.mutants.length - count('CompileError') - count('RuntimeError') - count('Ignored');
    const score = valid === 0 ? 'n/a' : `${((detected / valid) * 100).toFixed(2)} %`;

    return `| \`${path}\` | ${score} | ${count('Survived')} | ${count('NoCoverage')} |`;
  });

  return [
    '### Mutation testing — spy core',
    '',
    '| File | Score | Survived | No coverage |',
    '| --- | ---: | ---: | ---: |',
    ...table,
    '',
    'Every survivor is listed in the step log; the HTML report is in the `mutation-report` artifact.',
    '',
  ].join('\n');
}

main();
