/**
 * The function spy factory — a single host-runner mock (via the {@link MockAdapter})
 * augmented with all return-type helpers (`mockReturnValue`, `resolveWith`,
 * `nextWith`, `calledWith`, …) and the argument-matching logic that decides what
 * a call returns.
 */
import { ArgsMap } from './args-map';
import { errorHandler } from './error-handler';
import type { CalledWithObject, ReturnValueContainer } from './internal-types';
import { getMockAdapter } from './mock-adapter';
import { getObservableSupport } from './observable-support';
import { addPromiseHelpersToCalledWithObject, addPromiseHelpersToFunctionSpy } from './promise-spy';
import { type SettledResultsRecorder, installSettledResultsPolyfill } from './settled-results';
import { decorate } from './spy-decoration';
import { attachClearHook, attachConfigReset, markAsMock } from './spy-mark';
import type { AddSpyMethodsByReturnTypes, Func } from './types';

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

/** The configured value for these args, unwrapped — or {@link NO_MATCH}. */
function lookupConfigured(calledWithObject: CalledWithObject, actualArgs: unknown[]): unknown {
  const configured = calledWithObject.argsToValuesMap.get(actualArgs);

  return isReturnValueContainer(configured) ? unwrapContainer(configured) : NO_MATCH;
}

/**
 * Decide what the spy returns for a given call: a `calledWith` match wins first,
 * then a `mustBeCalledWith` match (throwing if none matches), else the default.
 */
function returnTheCorrectFakeValue(state: SpyState, actualArgs: unknown[], functionName: string): unknown {
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

    errorHandler.throwArgumentsError(actualArgs, functionName);
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
 */
export function createFunctionSpy<FunctionType extends Func>(name: string): AddSpyMethodsByReturnTypes<FunctionType> {
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
    const returned = returnTheCorrectFakeValue(state, actualArgs, name);

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
