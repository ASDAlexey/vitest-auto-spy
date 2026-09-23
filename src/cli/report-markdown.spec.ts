import { describe, expect, it } from 'vitest';

import type { DoctorDocument } from './doctor';
import type { PerfDocument } from './perf-report';
import { doctorMarkdown, markdownCell, markdownTable, perfMarkdown } from './report-markdown';

const tally = { errors: 0, warnings: 0, notes: 0 };

const perf = (over: Partial<PerfDocument>): PerfDocument => ({
  schema: 1,
  command: 'perf',
  version: '0.0.0',
  cwd: '/r',
  exitCode: 0,
  run: null,
  budgets: { maxTestMs: 1_000, maxFileMs: 5_000, maxFileTests: 2_000, factor: 10, maxWallMs: null, only: [] },
  gate: null,
  tally,
  findings: [],
  ...over,
});

describe('markdownCell', () => {
  it('keeps a cell on one line and inside its column', () => {
    expect(markdownCell('a | b\nc\r\nd \\ e')).toBe('a \\| b<br>c<br>d \\\\ e');
    expect(markdownCell(3)).toBe('3');
  });

  it('draws the header, the rule and one line per row', () => {
    expect(markdownTable(['A', 'B'], [[1, 'x|y']])).toBe('| A | B |\n| --- | --- |\n| 1 | x\\|y |');
  });
});

describe('doctorMarkdown', () => {
  it('says there is nothing rather than drawing an empty table', () => {
    const document: DoctorDocument = {
      schema: 1,
      command: 'doctor',
      version: '0.0.0',
      cwd: '/r',
      runner: 'vitest',
      entry: 'vitest-auto-spy',
      scanned: { files: 3, specFiles: 1, truncated: false },
      exitCode: 0,
      tally,
      findings: [],
    };

    expect(doctorMarkdown(document)).toContain('No findings.');
  });
});

describe('perfMarkdown', () => {
  it('quotes the error of a run it could not read', () => {
    expect(perfMarkdown(perf({ error: 'Not a perf report\nat x.json', exitCode: 2 }))).toContain('> Not a perf report\n> at x.json');
  });

  it('marks a red run, leaves out an empty slowest-files table and prints a finding without a file', () => {
    const out = perfMarkdown(
      perf({
        run: {
          files: 1,
          tests: 1,
          failed: true,
          wallMs: 10,
          cpuMs: 10,
          medianTestMs: 1,
          medianFileMs: 1,
          phases: [{ name: 'tests', ms: 10, share: 1 }],
          slowestFiles: [],
        },
        findings: [{ check: 'perf-wall', severity: 'error', message: 'slow', fix: 'faster' }],
      }),
    );

    expect(out).toContain('**the suite did not pass**');
    expect(out).toContain('| tests | 10ms | 100.0% |');
    expect(out).not.toContain('Slowest files');
    expect(out).toContain('| error | `perf-wall` |  | slow | faster |');
  });

  it('says a gate with no candidates found nothing, and prints the second reading when there was one', () => {
    const gate = (verdicts: NonNullable<PerfDocument['gate']>['verdicts']): string =>
      perfMarkdown(perf({ gate: { status: 'judged', confirmation: 'remeasure', verdicts } }));

    expect(gate([])).toContain('Nothing over budget.');
    expect(
      gate([
        { check: 'perf-gate-slow-test', file: 'a.spec.ts', name: 'a > b', ms: 2_000, budget: 1_000, again: 1_900, outcome: 'confirmed' },
      ]),
    ).toContain('| confirmed | `perf-gate-slow-test` | a.spec.ts › a > b | 2.00s | 1.00s | 1.90s |');
  });
});
