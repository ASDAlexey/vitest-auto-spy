/**
 * The report is the product: a check that finds a defect nothing consumes is only useful if the
 * line it prints names the fix. These specs pin the ordering and the exit-code rule.
 */
import { describe, expect, it } from 'vitest';

import type { Finding } from './report';
import { formatFindings, hasFailures, sortFindings, summarize } from './report';

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
