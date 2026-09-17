/**
 * The card under a confirmed gate finding.
 *
 * Pinned: the rows in their fixed order, each section present only when it has something to say,
 * the color of every number against the budget it is judged by, and a layout in which no line starts
 * at the first column — a harness relaying the gate's output collects a finding as its `error` line
 * plus the indented lines under it. `likelyCause` is pinned rule by rule, with the order in which one
 * rule stands aside for another.
 */
import { describe, expect, it } from 'vitest';

import { ESC, MONOCHROME, TERMINAL, stripColor } from './paint';
import type { Evidence } from './perf-evidence';
import { formatEvidence, likelyCause } from './perf-evidence';
import type { ProfileSummary } from './perf-profile';

const summaryOf = (over: Partial<ProfileSummary> = {}): ProfileSummary => ({
  sampledMs: 738,
  hooks: 0.54,
  spec: [
    { name: 'setUpWith', ms: 290, share: 0.39 },
    { name: 'assertFocus', ms: 60, share: 0.08 },
  ],
  project: [{ name: 'removeAllRootElements', ms: 15, share: 0.02 }],
  packages: [
    { name: 'jsdom', ms: 214, share: 0.29 },
    { name: '@angular/core', ms: 177, share: 0.24 },
    { name: 'zone.js', ms: 66, share: 0.09 },
  ],
  hottest: [{ name: '(garbage collector)', ms: 22, share: 0.03 }],
  ...over,
});

const evidenceOf = (over: Partial<Evidence> = {}): Evidence => ({
  ms: 1_800,
  budget: 462,
  again: 889,
  testCount: 38,
  medianTest: 2.4,
  slowest: [
    { name: 'focusables > have focusable elements', ms: 79 },
    { name: 'opened controls > sends UI event', ms: 29 },
  ],
  maxTestMs: 1_000,
  summary: summaryOf(),
  ...over,
});

describe('formatEvidence', () => {
  it('prints every section in its fixed order', () => {
    expect(formatEvidence(evidenceOf(), MONOCHROME)).toEqual([
      '',
      `┌─ measurements ${'─'.repeat(48)}`,
      '│ first run      1.80s   budget 462ms   3.9× over',
      '│ on its own     889ms   still over budget',
      '│ tests             38   47ms each   20× the median test',
      `├─ slowest tests ${'─'.repeat(47)}`,
      '│   79ms  focusables > have focusable elements',
      '│   29ms  opened controls > sends UI event',
      `├─ where the time went · CPU profile, 738ms sampled ${'─'.repeat(12)}`,
      `│ hooks        ${'█'.repeat(11)}${'░'.repeat(9)} 54%   test bodies 46%`,
      `│ by package   ${'█'.repeat(6)}${'░'.repeat(14)}  29%  jsdom`,
      `│              ${'█'.repeat(5)}${'░'.repeat(15)}  24%  @angular/core`,
      `│              ${'█'.repeat(2)}${'░'.repeat(18)}   9%  zone.js`,
      '│ in the spec  setUpWith 39%  ·  assertFocus 8%',
      '│ your code    removeAllRootElements 2%',
      '│ hottest      (garbage collector) 3%',
      `├─ likely cause ${'─'.repeat(48)}`,
      '│ Most of the time is set-up that every test repeats: 54% is in hooks — setUpWith alone is 39%. Build what does not change once, in a beforeAll, or render less per test.',
      '│ The largest single cost is jsdom (29%): rendering and change detection, which grow with the size of the tree each test builds.',
      `└${'─'.repeat(63)}`,
      '',
    ]);
  });

  it('never starts a line at the first column with anything but a box character', () => {
    for (const line of formatEvidence(evidenceOf(), TERMINAL).map(stripColor)) {
      expect(line === '' || /^[┌├│└]/.test(line)).toBe(true);
    }
  });

  it('says under budget when the second reading was, and leaves the ratio out without a median', () => {
    const lines = formatEvidence(evidenceOf({ again: 300, medianTest: 0 }), MONOCHROME);

    expect(lines).toContain('│ on its own     300ms   under budget');
    expect(lines).toContain('│ tests             38   47ms each');
  });

  it('prints no tests row for a file that finished none, and no ratio row against a zero budget either way', () => {
    const lines = formatEvidence(evidenceOf({ testCount: 0, budget: 0, slowest: [], summary: undefined }), MONOCHROME);

    expect(lines.some((line) => line.startsWith('│ tests'))).toBe(false);
    expect(lines).toContain('│ first run      1.80s   budget 0ms   1800× over');
    expect(lines.some((line) => line.includes('slowest tests'))).toBe(false);
    expect(lines.some((line) => line.includes('where the time went'))).toBe(false);
  });

  it('leaves the profile section out when the profile sampled nothing', () => {
    const lines = formatEvidence(evidenceOf({ summary: summaryOf({ sampledMs: 0 }), slowest: [] }), MONOCHROME);

    expect(lines.some((line) => line.includes('where the time went'))).toBe(false);
  });

  it('skips the hooks row when the runner was not recognised, and every empty list', () => {
    const lines = formatEvidence(
      evidenceOf({ summary: summaryOf({ hooks: undefined, spec: [], project: [], hottest: [], packages: [] }) }),
      MONOCHROME,
    );
    const profile = lines.slice(lines.findIndex((line) => line.includes('where the time went')) + 1);

    expect(profile[0]).toMatch(/^└|^├─ likely cause/);
  });

  it('colors a slow body red at the body budget and yellow under it, right-aligned', () => {
    const lines = formatEvidence(
      evidenceOf({
        slowest: [
          { name: 'slow', ms: 1_200 },
          { name: 'fast', ms: 9 },
        ],
      }),
      TERMINAL,
    );

    expect(lines).toContain(`${TERMINAL.dim('│')}   ${TERMINAL.red('1.20s')}  slow`);
    expect(lines).toContain(`${TERMINAL.dim('│')}   ${TERMINAL.yellow('  9ms')}  fast`);
  });

  it('colors a bar red from 40 %, yellow from 20 %, cyan under that, and clamps it to its width', () => {
    const barOf = (share: number): string =>
      formatEvidence(evidenceOf({ summary: summaryOf({ hooks: share, packages: [] }) }), TERMINAL).find((line) =>
        stripColor(line).startsWith('│ hooks'),
      ) ?? '';

    expect(barOf(0.4)).toContain(TERMINAL.red('█'.repeat(8)));
    expect(barOf(0.2)).toContain(TERMINAL.yellow('█'.repeat(4)));
    expect(barOf(0.1)).toContain(TERMINAL.cyan('█'.repeat(2)));
    expect(stripColor(barOf(1.5))).toContain('█'.repeat(20));
    expect(stripColor(barOf(-0.5))).toContain(`${'░'.repeat(20)} -50%`);
    expect(barOf(0.4)).toContain(ESC);
  });
});

describe('likelyCause', () => {
  it('names the repeated set-up when hooks carry half, with the spec function when there is one', () => {
    expect(likelyCause(evidenceOf({ summary: summaryOf({ packages: [] }) }))).toEqual([
      'Most of the time is set-up that every test repeats: 54% is in hooks — setUpWith alone is 39%. Build what does not change once, in a beforeAll, or render less per test.',
    ]);
    expect(likelyCause(evidenceOf({ summary: summaryOf({ packages: [], spec: [] }) }))).toEqual([
      'Most of the time is set-up that every test repeats: 54% is in hooks. Build what does not change once, in a beforeAll, or render less per test.',
    ]);
  });

  it('names one dominating test only when the hooks rule did not fire', () => {
    const slowest = [
      { name: 'waits', ms: 900 },
      { name: 'renders', ms: 300 },
    ];

    expect(likelyCause(evidenceOf({ slowest, summary: undefined }))).toEqual([
      'One test dominates: "waits" takes 900ms, 3.0× the next one.',
    ]);
    expect(
      likelyCause(
        evidenceOf({
          slowest: [
            { name: 'waits', ms: 900 },
            { name: 'renders', ms: 0 },
          ],
          summary: undefined,
        }),
      ),
    ).toEqual(['One test dominates: "waits" takes 900ms, 900× the next one.']);
    expect(likelyCause(evidenceOf({ slowest, summary: summaryOf({ packages: [] }) }))[0]).toContain('set-up that every test repeats');
    expect(
      likelyCause(
        evidenceOf({
          slowest: [
            { name: 'waits', ms: 900 },
            { name: 'renders', ms: 301 },
          ],
          summary: undefined,
        }),
      ),
    ).toEqual([]);
    expect(likelyCause(evidenceOf({ slowest: [{ name: 'waits', ms: 900 }], summary: undefined }))).toEqual([]);
  });

  it('names a rendering package at 20 % or more, and no other package', () => {
    const pkg = (name: string, share: number): Evidence =>
      evidenceOf({ slowest: [], summary: summaryOf({ hooks: 0.1, packages: [{ name, ms: 1, share }], hottest: [] }) });

    expect(likelyCause(pkg('@angular/core', 0.2))).toEqual([
      'The largest single cost is @angular/core (20%): rendering and change detection, which grow with the size of the tree each test builds.',
    ]);
    expect(likelyCause(pkg('jsdom', 0.19))).toEqual([]);
    expect(likelyCause(pkg('rxjs', 0.6))).toEqual([]);
  });

  it('names garbage collection from 10 %, and keeps at most two causes', () => {
    const gc = (share: number): ProfileSummary => summaryOf({ hottest: [{ name: '(garbage collector)', ms: 1, share }] });

    expect(
      likelyCause(
        evidenceOf({
          slowest: [],
          summary: summaryOf({ hooks: undefined, packages: [], hottest: [{ name: '(garbage collector)', ms: 1, share: 0.1 }] }),
        }),
      ),
    ).toEqual(['Garbage collection is 10%: the tests allocate heavily, usually large fixtures rebuilt per test.']);
    expect(likelyCause(evidenceOf({ summary: gc(0.3) }))).toHaveLength(2);
    expect(
      likelyCause(
        evidenceOf({
          slowest: [],
          summary: summaryOf({ hooks: undefined, packages: [], hottest: [{ name: '(garbage collector)', ms: 1, share: 0.09 }] }),
        }),
      ),
    ).toEqual([]);
  });

  it('is empty without a profile and without a dominating test', () => {
    expect(likelyCause(evidenceOf({ slowest: [], summary: undefined }))).toEqual([]);
  });
});
