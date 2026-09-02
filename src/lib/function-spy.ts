/**
 * The function spy factory — a single host-runner mock (via the {@link MockAdapter})
 * augmented with all return-type helpers (`mockReturnValue`, `resolveWith`,
 * `nextWith`, `calledWith`, …) and the argument-matching logic that decides what
 * a call returns.
 */
import { ArgsMap } from './args-map';
import { DOCS_LINKS, withDocs } from './docs-links';
import { errorHandler } from './error-handler';
import type { CalledWithObject, ReturnValueContainer } from './internal-types';
import { getJasmineSupport } from './jasmine-support';
import { getMockAdapter } from './mock-adapter';
import { getObservableSupport } from './observable-support';
import { addPromiseHelpersToCalledWithObject, addPromiseHelpersToFunctionSpy } from './promise-spy';
import { serializeValue } from './serialize-args';
import { type SettledResultsRecorder, installSettledResultsPolyfill } from './settled-results';
import { decorate } from './spy-decoration';
import { attachClearHook, attachConfigReset, markAsMock } from './spy-mark';
import type { AddSpyMethodsByReturnTypes, Func, UnstubbedCall, UnstubbedCallHandler } from './types';

/** Narrow the loosely-typed map lookup back to a `ReturnValueContainer`. */
function isReturnValueContainer(value: unknown): value is ReturnValueContainer {
  return typeof value === 'object' && value !== null && 'value' in value;
}

/**
 * Resolve a container into the actual value a spy should return. `*PerCall`
 * configs are consumed one entry per call; any delay is already baked into the
 * wrapped Promise/Observable at configuration time, so nothing extra is applied
 * here.
 */
function unwrapContainer(container: ReturnValueContainer): unknown {
  if (container._isRejectedPromise) {
    return Promise.reject(container.value);
  }

  const wrapped = container.valuesPerCalls?.shift();

  if (wrapped) {
    return wrapped.wrappedValue;
  }

  return container.value;
}

/**
 * The mutable state behind one function spy, in a single object.
 *
 * The two `calledWith` chains are **absent until configured**. They used to be built eagerly with
 * the spy, and they are the most expensive thing a spy owns that most spies never use: an object
 * plus an {@link ArgsMap} (a null-prototype record and a matcher array) each, ~600 B of the ~2.7 kB
 * a materialised spy costs. A spec configures `calledWith` on a handful of methods and leaves the
 * rest of the class alone, so creating them on first use is nearly always creating nothing.
 *
 * Presence therefore *is* configuration — there is no separate `wasConfigured` flag to keep in
 * sync, and {@link resetAutoSpy} reverts a spy by dropping the objects, which frees their maps
 * instead of replacing them with empty ones.
 */
interface SpyState {
  readonly valueContainer: ReturnValueContainer;
  calledWith?: CalledWithObject;
  mustBeCalledWith?: CalledWithObject;
}

/**
 * Returned by {@link lookupConfigured} when no configured value matched.
 *
 * A miss cannot be reported as `undefined`, because `undefined` is itself a legal configured value
 * (`calledWith(1).mockReturnValue(undefined)`), and it must not be reported as `{ found, value }`
 * either — that object was allocated on every call of a configured spy, on the hot path, purely to
 * carry a boolean.
 */
const NO_MATCH = Symbol('vitest-auto-spy.noMatch');

/**
 * A spy's strict-mode guard: who owns it, and what to do about a call nobody configured.
 *
 * Carried per spy rather than looked up globally, because the message has to name the class, and
 * only the factory that read the prototype knows it.
 */
export interface UnstubbedGuard {
  className: string | undefined;
  handle: UnstubbedCallHandler;
}

/** `UserService.load` — or just `load` on a type-driven double, which has no class to name. */
function describeTarget(call: UnstubbedCall): string {
  return call.className === undefined ? call.method : `${call.className}.${call.method}`;
}

/**
 * The handler `strict: true` installs.
 *
 * It prints the call it refused, not just the name: on a wide service the same method is called
 * several times with different arguments, and "which call" is half the diagnosis. `serializeValue`
 * renders the array bracketed, so the brackets come off to leave a bare argument list that reads as
 * the call that was made — the same shape `errorHandler` prints for `mustBeCalledWith`.
 */
function throwUnstubbedCall(call: UnstubbedCall): never {
  const target = describeTarget(call);
  const serialized = serializeValue(call.args);
  const message =
    `[vitest-auto-spy] Nothing configured ${target}, and strict mode is on.\n` +
    `Called as: ${target}(${serialized.substring(1, serialized.length - 1)})\n` +
    `Configure it — .mockReturnValue(…), .mockImplementation(…), .resolveWith(…), .nextWith(…) or .calledWith(…), ` +
    `or seed it through the 'returns' option — or drop 'strict' from this double.`;

  throw new Error(withDocs(message, DOCS_LINKS.strictMode));
}

/**
 * Strict-mode defaults for every double built afterwards, for a setup file to install once.
 *
 * Kept in a module-level binding rather than threaded through each factory because the point of a
 * global switch is that no call site mentions it. A double's own configuration always wins — an
 * explicit `strict: false` included, which is the only way to exempt one collaborator from a
 * suite-wide default.
 */
let defaultStrictConfig: StrictResolution | undefined = undefined;

/** The two strict fields, required-but-nullable, as every resolved configuration carries them. */
export interface StrictResolution {
  strict: boolean | undefined;
  onUnstubbedCall: UnstubbedCallHandler | undefined;
}

/** Install (or, with `undefined`, remove) the strict-mode default applied to doubles built afterwards. */
export function setDefaultStrictMode(config: StrictResolution | undefined): void {
  defaultStrictConfig = config;
}

/**
 * The guard a double should hand to each of its spies, or nothing when strict mode is off.
 *
 * Precedence, most specific first: the double's own `onUnstubbedCall`, the global one, the double's
 * own `strict` (`false` included — `false ?? x` is `false`, so an explicit opt-out is not overridden
 * by the default), then the global `strict`.
 */
export function resolveUnstubbedGuard(className: string | undefined, config: StrictResolution): UnstubbedGuard | undefined {
  const handler = config.onUnstubbedCall ?? defaultStrictConfig?.onUnstubbedCall;

  if (handler) {
    return { className, handle: handler };
  }

  if (config.strict ?? defaultStrictConfig?.strict) {
    return { className, handle: throwUnstubbedCall };
  }

  return undefined;
}

/**
 * Whether nothing has configured this spy at all.
 *
 * Only three things can have: a `calledWith` chain, a `mustBeCalledWith` chain, or a value written
 * into the container by `resolveWith` / `nextWith` / their per-call forms. The fourth way a spec
 * configures a method — the host runner's own `mockReturnValue` / `mockImplementation`, and the
 * `returns` option, which goes through the adapter — needs no check here at all: those *replace*
 * the dispatch, so a spy configured that way never reaches this code.
 */
function isUnconfigured(state: SpyState): boolean {
  const container = state.valueContainer;

  return (
    state.calledWith === undefined &&
    state.mustBeCalledWith === undefined &&
    container.value === undefined &&
    !container._isRejectedPromise &&
    !container.valuesPerCalls?.length
  );
}

/** The configured value for these args, unwrapped — or {@link NO_MATCH}. */
function lookupConfigured(calledWithObject: CalledWithObject, actualArgs: unknown[]): unknown {
  const configured = calledWithObject.argsToValuesMap.get(actualArgs);

  return isReturnValueContainer(configured) ? unwrapContainer(configured) : NO_MATCH;
}

/**
 * Decide what the spy returns for a given call: the strict-mode guard first, when the spy is strict
 * and nothing configured it at all, then a `calledWith` match, then a `mustBeCalledWith` match
 * (throwing if none matches), else the default.
 *
 * The guard goes first because it asks a question about the *spy*, not about the call — "did
 * anybody configure this method" — and by definition it can only fire on a spy where neither chain
 * exists, so no configured lookup is skipped by putting it here. A non-strict spy pays one
 * `undefined` check, which is what it paid before.
 */
function returnTheCorrectFakeValue(state: SpyState, actualArgs: unknown[], functionName: string, unstubbed?: UnstubbedGuard): unknown {
  if (unstubbed && isUnconfigured(state)) {
    return unstubbed.handle({ className: unstubbed.className, method: functionName, args: actualArgs });
  }

  if (state.calledWith) {
    const match = lookupConfigured(state.calledWith, actualArgs);

    if (match !== NO_MATCH) {
      return match;
    }
  }

  if (state.mustBeCalledWith) {
    const match = lookupConfigured(state.mustBeCalledWith, actualArgs);

    if (match !== NO_MATCH) {
      return match;
    }

    // The map goes along so the failure can print what was wanted next to what arrived.
    errorHandler.throwArgumentsError(actualArgs, functionName, state.mustBeCalledWith.argsToValuesMap);
  }

  return unwrapContainer(state.valueContainer);
}

/** Attach `mockReturnValue` (and its `returnValue` alias) plus the promise/observable helpers to a `calledWith` chain. */
function addMethodsToCalledWith(calledWith: CalledWithObject, calledWithArgs: unknown[]): CalledWithObject {
  const setReturnValue = (value: unknown): void => {
    calledWith.argsToValuesMap.set(calledWithArgs, { value });
  };

  decorate(calledWith, {
    mockReturnValue: setReturnValue,
    // `returnValue` is the `jest-auto-spies` name — aliased so migrating tests need no rewrite.
    returnValue: setReturnValue,
  });
  addPromiseHelpersToCalledWithObject(calledWith, calledWithArgs);
  getObservableSupport()?.addToCalledWithObject(calledWith, calledWithArgs);

  return calledWith;
}

/** The spy's `calledWith` / `mustBeCalledWith` chain, built on the first call that needs it. */
function ensureCalledWithObject(state: SpyState, chain: 'calledWith' | 'mustBeCalledWith'): CalledWithObject {
  const existing = state[chain];

  if (existing) {
    return existing;
  }

  const created: CalledWithObject = { argsToValuesMap: new ArgsMap() };
  state[chain] = created;

  return created;
}

/**
 * Create a single host-runner-backed function spy with all return-type helpers attached.
 *
 * @example
 * ```ts
 * const load = createFunctionSpy<(id: number) => Promise<string>>('load');
 *
 * load.calledWith(1).resolveWith('value');
 * await expect(load(1)).resolves.toBe('value');
 * ```
 *
 * @param name The method's name, used in every message this spy produces.
 * @param unstubbed What to do when the spy is called and nothing configured it — see
 *   {@link resolveUnstubbedGuard}. Omitted by every non-strict double, which is the default.
 */
export function createFunctionSpy<FunctionType extends Func>(
  name: string,
  unstubbed?: UnstubbedGuard,
): AddSpyMethodsByReturnTypes<FunctionType> {
  const valueContainer: ReturnValueContainer = { value: undefined };
  const state: SpyState = { valueContainer };

  // Declared before `dispatch` closes over it, and mutable, because the two cannot both come
  // first: the recorder needs the host mock, and the host mock is built *from* `dispatch`. As a
  // `const` assigned afterwards this is a temporal dead zone that only stays quiet while no
  // adapter calls the implementation at creation time — one that warms it would get a
  // `ReferenceError` out of the spy factory rather than an unrecorded call.
  let settledResultsRecorder: SettledResultsRecorder | undefined = undefined;

  // The library's dispatch: pick the configured value for the call, then record
  // its settled outcome. Captured by name so `resetAutoSpy` can re-install it,
  // discarding any host-level `mockReturnValue`/`mockImplementation` a test set.
  const dispatch = (...actualArgs: unknown[]): unknown => {
    const returned = returnTheCorrectFakeValue(state, actualArgs, name, unstubbed);

    return settledResultsRecorder ? settledResultsRecorder.record(returned) : returned;
  };

  const functionSpy = getMockAdapter().createMockFn(dispatch, name);

  // Bun / node:test don't track `mock.settledResults`; polyfill it so the typed
  // `spy.method.mock.settledResults` surface works on every runtime (Vitest keeps
  // its native array — the recorder is then a no-op). Also held in a second, definitely-assigned
  // binding, so the clear hook below carries no presence check that could never fail.
  const recorder = installSettledResultsPolyfill(functionSpy);
  settledResultsRecorder = recorder;

  addPromiseHelpersToFunctionSpy(functionSpy, valueContainer);
  const resetObservableStream = getObservableSupport()?.addToFunctionSpy(functionSpy, valueContainer);

  const spy = decorate(functionSpy, {
    calledWith: (...calledWithArgs: unknown[]): CalledWithObject =>
      addMethodsToCalledWith(ensureCalledWithObject(state, 'calledWith'), calledWithArgs),
    mustBeCalledWith: (...calledWithArgs: unknown[]): CalledWithObject =>
      addMethodsToCalledWith(ensureCalledWithObject(state, 'mustBeCalledWith'), calledWithArgs),
  });

  // `.and` / `.calls` / `.withArgs`, for a suite arriving from `jasmine-auto-spies`. Installed only
  // when `vitest-auto-spy/jasmine` has been imported — one `undefined` check for everyone else.
  // It goes last so the namespaces can delegate to every helper attached above.
  getJasmineSupport()?.addToFunctionSpy(spy, {
    name,
    restoreDispatch: (): void => {
      getMockAdapter().restoreImplementation(functionSpy, dispatch);
    },
  });

  // `resetAutoSpy` reverts this spy's configuration; the state lives in these
  // closures, so the host runner's own reset can't reach it. Clearing the
  // container in place keeps the reference the mock implementation closed over.
  attachConfigReset(spy, () => {
    // Dropping the chains reverts the configuration *and* releases the argument maps a configured
    // spy allocated, so a reset spy costs exactly what a fresh one costs.
    delete state.calledWith;
    delete state.mustBeCalledWith;
    valueContainer.value = undefined;
    delete valueContainer._isRejectedPromise;
    delete valueContainer.valuesPerCalls;
    // The observable layer keeps its `ReplaySubject` in a closure the container cannot reach, and
    // its buffer is configuration in exactly the sense `calledWith` is: without this, a value from
    // one test is replayed to the next one — ahead of the error that test configured.
    resetObservableStream?.();
    // Re-install the library dispatch so a bare `spy.method.mockReturnValue(…)`
    // set directly on the host mock is reverted too (mockClear alone can't).
    getMockAdapter().restoreImplementation(functionSpy, dispatch);
  });
  // Empties the polyfilled `settledResults` on `clearAutoSpy`/`resetAutoSpy`
  // (a no-op on Vitest, where the host clears its native array).
  attachClearHook(spy, () => recorder.clear());
  markAsMock(spy);

  return exposeAsSpy<FunctionType>(spy);
}

/**
 * Bridge the runtime-assembled spy (a host-runner mock decorated with heterogeneous
 * promise/observable/calledWith helpers) to its public `AddSpyMethodsByReturnTypes`
 * surface. The concrete `FunctionType` is only known to the caller, so the
 * spy's `(...args: unknown[]) => unknown` call signature must be widened.
 */
function exposeAsSpy<FunctionType extends Func>(spy: object): AddSpyMethodsByReturnTypes<FunctionType> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- the spy is built dynamically from heterogeneous decorators; its concrete `FunctionType` call signature is only known to the caller, so the public spy surface is bridged via the spy's `any`-typed dynamic shape (kept local to this single helper).
  return spy as any;
}
