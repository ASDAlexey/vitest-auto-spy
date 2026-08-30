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
  /**
   * The matcher's own rendering — `Any<Number>`, `StringContaining "a"` — which is what the runner
   * prints for it in a diff. Optional because a hand-rolled matcher only has to answer
   * `asymmetricMatch`; there the class name (`String(matcher)`) is the best available description.
   */
  toAsymmetricMatcher?: () => string;
}

/**
 * A `calledWith` config whose args contain at least one asymmetric matcher.
 *
 * `serialized` is the per-position serialization of the *config* args, computed once at
 * `set()` time. A config arg never changes after it is registered, so re-rendering it on
 * every call was pure waste: an asymmetric config whose other arg is a large object paid
 * two `serializeValue` walks per invocation where one is enough. Positions holding an
 * asymmetric matcher are `undefined` here — they dispatch to `asymmetricMatch` and are
 * never serialized at all.
 *
 * `described` is the same args rendered for a human: the bare form of `serialized`, with the
 * matcher positions filled in by the matcher itself. It is built in the same pass because that is
 * the only place the matcher is narrowed to something that can describe itself.
 */
interface MatcherConfig {
  args: unknown[];
  serialized: (string | undefined)[];
  described: string[];
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
      const serialized: (string | undefined)[] = [];
      const described: string[] = [];

      for (const arg of key) {
        if (isAsymmetricMatcher(arg)) {
          serialized.push(undefined);
          described.push(arg.toAsymmetricMatcher?.() ?? String(arg));
        } else {
          const rendered = this.#serialize([arg]);

          serialized.push(rendered);
          // `#serialize` brackets the single-element array it is given; the bare rendering is what
          // goes between the commas of the failure message.
          described.push(rendered.slice(1, -1));
        }
      }

      this.#matcherConfigs.push({ args: key, serialized, described, value });

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

  /**
   * Every configured argument list, rendered the way a lookup key is — the *wanted* half of a
   * `mustBeCalledWith` failure.
   *
   * Nothing is rendered here: the exact configs are keyed by their own serialization, and an
   * asymmetric config carries the description built when it was registered. A failure message is
   * assembling text it already has.
   */
  configured(): string[] {
    const asymmetric = this.#matcherConfigs.map((config) => `[${config.described.join(',')}]`);

    return [...Object.keys(this.#map), ...asymmetric];
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

    const match = this.#matcherConfigs.find((config) => this.#argsMatch(config, actualArgs));

    return match?.value;
  }

  /** Whether every configured arg matches the actual arg at the same position (same length). */
  #argsMatch(config: MatcherConfig, actualArgs: unknown[]): boolean {
    if (config.args.length !== actualArgs.length) {
      return false;
    }

    return config.args.every((configArg, index) => this.#valueMatches(configArg, config.serialized[index], actualArgs[index]));
  }

  /**
   * Match a single arg: asymmetric matchers delegate to `asymmetricMatch`, others compare the
   * config arg's serialization — rendered once at `set()` time — against the actual arg's.
   *
   * The branch is taken on `configArg` rather than on `serializedConfigArg === undefined`, even
   * though the two are the same test by construction: the type guard is what narrows `configArg`
   * to something with `asymmetricMatch` on it, and the alternative needs an assertion to say the
   * same thing less safely.
   */
  #valueMatches(configArg: unknown, serializedConfigArg: string | undefined, actualArg: unknown): boolean {
    if (isAsymmetricMatcher(configArg)) {
      return configArg.asymmetricMatch(actualArg);
    }

    return serializedConfigArg === this.#serialize([actualArg]);
  }
}
