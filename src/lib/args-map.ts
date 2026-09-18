/**
 * Serializes argument lists into stable string keys, so that
 * `calledWith(1, 'a')` can be matched against the actual call arguments.
 *
 * Two matching strategies coexist:
 *  - **exact:** most configs are keyed by a total string serialization and looked
 *    up in O(1) (a prototype-less backing map, so a `__proto__` arg is a plain key
 *    and never touches the object prototype chain).
 *  - **structural:** a config whose args carry an asymmetric matcher
 *    (`expect.any(String)`, `expect.objectContaining({…})`, …) at any depth, or a function —
 *    neither of which a string key can stand for — is stored as a predicate and evaluated against
 *    the actual args on lookup, after the exact map misses. See `structural-equals`.
 */
import { isDeepValue, serializePrimitive, serializeValue } from './serialize-args';
import { describeWithMatchers, isAsymmetricMatcher, matchesStructurally, needsStructuralMatch, sameExpectation } from './structural-equals';

type SerializedArgs = string;

/**
 * A `calledWith` config that cannot be a string key — see the note at the top of this file.
 *
 * `serialized` is the per-position serialization of the *config* args, computed once at
 * `set()` time. A config arg never changes after it is registered, so re-rendering it on
 * every call was pure waste: an asymmetric config whose other arg is a large object paid
 * two `serializeValue` walks per invocation where one is enough. Positions compared
 * structurally are `undefined` here — they never go through the serializer at all.
 *
 * `described` is the same args rendered for a human: the bare form of `serialized`, with the
 * structural positions rendered by {@link describeWithMatchers}. It is built in the same pass
 * because that is the only place the matcher is narrowed to something that can describe itself.
 */
interface MatcherConfig {
  args: unknown[];
  serialized: (string | undefined)[];
  described: string[];
  /** Whether the config has any position of that kind, so a match can skip the pass that has none. */
  hasStructural: boolean;
  hasLiterals: boolean;
  value: unknown;
}

/** The actual arguments' serializations, filled in as a lookup needs them and shared across configs. */
type Rendered = (string | undefined)[];

/**
 * Whether these are the args of a call that {@link ArgsMap} can look up by value: exactly one
 * argument, primitive, and rendered by the serializer the same way a `Map` keys it.
 */
function isSinglePrimitiveArgs(args: unknown[]): boolean {
  if (args.length !== 1) {
    return false;
  }

  const [argument] = args;
  const kind = typeof argument;

  if (kind === 'object' || kind === 'function' || kind === 'symbol') {
    return argument === null;
  }

  // `-0` and `0` are one key under `SameValueZero` and two keys to the serializer, which keeps them
  // apart on purpose.
  return !Object.is(argument, -0);
}

/** Whether any element of an args array has to be matched structurally (forces predicate storage). */
function hasStructuralArg(args: unknown[]): boolean {
  return args.some((arg) => needsStructuralMatch(arg));
}

/**
 * Match one structural position. A top-level matcher is dispatched here rather than left to
 * `matchesStructurally`, which would reach the same call one frame and one guard later: it is the
 * common shape and it is on the call path.
 */
function matchValue(configArg: unknown, actualArg: unknown): boolean {
  if (isAsymmetricMatcher(configArg)) {
    return configArg.asymmetricMatch(actualArg);
  }

  return matchesStructurally(configArg, actualArg);
}

/** The key of an argument list of only primitives — no cycle bookkeeping, no deep walk. */
function serializePrimitiveArgs(args: unknown[]): string {
  return `[${args.map((arg) => serializePrimitive(arg)).join(',')}]`;
}

/**
 * One registered config, addressable on its own.
 *
 * {@link ArgsMap.configured} renders every config as a string, which is all a failure message
 * needs. Attributing an actual call to *which* config it hit needs a handle instead — re-rendering
 * the text and comparing it is not one, because two chains can render the same list.
 *
 * Built on demand: nothing here is written by `set` or read by `get`, so the match path is
 * untouched by the existence of this surface.
 */
export interface ConfiguredEntry {
  /** 1-based position in {@link ArgsMap.configuredEntries}, in the order a lookup consults them. */
  readonly index: number;
  /** The config's argument list, rendered the way {@link ArgsMap.configured} renders it. */
  readonly args: string;
  /** Whether an actual call's arguments hit this config. */
  matches(actualArgs: unknown[]): boolean;
}

/**
 * Identity that survives being bundled twice.
 *
 * tsup inlines a copy of this class into every entry point that reaches it, so a double built by
 * `vitest-auto-spy` and read by `vitest-auto-spy/diagnostics` carries two different `ArgsMap`
 * constructors and `instanceof` answers false. That is how `explainSpy` reported `nothing
 * configured` for every configured double in the published package while every source-level spec
 * passed: the specs import one copy. A registry symbol is the same value in both.
 */
export const ARGS_MAP_BRAND = Symbol.for('vitest-auto-spy.args-map');

/** Whether a value is an {@link ArgsMap}, including one from another bundled copy of this class. */
export function isArgsMap(value: unknown): value is ArgsMap {
  return typeof value === 'object' && value !== null && Reflect.get(value, ARGS_MAP_BRAND) === true;
}

export class ArgsMap {
  readonly [ARGS_MAP_BRAND] = true;

  // Prototype-less so a `'__proto__'` (or `'constructor'`) serialized key is a
  // plain own property, never walking or polluting the object prototype chain.
  readonly #map: Record<SerializedArgs, unknown> = Object.create(null);
  readonly #matcherConfigs: MatcherConfig[] = [];
  /**
   * The shape of the exact configs, by argument count: for each position, whether any config of
   * that arity holds an object there.
   *
   * A call whose count nobody configured cannot be in the exact map — two arg lists of different
   * lengths never serialize to the same string — so the serialization can be skipped outright. That
   * matters because the map is consulted on *every* invocation of a spy that has any `calledWith`
   * config: without this, `service.load(component)` on a spy configured with `calledWith(1)` walks
   * and stringifies the whole component graph to build a key that provably cannot match, and throws
   * it away one line later.
   *
   * The positions carry the same argument one step further, and it is the step that matters for
   * Angular: an object and a primitive never serialize alike (a primitive renders as a quoted
   * string, a number, a symbol or `[Function: …]`, none of which a `{`, `[`, `new …(` or `/…/`
   * rendering can equal), so a call that arrives with a component where every config of that arity
   * holds a number is a miss that costs one `typeof` per argument instead of a walk of the
   * component tree.
   */
  readonly #exactShapes = new Map<number, boolean[]>();
  /**
   * The configs of exactly one primitive argument, keyed by the argument itself.
   *
   * `calledWith(1)` / `calledWith('id')` is what nearly every spec writes, and it is looked up on
   * **every call** of that spy. Through the string map that costs a rendered key per call — an array
   * from `map`, a string per argument, a joined string, then a hash — for a lookup that a `Map` can
   * do on the value with no allocation at all. The configs live in both maps: the string map still
   * owns `configured()` and the arity set, so nothing about the failure messages or the miss check
   * changes.
   *
   * Only shapes where the two agree go in here. A symbol renders by description, so two distinct
   * symbols that share one are the same key in the string map and different keys in a `Map`; `-0`
   * renders apart from `0` and is the same key under `SameValueZero`. Both stay on the string path.
   */
  readonly #exactSinglePrimitive = new Map<unknown, unknown>();

  set(key: unknown, value: unknown): void {
    if (Array.isArray(key) && hasStructuralArg(key)) {
      this.#setMatcherConfig(this.#buildMatcherConfig(key, value));

      return;
    }

    if (Array.isArray(key)) {
      this.#recordShape(key);

      if (isSinglePrimitiveArgs(key)) {
        this.#exactSinglePrimitive.set(key[0], value);
      }
    }

    this.#map[this.#serialize(key)] = value;
  }

  get(key: unknown): unknown {
    if (Array.isArray(key)) {
      const shape = this.#exactShapes.get(key.length);

      if (shape === undefined) {
        return this.#findByMatcher(key);
      }

      // The common shape, and the only one that reaches a configured value without rendering a key:
      // a call of one primitive argument can only match a config of one primitive argument, and
      // every one of those is in this map. It needs no shape check — a primitive is never the
      // object the shape is about.
      if (isSinglePrimitiveArgs(key)) {
        const hit = this.#exactSinglePrimitive.get(key[0]);

        return hit === undefined ? this.#findByMatcher(key) : hit;
      }

      // One pass answers both questions the key needs: whether any argument is an object at all
      // (which decides the cheap all-primitives rendering) and whether one sits where no config
      // holds an object (which decides the exact map is a miss without rendering anything).
      let deep = false;

      for (let index = 0; index < key.length; index += 1) {
        if (isDeepValue(key[index])) {
          if (!shape[index]) {
            return this.#findByMatcher(key);
          }

          deep = true;
        }
      }

      const serializedArgs = deep ? serializeValue(key) : serializePrimitiveArgs(key);

      return serializedArgs in this.#map ? this.#map[serializedArgs] : this.#findByMatcher(key);
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

  /**
   * Every configured argument list as a {@link ConfiguredEntry} — the same lists {@link configured}
   * returns, each carrying its own position and its own predicate.
   *
   * The order is the order a lookup consults them (exact configs first, then the asymmetric ones in
   * registration order), so the first entry whose `matches` holds is the config `get` would have
   * answered from. That is what lets a reader be told "call 3 hit config 2" instead of a list of
   * configs and a list of calls with nothing joining them.
   */
  configuredEntries(): ConfiguredEntry[] {
    const exact: ConfiguredEntry[] = Object.keys(this.#map).map((key, position) => ({
      index: position + 1,
      args: key,
      matches: (actualArgs: unknown[]): boolean => this.#serialize(actualArgs) === key,
    }));

    const asymmetric: ConfiguredEntry[] = this.#matcherConfigs.map((config, position) => ({
      index: exact.length + position + 1,
      args: `[${config.described.join(',')}]`,
      matches: (actualArgs: unknown[]): boolean => this.#argsMatch(config, actualArgs, []),
    }));

    return [...exact, ...asymmetric];
  }

  /** Render one structural config once, at registration time. See {@link MatcherConfig}. */
  #buildMatcherConfig(key: unknown[], value: unknown): MatcherConfig {
    const serialized: (string | undefined)[] = [];
    const described: string[] = [];

    for (const arg of key) {
      if (needsStructuralMatch(arg)) {
        serialized.push(undefined);
        described.push(describeWithMatchers(arg, serializeValue));
      } else {
        const rendered = this.#serialize([arg]);

        serialized.push(rendered);
        // `#serialize` brackets the single-element array it is given; the bare rendering is what
        // goes between the commas of the failure message.
        described.push(rendered.slice(1, -1));
      }
    }

    return {
      args: key,
      serialized,
      described,
      hasStructural: serialized.includes(undefined),
      hasLiterals: serialized.some((position) => position !== undefined),
      value,
    };
  }

  /** Remember which positions of this arity hold an object — see {@link #exactShapes}. */
  #recordShape(key: unknown[]): void {
    const shape = this.#exactShapes.get(key.length) ?? key.map(() => false);

    key.forEach((arg, index) => {
      if (isDeepValue(arg)) {
        shape[index] = true;
      }
    });

    this.#exactShapes.set(key.length, shape);
  }

  /**
   * Register an asymmetric config, replacing an equivalent one in place.
   *
   * Re-registering args is how a test overrides an earlier answer, and on the exact map that falls
   * out for free — the second `set` writes the same key. The matcher list has to do it by hand:
   * lookup takes the first predicate that matches, so an appended duplicate would sit behind the
   * config it was meant to replace and never be reached, and a `beforeEach` that reconfigures the
   * same spy would grow the list on every test. Replacing in place also keeps the registration
   * order that decides which of two *overlapping* configs wins.
   */
  #setMatcherConfig(config: MatcherConfig): void {
    const index = this.#matcherConfigs.findIndex((existing) => this.#sameConfigArgs(existing, config));

    if (index === -1) {
      this.#matcherConfigs.push(config);

      return;
    }

    this.#matcherConfigs[index] = config;
  }

  /** Whether two configs were registered for the same argument list, structural positions included. */
  #sameConfigArgs(existing: MatcherConfig, candidate: MatcherConfig): boolean {
    if (existing.args.length !== candidate.args.length) {
      return false;
    }

    // A structural position and a literal one never compare equal: a literal's serialization is a
    // string where a structural position's is `undefined`, and the two branches are taken on that.
    return existing.args.every((arg, index) =>
      existing.serialized[index] === undefined
        ? candidate.serialized[index] === undefined && sameExpectation(arg, candidate.args[index])
        : existing.serialized[index] === candidate.serialized[index],
    );
  }

  // Keys are always argument arrays; `serializeValue` renders them to a stable,
  // total string (single-quoted strings, bracketed arrays, distinct `undefined`
  // / function / symbol / BigInt / Date renderings, circular-ref safe). Arrays of
  // only primitive args take a fast path that skips the circular-ref bookkeeping.
  #serialize(key: unknown): SerializedArgs {
    if (Array.isArray(key) && !key.some(isDeepValue)) {
      return serializePrimitiveArgs(key);
    }

    return serializeValue(key);
  }

  /**
   * Return the value of the first structural config whose predicate matches the actual args.
   *
   * `rendered` is the per-lookup memo of the actual arguments' serializations, shared by every
   * config this lookup consults and thrown away afterwards. K structural configs used to re-render
   * the same actual argument K times — measured at 78 µs per config on a 200-field record and 4 ms
   * on a graph with a back-edge, so eight configs cost eight times that on **every** call of the
   * spy.
   */
  #findByMatcher(actualArgs: unknown): unknown {
    if (!Array.isArray(actualArgs) || this.#matcherConfigs.length === 0) {
      return undefined;
    }

    const rendered: Rendered = [];
    const match = this.#matcherConfigs.find((config) => this.#argsMatch(config, actualArgs, rendered));

    return match?.value;
  }

  /**
   * Whether every configured arg matches the actual arg at the same position (same length).
   *
   * The structural positions are decided first, literals afterwards. A matcher answers from the
   * value itself and a literal has to render the actual argument, so asking the cheap question
   * first is what keeps `calledWith({ id: 1 }, expect.any(Number))` from serializing a record on
   * every call the matcher was going to reject anyway. A config with none of one kind skips that
   * pass entirely — an all-matcher config is the common one, and it walks its args once.
   */
  #argsMatch(config: MatcherConfig, actualArgs: unknown[], rendered: Rendered): boolean {
    if (config.args.length !== actualArgs.length) {
      return false;
    }

    // A structural position is a matcher deciding for itself, or a value holding one deeper down —
    // or a function, which no string can stand for.
    if (
      config.hasStructural &&
      !config.args.every((configArg, index) => config.serialized[index] !== undefined || matchValue(configArg, actualArgs[index]))
    ) {
      return false;
    }

    return (
      !config.hasLiterals ||
      config.serialized.every(
        (serialized, index) => serialized === undefined || serialized === (rendered[index] ??= this.#serialize([actualArgs[index]])),
      )
    );
  }
}
