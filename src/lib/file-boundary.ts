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

/** A file-end repair; what it returns is the report it owes, made only once every repair has run. */
export type BoundaryRepair = () => (() => void) | undefined;

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
 * Run every repair, then make every report and fail with what they threw: one error as it was,
 * several as an `AggregateError`, so a throwing handler can hide neither another report nor a repair.
 * Exported for its spec, which cannot let the file's own `afterAll` throw.
 */
export function runFileBoundary(repairs: readonly BoundaryRepair[]): void {
  const reports = repairs.map((repair) => repair()).filter((report) => report !== undefined);
  const errors: unknown[] = [];

  for (const report of reports) {
    try {
      report();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length === 1) {
    throw errors[0];
  }

  if (errors.length > 1) {
    const messages = errors.map((error) => `\n  - ${error instanceof Error ? error.message : String(error)}`);

    throw new AggregateError(errors, `[vitest-auto-spy] ${errors.length} file-end reports failed:${messages.join('')}`);
  }
}

/**
 * The file-boundary repairs, as one `afterAll` rather than one each: their order is load-bearing and
 * `sequence.hooks` would otherwise decide it. Fakes come off first, the global restore runs after the
 * other repairs so it sees what they left, `sweeps` run last, and the reports run after every repair
 * so a throwing handler cannot skip one.
 */
export function installFileBoundary(options: FileBoundaryOptions, sweeps: readonly BoundaryRepair[] = []): void {
  const repairs: BoundaryRepair[] = [];
  const restoresGlobals = options.restoreGlobals ?? false;

  if (restoresGlobals) {
    repairs.push(() => {
      releaseLeftoverFakes();

      return undefined;
    });
  }

  if (options.strayListeners ?? false) {
    trackStrayListeners();
    beforeAll(() => {
      baselineStrayListeners();
    });
    repairs.push(() => {
      const listeners = describeStrayListeners();
      const removed = removeStrayListeners();

      return (): void => {
        reportStrayListeners(removed, listeners, options.onStrayListeners);
      };
    });
  }

  if (options.restoreStorageSpies ?? true) {
    repairs.push(() => {
      restoreStorageSpies();

      return undefined;
    });
  }

  if (restoresGlobals) {
    captureGlobalBaseline();
    repairs.push(() => {
      restoreGlobals();

      return undefined;
    });
  }

  repairs.push(...sweeps);

  afterAll(() => {
    runFileBoundary(repairs);
  });
}
