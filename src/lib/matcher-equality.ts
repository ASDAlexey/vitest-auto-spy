/**
 * A bare `equals(a, b)` is not `toEqual`: without `iterableEquality` any two Sets or Maps are equal.
 * These pass the testers the built-in matchers pass; the strict ones Vitest does not expose are rebuilt.
 */

type Tester = (a: unknown, b: unknown, customTesters: Tester[]) => boolean | undefined;

/** The slice of Vitest's matcher context this module reads, declared here to keep `@vitest/expect` out of the `.d.ts`. */
export interface EqualityContext {
  customTesters: Tester[];
  utils: { iterableEquality: Tester };
  equals(a: unknown, b: unknown, customTesters?: Tester[], strictCheck?: boolean): boolean;
}

/** `typeEquality` without its array case: an array from another realm still compares by contents. */
function sameClass(a: unknown, b: unknown): false | undefined {
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || (Array.isArray(a) && Array.isArray(b))) {
    return undefined;
  }

  return Object.getPrototypeOf(a) === Object.getPrototypeOf(b) ? undefined : false;
}

function arrayBufferEquality(a: unknown, b: unknown): boolean | undefined {
  if (!(a instanceof ArrayBuffer) || !(b instanceof ArrayBuffer)) {
    return undefined;
  }

  const left = new Uint8Array(a);
  const right = new Uint8Array(b);

  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

/** What `toEqual` compares with. */
export function looseEquals(context: EqualityContext, actual: unknown, expected: unknown): boolean {
  return context.equals(actual, expected, [...context.customTesters, context.utils.iterableEquality]);
}

/** What `toStrictEqual` compares with: `undefined` properties, array holes and the class count. */
export function strictEquals(context: EqualityContext, actual: unknown, expected: unknown): boolean {
  const testers: Tester[] = [...context.customTesters, context.utils.iterableEquality, sameClass, arrayBufferEquality];
  // Holes nested inside a Set or a Map, where `iterableEquality` compares loosely.
  const sparseArrayEquality = (a: unknown, b: unknown): boolean | undefined =>
    Array.isArray(a) && Array.isArray(b)
      ? context.equals(a, b, testers, true) && context.equals(Object.keys(a), Object.keys(b))
      : undefined;

  return context.equals(actual, expected, [...testers, sparseArrayEquality], true);
}
