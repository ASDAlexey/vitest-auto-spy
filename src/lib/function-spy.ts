/**
 * The function spy factory — a single `vi.fn()` augmented with all return-type
 * helpers (`mockReturnValue`, `resolveWith`, `nextWith`, `calledWith`, …) and
 * the argument-matching logic that decides what a call returns.
 */
import { vi } from 'vitest';

import { ArgsMap } from './args-map';
import { errorHandler } from './error-handler';
import type { CalledWithObject, ReturnValueContainer } from './internal-types';
import { getObservableSupport } from './observable-support';
import { addPromiseHelpersToCalledWithObject, addPromiseHelpersToFunctionSpy } from './promise-spy';
import { decorate } from './spy-decoration';
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

/** Look up a configured value for the given args, unwrapping it if present. */
function lookupConfigured(calledWithObject: CalledWithObject, actualArgs: unknown[]): { found: boolean; value: unknown } {
  const configured = calledWithObject.argsToValuesMap.get(actualArgs);

  if (isReturnValueContainer(configured)) {
    return { found: true, value: unwrapContainer(configured) };
  }

  return { found: false, value: undefined };
}

/**
 * Decide what the spy returns for a given call: a `calledWith` match wins first,
 * then a `mustBeCalledWith` match (throwing if none matches), else the default.
 */
function returnTheCorrectFakeValue(
  calledWithObject: CalledWithObject,
  mustBeCalledWithObject: CalledWithObject,
  valueContainer: ReturnValueContainer,
  actualArgs: unknown[],
  functionName: string,
): unknown {
  if (calledWithObject.wasConfigured) {
    const match = lookupConfigured(calledWithObject, actualArgs);

    if (match.found) {
      return match.value;
    }
  }

  if (mustBeCalledWithObject.wasConfigured) {
    const match = lookupConfigured(mustBeCalledWithObject, actualArgs);

    if (match.found) {
      return match.value;
    }

    errorHandler.throwArgumentsError(actualArgs, functionName);
  }

  return unwrapContainer(valueContainer);
}

/** Attach `mockReturnValue` plus the promise/observable helpers to a `calledWith` chain. */
function addMethodsToCalledWith(calledWith: CalledWithObject, calledWithArgs: unknown[]): CalledWithObject {
  calledWith.wasConfigured = true;
  decorate(calledWith, {
    mockReturnValue: (value: unknown): void => {
      calledWith.argsToValuesMap.set(calledWithArgs, { value });
    },
  });
  addPromiseHelpersToCalledWithObject(calledWith, calledWithArgs);
  getObservableSupport()?.addToCalledWithObject(calledWith, calledWithArgs);

  return calledWith;
}

function createCalledWithObject(): CalledWithObject {
  return { wasConfigured: false, argsToValuesMap: new ArgsMap() };
}

/** Create a single Vitest-backed function spy with all return-type helpers attached. */
export function createFunctionSpy<FunctionType extends Func>(name: string): AddSpyMethodsByReturnTypes<FunctionType> {
  const calledWithObject = createCalledWithObject();
  const mustBeCalledWithObject = createCalledWithObject();
  const valueContainer: ReturnValueContainer = { value: undefined };

  const functionSpy = vi.fn((...actualArgs: unknown[]) =>
    returnTheCorrectFakeValue(calledWithObject, mustBeCalledWithObject, valueContainer, actualArgs, name),
  );
  functionSpy.mockName(name);

  addPromiseHelpersToFunctionSpy(functionSpy, valueContainer);
  getObservableSupport()?.addToFunctionSpy(functionSpy, valueContainer);

  const spy = decorate(functionSpy, {
    calledWith: (...calledWithArgs: unknown[]): CalledWithObject => addMethodsToCalledWith(calledWithObject, calledWithArgs),
    mustBeCalledWith: (...calledWithArgs: unknown[]): CalledWithObject => addMethodsToCalledWith(mustBeCalledWithObject, calledWithArgs),
  });

  return exposeAsSpy<FunctionType>(spy);
}

/**
 * Bridge the runtime-assembled spy (a `vi.fn()` decorated with heterogeneous
 * promise/observable/calledWith helpers) to its public `AddSpyMethodsByReturnTypes`
 * surface. The concrete `FunctionType` is only known to the caller, so the
 * spy's `(...args: unknown[]) => unknown` call signature must be widened.
 */
function exposeAsSpy<FunctionType extends Func>(spy: object): AddSpyMethodsByReturnTypes<FunctionType> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- the spy is built dynamically from heterogeneous decorators; its concrete `FunctionType` call signature is only known to the caller, so the public spy surface is bridged via the spy's `any`-typed dynamic shape (kept local to this single helper).
  return spy as any;
}
