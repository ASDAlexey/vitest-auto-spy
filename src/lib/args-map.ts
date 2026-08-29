/**
 * Serializes argument lists into stable string keys, so that
 * `calledWith(1, 'a')` can be matched against the actual call arguments.
 *
 * Two matching strategies coexist:
 *  - **exact:** most configs are keyed by a total string serialization and looked
 *    up in O(1) (a prototype-less backing map, so a `__proto__` arg is a plain key
 *    and never touches the object prototype chain).
 *  - **asymmetric:** a config whose args include an asymmetric matcher
 *    (`expect.any(String)`, `expect.objectContaining({…})`, …) can't be a static
 *    string — it's stored as a predicate and evaluated against the actual args on
 *    lookup, after the exact map misses.
 */
import { isDeepValue, serializePrimitive, serializeValue } from './serialize-args';

type SerializedArgs = string;

/** The minimal shape of a Vitest/Jest asymmetric matcher (`expect.any(...)`, etc.). */
interface AsymmetricMatcher {
  asymmetricMatch(value: unknown): boolean;
}

/** A `calledWith` config whose args contain at least one asymmetric matcher. */
interface MatcherConfig {
  args: unknown[];
  value: unknown;
}

/** Whether `value` is an asymmetric matcher (exposes an `asymmetricMatch` method). */
function isAsymmetricMatcher(value: unknown): value is AsymmetricMatcher {
  return typeof value === 'object' && value !== null && 'asymmetricMatch' in value && typeof value.asymmetricMatch === 'function';
}

/** Whether any element of an args array is an asymmetric matcher (forces predicate storage). */
function hasAsymmetricMatcher(args: unknown[]): boolean {
  return args.some(isAsymmetricMatcher);
}

export class ArgsMap {
  // Prototype-less so a `'__proto__'` (or `'constructor'`) serialized key is a
  // plain own property, never walking or polluting the object prototype chain.
  readonly #map: Record<SerializedArgs, unknown> = Object.create(null);
  readonly #matcherConfigs: MatcherConfig[] = [];
  // Argument counts present in the exact map. A call with a count nobody configured cannot be in
  // that map — two arg lists of different lengths never serialize to the same string — so the
  // serialization can be skipped outright. That matters because the map is consulted on *every*
  // invocation of a spy that has any `calledWith` config: without this, `service.load(component)`
  // on a spy configured with `calledWith(1)` walks and stringifies the whole component graph to
  // build a key that provably cannot match, and throws it away one line later.
  readonly #arities = new Set<number>();

  set(key: unknown, value: unknown): void {
    if (Array.isArray(key) && hasAsymmetricMatcher(key)) {
      this.#matcherConfigs.push({ args: key, value });

      return;
    }

    if (Array.isArray(key)) {
      this.#arities.add(key.length);
    }

    this.#map[this.#serialize(key)] = value;
  }

  get(key: unknown): unknown {
    if (Array.isArray(key) && !this.#arities.has(key.length)) {
      return this.#findByMatcher(key);
    }

    const serialized = this.#serialize(key);

    if (serialized in this.#map) {
      return this.#map[serialized];
    }

    return this.#findByMatcher(key);
  }

  // Keys are always argument arrays; `serializeValue` renders them to a stable,
  // total string (single-quoted strings, bracketed arrays, distinct `undefined`
  // / function / symbol / BigInt / Date renderings, circular-ref safe). Arrays of
  // only primitive args take a fast path that skips the circular-ref bookkeeping.
  #serialize(key: unknown): SerializedArgs {
    if (Array.isArray(key) && !key.some(isDeepValue)) {
      return `[${key.map((arg) => serializePrimitive(arg)).join(',')}]`;
    }

    return serializeValue(key);
  }

  /** Return the value of the first asymmetric config whose predicate matches the actual args. */
  #findByMatcher(actualArgs: unknown): unknown {
    if (!Array.isArray(actualArgs)) {
      return undefined;
    }

    const match = this.#matcherConfigs.find((config) => this.#argsMatch(config.args, actualArgs));

    return match?.value;
  }

  /** Whether every configured arg matches the actual arg at the same position (same length). */
  #argsMatch(configArgs: unknown[], actualArgs: unknown[]): boolean {
    if (configArgs.length !== actualArgs.length) {
      return false;
    }

    return configArgs.every((configArg, index) => this.#valueMatches(configArg, actualArgs[index]));
  }

  /** Match a single arg: asymmetric matchers delegate to `asymmetricMatch`, others compare by serialization. */
  #valueMatches(configArg: unknown, actualArg: unknown): boolean {
    if (isAsymmetricMatcher(configArg)) {
      return configArg.asymmetricMatch(actualArg);
    }

    return this.#serialize([configArg]) === this.#serialize([actualArg]);
  }
}
