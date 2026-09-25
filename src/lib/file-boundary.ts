/**
 * The repairs `setupAutoSpy()` runs once a spec file is over, in the one order that works.
 *
 * Each of them undoes something a file leaves behind for the next one under `isolate: false` — a
 * listener, a storage spy the runner could not take off, a global replaced by plain assignment — and
 * each reads state another may have just changed, so they share a single `afterAll`.
 */
import { afterAll, beforeAll, vi } from 'vitest';

import { captureGlobalBaseline, restoreGlobals } from './global-restore';
import type { SetupAutoSpyOptions } from './setup-auto-spy';
import { restoreStorageSpies } from './storage-spy-restore';
import { strayListenersError } from './stray-failure';
import {
  type StrayListener,
  baselineStrayListeners,
  describeStrayListeners,
  removeStrayListeners,
  trackStrayListeners,
} from './stray-listeners';
import { restoreTimerGlobals } from './timer-globals';

/** What `strayListeners` took off at the end of a file. Handed to {@link SetupAutoSpyOptions.onStrayListeners}. */
export interface StrayListenerReport {
  /** Listeners on `window` / `document` the file added and never removed. */
  removed: number;
  /** Each of them, with its target, event type, the spec file that added it and where the call came from. */
  listeners: readonly StrayListener[];
}

/** The `setupAutoSpy` options this module reads. */
export type FileBoundaryOptions = Pick<
  SetupAutoSpyOptions,
  'onStrayListeners' | 'restoreGlobals' | 'restoreStorageSpies' | 'strayListeners'
>;

/**
 * A fake clock still installed when the file ends, taken off before the globals are compared: the
 * fakes replace the timer globals, and a restore run under them would write the originals back
 * underneath a clock that still thinks it owns them.
 */
function releaseLeftoverFakes(): void {
  if (vi.isFakeTimers()) {
    vi.useRealTimers();
  }

  restoreTimerGlobals();
}

/** Exported for its spec, like `reportStrayTimers`: a throw from the file's own `afterAll` would fail that spec. */
export function reportStrayListeners(
  removed: number,
  listeners: readonly StrayListener[],
  handler: FileBoundaryOptions['onStrayListeners'],
): void {
  if (removed === 0) {
    return;
  }

  if (handler === 'throw') {
    throw strayListenersError(removed, listeners);
  }

  handler?.({ removed, listeners });
}

/**
 * The file-boundary repairs, as one `afterAll` rather than one each: their order is load-bearing and
 * `sequence.hooks` would otherwise decide it. Fakes come off first, the global restore runs last so
 * it sees what the others left, and the report runs after every repair so a throwing handler cannot
 * skip one.
 */
export function installFileBoundary(options: FileBoundaryOptions): void {
  const repairs: (() => void)[] = [];
  const restoresGlobals = options.restoreGlobals ?? false;
  let report = (): void => undefined;

  if (restoresGlobals) {
    repairs.push(releaseLeftoverFakes);
  }

  if (options.strayListeners ?? false) {
    trackStrayListeners();
    beforeAll(() => {
      baselineStrayListeners();
    });
    repairs.push(() => {
      const listeners = describeStrayListeners();
      const removed = removeStrayListeners();

      report = (): void => {
        reportStrayListeners(removed, listeners, options.onStrayListeners);
      };
    });
  }

  if (options.restoreStorageSpies ?? true) {
    repairs.push(() => {
      restoreStorageSpies();
    });
  }

  if (restoresGlobals) {
    captureGlobalBaseline();
    repairs.push(() => {
      restoreGlobals();
    });
  }

  afterAll(() => {
    repairs.forEach((repair) => repair());
    report();
  });
}
