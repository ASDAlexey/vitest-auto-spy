/**
 * `resetAutoSpy` / `clearAutoSpy` — reset every spy inside an assembled auto-spy
 * with a single call, instead of reaching for `mockClear`/`mockReset` on each
 * method by hand.
 *
 *  - {@link clearAutoSpy} clears recorded calls only (keeps configured returns).
 *  - {@link resetAutoSpy} also reverts every `calledWith`/return-value config to
 *    pristine.
 *
 * Works on both `createSpyFromClass` spies and `createAutoMock` proxies: mocks
 * are found by their brand ({@link isMarkedMock}), never by invoking live
 * accessors — so collecting them records no spurious calls.
 */
import { type MockFn, getMockAdapter } from './mock-adapter';
import { isMarkedMock, runClearHook, runConfigReset } from './spy-mark';

/** The `accessorSpies` bag attached to class-based spies. */
interface AccessorSpiesBag {
  getters: Record<string, MockFn>;
  setters: Record<string, MockFn>;
}

/** Whether a value is the accessor-spies bag (holds `getters`/`setters` maps). */
function isAccessorBag(value: unknown): value is AccessorSpiesBag {
  return typeof value === 'object' && value !== null && 'getters' in value && 'setters' in value;
}

/** Accessor mocks read straight from the `accessorSpies` bag (not by triggering the live accessors). */
function collectAccessorMocks(spy: object): MockFn[] {
  const bag = Object.getOwnPropertyDescriptor(spy, 'accessorSpies')?.value;

  if (!isAccessorBag(bag)) {
    return [];
  }

  return [...Object.values(bag.getters), ...Object.values(bag.setters)].filter(isMarkedMock);
}

/** Every branded mock inside `spy`: method spies (by value) plus accessor spies (from the bag). */
function collectMocks(spy: object): MockFn[] {
  const mocks: MockFn[] = [];

  Object.keys(spy).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(spy, key);

    // Skip live accessors — a getter/setter, or a not-yet-materialized lazy
    // method spy. Reading them would record a spurious call; the accessor mocks
    // are collected from the bag instead, and un-accessed lazy spies have no calls.
    if (!descriptor || descriptor.get || descriptor.set) {
      return;
    }

    if (isMarkedMock(descriptor.value)) {
      mocks.push(descriptor.value);
    }
  });

  return [...mocks, ...collectAccessorMocks(spy)];
}

/** Clear recorded calls on every spy inside `spy` (configured return values are kept). */
export function clearAutoSpy(spy: object): void {
  const adapter = getMockAdapter();

  collectMocks(spy).forEach((mock) => {
    adapter.clear(mock);
    runClearHook(mock);
  });
}

/** Reset every spy inside `spy`: clears recorded calls and reverts all `calledWith`/return-value configuration. */
export function resetAutoSpy(spy: object): void {
  const adapter = getMockAdapter();

  collectMocks(spy).forEach((mock) => {
    adapter.clear(mock);
    runClearHook(mock);
    runConfigReset(mock);
  });
}
