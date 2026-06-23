/**
 * Getter / setter spies.
 *
 * Installs empty, configurable accessors on the auto-spy and wraps them with
 * `vi.spyOn`, exposing the resulting mocks under `accessorSpies`.
 */
import { type MockInstance, vi } from 'vitest';

type AccessorType = 'getter' | 'setter';

type AccessorSpies = { getters: Record<string, MockInstance>; setters: Record<string, MockInstance> };

/** Install no-op `get`/`set` accessors so `vi.spyOn` has something to wrap. */
function defineWithEmptyAccessors(obj: Record<string, unknown>, prop: string): void {
  Object.defineProperty(obj, prop, {
    get(): undefined {
      return undefined;
    },
    set(_value: unknown): void {
      /* noop */
    },
    configurable: true,
  });
}

function spyOnAccessor(autoSpy: Record<string, unknown>, accessorName: string, accessorType: AccessorType): MockInstance {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `vi.spyOn`'s key parameter is typed against the static object shape, but `accessorName` is a dynamic string; `as never` satisfies the overload for a key only known at runtime.
  const key = accessorName as never;

  return accessorType === 'setter' ? vi.spyOn(autoSpy, key, 'set') : vi.spyOn(autoSpy, key, 'get');
}

export function createAccessorsSpies(autoSpy: Record<string, unknown>, gettersToSpyOn: string[], settersToSpyOn: string[]): void {
  const accessorSpies: AccessorSpies = { getters: {}, setters: {} };
  autoSpy['accessorSpies'] = accessorSpies;

  gettersToSpyOn.forEach((getterName) => {
    defineWithEmptyAccessors(autoSpy, getterName);
    accessorSpies.getters[getterName] = spyOnAccessor(autoSpy, getterName, 'getter');
  });

  settersToSpyOn.forEach((setterName) => {
    if (!Object.prototype.hasOwnProperty.call(autoSpy, setterName)) {
      defineWithEmptyAccessors(autoSpy, setterName);
    }

    accessorSpies.setters[setterName] = spyOnAccessor(autoSpy, setterName, 'setter');
  });
}
