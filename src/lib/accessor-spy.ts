/**
 * Getter / setter spies.
 *
 * Installs empty, configurable accessors on the auto-spy and wraps them with
 * `vi.spyOn`, exposing the resulting mocks under `accessorSpies`.
 */

import { type MockInstance, vi } from 'vitest';

type AccessorType = 'getter' | 'setter';

/** Install no-op `get`/`set` accessors so `vi.spyOn` has something to wrap. */
function defineWithEmptyAccessors(obj: any, prop: string): void {
  Object.defineProperty(obj, prop, {
    get() {
      return undefined;
    },
    set(_value: unknown) {
      /* noop */
    },
    configurable: true,
  });
}

function spyOnAccessor(autoSpy: any, accessorName: string, accessorType: AccessorType): MockInstance {
  return accessorType === 'setter'
    ? vi.spyOn(autoSpy, accessorName as never, 'set')
    : vi.spyOn(autoSpy, accessorName as never, 'get');
}

export function createAccessorsSpies(autoSpy: any, gettersToSpyOn: string[], settersToSpyOn: string[]): void {
  autoSpy.accessorSpies = { getters: {}, setters: {} };

  gettersToSpyOn.forEach((getterName) => {
    defineWithEmptyAccessors(autoSpy, getterName);
    autoSpy.accessorSpies.getters[getterName] = spyOnAccessor(autoSpy, getterName, 'getter');
  });

  settersToSpyOn.forEach((setterName) => {
    if (!Object.prototype.hasOwnProperty.call(autoSpy, setterName)) {
      defineWithEmptyAccessors(autoSpy, setterName);
    }
    autoSpy.accessorSpies.setters[setterName] = spyOnAccessor(autoSpy, setterName, 'setter');
  });
}
