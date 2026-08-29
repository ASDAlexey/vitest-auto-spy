/**
 * Dependency-free value serializer used to build stable string keys for argument
 * matching (`calledWith` / `mustBeCalledWith`) and to format `mustBeCalledWith`
 * mismatch messages.
 *
 * It reproduces the subset of `javascript-stringify`'s output the library relies
 * on, so dropping that runtime dependency changes nothing observable:
 * - single-quoted strings (`'a'`, with `\` and `'` escaped),
 * - bracketed arrays / braced objects without spaces,
 * - distinct renderings for the values `JSON.stringify` would mangle or throw on
 *   (`undefined`, `-0`, functions, symbols, `BigInt`, `Date`, `Map`, `Set`),
 * - and circular-reference safety (so an object that references itself yields a
 *   stable key instead of overflowing the stack).
 *
 * It deviates from that output in one place, deliberately: object keys are sorted
 * rather than kept in insertion order, so that two literals differing only in the
 * order they were written produce one key. See {@link serializeEntries}.
 */

/**
 * State carried through one top-level {@link serializeValue} call.
 *
 * `seen` is the cycle guard and holds only the *current path* — an entry is added on the way down
 * and removed on the way up, because an object reachable by two sibling paths is not a cycle and
 * must render in full both times.
 *
 * `cache` is what stops that from being exponential. A `seen`-only walk serialises a shared node
 * once per path that reaches it, so a diamond of depth 20 — 41 distinct objects — expanded into
 * 1 048 576 serialised nodes, a 12.6 MB key and 1.1 s. Memoising by identity collapses every
 * repeat to a map lookup; the output is byte-identical, because a node's rendering does not depend
 * on where it was reached from.
 *
 * `circularHits` is the exception to that last sentence, and the reason the cache is not simply
 * "write on the way up". A rendering that contains `[Circular]` *does* depend on the path: for
 * `a = {b}`, `b = {a}` reached as `{x:a,y:b}`, serialising `a` first makes `b` render as
 * `{a:[Circular]}`, while reaching `b` first makes it `{a:{b:[Circular]}}`. Both are correct for
 * their own path and neither may be reused for the other. The counter marks any subtree that
 * emitted a back-edge, and such a subtree is left out of the cache.
 */
interface SerializeContext {
  seen: WeakSet<object>;
  cache: Map<object, string>;
  circularHits: number;
}

function createContext(): SerializeContext {
  return { seen: new WeakSet<object>(), cache: new Map<object, string>(), circularHits: 0 };
}

function quoteString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function serializeEntries(value: object, context: SerializeContext): string {
  // Keys are sorted, because object key order in JavaScript is insertion order: `{ id: 1, name: 'a' }`
  // and `{ name: 'a', id: 1 }` are the same argument, and an insertion-ordered key would make them
  // two. `calledWith` would then not match the call, the spy would answer `undefined`, and nothing in
  // the failure would point at the order the object literal happened to be written in. Sorting also
  // makes `mustBeCalledWith` mismatch messages stable rather than dependent on construction order.
  // Keys within one object are unique, so the comparator never has to report equality.
  return Object.entries(value)
    .sort(([left], [right]) => (left > right ? 1 : -1))
    .map(([key, entryValue]) => `${key}:${serializeInContext(entryValue, context)}`)
    .join(',');
}

function serializeMap(value: Map<unknown, unknown>, context: SerializeContext): string {
  const pairs = [...value.entries()].map(
    ([key, entryValue]) => `[${serializeInContext(key, context)},${serializeInContext(entryValue, context)}]`,
  );

  return `new Map([${pairs.join(',')}])`;
}

/** Render `value`'s own shape, with its children already dispatched back through the context. */
function serializeShape(value: object, context: SerializeContext): string {
  if (value instanceof Date) {
    return `new Date(${value.getTime()})`;
  }

  if (value instanceof Map) {
    return serializeMap(value, context);
  }

  if (value instanceof Set) {
    return `new Set([${[...value].map((item) => serializeInContext(item, context)).join(',')}])`;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeInContext(item, context)).join(',')}]`;
  }

  return `{${serializeEntries(value, context)}}`;
}

function serializeObject(value: object, context: SerializeContext): string {
  if (context.seen.has(value)) {
    context.circularHits += 1;

    return '[Circular]';
  }

  const cached = context.cache.get(value);

  if (cached !== undefined) {
    return cached;
  }

  context.seen.add(value);

  const hitsBefore = context.circularHits;
  const result = serializeShape(value, context);

  context.seen.delete(value);

  // Only a subtree that emitted no back-edge is path-independent, and only such a result may be
  // reused on another path. See {@link SerializeContext}.
  if (context.circularHits === hitsBefore) {
    context.cache.set(value, result);
  }

  return result;
}

/**
 * Render a non-object value (string, number, boolean, bigint, symbol, function,
 * null, undefined). Extracted so the {@link ArgsMap} hot path can key arrays of
 * primitives without allocating the circular-ref `WeakSet` — its output is
 * byte-identical to what {@link serializeValue} produces for the same value.
 */
export function serializePrimitive(value: unknown): string {
  if (typeof value === 'string') {
    return quoteString(value);
  }

  if (typeof value === 'bigint') {
    return `${value}n`;
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return `[Function: ${value.name}]`;
  }

  // `String(-0)` is `'0'`, which would collide with `0`; keep them distinct.
  if (Object.is(value, -0)) {
    return '-0';
  }

  return String(value);
}

/** Whether a value must go through the deep object serializer (non-null object). */
export function isDeepValue(value: unknown): boolean {
  return typeof value === 'object' && value !== null;
}

/** Dispatch one value inside an in-progress walk. */
function serializeInContext(value: unknown, context: SerializeContext): string {
  if (typeof value === 'object' && value !== null) {
    return serializeObject(value, context);
  }

  return serializePrimitive(value);
}

/** Serialize any value into a stable, collision-resistant string. Always total. */
export function serializeValue(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    return serializeObject(value, createContext());
  }

  return serializePrimitive(value);
}
