/**
 * Architecture invariant: a suite that keeps building and tearing down doubles reaches a heap
 * plateau instead of a ramp. Run with `npm run test:invariants`.
 *
 * The failure this guards against is the one that ends real CI jobs — sinon#2356, "out of memory on
 * a large suite" — and the design that prevents it here is specific: since 4.1 a method spy is not a
 * `vi.fn()`. The runner's mocks live in a module-level strong `Set` inside `@vitest/spy` that every
 * `vi.fn()` writes to and nothing ever removes from, so a run-wide `clearAllMocks()` on that design
 * is also a run-wide *retainer*. A fast spy is in no set at all: a sweep bumps one integer epoch and
 * each spy compares its own stamp lazily. That is what makes the heap flat, and it is exactly the
 * kind of property that a refactor can undo without breaking a single behavioural test.
 *
 * The assertion is a **ratio between cycles of this same process**, never a byte count: the absolute
 * heap of a Node worker depends on the machine, the Node build and whatever else the runner is
 * doing, and a byte threshold would be a machine-specific test wearing an invariant's clothes.
 */
import process from 'node:process';
import { describe, expect, it, vi } from 'vitest';

// The public entry, not `src/lib/*` — importing it is what registers the default Vitest mock
// adapter, so the doubles here are built exactly as a consumer's are.
import { createSpyFromClass } from '../index';

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

/**
 * One full cycle. The holder array is local on purpose: returning drops the only reference to it,
 * so nothing the test itself writes can keep a cycle's doubles alive past the cycle.
 */
function runCycle(WideClass: ClassWithMethods, count: number): void {
  const doubles: AnyMethods[] = new Array<AnyMethods>(count);

  for (let index = 0; index < count; index += 1) {
    const double = createSpyFromClass(WideClass) as unknown as AnyMethods;

    for (let method = 0; method < METHOD_COUNT; method += 1) {
      double[`m${method}`]?.(index);
    }

    doubles[index] = double;
  }

  vi.clearAllMocks();
  doubles.length = 0;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);

  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

describe('architecture invariant: heap plateau', () => {
  it('exposes global.gc, without which nothing below measures a heap', () => {
    expect(typeof gcHandle, 'run this file through vitest.invariants.config.mts — it passes --expose-gc').toBe('function');
  });

  it('reaches a plateau across repeated build/clear/drop cycles instead of climbing', async () => {
    const WideClass = makeWideClass(METHOD_COUNT);
    const heaps: number[] = [];

    for (let cycle = 0; cycle < CYCLES; cycle += 1) {
      runCycle(WideClass, SPIES_PER_CYCLE);
      await settleHeap();
      heaps.push(process.memoryUsage().heapUsed);
    }

    const baseline = median(heaps.slice(WARMUP_CYCLES, WARMUP_CYCLES + WINDOW));
    const tail = median(heaps.slice(-WINDOW));
    const series = heaps.map((bytes, index) => `#${index}: ${formatMb(bytes)}`).join(', ');

    // Printed on a pass as well: the ratio alone says whether the invariant held, the series says
    // how much room it held it by, and that is the number worth watching drift on.
    console.log(`heap plateau — ${series} | ratio ${(tail / baseline).toFixed(3)} (limit ${PLATEAU_RATIO})`);

    expect(
      tail,
      [
        `heapUsed kept climbing across ${CYCLES} cycles of ${SPIES_PER_CYCLE} doubles.`,
        `baseline (median of cycles ${WARMUP_CYCLES}-${WARMUP_CYCLES + WINDOW - 1}) ${formatMb(baseline)},`,
        `tail (median of the last ${WINDOW}) ${formatMb(tail)},`,
        `ratio ${(tail / baseline).toFixed(3)} against a limit of ${PLATEAU_RATIO}.`,
        `Series: ${series}.`,
      ].join(' '),
    ).toBeLessThanOrEqual(baseline * PLATEAU_RATIO);
  });
});
