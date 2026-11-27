import { setImmediate } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';

// The public entry, not `src/lib/*` — importing it is what registers the default Vitest mock
// adapter, so the doubles here are built exactly as a consumer's are.
import { createSpyFromClass, resetAutoSpy } from '../index';
import { captureMockRegistry, pruneMockRegistry } from '../setup';

type AnyMethods = Record<string, (...args: unknown[]) => unknown>;
type ClassWithMethods = new () => AnyMethods;

/** The smaller population. */
const SMALL_COUNT = 500;

/** The larger one, exactly 4×: linear predicts ~4, quadratic ~16, and the gap between them is the test. */
const LARGE_COUNT = SMALL_COUNT * 4;

const METHOD_COUNT = 10;

/** Samples kept per arm and per size. Odd, so the median is an observed value rather than an average of two. */
const REPS = 9;

/** Samples discarded first — JIT tiering, inline caches and the first pass over cold memory. */
const WARMUP_REPS = 3;

/**
 * Ceiling on time(4N) / time(N).
 *
 * Linear is 4 and quadratic is 16; 6 sits far enough above 4 to absorb a noisy shared runner and far
 * enough below 16 that no quadratic path can slip under it. Tightening this towards 4 would be
 * measuring the runner's scheduler, not the library.
 */
const MAX_GROWTH = 6;

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

/** A population whose methods are all materialised and all recorded — teardown has nothing to do to a lazy method nobody touched. */
function buildPopulation(WideClass: ClassWithMethods, count: number): AnyMethods[] {
  const doubles: AnyMethods[] = new Array<AnyMethods>(count);

  for (let index = 0; index < count; index += 1) {
    const double = createSpyFromClass(WideClass) as unknown as AnyMethods;

    for (let method = 0; method < METHOD_COUNT; method += 1) {
      double[`m${method}`]?.(index);
    }

    doubles[index] = double;
  }

  return doubles;
}

interface Arm {
  readonly label: string;
  readonly tearDown: (doubles: readonly AnyMethods[]) => void;
}

const ARMS: readonly Arm[] = [
  {
    label: 'vi.clearAllMocks() (run-wide sweep)',
    tearDown: () => vi.clearAllMocks(),
  },
  {
    label: 'resetAutoSpy() per double',
    tearDown: (doubles) => {
      for (const double of doubles) {
        resetAutoSpy(double);
      }
    },
  },
];

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);

  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function timeOnce(arm: Arm, WideClass: ClassWithMethods, count: number): Promise<number> {
  await setImmediate();
  pruneMockRegistry();
  vi.clearAllMocks();
  globalThis.gc?.();
  const doubles = buildPopulation(WideClass, count);
  const probe = doubles.at(-1)?.['m0'];
  expect(probe).toHaveBeenCalledExactlyOnceWith(count - 1);
  const started = performance.now();

  arm.tearDown(doubles);

  const elapsed = performance.now() - started;
  expect(probe).not.toHaveBeenCalled();

  return elapsed;
}

describe('architecture invariant: teardown shape', () => {
  const WideClass = makeWideClass(METHOD_COUNT);
  captureMockRegistry();

  for (const arm of ARMS) {
    it(`grows no worse than linearly from ${SMALL_COUNT} to ${LARGE_COUNT} doubles — ${arm.label}`, async () => {
      const smallSamples: number[] = [];
      const largeSamples: number[] = [];
      const ratios: number[] = [];

      // Interleaved rather than one size after the other: a runner that slows down midway through
      // would otherwise land entirely on whichever size was measured last, and show up as growth.
      for (let rep = 0; rep < WARMUP_REPS + REPS; rep += 1) {
        const smallFirst = rep % 2 === 0;
        const first = await timeOnce(arm, WideClass, smallFirst ? SMALL_COUNT : LARGE_COUNT);
        const second = await timeOnce(arm, WideClass, smallFirst ? LARGE_COUNT : SMALL_COUNT);
        const [smallMs, largeMs] = smallFirst ? [first, second] : [second, first];

        if (rep >= WARMUP_REPS) {
          smallSamples.push(smallMs);
          largeSamples.push(largeMs);
          ratios.push(largeMs / smallMs);
        }
      }

      const smallMedian = median(smallSamples);
      const largeMedian = median(largeSamples);
      const growth = median(ratios);

      // eslint-disable-next-line vitest-auto-spy/no-console-in-spec -- the measurements are this invariant's report
      console.log(
        `teardown shape — ${arm.label}: ${SMALL_COUNT} → ${smallMedian.toFixed(3)} ms, ` +
          `${LARGE_COUNT} → ${largeMedian.toFixed(3)} ms, growth ${growth.toFixed(2)}× (limit ${MAX_GROWTH}×)`,
      );

      expect(smallMedian, 'the smaller population measured as zero — raise the sample size, the ratio below is noise').toBeGreaterThan(0);

      expect(
        growth,
        `teardown cost grew ${growth.toFixed(2)}× for 4× the doubles (${arm.label}): ` +
          `${SMALL_COUNT} → ${smallMedian.toFixed(3)} ms, ${LARGE_COUNT} → ${largeMedian.toFixed(3)} ms. ` +
          'Linear is ~4×, quadratic ~16×.',
      ).toBeLessThan(MAX_GROWTH);
    });
  }
});
