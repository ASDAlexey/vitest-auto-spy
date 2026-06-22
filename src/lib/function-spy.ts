/**
 * The function spy factory — a single `vi.fn()` augmented with all return-type
 * helpers (`mockReturnValue`, `resolveWith`, `nextWith`, `calledWith`, …) and
 * the argument-matching logic that decides what a call returns.
 */

import { vi } from 'vitest';

import { ArgsMap } from './args-map';
import { errorHandler } from './error-handler';
import type { AddSpyMethodsByReturnTypes, Func } from './types';
import type { CalledWithObject, ReturnValueContainer } from './internal-types';
import {
  addObservableHelpersToCalledWithObject,
  addObservableHelpersToFunctionSpy,
} from './observable-spy';
import { addPromiseHelpersToCalledWithObject, addPromiseHelpersToFunctionSpy } from './promise-spy';

/** Pull the next pre-wrapped value for a `*PerCall` configuration, applying its delay. */
function getNextCallValue(valueContainer: ReturnValueContainer): any {
  const wrapped = valueContainer.valuesPerCalls!.shift();
  let returnedValue = wrapped?.wrappedValue;
  if (wrapped && wrapped.delay) {
    returnedValue = (returnedValue as Promise<any>).then(
      (value) => new Promise((resolve) => setTimeout(() => resolve(value), wrapped.delay)),
    );
  }
  return returnedValue;
}

/** Resolve a container into the actual value a spy should return. */
function unwrapContainer(container: ReturnValueContainer): any {
  if (container._isRejectedPromise) {
    return Promise.reject(container.value);
  }
  if (container.valuesPerCalls?.length) {
    return getNextCallValue(container);
  }
  return container.value;
}

/**
 * Decide what the spy returns for a given call: a `calledWith` match wins first,
 * then a `mustBeCalledWith` match (throwing if none matches), else the default.
 */
function returnTheCorrectFakeValue(
  calledWithObject: CalledWithObject,
  mustBeCalledWithObject: CalledWithObject,
  valueContainer: ReturnValueContainer,
  actualArgs: any[],
  functionName: string,
): any {
  if (calledWithObject.wasConfigured) {
    const configured = calledWithObject.argsToValuesMap.get(actualArgs);
    if (configured) {
      return unwrapContainer(configured);
    }
  }

  if (mustBeCalledWithObject.wasConfigured) {
    const configured = mustBeCalledWithObject.argsToValuesMap.get(actualArgs);
    if (configured) {
      return unwrapContainer(configured);
    }
    errorHandler.throwArgumentsError(actualArgs, functionName);
  }

  return unwrapContainer(valueContainer);
}

/** Attach `mockReturnValue` plus the promise/observable helpers to a `calledWith` chain. */
function addMethodsToCalledWith(calledWith: CalledWithObject, calledWithArgs: any[]): CalledWithObject {
  calledWith.wasConfigured = true;
  calledWith.mockReturnValue = (value: any): void => {
    calledWith.argsToValuesMap.set(calledWithArgs, { value });
  };
  addPromiseHelpersToCalledWithObject(calledWith, calledWithArgs);
  addObservableHelpersToCalledWithObject(calledWith, calledWithArgs);
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

  const functionSpy = vi.fn((...actualArgs: any[]) =>
    returnTheCorrectFakeValue(calledWithObject, mustBeCalledWithObject, valueContainer, actualArgs, name),
  );
  functionSpy.mockName(name);

  addPromiseHelpersToFunctionSpy(functionSpy, valueContainer);
  addObservableHelpersToFunctionSpy(functionSpy, valueContainer);

  (functionSpy as any).calledWith = (...calledWithArgs: any[]) =>
    addMethodsToCalledWith(calledWithObject, calledWithArgs);
  (functionSpy as any).mustBeCalledWith = (...calledWithArgs: any[]) =>
    addMethodsToCalledWith(mustBeCalledWithObject, calledWithArgs);

  return functionSpy as unknown as AddSpyMethodsByReturnTypes<FunctionType>;
}
