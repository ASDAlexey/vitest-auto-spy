/**
 * A realm-consistent `AbortController`, for the `{ signal }` form of `addEventListener`.
 *
 * `element.addEventListener('pointerdown', handler, { signal })` is the recommended way to detach
 * listeners since Angular 16, and it explodes in a jsdom test run for a reason that mentions none
 * of the three parties involved:
 *
 *  - Vitest lays Node's own fetch family — `AbortController`, `AbortSignal` — over the jsdom
 *    globals, so a signal is a *Node* `EventTarget`;
 *  - zone.js's patched `addEventListener` registers the abort listener with
 *    `nativeListener.call(signal, 'abort', …)`, where `nativeListener` is jsdom's method;
 *  - jsdom brand-checks its receiver and refuses.
 *
 * ```
 * TypeError: 'addEventListener' called on an object that is not a valid instance of EventTarget
 * ```
 *
 * jsdom raises it, Node caused it, zone.js triggered it, and the component under test is blamed.
 * {@link stubAbortController} puts back a controller whose signal extends the `EventTarget` that
 * belongs to the current realm, which is the one condition all three parties agree on.
 */
import { mockValueProp } from './prop-mock';

/**
 * The signal half. It extends whichever `EventTarget` is global when this module is evaluated —
 * that is the whole point: in a DOM test environment that is the DOM's, so a DOM `addEventListener`
 * accepts it as a receiver.
 */
class DomAbortSignal extends EventTarget {
  aborted = false;
  reason: unknown = undefined;
  onabort: ((event: Event) => void) | null = null;

  throwIfAborted(): void {
    if (this.aborted) {
      throw this.reason;
    }
  }
}

/** The controller half — `abort()` flips the signal and fires `'abort'` exactly once. */
class DomAbortController {
  readonly signal = new DomAbortSignal();

  abort(reason?: unknown): void {
    if (this.signal.aborted) {
      return;
    }

    this.signal.aborted = true;
    this.signal.reason = reason ?? new Error('AbortError');

    const event = new Event('abort');

    this.signal.onabort?.(event);
    this.signal.dispatchEvent(event);
  }
}

/**
 * Replace `AbortController` / `AbortSignal` with realm-consistent stand-ins.
 *
 * Belongs in the setup file next to the observer stubs, for the same reason they do: the code under
 * test constructs its own controller and a spec has no seam to reach it. Installation goes through
 * {@link mockValueProp}, so `restoreMockedProps()` puts the platform's own back.
 *
 * ```ts
 * beforeEach(() => {
 *   stubAbortController();
 * });
 * ```
 */
export function stubAbortController(): void {
  mockValueProp(globalThis, 'AbortController', DomAbortController);
  mockValueProp(globalThis, 'AbortSignal', DomAbortSignal);
}
