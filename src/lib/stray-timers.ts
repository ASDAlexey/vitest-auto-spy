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
 * The containment is deliberately dumb: wrap the schedulers so every handle they hand out is
 * remembered, drop it again the moment the callback fires or something cancels it, then cancel
 * whatever is still outstanding at the end of the file. Nothing here tries to decide whether a
 * callback *should* still run — by `afterAll` the answer is always no.
 *
 * Under `isolate: true` this is close to a no-op: the environment is discarded per file anyway.
 *
 * **The wrappers are `defineHelper`-wrapped, and that is not cosmetic.** Vitest 4.1's
 * `detectAsyncLeaks` builds its stack at the moment the resource is created — inside the real
 * scheduler, which from here is called by this file. Without the wrap the leak is still reported
 * against the right spec *file*, but the code frame the reporter prints — the part a reader
 * actually reads, and the first thing an agent opens — points at `stray-timers.ts` inside
 * `node_modules/vitest-auto-spy` instead of the `setTimeout` the author wrote. With it, the frame
 * is the spec line again. See {@link defineHelper} for why the probe degrades to identity
 * everywhere the API does not exist.
 */
import { defineHelper } from './define-helper';
import { DOCS_LINKS, withDocs } from './docs-links';

/**
 * The callback half of a scheduler call, spelled out so a wrapper can pass it along and — for a
 * one-shot scheduler — call it itself.
 *
 * `unknown[]` parameters, because a callback sits in a *parameter* position: it is the wrapper that
 * has to be accepted by the real scheduler, not the other way round, and only a callback tolerating
 * whatever it is handed — a frame timestamp, a timeout's extra arguments — is.
 */
export type ScheduledCallback = (...args: unknown[]) => void;

/**
 * The subset of the global scheduler surface this module touches. Declared structurally so a test
 * — or a project with an unusual environment — can pass a stand-in instead of the real globals.
 */
export interface SchedulerHost {
  // Method syntax throughout, deliberately: its parameters are compared bivariantly, which is what
  // lets the real `globalThis` — whose `setTimeout` carries the DOM *and* Node overload sets, and
  // whose handle type differs between them — satisfy this interface with no assertion anywhere.
  setTimeout(callback: ScheduledCallback, ...args: unknown[]): unknown;
  setInterval(callback: ScheduledCallback, ...args: unknown[]): unknown;
  clearTimeout(handle: unknown): void;
  clearInterval(handle: unknown): void;
  requestAnimationFrame?(callback: ScheduledCallback): number;
  cancelAnimationFrame?(handle: number): void;
}

/** Undo the wrapping installed by {@link trackStrayTimers}, cancelling anything still outstanding. */
export type StopTrackingTimers = () => void;

interface Tracking {
  /**
   * Handles from `setTimeout` / `setInterval` that have neither fired nor been cancelled. Both
   * clears accept either kind, so which scheduler produced one is not worth storing.
   */
  readonly handles: Set<unknown>;
  /**
   * Handles whose firing cannot be observed — the legacy string form of `setTimeout`, whose handler
   * is not a function and therefore cannot be wrapped. They are cancelled at teardown like anything
   * else, but they are never counted: nothing tells us when one ran, so counting it would report
   * every suite that used the form as leaking for the rest of the file.
   */
  readonly opaque: Set<unknown>;
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
 * Install `value` in place of `host[name]`, and hand back nothing.
 *
 * `Object.defineProperty` rather than assignment: the wrapper cannot reproduce the overload set of
 * the DOM and Node declarations at once, and this package does not allow the type assertion that
 * would paper over it.
 */
function defineScheduler(host: SchedulerHost, name: keyof SchedulerHost, value: unknown): void {
  Object.defineProperty(host, name, { configurable: true, writable: true, value });
}

/**
 * Schedule through `schedule`, remember the handle, and — for a one-shot scheduler — forget it again
 * the moment the callback fires.
 *
 * A timeout or a frame stops being cancellable once it has run, so a handle left in the set would
 * make {@link countStrayTimers} report what the file *scheduled* rather than what is still pending,
 * and the check its own docblock recommends could never pass. An interval keeps firing until
 * something cancels it, so its handle stays.
 *
 * The wrapper reads the handle out of the enclosing binding instead of capturing it, because the
 * handle exists only once `schedule` has returned — which always happens before a callback can run.
 * A handler that is not a function is passed through untouched: wrapping it would turn a call the
 * real scheduler rejects on the spot into one that fails later, inside the callback.
 */
function scheduleTracked<THandle>(
  schedule: (callback: ScheduledCallback) => THandle,
  callback: ScheduledCallback,
  handles: Set<THandle>,
  oneShot: boolean,
): THandle {
  // eslint-disable-next-line prefer-const -- read by the closure below and assigned after it; `const` cannot express a binding whose reader is created first.
  let handle: THandle;

  const forgetting = (...args: unknown[]): void => {
    handles.delete(handle);
    callback(...args);
  };

  handle = schedule(oneShot && typeof callback === 'function' ? forgetting : callback);
  handles.add(handle);

  return handle;
}

/** The two sets {@link wrapTimerScheduler} records into — see {@link Tracking} for what separates them. */
type TimerSets = Pick<Tracking, 'handles' | 'opaque'>;

/**
 * Replace `setTimeout` / `setInterval` with recording wrappers.
 *
 * The legacy string form of `setTimeout` — a handler evaluated in global scope rather than called —
 * cannot be wrapped without changing what it means, so nothing reports when one fired. Its handle
 * therefore goes to the `opaque` set: still cancelled at teardown, never counted as pending.
 * Recording it in `handles` instead is what used to leave `countStrayTimers()` stuck above zero for
 * the rest of the file, so the `afterEach(() => expect(countStrayTimers()).toBe(0))` this module
 * recommends could never pass again once a suite used the form.
 */
function wrapTimerScheduler(host: SchedulerHost, name: 'setInterval' | 'setTimeout', sets: TimerSets): () => void {
  const original = host[name];
  // Only a timeout is one-shot; an interval outlives its first run.
  const oneShot = name === 'setTimeout';

  // `defineHelper` so a leak `detectAsyncLeaks` finds is framed at the spec's `setTimeout` rather
  // than at the line below it — see this module's docblock.
  const wrapper = defineHelper((callback: ScheduledCallback, ...rest: unknown[]): unknown => {
    if (oneShot && typeof callback === 'string') {
      const handle = original(callback, ...rest);
      sets.opaque.add(handle);

      return handle;
    }

    return scheduleTracked((tracked) => original(tracked, ...rest), callback, sets.handles, oneShot);
  });

  defineScheduler(host, name, wrapper);

  return () => defineScheduler(host, name, original);
}

/**
 * Replace `clearTimeout` / `clearInterval` with wrappers that drop the handle from the set.
 *
 * The symmetric half of the recording above, and the reason {@link countStrayTimers} can mean "still
 * pending": a timer the code under test cancelled itself has nothing left to leak, and counting it
 * would report every suite that cleans up properly as a leak.
 */
function wrapTimerCanceller(host: SchedulerHost, name: 'clearInterval' | 'clearTimeout', handles: Set<unknown>): () => void {
  const original = host[name];

  defineScheduler(host, name, (handle: unknown): void => {
    handles.delete(handle);
    original(handle);
  });

  return () => defineScheduler(host, name, original);
}

/**
 * Replace `requestAnimationFrame` / `cancelAnimationFrame` with recording wrappers.
 *
 * Plain assignment here, unlike the timers above. A DOM environment installs the window's globals
 * on `globalThis` as accessor pairs that forward to the window object; defining a data property
 * over one of those replaces the accessor outright, and a spec that later wants to make frames
 * synchronous finds it can no longer override anything. Assignment goes through the setter and
 * leaves the forwarding intact.
 */
function wrapFrameScheduler(host: SchedulerHost, frames: Set<number>): () => void {
  const original = host.requestAnimationFrame;
  const originalCancel = host.cancelAnimationFrame;

  if (!original) {
    return () => undefined;
  }

  host.requestAnimationFrame = defineHelper((callback: ScheduledCallback): number =>
    scheduleTracked((tracked) => original(tracked), callback, frames, true),
  );

  if (originalCancel) {
    host.cancelAnimationFrame = (handle: number): void => {
      frames.delete(handle);
      originalCancel(handle);
    };
  }

  return () => {
    host.requestAnimationFrame = original;

    if (originalCancel) {
      host.cancelAnimationFrame = originalCancel;
    }
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
  const opaque = new Set<unknown>();
  const frames = new Set<number>();

  const undo = [
    wrapTimerScheduler(host, 'setTimeout', { handles, opaque }),
    wrapTimerScheduler(host, 'setInterval', { handles, opaque }),
    wrapTimerCanceller(host, 'clearTimeout', handles),
    wrapTimerCanceller(host, 'clearInterval', handles),
    wrapFrameScheduler(host, frames),
  ];

  const stop: StopTrackingTimers = () => {
    cancelStrayTimers(host);
    undo.forEach((restore) => restore());
    registry().delete(host);
  };

  registry().set(host, { handles, opaque, frames, stop });

  return stop;
}

/**
 * Cancel everything still outstanding and forget it.
 *
 * Belongs in `afterAll`, where "is this callback still wanted?" always answers no. Returns how many
 * handles it had to cancel, which is the number worth logging when a suite wants to know whether it
 * is actually leaking. A timeout scheduled with the legacy string form is cleared along with the
 * rest but left out of that number: it may well have fired already, and there is no way to tell.
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

  // Always a timeout, so one clear is enough. Clearing one that has already fired is a no-op.
  tracked.opaque.forEach((handle) => host.clearTimeout(handle));
  tracked.opaque.clear();

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
 * A timeout leaves the count when it fires, a frame when it runs, and either kind of timer when
 * something clears it; an interval stays until it is cancelled, which is what makes an uncancelled
 * one worth reporting. The legacy string form of `setTimeout` is not counted at all — its handler
 * cannot be wrapped, so nothing reports when it fired; {@link cancelStrayTimers} still clears it.
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

/**
 * Whether this run has Vitest 4.1's `detectAsyncLeaks` turned on.
 *
 * It matters because the two features arrive at the same timer from opposite ends and, run
 * together, the quiet one wins **silently**. `cancelStrayTimers()` clears the handle in `afterAll`;
 * Vitest collects its leaks after that and asks each remembered resource whether it is still
 * referenced. A cancelled timeout is not, so the run reports *no leaks* — and a suite that has just
 * been told its timers are clean is worse off than one that was never told anything.
 *
 * Read off `globalThis.__vitest_worker__` for the reason {@link readRunnerTimeouts} gives: the
 * resolved config is not on any public export. Defensive at every step and silent on any surprise —
 * an unrecognised shape means "cannot tell", never a failure, because the whole feature is one
 * warning line.
 *
 * `host` is a parameter so a spec can hand over a stand-in worker; production passes the real
 * global.
 */
export function detectsAsyncLeaks(host: object = globalThis): boolean {
  return Reflect.get(Object(Reflect.get(Object(Reflect.get(host, '__vitest_worker__')), 'config')), 'detectAsyncLeaks') === true;
}
