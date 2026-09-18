/**
 * Structural comparison for `calledWith` arguments, with asymmetric matchers honoured at any depth.
 *
 * Most configs are matched by a string key ({@link serializeValue}), which is one hash lookup and
 * costs nothing on the call path. Two kinds of argument cannot be keyed that way, because their
 * serialization is not their identity:
 *
 * - an **asymmetric matcher** (`expect.any(Number)`, `expect.objectContaining({…})`) decides its own
 *   verdict, and a matcher nested inside an object or an array — `calledWith({ id: expect.any(Number) })`
 *   — is exactly the shape `toHaveBeenCalledWith` accepts, so it has to mean the same thing here;
 * - a **function**, which serializes by name: two different callbacks called `handler`, or two
 *   anonymous ones, render alike and would answer each other's calls.
 *
 * A config carrying either is therefore stored as a predicate and compared with {@link matchesStructurally},
 * which walks the two values together — matchers dispatch to `asymmetricMatch`, functions compare by
 * identity, and everything else compares the way the runner's own `equals` does: `Map` and `Set`
 * without regard to insertion order, `Date` by time, `Error` by name and message.
 */

/** The minimal shape of a Vitest/Jest asymmetric matcher (`expect.any(...)`, etc.). */
export interface AsymmetricMatcher {
  asymmetricMatch(value: unknown): boolean;
  /**
   * The matcher's own rendering — `Any<Number>`, `StringContaining "a"` — which is what the runner
   * prints for it in a diff. Optional because a hand-rolled matcher only has to answer
   * `asymmetricMatch`; there the class name (`String(matcher)`) is the best available description.
   */
  toAsymmetricMatcher?: () => string;
  /**
   * The brand the runner stamps on its own matcher instances — see {@link ASYMMETRIC_MATCHER_BRAND}.
   * Optional because a hand-rolled matcher carries none, which is exactly what the check is for.
   */
  $$typeof?: unknown;
}

/**
 * The brand every Vitest/Jest asymmetric matcher instance carries. It is what makes a matcher's own
 * state a faithful description of it: such an instance is one of the runner's matcher classes, and
 * everything that decides its verdict — `sample`, `inverse`, `precision` — lives in enumerable own
 * fields. A hand-rolled `{ asymmetricMatch }` object carries no brand and no such guarantee: two of
 * them holding different closures are alike in every readable field, so they are only ever compared
 * by reference.
 */
export const ASYMMETRIC_MATCHER_BRAND = Symbol.for('jest.asymmetricMatcher');

/** Whether `value` is an asymmetric matcher (exposes an `asymmetricMatch` method). */
export function isAsymmetricMatcher(value: unknown): value is AsymmetricMatcher {
  return typeof value === 'object' && value !== null && 'asymmetricMatch' in value && typeof value.asymmetricMatch === 'function';
}

/** Whether a matcher is one the runner built, and so describes itself through its own fields. */
function isBrandedMatcher(matcher: AsymmetricMatcher): boolean {
  return matcher.$$typeof === ASYMMETRIC_MATCHER_BRAND;
}

/** Every own enumerable key of an object, symbols included — what a serialized key and this walk both read. */
function ownKeys(value: object): PropertyKey[] {
  return Reflect.ownKeys(value).filter((key) => Object.prototype.propertyIsEnumerable.call(value, key));
}

/** The children of a container, for a walk that only asks whether *something* is in there. */
function childrenOf(value: object): unknown[] {
  if (value instanceof Map) {
    return [...value.keys(), ...value.values()];
  }

  if (value instanceof Set) {
    return [...value];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return ownKeys(value).map((key) => Reflect.get(value, key));
}

/**
 * Whether this config argument has to be compared structurally rather than by its serialized key.
 *
 * Walked once, when the config is registered — never on the call path. The cycle guard is a plain
 * `Set` of the objects already visited (not just the current path): an object that answered "no" on
 * one branch answers "no" on every other, so revisiting it would only repeat work.
 */
export function needsStructuralMatch(value: unknown, seen: Set<object> = new Set<object>()): boolean {
  if (typeof value === 'function' || isAsymmetricMatcher(value)) {
    return true;
  }

  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return false;
  }

  seen.add(value);

  return childrenOf(value).some((child) => needsStructuralMatch(child, seen));
}

/** One side of the pair currently being compared, so a cyclic pair answers instead of recursing forever. */
interface Pair {
  left: unknown;
  right: unknown;
}

/**
 * Whether two values are the same expectation — matchers compared as configuration, not applied.
 *
 * This is the question `set()` asks: registering `calledWith(1, expect.anything())` twice is an
 * override, not a second config sitting behind the first. A branded matcher is its class plus its
 * own state; a hand-rolled one is compared by reference, because its verdict is a closure that no
 * comparison can read.
 */
function sameMatcher(left: AsymmetricMatcher, right: unknown, path: Pair[]): boolean {
  if (!isAsymmetricMatcher(right) || !isBrandedMatcher(left) || !isBrandedMatcher(right)) {
    return false;
  }

  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) {
    return false;
  }

  return sameEntries(left, right, path, false);
}

/** Every own enumerable entry of `left` equals the one `right` holds under the same key, and there are as many. */
function sameEntries(left: object, right: object, path: Pair[], matchers: boolean): boolean {
  const leftKeys = ownKeys(left);

  if (leftKeys.length !== ownKeys(right).length) {
    return false;
  }

  return leftKeys.every(
    (key) =>
      Object.prototype.propertyIsEnumerable.call(right, key) && compare(Reflect.get(left, key), Reflect.get(right, key), path, matchers),
  );
}

/** Both collections hold the same values, in any order — one expected item to one actual item. */
function sameUnordered(expected: unknown[], actual: unknown[], path: Pair[], matchers: boolean): boolean {
  if (expected.length !== actual.length) {
    return false;
  }

  const taken = new Set<number>();

  return expected.every((item) =>
    actual.some((candidate, index) => {
      if (taken.has(index) || !compare(item, candidate, path, matchers)) {
        return false;
      }

      taken.add(index);

      return true;
    }),
  );
}

/** `Date`, `RegExp` and `Error` carry their whole value outside their enumerable entries. */
function sameSpecialObject(expected: object, actual: object, path: Pair[], matchers: boolean): boolean | undefined {
  if (expected instanceof Date || actual instanceof Date) {
    return expected instanceof Date && actual instanceof Date && expected.getTime() === actual.getTime();
  }

  if (expected instanceof RegExp || actual instanceof RegExp) {
    return expected instanceof RegExp && actual instanceof RegExp && String(expected) === String(actual);
  }

  if (expected instanceof Error || actual instanceof Error) {
    return (
      expected instanceof Error &&
      actual instanceof Error &&
      expected.name === actual.name &&
      expected.message === actual.message &&
      sameEntries(expected, actual, path, matchers)
    );
  }

  return undefined;
}

/** `Map` and `Set` compare by content, not by insertion order — the way the runner's `equals` does. */
function sameCollection(expected: object, actual: object, path: Pair[], matchers: boolean): boolean | undefined {
  if (expected instanceof Map || actual instanceof Map) {
    return (
      expected instanceof Map && actual instanceof Map && sameUnordered([...expected.entries()], [...actual.entries()], path, matchers)
    );
  }

  if (expected instanceof Set || actual instanceof Set) {
    return expected instanceof Set && actual instanceof Set && sameUnordered([...expected], [...actual], path, matchers);
  }

  return undefined;
}

function compareContents(expected: object, actual: object, path: Pair[], matchers: boolean): boolean {
  const special = sameSpecialObject(expected, actual, path, matchers) ?? sameCollection(expected, actual, path, matchers);

  if (special !== undefined) {
    return special;
  }

  if (Array.isArray(expected) || Array.isArray(actual)) {
    return (
      Array.isArray(expected) && Array.isArray(actual) && expected.length === actual.length && sameEntries(expected, actual, path, matchers)
    );
  }

  return sameEntries(expected, actual, path, matchers);
}

function compareObjects(expected: object, actual: object, path: Pair[], matchers: boolean): boolean {
  if (path.some((pair) => pair.left === expected && pair.right === actual)) {
    // The same pair is already being compared further up: whatever the answer is, it is decided
    // there, so this branch may not contradict it.
    return true;
  }

  path.push({ left: expected, right: actual });

  const equal = compareContents(expected, actual, path, matchers);

  path.pop();

  return equal;
}

function compare(expected: unknown, actual: unknown, path: Pair[], matchers: boolean): boolean {
  if (matchers && isAsymmetricMatcher(expected)) {
    return expected.asymmetricMatch(actual);
  }

  if (Object.is(expected, actual)) {
    return true;
  }

  if (isAsymmetricMatcher(expected)) {
    return sameMatcher(expected, actual, path);
  }

  if (typeof expected !== 'object' || expected === null || typeof actual !== 'object' || actual === null) {
    return false;
  }

  return compareObjects(expected, actual, path, matchers);
}

/**
 * Whether an actual argument satisfies a config argument, with matchers applied wherever they sit.
 *
 * `calledWith({ id: expect.any(Number) })` answers a call of `{ id: 1 }`, and so does
 * `calledWith([expect.any(String)])` for `['a']` — the shapes `toHaveBeenCalledWith` has always
 * accepted, and which used to be serialized as data and match nothing at all.
 */
export function matchesStructurally(configArg: unknown, actualArg: unknown): boolean {
  return compare(configArg, actualArg, [], true);
}

/** Whether two config arguments denote the same expectation — see {@link sameMatcher}. */
export function sameExpectation(left: unknown, right: unknown): boolean {
  return compare(left, right, [], false);
}

/**
 * A config argument rendered for a human: the serializer's own output, with every matcher replaced
 * by the description the runner prints for it (`Any<Number>` rather than its fields).
 */
export function describeWithMatchers(value: unknown, render: (value: unknown) => string, seen: Set<object> = new Set<object>()): string {
  if (isAsymmetricMatcher(value)) {
    return value.toAsymmetricMatcher?.() ?? String(value);
  }

  if (typeof value !== 'object' || value === null || seen.has(value) || !needsStructuralMatch(value)) {
    return render(value);
  }

  const described = new Set<object>(seen).add(value);
  const describe = (child: unknown): string => describeWithMatchers(child, render, described);

  if (value instanceof Map) {
    return `new Map([${[...value.entries()].map(([key, entry]) => `[${describe(key)},${describe(entry)}]`).join(',')}])`;
  }

  if (value instanceof Set) {
    return `new Set([${[...value].map(describe).join(',')}])`;
  }

  if (Array.isArray(value)) {
    return `[${value.map(describe).join(',')}]`;
  }

  const entries = ownKeys(value)
    .map((key): [string, unknown] => [String(key), Reflect.get(value, key)])
    .sort(([left], [right]) => (left > right ? 1 : -1));

  return `{${entries.map(([key, entry]) => `${key}:${describe(entry)}`).join(',')}}`;
}
