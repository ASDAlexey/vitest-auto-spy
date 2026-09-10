/**
 * Runtime-agnostic accessor spying.
 *
 * Vitest exposes `vi.spyOn(obj, key, 'get' | 'set')`, but Bun and `node:test`
 * have no portable accessor-spy primitive. This helper wraps the existing
 * `get`/`set` of `target[property]` with a host mock (built by the adapter's own
 * `createMockFn`) by redefining the property — so every adapter that lacks a
 * native accessor spy shares one implementation.
 *
 * The wrapper that turns a non-configurable property into a diagnosable failure lives here too,
 * next to the `defineProperty` that raises it. It used to sit in `mock-adapter.ts`, which is one of
 * the modules pinned into `dist/shared-state.js`: that pulled `redefine-failure` and its message
 * into the shared file as well, where it was a second copy of code every entry's own graph already
 * carried. Moving it out took 2.4 kB off that file.
 */
import type { MockAdapter, MockFn } from './mock-adapter';
import { isCannotRedefine, redefineFailure } from './redefine-failure';
import type { Func } from './types';

/** The adapter's mock factory, narrowed to the single argument this helper passes. */
type CreateMockFn = (implementation?: Func) => MockFn;

/** The runtime-specific primitives a redefine-based adapter supplies; the accessor wiring is shared. */
interface RedefineAdapterParts {
  createMockFn: MockAdapter['createMockFn'];
  getCalls: MockAdapter['getCalls'];
  reset: MockAdapter['reset'];
  clear: MockAdapter['clear'];
  restoreImplementation: MockAdapter['restoreImplementation'];
}

/**
 * Assemble a {@link MockAdapter} for a runtime whose accessors are spied by
 * redefining the property (Bun, `node:test`). The runtime supplies `createMockFn`
 * / `getCalls` / `reset`; the `spyOnGetter` / `spyOnSetter` wiring through
 * {@link spyOnAccessorByRedefine} is shared so the two adapters don't duplicate it.
 */
export function createRedefineMockAdapter({
  createMockFn,
  getCalls,
  reset,
  clear,
  restoreImplementation,
}: RedefineAdapterParts): MockAdapter {
  return {
    createMockFn,
    spyOnGetter: (target: object, property: string): MockFn => spyOnAccessorByRedefine(createMockFn, target, property, 'get'),
    spyOnSetter: (target: object, property: string): MockFn => spyOnAccessorByRedefine(createMockFn, target, property, 'set'),
    getCalls,
    reset,
    clear,
    restoreImplementation,
  };
}

/** Replace one accessor of `target[property]` with a mock, preserving the other. Returns the mock. */
export function spyOnAccessorByRedefine(createMockFn: CreateMockFn, target: object, property: string, type: 'get' | 'set'): MockFn {
  const existing = Object.getOwnPropertyDescriptor(target, property);
  const original = type === 'get' ? existing?.get : existing?.set;
  const mock = createMockFn(original);

  const descriptor: PropertyDescriptor = { configurable: true, enumerable: existing?.enumerable ?? true };

  // Carry over the accessor we are not replacing, then install the mock.
  if (existing?.get) {
    descriptor.get = existing.get;
  }

  if (existing?.set) {
    descriptor.set = existing.set;
  }

  if (type === 'get') {
    descriptor.get = mock;
  } else {
    descriptor.set = mock;
  }

  Object.defineProperty(target, property, descriptor);

  return mock;
}

/** Run an accessor spy, translating a non-configurable property into a failure that names the way out. */
function spyOrExplain(spy: () => MockFn, target: object, property: string, accessor: 'get' | 'set'): MockFn {
  try {
    return spy();
  } catch (error) {
    if (isCannotRedefine(error)) {
      throw redefineFailure(
        `Cannot spy on the '${accessor}' accessor of '${property}': the property is not configurable, so it cannot be redefined.`,
        target,
        error,
      );
    }

    throw error;
  }
}

/**
 * Wrap an adapter so its two accessor spies report a non-configurable property in full.
 *
 * Applied by each adapter to itself rather than by `registerMockAdapter`, so the exported
 * adapter object and the registered one stay the same value — and so an adapter used directly (the
 * Bun and Node factories are exported) carries the diagnostic too.
 */
export function guardAccessorSpies(adapter: MockAdapter): MockAdapter {
  return {
    ...adapter,
    spyOnGetter: (target: object, property: string): MockFn =>
      spyOrExplain(() => adapter.spyOnGetter(target, property), target, property, 'get'),
    spyOnSetter: (target: object, property: string): MockFn =>
      spyOrExplain(() => adapter.spyOnSetter(target, property), target, property, 'set'),
  };
}
