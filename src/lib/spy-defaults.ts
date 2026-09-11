/**
 * `registerAutoSpyDefaults` — what a double of *this* class always needs, said once.
 *
 * A spy's composition is a fact about the class, not about the spec: `Router` needs `events` spied
 * as an Observable property and `url` as a getter wherever it is doubled, and every file that
 * repeats that is a file that can get it wrong. Measured in one Angular suite: 739 of 2228
 * `provideAutoSpy` calls carry a configuration, and the same class collects incompatible opinions —
 * `Router` 122 calls in 109 files with **23 distinct configurations**, `AccountService` 70/62/27,
 * `PurchaseStateService` 53/52/25. The `*RemoteConfigService` family is 205 calls, 120 of them
 * repeating `{ gettersToSpyOn: ['remoteConfig'] }` word for word.
 *
 * That is not only repetition. The list options are **additive and do not complain about a name
 * they cannot find**, which is deliberate — they exist to name members no prototype carries — so
 * 23 opinions about `Router` means 62 of those files do not spy `events` at all, and the day
 * production grows a subscription to it not one of them says so.
 *
 * ```ts
 * // vitest-setup.ts, once
 * registerAutoSpyDefaults(Router, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] });
 *
 * // every spec, from then on
 * provideAutoSpy(Router);
 * provideAutoSpy(Router, { instanceMethodsToSpyOn: ['currentNavigation'] }); // adds, does not replace
 * ```
 *
 * **Merged, never replaced**, and that is the whole design: a spec that needs one extra getter adds
 * one getter rather than restating the class's composition and drifting from it. Lists are unioned,
 * `returns` and `overrides` are merged key by key, and every scalar the call spells wins over the
 * registration — so a spec can still say `{ lazySpies: false }` or `{ strict: false }` for itself.
 *
 * **Registration is by class identity, not by inheritance.** A subclass gets nothing from its base
 * class's registration. That is the conservative half of the design rather than an oversight:
 * walking the prototype chain would mean a registration on a widely-extended base silently changing
 * the composition of doubles in files nobody was looking at, which is the failure this exists to
 * remove rather than to relocate.
 */
import type { ClassSpyConfiguration, ClassType, OnlyMethodKeysOf } from './types';

/** What a class's registration holds, read back as the loose shape the merge walks. */
type Registration = Record<string, unknown>;

/**
 * On `globalThis`, not in the module: tsup inlines this file into every entry bundle, so a
 * module-level `Map` would give the setup file that registers and the spec that creates two
 * registries whenever they import from different entry points — `vitest-auto-spy` and
 * `vitest-auto-spy/vue`, say — and the defaults would silently not apply.
 */
declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyDefaults__: Map<object, Registration> | undefined;
}

/**
 * Keyed by the class object itself.
 *
 * A plain `Map` rather than a `WeakMap`, deliberately: the registry is filled once from a setup
 * file and holds a handful of classes that the module graph is keeping alive anyway, and
 * `clearAutoSpyDefaults()` has to be able to empty it — which a `WeakMap` cannot do without a
 * second structure that would defeat the weakness it was chosen for.
 */
/**
 * The reference is cached per bundle, the map itself is not: every bundle ends up holding the same
 * `Map`, and a `globalThis` read on the creation path is not free — reading it per
 * `createSpyFromClass` cost 1.2 µs a spy on the 100-method probe, which is more than the merge it
 * guards.
 */
let sharedRegistry: Map<object, Registration> | undefined;

function registry(): Map<object, Registration> {
  return (sharedRegistry ??= globalThis.__vitestAutoSpyDefaults__ ??= new Map());
}

/** One row of {@link registerAutoSpyDefaults}' many-at-once form: a class and the configuration to register for it. */
export type AutoSpyDefaultEntry<Class> = [ClassType<Class>, ClassSpyConfiguration<Class>];

/**
 * The many-at-once form's row as a call site writes it: `const` inference makes every list it
 * carries `readonly`, and requiring the mutable shape would reject every literal row outright.
 * Functions and classes pass through untouched.
 */
export type DeepReadonly<Value> = Value extends (...arguments_: never[]) => unknown
  ? Value
  : Value extends readonly unknown[]
    ? readonly DeepReadonly<Value[number]>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

/**
 * The many-at-once form's constraint: `Entries` with every row checked against its **own** class.
 *
 * The obvious spelling — `rows: Array<[ClassType<unknown>, ClassSpyConfiguration<unknown>]>` —
 * checks nothing: `ClassSpyConfiguration<T>` names keys *of `T`*, and none of its instantiations
 * unify across classes, so widening to one common row type gives up the checking the form exists
 * for.
 *
 * Two placements were tried before this one, and both silently checked nothing:
 *
 * - As the **parameter** (`entries: Entries & AutoSpyDefaultEntries<Entries>`) the conditional is
 *   deferred during overload resolution, and the relation TS uses to *choose* between overloads
 *   accepts it — a wrong key in a row then compiles. A single-signature function catches the same
 *   call, so the miss is the overloads', not the types'.
 * - Without the `const` modifier the rows infer as arrays of the union of a row's members, and the
 *   conditional answers `never` for every row.
 *
 * In the **constraint** the conditional is instantiated with the final `Entries` after the overload
 * has been chosen, and a violation fails the call with the plain key error:
 * `Type '"isGuest"' is not assignable to type '"reload" | "navigate"'`.
 */
type AutoSpyDefaultEntries<Entries extends readonly unknown[]> = {
  [Key in keyof Entries]: Entries[Key] extends readonly [infer Class, unknown]
    ? Class extends ClassType<infer Instance>
      ? readonly [ClassType<Instance>, DeepReadonly<ClassSpyConfiguration<Instance>>]
      : never
    : never;
};

/**
 * Register the configuration every double of `ObjectClass` should start from.
 *
 * Call it once, from a setup file. A second registration for the same class **replaces** the first
 * rather than merging into it: two registrations for one class in one suite is the drift this is
 * built to remove, and quietly combining them would hide it. The many-at-once form is the same
 * calls said once — rows apply in order, and a later row for a class already named replaces its
 * earlier row exactly as a second call would.
 *
 * @example
 * ```ts
 * registerAutoSpyDefaults(Router, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] });
 * registerAutoSpyDefaults(AccountService, { gettersToSpyOn: ['isGuest'] });
 * ```
 *
 * @example
 * ```ts
 * // the same two registrations, said once
 * registerAutoSpyDefaults([
 *   [Router, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] }],
 *   [AccountService, { gettersToSpyOn: ['isGuest'] }],
 * ]);
 * ```
 */
export function registerAutoSpyDefaults<T>(ObjectClass: ClassType<T>, config: ClassSpyConfiguration<T>): void;
export function registerAutoSpyDefaults<const Entries extends AutoSpyDefaultEntries<Entries> & readonly (readonly [unknown, unknown])[]>(
  entries: Entries,
): void;
export function registerAutoSpyDefaults(...args: unknown[]): void {
  registerFrom(args);
}

/**
 * What every `registerAutoSpyDefaults` does at run time — this one, and the `vitest-auto-spy/angular`
 * one whose overloads also take an `InjectionToken`. The registry is keyed by object identity, so a
 * token is a key exactly as a class is; only the types differ, and those live with each overload set.
 */
export function registerFrom(args: readonly unknown[]): void {
  if (Array.isArray(args[0])) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the many-at-once overloads guarantee an array of rows; `unknown` is the seam the implementation signatures take to stay compatible with every overload.
    for (const [key, rowConfig] of args[0] as [object, object][]) {
      registry().set(key, { ...rowConfig });
    }

    return;
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the per-key overloads guarantee both arguments carry the types asserted here.
  const [key, config] = args as [object, object];

  registry().set(key, { ...config });
}

/**
 * Drop one class's registration, or every one of them.
 *
 * Exported for a suite that registers defaults per project rather than per run, and for this
 * package's own specs — a registry that no test can empty is one every later test inherits.
 *
 * @example
 * ```ts
 * clearAutoSpyDefaults(Router); // this class only
 * clearAutoSpyDefaults(); // the lot
 * ```
 */
export function clearAutoSpyDefaults(ObjectClass?: ClassType<unknown>): void {
  dropAutoSpyDefaults(ObjectClass);
}

/** {@link clearAutoSpyDefaults} for any key the registry holds — a class, or a token from `/angular`. */
export function dropAutoSpyDefaults(key?: object): void {
  if (key) {
    registry().delete(key);

    return;
  }

  registry().clear();
}

/** Whether a value is a plain object worth merging key by key rather than replacing. */
function isMergeable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The registration's list for this key, or none — the key may be one only the call site names. */
function baseList(base: unknown): unknown[] {
  return Array.isArray(base) ? base : [];
}

/** The registration's object for this key, or none. */
function baseObject(base: unknown): Record<string, unknown> {
  return isMergeable(base) ? base : {};
}

/**
 * Merge a class's registration under the configuration written at the call site.
 *
 * Three behaviours, one per kind of key, and each is the one that makes the call site *additive*:
 * a list is unioned, an object (`returns`, `overrides`) is merged with the call site winning per
 * key, and anything else is replaced by the call site when it names the key at all.
 */
export function mergeAutoSpyDefaults<T>(
  ObjectClass: ClassType<T>,
  local: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[] | undefined,
): ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[] | undefined {
  const defaults = registry().get(ObjectClass);

  if (!defaults) {
    return local;
  }

  // The bare-array form is `methodsToSpyOn` spelled short; normalising it here keeps the merge one
  // shape rather than two, and hands the result back in the form the caller could have written.
  const written: Record<string, unknown> = Array.isArray(local) ? { methodsToSpyOn: local } : { ...local };

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- assembled from two values of this very type; the merge is keyed by the call site's own keys and cannot introduce a key neither side had.
  return mergeInto(defaults, written) as ClassSpyConfiguration<T>;
}

/**
 * The same merge for a key the class-typed signature cannot name — the `InjectionToken` behind
 * `provideAutoSpyForToken`. Hands `written` back untouched when nothing is registered under `key`.
 */
export function mergeRegisteredDefaults(key: object, written: Record<string, unknown>): Record<string, unknown> {
  const defaults = registry().get(key);

  return defaults ? mergeInto(defaults, written) : written;
}

function mergeInto(defaults: Registration, written: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...defaults };

  // The call site's own value decides the shape: both sides of a key carry the same declared type,
  // so a key written as a list on one side is a list on the other or absent there entirely.
  for (const key of Object.keys(written)) {
    const base: unknown = Reflect.get(defaults, key);
    const value = written[key];

    if (Array.isArray(value)) {
      merged[key] = [...new Set([...baseList(base), ...value])];
    } else if (isMergeable(value)) {
      merged[key] = { ...baseObject(base), ...value };
    } else {
      merged[key] = value;
    }
  }

  return merged;
}
