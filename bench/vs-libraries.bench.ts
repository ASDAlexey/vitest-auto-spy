/**
 * Head-to-head micro-benchmarks against the other libraries. Run with `npm run bench:vs`.
 *
 * `auto-spy.bench.ts` measures this package against itself — lazy against eager, one option against
 * another. This file measures it against the field, and it exists because a "we are faster" line in
 * a README is worth nothing unless the other library's code actually ran.
 *
 * **Everything runs on one runner.** Every contender here creates its doubles out of Vitest's own
 * `vi.fn()`, so the runner's per-mock cost is a constant shared by all of them and what the numbers
 * separate is the library's own overhead on top. That is the only way a cross-library number means
 * anything: run `jest-auto-spies` on Jest and this package on Vitest and the table reports the two
 * runners, not the two libraries.
 *
 * **`jest-auto-spies` is measured through `@bugsplat/vitest-auto-spies`, and that is not a
 * substitution.** Both depend on `@hirez_io/auto-spies-core@3.0.0` and both hand it the same three
 * arguments; the two `dist/create-function-spy.js` files are line-for-line identical apart from
 * `jest.fn()` against `vi.fn()`, and the two `dist/create-spy-from-class.js` files apart from
 * `jest.spyOn` against `vi.spyOn`. The algorithm under test — `createAutoSpyFromClass`, which walks
 * the prototype chain with `Object.getOwnPropertyDescriptors` on every call, memoises nothing, and
 * builds a spy for every method it finds whether or not the test touches it — is the same object
 * file in both packages. Verified against the published tarballs on 2026-09-03.
 *
 * **The class-reading rows and the type-reading rows are separate `describe`s on purpose.** Vitest
 * prints an "N× faster" summary per describe, and putting `createSpyFromClass` (reads a real
 * prototype) next to `mock<T>()` (a Proxy that reads nothing) in one block would announce a winner
 * for a race in which the two ran different distances. Compare within a block; across blocks, read
 * what the operation is.
 *
 * The two rules inherited from `auto-spy.bench.ts` apply here unchanged, and both are load-bearing:
 *
 * - **Read the `p75` column, not `hz`.** These cases allocate by the hundred thousand, so a GC pause
 *   lands in some samples and not others; `hz` — and the "N× faster" summary built from it — swings
 *   several-fold between runs, while `p75` reproduces to the fourth decimal.
 * - **Every body ends with {@link dropCreatedMocks}.** `@vitest/spy` keeps every mock it ever made in
 *   a module-level *strong* `Set`, so without the prune each case allocates into a monotonically
 *   growing heap it inherited from the case before and `p75` reports whether a major GC happened to
 *   land inside the sample. The prune is charged to the case that created the mocks, which is the
 *   honest place for it — and it is charged identically to every contender, since they all register
 *   in the same set.
 */
import { createRequire } from 'node:module';

import { bench, describe, vi } from 'vitest';

import { createSpyFromClass as hirezCreateSpyFromClass } from '@bugsplat/vitest-auto-spies';
import { createMock as golevelupCreateMock } from '@golevelup/ts-vitest';
import { mock as vmxMock, mockDeep as vmxMockDeep } from 'vitest-mock-extended';

import { installRunnerGlobals } from './runner-globals';

// The public entry, not `src/lib/*` — so the default Vitest mock adapter registers as a side
// effect, exactly as it does for a consumer.
import { createAutoMock, createSpyFromClass, mockDeep } from '../src/index';
import { captureMockRegistry, pruneMockRegistry } from '../src/setup';

// Captured once at module scope: the capture patches `Set.prototype.forEach` for the length of one
// `vi.clearAllMocks()`, far too expensive to repeat per iteration.
installRunnerGlobals();

// `jest-auto-spies` and `jasmine-auto-spies` are CommonJS and their declarations reference ambient
// `jest` / `jasmine` type packages this repository does not install. `createRequire` loads them for
// what the bench needs — the factory — without pulling those globals into the type program.
const requireCjs = createRequire(import.meta.url);

type ClassSpyFactory = (ObjectClass: ClassWithMethods) => AnyMethods;

const jestAutoSpies = requireCjs('jest-auto-spies') as { createSpyFromClass: ClassSpyFactory };
const jasmineAutoSpies = requireCjs('jasmine-auto-spies') as { createSpyFromClass: ClassSpyFactory };

captureMockRegistry();

/** Release the mocks this iteration created, so the next one starts from the same heap. */
function dropCreatedMocks(): void {
  pruneMockRegistry();
}

type AnyMethods = Record<string, (...args: unknown[]) => unknown>;
type ClassWithMethods = new () => AnyMethods;

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

/**
 * The three widths are measured, not chosen.
 *
 * Across four private Angular suites — ~2 700 spec files, 2 742 doubles built from a class — the
 * service a spec doubles has **5–8** methods at the median, **12–16** at the p75 and **32–44** at
 * the p90, the widest being 79. The spec then touches **1** of them at the median and **2** at the
 * p90: 5–6 % of what it built. So `SMALL` is the median service, `MEDIUM` the p75 and `LARGE` the
 * p90, and the call counts are that survey's median and p90 rather than a number that flatters
 * anybody.
 */
const SMALL = makeWideClass(6);
const MEDIUM = makeWideClass(14);
const LARGE = makeWideClass(45);

// `AnyMethods` is an index signature, and this repository compiles with `noUncheckedIndexedAccess`
// and `noPropertyAccessFromIndexSignature`. Naming `m2` keeps optional chaining out of the timed
// bodies, so the dispatch case measures the dispatch and not a null check.
interface DispatchTarget {
  m2: (arg: number) => number;
}

type CalledWithDouble = {
  m2: ((arg: number) => unknown) & { calledWith: (arg: number) => { mockReturnValue: (value: number) => void } };
};

const DISPATCH = MEDIUM as unknown as new () => DispatchTarget;

/** The double a developer writes by hand when they skip the libraries entirely — the floor. */
function handWritten(methodCount: number): AnyMethods {
  const double: AnyMethods = {};

  for (let index = 0; index < methodCount; index += 1) {
    double[`m${index}`] = vi.fn();
  }

  return double;
}

/** Call the first `callCount` methods of a double — the part a test actually uses. */
function callFirst(double: AnyMethods, callCount: number): void {
  for (let index = 0; index < callCount; index += 1) {
    double[`m${index}`]?.();
  }
}

/**
 * Every arm in a block runs the SAME number of iterations, not the same number of milliseconds.
 *
 * tinybench's default is a fixed time budget, which gives a faster arm more iterations — and these
 * cases allocate, so garbage collection scales with the number of doubles created rather than with
 * elapsed time. Equal time therefore means unequal GC exposure, and the faster arm pays for its own
 * speed. Equal iterations puts every arm through the same amount of allocation. `time: 0` makes the
 * iteration count exact rather than a floor.
 *
 * The per-block counts are sized from the measured margin of error, aiming at roughly ±14% on the
 * worst arm in that block — not multiplied uniformly, which over-samples the cheap blocks and buys
 * a precision nothing here needs. Re-derive them from a full run's `rme` if a case changes shape.
 */

/**
 * `BENCH_SCALE` multiplies every budget — below 1 for a quick pass while editing this file, above 1
 * for a slower one. It never affects fairness: it scales all arms in a block identically, so the
 * counts stay equal, which is the property the comparison rests on.
 */
const SCALE = Math.max(0.05, Number(process.env['BENCH_SCALE'] ?? 1) || 1);

function fixedIterations(iterations: number): { iterations: number; time: number } {
  return { iterations: Math.max(200, Math.round(iterations * SCALE)), time: 0 };
}

interface ClassCase {
  label: string;
  WideClass: ClassWithMethods;
  methodCount: number;
  callCount: number;
  iterations: number;
}

/**
 * `methodCount` is how wide the class is; `callCount` is how many of its methods the test then
 * touches. One iteration is one test — build the double, call that many methods, drop it.
 *
 * `10 methods, 2 called` is this spec:
 *
 * ```ts
 * class OrderService {           // ten methods on the prototype
 *   validate() {}
 *   save() {}
 *   // …eight more
 * }
 *
 * beforeEach(() => {
 *   orders = createSpyFromClass(OrderService);   // ← the double is built here
 * });
 *
 * it('saves a validated order', () => {
 *   checkout(orders);
 *   expect(orders.validate).toHaveBeenCalled();  // ← method 1 of 10
 *   expect(orders.save).toHaveBeenCalled();      // ← method 2 of 10
 * });                                            //   the other eight are never touched
 * ```
 *
 * That ratio is the entire argument for building spies lazily: eight of the ten are never needed, so
 * an eager library pays for them and a lazy one does not. `all 10 called` is the same class in a test
 * that really does use every method — the worst case for this package, where there is nothing left
 * to skip and the laziness machinery is paid for with nothing to show. Both are measured, and both
 * are published, because quoting only the first would be a lie by omission.
 *
 * The 40-method rows are the same question on a class that is wide by construction — a generated API
 * client, an ngrx facade, a `Store` double.
 */
const CLASS_CASES: ClassCase[] = [
  { label: 'small project — 6 methods, 1 called', WideClass: SMALL, methodCount: 6, callCount: 1, iterations: 45_000 },
  { label: 'medium project — 14 methods, 2 called', WideClass: MEDIUM, methodCount: 14, callCount: 2, iterations: 35_000 },
  { label: 'large project — 45 methods, 2 called', WideClass: LARGE, methodCount: 45, callCount: 2, iterations: 18_000 },
  { label: 'worst case — 14 methods, all 14 called', WideClass: MEDIUM, methodCount: 14, callCount: 14, iterations: 15_000 },
  { label: 'worst case — 45 methods, all 45 called', WideClass: LARGE, methodCount: 45, callCount: 45, iterations: 4_500 },
];

// ---------------------------------------------------------------------------------------------
// A double built from a real class — the `beforeEach` of every spec that has a service in it.
// Only two libraries in the field read a class at all; the hand-written object is the control.
// ---------------------------------------------------------------------------------------------
CLASS_CASES.forEach(({ label, WideClass, methodCount, callCount, iterations }) => {
  describe(`${label} — double from a class`, () => {
    bench('vitest-auto-spy: createSpyFromClass', () => {
      callFirst(createSpyFromClass(WideClass) as unknown as AnyMethods, callCount);
      dropCreatedMocks();
    }, fixedIterations(iterations));

    bench('@bugsplat/vitest-auto-spies', () => {
      callFirst(hirezCreateSpyFromClass(WideClass) as unknown as AnyMethods, callCount);
      dropCreatedMocks();
    }, fixedIterations(iterations));

    bench('jest-auto-spies', () => {
      callFirst(jestAutoSpies.createSpyFromClass(WideClass), callCount);
      dropCreatedMocks();
    }, fixedIterations(iterations));

    bench('jasmine-auto-spies', () => {
      callFirst(jasmineAutoSpies.createSpyFromClass(WideClass), callCount);
      dropCreatedMocks();
    }, fixedIterations(iterations));

    bench('hand-written vi.fn() per method', () => {
      callFirst(handWritten(methodCount), callCount);
      dropCreatedMocks();
    }, fixedIterations(iterations));
  });
});

interface TypeCase {
  label: string;
  callCount: number;
  iterations: number;
}

/**
 * A type-driven double reads no prototype, so its cost scales with the members a test *touches* and
 * not with the width of anything. The three counts bracket the same range the class widths do, and
 * carry the same three labels, so a reader can hold one project size in mind across both families.
 */
const TYPE_CASES: TypeCase[] = [
  { label: 'small project — 2 members touched', callCount: 2, iterations: 295_000 },
  { label: 'medium project — 10 members touched', callCount: 10, iterations: 30_000 },
  { label: 'large project — 40 members touched', callCount: 40, iterations: 8_000 },
];

// ---------------------------------------------------------------------------------------------
// A double built from a type. Nothing here reads a class, so all four do the same amount of work
// and the comparison is apples to apples — this is the block where the deep-Proxy libraries live.
// ---------------------------------------------------------------------------------------------
TYPE_CASES.forEach(({ label, callCount, iterations }) => {
  describe(`${label} — double from a type`, () => {
    bench('vitest-auto-spy: createAutoMock<T>()', () => {
      callFirst(createAutoMock<AnyMethods>() as AnyMethods, callCount);
      dropCreatedMocks();
    }, fixedIterations(iterations));

    bench('vitest-mock-extended: mock<T>()', () => {
      callFirst(vmxMock<AnyMethods>() as unknown as AnyMethods, callCount);
      dropCreatedMocks();
    }, fixedIterations(iterations));

    bench('@golevelup/ts-vitest: createMock<T>()', () => {
      callFirst(golevelupCreateMock<AnyMethods>() as unknown as AnyMethods, callCount);
      dropCreatedMocks();
    }, fixedIterations(iterations));
  });
});

interface Nested {
  level1: { level2: { level3: { leaf: () => number } } };
}

// ---------------------------------------------------------------------------------------------
// Recursive doubles — three levels down and a call at the leaf.
// ---------------------------------------------------------------------------------------------
describe('any size — deep double, 3 levels, leaf called', () => {
  bench('vitest-auto-spy: mockDeep<T>()', () => {
    mockDeep<Nested>().level1.level2.level3.leaf();
    dropCreatedMocks();
  }, fixedIterations(116_000));

  bench('vitest-mock-extended: mockDeep<T>()', () => {
    vmxMockDeep<Nested>().level1.level2.level3.leaf();
    dropCreatedMocks();
  }, fixedIterations(116_000));

  bench('@golevelup/ts-vitest: createMock<T>() (deep by default)', () => {
    golevelupCreateMock<Nested>().level1.level2.level3.leaf();
    dropCreatedMocks();
  }, fixedIterations(116_000));
});

/** Configure `m0` to return a value, then call it three times. */
function configureAndCall(double: AnyMethods): void {
  (double['m0'] as unknown as { mockReturnValue: (value: number) => void }).mockReturnValue(1);

  double['m0']?.();
  double['m0']?.();
  double['m0']?.();
}

// ---------------------------------------------------------------------------------------------
// Configure a return and call through it — the second half of every test. Split by what the double
// was built from, for the reason given in the file header: the class-reading libraries walk a
// prototype before they can configure anything and the Proxy libraries do not, so one block holding
// all four would report the difference between the two *operations* under the heading of a race.
// ---------------------------------------------------------------------------------------------
describe('any size — configure a return + 3 calls, double from a class', () => {
  bench('vitest-auto-spy: createSpyFromClass', () => {
    configureAndCall(createSpyFromClass(MEDIUM) as unknown as AnyMethods);
    dropCreatedMocks();
  }, fixedIterations(51_000));

  bench('@bugsplat/vitest-auto-spies', () => {
    configureAndCall(hirezCreateSpyFromClass(MEDIUM) as unknown as AnyMethods);
    dropCreatedMocks();
  }, fixedIterations(51_000));

  bench('jest-auto-spies', () => {
    configureAndCall(jestAutoSpies.createSpyFromClass(MEDIUM));
    dropCreatedMocks();
  }, fixedIterations(51_000));

  bench('hand-written vi.fn() per method', () => {
    configureAndCall(handWritten(14));
    dropCreatedMocks();
  }, fixedIterations(51_000));
});

describe('any size — configure a return + 3 calls, double from a type', () => {
  bench('vitest-auto-spy: createAutoMock<T>()', () => {
    configureAndCall(createAutoMock<AnyMethods>() as AnyMethods);
    dropCreatedMocks();
  }, fixedIterations(292_000));

  bench('vitest-mock-extended: mock<T>()', () => {
    configureAndCall(vmxMock<AnyMethods>() as unknown as AnyMethods);
    dropCreatedMocks();
  }, fixedIterations(292_000));

  bench('@golevelup/ts-vitest: createMock<T>()', () => {
    configureAndCall(golevelupCreateMock<AnyMethods>() as unknown as AnyMethods);
    dropCreatedMocks();
  }, fixedIterations(292_000));
});

// ---------------------------------------------------------------------------------------------
// `calledWith` dispatch. The doubles are built at module scope and the bodies only call them, so
// nothing here allocates a mock and there is nothing to prune — the number is pure dispatch.
// Two configured argument sets and one miss, which is the shape a real spec produces.
// ---------------------------------------------------------------------------------------------
describe('any size — calledWith dispatch, 2 configured, 1 miss', () => {
  const ours = createSpyFromClass(DISPATCH);
  ours.m2.calledWith(1).mockReturnValue(11);
  ours.m2.calledWith(2).mockReturnValue(22);

  const hirez = hirezCreateSpyFromClass(DISPATCH) as unknown as CalledWithDouble;
  hirez.m2.calledWith(1).mockReturnValue(11);
  hirez.m2.calledWith(2).mockReturnValue(22);

  const vmx = vmxMock<DispatchTarget>() as unknown as CalledWithDouble;
  vmx.m2.calledWith(1).mockReturnValue(11);
  vmx.m2.calledWith(2).mockReturnValue(22);

  bench('vitest-auto-spy', () => {
    ours.m2(1);
    ours.m2(2);
    ours.m2(3);
  }, fixedIterations(1_152_000));

  bench('@bugsplat/vitest-auto-spies', () => {
    hirez.m2(1);
    hirez.m2(2);
    hirez.m2(3);
  }, fixedIterations(1_152_000));

  bench('vitest-mock-extended', () => {
    vmx.m2(1);
    vmx.m2(2);
    vmx.m2(3);
  }, fixedIterations(1_152_000));
});
