/**
 * What a prototype chain declares: the method and accessor names `createSpyFromClass` spies, and the
 * callable members `createSpyFromInstance` reads off a live object.
 */

/** Getter/setter accessor names discovered along a prototype chain. */
export interface AccessorNames {
  getters: string[];
  setters: string[];
}

/**
 * Own, non-accessor method names of a single prototype object (excluding the constructor).
 *
 * **Both** halves of an accessor are excluded, not just the getter. A setter-only member —
 * `set nickname(value: string)`, with no matching getter — has an `undefined` `get`, so a filter
 * that asks only about `get` classified it as a method and put a function spy on the key. That spy
 * was assigned *after* `createAccessorsSpies` had installed the spied accessor, so it replaced it:
 * `settersToSpyOn: ['nickname']` produced an `accessorSpies.setters.nickname` that recorded nothing,
 * `service.nickname = 'x'` overwrote the spy with a string, and the failure named neither. (The
 * same one-sided filter is why `jasmine-auto-spies` has the identical defect.)
 *
 * A name is a method when the prototype descriptor carries a value, which is what this now asks.
 *
 * **Symbol-keyed methods count**, with the language's own symbols left out — see
 * {@link isProtocolSymbol}. A class that declares `[SERIALIZE]()` or `[Symbol.for('app.render')]()`
 * used to walk out of discovery entirely, so `Spy<T>` typed the member and the double did not have
 * it; the read answered `undefined` and the failure landed inside the code under test.
 */
function extractMethodsFromObject(obj: object): PropertyKey[] {
  return Reflect.ownKeys(obj).filter((key) => {
    if (key === 'constructor' || isProtocolSymbol(key)) {
      return false;
    }

    const descriptor = Object.getOwnPropertyDescriptor(obj, key);

    return !descriptor?.get && !descriptor?.set;
  });
}

/**
 * Whether a key is one of the runtime's own symbols rather than a member of the type being doubled.
 *
 * Spying these is not an extra spy, it is a broken object: a spy at `Symbol.iterator` makes
 * `[...double]` throw where the class is iterable, one at `Symbol.toPrimitive` breaks every string
 * conversion, and one at `nodejs.util.inspect.custom` breaks the failure message that was about to
 * explain something else. `Symbol.dispose` is in the list for a second reason — `resetAutoSpy`
 * already owns that key on every double. The list is the same judgement `fillMissing` makes about
 * protocol keys, and it is derived rather than written out, so a symbol a future runtime adds to
 * `Symbol` is covered without an edit here.
 */
const PROTOCOL_SYMBOLS = new Set<PropertyKey>([
  ...Object.getOwnPropertyNames(Symbol)
    .map((name) => Reflect.get(Symbol, name))
    .filter((value): value is symbol => typeof value === 'symbol'),
  Symbol.for('nodejs.util.inspect.custom'),
]);

function isProtocolSymbol(key: PropertyKey): boolean {
  return PROTOCOL_SYMBOLS.has(key);
}

/**
 * Whether a level of the chain is `Object.prototype` itself — the one level whose members
 * (`hasOwnProperty`, `__proto__`, `toString`) belong to the language rather than to the type being
 * doubled.
 *
 * Asked by identity rather than by "has no parent", which is what a null prototype otherwise looks
 * like: `Object.create(null)` — a dictionary of handlers, an ngrx-style registry, a class built on a
 * null-prototype base — *is* the root of its own chain, so the "no parent" reading skipped the only
 * level that carried anything and `createSpyFromInstance` handed back an object with no spies on it
 * at all. The second half is the cross-realm case, where `Object.prototype` from another realm is
 * not this realm's: a parentless level that answers `hasOwnProperty` is one.
 */
function isObjectPrototype(level: object): boolean {
  return (
    level === Object.prototype || (Object.getPrototypeOf(level) === null && typeof Reflect.get(level, 'hasOwnProperty') === 'function')
  );
}

const NATIVE_SOURCE = /{\s*\[native code]\s*}\s*$/;

/**
 * A level whose constructor the runtime provides: `Error.prototype`, `Array.prototype`. The global
 * binding covers the host classes Node and jsdom write in JavaScript — `EventTarget`, `HTMLElement`.
 */
function isNativePrototype(level: object): boolean {
  const constructor: unknown = Object.getOwnPropertyDescriptor(level, 'constructor')?.value;

  return (
    typeof constructor === 'function' &&
    (NATIVE_SOURCE.test(Function.prototype.toString.call(constructor)) || globalBinding(constructor.name) === constructor)
  );
}

/** Vitest's jsdom and happy-dom environments install the window's classes as getters under `threads` and `forks`. */
function globalBinding(name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);

  return descriptor?.get ? descriptor.get.call(globalThis) : descriptor?.value;
}

/**
 * Visit every prototype in the chain up to but not including `Object.prototype`, so both the
 * method- and the accessor-name collector stop before `Object`'s own members.
 *
 * With `ownOnly`, a class that extends a built-in stops at the built-in too: `extends Error` spied
 * `toString` and `message`, `extends Array` every array method. A built-in doubled directly
 * (`createSpyFromClass(WebSocket)`) is still walked whole, since there it is the type itself.
 */
function walkOwnPrototypes(prototype: object, visit: (obj: object) => void, ownOnly = false): void {
  const stopAtNative = ownOnly && !isNativePrototype(prototype);
  let current: object | null = prototype;

  while (current && !(stopAtNative && isNativePrototype(current))) {
    if (!isObjectPrototype(current)) {
      visit(current);
    }

    current = Object.getPrototypeOf(current);
  }
}

/**
 * Callable members of a live object: its own function-valued fields plus every prototype method
 * below `Object.prototype`.
 *
 * Asks about the value rather than the shape of the descriptor, which is what separates it from
 * {@link extractMethodsFromObject}: on an instance the data properties are real values, so a plain
 * field would otherwise be spied over as if it were a method, and an accessor drops out for free by
 * having no `value` at all.
 */
export function getCallableMemberNames(target: object): PropertyKey[] {
  const names = new Set<PropertyKey>();

  walkOwnPrototypes(target, (obj) => {
    for (const key of Reflect.ownKeys(obj)) {
      if (key === 'constructor' || isProtocolSymbol(key)) {
        continue;
      }

      if (typeof Object.getOwnPropertyDescriptor(obj, key)?.value === 'function') {
        names.add(key);
      }
    }
  });

  return [...names];
}

// A class's method set is immutable for a run, but the same class is typically
// spied once per `beforeEach` — caching by prototype avoids re-walking the chain
// on every spy. `WeakMap` keeps this GC-safe (no retention of unused classes).
const methodNamesCache = new WeakMap<object, PropertyKey[]>();

const thenables = new WeakSet<object>();

/** Walk the prototype chain and collect every method name (de-duplicated), including inherited ones. Cached per prototype. */
export function getAllMethodNames(prototype: object): PropertyKey[] {
  const cached = methodNamesCache.get(prototype);

  if (cached) {
    return cached;
  }

  const methods = new Set<PropertyKey>();

  walkOwnPrototypes(prototype, (obj) => extractMethodsFromObject(obj).forEach((name) => methods.add(name)), true);

  if (methods.delete('then')) {
    thenables.add(prototype);
  }

  const result = [...methods];
  methodNamesCache.set(prototype, result);

  return result;
}

/**
 * Whether the chain declares a `then()` method, which discovery leaves out: a spy there makes the
 * double a thenable whose `then` never calls back, so `await double` hangs the test.
 */
export function declaresThen(prototype: object): boolean {
  getAllMethodNames(prototype);

  return thenables.has(prototype);
}

/** Every method the chain declares, `then` included — what a report about a misnamed method compares against. */
export function getDeclaredMethodNames(prototype: object): PropertyKey[] {
  const methods = getAllMethodNames(prototype);

  return declaresThen(prototype) ? [...methods, 'then'] : methods;
}

// Same reasoning as `methodNamesCache`, and the same need: with `autoSpyAccessors` on, every
// `createSpyFromClass` — that is, every `beforeEach` — walked the chain again and materialised the
// descriptors of each level. `resolveAccessors` copies what it reads, so the cached lists are never
// handed to a caller that could mutate them.
const accessorNamesCache = new WeakMap<object, AccessorNames>();

/** Walk the prototype chain and collect every getter/setter name (de-duplicated), excluding the constructor. Cached per prototype. */
export function getAllAccessorNames(prototype: object): AccessorNames {
  const cached = accessorNamesCache.get(prototype);

  if (cached) {
    return cached;
  }

  const getters = new Set<string>();
  const setters = new Set<string>();

  walkOwnPrototypes(
    prototype,
    (obj) => {
      const descriptors = Object.getOwnPropertyDescriptors(obj);

      Object.keys(descriptors).forEach((name) => {
        if (name === 'constructor') {
          return;
        }

        if (descriptors[name]?.get) {
          getters.add(name);
        }

        if (descriptors[name]?.set) {
          setters.add(name);
        }
      });
    },
    true,
  );

  const result: AccessorNames = { getters: [...getters], setters: [...setters] };
  accessorNamesCache.set(prototype, result);

  return result;
}
