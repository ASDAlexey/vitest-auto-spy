/**
 * The `.and` and `.calls` namespaces a jasmine spec expects on every spy.
 *
 * Loaded only by the `vitest-auto-spy/jasmine` entry — see `jasmine-support.ts` for why this is a
 * registry rather than a direct import.
 *
 * Everything here is written against the {@link MockAdapter}, never against Vitest, so the same
 * namespaces work unchanged on Vitest, Bun and `node:test`. The two jasmine surfaces map onto the
 * adapter almost exactly:
 *
 * - a `.and` **strategy** replaces the implementation → `restoreImplementation`;
 * - `.calls` **bookkeeping** reads recorded calls → `getCalls` / `clear`.
 *
 * Both namespaces are installed as memoised, non-enumerable getters. A wide service is forty spies,
 * a spec configures three of them, and building fifteen closures per spy up front is the kind of
 * cost that shows up in the benchmark suite — so a spy that is never configured through `.and` pays
 * one property definition and allocates nothing.
 */
import type { JasmineSpyHooks } from './jasmine-support';
import { getMockAdapter } from './mock-adapter';
import type { MockFn } from './mock-adapter';
import type { Func } from './types';

/**
 * One recorded call, in jasmine's shape.
 *
 * `object` and `returnValue` are best-effort: the adapter normalises recorded calls down to their
 * argument tuples, which is all the core ever needs, so these two are read off the host mock's own
 * bookkeeping when it keeps any. Vitest and Bun both do; `node:test` records the result on the call
 * entry instead, and that shape is read too. Where a runner keeps neither, the field is `undefined`
 * rather than absent — a spec that asserts on it sees a missing value, not a missing property.
 */
export interface JasmineCallInfo {
  object: unknown;
  args: unknown[];
  returnValue: unknown;
}

/**
 * The host runner's own call record, in whichever of the two shapes the runner keeps it.
 *
 * Vitest and Bun keep a parallel `results` array; `node:test` hangs the outcome off the call entry.
 * The {@link MockAdapter} normalises calls down to their argument tuples, which is all the core ever
 * needs, so this is the one place that looks past it — and only for the two fields jasmine's
 * `CallInfo` carries that the adapter does not.
 */
interface HostMock {
  results?: { value?: unknown }[];
  instances?: unknown[];
  calls?: { result?: unknown }[];
}

/** The host mock's own record, or `undefined` on a runner that keeps none. */
function readHostMock(spy: MockFn): HostMock | undefined {
  const mock: unknown = Reflect.get(spy, 'mock');

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- every field of `HostMock` is optional and every read below is guarded, so this narrows an untyped bag rather than asserting a shape.
  return typeof mock === 'object' && mock !== null ? (mock as HostMock) : undefined;
}

/** The value a host mock recorded as the result of call `index`, or `undefined` when it records none. */
function readReturnValue(spy: MockFn, index: number): unknown {
  const mock = readHostMock(spy);

  if (mock?.results) {
    return mock.results[index]?.value;
  }

  if (Array.isArray(mock?.calls)) {
    return mock.calls[index]?.result;
  }

  return undefined;
}

/** The receiver a host mock recorded for call `index`, or `undefined` when it records none. */
function readThis(spy: MockFn, index: number): unknown {
  return readHostMock(spy)?.instances?.[index];
}

/**
 * Turn whatever `.and.throwError` was handed into the error it should throw.
 *
 * jasmine accepts a message, an `Error`, or an error *class* plus a message; all three appear in
 * real suites and all three are cheap to keep.
 */
export function toThrownError(value: unknown, message?: string): unknown {
  if (typeof value === 'string') {
    return new Error(value);
  }

  if (typeof value === 'function') {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- jasmine's third `throwError` form is `(ErrorClass, message)`; the class is only known at runtime.
    return new (value as any)(message);
  }

  return value;
}

/** The helpers a spy already carries that `.and` re-publishes under jasmine's name. */
const DELEGATED_HELPERS = [
  // Promise helpers — always attached by `createFunctionSpy`.
  'resolveWith',
  'rejectWith',
  'resolveWithPerCall',
  // Observable helpers — present only once `vitest-auto-spy/rxjs` has been imported.
  'nextWith',
  'nextOneTimeWith',
  'nextWithValues',
  'nextWithPerCall',
  'throwWith',
  'complete',
  'returnSubject',
] as const;

/** Copy every helper the source actually has onto `target`, bound to the source. */
function delegateHelpers(target: Record<string, unknown>, source: object): void {
  for (const name of DELEGATED_HELPERS) {
    const helper: unknown = Reflect.get(source, name);

    if (typeof helper === 'function') {
      target[name] = helper.bind(source);
    }
  }
}

/**
 * jasmine's strategy namespace: the members that *replace* what the spy does.
 *
 * Every one of them installs an implementation, so — exactly as in jasmine, and exactly as
 * `mockReturnValue` already does here — a `calledWith` chain configured beforehand stops deciding
 * the value. {@link JasmineAnd.callThrough} is the way back.
 */
function buildStrategies(spy: MockFn, hooks: JasmineSpyHooks): Record<string, unknown> {
  const install = (implementation: Func): MockFn => {
    getMockAdapter().restoreImplementation(spy, implementation);

    return spy;
  };

  return {
    identity: hooks.name,

    returnValue: (value: unknown): MockFn => install(() => value),

    returnValues: (...values: unknown[]): MockFn => {
      let index = 0;

      return install(() => values[index++]);
    },

    callFake: (fake: Func): MockFn => install(fake),

    callThrough: (): MockFn => {
      hooks.restoreDispatch();

      return spy;
    },

    stub: (): MockFn => install(() => undefined),

    throwError: (value: unknown, message?: string): MockFn =>
      install(() => {
        throw toThrownError(value, message);
      }),

    resolveTo: (value?: unknown): MockFn => install(() => Promise.resolve(value)),
  };
}

/** jasmine's bookkeeping namespace: everything a spec asks about the calls that happened. */
function buildCalls(spy: MockFn): Record<string, unknown> {
  const recorded = (): readonly unknown[][] => getMockAdapter().getCalls(spy);
  const infoOf = (args: readonly unknown[], index: number): JasmineCallInfo => ({
    object: readThis(spy, index),
    args: [...args],
    returnValue: readReturnValue(spy, index),
  });
  const at = (index: number): JasmineCallInfo | undefined => {
    const args = recorded()[index];

    return args === undefined ? undefined : infoOf(args, index);
  };

  return {
    any: (): boolean => recorded().length > 0,
    count: (): number => recorded().length,
    argsFor: (index: number): unknown[] => [...(recorded()[index] ?? [])],
    allArgs: (): unknown[][] => recorded().map((args) => [...args]),
    all: (): JasmineCallInfo[] => recorded().map(infoOf),
    first: (): JasmineCallInfo | undefined => at(0),
    mostRecent: (): JasmineCallInfo | undefined => at(recorded().length - 1),
    thisFor: (index: number): unknown => readThis(spy, index),
    reset: (): void => {
      getMockAdapter().clear(spy);
    },
    /**
     * A no-op, deliberately.
     *
     * jasmine copies call arguments defensively so a spec can assert on an object the code under
     * test mutated afterwards. Vitest, Bun and `node:test` all keep the reference; snapshotting every
     * argument of every call to match would slow down every spy in the suite to serve a helper that
     * appears in a handful of specs. Kept callable so a migrated spec still runs.
     *
     * Where the object *is* mutated later, take the copy at the call:
     * `spy.mockImplementation((payload) => { seen.push(structuredClone(payload)); })`. `captureArg`
     * is not the tool for this — it records the reference the assertion matched, so it repairs the
     * reach, not the mutation.
     */
    saveArgumentsByValue: (): void => undefined,
  };
}

/**
 * Install a memoised, non-enumerable namespace under `name`.
 *
 * Non-enumerable matters beyond tidiness: `resetAutoSpy` and the deep-mock walkers iterate a
 * double's own keys, and an enumerable `and` would be walked as if it were a member of the class
 * under test.
 */
function defineNamespace(spy: MockFn, name: string, build: () => Record<string, unknown>): void {
  let namespace: Record<string, unknown> | undefined;

  Object.defineProperty(spy, name, {
    get(): Record<string, unknown> {
      namespace ??= build();

      return namespace;
    },
    enumerable: false,
    configurable: true,
  });
}

/**
 * The `.and` of a `calledWith` chain, for `spy.withArgs(…)`.
 *
 * jasmine's `spy.withArgs(1).and.returnValue(x)` is this library's `spy.calledWith(1).returnValue(x)`
 * — the same idea with the namespace in a different place, so the chain object is simply re-published
 * under `and`.
 *
 * The one thing that does not carry over is jasmine's return value: `withArgs` there hands back a
 * *spy*, so `expect(spy.withArgs(1)).toHaveBeenCalled()` is legal jasmine and has no counterpart
 * here. Assert on the spy itself with `toHaveBeenCalledWith(1)` instead.
 */
function buildWithArgsChain(chain: CalledWithChain): { and: Record<string, unknown> } {
  // Both spellings of the same terminal, because both are in use: `returnValue` is what a jasmine
  // suite types, `mockReturnValue` is what the rest of this library types.
  const and: Record<string, unknown> = {
    returnValue: chain.returnValue.bind(chain),
    mockReturnValue: chain.returnValue.bind(chain),
  };

  delegateHelpers(and, chain);

  return { and };
}

/** What `calledWith(…)` hands back — `returnValue` is always on it, the async helpers only sometimes. */
interface CalledWithChain {
  returnValue(value: unknown): void;
}

/** The half of an assembled function spy this module talks to, beyond the bare callable. */
interface LibrarySpy {
  calledWith(...args: unknown[]): CalledWithChain;
}

/** View an assembled spy as {@link LibrarySpy}. */
function asLibrarySpy(spy: MockFn): LibrarySpy {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, no-restricted-syntax -- `createFunctionSpy` attaches `calledWith` to every spy it builds, and this module only ever runs on one of those; `MockFn` is deliberately the bare callable, so the richer surface can only be recovered here.
  return spy as unknown as LibrarySpy;
}

/** Install `.and`, `.calls` and `.withArgs` on a fully-assembled function spy. */
export function addJasmineNamespacesToFunctionSpy(spy: MockFn, hooks: JasmineSpyHooks): void {
  defineNamespace(spy, 'and', () => {
    const and = buildStrategies(spy, hooks);
    delegateHelpers(and, spy);

    return and;
  });
  defineNamespace(spy, 'calls', () => buildCalls(spy));

  Object.defineProperty(spy, 'withArgs', {
    value: (...args: unknown[]): { and: Record<string, unknown> } => buildWithArgsChain(asLibrarySpy(spy).calledWith(...args)),
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

/**
 * Install `.and` and `.calls` on an accessor spy.
 *
 * An accessor spy is a bare adapter mock — there is no library dispatch behind it and no
 * promise/observable helper on it — so `callThrough` restores nothing and is left out of the
 * strategies it gets. `spy.accessorSpies.getters.name.and.returnValue('x')`, which is how a jasmine
 * suite configures a getter, works exactly as it did.
 */
export function addJasmineNamespacesToAccessorSpy(spy: MockFn): void {
  defineNamespace(spy, 'and', () => buildStrategies(spy, { name: '', restoreDispatch: () => undefined }));
  defineNamespace(spy, 'calls', () => buildCalls(spy));
}
