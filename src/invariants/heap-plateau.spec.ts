/**
 * Architecture invariant: a suite that keeps building and tearing down doubles reaches a heap
 * plateau instead of a ramp. Run with `npm run test:invariants`.
 *
 * The failure this guards against is the one that ends real CI jobs — sinon#2356, "out of memory on
 * a large suite" — and the design that prevents it here is specific: since 4.1 a method spy is not a
 * `vi.fn()`. A `vi.fn()` enters a module-level strong `Set` inside `@vitest/spy` and stays there;
 * a fast spy is in no set at all, because a sweep bumps one integer epoch and each spy compares its
 * own stamp lazily. That is what makes the heap flat, and it is exactly the kind of property that a
 * refactor can undo without breaking a single behavioural test.
 *
 * **Which is why one of the arms below runs without a sweep.** Whether the registry retains depends
 * on the version: up to Vitest 4 a mock joins the set on creation and nothing removes it, so it
 * retains whatever a run does. On Vitest 5 the set that clearing walks is `DIRTY_MOCK_STATES`, a
 * mock joins it **on its first call**, and `mockClear()` takes it back out — so `vi.clearAllMocks()`
 * *empties* the registry. An arm that sweeps between cycles therefore cannot see a `vi.fn()`
 * regression at all on 5: it would plateau at `ratio 1.000` and pass. The arm without the sweep is
 * the one that fails, on every version, because there the set only grows.
 *
 * The assertion is a **ratio between cycles of this same process**, never a byte count: the absolute
 * heap of a Node worker depends on the machine, the Node build and whatever else the runner is
 * doing, and a byte threshold would be a machine-specific test wearing an invariant's clothes.
 */
import process from 'node:process';
import { describe, expect, it, vi } from 'vitest';

// The public entry, not `src/lib/*` — importing it is what registers the default Vitest mock
// adapter, so the doubles here are built exactly as a consumer's are.
import { createAutoMock, createSpyFromClass, mockDeep } from '../index';

type AnyMethods = Record<string, (...args: unknown[]) => unknown>;
type ClassWithMethods = new () => AnyMethods;

/** Cycles of build → call → clear → drop → collect. The first few are warm-up; see {@link WARMUP_CYCLES}. */
const CYCLES = 10;

/**
 * Cycles whose heap reading is discarded.
 *
 * The first cycles pay for compiled code, inline caches and V8's own lazily grown structures, all of
 * which land on the heap and never leave. Counting them as growth would fail a healthy library.
 */
const WARMUP_CYCLES = 4;

/** Readings averaged into the baseline, and again into the tail. A single reading is a coin toss. */
const WINDOW = 3;

/** Doubles built per cycle. Large enough that a retained cycle would be megabytes, not noise. */
const SPIES_PER_CYCLE = 1_000;

/** Methods per class. Every one is called, so every one materialises — an untouched lazy method retains nothing. */
const METHOD_COUNT = 10;

/**
 * How much the tail may sit above the baseline.
 *
 * A leak of one cycle's doubles is roughly a whole cycle's allocation per cycle — tens of percent
 * each, compounding — so the invariant survives a threshold this loose, while GC noise (V8 promoting
 * a different amount on each pass) routinely moves a reading by a few percent.
 */
const PLATEAU_RATIO = 1.1;

/** GC passes per settle. One `gc()` is not a settled heap — a young-generation survivor promoted by the first pass is only collected by a later one. */
const GC_PASSES = 4;

const gcHandle = (globalThis as { gc?: () => void }).gc;

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

async function settleHeap(): Promise<void> {
  for (let pass = 0; pass < GC_PASSES; pass += 1) {
    gcHandle?.();

    // A macrotask turn between passes is what lets pending finalization and the microtask queue
    // drain; without it the extra passes see the same heap the first one did.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

const WIDE_CLASS = makeWideClass(METHOD_COUNT);

/** One double, built and exercised the way a spec would exercise it. */
type Build = (index: number) => object;

/**
 * The factories the plateau has to hold for.
 *
 * Four, because they retain along four different routes: the class spy materialises a spy per
 * method, the untouched one materialises none and has to stay at its lazy weight, and the two
 * proxies keep a trap closure per double. A leak in any one of them is invisible in the others.
 */
/** The arm the no-sweep test reuses: every method materialised, which is where a registry would show. */
const MATERIALISED_CLASS_SPY: { readonly name: string; readonly build: Build } = {
  name: 'createSpyFromClass, every method called',
  build: (index) => {
    const double = createSpyFromClass(WIDE_CLASS) as unknown as AnyMethods;

    for (let method = 0; method < METHOD_COUNT; method += 1) {
      double[`m${method}`]?.(index);
    }

    return double;
  },
};

const POPULATIONS: readonly { readonly name: string; readonly build: Build }[] = [
  MATERIALISED_CLASS_SPY,
  {
    name: 'createSpyFromClass, untouched',
    build: () => createSpyFromClass(WIDE_CLASS) as unknown as AnyMethods,
  },
  {
    name: 'createAutoMock',
    build: (index) => {
      const double = createAutoMock<AnyMethods>();

      double['m0']?.(index);

      return double;
    },
  },
  {
    name: 'mockDeep',
    build: (index) => {
      const double = mockDeep<{ nested: { call: (value: number) => void } }>();

      double.nested.call(index);

      return double;
    },
  },
];

/**
 * One full cycle. The holder array is local on purpose: returning drops the only reference to it,
 * so nothing the test itself writes can keep a cycle's doubles alive past the cycle.
 */
function runCycle(build: Build, count: number, sweep: boolean): void {
  const doubles: object[] = new Array<object>(count);

  for (let index = 0; index < count; index += 1) {
    doubles[index] = build(index);
  }

  if (sweep) {
    vi.clearAllMocks();
  }

  doubles.length = 0;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);

  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function expectPlateau(label: string, build: Build, sweep: boolean): Promise<void> {
  const heaps: number[] = [];

  for (let cycle = 0; cycle < CYCLES; cycle += 1) {
    runCycle(build, SPIES_PER_CYCLE, sweep);
    await settleHeap();
    heaps.push(process.memoryUsage().heapUsed);
  }

  const baseline = median(heaps.slice(WARMUP_CYCLES, WARMUP_CYCLES + WINDOW));
  const tail = median(heaps.slice(-WINDOW));
  const series = heaps.map((bytes, index) => `#${index}: ${formatMb(bytes)}`).join(', ');

  // Printed on a pass as well: the ratio alone says whether the invariant held, the series says
  // how much room it held it by, and that is the number worth watching drift on.
  console.log(`heap plateau — ${label} — ${series} | ratio ${(tail / baseline).toFixed(3)} (limit ${PLATEAU_RATIO})`);

  expect(
    tail,
    [
      `heapUsed kept climbing across ${CYCLES} cycles of ${SPIES_PER_CYCLE} doubles (${label}).`,
      `baseline (median of cycles ${WARMUP_CYCLES}-${WARMUP_CYCLES + WINDOW - 1}) ${formatMb(baseline)},`,
      `tail (median of the last ${WINDOW}) ${formatMb(tail)},`,
      `ratio ${(tail / baseline).toFixed(3)} against a limit of ${PLATEAU_RATIO}.`,
      `Series: ${series}.`,
    ].join(' '),
  ).toBeLessThanOrEqual(baseline * PLATEAU_RATIO);
}

describe('architecture invariant: heap plateau', () => {
  it('exposes global.gc, without which nothing below measures a heap', () => {
    expect(typeof gcHandle, 'run this file through vitest.invariants.config.mts — it passes --expose-gc').toBe('function');
  });

  it.each(POPULATIONS)('reaches a plateau across repeated build/clear/drop cycles instead of climbing: $name', async ({ name, build }) => {
    await expectPlateau(name, build, true);
  });

  it('reaches a plateau with no sweep between cycles, which is the arm a runner registry would fail', async () => {
    await expectPlateau('no sweep', MATERIALISED_CLASS_SPY.build, false);
  });
});
