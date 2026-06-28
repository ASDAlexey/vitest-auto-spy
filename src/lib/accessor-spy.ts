/**
 * Getter / setter spies.
 *
 * Installs empty, configurable accessors on the auto-spy and wraps them with the
 * active {@link MockAdapter}'s accessor spy, exposing the resulting mocks under
 * `accessorSpies`.
 */
import { getMockAdapter, type MockFn } from './mock-adapter';

type AccessorType = 'getter' | 'setter';

type AccessorSpies = { getters: Record<string, MockFn>; setters: Record<string, MockFn> };

/** Install no-op `get`/`set` accessors so the adapter has something to wrap. */
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

function spyOnAccessor(autoSpy: Record<string, unknown>, accessorName: string, accessorType: AccessorType): MockFn {
  const adapter = getMockAdapter();

  return accessorType === 'setter' ? adapter.spyOnSetter(autoSpy, accessorName) : adapter.spyOnGetter(autoSpy, accessorName);
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
