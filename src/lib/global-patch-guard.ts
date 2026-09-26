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
 * The check is cheap — the definers note which watched object a sealing definition reached, a test
 * compares only those, and every object is compared once per file — and it turns that hunt into one
 * line naming the test, the object and the property.
 */
import { afterEach, beforeAll } from 'vitest';

import * as DOCS_LINKS from './docs-links';
import { type GuardReaction, reactToFindings } from './guard-reaction';
import { withDocs } from './message-link';
import { describeCulprit } from './test-culprit';

/** How {@link guardGlobalPatches} reacts to a patch that cannot be undone. */
export type GlobalPatchReaction = GuardReaction;

/** One watched object and the own properties it had before the test ran. */
export interface GlobalSnapshot {
  /** The name used in the report — `document`, `navigator`, `globalThis`. */
  name: string;
  object: object;
  names: Set<PropertyKey>;
}

/** An object the guard would watch, before it is known whether this environment has it. */
export interface WatchedCandidate {
  name: string;
  object: unknown;
}

/**
 * The DOM prototypes a Jest-era stub is written against.
 *
 * `Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: vi.fn() })` is the
 * canonical one — jsdom implements none of these members, so the patch defines a *new* property, and
 * with `configurable` defaulting to `false` no later file can redefine it: `mockValueProp` then fails
 * with `Cannot redefine property`, in a file that never touched it. They are cheap to watch, too: a
 * prototype carries tens of own names where `globalThis` carries several hundred.
 */
const WATCHED_PROTOTYPES = ['Element', 'HTMLElement', 'HTMLCanvasElement', 'HTMLMediaElement', 'Node', 'EventTarget'] as const;

/** The objects a spec means when it says "a global", plus the prototypes it patches instead. */
function watchedCandidates(): WatchedCandidate[] {
  return [
    { name: 'globalThis', object: globalThis },
    // Read off `globalThis` rather than referenced directly: a Node environment has neither, and
    // the setup entry loads this module whatever environment a project runs in.
    { name: 'document', object: Reflect.get(globalThis, 'document') },
    { name: 'navigator', object: Reflect.get(globalThis, 'navigator') },
    { name: 'location', object: Reflect.get(globalThis, 'location') },
    { name: 'screen', object: Reflect.get(globalThis, 'screen') },
    ...WATCHED_PROTOTYPES.map((name) => ({
      name: `${name}.prototype`,
      object: Reflect.get(Object(Reflect.get(globalThis, name)), 'prototype'),
    })),
  ];
}

/**
 * Record what each watched object owns right now, skipping the ones this environment does not have.
 *
 * Exported — and taking the candidates as a parameter — for this module's own spec: the detection
 * is worth testing directly, because the only other way to reach it is through a hook that fails
 * the test it is asserting about, and jsdom will not let `document` be taken off `globalThis`.
 */
export function snapshotWatchedGlobals(candidates: readonly WatchedCandidate[] = watchedCandidates()): GlobalSnapshot[] {
  return candidates.flatMap(({ name, object }) =>
    typeof object === 'object' && object !== null ? [{ name, object, names: new Set(Reflect.ownKeys(object)) }] : [],
  );
}

/** The descriptor an own property of `object` carries, when nothing can ever redefine or delete it. */
function sealedDescriptor(object: object, name: PropertyKey): PropertyDescriptor | undefined {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `name` was read off `Reflect.ownKeys(object)` in the same synchronous call, so the `undefined` this signature allows for cannot happen; a runtime fallback for it would be a branch no test could reach, and the coverage gate here is 100%.
  const descriptor = Object.getOwnPropertyDescriptor(object, name) as PropertyDescriptor;

  return descriptor.configurable ? undefined : descriptor;
}

interface SealedAddition {
  name: PropertyKey;
  descriptor: PropertyDescriptor;
}

/**
 * Names that appeared since the snapshot and were defined as non-configurable — the irreversible ones.
 *
 * Keys, not descriptors: `getOwnPropertyDescriptors(globalThis)` materialises ~950 descriptor
 * objects, and it would do so after every test to find the addition that virtually never happens.
 * A descriptor is read for the handful of names that are new, and for nothing else.
 *
 * The snapshot is advanced to what the test left behind rather than taken again before the next one:
 * the work is the same either way, and this way a leftover is reported once — against the file that
 * added it — instead of against every test that follows it.
 */
function sealedAdditions({ object, names }: GlobalSnapshot): SealedAddition[] {
  const current = Reflect.ownKeys(object);
  const added = current.filter((name) => !names.has(name));

  // `added` is exactly what `current` has and the snapshot does not, so the counts can only
  // disagree if something was deleted as well — the one case that needs the set rebuilt.
  if (current.length === names.size + added.length) {
    added.forEach((name) => names.add(name));
  } else {
    names.clear();
    current.forEach((name) => names.add(name));
  }

  return added.flatMap((name) => {
    const descriptor = sealedDescriptor(object, name);

    return descriptor === undefined ? [] : [{ name, descriptor }];
  });
}

function undoableHelper(owner: string, { name, descriptor }: SealedAddition): string {
  const property = `${owner}, '${String(name)}'`;

  if (descriptor.get === undefined && descriptor.set === undefined) {
    return `mockValueProp(${property}, value)`;
  }

  return descriptor.set === undefined ? `mockReadonlyPropGetter(${property}, () => value)` : `mockAccessorsProp(${property}, { get, set })`;
}

function report({ name }: GlobalSnapshot, added: readonly SealedAddition[]): string {
  const listed = added.map((addition) => `${name}.${String(addition.name)}`).join(', ');

  return withDocs(
    `[vitest-auto-spy] ${describeCulprit()} redefined ${listed} as non-configurable ` +
      '(Object.defineProperty defaults configurable to false), so no later file can put it back.\n' +
      `Patch it with ${added.map((addition) => undoableHelper(name, addition)).join(', ')} instead: it records what it replaced and undoes it after the test.`,
    DOCS_LINKS.setupGlobals,
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

  reactToFindings(found, reaction);
}

/** Whether a definition leaves the property non-configurable — `configurable` defaults to `false`. */
function seals(attributes: PropertyDescriptor): boolean {
  return attributes.configurable !== true;
}

/**
 * Swap `Object.defineProperty`, `Object.defineProperties` and `Reflect.defineProperty` for wrappers
 * that note which watched object a sealing definition reached. Hands back the undo.
 */
function watchDefinitions(snapshots: readonly GlobalSnapshot[], touched: Set<GlobalSnapshot>): () => void {
  const byObject = new Map(snapshots.map((snapshot) => [snapshot.object, snapshot]));
  const { defineProperty, defineProperties } = Object;
  const reflectDefine = Reflect.defineProperty;
  let armed = true;

  const note = (target: object): void => {
    const snapshot = armed ? byObject.get(target) : undefined;

    if (snapshot !== undefined) {
      touched.add(snapshot);
    }
  };
  // Method shorthand keeps each wrapper's `name` and `length` and leaves it non-constructible, like the originals.
  const objectDefiners = {
    defineProperty(target: object, key: PropertyKey, attributes: PropertyDescriptor): object {
      defineProperty(target, key, attributes);

      if (seals(attributes)) {
        note(target);
      }

      return target;
    },
    defineProperties(target: object, properties: PropertyDescriptorMap): object {
      defineProperties(target, properties);
      note(target);

      return target;
    },
  };
  const reflectDefiners = {
    defineProperty(target: object, key: PropertyKey, attributes: PropertyDescriptor): boolean {
      const defined = reflectDefine(target, key, attributes);

      if (defined && seals(attributes)) {
        note(target);
      }

      return defined;
    },
  };

  Reflect.set(Object, 'defineProperty', objectDefiners.defineProperty);
  Reflect.set(Object, 'defineProperties', objectDefiners.defineProperties);
  Reflect.set(Reflect, 'defineProperty', reflectDefiners.defineProperty);

  return (): void => {
    armed = false;
    putBack(Object, 'defineProperty', objectDefiners.defineProperty, defineProperty);
    putBack(Object, 'defineProperties', objectDefiners.defineProperties, defineProperties);
    putBack(Reflect, 'defineProperty', reflectDefiners.defineProperty, reflectDefine);
  };
}

/** Only while the wrapper is still the installed one: something wrapped on top of it keeps its place. */
function putBack(host: object, key: string, wrapper: unknown, original: unknown): void {
  if (Reflect.get(host, key) === wrapper) {
    Reflect.set(host, key, original);
  }
}

/** The guard's per-file and per-test halves. */
export interface GlobalPatchWatch {
  /** Snapshot every watched object and start noting which ones a sealing definition reaches. */
  openFile(): void;
  /** Check only the objects a sealing definition reached since the last check, naming the test. */
  checkTest(): void;
  /** Put the definers back and check every watched object, whatever reached it. */
  closeFile(): void;
}

/**
 * Enumerating `globalThis` costs ~20 µs under a DOM environment, so a test pays only for the objects
 * a sealing definition reached; the full pass once per file catches what went around the definers.
 */
export function createGlobalPatchWatch(
  reaction: GlobalPatchReaction,
  candidates: () => readonly WatchedCandidate[] = watchedCandidates,
): GlobalPatchWatch {
  const touched = new Set<GlobalSnapshot>();
  let snapshots: GlobalSnapshot[] = [];
  let unwatch: (() => void) | undefined;

  return {
    openFile: (): void => {
      unwatch?.();
      touched.clear();
      snapshots = snapshotWatchedGlobals(candidates());
      unwatch = watchDefinitions(snapshots, touched);
    },
    checkTest: (): void => {
      if (touched.size === 0) {
        return;
      }

      const reached = [...touched];

      touched.clear();
      checkSealedAdditions(reached, reaction);
    },
    closeFile: (): void => {
      unwatch?.();
      unwatch = undefined;
      touched.clear();
      checkSealedAdditions(snapshots, reaction);
    },
  };
}

/**
 * Watch the shared objects — `globalThis`, `document`, `navigator`, `location`, `screen` and the DOM
 * prototypes a stub is written against — for own properties a test adds and cannot remove.
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

  const watch = createGlobalPatchWatch(reaction);

  // From `beforeAll` so a patch in the file's own `beforeAll` is seen; the cleanup runs after every `afterAll`.
  beforeAll(() => {
    watch.openFile();

    return (): void => watch.closeFile();
  });

  afterEach(() => {
    watch.checkTest();
  });
}
