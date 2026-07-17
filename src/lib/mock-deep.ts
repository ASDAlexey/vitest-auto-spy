/**
 * `mockDeep` — a recursive, class-free auto-mock (the deep counterpart of
 * {@link createAutoMock}).
 *
 * Every node is a function spy (same {@link createFunctionSpy} factory, so it
 * carries the identical `calledWith` / `mockReturnValue` / `resolveWith` helpers)
 * AND a Proxy: accessing an unknown key returns a *nested* deep node, cached per
 * key. That makes `mock.repo.user.find()` work with no manual seeding — each hop
 * is itself a callable, deeply-chainable spy.
 *
 * Access semantics mirror {@link createAutoMock}:
 *  - A key that exists on the underlying spy (`calledWith`, `mock`, `mockReturnValue`,
 *    …) resolves to that helper, so the spy API keeps working at every depth.
 *  - `then` and symbol keys never spawn children (so a node is not thenable and
 *    JS-internal protocols see `undefined`).
 *  - `overrides` seed concrete values on the root node; assigning (`mock.x = …`)
 *    seeds/updates a value that shadows the child for that key.
 */
import { createFunctionSpy } from './function-spy';
import type { DeepMockProxy, Func } from './types';

/** Build one deep-mock node: a function spy wrapped in a child-materializing Proxy. */
function createDeepNode(name: string, overrides: object): unknown {
  const spy = createFunctionSpy<Func>(name);
  const children = new Map<PropertyKey, unknown>();
  const seeded = new Map<PropertyKey, unknown>();

  for (const key of Reflect.ownKeys(overrides)) {
    seeded.set(key, Reflect.get(overrides, key));
  }

  const handler: ProxyHandler<Func> = {
    get(target, key, receiver): unknown {
      if (seeded.has(key)) {
        return seeded.get(key);
      }

      // Not thenable: awaiting a node must not treat it as a Promise.
      if (key === 'then') {
        return undefined;
      }

      // Real spy surface (calledWith / mock / mockReturnValue / …) wins over a child.
      if (key in target) {
        return Reflect.get(target, key, receiver);
      }

      // Never spawn children for JS-internal symbol protocols.
      if (typeof key === 'symbol') {
        return undefined;
      }

      if (!children.has(key)) {
        children.set(key, createDeepNode(`${name}.${String(key)}`, {}));
      }

      return children.get(key);
    },

    set(_target, key, value): boolean {
      seeded.set(key, value);

      return true;
    },
  };

  return new Proxy(spy, handler);
}

/**
 * Create a recursively-mocked `T` from its type alone (no class). Nested object
 * access auto-creates chainable spies; seed concrete values via `overrides`.
 */
export function mockDeep<T>(overrides: Partial<T> = {}): DeepMockProxy<T> {
  // The proxy tree assembles `T`'s deep spy surface lazily from runtime-accessed
  // keys, so its concrete `DeepMockProxy<T>` shape only exists structurally.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the deep mock is built dynamically from runtime-accessed keys; its `DeepMockProxy<T>` shape cannot be expressed before access.
  return createDeepNode('mockDeep', overrides) as DeepMockProxy<T>;
}
