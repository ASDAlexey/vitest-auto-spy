/**
 * Catch the enumerable property left on a built-in prototype, in the file that left it.
 *
 * One own enumerable property on `Object.prototype` stops the rest of a worker from **collecting**,
 * and the run still reads as mostly green: `Test Files 145 failed | 1613 passed` with
 * `Tests 11880 passed | 0 failed` on the next line — zero failing tests because those files never
 * executed. They arrive as one block under `Failed Suites` sharing a single error with no stack:
 *
 * ```text
 * TypeError: Spread syntax requires ...iterable[Symbol.iterator] to be a function
 * ```
 *
 * Vitest assembles a file's hooks in `mergeHooks`, which walks its hooks object with `for…in`; the
 * inherited key is then spread as if it were an array. Under `isolate: false` the property outlives
 * the file that wrote it, so the casualties are that worker's whole tail — and which files those
 * are depends on scheduling, which is why the count wanders between runs on an unchanged tree and
 * why a run whose writer happened to go last comes out green. Anything else that walks a plain
 * object breaks the same way: `superagent`'s mime table (`typeMap[type].map is not a function`) was
 * the second place one such leak surfaced.
 *
 * The stack is absent rather than lost. `parseErrorStacktrace` filters frames through
 * `stackIgnorePatterns`, which covers `"/vitest/dist/"` and `/\/@vitest\/\w+\/dist\//`, and every
 * frame of that error lives there. So the runner cannot point at the writer even in principle — and
 * that is the gap this guard fills.
 *
 * The write is nearly always accidental: code that patches `Object.getPrototypeOf(instance)` to
 * decorate a class is handed `Object.prototype` itself the moment `instance` is an object literal
 * from a `useValue` provider, or a test double. Patch the prototype of the class the object came
 * from, never the prototype of a plain object.
 *
 * **What the guard can and cannot see.** It runs per test, so a property added while a test runs
 * fails that test by name. A property added while the spec file is being *imported* takes that
 * file's own collect down before any hook can run — nothing inside the runner can report it. What
 * the guard still does there is take the key back off, so the rest of the worker collects normally
 * and the report names one file instead of a hundred.
 */
import { afterEach, beforeEach, expect } from 'vitest';

import { DOCS_LINKS, withDocs } from './docs-links';

/** How {@link guardPrototypePollution} reacts to a property left on a built-in prototype. */
export type PrototypePollutionReaction = 'off' | 'throw' | 'warn';

/** One watched prototype and the own enumerable keys it carried before the run touched it. */
export interface PrototypeSnapshot {
  /** The name used in the report — `Object.prototype`, `Array.prototype`. */
  name: string;
  object: object;
  keys: Set<string>;
}

/** A prototype the guard would watch, paired with the name its report should use. */
export interface WatchedPrototype {
  name: string;
  object: object;
}

/**
 * The prototypes worth watching: the three whose enumerable keys are walked by ordinary code.
 *
 * `Object.prototype` is the one that breaks the runner itself. `Array.prototype` is next — a key
 * there is visible to every `for…in` over an array, which is how older libraries iterate. Deeper
 * built-ins are left alone: a key on `String.prototype` is a bug too, but nothing walks a string
 * with `for…in`, so watching them would cost a check per test to report nothing.
 */
function watchedPrototypes(): WatchedPrototype[] {
  return [
    { name: 'Object.prototype', object: Object.prototype },
    { name: 'Array.prototype', object: Array.prototype },
    { name: 'Function.prototype', object: Function.prototype },
  ];
}

/**
 * Record what the watched prototypes own right now.
 *
 * A clean realm answers with three empty sets, which would make a hard-coded "expect nothing" check
 * correct almost everywhere. Almost: a project may legitimately ship a polyfill that defines an
 * enumerable prototype member, and taking that back off at the end of the first test would break
 * every test after it in a way far harder to read than the leak this module is about. So the
 * baseline is what the environment had before the guard was installed, and only additions count.
 *
 * Exported — and taking the prototypes as a parameter — for this module's own spec: the detection is
 * worth testing directly, and doing it against the real `Object.prototype` means a failing
 * expectation would take the rest of the file with it.
 */
export function snapshotPrototypes(candidates: readonly WatchedPrototype[] = watchedPrototypes()): PrototypeSnapshot[] {
  return candidates.map(({ name, object }) => ({ name, object, keys: new Set(Object.keys(object)) }));
}

/**
 * Keys that appeared since the snapshot, taken back off so the rest of the worker still runs.
 *
 * The snapshot is advanced to what the test left behind rather than taken again, so a key the guard
 * could not remove — one defined as non-configurable — is reported once, against the file that
 * added it, instead of against every test that follows it.
 */
function pollutingAdditions({ object, keys }: PrototypeSnapshot): string[] {
  const current = Object.keys(object);
  const added = current.filter((key) => !keys.has(key));

  added.forEach((key) => {
    // A `delete` that fails leaves the key in place; recording it keeps the next test from
    // reporting the same one again, which would bury the file that is actually to blame.
    if (!Reflect.deleteProperty(object, key)) {
      keys.add(key);
    }
  });

  return added;
}

function report({ name }: PrototypeSnapshot, added: string[]): string {
  const testPath = expect.getState().testPath ?? 'this file';

  return withDocs(
    `[vitest-auto-spy] ${testPath} left ${added.map((key) => `"${key}"`).join(', ')} on ${name} as an own enumerable ` +
      "property. Vitest walks a file's hooks with `for…in`, so the extra key is spread as if it were an array and " +
      '**every spec file after this one in the same worker fails to collect** — with no stack, because every frame of ' +
      'that error is filtered out of the report. The key has been taken back off so the rest of the run survives. ' +
      'Patch the prototype of the class the object came from, not the prototype of a plain object or of a test double: ' +
      '`Object.getPrototypeOf(instance)` is `Object.prototype` itself whenever `instance` is an object literal.',
    DOCS_LINKS.setup,
  );
}

/**
 * Compare the snapshot against the current state, react to whatever was added, and leave the
 * snapshot describing the state the next test starts from.
 *
 * Exported alongside {@link snapshotPrototypes} so the reaction can be exercised without a hook
 * failing the very test that is asserting on it.
 */
export function checkPrototypePollution(before: readonly PrototypeSnapshot[], reaction: PrototypePollutionReaction): void {
  const found = before.flatMap((snapshot) => {
    const added = pollutingAdditions(snapshot);

    return added.length > 0 ? [report(snapshot, added)] : [];
  });

  if (found.length === 0) {
    return;
  }

  if (reaction === 'throw') {
    throw new Error(found.join('\n'));
  }

  // eslint-disable-next-line no-console -- `'warn'` exists precisely to surface this without failing the run.
  console.warn(found.join('\n'));
}

/**
 * Watch `Object.prototype`, `Array.prototype` and `Function.prototype` for own enumerable keys a
 * test adds, remove them, and name the file that added them.
 *
 * Registers the hooks itself; `setupAutoSpy({ prototypePollution: … })` is how a project turns it
 * on, and it is on by default — the failure it catches is silent, and the check is a `Object.keys`
 * over three objects with about sixty own properties between them.
 *
 * @param reaction `'throw'` fails the test that made the write, `'warn'` removes the key and only
 *   reports it, `'off'` registers nothing — including the removal.
 */
export function guardPrototypePollution(reaction: PrototypePollutionReaction): void {
  if (reaction === 'off') {
    return;
  }

  let watched: PrototypeSnapshot[] = [];

  beforeEach(() => {
    // Taken once for the file, not before every test: the check advances the snapshot itself, so a
    // fresh one would only rediscover what the previous `afterEach` already removed.
    if (watched.length === 0) {
      watched = snapshotPrototypes();
    }
  });

  afterEach(() => {
    checkPrototypePollution(watched, reaction);
  });
}
