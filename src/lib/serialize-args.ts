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
 */

function quoteString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function serializeEntries(value: object, seen: WeakSet<object>): string {
  return Object.entries(value)
    .map(([key, entryValue]) => `${key}:${serializeValue(entryValue, seen)}`)
    .join(',');
}

function serializeMap(value: Map<unknown, unknown>, seen: WeakSet<object>): string {
  const pairs = [...value.entries()].map(([key, entryValue]) => `[${serializeValue(key, seen)},${serializeValue(entryValue, seen)}]`);

  return `new Map([${pairs.join(',')}])`;
}

function serializeObject(value: object, seen: WeakSet<object>): string {
  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  let result: string;

  if (value instanceof Date) {
    result = `new Date(${value.getTime()})`;
  } else if (value instanceof Map) {
    result = serializeMap(value, seen);
  } else if (value instanceof Set) {
    result = `new Set([${[...value].map((item) => serializeValue(item, seen)).join(',')}])`;
  } else if (Array.isArray(value)) {
    result = `[${value.map((item) => serializeValue(item, seen)).join(',')}]`;
  } else {
    result = `{${serializeEntries(value, seen)}}`;
  }

  seen.delete(value);

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

/** Serialize any value into a stable, collision-resistant string. Always total. */
export function serializeValue(value: unknown, seen: WeakSet<object> = new WeakSet<object>()): string {
  if (typeof value === 'object' && value !== null) {
    return serializeObject(value, seen);
  }

  return serializePrimitive(value);
}
