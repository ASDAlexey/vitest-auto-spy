/**
 * Retained heap per test double, head-to-head against the other libraries. Run with
 * `npm run bench:memory`.
 *
 * `vs-libraries.bench.ts` answers "how long does building a double take". This file answers the
 * question that actually ends CI jobs: **how many bytes is a double still holding while the suite
 * keeps it alive.** Under `isolate: false` a worker holds every double of every file it has run, so
 * the figure that decides whether a large suite survives is retained heap, not allocation rate and
 * not the peak during construction.
 *
 * **Method.** Force GC, read `process.memoryUsage().heapUsed`, allocate N doubles into an array that
 * stays reachable, force GC again, read again, divide the delta by N. Then drop the array, force GC
 * a third time, and check the heap came back — a cell whose memory does not return is a cell whose
 * "before" was measuring somebody else.
 *
 * Four traps, all of which produce numbers that look plausible and are not:
 *
 * - **`@vitest/spy` keeps every mock it ever created in a module-level *strong* `Set`.** Nothing any
 *   arm allocates is collectable while that set holds it, so without intervention every arm's
 *   baseline silently includes every arm that ran before it and the column becomes a running total.
 *   {@link releaseCreatedMocks} is the fix, and {@link measureOnce} verifies it per cell rather than
 *   trusting it: a residual the release did not give back means the prune stopped working, and the
 *   whole table is void.
 * - **One `gc()` call is not a settled heap.** V8 reclaims across passes — a young-generation
 *   survivor promoted by the first pass is only collected by a later one — so
 *   {@link settleHeap} calls it repeatedly with a macrotask turn between calls, which is also what
 *   lets pending finalization and the microtask queue drain.
 * - **The first measurement of an arm is not a measurement of the arm.** It pays for that library's
 *   compiled code, its inline caches and its lazily-built internals, all of which land on the heap
 *   between the two readings and never leave. Every arm gets a discarded warm-up pass first.
 * - **Heap deltas are noisy in a way wall clock is not** — the noise is a step function of whatever
 *   V8 happened to promote, not a smooth distribution. Each cell is measured {@link REPEATS} times
 *   and reported as a median with the observed spread, so a reader can see what the harness can
 *   actually resolve.
 *
 * The class family and the type family are separate tables for the same reason they are separate
 * `describe`s in `vs-libraries.bench.ts`: one reads a real prototype and the other reads nothing, so
 * a single ranking across them would be a race over different distances.
 *
 * Nothing here asserts on a number. It is a measurement, and the only assertions are about its own
 * integrity: that `--expose-gc` reached the process, and that the registry prune works.
 */
import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';

import { createSpyFromClass as hirezCreateSpyFromClass } from '@bugsplat/vitest-auto-spies';
import { createMock as golevelupCreateMock } from '@golevelup/ts-vitest';
import { mock as vmxMock } from 'vitest-mock-extended';

import { installRunnerGlobals } from './runner-globals';

// The public entry, not `src/lib/*` — so the default Vitest mock adapter registers as a side
// effect, exactly as it does for a consumer.
import { createAutoMock, createSpyFromClass } from '../src/index';
import { captureMockRegistry, pruneMockRegistry } from '../src/setup';

installRunnerGlobals();

// `jest-auto-spies` and `jasmine-auto-spies` are CommonJS and their declarations reference ambient
// `jest` / `jasmine` type packages this repository does not install. `createRequire` loads them for
// what the harness needs — the factory — without pulling those globals into the type program.
const requireCjs = createRequire(import.meta.url);

type AnyMethods = Record<string, (...args: unknown[]) => unknown>;
type ClassWithMethods = new () => AnyMethods;
type ClassSpyFactory = (ObjectClass: ClassWithMethods) => AnyMethods;

const jestAutoSpies = requireCjs('jest-auto-spies') as { createSpyFromClass: ClassSpyFactory };
const jasmineAutoSpies = requireCjs('jasmine-auto-spies') as { createSpyFromClass: ClassSpyFactory };

captureMockRegistry();

// ---------------------------------------------------------------------------------------------
// Harness parameters.
// ---------------------------------------------------------------------------------------------

/**
 * How many doubles are held alive at once. Bounded from both sides: below it the cheapest cell
 * (an untouched Proxy) disappears into GC noise, above it the widest eager cell holds ~270 MB.
 */
const HOLD_COUNT = 500;

/** Measurements per cell. The reported figure is the median of these; the spread comes from them too. */
const REPEATS = 5;

/** GC passes per settle. Four is where the reading stops moving on this workload. */
const GC_PASSES = 4;

/** A cell whose released heap exceeds this share of what it retained is a cell that did not release. */
const MAX_RESIDUAL_SHARE = 0.15;

/** Below this, a cell's residual is GC noise rather than a leak, and the share test is meaningless. */
const RESIDUAL_NOISE_FLOOR_BYTES = 512 * 1024;

const gcHandle = (globalThis as { gc?: () => void }).gc;

/**
 * Release everything the last cell created, so the next baseline is the same heap the last one had.
 *
 * This is the whole reason the numbers are per-arm instead of cumulative — see the file header.
 */
function releaseCreatedMocks(): void {
  pruneMockRegistry();
}

/** Run the collector to a fixed point. One call is not enough; see the file header. */
async function settleHeap(): Promise<void> {
  for (let pass = 0; pass < GC_PASSES; pass += 1) {
    gcHandle?.();

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

/** A class with `methodCount` prototype methods — the width is what a prototype walk pays for. */
function makeWideClass(methodCount: number): ClassWithMethods {
  const WideClass = class {};

  for (let index = 0; index < methodCount; index += 1) {
    Object.defineProperty(WideClass.prototype, `m${index}`, {
      value: (): number => index,
      configurable: true,
      writable: true,
      enumerable: false,
    });
  }

  return WideClass as unknown as ClassWithMethods;
}

/** The double a developer writes by hand when they skip the libraries entirely — the floor. */
function handWritten(methodCount: number): AnyMethods {
  const double: AnyMethods = {};

  for (let index = 0; index < methodCount; index += 1) {
    double[`m${index}`] = vi.fn();
  }

  return double;
}

/** Call the first `callCount` methods of a double — the part a test actually materializes. */
function callFirst(double: AnyMethods, callCount: number): void {
  for (let index = 0; index < callCount; index += 1) {
    double[`m${index}`]?.();
  }
}

// ---------------------------------------------------------------------------------------------
// Arms.
// ---------------------------------------------------------------------------------------------

interface ClassSubject {
  readonly WideClass: ClassWithMethods;
  readonly methodCount: number;
}

interface Arm<Subject> {
  readonly label: string;
  readonly create: (subject: Subject) => AnyMethods;
}

const CLASS_ARMS: readonly Arm<ClassSubject>[] = [
  {
    label: 'vitest-auto-spy: createSpyFromClass (default lazy)',
    create: ({ WideClass }) => createSpyFromClass(WideClass) as unknown as AnyMethods,
  },
  {
    label: "vitest-auto-spy: lazySpies: 'proxy'",
    create: ({ WideClass }) => createSpyFromClass(WideClass, { lazySpies: 'proxy' }) as unknown as AnyMethods,
  },
  {
    label: 'vitest-auto-spy: lazySpies: false',
    create: ({ WideClass }) => createSpyFromClass(WideClass, { lazySpies: false }) as unknown as AnyMethods,
  },
  { label: 'jest-auto-spies', create: ({ WideClass }) => jestAutoSpies.createSpyFromClass(WideClass) },
  { label: 'jasmine-auto-spies', create: ({ WideClass }) => jasmineAutoSpies.createSpyFromClass(WideClass) },
  {
    label: '@bugsplat/vitest-auto-spies',
    create: ({ WideClass }) => hirezCreateSpyFromClass(WideClass) as unknown as AnyMethods,
  },
  { label: 'hand-written vi.fn() per method', create: ({ methodCount }) => handWritten(methodCount) },
];

const TYPE_ARMS: readonly Arm<void>[] = [
  { label: 'vitest-auto-spy: createAutoMock<T>()', create: () => createAutoMock<AnyMethods>() as AnyMethods },
  { label: 'vitest-mock-extended: mock<T>()', create: () => vmxMock<AnyMethods>() as unknown as AnyMethods },
  { label: '@golevelup/ts-vitest: createMock<T>()', create: () => golevelupCreateMock<AnyMethods>() as unknown as AnyMethods },
];

const WIDTHS = [10, 100] as const;

interface TouchLevel {
  readonly label: string;
  /** How many of the width's methods the "test" calls. */
  readonly callsOf: (width: number) => number;
}

const TOUCH_LEVELS: readonly TouchLevel[] = [
  { label: 'untouched', callsOf: () => 0 },
  { label: 'all called', callsOf: (width) => width },
];

// ---------------------------------------------------------------------------------------------
// Measurement.
// ---------------------------------------------------------------------------------------------

interface Sample {
  readonly bytesPerDouble: number;
  readonly retainedBytes: number;
  readonly residualBytes: number;
}

/**
 * One retained-heap reading: baseline, allocate and hold, read, then release and check it came back.
 *
 * The holder array is preallocated so its own growth is not part of the delta; the eight bytes per
 * slot it costs are identical for every arm.
 */
async function measureOnce(create: () => AnyMethods, callCount: number): Promise<Sample> {
  releaseCreatedMocks();
  await settleHeap();

  const before = process.memoryUsage().heapUsed;
  const held = new Array<AnyMethods>(HOLD_COUNT);

  for (let index = 0; index < HOLD_COUNT; index += 1) {
    const double = create();

    callFirst(double, callCount);
    held[index] = double;
  }

  await settleHeap();
  const retainedBytes = process.memoryUsage().heapUsed - before;

  held.length = 0;
  releaseCreatedMocks();
  await settleHeap();
  const residualBytes = process.memoryUsage().heapUsed - before;

  return { bytesPerDouble: retainedBytes / HOLD_COUNT, retainedBytes, residualBytes };
}

interface Cell {
  readonly medianBytesPerDouble: number;
  readonly spreadPercent: number;
  readonly worstResidualShare: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted.length >> 1;

  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }

  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

async function measureCell(create: () => AnyMethods, callCount: number): Promise<Cell> {
  // Discarded: it pays for the library's compiled code and inline caches, which land on the heap
  // between the two readings and never leave.
  await measureOnce(create, callCount);

  const samples: Sample[] = [];

  for (let repeat = 0; repeat < REPEATS; repeat += 1) {
    samples.push(await measureOnce(create, callCount));
  }

  const perDouble = samples.map((sample) => sample.bytesPerDouble);
  const medianBytesPerDouble = median(perDouble);
  const lowest = Math.min(...perDouble);
  const highest = Math.max(...perDouble);

  const worstResidualShare = Math.max(
    ...samples.map((sample) =>
      sample.residualBytes < RESIDUAL_NOISE_FLOOR_BYTES ? 0 : sample.residualBytes / Math.max(sample.retainedBytes, 1),
    ),
  );

  return {
    medianBytesPerDouble,
    spreadPercent: medianBytesPerDouble === 0 ? 0 : ((highest - lowest) / medianBytesPerDouble) * 100,
    worstResidualShare,
  };
}

// ---------------------------------------------------------------------------------------------
// Reporting.
// ---------------------------------------------------------------------------------------------

function formatCell(cell: Cell, width: number): string {
  const perDouble = Math.round(cell.medianBytesPerDouble).toLocaleString('en-US');
  const perMethod = Math.round(cell.medianBytesPerDouble / width).toLocaleString('en-US');

  return `${perDouble} (${perMethod}) ±${cell.spreadPercent.toFixed(0)}%`;
}

function renderTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => (row[column] ?? '').length)),
  );

  const line = (cells: readonly string[]): string =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column] ?? cell.length)).join(' | ')} |`;

  const divider = `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`;

  return [line(headers), divider, ...rows.map((row) => line(row))].join('\n');
}

function columnHeaders(): string[] {
  const headers: string[] = ['arm'];

  for (const width of WIDTHS) {
    for (const touch of TOUCH_LEVELS) {
      headers.push(`${width} methods, ${touch.label}`);
    }
  }

  return headers;
}

/** Run every (width × touch) cell for one arm and return its rendered row plus the raw cells. */
async function measureArmRow<Subject>(
  arm: Arm<Subject>,
  subjectOf: (width: number) => Subject,
): Promise<{ row: string[]; cells: Cell[] }> {
  const row: string[] = [arm.label];
  const cells: Cell[] = [];

  for (const width of WIDTHS) {
    const subject = subjectOf(width);

    for (const touch of TOUCH_LEVELS) {
      const cell = await measureCell(() => arm.create(subject), touch.callsOf(width));

      cells.push(cell);
      row.push(formatCell(cell, width));
    }
  }

  return { row, cells };
}

const CLASS_SUBJECTS = new Map<number, ClassSubject>(
  WIDTHS.map((width) => [width, { WideClass: makeWideClass(width), methodCount: width }]),
);

// ---------------------------------------------------------------------------------------------

describe('retained heap per double', () => {
  it('measures the field', async () => {
    expect(
      gcHandle,
      'globalThis.gc is missing: this file must run under --expose-gc. Use `npm run bench:memory`, which supplies it through vitest.bench.memory.config.mts (test.execArgv, forks pool).',
    ).toBeTypeOf('function');

    const allCells: Cell[] = [];
    const classRows: string[][] = [];

    for (const arm of CLASS_ARMS) {
      const { row, cells } = await measureArmRow(arm, (width) => {
        const subject = CLASS_SUBJECTS.get(width);

        // `Map.get` is `| undefined` and the fallback is unreachable: CLASS_SUBJECTS is built from
        // WIDTHS, which is what the caller iterates.
        return subject ?? { WideClass: makeWideClass(width), methodCount: width };
      });

      classRows.push(row);
      allCells.push(...cells);
    }

    const typeRows: string[][] = [];

    for (const arm of TYPE_ARMS) {
      const { row, cells } = await measureArmRow(arm, () => undefined);

      typeRows.push(row);
      allCells.push(...cells);
    }

    const worstResidualShare = Math.max(...allCells.map((cell) => cell.worstResidualShare));
    const worstSpreadPercent = Math.max(...allCells.map((cell) => cell.spreadPercent));

    const report = [
      '',
      '## Retained heap per test double',
      '',
      `N = ${HOLD_COUNT.toLocaleString('en-US')} doubles held alive at once · ${REPEATS} repeats per cell (median reported) · ${GC_PASSES} GC passes per settle`,
      `node ${process.version} · cells read \`bytes per double (bytes per method) ±spread\``,
      '',
      '### Built from a class (reads a real prototype)',
      '',
      renderTable(columnHeaders(), classRows),
      '',
      '### Built from a type (Proxy, no class read)',
      '',
      'Nothing here reads a class, so an untouched double is the same object at either width — the',
      'two `untouched` columns differ only by the noise floor, and `bytes per method` is against the',
      "type's nominal width.",
      '',
      renderTable(columnHeaders(), typeRows),
      '',
      '### Harness integrity',
      '',
      `- registry prune: worst residual after release = ${(worstResidualShare * 100).toFixed(1)}% of what the cell retained (0% means every cell's heap came back below the ${(RESIDUAL_NOISE_FLOOR_BYTES / 1024).toFixed(0)} KiB noise floor)`,
      `- worst run-to-run spread across all cells: ±${worstSpreadPercent.toFixed(0)}%`,
      '',
    ].join('\n');

    // `process.stdout.write`, not `console.log`: Vitest 4 swallows console output from a passing
    // test, and this table is the entire point of the run.
    process.stdout.write(`${report}\n`);

    expect(
      worstResidualShare,
      'the mock registry did not release between arms — every baseline after the first includes its predecessors and the numbers above are cumulative nonsense. Do not publish them.',
    ).toBeLessThan(MAX_RESIDUAL_SHARE);
  });
});
