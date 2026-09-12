/**
 * `provideWindowDouble()` / `provideDocumentDouble()` — a `window` or `document` for DI that stays
 * the real one everywhere the spec did not say otherwise.
 *
 * These are the two most hand-rolled providers in an Angular suite: 95 `window` ones and 70
 * `document` ones across two private codebases, written three ways — `useValue: window` (no
 * isolation at all: whatever the test writes stays there for the rest of the worker), a slice
 * (`{ screen: { width: 1280, height: 720 } }`), and a `mockDocument` with one hand-written
 * `querySelector`. The slice and the hand-written document share a failure: the component under
 * test reads `screen.colorDepth`, or calls `document.createElement`, and gets `undefined` — the
 * double only knows the members its author happened to think of, and the spec fails somewhere that
 * has nothing to do with what it was testing.
 *
 * So the double is not built from scratch. It is a **view over the real jsdom object**: every read
 * the overrides do not name falls through to the real `window` / `document`, and every write and
 * delete lands on the view rather than on the global, so nothing a test does survives it. That is
 * also why there is no teardown to call — `restoreMockedProps()` has nothing to put back, because
 * nothing was patched.
 *
 * **Why a `Proxy` and not `{ ...window, ...overrides }` or `Object.create(window)`.** Neither
 * works. A spread copies the own enumerable properties, and jsdom keeps `document.querySelector`,
 * `document.body` and most of `Screen` on the prototype, so the copy is nearly empty. A derived
 * object has them, but they are Web IDL methods: called with anything but the real instance as
 * `this` they throw `'querySelector' called on an object that is not a valid instance of Document`.
 * The proxy hands each method out bound to the real object, which is the only shape that answers
 * both.
 *
 * **Why the window helper takes a token and the document helper does not.** Angular ships
 * `DOCUMENT` — since v20 from `@angular/core` itself, which is what this entry imports, so
 * `@angular/common` stays out of it. There is no Angular `WINDOW` token and there never has been:
 * every application declares its own `InjectionToken<Window>`, so `provideWindowDouble` has to be
 * handed that one. It is generic over the token's type, so an app whose token is
 * `InjectionToken<AppWindow>` gets its own members checked in the overrides too.
 */
import { DOCUMENT, type FactoryProvider, type ProviderToken } from '@angular/core';

/**
 * What a spec says about a platform object: a value per member, and a **slice** wherever the member
 * is itself an object — `{ screen: { width: 1920 } }` leaves `screen.colorDepth` real.
 */
export type PlatformOverrides<T> = {
  // A method is matched whole and first: `Partial<(…) => …>` is a mapped type over a function, which
  // drops the call signature and leaves `{}` — a slice branch that accepts anything at all.
  [K in keyof T]?: T[K] extends (...args: never[]) => unknown ? T[K] : T[K] extends object ? Partial<T[K]> | T[K] : T[K];
};

type Slots = Record<PropertyKey, unknown>;

/**
 * Whether an override merges into the real member or replaces it.
 *
 * A plain `{ … }` merges — that is the `screen` / `location` slice, the shape this helper exists
 * for. Everything else replaces, and deliberately: a `vi.fn()`, an array, a `URL`, a stub class
 * instance is a thing the spec built to stand in for the member, not a description of it.
 */
function isSlice(value: unknown): value is Slots {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Reflect.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function valueSlot(value: unknown): PropertyDescriptor {
  return { value, writable: true, enumerable: true, configurable: true };
}

/** What one double knows: the object behind it, what the spec said, and what was built from that. */
interface View {
  readonly real: object;
  readonly slots: Map<string | symbol, PropertyDescriptor>;
  readonly slices: Map<string | symbol, unknown>;
  readonly bound: WeakMap<object, unknown>;
}

function readSlice(view: View, key: string | symbol, override: Slots): unknown {
  const built = view.slices.get(key);

  if (built !== undefined) {
    return built;
  }

  const actual: unknown = Reflect.get(view.real, key, view.real);

  if (typeof actual !== 'object' || actual === null) {
    return override;
  }

  const slice = mergeOver(actual, override);

  view.slices.set(key, slice);

  return slice;
}

function readReal(view: View, key: string | symbol): unknown {
  const actual: unknown = Reflect.get(view.real, key, view.real);

  if (typeof actual !== 'function') {
    return actual;
  }

  // Bound to the real object, and remembered per function rather than per key: a method handed out
  // twice has to be the same function, or code that stores one and compares it later breaks.
  const handle = view.bound.get(actual);

  if (handle !== undefined) {
    return handle;
  }

  const fresh: unknown = actual.bind(view.real);

  view.bound.set(actual, fresh);

  return fresh;
}

function read(view: View, key: string | symbol, receiver: unknown): unknown {
  const slot = view.slots.get(key);

  if (slot === undefined) {
    return readReal(view, key);
  }

  if (slot.get !== undefined) {
    return slot.get.call(receiver);
  }

  const override: unknown = slot.value;

  return isSlice(override) ? readSlice(view, key, override) : override;
}

function mergeOver<T extends object>(real: T, overrides: Slots): T {
  // Copied into descriptors, so the record the caller passed is never written to: the same
  // overrides object is usually a module constant shared by every test of the file.
  const slots = new Map<string | symbol, PropertyDescriptor>();

  for (const key of Reflect.ownKeys(overrides)) {
    slots.set(key, valueSlot(Reflect.get(overrides, key)));
  }

  const view: View = { real, slots, slices: new Map(), bound: new WeakMap() };
  // The proxy stands on an empty object of the real one's prototype rather than on the real object
  // itself: `location.reload` and the rest of the unforgeable members are own, non-configurable and
  // non-writable, and a proxy may not answer for such a member with anything but its real value.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- an object built from the real prototype is a `T` for every read that matters; the traps below answer before the target is ever consulted.
  const target = Object.create(Reflect.getPrototypeOf(real)) as T;

  return new Proxy(target, {
    get: (_target, key, receiver): unknown => read(view, key, receiver),
    set(_target, key, value, receiver): boolean {
      const slot = slots.get(key);

      if (slot?.set !== undefined) {
        slot.set.call(receiver, value);

        return true;
      }

      slots.set(key, valueSlot(value));
      view.slices.delete(key);

      return true;
    },
    defineProperty(_target, key, descriptor): boolean {
      // Configurable whatever the caller asked for: a proxy may not report a non-configurable
      // member its target does not have, and the target here has none of them.
      slots.set(key, { ...descriptor, configurable: true });
      view.slices.delete(key);

      return true;
    },
    deleteProperty(_target, key): boolean {
      slots.delete(key);
      view.slices.delete(key);

      return true;
    },
    has: (_target, key): boolean => slots.has(key) || Reflect.has(real, key),
    ownKeys: (): (string | symbol)[] => [...new Set([...Reflect.ownKeys(real), ...slots.keys()])],
    getOwnPropertyDescriptor(_target, key): PropertyDescriptor | undefined {
      const slot = slots.get(key);

      if (slot !== undefined) {
        return slot;
      }

      const actual = Reflect.getOwnPropertyDescriptor(real, key);

      return actual === undefined ? undefined : { ...actual, configurable: true };
    },
  });
}

/**
 * The `window` double without a `TestBed` — for a class built with `new`, or a plain function.
 *
 * ```ts
 * const win = createWindowDouble({ innerWidth: 375, screen: { width: 375 } });
 * const layout = new LayoutProbe(win);
 * ```
 */
export function createWindowDouble(overrides?: PlatformOverrides<Window>): Window;
/** For an application window type of its own: `createWindowDouble<AppWindow>({ appBuildId: '…' })`. */
export function createWindowDouble<T extends Window>(overrides: PlatformOverrides<T>): T;
export function createWindowDouble(overrides: PlatformOverrides<Window> = {}): Window {
  return mergeOver(globalThis.window, overrides);
}

/**
 * The `document` double without a `TestBed`.
 *
 * ```ts
 * const doc = createDocumentDouble({ visibilityState: 'hidden' });
 * ```
 */
export function createDocumentDouble(overrides: PlatformOverrides<Document> = {}): Document {
  return mergeOver(globalThis.document, overrides);
}

/**
 * Provide a `window` under the application's own token, with the real one behind it.
 *
 * ```ts
 * TestBed.configureTestingModule({
 *   providers: [provideWindowDouble(WINDOW, { screen: { width: 1920, height: 1080 } })],
 * });
 * ```
 *
 * `screen.colorDepth`, `location.href`, `getComputedStyle`, `addEventListener` and everything else
 * the overrides did not name still answer the way jsdom answers them. Writes the code under test
 * makes land on the double rather than on the global, which is also how a spec moves a value
 * mid-test: `Object.assign(TestBed.inject(WINDOW), { scrollY: 40 })` — `Object.assign` rather than
 * an assignment because lib.dom declares most of `Window` `readonly`. There is no handle to learn.
 *
 * A factory, so every injector builds its own: a provider array hoisted to a module constant never
 * carries one test's writes into the next.
 */
export function provideWindowDouble<T extends Window>(token: ProviderToken<T>, overrides: PlatformOverrides<T> = {}): FactoryProvider {
  return { provide: token, useFactory: (): T => createWindowDouble<T>(overrides) };
}

/**
 * Provide a `document` under Angular's `DOCUMENT`, with the real one behind it.
 *
 * ```ts
 * TestBed.configureTestingModule({
 *   providers: [provideDocumentDouble({ querySelector: vi.fn().mockReturnValue(anchor) })],
 * });
 * ```
 *
 * Pass a second argument for an application token that is not `DOCUMENT`. Note that overriding
 * `DOCUMENT` for the testing module hands the double to Angular's renderer as well, so replace
 * `createElement` or `body` only when the spec means to.
 */
export function provideDocumentDouble(
  overrides: PlatformOverrides<Document> = {},
  token: ProviderToken<Document> = DOCUMENT,
): FactoryProvider {
  return { provide: token, useFactory: (): Document => createDocumentDouble(overrides) };
}
