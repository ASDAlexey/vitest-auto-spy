/**
 * `fillMissing` — answer a member the prototype never named with a spy, instead of `undefined`.
 *
 * The empty-prototype fallback in {@link createSpyFromClass} covers a *fully* abstract class: the
 * chain names nothing, so the factory hands back the `createAutoMock` proxy and every method
 * answers. One concrete member is enough to leave that path — and a partially abstract class is the
 * common Angular shape, a DI token with a handful of `abstract` declarations and one concrete
 * helper or getter. Discovery then finds the concrete member, the fallback does not fire, and the
 * abstract ones are simply absent: `Spy<T>` types them as present, the read yields `undefined`, and
 * the failure surfaces as `… is not a function` inside production code with nothing pointing at the
 * spec.
 *
 * Nothing can detect that automatically. TypeScript erases `abstract` entirely — at runtime a
 * partially abstract class and a concrete one are the same object — so filling every unknown key by
 * default would silence a genuine typo on every concrete class in the suite, which is the property
 * that distinguishes this library from the proxy-per-property mocks. Hence an opt-in.
 *
 * The wrapper delegates: a member the record has is read from the record (including a lazy
 * placeholder, which materialises exactly as it would without the proxy), and only a name it does
 * not have becomes a new spy. Enumeration, `has` and descriptors are left to the target, so
 * `Object.keys` reports what was really assembled rather than every key anybody ever touched.
 */
import { createFunctionSpy } from './function-spy';
import type { Func } from './types';

/**
 * Keys the surrounding machinery probes on an arbitrary object to decide *what kind of thing it
 * is*. Answering one with a function is not a harmless extra spy — it makes the double claim a
 * protocol it cannot honour, and the damage lands far from here:
 *
 * - `then` — a thenable, so `await spy` waits on a promise nobody resolves.
 * - `constructor` — read by `instanceof`-shaped checks and by every serializer.
 * - `toJSON` — `JSON.stringify` and the snapshot serializers call it and print its return value.
 * - `asymmetricMatch` — `expect` decides "is this an asymmetric matcher?" by reading it, so a spy
 *   there turns every `toEqual` against the double into a matcher invocation.
 * - `$$typeof` / `nodeType` — how `pretty-format` recognises a React element and a DOM node, which
 *   is what formats the diff in a failure message.
 * - any symbol — the runtime's own protocols (iteration, `toPrimitive`, `nodejs.util.inspect`).
 *
 * The list is deliberately about *protocols*, not about tidiness. A member the double genuinely
 * declares under one of these names is the rare case, and naming it in `instanceMethodsToSpyOn`
 * still works.
 */
const PROTOCOL_KEYS = new Set<PropertyKey>(['then', 'constructor', 'toJSON', 'asymmetricMatch', '$$typeof', 'nodeType']);

/** Whether a key belongs to the runtime rather than to the type being doubled. */
function isInternalKey(key: PropertyKey): boolean {
  return typeof key === 'symbol' || PROTOCOL_KEYS.has(key);
}

/**
 * Wrap an assembled spy record so that reading a member it does not have mints a function spy and
 * caches it on the record.
 *
 * @param autoSpy The record `createSpyFromClass` assembled from the prototype.
 * @returns The same object's behaviour, plus an answer for names the prototype never carried.
 */
export function fillMissingMembers(autoSpy: Record<string, unknown>): Record<string, unknown> {
  return new Proxy(autoSpy, {
    get(target: Record<string, unknown>, key: PropertyKey): unknown {
      // `in` and not `hasOwnProperty`: an inherited `toString` is a member the record answers, and
      // shadowing it with a spy would break every message that formats the double.
      if (key in target || isInternalKey(key)) {
        return Reflect.get(target, key);
      }

      const spy = createFunctionSpy<Func>(String(key));

      // Written back as a plain data property, exactly as the lazy placeholder does when it
      // materialises, so the second read is an ordinary lookup and `Object.keys` now names it.
      Object.defineProperty(target, key, { configurable: true, enumerable: true, writable: true, value: spy });

      return spy;
    },
  });
}
