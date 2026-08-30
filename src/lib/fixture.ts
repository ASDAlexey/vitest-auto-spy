/**
 * `createFixture` / `createFixtureFactory` — one checked copy of a data model, handed out fresh.
 *
 * Specs do not only spy; they *build data*, and that is where a suite meets the type checker for
 * the first time. A content model with seventeen required fields, each with its own nested
 * interface, gets copied into every spec that needs it: eight files, a hundred-line literal apiece.
 * The copies then rot independently. Measured on one migration shard, that single habit produced
 * **28 `TS1117`** diagnostics (a duplicate key in a literal — the runtime keeps the *second*, so an
 * automated "drop one" fix silently changes values) and half of the shard's `TS2741`.
 *
 * The two obvious escapes are worse than the problem:
 *
 * - `as T` and `Partial<T>` both delete the diagnostic that made the migration worth doing —
 *   `TS2353`, "this fixture still sets a field the model dropped six months ago". A fixture that
 *   cannot be wrong about the model is a fixture that never reports the model changed.
 * - {@link createAutoMock} builds an object from a type, but only its **methods**. A data model has
 *   none, so the machine walks straight past the place the errors actually are.
 *
 * So the answer is not another way to skip the fields. It is somewhere to *put* them once:
 * {@link createFixtureFactory} takes a complete, fully checked `T` — every required field, every
 * removed field rejected, one place for the compiler to point at — and returns a function that
 * stamps out copies with per-test changes applied. The check happens once; the fifty call sites
 * that follow name only what they care about.
 *
 * **Each call returns a new object.** That is not a performance footnote — a fixture shared by
 * reference across a file is the most common way one test's mutation decides another test's
 * outcome, and under `isolate: false` the sharing reaches across files. The copy is deep through
 * plain objects and arrays and stops there: a `Date`, a `Map`, a DOM node or a class instance is
 * carried across by reference, because rebuilding one would strip its prototype — accessors
 * included — and hand back something that is no longer the model it claims to be. When the defaults
 * *are* a class instance with getters, snapshot it with {@link withOverrides} first and hand the
 * result here.
 *
 * | | `createMock<T>()` | `createFixture<T>()` |
 * | --- | --- | --- |
 * | Input | the fields this test reads | a complete `T`, plus what this test changes |
 * | Unnamed fields | `undefined` at runtime | the default's value |
 * | Use it for | a shape read shallowly, once | a model many specs build, read deeply, and mutate |
 */
import type { DeepPartial } from './types';

/** Stamps out one fixture per call. What {@link createFixtureFactory} returns. */
export type FixtureFactory<T> = (overrides?: DeepPartial<T>) => T;

/**
 * The one key that must never be copied by assignment: writing it sets the target's prototype
 * instead of adding a field, so a fixture carrying it would rewrite the shape of its own copy.
 */
const FORBIDDEN_KEY = '__proto__';

/**
 * Whether a value is a literal-shaped record, as opposed to something with behaviour of its own.
 *
 * The distinction decides both halves of this module — what gets copied and what gets merged — and
 * it is drawn at the prototype rather than at `typeof`, because that is the only test that tells a
 * `{ … }` literal apart from a `Date`, a `Map`, an `HTMLElement` or a model instance while still
 * accepting an object built with `Object.create(null)`.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

/** Copy the records and arrays, carry everything else across as it is. */
function copyValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(copyValue);
  }

  return isPlainRecord(value) ? copyRecord(value) : value;
}

/** A fresh record with copied values, `__proto__` left behind. */
function copyRecord(record: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};

  Object.keys(record).forEach((key) => {
    if (key !== FORBIDDEN_KEY) {
      copy[key] = copyValue(record[key]);
    }
  });

  return copy;
}

/**
 * Apply one override on top of one default.
 *
 * Records merge key by key, so an override naming a single leaf keeps its siblings. Everything else
 * — arrays included — replaces wholesale: a fixture that says `items: [one]` means that list and
 * not "the default list with one more element", and no merge rule over arrays is right often enough
 * to be worth guessing at.
 */
function mergeValue(base: unknown, override: unknown): unknown {
  if (isPlainRecord(base) && isPlainRecord(override)) {
    return mergeRecord(base, override);
  }

  return copyValue(override);
}

/** `base` copied, then every key the override names replaced or merged into. */
function mergeRecord(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const merged = copyRecord(base);

  Object.keys(override).forEach((key) => {
    if (key !== FORBIDDEN_KEY) {
      merged[key] = key in base ? mergeValue(base[key], override[key]) : copyValue(override[key]);
    }
  });

  return merged;
}

/**
 * Build one `T` from a complete default and the fields this test changes.
 *
 * ```ts
 * const article = createFixture<Article>(ARTICLE_DEFAULTS, { header: { title: 'Draft' } });
 * ```
 *
 * `defaults` is a whole `T`, so a field the model removed is a compile error here rather than a
 * value nothing reads; `overrides` is checked at every depth against the same type. Sibling fields
 * of an overridden leaf are kept — `header.subtitle` above survives — while an overridden array
 * replaces the default one entirely.
 *
 * Reach for {@link createFixtureFactory} as soon as a second spec needs the same defaults; reach
 * for {@link createMock} when there are no meaningful defaults to begin with and the test reads two
 * fields of a large shape.
 *
 * @param defaults A complete `T`. Checked in full: missing and removed fields both fail here.
 * @param overrides The fields this fixture changes, checked against `T` at every depth.
 */
export function createFixture<T>(defaults: T, overrides?: DeepPartial<T>): T {
  const copy = copyValue(defaults);

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the copy is built from a `T` and merged with values checked against `T`; the structure is the type's, and there is no way to say that to the checker through `unknown`.
  return (overrides === undefined ? copy : mergeValue(copy, overrides)) as T;
}

/**
 * Somewhere to put a fixture, so that the model is written out and checked exactly once.
 *
 * ```ts
 * // article.fixture.ts — one file, one checked literal
 * export const anArticle = createFixtureFactory<Article>({ id: '1', header: { title: '', subtitle: '' }, tags: [], … });
 *
 * // in a spec
 * const draft = anArticle({ header: { title: 'Draft' } });
 * const tagged = anArticle({ tags: ['news'] });
 * ```
 *
 * The defaults are copied when the factory is built, so a later edit to the object that was passed
 * in cannot reach a fixture already handed out — and every call returns a fresh copy, so one test
 * mutating what it was given cannot decide what the next one sees.
 *
 * @param defaults A complete `T`, checked once, here.
 */
export function createFixtureFactory<T>(defaults: T): FixtureFactory<T> {
  const pinned = copyValue(defaults);

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `pinned` is a copy of a `T`, narrowed back to it for the same reason as in `createFixture`.
  return (overrides?: DeepPartial<T>): T => createFixture(pinned as T, overrides);
}
