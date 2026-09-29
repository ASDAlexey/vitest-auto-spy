/**
 * Getter / setter spies.
 *
 * Installs empty, configurable accessors on the auto-spy and wraps them with the
 * active {@link MockAdapter}'s accessor spy, exposing the resulting mocks under
 * `accessorSpies`.
 */
import { getJasmineSupport } from './jasmine-support';
import { type MockFn, getMockAdapter } from './mock-adapter';
import { markAsMock } from './spy-mark';
import type { Func } from './types';
import { type ReadGuard, unconfiguredGetter } from './unconfigured-reads';

type AccessorType = 'getter' | 'setter';

type AccessorSpies = { getters: Record<string, MockFn>; setters: Record<string, MockFn> };

/**
 * The scaffold accessors, one pair for the run.
 *
 * Shared rather than minted per property: the getter becomes the mock's implementation and the
 * setter is carried into the descriptor beside it, so neither is thrown away — but neither closes
 * over anything either, and a double with a dozen spied accessors made a dozen copies of each.
 */
const NOOP_GETTER = function noopGetter(): undefined {
  return undefined;
};

const NOOP_SETTER = function noopSetter(_value: unknown): void {
  /* noop */
};

/** Install no-op `get`/`set` accessors so the adapter has something to wrap. */
function defineWithEmptyAccessors(obj: Record<string, unknown>, prop: string, getter: () => undefined = NOOP_GETTER): void {
  Object.defineProperty(obj, prop, { get: getter, set: NOOP_SETTER, configurable: true });
}

function spyOnAccessor(autoSpy: Record<string, unknown>, accessorName: string, accessorType: AccessorType): MockFn {
  const adapter = getMockAdapter();
  const mock = accessorType === 'setter' ? adapter.spyOnSetter(autoSpy, accessorName) : adapter.spyOnGetter(autoSpy, accessorName);
  markAsMock(mock);
  // `spy.accessorSpies.getters.name.and.returnValue(…)` is how a `jasmine-auto-spies` suite
  // configures a getter, so an accessor spy gets the namespaces too — see `jasmine-support.ts`.
  getJasmineSupport()?.addToAccessorSpy(mock);

  return mock;
}

/**
 * An ordinary object, exactly what `{}` is, minus the four property slots V8 reserves in every `{}`.
 *
 * A constructor's instances are sized to what its instances actually hold, and this one's hold nothing,
 * so both halves of an empty bag cost 24 B instead of 56 — on every double, since almost no class has
 * a spied accessor. The prototype is `Object.prototype`, so nothing can tell the two apart.
 */
const EmptyRecord = /* @__PURE__ */ ((): Func => {
  function EmptyRecord(): void {
    /* an ordinary object, sized by its constructor */
  }

  EmptyRecord.prototype = Object.prototype;

  return EmptyRecord;
})();

function emptyRecord(): Record<string, MockFn> {
  return Reflect.construct(EmptyRecord, NO_ARGUMENTS);
}

const NO_ARGUMENTS: readonly unknown[] = [];

/** `reads` makes each getter's scaffold note a read nothing configured — see `unconfigured-reads.ts`. */
export function createAccessorsSpies(
  autoSpy: Record<string, unknown>,
  gettersToSpyOn: string[],
  settersToSpyOn: string[],
  reads?: ReadGuard,
): void {
  const accessorSpies: AccessorSpies =
    gettersToSpyOn.length === 0 && settersToSpyOn.length === 0
      ? { getters: emptyRecord(), setters: emptyRecord() }
      : { getters: {}, setters: {} };
  // Non-enumerable: the bag is library plumbing, and as an own key it showed up in every
  // `Object.keys`, spread, `toEqual` and snapshot of a double.
  Object.defineProperty(autoSpy, 'accessorSpies', { value: accessorSpies, writable: true, configurable: true, enumerable: false });

  gettersToSpyOn.forEach((getterName) => {
    defineWithEmptyAccessors(autoSpy, getterName, reads && unconfiguredGetter(reads, getterName));
    accessorSpies.getters[getterName] = spyOnAccessor(autoSpy, getterName, 'getter');
  });

  settersToSpyOn.forEach((setterName) => {
    if (!Object.prototype.hasOwnProperty.call(autoSpy, setterName)) {
      defineWithEmptyAccessors(autoSpy, setterName);
    }

    accessorSpies.setters[setterName] = spyOnAccessor(autoSpy, setterName, 'setter');
  });
}
