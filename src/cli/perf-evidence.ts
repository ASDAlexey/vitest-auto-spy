/**
 * The card printed under a confirmed gate finding: the measurements, the slowest tests, where the
 * profile says the time went, and what that most likely means.
 *
 * A finding used to be three lines of prose, and the numbers a reader needs to decide whether to open
 * the file — how far over, how many tests, which of them, where the CPU went — were either buried in
 * a sentence or not measured at all. Each is a row here, in a fixed order, so two cards read the same
 * way and the eye learns where to look.
 *
 * Two constraints shape the layout. Every line is indented and none starts at the first column,
 * because harnesses that relay a gate's output collect a finding as its `error` line plus the indented
 * lines under it. And there is no right-hand border: a path or a test name decides the width, and a
 * border that has to be padded to it is the one thing that misaligns in a terminal that is narrower.
 */
import type { Painter } from './paint';
import { padEnd, padStart } from './paint';
import { formatMs } from './perf-data';
import type { AngularCost, ProfileSummary, Share } from './perf-profile';

export interface Evidence {
  /** What the first reading put in the file's bodies. */
  readonly ms: number;
  readonly budget: number;
  /** The confirmation pass's reading of the same file. */
  readonly again: number;
  readonly testCount: number;
  /** The median test of the first reading, which the budget was counted in. */
  readonly medianTest: number;
  /** The file's bodies in the confirmation pass, slowest first. */
  readonly slowest: readonly { readonly name: string; readonly ms: number }[];
  readonly maxTestMs: number;
  readonly summary: ProfileSummary | undefined;
  /** The spec's heaviest direct imports in the confirmation pass, already named for a reader. */
  readonly imports?: readonly { readonly name: string; readonly ms: number }[];
}

const RULE_WIDTH = 64;
const LABEL_WIDTH = 13;
const BAR_WIDTH = 20;

function section(title: string, paint: Painter, first: boolean): string {
  const head = `${first ? '┌' : '├'}─ ${title} `;

  return paint.dim(head) + paint.dim('─'.repeat(Math.max(4, RULE_WIDTH - head.length)));
}

function row(label: string, value: string, paint: Painter): string {
  return `${paint.dim('│')} ${paint.dim(padEnd(label, LABEL_WIDTH))}${value}`;
}

function bar(share: number, paint: Painter): string {
  const filled = Math.round(Math.min(Math.max(share, 0), 1) * BAR_WIDTH);
  const color = share >= 0.4 ? paint.red : share >= 0.2 ? paint.yellow : paint.cyan;

  return `${color('█'.repeat(filled))}${paint.dim('░'.repeat(BAR_WIDTH - filled))}`;
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function times(ratio: number): string {
  return ratio >= 10 ? `${Math.round(ratio)}×` : `${ratio.toFixed(1)}×`;
}

function shares(entries: readonly Share[], paint: Painter): string {
  return entries.map((entry) => `${entry.name} ${paint.bold(percent(entry.share))}`).join(paint.dim('  ·  '));
}

function measurements(evidence: Evidence, paint: Painter): string[] {
  const perTest = evidence.testCount > 0 ? evidence.ms / evidence.testCount : 0;
  const againOver = evidence.again >= evidence.budget;
  const lines = [
    row(
      'first run',
      `${paint.yellow(padStart(formatMs(evidence.ms), 7))}   budget ${formatMs(evidence.budget)}   ${paint.red(`${times(evidence.ms / Math.max(evidence.budget, 1))} over`)}`,
      paint,
    ),
    row(
      'on its own',
      `${paint.yellow(padStart(formatMs(evidence.again), 7))}   ${againOver ? paint.red('still over budget') : 'under budget'}`,
      paint,
    ),
  ];

  if (evidence.testCount > 0) {
    const ratio = evidence.medianTest > 0 ? `   ${times(perTest / evidence.medianTest)} the median test` : '';

    lines.push(row('tests', `${padStart(String(evidence.testCount), 7)}   ${formatMs(perTest)} each${ratio}`, paint));
  }

  return lines;
}

function slowestTests(evidence: Evidence, paint: Painter): string[] {
  const width = Math.max(...evidence.slowest.map((entry) => formatMs(entry.ms).length));

  return evidence.slowest.map((entry) => {
    const time = padStart(formatMs(entry.ms), width);

    return `${paint.dim('│')}   ${entry.ms >= evidence.maxTestMs ? paint.red(time) : paint.yellow(time)}  ${entry.name}`;
  });
}

function slowestImports(imports: readonly { readonly name: string; readonly ms: number }[], paint: Painter): string[] {
  const width = Math.max(...imports.map((entry) => formatMs(entry.ms).length));

  return imports.map((entry) => `${paint.dim('│')}   ${paint.yellow(padStart(formatMs(entry.ms), width))}  ${entry.name}`);
}

function profileRows(summary: ProfileSummary, paint: Painter): string[] {
  const lines: string[] = [];

  if (summary.hooks !== undefined) {
    lines.push(
      row('hooks', `${bar(summary.hooks, paint)} ${paint.bold(percent(summary.hooks))}   test bodies ${percent(1 - summary.hooks)}`, paint),
    );
  }

  const angular = summary.angular.filter((entry) => entry.share >= 0.01);

  if (angular.length > 0) {
    lines.push(row('angular', shares(angular, paint), paint));
  }

  for (const entry of summary.packages) {
    lines.push(
      row(
        entry === summary.packages[0] ? 'by package' : '',
        `${bar(entry.share, paint)} ${paint.bold(padStart(percent(entry.share), 4))}  ${entry.name}`,
        paint,
      ),
    );
  }

  const lists: readonly (readonly [string, readonly Share[]])[] = [
    ['in the spec', summary.spec],
    ['your code', summary.project],
    ['hottest', summary.hottest],
  ];

  for (const [label, entries] of lists) {
    if (entries.length > 0) {
      lines.push(row(label, shares(entries, paint), paint));
    }
  }

  return lines;
}

/**
 * What the numbers most likely mean, in at most two sentences, or nothing when they do not point
 * anywhere. Each sentence names the rule it fired on, because a guess that hides its reason is one
 * a reader cannot check.
 */
export function likelyCause(evidence: Evidence): string[] {
  const summary = evidence.summary;
  const angular = angularCauses(summary);
  const causes = [...angular.causes];
  const [first, second] = evidence.slowest;

  if (!angular.explainsHooks && summary?.hooks !== undefined && summary.hooks >= 0.5) {
    const where = summary.spec[0] === undefined ? '' : ` — ${summary.spec[0].name} alone is ${percent(summary.spec[0].share)}`;

    causes.push(
      `Most of the time is set-up that every test repeats: ${percent(summary.hooks)} is in hooks${where}. Build what does not change once, in a beforeAll, or render less per test.`,
    );
  } else if (first !== undefined && second !== undefined && first.ms >= 3 * second.ms) {
    causes.push(
      `One test dominates: "${first.name}" takes ${formatMs(first.ms)}, ${times(first.ms / Math.max(second.ms, 1))} the next one.`,
    );
  }

  const heaviest = summary?.packages[0];

  if (
    heaviest !== undefined &&
    heaviest.share >= 0.2 &&
    ['jsdom', '@angular/core', 'react-dom', 'vue', '@vue/runtime-core'].includes(heaviest.name)
  ) {
    causes.push(
      `The largest single cost is ${heaviest.name} (${percent(heaviest.share)}): rendering and change detection, which grow with the size of the tree each test builds.`,
    );
  }

  const gc = summary?.hottest.find((entry) => entry.name === '(garbage collector)');

  if (gc !== undefined && gc.share >= 0.1) {
    causes.push(`Garbage collection is ${percent(gc.share)}: the tests allocate heavily, usually large fixtures rebuilt per test.`);
  }

  return causes.slice(0, 2);
}

interface AngularCauses {
  readonly causes: readonly string[];
  /** The TestBed sentence already says what the hooks share means, so the generic one stands aside. */
  readonly explainsHooks: boolean;
}

function costOf(summary: ProfileSummary, name: AngularCost): number {
  return summary.angular.find((entry) => entry.name === name)?.share ?? 0;
}

function angularCauses(summary: ProfileSummary | undefined): AngularCauses {
  if (summary === undefined) {
    return { causes: [], explainsHooks: false };
  }

  const causes: string[] = [];
  const testBed = costOf(summary, 'TestBed set-up') + costOf(summary, 'component creation');
  const jit = costOf(summary, 'JIT compilation');
  const detection = costOf(summary, 'change detection');
  const styles = costOf(summary, 'computed styles');
  const explainsHooks = testBed >= 0.3;

  if (explainsHooks) {
    causes.push(
      `TestBed rebuilds the testing module and the component for every test: ${percent(testBed)} is TestBed set-up and component creation. Configure less per test — provide doubles instead of importing whole feature modules, and leave child components out of the template under test.`,
    );
  }

  if (jit >= 0.15) {
    causes.push(
      `${percent(jit)} is the Angular JIT compiler: components are compiled while the tests run, and every TestBed.override* of a component compiles it again for that test. Override less, or import fewer declarations into the testing module.`,
    );
  }

  if (detection >= 0.3) {
    causes.push(
      `${percent(detection)} is change detection: detectChanges runs more often than the assertions need, or each run re-renders a large tree. Arrange the state first and detect changes once.`,
    );
  }

  if (styles >= 0.15) {
    causes.push(
      `${percent(styles)} is jsdom computing styles (getComputedStyle), which it does slowly: usually a component library or an animation measuring layout. Disable animations in the testing module, or stub the measurement.`,
    );
  }

  return { causes, explainsHooks };
}

/** The card, one string per line, for `Finding.details`. */
export function formatEvidence(evidence: Evidence, paint: Painter): string[] {
  const lines = ['', section('measurements', paint, true), ...measurements(evidence, paint)];

  if (evidence.slowest.length > 0) {
    lines.push(section('slowest tests', paint, false), ...slowestTests(evidence, paint));
  }

  if (evidence.imports !== undefined && evidence.imports.length > 0) {
    lines.push(section('slowest imports · with everything under them', paint, false), ...slowestImports(evidence.imports, paint));
  }

  if (evidence.summary !== undefined && evidence.summary.sampledMs > 0) {
    lines.push(
      section(`where the time went · CPU profile, ${formatMs(evidence.summary.sampledMs)} sampled`, paint, false),
      ...profileRows(evidence.summary, paint),
    );
  }

  const causes = likelyCause(evidence);

  if (causes.length > 0) {
    lines.push(section('likely cause', paint, false), ...causes.map((cause) => `${paint.dim('│')} ${paint.cyan(cause)}`));
  }

  lines.push(paint.dim(`└${'─'.repeat(RULE_WIDTH - 1)}`), '');

  return lines;
}
