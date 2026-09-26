/**
 * `requestAnimationFrame` a spec decides the timing of.
 *
 * jsdom schedules frames on a 16 ms timer and happy-dom on a `setImmediate`, so code that waits for a
 * frame either needs real time to pass or runs at a moment the spec does not control. The copies
 * projects write for themselves come in two shapes — call the callback on the spot, or push it onto
 * an array and loop over it later — and both assign the global by hand, forget
 * `cancelAnimationFrame`, and leak into the next file under `isolate: false`.
 */
import { type MockFn, getMockAdapter } from './mock-adapter';
import { type RestoreProp, mockValueProp } from './prop-mock';
import { currentView } from './web-storage';

/** When a requested frame runs: inside `requestAnimationFrame` itself, or on {@link AnimationFrameStub.flush}. */
export type AnimationFrameMode = 'immediate' | 'queued';

/** How {@link stubAnimationFrame} schedules frames. */
export interface AnimationFrameStubOptions {
  /**
   * `'immediate'` (the default) runs the callback before `requestAnimationFrame` returns;
   * `'queued'` holds it until the spec calls `flush()`.
   */
  mode?: AnimationFrameMode;
  /**
   * The window to install on as well, when that is a different object from `globalThis`. Defaults to
   * `document.defaultView`; `null` installs on `globalThis` alone.
   */
  view?: object | null;
  /**
   * Called with what a frame callback threw, instead of letting the throw propagate out of
   * `requestAnimationFrame` (in `'immediate'` mode) or `flush()`. Rethrow from inside to restore the
   * default behaviour for that error — useful when only a specific, expected error should be
   * swallowed and everything else should still fail the test.
   */
  onError?: (error: unknown) => void;
}

/** The handle {@link stubAnimationFrame} returns. */
export interface AnimationFrameStub {
  /** How many requested frames have not run yet. */
  readonly pending: number;
  /** The spy installed as `requestAnimationFrame`. */
  readonly requestAnimationFrame: MockFn;
  /** The spy installed as `cancelAnimationFrame`. */
  readonly cancelAnimationFrame: MockFn;
  /**
   * Run every frame requested so far, as one browser frame. A frame requested from inside one of
   * them waits for the next `flush()`, as it waits for the next frame in a browser.
   *
   * @param timestamp What the callbacks receive. Defaults to `performance.now()`.
   */
  flush(timestamp?: number): void;
  /** Put the previous globals back and drop every pending frame, before the end of the test. */
  restore(): void;
}

/**
 * Replace `requestAnimationFrame` and `cancelAnimationFrame` with ones the spec drives.
 *
 * ```ts
 * import { stubAnimationFrame } from 'vitest-auto-spy/dom-stubs';
 *
 * beforeEach(() => {
 *   stubAnimationFrame(); // frames run on the spot
 * });
 *
 * it('scrolls after the next frame', () => {
 *   const frames = stubAnimationFrame({ mode: 'queued' });
 *
 *   list.scrollToSelected();
 *   expect(list.scrolled).toBe(false);
 *
 *   frames.flush();
 *   expect(list.scrolled).toBe(true);
 * });
 * ```
 *
 * In `'immediate'` mode a frame requested from inside a running frame is queued rather than run, so
 * an animation loop that requests its own next frame advances one step per `flush()` instead of
 * recursing forever.
 *
 * A callback that throws stops the rest of that `flush()` (or, in `'immediate'` mode, propagates out
 * of `requestAnimationFrame` itself) — pass `onError` to intercept it instead, e.g. to tolerate one
 * specific, expected error and rethrow everything else.
 *
 * Installed through `mockValueProp` on `globalThis`, and on `document.defaultView` when that is a
 * separate object, so `restoreMockedProps()` — and `setupAutoSpy()` after every test — puts the
 * previous globals back. Install it in `beforeEach` or in the test.
 */
export function stubAnimationFrame(options: AnimationFrameStubOptions = {}): AnimationFrameStub {
  const immediate = (options.mode ?? 'immediate') === 'immediate';
  const adapter = getMockAdapter();
  const queue = new Map<number, FrameRequestCallback>();
  let lastId = 0;
  let running = false;

  const run = (callback: FrameRequestCallback, timestamp: number): void => {
    running = true;

    try {
      invokeFrame(callback, timestamp, options.onError);
    } finally {
      running = false;
    }
  };

  const request = adapter.createMockFn((callback: FrameRequestCallback): number => {
    lastId += 1;

    if (immediate && !running) {
      run(callback, performance.now());
    } else {
      queue.set(lastId, callback);
    }

    return lastId;
  }, 'requestAnimationFrame');

  const cancel = adapter.createMockFn((handle: number): void => {
    queue.delete(handle);
  }, 'cancelAnimationFrame');

  const restores = install(options.view === undefined ? currentView() : options.view, request, cancel);

  return {
    get pending(): number {
      return queue.size;
    },
    requestAnimationFrame: request,
    cancelAnimationFrame: cancel,
    flush(timestamp = performance.now()): void {
      for (const handle of [...queue.keys()]) {
        const callback = queue.get(handle);

        if (callback) {
          queue.delete(handle);
          run(callback, timestamp);
        }
      }
    },
    restore(): void {
      // Newest first, as restoreMockedProps() does: happy-dom's window reads through to globalThis, so
      // its recorded descriptor is the stub, and undoing it last would put the stub back.
      [...restores].reverse().forEach((undo) => undo());
      queue.clear();
    },
  };
}

/** Run one frame callback, handing its throw to `onError` instead of letting it propagate, when given. */
function invokeFrame(callback: FrameRequestCallback, timestamp: number, onError: ((error: unknown) => void) | undefined): void {
  try {
    callback(timestamp);
  } catch (error) {
    if (!onError) {
      throw error;
    }

    onError(error);
  }
}

function install(view: object | null, request: MockFn, cancel: MockFn): RestoreProp[] {
  const hosts = view && view !== globalThis ? [globalThis, view] : [globalThis];

  return hosts.flatMap((host) => [
    mockValueProp(host, 'requestAnimationFrame', request),
    mockValueProp(host, 'cancelAnimationFrame', cancel),
  ]);
}
