/**
 * Promise-returning spy helpers.
 *
 * Attaches `resolveWith` / `rejectWith` / `resolveWithPerCall` to function spies
 * and `calledWith` objects.
 */
import type { CalledWithObject, PerCallValue, ReturnValueContainer } from './internal-types';
import { decorate } from './spy-decoration';
import type { ValueConfigPerCall } from './types';

/** Map per-call configs to resolved-promise containers, baking each delay into the promise. */
function toResolvedPerCallValues<T>(valueConfigsPerCall: ValueConfigPerCall<T>[]): PerCallValue[] {
  return valueConfigsPerCall.map((config) => ({
    wrappedValue:
      config.delay === undefined
        ? Promise.resolve(config.value)
        : new Promise<T>((resolve) => setTimeout(() => resolve(config.value), config.delay)),
  }));
}

/** Attach `resolveWith` / `rejectWith` / `resolveWithPerCall`, publishing each result via `store`. */
function addPromiseHelpers<T>(target: object, store: (container: ReturnValueContainer) => void): void {
  decorate(target, {
    resolveWith: (value?: T): void => {
      store({ value: Promise.resolve(value) });
    },
    rejectWith: (value?: unknown): void => {
      store({ value, _isRejectedPromise: true });
    },
    resolveWithPerCall: (valueConfigsPerCall: ValueConfigPerCall<T>[]): void => {
      if (valueConfigsPerCall.length === 0) {
        return;
      }

      store({ value: undefined, valuesPerCalls: toResolvedPerCallValues(valueConfigsPerCall) });
    },
  });
}

export function addPromiseHelpersToFunctionSpy(spyFunction: object, valueContainer: ReturnValueContainer): void {
  addPromiseHelpers(spyFunction, (container) => {
    valueContainer.value = container.value;
    valueContainer._isRejectedPromise = container._isRejectedPromise ?? false;
    valueContainer.valuesPerCalls = container.valuesPerCalls ?? [];
  });
}

export function addPromiseHelpersToCalledWithObject(calledWithObject: CalledWithObject, calledWithArgs: unknown[]): void {
  addPromiseHelpers(calledWithObject, (container) => {
    calledWithObject.argsToValuesMap.set(calledWithArgs, container);
  });
}
