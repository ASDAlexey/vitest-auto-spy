/**
 * Runtime-agnostic accessor spying.
 *
 * Vitest exposes `vi.spyOn(obj, key, 'get' | 'set')`, but Bun and `node:test`
 * have no portable accessor-spy primitive. This helper wraps the existing
 * `get`/`set` of `target[property]` with a host mock (built by the adapter's own
 * `createMockFn`) by redefining the property — so every adapter that lacks a
 * native accessor spy shares one implementation.
 */
import type { MockAdapter, MockFn } from './mock-adapter';
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
