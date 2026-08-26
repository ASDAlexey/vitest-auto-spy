/**
 * Stray-timer containment for shared-environment runs.
 *
 * With `isolate: false` every spec file in a worker shares one set of globals. A `setTimeout` a
 * component schedules and never clears therefore survives the file that created it: the callback
 * fires later, while a *different* file is mid-test, against mocks and a DOM that no longer match.
 * The runner blames whichever file happened to be running, so the report points at innocent code
 * and the real culprit is never named.
 *
 * `requestAnimationFrame` deserves the same treatment in a zoneless app, and is easier to miss:
 * Angular's change-detection scheduler races a timeout against a frame callback, so a component
 * torn down at the end of one file can still have a frame queued. What surfaces afterwards is an
 * Angular-internal complaint — a scheduler running watches while scheduling, or a signal read in
 * the notification phase — again attributed to the wrong file.
 *
 * The containment is deliberately dumb: wrap the four schedulers so every handle they hand out is
 * remembered, then cancel whatever is still outstanding at the end of the file. Nothing here tries
 * to decide whether a callback *should* still run — by `afterAll` the answer is always no.
 *
 * Under `isolate: true` this is close to a no-op: the environment is discarded per file anyway.
 */
import { DOCS_LINKS, withDocs } from './docs-links';

/**
 * The subset of the global scheduler surface this module touches. Declared structurally so a test
 * — or a project with an unusual environment — can pass a stand-in instead of the real globals.
 */
export interface SchedulerHost {
  // Method syntax throughout, deliberately: its parameters are compared bivariantly, which is what
  // lets the real `globalThis` — whose `setTimeout` carries the DOM *and* Node overload sets, and
  // whose handle type differs between them — satisfy this interface with no assertion anywhere.
  setTimeout(...args: never[]): unknown;
  setInterval(...args: never[]): unknown;
  clearTimeout(handle: unknown): void;
  clearInterval(handle: unknown): void;
  requestAnimationFrame?(callback: never): number;
  cancelAnimationFrame?(handle: number): void;
}

/** Undo the wrapping installed by {@link trackStrayTimers}, cancelling anything still outstanding. */
export type StopTrackingTimers = () => void;

interface Tracking {
  /** Handles from `setTimeout` / `setInterval`. Both clears accept either, so the kind is not worth storing. */
  readonly handles: Set<unknown>;
  readonly frames: Set<number>;
  readonly stop: StopTrackingTimers;
}

/**
 * Keyed by host, and parked on `globalThis` rather than in module scope.
 *
 * A `vi.resetModules()` re-instantiates this file while the wrapped globals stay wrapped; module
 * scope would forget that and install a second wrapper over the first. The global map remembers
 * across re-instantiation, which is what makes {@link trackStrayTimers} genuinely idempotent.
 */
declare global {
  // eslint-disable-next-line no-var -- a `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyTrackedSchedulers__: Map<SchedulerHost, Tracking> | undefined;
}

function registry(): Map<SchedulerHost, Tracking> {
  return (globalThis.__vitestAutoSpyTrackedSchedulers__ ??= new Map());
}

function defaultHost(): SchedulerHost {
  return globalThis;
}

/**
 * Replace `setTimeout` / `setInterval` with recording wrappers.
 *
 * `Object.defineProperty` rather than assignment: the wrapper cannot reproduce the overload set of
 * the DOM and Node declarations at once, and this package does not allow the type assertion that
 * would paper over it.
 */
function wrapTimerScheduler(host: SchedulerHost, name: 'setInterval' | 'setTimeout', handles: Set<unknown>): () => void {
  const original = host[name];

  Object.defineProperty(host, name, {
    configurable: true,
    writable: true,
    value: (...args: never[]): unknown => {
      const handle = original(...args);
      handles.add(handle);

      return handle;
    },
  });

  return () => {
    Object.defineProperty(host, name, { configurable: true, writable: true, value: original });
  };
}

/**
 * Replace `requestAnimationFrame` with a recording wrapper.
 *
 * Plain assignment here, unlike the timers above. A DOM environment installs the window's globals
 * on `globalThis` as accessor pairs that forward to the window object; defining a data property
 * over one of those replaces the accessor outright, and a spec that later wants to make frames
 * synchronous finds it can no longer override anything. Assignment goes through the setter and
 * leaves the forwarding intact.
 */
function wrapFrameScheduler(host: SchedulerHost, frames: Set<number>): () => void {
  const original = host.requestAnimationFrame;

  if (!original) {
    return () => undefined;
  }

  host.requestAnimationFrame = (callback: never): number => {
    const handle = original(callback);
    frames.add(handle);

    return handle;
  };

  return () => {
    host.requestAnimationFrame = original;
  };
}

/**
 * Start recording every timeout, interval and animation frame `host` hands out.
 *
 * Idempotent: calling it again for the same host returns the same stop function without installing
 * a second layer of wrappers. Call it once, as early as your setup file runs.
 *
 * @param host Defaults to the real globals. Pass a stand-in to contain a specific object instead.
 *
 * @returns The undo — it cancels whatever is outstanding and puts the original schedulers back.
 *
 * @example
 * ```ts
 * // vitest.setup.ts — or let setupAutoSpy({ strayTimers: true }) do both halves for you
 * trackStrayTimers();
 * afterAll(() => cancelStrayTimers());
 * ```
 */
export function trackStrayTimers(host: SchedulerHost = defaultHost()): StopTrackingTimers {
  const tracked = registry().get(host);

  if (tracked) {
    return tracked.stop;
  }

  const handles = new Set<unknown>();
  const frames = new Set<number>();

  const undo = [
    wrapTimerScheduler(host, 'setTimeout', handles),
    wrapTimerScheduler(host, 'setInterval', handles),
    wrapFrameScheduler(host, frames),
  ];

  const stop: StopTrackingTimers = () => {
    cancelStrayTimers(host);
    undo.forEach((restore) => restore());
    registry().delete(host);
  };

  registry().set(host, { handles, frames, stop });

  return stop;
}

/**
 * Cancel everything scheduled since the last call and forget it.
 *
 * Belongs in `afterAll`, where "is this callback still wanted?" always answers no. Returns how many
 * handles it had to cancel, which is the number worth logging when a suite wants to know whether it
 * is actually leaking.
 *
 * @example
 * ```ts
 * afterAll(() => {
 *   const cancelled = cancelStrayTimers();
 *
 *   if (cancelled > 0) {
 *     process.stdout.write(`${cancelled} timer(s) outlived this file\n`);
 *   }
 * });
 * ```
 */
export function cancelStrayTimers(host: SchedulerHost = defaultHost()): number {
  const tracked = registry().get(host);

  if (!tracked) {
    return 0;
  }

  const cancelled = tracked.handles.size + tracked.frames.size;

  // A handle is either a timeout or an interval, and both clears accept either — calling both is
  // cheaper than recording which scheduler produced it.
  tracked.handles.forEach((handle) => {
    host.clearTimeout(handle);
    host.clearInterval(handle);
  });
  tracked.handles.clear();

  const cancelFrame = host.cancelAnimationFrame;

  if (cancelFrame) {
    tracked.frames.forEach((handle) => cancelFrame(handle));
  }

  tracked.frames.clear();

  return cancelled;
}

/**
 * How many scheduled callbacks are currently outstanding — the assertion a suite reaches for when
 * it wants a leak to fail the run rather than be cleaned up quietly.
 *
 * @example
 * ```ts
 * afterEach(() => expect(countStrayTimers()).toBe(0));
 * ```
 */
export function countStrayTimers(host: SchedulerHost = defaultHost()): number {
  const tracked = registry().get(host);

  if (!tracked) {
    throw new Error(withDocs('countStrayTimers() needs trackStrayTimers() to have run first.', DOCS_LINKS.setup));
  }

  return tracked.handles.size + tracked.frames.size;
}
