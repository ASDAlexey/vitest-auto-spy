import { describe, expect, it } from 'vitest';

import { MONOCHROME, TERMINAL } from './paint';
import type { GateRow } from './perf-gate';
import { formatVerdict, shortName } from './perf-verdict';

const rows: GateRow[] = [
  {
    check: 'perf-gate-slow-test',
    file: 'a.spec.ts',
    name: 'outer > suite > waits',
    ms: 1_500,
    budget: 1_000,
    again: 1_400,
    outcome: 'confirmed',
  },
  { check: 'perf-gate-slow-file', file: 'b.spec.ts', ms: 9_000, budget: 5_000, again: 900, outcome: 'not reproduced' },
  { check: 'perf-gate-regression', file: 'c.spec.ts', ms: 700, budget: 600, outcome: 'unconfirmed' },
  { check: 'perf-gate-wall', ms: 90_000, budget: 60_000, outcome: 'over budget' },
];

describe('formatVerdict', () => {
  it('prints one row per candidate: both readings, the budget, what the gate made of it, and where', () => {
    expect(formatVerdict(rows, MONOCHROME)).toEqual([
      'perf gate verdict — 4 judged, 2 fail the run',
      '  kind   first  again  budget  verdict         where',
      '  test   1.50s  1.40s   1.00s  confirmed       a.spec.ts › suite > waits',
      '  file   9.00s  900ms   5.00s  not reproduced  b.spec.ts',
      '  grew   700ms      —   600ms  unconfirmed     c.spec.ts',
      '  run   90.00s      —  60.00s  over budget     (the whole run)',
    ]);
  });

  it('paints what fails the run red and the rest dim, and says "fails" for one', () => {
    const [title, , confirmed, notReproduced] = formatVerdict(rows.slice(0, 2), TERMINAL);

    expect(title).toBe('perf gate verdict — 2 judged, 1 fails the run');
    expect(confirmed).toContain(TERMINAL.red('confirmed     '));
    expect(notReproduced).toContain(TERMINAL.dim('not reproduced'));
  });

  it('prints nothing for no candidates', () => {
    expect(formatVerdict([], MONOCHROME)).toEqual([]);
  });
});

describe('shortName', () => {
  it('keeps the last two levels of a full name', () => {
    expect(shortName('a > b > c')).toBe('b > c');
    expect(shortName('only')).toBe('only');
  });
});
