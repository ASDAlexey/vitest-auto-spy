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
 * Keyed by the class object itself.
 *
 * A plain `Map` rather than a `WeakMap`, deliberately: the registry is filled once from a setup
 * file and holds a handful of classes that the module graph is keeping alive anyway, and
 * `clearAutoSpyDefaults()` has to be able to empty it — which a `WeakMap` cannot do without a
 * second structure that would defeat the weakness it was chosen for.
 */
const registry = new Map<object, Registration>();

/**
 * Register the configuration every double of `ObjectClass` should start from.
 *
 * Call it once, from a setup file. A second call for the same class **replaces** the registration
 * rather than merging into it: two registrations for one class in one suite is the drift this is
 * built to remove, and quietly combining them would hide it.
 *
 * @example
 * ```ts
 * registerAutoSpyDefaults(Router, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] });
 * registerAutoSpyDefaults(AccountService, { gettersToSpyOn: ['isGuest'] });
 * ```
 */
export function registerAutoSpyDefaults<T>(ObjectClass: ClassType<T>, config: ClassSpyConfiguration<T>): void {
  registry.set(ObjectClass, { ...config });
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
  if (ObjectClass) {
    registry.delete(ObjectClass);

    return;
  }

  registry.clear();
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
  const defaults = registry.get(ObjectClass);

  if (!defaults) {
    return local;
  }

  // The bare-array form is `methodsToSpyOn` spelled short; normalising it here keeps the merge one
  // shape rather than two, and hands the result back in the form the caller could have written.
  const written: Record<string, unknown> = Array.isArray(local) ? { methodsToSpyOn: local } : { ...local };
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

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- assembled from two values of this very type; the loop above is keyed by `keyof` and cannot introduce a key neither side had.
  return merged as ClassSpyConfiguration<T>;
}
