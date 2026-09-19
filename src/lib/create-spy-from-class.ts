/**
 * `createSpyFromClass` — assemble the full auto-spy from a class: every
 * (inherited) prototype method becomes a function spy, plus any configured
 * observable properties and getter/setter accessors.
 */
import { createAccessorsSpies } from './accessor-spy';
import { createAutoMock } from './auto-mock';
import { DOCS_LINKS, withDocs } from './docs-links';
import { fillMissingMembers } from './fill-missing';
import { type UnstubbedGuard, createFunctionSpy, resolveUnstubbedGuard, seedReturnValue } from './function-spy';
import { createLazySpyProxy } from './lazy-spy-proxy';
import { reportMisconfiguration } from './misconfiguration';
import { getMockAdapter } from './mock-adapter';
import { attachDispose } from './reset-auto-spy';
import { warnOnAccessorNamingAMethod, warnOnUnknownMethods } from './spy-config-warnings';
import { mergeAutoSpyDefaults } from './spy-defaults';
import type {
  ClassSpyConfiguration,
  ClassType,
  Func,
  OnlyMethodKeysOf,
  Spy,
  SpyOptions,
  UnstubbedCallHandler,
  UnstubbedReadHandler,
} from './types';
import { createTrackedPropSpy, resolveReadGuard } from './unconfigured-reads';

/** All names to spy on, flattened from either form of the config argument. */
export interface ResolvedSpyConfiguration {
  methodsToSpyOn: string[];
  onlyMethodsToSpyOn: string[];
  instanceMethodsToSpyOn: string[];
  observablePropsToSpyOn: string[];
  settersToSpyOn: string[];
  gettersToSpyOn: string[];
  autoSpyAccessors: boolean;
  fillMissing: boolean;
  lazySpies: boolean | 'proxy';
  returns: Record<string, unknown>;
  selfReturning: string[];
  overrides: object;
  strict: boolean | undefined;
  onUnstubbedCall: UnstubbedCallHandler | undefined;
  onUnstubbedRead: UnstubbedReadHandler | undefined;
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
  selfReturning: [],
  overrides: {},
  strict: undefined,
  onUnstubbedCall: undefined,
  onUnstubbedRead: undefined,
};

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

/**
 * Visit every prototype in the chain up to but not including `Object.prototype`, so both the
 * method- and the accessor-name collector stop before `Object`'s own members.
 */
function walkOwnPrototypes(prototype: object, visit: (obj: object) => void): void {
  let current: object | null = prototype;

  while (current) {
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

/** Walk the prototype chain and collect every method name (de-duplicated), including inherited ones. Cached per prototype. */
function getAllMethodNames(prototype: object): PropertyKey[] {
  const cached = methodNamesCache.get(prototype);

  if (cached) {
    return cached;
  }

  const methods = new Set<PropertyKey>();
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
export function resolveAccessors(prototype: object, config: ResolvedSpyConfiguration): AccessorNames {
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
function resolveMethodNames<T>(ObjectClass: ClassType<T>, config: ResolvedSpyConfiguration): PropertyKey[] {
  return mergeMethodNames(
    config.onlyMethodsToSpyOn.length > 0 ? config.onlyMethodsToSpyOn : getAllMethodNames(ObjectClass.prototype),
    config,
  );
}

/** Fold the two additive lists into whatever discovery produced. */
export function mergeMethodNames(base: PropertyKey[], config: ResolvedSpyConfiguration): PropertyKey[] {
  // The overwhelmingly common call is `provideAutoSpy(Service)` with no lists at all, once per
  // `beforeEach`. Returning the cached array untouched keeps that path allocation-free — building a
  // `Set` to merge two empty arrays would undo the per-prototype cache it just read from.
  if (config.methodsToSpyOn.length === 0 && config.instanceMethodsToSpyOn.length === 0) {
    return base;
  }

  return [...new Set<PropertyKey>([...base, ...config.methodsToSpyOn, ...config.instanceMethodsToSpyOn])];
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
export function applyReturns(autoSpy: object, factory: string, returns: Record<string, unknown>, option = 'returns'): void {
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
      reportMisconfiguration(
        withDocs(
          `[vitest-auto-spy] ${factory}: ${option} names '${name}', which is not a spied ` +
            `method of the spy. Check the spelling, and check that a restricting onlyMethodsToSpyOn list did not leave ` +
            `it out — a value configured for a method that is not there is silently never returned.`,
          DOCS_LINKS.createSpyFromClass,
        ),
      );

      return;
    }

    if (!seedReturnValue(spy, value)) {
      adapter.restoreImplementation(spy, () => value);
    }
  });
}

/**
 * `selfReturning`, then `returns`: both are defaults in the spy's own container, and the second pass
 * overwrites the first, so a method named in both answers its `returns` value — the only way a spec
 * can take one link out of a registered chain, since lists merge by union.
 */
export function applyConfiguredReturns(
  double: object,
  factory: string,
  config: Pick<ResolvedSpyConfiguration, 'returns' | 'selfReturning'>,
): void {
  applyReturns(double, factory, Object.fromEntries(config.selfReturning.map((name) => [name, double])), 'selfReturning');
  applyReturns(double, factory, config.returns);
}

/**
 * The probe that takes a double off the property map it shares with every other double of its
 * class, and the set of doubles already taken off it.
 *
 * Sharing one accessor pair per method name is what makes an untouched double cost ~70 B instead of
 * ~25 kB — and it is also what makes the *first* materialisation expensive on V8: every double of
 * the class is then on the same fast-mode map, and turning one accessor into a data property
 * rewrites that map rather than updating a hash. Measured on a 300-method class it is the
 * difference between 31 µs and 1.5 ms to materialise the lot. Defining and deleting one property
 * drops the object into dictionary mode, where the reconfiguration is a hash update again; doing it
 * on the first materialisation rather than at build keeps the untouched double — the one whose size
 * decides whether a suite survives `isolate: false` — on the shared map.
 */
const PLACEHOLDER_PROBE = Symbol('vitest-auto-spy.placeholderProbe');

const dictionaryDoubles = new WeakSet<object>();

function dropSharedPropertyMap(autoSpy: object): void {
  if (dictionaryDoubles.has(autoSpy)) {
    return;
  }

  dictionaryDoubles.add(autoSpy);
  Object.defineProperty(autoSpy, PLACEHOLDER_PROBE, { configurable: true, value: true });
  Reflect.deleteProperty(autoSpy, PLACEHOLDER_PROBE);
}

/** Replace the accessor placeholder with the plain, writable data property the spy ends up as. */
function materializeMethodSpy(autoSpy: object, methodName: PropertyKey, value: unknown): void {
  if (Object.isExtensible(autoSpy)) {
    dropSharedPropertyMap(autoSpy);
  } else if (!Object.getOwnPropertyDescriptor(autoSpy, methodName)?.configurable) {
    membersOfSealedDouble(autoSpy).set(methodName, value);

    return;
  }

  Object.defineProperty(autoSpy, methodName, { configurable: true, enumerable: true, writable: true, value });
}

/**
 * The spies of a double that was frozen or sealed before its methods were read.
 *
 * A placeholder materialises by redefining itself, and a frozen double refuses that — so the first
 * read of any method threw `Cannot redefine property`, from inside a getter, on a double that had
 * done nothing wrong. Deep-freezing fixtures and dev-mode state guards do this to whatever they are
 * handed, and `lazySpies: 'proxy'` already survives it (its `preventExtensions` trap materialises
 * everything first). Keeping the spy beside the double preserves the one thing the read has to
 * guarantee — the same method answers the same spy every time — without writing to an object whose
 * owner asked for it not to be written to.
 */
const sealedDoubleMembers = new WeakMap<object, Map<PropertyKey, unknown>>();

function membersOfSealedDouble(autoSpy: object): Map<PropertyKey, unknown> {
  let members = sealedDoubleMembers.get(autoSpy);

  if (!members) {
    members = new Map<PropertyKey, unknown>();
    sealedDoubleMembers.set(autoSpy, members);
  }

  return members;
}

/**
 * The strict-mode guard of a double whose method spies do not exist yet.
 *
 * Off the double rather than on it: the placeholders below are shared between every double of every
 * class, so the guard cannot travel in their closures any more — and a symbol property would put it
 * on the double itself, where `Reflect.ownKeys` and every copy of the double would carry it. Only a
 * strict double has an entry.
 */
const lazyGuards = new WeakMap<object, UnstubbedGuard>();

/**
 * One `get`/`set` pair per method *name*, shared by every double that has a method of that name.
 *
 * The pair used to be minted per method per double, and on a wide class that is what an untouched
 * double retained: distinct accessor functions per key mean a property map per double, 25.6 kB of
 * it for a 100-method class against 70 B for a shared pair — the figure that decides whether a
 * suite survives `isolate: false`, and the reason `lazySpies: 'proxy'` exists at all.
 *
 * Reading the double through `this` is what makes the sharing possible, and it is also the whole of
 * the behaviour change: `Object.create(double).method` materialises on the heir rather than on the
 * double. Nothing in the library reads a double through a heir, and a test that does has said so.
 */
const lazyAccessors = new Map<PropertyKey, PropertyDescriptor>();

function lazyAccessorFor(methodName: PropertyKey): PropertyDescriptor {
  let accessor = lazyAccessors.get(methodName);

  if (!accessor) {
    accessor = {
      configurable: true,
      enumerable: true,
      get(this: object): unknown {
        const sealed = Object.isExtensible(this) ? undefined : membersOfSealedDouble(this);

        if (sealed?.has(methodName)) {
          return sealed.get(methodName);
        }

        const spy = createFunctionSpy(String(methodName), lazyGuards.get(this));
        materializeMethodSpy(this, methodName, spy);

        return spy;
      },
      set(this: object, value: unknown): void {
        materializeMethodSpy(this, methodName, value);
      },
    };

    lazyAccessors.set(methodName, accessor);
  }

  return accessor;
}

/**
 * Install a lazily-materializing spy under `methodName`: the spy is created on first access, then
 * cached as a data property.
 *
 * The placeholder carries a setter as well, so that `spy.method = vi.fn()` — a common way to hand a
 * spy its implementation — keeps working. Without it the assignment would hit a getter-only
 * property and throw `TypeError: Cannot set property … which has only a getter` in strict mode,
 * which is how every ES module runs.
 *
 * The pair itself is shared per name — see {@link lazyAccessorFor} — so the guard is registered
 * beside the double rather than captured in it.
 */
function defineLazyMethodSpy(autoSpy: object, methodName: PropertyKey, unstubbed: UnstubbedGuard | undefined): void {
  if (unstubbed) {
    lazyGuards.set(autoSpy, unstubbed);
  }

  Object.defineProperty(autoSpy, methodName, lazyAccessorFor(methodName));
}

/** Normalize the overloaded second argument into a single flat configuration. */
export function resolveConfiguration<T>(
  methodsToSpyOnOrConfig?: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[],
): ResolvedSpyConfiguration {
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
    selfReturning: methodsToSpyOnOrConfig.selfReturning ?? [],
    overrides: methodsToSpyOnOrConfig.overrides ?? {},
    strict: methodsToSpyOnOrConfig.strict,
    onUnstubbedCall: methodsToSpyOnOrConfig.onUnstubbedCall,
    onUnstubbedRead: methodsToSpyOnOrConfig.onUnstubbedRead,
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
  // The class's registration first, the call site's own configuration merged over it — so a spec
  // that needs one extra member names one extra member instead of restating the composition.
  const config = resolveConfiguration(mergeAutoSpyDefaults(ObjectClass, methodsToSpyOnOrConfig));
  const autoSpy = assembleSpy<T, Options>(ObjectClass, config);

  applyConfiguredReturns(autoSpy, `createSpyFromClass(${ObjectClass.name})`, config);
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
    const value: unknown = Reflect.get(overrides, key);
    // The bag through its descriptor, never through a read: on the `createAutoMock` proxy the
    // abstract-class fallback returns, reading a key *mints* a spy for it — so asking for
    // `accessorSpies` there put a function spy nobody wanted into `ownKeys`, into every spread and
    // into `explainSpy`. A proxy has no descriptor for it, which is the right answer.
    const bag: unknown = Object.getOwnPropertyDescriptor(autoSpy, 'accessorSpies')?.value;
    const getterSpy: unknown = Reflect.get(Object(Reflect.get(Object(bag), 'getters')), key);

    // A spied getter (`gettersToSpyOn`, or a class default that names one) swallows an assignment
    // into its setter and keeps answering `undefined`, so the seed becomes what the getter returns.
    if (isCallable(getterSpy)) {
      getMockAdapter().restoreImplementation(getterSpy, () => value);
    } else if (!Reflect.set(autoSpy, key, value) || !Object.is(Reflect.get(autoSpy, key), value)) {
      Object.defineProperty(autoSpy, key, { value, writable: true, configurable: true, enumerable: true });
    }
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
    warnOnUnknownMethods(
      `createSpyFromClass(${ObjectClass.name})`,
      config.onlyMethodsToSpyOn,
      new Set(getAllMethodNames(ObjectClass.prototype)),
    );
  }

  const autoSpy: Record<string, unknown> = {};
  const reads =
    accessors.getters.length > 0 || config.observablePropsToSpyOn.length > 0 ? resolveReadGuard(ObjectClass.name, config) : undefined;

  // Routed through the IoC registry so the core never statically imports rxjs;
  // requesting observable props without `vitest-auto-spy/rxjs` throws a clear hint.
  config.observablePropsToSpyOn.forEach((observablePropName) => {
    autoSpy[observablePropName] = createTrackedPropSpy(observablePropName, reads);
  });

  // Gated here rather than left to the function's own early return: the method set costs a
  // prototype-chain walk, and the overwhelmingly common call names no accessors at all.
  if (config.gettersToSpyOn.length > 0 || config.settersToSpyOn.length > 0) {
    warnOnAccessorNamingAMethod(`createSpyFromClass(${ObjectClass.name})`, config, new Set(getAllMethodNames(ObjectClass.prototype)));
  }
  createAccessorsSpies(autoSpy, accessors.getters, accessors.setters, reads);

  // Lazy path materializes each method spy on first access (cheaper for large
  // classes where a test touches few methods); enumeration stays intact because
  // the placeholder is an enumerable accessor. Eager path is the default.
  //
  // `'proxy'` defines nothing at all for the methods — one trap object answers all of them, so what
  // an untouched double retains stops scaling with the width of the class. The names are handed to
  // the wrapper below instead of being defined here.
  //
  // A **symbol-keyed** method is defined on the record in every mode, `'proxy'` included: the trap
  // object answers string names, and reporting a symbol from `ownKeys` that the target does not have
  // is what a Proxy may not do. There are never many of them, so nothing scales with this.
  methodNames.forEach((methodName) => {
    if (config.lazySpies === 'proxy' && typeof methodName === 'string') {
      return;
    }

    if (config.lazySpies) {
      defineLazyMethodSpy(autoSpy, methodName, unstubbed);
    } else {
      Object.defineProperty(autoSpy, methodName, {
        value: createFunctionSpy(String(methodName), unstubbed),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  });

  attachDispose(autoSpy);

  // Wrapped after `attachDispose`, so the dispose symbol is on the record the traps forward to
  // rather than on a key the proxy has to special-case.
  const assembled =
    config.lazySpies === 'proxy'
      ? createLazySpyProxy(
          autoSpy,
          methodNames.filter((name): name is string => typeof name === 'string'),
          unstubbed,
        )
      : autoSpy;

  // `autoSpy` is assembled key-by-key from the runtime method/accessor names;
  // its concrete `Spy<T>` shape only exists structurally after assembly.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the spy object is built dynamically from runtime-discovered names; its `Spy<T>` shape cannot be expressed before assembly.
  return (config.fillMissing ? fillMissingMembers(assembled, unstubbed) : assembled) as Spy<T, Options>;
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
