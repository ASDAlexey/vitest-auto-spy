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

/** Where a promise helper writes its container: the spy's own, or one argument list of a `calledWith` chain. */
export type ContainerStore<Self> = (self: Self, container: ReturnValueContainer, helper: string) => void;

/**
 * The three promise helpers, written against `this` and built once per *store* rather than once
 * per spy.
 *
 * On a function spy the store reads the spy's container off `this`, so one set of three functions
 * serves every spy in the run, and materialising a method allocates none of them — where each used
 * to be a closure of its own. A `calledWith` chain still gets a set per chain, because its store
 * captures the argument list: a chain is configuration, built only when a spec asks for it, and
 * there is nothing to save there.
 *
 * `helper` travels with every write so a store that has to reject a detached call (`const
 * { resolveWith } = spy.method`) can name the helper in its message.
 */
export function promiseHelpers<Self>(store: ContainerStore<Self>): {
  resolveWith(this: Self, value?: unknown): void;
  rejectWith(this: Self, value?: unknown): void;
  resolveWithPerCall(this: Self, valueConfigsPerCall: ValueConfigPerCall<unknown>[]): void;
} {
  return {
    resolveWith(this: Self, value?: unknown): void {
      store(this, { value: Promise.resolve(value) }, 'resolveWith');
    },
    rejectWith(this: Self, value?: unknown): void {
      store(this, { value, _isRejectedPromise: true }, 'rejectWith');
    },
    resolveWithPerCall(this: Self, valueConfigsPerCall: ValueConfigPerCall<unknown>[]): void {
      if (valueConfigsPerCall.length === 0) {
        return;
      }

      store(this, { value: undefined, valuesPerCalls: toResolvedPerCallValues(valueConfigsPerCall) }, 'resolveWithPerCall');
    },
  };
}

/** Write a promise configuration into a spy's long-lived container, superseding whatever was there. */
export function storePromiseConfig(valueContainer: ReturnValueContainer, container: ReturnValueContainer): void {
  valueContainer.value = container.value;
  valueContainer._isRejectedPromise = container._isRejectedPromise ?? false;
  // `failWith` supersedes and is superseded in turn — see its own note in `function-spy`.
  valueContainer._isThrown = false;
  valueContainer.valuesPerCalls = container.valuesPerCalls ?? [];
}

export function addPromiseHelpersToCalledWithObject(calledWithObject: CalledWithObject, calledWithArgs: unknown[]): void {
  decorate(
    calledWithObject,
    promiseHelpers<CalledWithObject>((_self, container) => {
      calledWithObject.argsToValuesMap.set(calledWithArgs, container);
    }),
  );
}
