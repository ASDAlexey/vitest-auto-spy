/**
 * Architecture invariant: the teardown path's cost grows with the number of doubles at worst
 * linearly. Run with `npm run test:invariants`.
 *
 * Teardown is the one part of a spy library that every test pays for and no test measures, and it is
 * where an accidental quadratic hides best: a per-spy reset that also walks a registry of every spy
 * in the run looks correct, passes every behavioural test, and turns a suite of 5 000 doubles into a
 * suite that takes minutes to tear down. The two paths measured here are the two a consumer can
 * reach: the run-wide sweep (`vi.clearAllMocks()`, which `clearMocks: true` also goes through) and
 * this library's own per-spy `resetAutoSpy`.
 *
 * The assertion is **shape, not magnitude** — the ratio between the cost at N and at 4N, from the
 * same process, in the same interleaved sampling loop. Linear lands near 4, quadratic near 16, and
 * anything below {@link MAX_GROWTH} is a curve a suite can live with. No millisecond figure appears
 * in an assertion, because on a shared CI runner a millisecond figure is a measurement of the
 * runner.
 */
import { describe, expect, it, vi } from 'vitest';

// The public entry, not `src/lib/*` — importing it is what registers the default Vitest mock
// adapter, so the doubles here are built exactly as a consumer's are.
import { createSpyFromClass, resetAutoSpy } from '../index';

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
 * How many run-wide sweeps one `clearAllMocks` sample performs.
 *
 * The sweep is meant to be O(1) in the number of doubles — an integer epoch bump plus a walk of the
 * runner's own registry — so a single call lands near the resolution of `performance.now()`, where a
 * ratio is a measurement of the clock. Repeating it lifts the sample into milliseconds without
 * changing what is being compared.
 */
const CLEAR_SWEEPS = 50_000;

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
    tearDown: () => {
      for (let sweep = 0; sweep < CLEAR_SWEEPS; sweep += 1) {
        vi.clearAllMocks();
      }
    },
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

function timeOnce(arm: Arm, doubles: readonly AnyMethods[]): number {
  const started = performance.now();

  arm.tearDown(doubles);

  return performance.now() - started;
}

describe('architecture invariant: teardown shape', () => {
  const WideClass = makeWideClass(METHOD_COUNT);
  const small = buildPopulation(WideClass, SMALL_COUNT);
  const large = buildPopulation(WideClass, LARGE_COUNT);

  for (const arm of ARMS) {
    it(`grows no worse than linearly from ${SMALL_COUNT} to ${LARGE_COUNT} doubles — ${arm.label}`, () => {
      const smallSamples: number[] = [];
      const largeSamples: number[] = [];

      // Interleaved rather than one size after the other: a runner that slows down midway through
      // would otherwise land entirely on whichever size was measured last, and show up as growth.
      for (let rep = 0; rep < WARMUP_REPS + REPS; rep += 1) {
        const smallMs = timeOnce(arm, small);
        const largeMs = timeOnce(arm, large);

        if (rep >= WARMUP_REPS) {
          smallSamples.push(smallMs);
          largeSamples.push(largeMs);
        }
      }

      const smallMedian = median(smallSamples);
      const largeMedian = median(largeSamples);
      const growth = largeMedian / smallMedian;

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
