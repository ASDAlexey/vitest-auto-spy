/**
 * The report is the product: a check that finds a defect nothing consumes is only useful if the
 * line it prints names the fix. These specs pin the ordering and the exit-code rule.
 */
import { describe, expect, it } from 'vitest';

import { TERMINAL } from './paint';
import type { Finding } from './report';
import { findingJson, formatFindings, groupFindings, hasFailures, sortFindings, summarize, tallyOf } from './report';

const finding = (over: Partial<Finding>): Finding => ({
  check: 'check',
  severity: 'error',
  message: 'message',
  fix: 'fix',
  ...over,
});

describe('sortFindings', () => {
  it('puts errors first, then warnings, then notes', () => {
    const sorted = sortFindings([
      finding({ severity: 'info', check: 'c' }),
      finding({ severity: 'warning', check: 'b' }),
      finding({ severity: 'error', check: 'a' }),
    ]);

    expect(sorted.map((entry) => entry.check)).toEqual(['a', 'b', 'c']);
  });

  it('breaks a tie by check id and then by file', () => {
    const sorted = sortFindings([
      finding({ check: 'b', file: 'a.ts' }),
      finding({ check: 'a', file: 'z.ts' }),
      finding({ check: 'a', file: 'a.ts' }),
      finding({ check: 'a' }),
    ]);

    expect(sorted.map((entry) => entry.file)).toEqual([undefined, 'a.ts', 'z.ts', 'a.ts']);
  });

  it('keeps two findings that differ in nothing at all', () => {
    expect(sortFindings([finding({ check: 'a' }), finding({ check: 'a' })])).toHaveLength(2);
  });
});

describe('formatFindings', () => {
  it('is empty for an empty list', () => {
    expect(formatFindings([])).toBe('');
  });

  it('prints the file when there is one and the fix on its own line', () => {
    const text = formatFindings([finding({ check: 'glob', file: 'tsconfig.json' })]);

    expect(text).toContain('error  glob tsconfig.json');
    expect(text).toContain('→ fix');
  });

  it('omits the file when the finding is about the repository', () => {
    expect(formatFindings([finding({ severity: 'info' })])).toContain('info   check\n');
  });

  it('prints only what is at or above the threshold it was given', () => {
    const findings = [
      finding({ severity: 'info', check: 'note' }),
      finding({ severity: 'warning', check: 'warn' }),
      finding({ check: 'boom' }),
    ];

    expect(formatFindings(findings, 'warning')).toContain('warn   warn');
    expect(formatFindings(findings, 'warning')).toContain('error  boom');
    expect(formatFindings(findings, 'warning')).not.toContain('note');
    expect(formatFindings(findings, 'error')).not.toContain('warn   warn');
    expect(formatFindings(findings)).toContain('note');
  });

  it('is empty when the threshold hid everything, so the caller can print the tally alone', () => {
    expect(formatFindings([finding({ severity: 'info' })], 'warning')).toBe('');
  });
});

describe('hasFailures', () => {
  it('ignores notes and reacts to anything above them', () => {
    expect(hasFailures([finding({ severity: 'info' })])).toBe(false);
    expect(hasFailures([finding({ severity: 'warning' })])).toBe(true);
    expect(hasFailures([])).toBe(false);
  });
});

describe('summarize', () => {
  it('pluralises each count', () => {
    expect(summarize([finding({}), finding({ severity: 'warning' })])).toBe('1 error, 1 warning, 0 notes');
  });
});

describe('grouping', () => {
  const place = (file: string, message = 'same'): Finding => finding({ severity: 'info', check: 'glob', file, message });

  it('prints one cause once, with every file it was found in under it', () => {
    expect(formatFindings([place('b.json'), place('a.json')], 'info', 80)).toBe(
      ['info   glob — 2 files', '       same', '         a.json', '         b.json', '       → fix'].join('\n'),
    );
  });

  it('keeps each file its own message when the messages differ', () => {
    expect(formatFindings([place('a.ts', 'first'), place('b.ts', 'second')], 'info', 80)).toBe(
      ['info   glob — 2 files', '         a.ts', '           first', '         b.ts', '           second', '       → fix'].join('\n'),
    );
  });

  it('counts places rather than files when one file holds several of them', () => {
    expect(formatFindings([place('a.ts', 'x'), place('a.ts', 'y')], 'info', 80)).toContain('info   glob — 2 places in 1 file');
    expect(formatFindings([place('a.ts', 'x'), place('a.ts', 'y'), place('b.ts')], 'info', 80)).toContain('glob — 3 places in 2 files');
  });

  it('never folds a finding with evidence, one about no file, or one with another fix', () => {
    const groups = groupFindings([
      place('a.ts'),
      place('b.ts'),
      finding({ severity: 'info', check: 'glob', file: 'c.ts', details: ['x'] }),
      finding({ severity: 'info', check: 'glob' }),
      finding({ severity: 'info', check: 'glob', file: 'd.ts', fix: 'other' }),
    ]);

    expect(groups.map((group) => group.members.length)).toEqual([1, 2, 1, 1]);
  });

  it('wraps prose under the label, and keeps every continuation line indented', () => {
    const text = formatFindings([finding({ message: 'word '.repeat(30).trim(), fix: 'fix '.repeat(30).trim() })], 'info', 40);
    const lines = text.split('\n');

    expect(lines.every((line) => line.length <= 40)).toBe(true);
    expect(lines.slice(1).every((line) => line.startsWith(' '))).toBe(true);
    expect(text).toContain('       → fix fix');
  });
});

describe('summarize', () => {
  it('counts every severity, and says how many the threshold kept off the screen', () => {
    const findings = [finding({}), finding({ severity: 'warning' }), finding({ severity: 'info' }), finding({ severity: 'info' })];

    expect(summarize(findings)).toBe('1 error, 1 warning, 2 notes');
    expect(summarize(findings, 'warning')).toBe('1 error, 1 warning, 2 notes (2 not shown: --min-severity warning)');
    expect(summarize([])).toBe('0 errors, 0 warnings, 0 notes');
    expect(tallyOf(findings)).toEqual({ errors: 1, warnings: 1, notes: 2 });
  });
});

describe('findingJson', () => {
  it('strips terminal color out of the evidence and leaves a finding without any as it was', () => {
    const plain = finding({});

    expect(findingJson(plain)).toBe(plain);
    expect(findingJson(finding({ details: [TERMINAL.red('x')] })).details).toEqual(['x']);
  });
});
