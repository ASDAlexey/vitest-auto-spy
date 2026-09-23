/**
 * `--format markdown`: the JSON documents rendered as GitHub/GitLab-flavoured tables, for a merge
 * request note or a job summary. It reads the same document `--format json` prints, so the two
 * cannot disagree about a run.
 */
import type { DoctorDocument } from './doctor';
import { formatMs } from './perf-data';
import type { PerfDocument } from './perf-report';
import type { Finding, Tally } from './report';

export function markdownCell(value: number | string): string {
  return String(value).replaceAll('\\', '\\\\').replaceAll('|', '\\|').replace(/\r?\n/g, '<br>');
}

export function markdownTable(headers: readonly string[], rows: readonly (readonly (number | string)[])[]): string {
  const line = (cells: readonly (number | string)[]): string => `| ${cells.map(markdownCell).join(' | ')} |`;

  return [line(headers), `|${headers.map(() => ' --- ').join('|')}|`, ...rows.map(line)].join('\n');
}

function tallyLine(tally: Tally): string {
  return `**${tally.errors} errors, ${tally.warnings} warnings, ${tally.notes} notes**`;
}

function findingsSection(findings: readonly Finding[]): string {
  if (findings.length === 0) {
    return 'No findings.';
  }

  return markdownTable(
    ['Severity', 'Check', 'File', 'Message', 'Fix'],
    findings.map((finding) => [finding.severity, `\`${finding.check}\``, finding.file ?? '', finding.message, finding.fix]),
  );
}

export function doctorMarkdown(document: DoctorDocument): string {
  return [
    '### vitest-auto-spy doctor',
    `${document.scanned.files} files scanned, ${document.scanned.specFiles} of them spec files — runner: ${document.runner}, entry: \`${document.entry}\``,
    findingsSection(document.findings),
    tallyLine(document.tally),
  ].join('\n\n');
}

function runSection(run: NonNullable<PerfDocument['run']>): string[] {
  const summary = `${run.files} test files, ${run.tests} tests, ${formatMs(run.wallMs)} wall clock, ${formatMs(run.cpuMs)} of CPU time${run.failed ? ' — **the suite did not pass**' : ''}`;
  const phases = markdownTable(
    ['Phase', 'Time', 'Share'],
    run.phases.map((phase) => [phase.name, formatMs(phase.ms), `${(phase.share * 100).toFixed(1)}%`]),
  );
  const slowest =
    run.slowestFiles.length === 0
      ? []
      : [
          '#### Slowest files',
          markdownTable(
            ['File', 'Total', 'Tests', 'Environment', 'Setup', 'Import', 'Bodies'],
            run.slowestFiles.map((file) => [
              file.file,
              formatMs(file.totalMs),
              file.tests,
              formatMs(file.phases.environment),
              formatMs(file.phases.setup),
              formatMs(file.phases.import),
              formatMs(file.phases.tests),
            ]),
          ),
        ];

  return [summary, phases, ...slowest];
}

function gateSection(gate: NonNullable<PerfDocument['gate']>): string[] {
  const rows = gate.verdicts.map((row) => [
    row.outcome,
    `\`${row.check}\``,
    [row.file, row.name].filter((part) => part !== undefined).join(' › '),
    formatMs(row.ms),
    formatMs(row.budget),
    row.again === undefined ? '' : formatMs(row.again),
  ]);

  return [
    `#### Gate: ${gate.status}`,
    rows.length === 0 ? 'Nothing over budget.' : markdownTable(['Outcome', 'Check', 'Where', 'Measured', 'Budget', 'Again'], rows),
  ];
}

export function perfMarkdown(document: PerfDocument): string {
  return [
    '### vitest-auto-spy perf',
    ...(document.error === undefined ? [] : [`> ${document.error.replace(/\n/g, '\n> ')}`]),
    ...(document.run === null ? [] : runSection(document.run)),
    ...(document.gate === null ? [] : gateSection(document.gate)),
    findingsSection(document.findings),
    tallyLine(document.tally),
  ].join('\n\n');
}
