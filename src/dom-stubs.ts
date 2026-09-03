/**
 * `vitest-auto-spy/dom-stubs` — the globals a component constructs for itself, replaced by ones a
 * spec can drive.
 *
 * ```ts
 * import { stubIntersectionObserver, stubMediaElement } from 'vitest-auto-spy/dom-stubs';
 * ```
 *
 * **These lived on the root entry until 4.0.0.** They moved because ESM re-export is eager and no
 * runner tree-shakes a test file: exporting them from the root meant every spec in every project
 * evaluated 27 kB of observer, media-element and `AbortController` code, whether or not it had a DOM
 * at all. Measured on the built package, that is **0.116 ms of every spec file** and 12.8 kB of
 * `dist/index.js` — small per file, and paid by the majority so the minority need not add an import.
 * A suite that does use them pays one extra module instead, which is the trade the other direction.
 *
 * Nothing else changed: same helpers, same signatures, same undo journal. `restoreMockedProps()`
 * from the root still puts back everything patched here — the journal lives on `globalThis` for
 * exactly this reason — and `setupAutoSpy()` still sweeps it between tests.
 */
import { hasMockAdapter, registerMockAdapter } from './lib/mock-adapter';
import { vitestMockAdapter } from './lib/vitest-adapter';

// The stubs mint spies, and this entry may be imported without the core — but it is not
// runtime-specific, so register the default Vitest adapter only when no runtime entry
// (`vitest-auto-spy/bun`, `…/node`, imported first) has installed its own. Same shape as
// `vitest-auto-spy/console`.
if (!hasMockAdapter()) {
  registerMockAdapter(vitestMockAdapter);
}

// A `<video>` / `<audio>` that answers — jsdom implements neither beyond the element itself
export { stubMediaElement, type MediaElementState, type MediaElementStub, type MediaElementStubOptions } from './lib/media-element-stub';

// A realm-consistent AbortController, for `addEventListener(..., { signal })` under zone.js
export { stubAbortController } from './lib/abort-controller-stub';

// Observer globals a component constructs itself, replaced by ones a spec can drive
export {
  intersectionEntry,
  mutationRecord,
  resizeEntry,
  stubIntersectionObserver,
  stubMutationObserver,
  stubObserver,
  stubResizeObserver,
  type IntersectionObserverStubOptions,
  type MutationRecordInit,
  type ObserverGlobal,
  type ObserverInstance,
  type ObserverStub,
  type ObserverStubOptions,
  type ResizeEntryRect,
} from './lib/observer-stubs';
