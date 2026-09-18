/**
 * Whether a value is a literal-shaped record, as opposed to something with behaviour of its own.
 *
 * Drawn at the prototype rather than at `typeof`, because that is the only test that tells a `{ … }`
 * literal apart from a `Date`, a `Map`, a `Set`, a `URL`, an `HTMLElement` or a model instance while
 * still accepting an object built with `Object.create(null)`. Two callers depend on the distinction
 * for opposite reasons: `fixture.ts` copies and merges only records, and `record-diff.ts` compares
 * anything else whole — a per-field comparison of a `Date` reads no keys at all, so it used to
 * report "no difference" for two values that plainly differ.
 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  const prototype: unknown = typeof value === 'object' && value !== null ? Object.getPrototypeOf(value) : undefined;

  return prototype === Object.prototype || prototype === null;
}
