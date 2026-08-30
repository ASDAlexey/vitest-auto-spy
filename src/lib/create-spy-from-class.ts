/**
 * `createSpyFromClass` — assemble the full auto-spy from a class: every
 * (inherited) prototype method becomes a function spy, plus any configured
 * observable properties and getter/setter accessors.
 */
import { createAccessorsSpies } from './accessor-spy';
import { createAutoMock } from './auto-mock';
import { DOCS_LINKS, withDocs } from './docs-links';
import { fillMissingMembers } from './fill-missing';
import { type UnstubbedGuard, createFunctionSpy, resolveUnstubbedGuard } from './function-spy';
import { getMockAdapter } from './mock-adapter';
import { requireObservableSupport } from './observable-support';
import { attachDispose } from './reset-auto-spy';
import type { ClassSpyConfiguration, ClassType, Func, OnlyMethodKeysOf, Spy, SpyOptions, UnstubbedCallHandler } from './types';

/** All names to spy on, flattened from either form of the config argument. */
interface ResolvedSpyConfiguration {
  methodsToSpyOn: string[];
  onlyMethodsToSpyOn: string[];
  instanceMethodsToSpyOn: string[];
  observablePropsToSpyOn: string[];
  settersToSpyOn: string[];
  gettersToSpyOn: string[];
  autoSpyAccessors: boolean;
  fillMissing: boolean;
  lazySpies: boolean;
  returns: Record<string, unknown>;
  overrides: object;
  strict: boolean | undefined;
  onUnstubbedCall: UnstubbedCallHandler | undefined;
}

/** Getter/setter accessor names discovered along a prototype chain. */
interface AccessorNames {
  getters: string[];
  setters: string[];
}

const EMPTY_CONFIGURATION: ResolvedSpyConfiguration = {
  methodsToSpyOn: [],
  onlyMethodsToSpyOn: [],
  instanceMethodsToSpyOn: [],
  observablePropsToSpyOn: [],
  settersToSpyOn: [],
  gettersToSpyOn: [],
  autoSpyAccessors: false,
  fillMissing: false,
  lazySpies: true,
  returns: {},
  overrides: {},
  strict: undefined,
  onUnstubbedCall: undefined,
};

/** Own, non-getter method names of a single prototype object (excluding the constructor). */
function extractMethodsFromObject(obj: object): string[] {
  const descriptors = Object.getOwnPropertyDescriptors(obj);

  return Object.keys(descriptors).filter((name) => name !== 'constructor' && !descriptors[name]?.get);
}

/**
 * Visit every prototype in the chain that has a parent — i.e. everything up to
 * but not including `Object.prototype` (whose parent is `null`). Shared by the
 * method- and accessor-name collectors so both stop before `Object`'s own
 * members (`__proto__`, `hasOwnProperty`, …).
 */
function walkOwnPrototypes(prototype: object, visit: (obj: object) => void): void {
  let current: object | null = prototype;

  while (current) {
    const parent: object | null = Object.getPrototypeOf(current);

    if (parent) {
      visit(current);
    }

    current = parent;
  }
}

// A class's method set is immutable for a run, but the same class is typically
// spied once per `beforeEach` — caching by prototype avoids re-walking the chain
// on every spy. `WeakMap` keeps this GC-safe (no retention of unused classes).
const methodNamesCache = new WeakMap<object, string[]>();

/** Walk the prototype chain and collect every method name (de-duplicated), including inherited ones. Cached per prototype. */
function getAllMethodNames(prototype: object): string[] {
  const cached = methodNamesCache.get(prototype);

  if (cached) {
    return cached;
  }

  const methods = new Set<string>();
  walkOwnPrototypes(prototype, (obj) => extractMethodsFromObject(obj).forEach((name) => methods.add(name)));

  const result = [...methods];
  methodNamesCache.set(prototype, result);

  return result;
}

// Same reasoning as `methodNamesCache`, and the same need: with `autoSpyAccessors` on, every
// `createSpyFromClass` — that is, every `beforeEach` — walked the chain again and materialised the
// descriptors of each level. `resolveAccessors` copies what it reads, so the cached lists are never
// handed to a caller that could mutate them.
const accessorNamesCache = new WeakMap<object, AccessorNames>();

/** Walk the prototype chain and collect every getter/setter name (de-duplicated), excluding the constructor. Cached per prototype. */
function getAllAccessorNames(prototype: object): AccessorNames {
  const cached = accessorNamesCache.get(prototype);

  if (cached) {
    return cached;
  }

  const getters = new Set<string>();
  const setters = new Set<string>();

  walkOwnPrototypes(prototype, (obj) => {
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
  });

  const result: AccessorNames = { getters: [...getters], setters: [...setters] };
  accessorNamesCache.set(prototype, result);

  return result;
}

/**
 * Decide which accessors to spy: the explicit lists, plus everything discovered when
 * `autoSpyAccessors` is on — and, either way, **the other half of a pair the prototype declares**.
 *
 * That last part is the rule worth stating. `gettersToSpyOn: ['manualSwitchKidMode']` on a class
 * that declares both a getter and a setter used to install the getter spy alone, and the double
 * came out poorer than the original exactly where the code under test expects symmetry: the
 * assignment `service.manualSwitchKidMode = false` landed on the no-op setter the spy scaffolding
 * installs, so the write vanished *and* there was nothing to assert on —
 * `accessorSpies.setters.manualSwitchKidMode` was `undefined`, and the failure said
 * `Cannot read properties of undefined`, three steps from the configuration that caused it.
 *
 * Mirroring is the whole of the fix, and it only ever adds what the class already has: a name is
 * promoted to the other list when the *prototype descriptor* carries that half, never on a guess.
 */
function resolveAccessors(prototype: object, config: ResolvedSpyConfiguration): AccessorNames {
  if (!config.autoSpyAccessors && config.gettersToSpyOn.length === 0 && config.settersToSpyOn.length === 0) {
    // The overwhelmingly common call names no accessors at all. Return before touching the
    // prototype chain, so `provideAutoSpy(Service)` stays as cheap as it was.
    return { getters: [], setters: [] };
  }

  const discovered = getAllAccessorNames(prototype);

  if (config.autoSpyAccessors) {
    return {
      getters: [...new Set([...config.gettersToSpyOn, ...discovered.getters])],
      setters: [...new Set([...config.settersToSpyOn, ...discovered.setters])],
    };
  }

  const declaredGetters = new Set(discovered.getters);
  const declaredSetters = new Set(discovered.setters);

  return {
    getters: [...new Set([...config.gettersToSpyOn, ...config.settersToSpyOn.filter((name) => declaredGetters.has(name))])],
    setters: [...new Set([...config.settersToSpyOn, ...config.gettersToSpyOn.filter((name) => declaredSetters.has(name))])],
  };
}

/**
 * Which names end up as method spies.
 *
 * `onlyMethodsToSpyOn` replaces prototype discovery; everything else adds to it. The two additive
 * lists — `methodsToSpyOn` and `instanceMethodsToSpyOn` — behave identically and differ only in what
 * their names tell a reader, so they are merged without ceremony.
 */
function resolveMethodNames<T>(ObjectClass: ClassType<T>, config: ResolvedSpyConfiguration): string[] {
  const base = config.onlyMethodsToSpyOn.length > 0 ? config.onlyMethodsToSpyOn : getAllMethodNames(ObjectClass.prototype);

  // The overwhelmingly common call is `provideAutoSpy(Service)` with no lists at all, once per
  // `beforeEach`. Returning the cached array untouched keeps that path allocation-free — building a
  // `Set` to merge two empty arrays would undo the per-prototype cache it just read from.
  if (config.methodsToSpyOn.length === 0 && config.instanceMethodsToSpyOn.length === 0) {
    return base;
  }

  return [...new Set([...base, ...config.methodsToSpyOn, ...config.instanceMethodsToSpyOn])];
}

/**
 * Warn (without throwing) when a name in a *restricting* list is absent from the class prototype.
 * Under `onlyMethodsToSpyOn` a typo does not just add a useless spy — it leaves the real method
 * unspied, and the code under test then calls something that is not there.
 */
function warnOnUnknownMethods(ObjectClass: ClassType<unknown>, requested: string[]): void {
  const available = new Set(getAllMethodNames(ObjectClass.prototype));
  const unknown = requested.filter((name) => !available.has(name));

  if (unknown.length === 0) {
    return;
  }

  // `console.warn` is the project-sanctioned diagnostic channel (CLAUDE.md); the
  // repo's `no-console` lint rule is stricter than that policy, so disable it here.
  // eslint-disable-next-line no-console -- intentional dev-time misconfiguration warning; console.warn is allowed per CLAUDE.md.
  console.warn(
    withDocs(
      `[vitest-auto-spy] createSpyFromClass(${ObjectClass.name}): onlyMethodsToSpyOn names method(s) that are not on ` +
        `the class prototype: ${unknown.join(', ')}. A spy was created for each, but the real code will never call ` +
        `it — check for typos. If the callable lives on the instance (an arrow property, a signal() field, an ngrx ` +
        `signalStore() method), prototype discovery cannot see it: name it in \`instanceMethodsToSpyOn\`, which adds ` +
        `to the discovered methods instead of replacing them.`,
      DOCS_LINKS.createSpyFromClass,
    ),
  );
}

/**
 * Warn when `gettersToSpyOn` / `settersToSpyOn` names a **method** of the class.
 *
 * The type no longer rejects a name by the type of its value — it cannot, because "is an accessor"
 * is a fact about the descriptor, and filtering by "not callable" is exactly what made every
 * signal-valued getter (`get isCompactMode(): Signal<boolean>`) unnameable. What is left to check is
 * the one case that is unambiguously a mistake rather than a style: naming a method installs a
 * spied accessor *over* it, so the method is no longer there to call.
 *
 * A plain instance field is deliberately not reported. Spying its accessors is a supported use, and
 * a field cannot be told from a typo without constructing the class — which this library never does.
 */
function warnOnAccessorNamingAMethod(ObjectClass: ClassType<unknown>, config: ResolvedSpyConfiguration): void {
  const requested = [...new Set([...config.gettersToSpyOn, ...config.settersToSpyOn])];

  if (requested.length === 0) {
    return;
  }

  const methods = new Set(getAllMethodNames(ObjectClass.prototype));
  const shadowed = requested.filter((name) => methods.has(name));

  if (shadowed.length === 0) {
    return;
  }

  // eslint-disable-next-line no-console -- intentional dev-time misconfiguration warning; console.warn is allowed per CLAUDE.md.
  console.warn(
    withDocs(
      `[vitest-auto-spy] createSpyFromClass(${ObjectClass.name}): gettersToSpyOn/settersToSpyOn name(s) that are ` +
        `methods of the class: ${shadowed.join(', ')}. A spied accessor was installed over each, so the method is no ` +
        `longer callable on the spy. Name it in methodsToSpyOn instead — or, if it is a signal() field read as a ` +
        `property, patch it with mockSignalProp(service, 'x', initial), which keeps everything downstream reactive.`,
      DOCS_LINKS.createSpyFromClass,
    ),
  );
}

/** Narrow an unknown member to the callable the adapter needs, without an assertion. */
function isCallable(value: unknown): value is Func {
  return typeof value === 'function';
}

/**
 * Install the configured return values.
 *
 * Through the adapter rather than through the host mock's `mockReturnValue`, because that method is
 * not part of every runner's surface — `node:test`'s `mock.fn()` has no such thing — and the
 * adapter is the seam that already hides those differences from the core.
 */
function applyReturns(autoSpy: object, ObjectClass: ClassType<unknown>, returns: Record<string, unknown>): void {
  const entries = Object.entries(returns);

  if (entries.length === 0) {
    // Nothing to install, and nothing to ask the registry for: a spy whose methods are never touched
    // is buildable before any runtime entry has registered an adapter, and that stays true.
    return;
  }

  const adapter = getMockAdapter();

  entries.forEach(([name, value]) => {
    // Reading materializes the lazy spy, which is what has to happen before it can be configured.
    // Through `Reflect.get` rather than an index access, because the object is either the assembled
    // record or the `createAutoMock` Proxy the empty-prototype path returns, and both answer a read.
    const spy: unknown = Reflect.get(autoSpy, name);

    if (!isCallable(spy)) {
      // eslint-disable-next-line no-console -- intentional dev-time misconfiguration warning; console.warn is allowed per CLAUDE.md.
      console.warn(
        withDocs(
          `[vitest-auto-spy] createSpyFromClass(${ObjectClass.name}): returns names '${name}', which is not a spied ` +
            `method of the spy. Check the spelling, and check that a restricting onlyMethodsToSpyOn list did not leave ` +
            `it out — a value configured for a method that is not there is silently never returned.`,
          DOCS_LINKS.createSpyFromClass,
        ),
      );

      return;
    }

    adapter.restoreImplementation(spy, () => value);
  });
}

/** Replace the accessor placeholder with the plain, writable data property the spy ends up as. */
function materializeMethodSpy(autoSpy: Record<string, unknown>, methodName: string, value: unknown): void {
  Object.defineProperty(autoSpy, methodName, { configurable: true, enumerable: true, writable: true, value });
}

/**
 * Install a lazily-materializing spy under `methodName`: the spy is created on first access, then
 * cached as a data property.
 *
 * The placeholder carries a setter as well, so that `spy.method = vi.fn()` — a common way to hand a
 * spy its implementation — keeps working. Without it the assignment would hit a getter-only
 * property and throw `TypeError: Cannot set property … which has only a getter` in strict mode,
 * which is how every ES module runs.
 */
function defineLazyMethodSpy(autoSpy: Record<string, unknown>, methodName: string, unstubbed: UnstubbedGuard | undefined): void {
  Object.defineProperty(autoSpy, methodName, {
    configurable: true,
    enumerable: true,
    get(): unknown {
      const spy = createFunctionSpy(methodName, unstubbed);
      materializeMethodSpy(autoSpy, methodName, spy);

      return spy;
    },
    set(value: unknown): void {
      materializeMethodSpy(autoSpy, methodName, value);
    },
  });
}

/** Normalize the overloaded second argument into a single flat configuration. */
function resolveConfiguration<T>(methodsToSpyOnOrConfig?: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[]): ResolvedSpyConfiguration {
  if (!methodsToSpyOnOrConfig) {
    return { ...EMPTY_CONFIGURATION };
  }

  if (Array.isArray(methodsToSpyOnOrConfig)) {
    return { ...EMPTY_CONFIGURATION, methodsToSpyOn: methodsToSpyOnOrConfig };
  }

  return {
    methodsToSpyOn: methodsToSpyOnOrConfig.methodsToSpyOn ?? [],
    onlyMethodsToSpyOn: methodsToSpyOnOrConfig.onlyMethodsToSpyOn ?? [],
    instanceMethodsToSpyOn: methodsToSpyOnOrConfig.instanceMethodsToSpyOn ?? [],
    observablePropsToSpyOn: methodsToSpyOnOrConfig.observablePropsToSpyOn ?? [],
    settersToSpyOn: methodsToSpyOnOrConfig.settersToSpyOn ?? [],
    gettersToSpyOn: methodsToSpyOnOrConfig.gettersToSpyOn ?? [],
    autoSpyAccessors: methodsToSpyOnOrConfig.autoSpyAccessors ?? false,
    fillMissing: methodsToSpyOnOrConfig.fillMissing ?? false,
    lazySpies: methodsToSpyOnOrConfig.lazySpies ?? true,
    returns: methodsToSpyOnOrConfig.returns ?? {},
    overrides: methodsToSpyOnOrConfig.overrides ?? {},
    strict: methodsToSpyOnOrConfig.strict,
    onUnstubbedCall: methodsToSpyOnOrConfig.onUnstubbedCall,
  };
}

/**
 * Generate a fully-typed auto-spy from a class.
 *
 * @example
 * ```ts
 * const users: Spy<UserService> = createSpyFromClass(UserService);
 *
 * users.getName.mockReturnValue('Ada');
 * users.load.calledWith(1).resolveWith({ id: 1 });
 *
 * // a callable that is an instance field, not on the prototype
 * createSpyFromClass(TaskStore, { instanceMethodsToSpyOn: ['reload'] });
 *
 * // a generated API client, whose useful signature is the first of four
 * createSpyFromClass<VenuesService, { overload: 'first' }>(VenuesService);
 * ```
 *
 * @remarks
 * Discovery walks the **prototype chain**, so a callable assigned in the constructor is invisible to
 * it: an arrow-function property, an Angular `signal()` field, and every method of an ngrx
 * `signalStore()`, which live on the instance. Name those in `instanceMethodsToSpyOn` — or build the
 * double from the type instead, with `createAutoMock<T>()`, which reads no prototype at all.
 */
export function createSpyFromClass<T, Options extends SpyOptions = SpyOptions>(
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[],
): Spy<T, Options> {
  const config = resolveConfiguration(methodsToSpyOnOrConfig);
  const autoSpy = assembleSpy<T, Options>(ObjectClass, config);

  applyReturns(autoSpy, ObjectClass, config.returns);
  applyOverrides(autoSpy, config.overrides);

  return autoSpy;
}

/**
 * Write the seeded members onto the finished spy.
 *
 * Last, and by assignment rather than by definition: on the assembled record it replaces a lazy
 * method placeholder through its setter, and on the `createAutoMock` proxy the empty prototype path
 * returns it lands in the same store the `get` trap reads. Both are what a seed has to do — shadow
 * whatever the factory produced for that key.
 */
function applyOverrides(autoSpy: object, overrides: object): void {
  for (const key of Reflect.ownKeys(overrides)) {
    Reflect.set(autoSpy, key, Reflect.get(overrides, key));
  }
}

/**
 * Build the spy object itself — every branch except the `returns` seeding, which is shared.
 *
 * Split out of {@link createSpyFromClass} so the empty-prototype fallback can hand back an entirely
 * different object (a Proxy rather than a record) while `returns` is still applied to whichever one
 * came back.
 */
function assembleSpy<T, Options extends SpyOptions>(ObjectClass: ClassType<T>, config: ResolvedSpyConfiguration): Spy<T, Options> {
  const accessors = resolveAccessors(ObjectClass.prototype, config);

  if (hasNothingToRead(ObjectClass, accessors, config)) {
    // The prototype named nothing, and the overwhelmingly common reason is that the class is
    // `abstract`: `abstract read(key: string): string` is a declaration, erased before it reaches a
    // prototype, so an `abstract class` DI token — the standard Angular shape,
    // `{ provide: LocalStorage, useClass: BrowserLocalStorage }` — walks out of the chain with an
    // empty method set. Assembling `{}` from that is worse than useless: the double is accepted by
    // DI, and then every call the code under test makes dies on "is not a function", pointing at
    // production code rather than at the spec.
    //
    // `createAutoMock<T>()` is the double for exactly this situation — it works from the *type*,
    // materialising a spy per accessed key — so hand back that instead of an empty record. It also
    // subsumes the workaround: naming the missing callables in `instanceMethodsToSpyOn` cannot be
    // needed on an object that answers every key. The same fallback covers a genuinely empty
    // concrete class, where a `{}` spy is no more useful, and `returns` is applied to it by the
    // caller either way.
    //
    // Throwing here — "use createAutoMock<T>()" — was the alternative, and it is worse: it turns
    // the single most common Angular token shape into a hard error with a manual workaround, when
    // the workaround is a thing this library can simply do.
    // Strict mode travels with it: a fully abstract class is exactly the wide-collaborator shape
    // `strict: true` exists for, and losing the flag at the fallback would switch it off silently.
    return createAutoMock<T, Options>(undefined, { strict: config.strict, onUnstubbedCall: config.onUnstubbedCall });
  }

  const methodNames = resolveMethodNames(ObjectClass, config);
  const unstubbed = resolveUnstubbedGuard(ObjectClass.name, config);

  // Only a restricting list can be silently wrong: a misspelled name there replaces the real method
  // with nothing, and the failure surfaces as `… is not a function` inside the code under test. In
  // an additive list a typo merely creates a spy nobody calls, which is what `jest-auto-spies` has
  // always done and not worth a warning.
  //
  // The second condition is what keeps it honest on an abstract class: there the prototype names
  // nothing at all, so *every* entry would be reported and none of it would be evidence of a typo —
  // the whitelist is the only way to describe such a class, and warning about the correct usage is
  // worse than saying nothing.
  if (config.onlyMethodsToSpyOn.length > 0 && getAllMethodNames(ObjectClass.prototype).length > 0) {
    warnOnUnknownMethods(ObjectClass, config.onlyMethodsToSpyOn);
  }

  const autoSpy: Record<string, unknown> = {};

  // Routed through the IoC registry so the core never statically imports rxjs;
  // requesting observable props without `vitest-auto-spy/rxjs` throws a clear hint.
  config.observablePropsToSpyOn.forEach((observablePropName) => {
    autoSpy[observablePropName] = requireObservableSupport().createPropSpy();
  });

  warnOnAccessorNamingAMethod(ObjectClass, config);
  createAccessorsSpies(autoSpy, accessors.getters, accessors.setters);

  // Lazy path materializes each method spy on first access (cheaper for large
  // classes where a test touches few methods); enumeration stays intact because
  // the placeholder is an enumerable accessor. Eager path is the default.
  methodNames.forEach((methodName) => {
    if (config.lazySpies) {
      defineLazyMethodSpy(autoSpy, methodName, unstubbed);
    } else {
      autoSpy[methodName] = createFunctionSpy(methodName, unstubbed);
    }
  });

  attachDispose(autoSpy);

  // `autoSpy` is assembled key-by-key from the runtime method/accessor names;
  // its concrete `Spy<T>` shape only exists structurally after assembly.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the spy object is built dynamically from runtime-discovered names; its `Spy<T>` shape cannot be expressed before assembly.
  return (config.fillMissing ? fillMissingMembers(autoSpy, unstubbed) : autoSpy) as Spy<T, Options>;
}

/**
 * Whether the prototype named nothing *and* nothing was configured that only the assembled record
 * can provide.
 *
 * The method lists are deliberately not consulted: on an empty prototype they are a workaround for
 * the very gap the fallback closes, and the proxy answers those names too. Observable props and
 * accessors are consulted, because they are not names — they are objects the record owns (the rxjs
 * prop spies and the `accessorSpies` bag), and a proxy has neither.
 */
function hasNothingToRead(ObjectClass: ClassType<unknown>, accessors: AccessorNames, config: ResolvedSpyConfiguration): boolean {
  return (
    getAllMethodNames(ObjectClass.prototype).length === 0 &&
    accessors.getters.length === 0 &&
    accessors.setters.length === 0 &&
    config.observablePropsToSpyOn.length === 0 &&
    // A *restricting* list asks for the opposite of what the proxy provides. `onlyMethodsToSpyOn`
    // is documented as "spy on these and no others, so an unexpected call fails loudly", and the
    // proxy answers every key — taking the fallback would discard the whitelist without a word and
    // silently disable the one thing the option exists for. The additive lists have no such
    // conflict: they ask for names to be present, which the proxy already guarantees.
    config.onlyMethodsToSpyOn.length === 0
  );
}
