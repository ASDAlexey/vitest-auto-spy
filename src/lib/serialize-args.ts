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
 *   (`undefined`, `-0`, functions, symbols, `BigInt`, `Date`, `RegExp`, `Map`, `Set`),
 * - and circular-reference safety (so an object that references itself yields a
 *   stable key instead of overflowing the stack).
 *
 * It deviates from that output in three places, deliberately: object keys are sorted rather than
 * kept in insertion order, so that two literals differing only in the order they were written
 * produce one key (see {@link serializeEntries}); `Map` and `Set` entries are sorted for the same
 * reason (see {@link serializeItems}); and an `Error` renders as its name and message, which is the
 * whole of what it is and none of what `Object.entries` can see.
 *
 * What it deliberately does **not** key is a function: two callbacks with one name render alike, and
 * telling them apart is `structural-equals`' job, not a string's.
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
 * repeat to a map lookup.
 *
 * A rendering that contains `[Circular]` is cached too, and that is a choice worth stating. Such a
 * rendering does depend on the path it was reached by: for `a = {b}`, `b = {a}` reached as
 * `{x:a,y:b}`, serialising `a` first makes `b` render as `{a:[Circular]}`, while reaching `b` first
 * makes it `{a:{b:[Circular]}}`. Leaving those subtrees out of the cache kept the text faithful to
 * each path and made the walk exponential again for the graph every Angular double carries — a
 * component that reaches its injector, a node that reaches its root, a back-edge in nearly every
 * subtree. What a key has to be is *deterministic for a given structure*, not a description of the
 * path: the walk order is fixed by sorted keys, so two structurally identical graphs still produce
 * identical strings, which is the only property matching rests on.
 */
interface SerializeContext {
  seen: WeakSet<object>;
  cache: Map<object, string>;
  budget: number;
}

/**
 * How many characters of *repeated* subtree one key may spend before it stops expanding them.
 *
 * A DAG of shared nodes is linear to walk once memoised and still exponential to write: a diamond
 * of depth 18 renders 10.7 MB of text, allocated on every call of the spy, of which all but 10 kB
 * is the same subtrees written again. Past this point a repeat renders as a shape summary — the
 * class and the number of members, which is enough to keep two different arguments apart — so the
 * key stays bounded at ~84 kB for that graph. An argument nothing shares spends nothing here and
 * renders in full however large it is.
 */
const KEY_BUDGET = 50_000;

function createContext(): SerializeContext {
  return { seen: new WeakSet<object>(), cache: new Map<object, string>(), budget: KEY_BUDGET };
}

function quoteString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * Anything outside a word character or `$` in a key, which is what could forge structure: a key
 * holding `:` — `{ 'a:1,b': 2 }` — used to render as `a:1,b:2` and share its key with `{ a: 1, b: 2 }`.
 *
 * One unanchored scan rather than a full identifier match, because this runs per key per object on
 * the call path and a leading digit needs no quoting: `{ 0: 1 }` is unambiguous either way.
 */
const NEEDS_QUOTING = /[^\w$]/;

function serializeKey(key: string): string {
  return NEEDS_QUOTING.test(key) ? quoteString(key) : key;
}

/** Every own enumerable symbol key — a symbol-keyed field is data like any other. */
function ownEnumerableSymbols(value: object): symbol[] {
  const symbols = Object.getOwnPropertySymbols(value);

  return symbols.length === 0 ? symbols : symbols.filter((symbol) => Object.prototype.propertyIsEnumerable.call(value, symbol));
}

/** How many own enumerable members a value has, for the shape a truncated subtree shows. */
function ownEnumerableCount(value: object): number {
  return Object.keys(value).length + ownEnumerableSymbols(value).length;
}

function serializeEntries(value: object, context: SerializeContext): string {
  // Keys are sorted, because object key order in JavaScript is insertion order: `{ id: 1, name: 'a' }`
  // and `{ name: 'a', id: 1 }` are the same argument, and an insertion-ordered key would make them
  // two. `calledWith` would then not match the call, the spy would answer `undefined`, and nothing in
  // the failure would point at the order the object literal happened to be written in. Sorting also
  // makes `mustBeCalledWith` mismatch messages stable rather than dependent on construction order —
  // and the children are rendered in that order, so a memoised subtree and the budget see the same
  // walk for two objects that differ only in the order they were built.
  // Keys within one object are unique, so the comparator never has to report equality.
  const entries = Object.entries(value).sort(([left], [right]) => (left > right ? 1 : -1));
  const rendered = entries.map(([key, entryValue]) => `${serializeKey(key)}:${serializeInContext(entryValue, context)}`);
  const symbols = ownEnumerableSymbols(value);

  if (symbols.length > 0) {
    symbols
      .map((symbol): [string, symbol] => [symbol.toString(), symbol])
      .sort(([left], [right]) => (left > right ? 1 : -1))
      .forEach(([key, symbol]) => rendered.push(`${key}:${serializeInContext(Reflect.get(value, symbol), context)}`));
  }

  return rendered.join(',');
}

/**
 * The rendered items of a `Map` or a `Set`, sorted.
 *
 * Neither is ordered by the language in the sense a key needs: `new Set([1, 2])` and
 * `new Set([2, 1])` hold the same set, and `toHaveBeenCalledWith` equates them. Sorting the rendered
 * items is what makes `calledWith(new Set([1, 2]))` answer a call that built the set the other way
 * round, which used to be a silent miss.
 */
function serializeItems(items: string[]): string {
  return items.sort().join(',');
}

function serializeMap(value: Map<unknown, unknown>, context: SerializeContext): string {
  const pairs = [...value.entries()].map(
    ([key, entryValue]) => `[${serializeInContext(key, context)},${serializeInContext(entryValue, context)}]`,
  );

  return `new Map([${serializeItems(pairs)}])`;
}

/**
 * An `Error` carries its whole value outside `Object.entries`: `name` and `message` are not
 * enumerable, so every error used to render as `{}` and `calledWith(new Error('a'))` answered a call
 * made with `new Error('b')`. Own enumerable fields are still appended — that is where a subclass
 * keeps the `status` or `code` that tells two of them apart.
 */
function serializeError(value: Error, context: SerializeContext): string {
  const entries = serializeEntries(value, context);
  const base = `new ${value.name}(${quoteString(value.message)})`;

  return entries === '' ? base : `${base}{${entries}}`;
}

/** Render `value`'s own shape, with its children already dispatched back through the context. */
function serializeShape(value: object, context: SerializeContext): string {
  if (value instanceof Date) {
    return `new Date(${value.getTime()})`;
  }

  // A regular expression has no own enumerable entries, so the generic object branch renders every
  // one of them as `{}` — `calledWith(/a/)` and `calledWith(/b/)` would share a key and the second
  // config would silently answer the first one's calls. Its source and flags are the whole value.
  if (value instanceof RegExp) {
    return String(value);
  }

  // Internal slots again, so every URL fell back to `URL{}`; the runner's `equals` compares `href`.
  if (value instanceof URL) {
    return `new URL(${quoteString(value.href)})`;
  }

  if (value instanceof Error) {
    return serializeError(value, context);
  }

  if (value instanceof Map) {
    return serializeMap(value, context);
  }

  if (value instanceof Set) {
    return `new Set([${serializeItems([...value].map((item) => serializeInContext(item, context)))}])`;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeInContext(item, context)).join(',')}]`;
  }

  const entries = serializeEntries(value, context);

  // An instance whose state is all behind accessors or private fields has nothing enumerable to
  // show, and every one of them rendered as `{}` — one key for a `URL`, an `ArrayBuffer` and a
  // component. The class name is the one thing that is always readable, and it keeps them apart.
  if (entries === '' && !isPlainObject(value)) {
    return `${constructorNameOf(value)}{}`;
  }

  return `{${entries}}`;
}

/** Whether the object is a plain record — the only shape whose entries are the whole of it. */
function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

/** The class name to print for an instance, or `Object` when it carries none. */
function constructorNameOf(value: object): string {
  const constructor: unknown = Reflect.get(Object(Object.getPrototypeOf(value)), 'constructor');

  return typeof constructor === 'function' && constructor.name !== '' ? constructor.name : 'Object';
}

/** What stands in for a subtree the budget stops: enough of its shape to keep two of them apart. */
function summarize(value: object): string {
  if (Array.isArray(value)) {
    return `[…${value.length}]`;
  }

  return `${constructorNameOf(value)}{…${ownEnumerableCount(value)}}`;
}

function serializeObject(value: object, context: SerializeContext): string {
  if (context.seen.has(value)) {
    return '[Circular]';
  }

  if (context.budget <= 0) {
    return summarize(value);
  }

  const cached = context.cache.get(value);

  if (cached !== undefined) {
    // What the budget counts: the *copies*. A node reached by many paths is walked once and its
    // text emitted once per path, and it is the copies that turn a shared graph into a megabyte of
    // key — a large argument nothing shares is linear in its own size and renders in full.
    context.budget -= cached.length;

    return cached;
  }

  context.seen.add(value);

  const result = serializeShape(value, context);

  context.seen.delete(value);
  context.cache.set(value, result);

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
