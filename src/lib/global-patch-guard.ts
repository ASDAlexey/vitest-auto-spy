/**
 * Catch the property patch that can never be undone, in the file that made it.
 *
 * `Object.defineProperty(document, 'cookie', { value, writable: true })` is the Jest-era way to
 * stub a browser global, and `configurable` defaults to `false` — which nobody notices, because
 * under per-file isolation the environment is thrown away anyway. Under `isolate: false` it is a
 * mine: the property can no longer be redefined *or* deleted, so every later file in that worker
 * inherits the leftover, and the failure surfaces as a third-party library misbehaving "every other
 * run" with nothing pointing back at the file that did it. Finding it by hand means grepping the
 * repository for `defineProperty(` and reading every hit.
 *
 * The check is cheap — a list of own property names before and after each test, and a descriptor
 * read only for a name that was not there before — and it turns that hunt into one line naming the
 * file, the object and the property.
 */
import { afterEach, beforeEach, expect } from 'vitest';

import { DOCS_LINKS, withDocs } from './docs-links';

/** How {@link guardGlobalPatches} reacts to a patch that cannot be undone. */
export type GlobalPatchReaction = 'off' | 'throw' | 'warn';

/** One watched object and the own properties it had before the test ran. */
export interface GlobalSnapshot {
  /** The name used in the report — `document`, `navigator`, `globalThis`. */
  name: string;
  object: object;
  names: Set<string>;
}

/** An object the guard would watch, before it is known whether this environment has it. */
export interface WatchedCandidate {
  name: string;
  object: unknown;
}

/** The three objects a spec means when it says "a global". */
function watchedCandidates(): WatchedCandidate[] {
  return [
    { name: 'globalThis', object: globalThis },
    // Read off `globalThis` rather than referenced directly: a Node environment has neither, and
    // the setup entry loads this module whatever environment a project runs in.
    { name: 'document', object: Reflect.get(globalThis, 'document') },
    { name: 'navigator', object: Reflect.get(globalThis, 'navigator') },
  ];
}

/**
 * Record what `globalThis`, `document` and `navigator` own right now, skipping the ones this
 * environment does not have.
 *
 * Exported — and taking the candidates as a parameter — for this module's own spec: the detection
 * is worth testing directly, because the only other way to reach it is through a hook that fails
 * the test it is asserting about, and jsdom will not let `document` be taken off `globalThis`.
 */
export function snapshotWatchedGlobals(candidates: readonly WatchedCandidate[] = watchedCandidates()): GlobalSnapshot[] {
  return candidates.flatMap(({ name, object }) =>
    typeof object === 'object' && object !== null ? [{ name, object, names: new Set(Object.getOwnPropertyNames(object)) }] : [],
  );
}

/** Whether an own property of `object` was defined so that nothing can ever redefine or delete it. */
function isSealed(object: object, name: string): boolean {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `name` was read off `getOwnPropertyNames(object)` in the same synchronous call, so the `undefined` this signature allows for cannot happen; a runtime fallback for it would be a branch no test could reach, and the coverage gate here is 100%.
  const descriptor = Object.getOwnPropertyDescriptor(object, name) as PropertyDescriptor;

  return !descriptor.configurable;
}

/**
 * Names that appeared since the snapshot and were defined as non-configurable — the irreversible ones.
 *
 * Names, not descriptors: `getOwnPropertyDescriptors(globalThis)` materialises ~950 descriptor
 * objects, and it would do so after every test to find the addition that virtually never happens.
 * A descriptor is read for the handful of names that are new, and for nothing else.
 *
 * The snapshot is advanced to what the test left behind rather than taken again before the next one:
 * the work is the same either way, and this way a leftover is reported once — against the file that
 * added it — instead of against every test that follows it.
 */
function sealedAdditions({ object, names }: GlobalSnapshot): string[] {
  const current = Object.getOwnPropertyNames(object);
  const added = current.filter((name) => !names.has(name));

  // `added` is exactly what `current` has and the snapshot does not, so the counts can only
  // disagree if something was deleted as well — the one case that needs the set rebuilt.
  if (current.length === names.size + added.length) {
    added.forEach((name) => names.add(name));
  } else {
    names.clear();
    current.forEach((name) => names.add(name));
  }

  return added.filter((name) => isSealed(object, name));
}

function report({ name }: GlobalSnapshot, added: string[]): string {
  const testPath = expect.getState().testPath ?? 'this file';

  return withDocs(
    `[vitest-auto-spy] ${testPath} redefined ${added.map((property) => `${name}.${property}`).join(', ')} as a non-configurable ` +
      'own property, so nothing can put it back — not `restoreMockedProps()`, not `vi.unstubAllGlobals()`, not the next ' +
      "file's own `Object.defineProperty`. `Object.defineProperty` defaults `configurable` to `false`; use " +
      `\`mockValueProp(${name}, '${added[0]}', value)\`, which records the descriptor it replaced and registers the undo.`,
    DOCS_LINKS.setup,
  );
}

/**
 * Compare the snapshot against the current state, react to whatever cannot be undone, and leave the
 * snapshot describing the state the next test starts from.
 *
 * Exported alongside {@link snapshotWatchedGlobals} so the reaction can be exercised without a hook
 * failing the very test that is asserting on it.
 */
export function checkSealedAdditions(before: readonly GlobalSnapshot[], reaction: GlobalPatchReaction): void {
  const found = before.flatMap((snapshot) => {
    const added = sealedAdditions(snapshot);

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
 * Watch `globalThis`, `document` and `navigator` for own properties a test adds and cannot remove.
 *
 * Registers the hooks itself; `setupAutoSpy({ guardGlobals: … })` is how a project turns it on.
 *
 * @param reaction `'throw'` fails the test that made the patch, `'warn'` only reports it (the right
 *   choice while a large suite is being cleaned up), `'off'` registers nothing.
 */
export function guardGlobalPatches(reaction: GlobalPatchReaction): void {
  if (reaction === 'off') {
    return;
  }

  let watched: GlobalSnapshot[] = [];

  beforeEach(() => {
    // Taken once for the file, not before every test: the check advances the snapshot itself, so a
    // fresh one would only rediscover what the previous `afterEach` already recorded. `globalThis`
    // is always there, which makes an empty list the "not taken yet" state and nothing else.
    if (watched.length === 0) {
      watched = snapshotWatchedGlobals();
    }
  });

  afterEach(() => {
    checkSealedAdditions(watched, reaction);
  });
}
