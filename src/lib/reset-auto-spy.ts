/**
 * `resetAutoSpy` / `clearAutoSpy` — reset every spy inside an assembled auto-spy
 * with a single call, instead of reaching for `mockClear`/`mockReset` on each
 * method by hand.
 *
 *  - {@link clearAutoSpy} clears recorded calls only (keeps configured returns).
 *  - {@link resetAutoSpy} also reverts every `calledWith`/return-value config to
 *    pristine.
 *
 * Works on `createSpyFromClass` spies, `createAutoMock` proxies and `mockDeep` trees: mocks are
 * found by their brand ({@link isMarkedMock}), never by invoking live accessors — so collecting
 * them records no spurious calls. A `mockDeep` node is followed to its materialised children, so a
 * `calledWith` seeded three levels down does not outlive the test that set it.
 */
import { type MockFn, getMockAdapter } from './mock-adapter';
import { isMarkedMock, readDeepChildren, runClearHook, runConfigReset } from './spy-mark';

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

/** The mocks held directly by an assembled spy: method spies (by value) plus accessor spies (from the bag). */
function collectOwnMocks(spy: object): MockFn[] {
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

/**
 * Every branded mock reachable from `spy`, descending through `mockDeep` children.
 *
 * Two kinds of value take part, and they are walked differently. An *assembled spy* — a
 * `createSpyFromClass` result, a `createAutoMock` proxy — is a container: its mocks are its own
 * keys. A *mock* is a leaf, except when it is a `mockDeep` node, which is a spy and a container at
 * once and keeps its children out of `Object.keys` on purpose.
 *
 * Descending into those children is the difference between `resetAutoSpy(api)` resetting nothing
 * and resetting the tree: a `mockDeep` root is a function, so the own-key walk found no mocks at
 * all, and a `calledWith` seeded on `api.repo.user.find` outlived the test that set it.
 * `vitest-mock-extended`'s `mockReset` recurses, and a nested double surviving a reset reads as a
 * bug wherever the expectation came from.
 */
function collectMocks(spy: object): MockFn[] {
  const mocks: MockFn[] = [];
  const seen = new Set<object>();

  const visit = (value: object): void => {
    if (seen.has(value)) {
      return;
    }

    seen.add(value);

    if (isMarkedMock(value)) {
      mocks.push(value);
      readDeepChildren(value).forEach(visit);

      return;
    }

    collectOwnMocks(value).forEach(visit);
  };

  visit(spy);

  return mocks;
}

/**
 * Clear recorded calls on every spy inside `spy` (configured return values are kept).
 *
 * @example
 * ```ts
 * clearAutoSpy(users); // recorded calls dropped; calledWith / resolveWith config kept
 * ```
 */
export function clearAutoSpy(spy: object): void {
  const adapter = getMockAdapter();

  collectMocks(spy).forEach((mock) => {
    adapter.clear(mock);
    runClearHook(mock);
  });
}

/**
 * Reset every spy inside `spy`: clears recorded calls and reverts all `calledWith`/return-value configuration.
 *
 * @example
 * ```ts
 * resetAutoSpy(users); // calls AND config dropped — every method returns undefined again
 * ```
 */
export function resetAutoSpy(spy: object): void {
  const adapter = getMockAdapter();

  collectMocks(spy).forEach((mock) => {
    adapter.clear(mock);
    runClearHook(mock);
    runConfigReset(mock);
  });
}
