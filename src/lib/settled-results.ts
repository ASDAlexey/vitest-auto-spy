/**
 * Cross-runtime `mock.settledResults` polyfill.
 *
 * Vitest tracks each mock call's eventual promise outcome natively on
 * `mock.settledResults`; Bun (`bun:test`) and `node:test` do not. When the host
 * mock exposes no native `settledResults`, this installs one on
 * `mock.settledResults` and records outcomes with Vitest's exact
 * placeholder-then-mutate semantics: every call first pushes an
 * `{ type: 'incomplete', value: undefined }` entry (index-aligned with the
 * call), then that entry is mutated to `fulfilled` / `rejected` — synchronously
 * for a non-thenable return, or when the returned promise settles. The typed
 * `spy.method.mock.settledResults` surface (from Vitest's `Mock` type) therefore
 * behaves identically across all three runtimes.
 */
import { isFastSpy, isThenable } from './spy-probe';

/** A single settled-result entry, mirroring Vitest's `MockSettledResult` shape. */
interface SettledResultEntry {
  type: 'fulfilled' | 'incomplete' | 'rejected';
  value: unknown;
}

/** Records each call's eventual promise outcome onto a host mock's `settledResults`. */
export interface SettledResultsRecorder {
  /** Record `returned` as a fresh settled-result entry, returning it unchanged. Absent when the host tracks its own. */
  record?(returned: unknown): unknown;
  /** Drop every recorded entry (mirrors `mockClear`/`mockReset` on the native array). */
  clear(): void;
}

/**
 * What a runtime that tracks `settledResults` itself needs: nothing recorded, nothing to clear.
 *
 * `record` is deliberately absent rather than an identity function. A spy's dispatch runs on every
 * call, and calling through an identity function there is a real cost for a value that is already in
 * hand — so the dispatch asks whether there is a recorder at all, and on Vitest and on this
 * library's own spies there is not.
 */
const NATIVE_RECORDER: SettledResultsRecorder = {
  clear: (): void => undefined,
};

/**
 * Install a `settledResults` array on `mockFn.mock` and return a recorder that
 * fills it. Returns a no-op recorder when the mock has no `.mock` state or
 * already tracks `settledResults` natively (Vitest), so the native array is
 * never shadowed.
 */
export function installSettledResultsPolyfill(mockFn: object): SettledResultsRecorder {
  // A fast spy tracks settled results itself, and its `mock` state is built on first use — reading
  // it here to find that out would allocate the very state the laziness exists to avoid.
  if (isFastSpy(mockFn)) {
    return NATIVE_RECORDER;
  }

  const state = Reflect.get(mockFn, 'mock');

  if (typeof state !== 'object' || state === null || 'settledResults' in state) {
    return NATIVE_RECORDER;
  }

  const settledResults: SettledResultEntry[] = [];

  Object.defineProperty(state, 'settledResults', { value: settledResults, enumerable: true, configurable: true, writable: true });

  return {
    record(returned: unknown): unknown {
      const entry: SettledResultEntry = { type: 'incomplete', value: undefined };
      settledResults.push(entry);

      if (isThenable(returned)) {
        returned.then(
          (value: unknown): void => {
            entry.type = 'fulfilled';
            entry.value = value;
          },
          (reason: unknown): void => {
            entry.type = 'rejected';
            entry.value = reason;
          },
        );
      } else {
        entry.type = 'fulfilled';
        entry.value = returned;
      }

      return returned;
    },

    clear(): void {
      settledResults.length = 0;
    },
  };
}
