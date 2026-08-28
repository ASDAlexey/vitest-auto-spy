/**
 * Assert which branch of a union a value took, in a way that fails legibly.
 *
 * A spec routinely knows something the type does not: that `result.link` is the one form of twenty
 * that carries `params`, that a guard returned the `Observable` and not the `boolean`. There are
 * two ways to say it today and both are bad. A type assertion is a lie the compiler stops checking
 * — and when the shape does change, the failure arrives as `undefined is not a function` three
 * lines later. A hand-written `if ('params' in link) … else throw` says the right thing, but it is
 * six lines of ceremony per site, and the message it throws is whatever the author felt like
 * typing at the time.
 *
 * {@link narrow} is that check with the message written once: it prints the shape the value
 * actually had, which is the only thing that makes the failure cheaper than the assertion it
 * replaces.
 */
import type { Func } from './types';

/** A one-line description of what a value actually is — the part a failed narrowing must show. */
function describe(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value !== 'object') {
    return `${typeof value} ${JSON.stringify(value)}`;
  }

  const keys = Object.keys(value);
  const shown = keys.slice(0, 12).join(', ');

  return `${value.constructor.name} { ${keys.length > 12 ? `${shown}, …` : shown} }`;
}

function narrowingFailed(label: string, value: unknown): Error {
  return new Error(`[vitest-auto-spy] narrow: expected ${label}, but the value is ${describe(value)}.`);
}

/** The branch of `T` that has `Key`, or `T` itself when the union has no such member to extract. */
type WithKey<T, Key extends PropertyKey> = [Extract<T, Record<Key, unknown>>] extends [never] ? T : Extract<T, Record<Key, unknown>>;

/** The subscribable branch of `T`, or `T` itself when there is nothing to extract. */
type Subscribable<T> = [Extract<T, { subscribe: Func }>] extends [never] ? T : Extract<T, { subscribe: Func }>;

/**
 * Narrow a union to the branch a test knows it got.
 *
 * ```ts
 * const link = narrow(result.link, (candidate): candidate is DeeplinkWithParams => 'params' in candidate);
 * ```
 *
 * @param value The union-typed value.
 * @param predicate A type guard — or a plain boolean check, which narrows nothing but still fails
 *   in one place with a readable message.
 * @param label What was expected, quoted in the failure. Defaults to the predicate's source, which
 *   for an arrow is usually the most accurate description available.
 */
export function narrow<T, Narrowed extends T>(value: T, predicate: (candidate: T) => candidate is Narrowed, label?: string): Narrowed;
export function narrow<T>(value: T, predicate: (candidate: T) => boolean, label?: string): T;
export function narrow<T>(value: T, predicate: (candidate: T) => boolean, label?: string): T {
  if (!predicate(value)) {
    throw narrowingFailed(label ?? String(predicate), value);
  }

  return value;
}

/**
 * The most common narrowing, without writing the guard: the branch that has this key.
 *
 * ```ts
 * const params = narrow.byKey(result.link, 'params').params;
 * ```
 */
function byKey<T, Key extends PropertyKey>(value: T, key: Key): WithKey<T, Key> {
  if (typeof value !== 'object' || value === null || !(key in value)) {
    throw narrowingFailed(`an object with a '${String(key)}' property`, value);
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the `in` check above is exactly what `Extract<T, Record<Key, unknown>>` describes; TypeScript cannot apply it to an open union without a guard signature per branch.
  return value as WithKey<T, Key>;
}

/**
 * The subscribable branch of a `MaybeAsync` — an Angular guard or resolver return type.
 *
 * ```ts
 * const canMatch$ = narrow.observable(guard.canMatch(route, segments));
 * ```
 *
 * It exists here rather than as a call to rxjs's `isObservable` because that one narrows to
 * `Observable<unknown>`, dropping the element type — so every call site adds a type argument back
 * by hand. The check is structural (`subscribe` is callable), so nothing in the core imports rxjs.
 */
function observable<T>(value: T): Subscribable<T> {
  if (typeof value !== 'object' || value === null || typeof Reflect.get(value, 'subscribe') !== 'function') {
    throw narrowingFailed('an Observable', value);
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the structural check above is what `Extract<T, { subscribe: Func }>` means; the element type is preserved rather than widened to `unknown` as rxjs's own guard would.
  return value as Subscribable<T>;
}

narrow.byKey = byKey;
narrow.observable = observable;
