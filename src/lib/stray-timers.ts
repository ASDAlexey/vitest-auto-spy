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
import { markOwnedPatch } from './owned-patch';
import { currentSpecFile } from './spec-file';
import { ownFrames, stackFrames } from './stack-frames';

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

/** One outstanding callback, and where it came from — what {@link describeStrayTimers} hands back. */
export interface StrayTimer {
  readonly kind: 'frame' | 'interval' | 'timeout';
  /** The spec file that was running when it was scheduled; `undefined` outside a Vitest file. */
  readonly file: string | undefined;
  /** Up to five frames of the scheduling call, those outside dependencies first. */
  readonly frames: readonly string[];
}

/** The stack is taken now and formatted only if the callback turns out to be a stray. */
interface Origin {
  readonly kind: StrayTimer['kind'];
  readonly file: unknown;
  readonly trace: Error;
}

/** Undo the wrapping installed by {@link trackStrayTimers}, cancelling anything still outstanding. */
export type StopTrackingTimers = () => void;

interface Tracking {
  /**
   * Handles from `setTimeout` / `setInterval` that have neither fired nor been cancelled. Both
   * clears accept either kind, so which scheduler produced one is not worth storing.
   */
  readonly handles: Map<unknown, Origin>;
  /**
   * Handles whose firing cannot be observed — the legacy string form of `setTimeout`, whose handler
   * is not a function and therefore cannot be wrapped. They are cancelled at teardown like anything
   * else, but they are never counted: nothing tells us when one ran, so counting it would report
   * every suite that used the form as leaking for the rest of the file.
   */
  readonly opaque: Set<unknown>;
  /**
   * The same timeout and interval handles, keyed by the number they coerce to.
   *
   * Node hands out `Timeout` objects with a `Symbol.toPrimitive`, and a library that stores the id
   * as a number — for serialisation, or to stay portable with the browser's numeric handles —
   * cancels with `clearTimeout(+handle)`. That misses a `Map` keyed by the object, so a timer the
   * code under test cancelled properly was reported as a stray, with a stack pointing at healthy
   * code. Only filled where the handle actually coerces, i.e. on Node.
   */
  readonly numeric: Map<number, unknown>;
  readonly frames: Map<number, Origin>;
  /** Set while the library schedules on its own behalf, so its timers are never charged to a file. */
  readonly pause: { paused: boolean };
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
  // A `globalThis` augmentation has to be declared with `var`.
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
  handles: Map<THandle, Origin>,
  kind: Origin['kind'],
  numeric?: Map<number, unknown>,
): THandle {
  const oneShot = kind !== 'interval';
  // eslint-disable-next-line prefer-const -- read by the closure below and assigned after it; `const` cannot express a binding whose reader is created first.
  let handle: THandle;

  const forgetting = (...args: unknown[]): void => {
    if (numeric) {
      forgetHandle({ handles, numeric }, handle);
    } else {
      handles.delete(handle);
    }

    callback(...args);
  };

  handle = schedule(oneShot && typeof callback === 'function' ? forgetting : callback);
  handles.set(handle, captureOrigin(kind));

  const id = numeric && numericIdOf(handle);

  if (numeric && id !== undefined) {
    numeric.set(id, handle);
  }

  return handle;
}

/**
 * Where the callback was scheduled, cheaply: a V8 stack is captured at construction and formatted only
 * when read, and the depth is capped so an Angular zone's frames do not come along.
 */
function captureOrigin(kind: Origin['kind']): Origin {
  const limit = Error.stackTraceLimit;

  Error.stackTraceLimit = 12;

  const trace = new Error();

  Error.stackTraceLimit = limit;

  return { kind, file: currentSpecFile(), trace };
}

/** The sets {@link wrapTimerScheduler} records into — see {@link Tracking} for what separates them. */
type TimerSets = Pick<Tracking, 'handles' | 'numeric' | 'opaque' | 'pause'>;

/** The number a Node `Timeout` coerces to, or `undefined` for a handle that is already one — or neither. */
function numericIdOf(handle: unknown): number | undefined {
  return typeof handle === 'object' && handle !== null && Symbol.toPrimitive in handle ? Number(handle) : undefined;
}

/** Drop a handle from the tracking, whichever of its two forms is being handed over. */
function forgetHandle(sets: Pick<Tracking, 'handles' | 'numeric'>, handle: unknown): void {
  sets.handles.delete(handle);

  if (typeof handle === 'number') {
    const object = sets.numeric.get(handle);

    sets.numeric.delete(handle);

    if (object !== undefined) {
      sets.handles.delete(object);
    }

    return;
  }

  const id = numericIdOf(handle);

  if (id !== undefined) {
    sets.numeric.delete(id);
  }
}

/** Node's hook for "this function has a promise-returning twin", read off the real scheduler and put back on the wrapper. */
const PROMISIFY_CUSTOM = Symbol.for('nodejs.util.promisify.custom');

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
  const promisified: unknown = Reflect.get(original, PROMISIFY_CUSTOM);
  // Only a timeout is one-shot; an interval outlives its first run.
  const kind = name === 'setTimeout' ? 'timeout' : 'interval';

  // `defineHelper` so a leak `detectAsyncLeaks` finds is framed at the spec's `setTimeout` rather
  // than at the line below it — see this module's docblock.
  const wrapper = defineHelper((callback: ScheduledCallback, ...rest: unknown[]): unknown => {
    if (sets.pause.paused) {
      return original(callback, ...rest);
    }

    if (kind === 'timeout' && typeof callback === 'string') {
      const handle = original(callback, ...rest);
      sets.opaque.add(handle);

      return handle;
    }

    return scheduleTracked((tracked) => original(tracked, ...rest), callback, sets.handles, kind, sets.numeric);
  });

  // Node's `setTimeout` carries a custom `promisify` implementation, and `promisify` prefers it over
  // the callback-last form. Losing it made `promisify(setTimeout)` build the callback version
  // instead, so `const sleep = promisify(setTimeout)` — evaluated at import, before any test, in
  // every Node and NestJS suite — threw `ERR_INVALID_ARG_TYPE` on its first call. Carried over
  // verbatim: that path goes to `timers/promises`, which never reached the tracking anyway.
  if (promisified !== undefined) {
    Object.defineProperty(wrapper, PROMISIFY_CUSTOM, { configurable: true, value: promisified });
  }

  markOwnedPatch(wrapper);
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
function wrapTimerCanceller(
  host: SchedulerHost,
  name: 'clearInterval' | 'clearTimeout',
  sets: Pick<Tracking, 'handles' | 'numeric'>,
): () => void {
  const original = host[name];

  const wrapper = (handle: unknown): void => {
    forgetHandle(sets, handle);
    original(handle);
  };

  markOwnedPatch(wrapper);
  defineScheduler(host, name, wrapper);

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
function wrapFrameScheduler(host: SchedulerHost, frames: Map<number, Origin>, pause: { paused: boolean }): () => void {
  const original = host.requestAnimationFrame;
  const originalCancel = host.cancelAnimationFrame;

  if (!original) {
    return () => undefined;
  }

  const request = defineHelper((callback: ScheduledCallback): number =>
    pause.paused ? original(callback) : scheduleTracked((tracked) => original(tracked), callback, frames, 'frame'),
  );

  markOwnedPatch(request);
  host.requestAnimationFrame = request;

  if (originalCancel) {
    const cancel = (handle: number): void => {
      frames.delete(handle);
      originalCancel(handle);
    };

    markOwnedPatch(cancel);
    host.cancelAnimationFrame = cancel;
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

  const handles = new Map<unknown, Origin>();
  const opaque = new Set<unknown>();
  const numeric = new Map<number, unknown>();
  const frames = new Map<number, Origin>();
  const pause = { paused: false };
  const undo: (() => void)[] = [];

  const stop: StopTrackingTimers = () => {
    cancelStrayTimers(host);
    undo.forEach((restore) => restore());
    registry().delete(host);
  };

  // Rolled back as a whole if any wrap throws part-way. `wrapFrameScheduler` assigns rather than
  // defines, so a host whose `requestAnimationFrame` is an accessor with no setter — or a frozen
  // stand-in — used to leave the four timer wrappers installed with no undo anywhere and no
  // registry entry: `countStrayTimers()` then threw "needs trackStrayTimers() to have run first"
  // for the rest of the run, and a second call wrapped everything a second time.
  // One push per wrap, not one call with five arguments: the arguments are all evaluated before
  // `push` runs, so a throw in the last of them would leave the first four installed and unrecorded
  // — the very state this rollback exists to prevent.
  try {
    undo.push(wrapTimerScheduler(host, 'setTimeout', { handles, numeric, opaque, pause }));
    undo.push(wrapTimerScheduler(host, 'setInterval', { handles, numeric, opaque, pause }));
    undo.push(wrapTimerCanceller(host, 'clearTimeout', { handles, numeric }));
    undo.push(wrapTimerCanceller(host, 'clearInterval', { handles, numeric }));
    undo.push(wrapFrameScheduler(host, frames, pause));
  } catch (error) {
    undo.forEach((restore) => restore());

    throw error;
  }

  registry().set(host, { handles, numeric, opaque, frames, pause, stop });

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

  const cancelled = pendingHandles(tracked).length + tracked.frames.size;

  // A handle is either a timeout or an interval, and both clears accept either — calling both is
  // cheaper than recording which scheduler produced it.
  tracked.handles.forEach((_origin, handle) => {
    host.clearTimeout(handle);
    host.clearInterval(handle);
  });
  tracked.handles.clear();
  tracked.numeric.clear();

  // Always a timeout, so one clear is enough. Clearing one that has already fired is a no-op.
  tracked.opaque.forEach((handle) => host.clearTimeout(handle));
  tracked.opaque.clear();

  const cancelFrame = host.cancelAnimationFrame;

  if (cancelFrame) {
    tracked.frames.forEach((_origin, handle) => cancelFrame(handle));
  }

  tracked.frames.clear();

  return cancelled;
}

/**
 * Run `work` untracked. For setup work: jsdom answers every Web Storage write with a real `setTimeout`,
 * so the library's storage probe would otherwise be charged to whichever file ran it.
 */
export function withoutStrayTimerTracking<T>(work: () => T, host: SchedulerHost = defaultHost()): T {
  const tracked = registry().get(host);

  if (!tracked) {
    return work();
  }

  tracked.pause.paused = true;

  try {
    return work();
  } finally {
    tracked.pause.paused = false;
  }
}

/**
 * Whether the handle still stands for a callback that can fire.
 *
 * Node's `Timeout` can also be cancelled through `handle.close()`, which no wrapper here sees. The
 * object then reports itself destroyed, and reading that at count time is cheaper and safer than
 * wrapping a method on every handle — it is an internal field, so it is only ever used to *drop* a
 * handle, never to keep one.
 */
function isPending(handle: unknown): boolean {
  return Reflect.get(Object(handle), '_destroyed') !== true;
}

/** Outstanding timeouts and intervals, minus the ones cancelled behind the wrappers' back. */
function pendingHandles(tracked: Tracking): Origin[] {
  const pending: Origin[] = [];

  tracked.handles.forEach((origin, handle) => {
    if (isPending(handle)) {
      pending.push(origin);
    }
  });

  return pending;
}

/** The stack frames of the wrappers in this file, which say nothing about where the call came from. */
const OWN_MODULE_FRAME = /stray-timers\.[jt]s/;

function describeOrigin({ kind, file, trace }: Origin): StrayTimer {
  const frames = stackFrames(trace.stack).filter((frame) => !OWN_MODULE_FRAME.test(frame));

  return { kind, file: typeof file === 'string' ? file : undefined, frames: ownFrames(frames, 5) };
}

/**
 * What is still outstanding, and where each was scheduled — read it before {@link cancelStrayTimers}.
 * The file is the one running at the time, which is how a callback charged to the wrong file is traced.
 */
export function describeStrayTimers(host: SchedulerHost = defaultHost()): StrayTimer[] {
  const tracked = registry().get(host);

  return tracked ? [...pendingHandles(tracked), ...tracked.frames.values()].map(describeOrigin) : [];
}

/**
 * How many scheduled callbacks are currently outstanding — the assertion a suite reaches for when
 * it wants a leak to fail the run rather than be cleaned up quietly.
 *
 * A timeout leaves the count when it fires, a frame when it runs, and either kind of timer when
 * something clears it — by handle, by the number the handle coerces to, or through its own
 * `close()`; an interval stays until it is cancelled, which is what makes an uncancelled one worth
 * reporting. The legacy string form of `setTimeout` is not counted at all — its handler cannot be
 * wrapped, so nothing reports when it fired; {@link cancelStrayTimers} still clears it.
 *
 * **It cannot see a timer scheduled while fake timers are installed.** `vi.useFakeTimers()` assigns
 * its own `setTimeout` over the wrapper, so everything the fake clock hands out bypasses the
 * tracking entirely — which makes `expect(countStrayTimers()).toBe(0)` vacuous for any file running
 * on a frozen clock, `setupAutoSpy({ strayTimers: true, globalFakeTimers: true })` included. Read
 * `vi.getTimerCount()` for the fake clock's own backlog; the two do not compose.
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

  return pendingHandles(tracked).length + tracked.frames.size;
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
