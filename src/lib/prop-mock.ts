/**
 * Property mocking — replace a property (readonly field, getter, accessor pair, `signal()` /
 * `computed()` result) with a stub, and put the original descriptor back afterwards.
 *
 * Nothing here is Angular-specific: the helpers patch plain objects, class prototypes and globals.
 * `vitest-auto-spy/angular` re-exports them because that is where they were introduced, and the
 * core barrel exports them too so a React/Vue/Node suite can use the same undo bookkeeping.
 */
import { getMockAdapter } from './mock-adapter';

/** Undoes a single `mock*Prop` patch; calling it more than once is a no-op. */
export type RestoreProp = () => void;

/** Real implementations to put behind the spied accessors of {@link mockAccessorsProp}. */
export interface AccessorImplementations {
  get?: () => unknown;
  set?: (value: never) => void;
}

/** One property patch applied by the `mock*Prop` helpers, with the descriptor it replaced. */
interface PatchedProp {
  object: object;
  property: PropertyKey;
  descriptor: PropertyDescriptor | undefined;
}

/**
 * The patch log lives on `globalThis`, not in module scope, so that it survives a module-graph
 * reset: a spec calling `vi.resetModules()` (directly or through `vi.mock`) gets a fresh copy of
 * this module, and a module-scoped array would leave `restoreMockedProps()` restoring an empty one.
 */
declare global {
  // eslint-disable-next-line no-var -- a `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyPatchedProps__: PatchedProp[] | undefined;
}

function getPatchedProps(): PatchedProp[] {
  return (globalThis.__vitestAutoSpyPatchedProps__ ??= []);
}

/**
 * Record the descriptor a helper is about to overwrite and hand back the undo for *this* patch
 * alone — for the common case of a stub that must come off inside one test rather than at the end
 * of the file. {@link restoreMockedProps} undoes whatever is left.
 */
function rememberProp<T>(object: T, property: PropertyKey): RestoreProp {
  const patch: PatchedProp = {
    // The helpers only ever patch objects; the cast bridges the generic `T` of the public API.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `T` is unconstrained on the public signatures, but every caller passes an object (a service instance, a class prototype or a global).
    object: object as object,
    property,
    descriptor: Object.getOwnPropertyDescriptor(object, property),
  };

  getPatchedProps().push(patch);

  return () => {
    const patchedProps = getPatchedProps();
    const index = patchedProps.indexOf(patch);

    // Already undone (directly or by `restoreMockedProps`) — a second call must stay a no-op.
    if (index === -1) {
      return;
    }

    patchedProps.splice(index, 1);
    restorePatch(patch);
  };
}

/** Put one recorded descriptor back, or drop the property when the helper introduced it. */
function restorePatch({ object, property, descriptor }: PatchedProp): void {
  if (descriptor) {
    Object.defineProperty(object, property, descriptor);

    return;
  }

  Reflect.deleteProperty(object, property);
}

/**
 * Undo every patch the `mock*Prop` helpers applied since the last call, newest first.
 *
 * Nothing calls this for you: `vi.restoreAllMocks()` knows about spies, not about properties these
 * helpers redefined. It matters most when the patched object outlives the spec file — a global
 * (`globalThis.crypto`, `window.getComputedStyle`), a class prototype, a singleton — which is
 * always the case under Vitest's `isolate: false`, where the next file inherits the environment.
 * Wire it into a global `afterEach`/`afterAll` in your setup file, or call `setupAutoSpy()`
 * (`vitest-auto-spy/setup`), which does it for you.
 *
 * @example
 * ```ts
 * restoreMockedProps(); // undoes every mock*Prop patch — vi.restoreAllMocks() does not
 * ```
 */
export function restoreMockedProps(): void {
  const patchedProps = getPatchedProps();

  // Reverse order: the same property may have been patched more than once, and only the descriptor
  // recorded first is the original one.
  patchedProps.reverse().forEach(restorePatch);
  patchedProps.length = 0;
}

/**
 * How many `mock*Prop` patches are still applied — the signal `setupAutoSpy()`'s hygiene reports on.
 *
 * @example
 * ```ts
 * afterEach(() => expect(countMockedProps()).toBe(0));
 * ```
 */
export function countMockedProps(): number {
  return getPatchedProps().length;
}

/**
 * Override a readonly property (incl. `signal()` / `computed()`) with a static value.
 *
 * @example
 * ```ts
 * mockReadonlyProp(service, 'isReady', true);
 * mockReadonlyProp(service, 'count', signal(3)); // signals too
 * ```
 */
export function mockReadonlyProp<T, K extends keyof T>(object: T, property: K, value: T[K]): RestoreProp;
/** Escape hatch for members the public type does not describe — `#private` fields, ad-hoc keys. */
export function mockReadonlyProp<T>(object: T, property: PropertyKey, value: unknown): RestoreProp;
export function mockReadonlyProp<T>(object: T, property: PropertyKey, value: unknown): RestoreProp {
  const restore = rememberProp(object, property);

  Object.defineProperty(object, property, { get: () => value, configurable: true });

  return restore;
}

/**
 * Override a readonly property with a dynamic getter.
 *
 * @example
 * ```ts
 * let label = 'A';
 *
 * mockReadonlyPropGetter(service, 'label', () => label);
 * label = 'B'; // service.label is now 'B'
 * ```
 */
export function mockReadonlyPropGetter<T, K extends keyof T>(object: T, property: K, getter: () => unknown): RestoreProp;
/** Escape hatch for members the public type does not describe — `#private` fields, ad-hoc keys. */
export function mockReadonlyPropGetter<T>(object: T, property: PropertyKey, getter: () => unknown): RestoreProp;
export function mockReadonlyPropGetter<T>(object: T, property: PropertyKey, getter: () => unknown): RestoreProp {
  const restore = rememberProp(object, property);

  Object.defineProperty(object, property, { get: getter, configurable: true });

  return restore;
}

/**
 * Override a property with a plain writable value — the counterpart of {@link mockReadonlyProp} for
 * members the code under test assigns to, and the way to stub a method on a real (non-spy) instance.
 *
 * @example
 * ```ts
 * mockValueProp(service, 'retries', 3);
 * mockValueProp(globalThis, 'BackgroundWorker', createSpyClass(BackgroundWorker));
 * ```
 */
export function mockValueProp<T, K extends keyof T>(object: T, property: K, value: T[K]): RestoreProp;
/** Escape hatch for members the public type does not describe — `#private` fields, ad-hoc keys. */
export function mockValueProp<T>(object: T, property: PropertyKey, value: unknown): RestoreProp;
export function mockValueProp<T>(object: T, property: PropertyKey, value: unknown): RestoreProp {
  const restore = rememberProp(object, property);

  Object.defineProperty(object, property, { value, writable: true, configurable: true });

  return restore;
}

/**
 * Replace a property with spied `get`/`set` accessors (host-runner mocks). Pass `accessors` to give
 * either side a real implementation — the spy still records every read and write, which is what a
 * DOM property backed by an attribute (`input.valueAsNumber`, …) needs.
 *
 * @example
 * ```ts
 * const restore = mockAccessorsProp(service, 'theme');
 *
 * service.theme = 'dark';
 * expect(service.accessorSpies.setters.theme).toHaveBeenCalledWith('dark');
 * restore();
 * ```
 */
export function mockAccessorsProp<T, K extends keyof T>(object: T, property: K, accessors?: AccessorImplementations): RestoreProp;
/** Escape hatch for members the public type does not describe — `#private` fields, ad-hoc keys. */
export function mockAccessorsProp<T>(object: T, property: PropertyKey, accessors?: AccessorImplementations): RestoreProp;
export function mockAccessorsProp<T>(object: T, property: PropertyKey, accessors?: AccessorImplementations): RestoreProp {
  const adapter = getMockAdapter();
  const restore = rememberProp(object, property);

  Object.defineProperty(object, property, {
    get: adapter.createMockFn(accessors?.get),
    set: adapter.createMockFn(accessors?.set),
    configurable: true,
  });

  return restore;
}
