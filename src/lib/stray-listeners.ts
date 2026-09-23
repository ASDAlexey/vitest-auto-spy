/**
 * Stray-listener containment for shared-environment runs.
 *
 * `isolate: false` gives every spec file in a worker one window and one document. A listener a
 * component or a spec leaves on either therefore outlives the file that added it: the callback runs
 * mid-way through a *different* file, against mocks and a DOM it was never written for, and the
 * failure lands on whichever file the runner happened to be executing. The symptom is a state
 * change nobody ordered — a dialog that closes itself, a focus trap that swallows a keystroke, an
 * analytics call for a page the suite never visited — and the report names an innocent file, so the
 * culprit stays hidden for as long as nobody counts the listeners.
 *
 * The fix is the listener sibling of `stray-timers`, and just as dumb: wrap `addEventListener` so
 * every registration is remembered, wrap `removeEventListener` so an honest cleanup is remembered
 * too, then take off whatever is still registered when the file ends. No judgement is offered about
 * whether a listener *should* still be attached — past the `afterAll` of the file that added it,
 * never.
 *
 * What goes and what stays is the same line `pruneMockRegistry` draws for mocks. A listener already
 * attached when the file's `beforeAll` runs was registered while the module graph was evaluating —
 * which is what a framework's one-time initialisation at import time looks like — and is kept:
 * taking it off would break every later file that imports the same module. What the file itself
 * registers afterwards goes when the file ends. `baselineStrayListeners` exists to draw that line:
 * until it has run, nothing is removable and the count reads 0, so a run that never drew the line
 * cannot strip the framework's own wiring by mistake.
 *
 * One blind spot, by construction: a `{ once: true }` listener the platform already detached after
 * firing. Watching it go means wrapping the listener itself, which would change its identity — the
 * very thing the platform and the code under test match `removeEventListener` by — so the entry
 * stays counted until something removes it. {@link countStrayListeners} repeats this next to the
 * assertion where it bites.
 *
 * Under `isolate: true` the module is nearly inert: the environment is torn down per file anyway.
 */
import { defineHelper } from './define-helper';
import { DOCS_LINKS, withDocs } from './docs-links';
import { markOwnedPatch } from './owned-patch';
import { currentSpecFile } from './spec-file';
import { ownFrames, stackFrames } from './stack-frames';

/** One registration past the baseline, and where it was added — what {@link describeStrayListeners} hands back. */
export interface StrayListener {
  /** The name the target was tracked under: `'globalThis'`, `'document'`, or a stand-in's own. */
  readonly target: string;
  /** The event type string the listener was registered for. */
  readonly type: string;
  /** The spec file that was running at registration; `undefined` outside a Vitest file. */
  readonly file: string | undefined;
  /** Up to five frames of the registration call, those outside dependencies first. */
  readonly frames: readonly string[];
}

/**
 * A target to watch: the object itself, plus the name reports about it should use. Two names for
 * the same object are two registry keys' worth of confusion, so give a stand-in one name and keep it.
 */
export interface TrackedListenerTarget {
  /** Used in reports and as {@link StrayListener.target}. */
  readonly name: string;
  /** The object whose `addEventListener` gets wrapped. */
  readonly target: EventTarget;
}

/** Undo the wrapping installed by {@link trackStrayListeners}; the registry entry goes with it. */
export type StopTrackingListeners = () => void;

/**
 * The listener surface this module wraps, declared structurally so the real `globalThis` — whose
 * `addEventListener` carries the DOM overload set, and whose parameter types are narrower than the
 * garbage a test is allowed to pass — satisfies it with no assertion anywhere. Method syntax
 * throughout, deliberately: its parameters are compared bivariantly, which is what does it.
 */
interface ListenerHost {
  addEventListener(type: string, listener: unknown, ...rest: unknown[]): unknown;
  removeEventListener(type: string, listener: unknown, ...rest: unknown[]): unknown;
}

/** A registration still live on a target, with everything the sweep needs to take it off again. */
interface RecordedListener {
  readonly type: string;
  /** Kept raw rather than narrowed: identity is the platform's own key for removal. */
  readonly listener: unknown;
  /** What the caller passed, so the sweep can hand it back verbatim. */
  readonly options: unknown;
  /** The half of the options the platform matches removals on — see {@link captureOf}. */
  readonly capture: boolean;
  readonly file: unknown;
  readonly trace: Error;
}

/** Per target: the registrations, the baseline they are measured against, and the undo. */
interface TargetTracking {
  readonly name: string;
  entries: RecordedListener[];
  /** Present once {@link baselineStrayListeners} has drawn the line; until then nothing is removable. */
  baseline: Set<RecordedListener> | undefined;
  readonly stop: StopTrackingListeners;
}

/**
 * Keyed by target object, and parked on `globalThis` rather than in module scope.
 *
 * A `vi.resetModules()` re-instantiates this file while the wrapped methods stay wrapped; module
 * scope would forget that and install a second wrapper over the first. The parked map remembers
 * across re-instantiation, which is what makes {@link trackStrayListeners} idempotent for real.
 */
declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyTrackedListeners__: Map<EventTarget, TargetTracking> | undefined;
}

function registry(): Map<EventTarget, TargetTracking> {
  return (globalThis.__vitestAutoSpyTrackedListeners__ ??= new Map());
}

/** The pair of methods a value needs before this module can wrap it. */
const TARGET_METHODS = ['addEventListener', 'removeEventListener'] as const;

/** `Object(value)` folds `undefined` and `null` into one missing-everything path, like a storage probe. */
function isEventTargetShaped(value: unknown): value is EventTarget {
  const host: object = Object(value);

  return TARGET_METHODS.every((method) => typeof Reflect.get(host, method) === 'function');
}

/**
 * `globalThis` always; `document` when the environment has one. The document is read through
 * `Reflect` because a `node` environment does not merely lack the value — the global is undeclared
 * there, and touching the identifier would throw before any check could run.
 */
function defaultTargets(): TrackedListenerTarget[] {
  const targets: TrackedListenerTarget[] = [{ name: 'globalThis', target: globalThis }];
  const candidate: unknown = Reflect.get(globalThis, 'document');

  if (isEventTargetShaped(candidate)) {
    targets.push({ name: 'document', target: candidate });
  }

  return targets;
}

function resolveTargets(targets?: readonly TrackedListenerTarget[]): readonly TrackedListenerTarget[] {
  return targets ?? defaultTargets();
}

/**
 * The capture half of an options argument, the way the platform normalises it: a boolean options
 * value *is* the flag, an object carries it as a property, and anything else — absent, `null`, a
 * string — captures on the bubble phase. Removal matches on this flag and nothing else, so both
 * wrappers have to read it exactly as the platform would.
 */
function captureOf(options: unknown): boolean {
  if (typeof options === 'boolean') {
    return options;
  }

  if (options === null || typeof options !== 'object') {
    return false;
  }

  return Reflect.get(options, 'capture') === true;
}

/**
 * Where the listener was added, cheaply: the stack is captured at registration and formatted only
 * if the entry turns out to be a stray. The depth cap keeps a framework's dispatch chain from
 * crowding out the line that made the call.
 */
function captureOrigin(): { file: unknown; trace: Error } {
  const limit = Error.stackTraceLimit;

  try {
    Error.stackTraceLimit = 12;

    return { file: currentSpecFile(), trace: new Error() };
  } finally {
    Error.stackTraceLimit = limit;
  }
}

/**
 * Remember the registration — unless the platform would have ignored it. A second
 * `addEventListener` with the same type, listener and capture flag replaces the first entry's
 * options rather than adding a second listener, so recording it twice would make the sweep call
 * `removeEventListener` twice for one registration.
 */
function recordEntry(tracking: TargetTracking, type: string, listener: unknown, options: unknown): void {
  const capture = captureOf(options);
  const duplicate = tracking.entries.some((entry) => entry.type === type && entry.listener === listener && entry.capture === capture);

  if (duplicate) {
    return;
  }

  tracking.entries.push({ type, listener, options, capture, ...captureOrigin() });
}

/**
 * Drop what the platform drops, and only that. The capture flag belongs in the match because
 * `removeEventListener(type, listener)` does not take off a listener registered with
 * `{ capture: true }` — forgetting it anyway would leave the sweep counting a listener that is
 * genuinely still attached, and blaming a file for a leak it plugged.
 */
function forgetEntries(tracking: TargetTracking, type: string, listener: unknown, capture: boolean): void {
  tracking.entries = tracking.entries.filter((entry) => entry.type !== type || entry.listener !== listener || entry.capture !== capture);
}

/** What was registered past the baseline — an empty hand before one has been drawn, on purpose. */
function strayEntries(tracking: TargetTracking): RecordedListener[] {
  const { baseline } = tracking;

  if (!baseline) {
    return [];
  }

  return tracking.entries.filter((entry) => !baseline.has(entry));
}

/**
 * Wrap one target and put it in the registry.
 *
 * Plain assignment on both ends, never `defineProperty`: a DOM environment installs the window's
 * globals on `globalThis` as accessor pairs forwarding to the window object, and a data property
 * defined over one replaces the forwarding outright. Assignment goes through the setter and leaves
 * it intact, so the environment keeps working — and the undo takes the same road out.
 */
function installTracking({ name, target }: TrackedListenerTarget): StopTrackingListeners {
  const host: ListenerHost = target;
  const originalAdd = host.addEventListener;
  const originalRemove = host.removeEventListener;
  const stop: StopTrackingListeners = () => {
    host.addEventListener = originalAdd;
    host.removeEventListener = originalRemove;
    registry().delete(target);
  };
  const tracking: TargetTracking = { name, entries: [], baseline: undefined, stop };

  // `defineHelper`, so a throw inside either original is reported at the caller's line rather than
  // inside this file.
  const add = defineHelper((type: string, listener: unknown, ...rest: unknown[]): unknown => {
    recordEntry(tracking, type, listener, rest[0]);

    return Reflect.apply(originalAdd, target, [type, listener, ...rest]);
  });
  const remove = defineHelper((type: string, listener: unknown, ...rest: unknown[]): unknown => {
    forgetEntries(tracking, type, listener, captureOf(rest[0]));

    return Reflect.apply(originalRemove, target, [type, listener, ...rest]);
  });

  // A wrapper is owned the moment it is installed, so a file-scope global restore built elsewhere
  // steps around it instead of uninstalling the tracking at the first file boundary.
  markOwnedPatch(add);
  markOwnedPatch(remove);

  // A target that refuses an assignment — a getter-only accessor, a frozen stand-in — must not
  // keep an earlier wrapper installed with no registry entry behind it. Only the first assignment
  // can have landed by then, and restoring one that never landed would throw on the same accessor
  // and bury the original error, so the flag says which half to put back.
  let addWrapped = false;

  try {
    host.addEventListener = add;
    addWrapped = true;
    host.removeEventListener = remove;
  } catch (error) {
    if (addWrapped) {
      host.addEventListener = originalAdd;
    }

    throw error;
  }

  registry().set(target, tracking);

  return stop;
}

/**
 * Start recording every listener the targets register — and every removal that takes one off.
 *
 * Idempotent per target: a call for a target already tracked hands back an undo of the existing
 * installation instead of wrapping a second time, and every undo ever handed out unwraps that one
 * installation. Call it once, as early as your setup file runs.
 *
 * @param targets Defaults to `globalThis` and `document`, the two a shared environment actually
 *                shares. Pass stand-ins with names to watch specific objects instead.
 *
 * @returns The undo — it puts the original methods back and forgets the targets.
 *
 * @example
 * ```ts
 * // vitest.setup.ts
 * trackStrayListeners();
 * ```
 */
export function trackStrayListeners(targets?: readonly TrackedListenerTarget[]): StopTrackingListeners {
  const stops: StopTrackingListeners[] = [];
  const installed: StopTrackingListeners[] = [];

  try {
    for (const named of resolveTargets(targets)) {
      const existing = registry().get(named.target);

      if (existing) {
        stops.push(existing.stop);

        continue;
      }

      const stop = installTracking(named);

      stops.push(stop);
      installed.push(stop);
    }
  } catch (error) {
    installed.forEach((stop) => stop());

    throw error;
  }

  return () => stops.forEach((stop) => stop());
}

/**
 * Draw the line the sweep works to: everything registered *now* is module-graph state and survives
 * every sweep; what is registered afterwards belongs to the file that is running.
 *
 * Belongs next to the file's `beforeAll` — the moment "was already attached" stops meaning "the
 * framework put it there while importing". Re-running it re-draws the line around whatever is live
 * at that later moment.
 *
 * @param targets Defaults to `globalThis` and `document`. A target nothing tracks is skipped
 *                quietly — the count is the place that insists on the setup.
 *
 * @example
 * ```ts
 * beforeAll(() => baselineStrayListeners());
 * ```
 */
export function baselineStrayListeners(targets?: readonly TrackedListenerTarget[]): void {
  for (const { target } of resolveTargets(targets)) {
    const tracking = registry().get(target);

    if (!tracking) {
      continue;
    }

    tracking.baseline = new Set(tracking.entries);
  }
}

/**
 * Take off every listener past the baseline, and report how many went.
 *
 * Belongs in `afterAll`, where the only registrations past the baseline are the file's own. Each
 * one goes out through the target's live `removeEventListener` with the options it was registered
 * with, verbatim — the capture phase included — so the platform's own matching rules do the work.
 *
 * @returns How many listeners it removed. Before any baseline, or for a target nothing tracks,
 *          that is 0: the framework's wiring is exactly what a baseline-less sweep must not touch.
 *
 * @example
 * ```ts
 * afterAll(() => {
 *   const removed = removeStrayListeners();
 *
 *   if (removed > 0) {
 *     process.stdout.write(`${removed} listener(s) outlived this file\n`);
 *   }
 * });
 * ```
 */
export function removeStrayListeners(targets?: readonly TrackedListenerTarget[]): number {
  let removed = 0;

  for (const { target } of resolveTargets(targets)) {
    const tracking = registry().get(target);

    if (!tracking) {
      continue;
    }

    const host: ListenerHost = target;
    const strays = new Set(strayEntries(tracking));

    for (const entry of strays) {
      if (entry.options === undefined) {
        host.removeEventListener(entry.type, entry.listener);
      } else {
        host.removeEventListener(entry.type, entry.listener, entry.options);
      }

      removed += 1;
    }

    tracking.entries = tracking.entries.filter((entry) => !strays.has(entry));
  }

  return removed;
}

/**
 * How many listeners are currently registered past the baseline — the assertion a suite reaches for
 * when it wants a leak to fail the run rather than be cleaned up quietly.
 *
 * A listener leaves the count when the code under test removes it with a matching capture flag, or
 * when the sweep takes it off. **A `{ once: true }` listener that has already fired stays counted
 * until one of those happens:** the wrapper cannot watch the listener itself — wrapping it would
 * break the identity the platform and the code under test both match `removeEventListener` by — so
 * the platform detaching a fired one-shot is invisible here, and the sweep's own removal of it is
 * the harmless no-op the platform promises for an already-detached listener.
 *
 * @example
 * ```ts
 * afterEach(() => expect(countStrayListeners()).toBe(0));
 * ```
 */
export function countStrayListeners(targets?: readonly TrackedListenerTarget[]): number {
  let total = 0;

  for (const { target } of resolveTargets(targets)) {
    const tracking = registry().get(target);

    if (!tracking) {
      throw new Error(withDocs('countStrayListeners() needs trackStrayListeners() to have run first.', DOCS_LINKS.setup));
    }

    total += strayEntries(tracking).length;
  }

  return total;
}

/** The stack frames of the wrappers in this file, which say nothing about where the call came from. */
const OWN_MODULE_FRAME = /stray-listeners\.[jt]s/;

function describeEntry(name: string, entry: RecordedListener): StrayListener {
  const frames = stackFrames(entry.trace.stack).filter((frame) => !OWN_MODULE_FRAME.test(frame));

  return { target: name, type: entry.type, file: typeof entry.file === 'string' ? entry.file : undefined, frames: ownFrames(frames, 5) };
}

/**
 * What is still registered past the baseline, on which target, and from which file and line — read
 * it before {@link removeStrayListeners} takes the evidence off. A target nothing tracks contributes
 * nothing; {@link countStrayListeners} is the place that says why.
 */
export function describeStrayListeners(targets?: readonly TrackedListenerTarget[]): StrayListener[] {
  const described: StrayListener[] = [];

  for (const { name, target } of resolveTargets(targets)) {
    const tracking = registry().get(target);

    if (!tracking) {
      continue;
    }

    for (const entry of strayEntries(tracking)) {
      described.push(describeEntry(name, entry));
    }
  }

  return described;
}
