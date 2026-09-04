/**
 * Micro-benchmarks for the hot paths. Run with `npm run bench`.
 *
 * These guard the speed wins (the per-prototype method-name cache in
 * `createSpyFromClass`, the lazy spy materialisation `provideAutoSpy` relies on)
 * against regressions and give comparable numbers vs. other auto-spy libraries.
 * They assert nothing — Vitest reports ops/sec.
 *
 * One rule for anything added here: **spell the option out**. An earlier revision
 * compared a "eager" case written as `createSpyFromClass(WideService)` against a
 * "lazy" one written as `createSpyFromClass(WideService, { lazySpies: true })`.
 * `lazySpies` defaults to `true`, so both branches were the lazy path and the
 * reported "1.79x faster" was measuring nothing but noise (±84% rme). A benchmark
 * that guards a default must never obtain that default implicitly.
 *
 * **Read the `p75` column, not `hz`.** These cases allocate spy objects by the hundred thousand, so
 * a GC pause lands in some samples and not in others: `hz` for one case swings several-fold between
 * runs — and Vitest's "N x faster" summary swings with it — while `p75` reproduces to the fourth
 * decimal. The numbers published in `docs-site/core/performance.md` are `p75`.
 *
 * **Every case ends with {@link dropCreatedMocks}, and without it these numbers measured the
 * garbage collector.** `@vitest/spy` keeps every mock it ever created in a module-level *strong*
 * `Set` — that set is what `vi.clearAllMocks()` walks — so nothing a bench case allocates is ever
 * collectable: 20 000 eager 10-method spies retained 972 MB, and forcing a GC after dropping every
 * reference released **0.0%** of it. Each case therefore allocated into a monotonically growing
 * heap it inherited from the case before, and `p75` reported whether a major GC happened to land
 * inside the sample. Two consecutive unmodified runs moved `createAutoMock + 4 accesses` **569×**
 * (5.0680 ms → 0.0089 ms), and one of them announced "eager 272.67× faster than lazy" for the case
 * the docs publish as a 7× *lazy* win.
 *
 * Vitest calls no hooks in benchmark mode — `beforeAll`, `beforeEach` and `afterAll` inside a
 * `describe` are all silently skipped, and `bench()`'s options are tinybench's `Options`, not its
 * per-task `FnOptions` — so the prune has to happen inside the timed body. It is charged to the
 * case that created the mocks, which is the honest place for it: the registry never holds more than
 * one iteration's worth, so the cost is a `Set.delete` per mock created (~50 ns) against the ~1.9 µs
 * this library spends creating each one, and it is the same fraction whatever the case allocates.
 */
import { bench, describe } from 'vitest';

// Import the public entry (not `src/lib/*` directly) so the default Vitest mock
// adapter registers as a side effect — the same wiring real consumers get.
import { createAutoMock, createSpyFromClass } from '../src/index';
import { captureMockRegistry, pruneMockRegistry } from '../src/setup';

// Captured once, at module scope: the capture works by calling `vi.clearAllMocks()` under a briefly
// patched `Set.prototype.forEach`, which is far too expensive to repeat per iteration — and by the
// time the first case runs there is nothing in the registry worth keeping anyway.
captureMockRegistry();

/**
 * Release the mocks this iteration created, so the next one starts from the same heap as this one.
 *
 * Nothing here is long-lived: every spy a case creates dies with the iteration, so an unconditional
 * prune is exactly right. Call it last in every bench body — see the file header.
 */
function dropCreatedMocks(): void {
  pruneMockRegistry();
}

/** A class with `methodCount` prototype methods — the width is what the method walk and its cache pay for. */
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

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the methods are attached at runtime, so the shape only exists after the loop above.
  return WideClass as ClassWithMethods;
}

type ClassWithMethods = new () => Record<string, () => number>;

// `Record<string, …>` is an index signature, and this repository compiles with
// `noUncheckedIndexedAccess` and `noPropertyAccessFromIndexSignature` — every lookup would be
// `| undefined` and every dot access an error, which would put optional chaining inside the timed
// bodies. These name the members the bodies actually touch, so the measurement stays the call.
interface NamedMethods {
  m0: () => unknown;
  m1: () => unknown;
  m2: () => unknown;
  m3: () => unknown;
}

type ClearableCall = ((a: object, b: object) => unknown) & { mockClear: () => void };

interface Ident {
  id: number;
}

// The raw-call floor. A `vi.fn()` control is Vitest's number and moves when Vitest does; the bare
// call does not, so ratios against it stay comparable across machines and releases. It is only ever
// measured batched — see `BATCH` below.
class PlainCallTarget {
  m0(a: Ident, b: Ident): number {
    return a.id + b.id;
  }

  m1(a: Ident, b: Ident): number {
    return a.id - b.id;
  }

  m2(a: Ident, b: Ident): number {
    return a.id * b.id;
  }
}

// The floor accumulates into this exported binding: a store nothing can read is one V8 may drop, and
// a floor optimised away would report a near-zero that poisons every ratio divided by it.
export const benchSink = { total: 0 };

// tinybench times a whole iteration, and this host quantises that at ~42 ns — 50× what three plain
// calls cost, so an unbatched floor reports the clock. Every arm of the batched case repeats `BATCH`.
const BATCH = 10_000;

// Same iteration count for every arm of a per-call block: a time budget would hand the floor arm
// orders of magnitude more samples than the arms it is the denominator for. `time: 0` makes it exact.
function fixedIterations(iterations: number): { iterations: number; time: number } {
  return { iterations, time: 0 };
}

/** Spy `WideClass` and call the first `callCount` of its methods — the shape a real `beforeEach` + test produces. */
function spyAndCall(WideClass: ClassWithMethods, lazySpies: boolean, callCount: number): void {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `Spy<T>` is a mapped type over runtime-discovered names; indexing it by a computed key needs the dynamic shape.
  const spy = createSpyFromClass(WideClass, { lazySpies }) as unknown as Record<string, () => unknown>;

  for (let index = 0; index < callCount; index += 1) {
    spy[`m${index}`]?.();
  }

  dropCreatedMocks();
}

const WIDE = makeWideClass(10);
const HUGE = makeWideClass(40);

/** `WIDE` seen as a class whose `m2` is declared and takes the argument the dispatch case configures. */
const DISPATCH = WIDE as unknown as new () => { m2: (arg: number) => number };

interface LazyCase {
  label: string;
  WideClass: ClassWithMethods;
  callCount: number;
}

// A service is spied per test but a test touches few of its methods — that ratio is the whole
// argument for `lazySpies`, so it is what gets measured. The last row of each width is the
// worst case (every method called), where lazy has nothing left to skip and should reach parity.
const LAZY_CASES: LazyCase[] = [
  { label: '10 methods, 0 called', WideClass: WIDE, callCount: 0 },
  { label: '10 methods, 2 called', WideClass: WIDE, callCount: 2 },
  { label: '10 methods, all 10 called', WideClass: WIDE, callCount: 10 },
  { label: '40 methods, 3 called', WideClass: HUGE, callCount: 3 },
  { label: '40 methods, all 40 called', WideClass: HUGE, callCount: 40 },
];

describe('createSpyFromClass', () => {
  // Repeated spying of the SAME class is the realistic `beforeEach` pattern —
  // exercises the per-prototype method-name cache.
  bench('spy a wide class (repeated, same class)', () => {
    createSpyFromClass(WIDE);
    dropCreatedMocks();
  });
});

// `lazySpies` defaults to `true` and `provideAutoSpy` inherits that default; these rows are what
// justifies it. Both options are passed explicitly — see the file header for why that matters.
LAZY_CASES.forEach(({ label, WideClass, callCount }) => {
  describe(`lazy vs eager — ${label}`, () => {
    bench('eager (lazySpies: false)', () => {
      spyAndCall(WideClass, false, callCount);
    });

    bench('lazy (lazySpies: true, the default)', () => {
      spyAndCall(WideClass, true, callCount);
    });
  });
});

describe('createAutoMock (type-only, lazy Proxy)', () => {
  bench('create + access 4 methods', () => {
    const mock = createAutoMock<NamedMethods>();

    mock.m0();
    mock.m1();
    mock.m2();
    mock.m3();

    dropCreatedMocks();
  });
});

describe('spy invocation', () => {
  // What a spy costs *per call*, as opposed to per creation — the number to hold against the cost
  // of the same bookkeeping done anywhere other than in JS. The spy is created at module scope and
  // the body only calls it, like the `calledWith` case below.
  //
  // `mockClear()` is charged into the body on purpose. `@vitest/spy` retains every call it ever
  // records, so without it this case would measure an argument array growing past a hundred million
  // entries and the GC pauses that follow, not a call. It is the same trade `dropCreatedMocks()`
  // makes in the creation cases: the bookkeeping a real `beforeEach` does anyway, charged to the
  // case that caused it.
  const spy = createSpyFromClass(WIDE) as unknown as Record<'m0' | 'm1' | 'm2', ClearableCall>;
  const argA = { id: 1 };
  const argB = { id: 2 };

  bench('unconfigured call, two object arguments (x3)', () => {
    spy.m0(argA, argB);
    spy.m1(argA, argB);
    spy.m2(argA, argB);

    spy.m0.mockClear();
    spy.m1.mockClear();
    spy.m2.mockClear();
  }, fixedIterations(400_000));
});

describe('calledWith dispatch', () => {
  // The one case whose spy outlives its iterations: it is created here, at module scope, and the
  // body only calls it. Nothing inside the body allocates a mock, so there is nothing to prune.
  const spy = createSpyFromClass(DISPATCH);

  spy.m2.calledWith(1).mockReturnValue(11);
  spy.m2.calledWith(2).mockReturnValue(22);

  bench('configured calledWith lookup (serialized args)', () => {
    spy.m2(1);
    spy.m2(2);
    spy.m2(3);
  }, fixedIterations(800_000));
});

// Both arms carry the identical `BATCH`, so the ratio between them is exact where the per-call cases
// above cannot have one: a plain call is far under the clock's resolution and only a batch clears it.
describe(`spy call against a plain call — batched, every figure is one batch of ${BATCH} (not one call)`, () => {
  const spy = createSpyFromClass(WIDE) as unknown as Record<'m0' | 'm1' | 'm2', ClearableCall>;
  const plain = new PlainCallTarget();
  const argA = { id: 1 };
  const argB = { id: 2 };

  bench(`plain method call (no double), two object arguments (x3 per repeat, x${BATCH} per iteration)`, () => {
    let total = 0;

    for (let index = 0; index < BATCH; index += 1) {
      // Varies the argument so V8 cannot hoist these calls out as loop-invariant and leave an empty
      // loop behind; the spy arm repeats the store for nothing, so that both loops stay identical.
      argA.id = index;

      total += plain.m0(argA, argB) + plain.m1(argA, argB) + plain.m2(argA, argB);
    }

    benchSink.total += total;
  }, fixedIterations(500));

  bench(`spy call, two object arguments (x3 per repeat, x${BATCH} per iteration)`, () => {
    for (let index = 0; index < BATCH; index += 1) {
      argA.id = index;

      spy.m0(argA, argB);
      spy.m1(argA, argB);
      spy.m2(argA, argB);
    }

    // Once per batch, not once per call: the recorded arguments have to be dropped or this grows
    // without bound, and amortising the clear over `BATCH` keeps the arm a measurement of the call.
    spy.m0.mockClear();
    spy.m1.mockClear();
    spy.m2.mockClear();
  }, fixedIterations(500));
});
