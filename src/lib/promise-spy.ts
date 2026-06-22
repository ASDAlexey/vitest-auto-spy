/**
 * Promise-returning spy helpers.
 *
 * Attaches `resolveWith` / `rejectWith` / `resolveWithPerCall` to function spies
 * and `calledWith` objects.
 */

import type { ValueConfigPerCall } from './types';
import type { CalledWithObject, PerCallValue, ReturnValueContainer } from './internal-types';

/** Map per-call configs to resolved-promise containers (preserving each delay). */
function toResolvedPerCallValues(valueConfigsPerCall: ValueConfigPerCall<any>[]): PerCallValue[] {
  return valueConfigsPerCall.map((config) => ({
    wrappedValue: Promise.resolve(config.value),
    delay: config.delay,
  }));
}

export function addPromiseHelpersToFunctionSpy(spyFunction: any, valueContainer: ReturnValueContainer): void {
  spyFunction.resolveWith = (value?: any): void => {
    valueContainer.value = Promise.resolve(value);
  };
  spyFunction.rejectWith = (value?: any): void => {
    valueContainer.value = value;
    valueContainer._isRejectedPromise = true;
  };
  spyFunction.resolveWithPerCall = (valueConfigsPerCall: ValueConfigPerCall<any>[]): void => {
    if (valueConfigsPerCall.length === 0) {
      return;
    }
    valueContainer.valuesPerCalls = toResolvedPerCallValues(valueConfigsPerCall);
  };
}

export function addPromiseHelpersToCalledWithObject(calledWithObject: CalledWithObject, calledWithArgs: any[]): void {
  calledWithObject.resolveWith = (value?: any): void => {
    calledWithObject.argsToValuesMap.set(calledWithArgs, { value: Promise.resolve(value) });
  };
  calledWithObject.rejectWith = (value?: any): void => {
    calledWithObject.argsToValuesMap.set(calledWithArgs, { value, _isRejectedPromise: true });
  };
  calledWithObject.resolveWithPerCall = (valueConfigsPerCall: ValueConfigPerCall<any>[]): void => {
    if (valueConfigsPerCall.length === 0) {
      return;
    }
    const valueContainer: ReturnValueContainer = {
      value: undefined,
      valuesPerCalls: toResolvedPerCallValues(valueConfigsPerCall),
    };
    calledWithObject.argsToValuesMap.set(calledWithArgs, valueContainer);
  };
}
