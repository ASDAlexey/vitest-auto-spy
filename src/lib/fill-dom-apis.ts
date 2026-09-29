/**
 * `fillMissingDomApis()` — the browser members jsdom and happy-dom leave out, filled once per worker
 * from the setup file, before `setupAutoSpy()`.
 *
 * Every Angular suite carries its own copy of this block: a `PointerEvent` polyfill for the CDK, a
 * `ResizeObserver` that does nothing, `scrollIntoView` so a list component can call it, and the
 * `document.doctype` Material checks for. Written per worker it has two costs: the copies drift, and a
 * copy that runs from inside a test file is what the global-patch guard then reports against the
 * test. Installed here, before the guard takes its snapshot, it is part of the environment.
 *
 * Only what is missing is filled, so an environment that implements a member keeps its own; every
 * fill is a configurable data property, so `vi.stubGlobal` and `mockValueProp` still replace it.
 * Running it twice fills nothing the second time.
 */

/** How {@link fillMissingDomApis} treats the members the environment does have. */
export interface FillMissingDomApisOptions {
  /**
   * Replace `getComputedStyle` with one that answers the element's inline style only. jsdom's own
   * walks every stylesheet on every call and logs "Not implemented" for a pseudo-element argument;
   * the cheap one does neither. Off by default, because it changes what a stylesheet rule reports.
   */
  readonly cheapComputedStyle?: boolean;
}

const FILLED = Symbol.for('vitest-auto-spy.fillMissingDomApis');

function isOurs(value: unknown): boolean {
  return typeof value === 'function' && FILLED in value;
}

function mark<T extends object>(value: T): T {
  return Object.defineProperty(value, FILLED, { value: true });
}

function fill(target: object, name: string, value: unknown): void {
  Object.defineProperty(target, name, { value, writable: true, configurable: true, enumerable: false });
}

/**
 * jsdom defines `window.scrollTo` and friends, but only to log "Not implemented" to the virtual console.
 * Under the `threads` and `forks` pools Vitest hands out those anonymous functions bound, which hides that source.
 */
function isMissingMethod(owner: object, name: string): boolean {
  const current: unknown = Reflect.get(owner, name);

  if (typeof current !== 'function') {
    return true;
  }

  return Function.prototype.toString.call(current).includes('notImplemented') || (current.name === 'bound ' && onJsdom());
}

function onJsdom(): boolean {
  return String(Reflect.get(Object(Reflect.get(globalThis, 'navigator')), 'userAgent')).includes('jsdom');
}

function noop(): void {
  // Deliberately empty: the environment lays nothing out, so there is nothing to scroll.
}

function pointerEventClass(MouseEventClass: typeof MouseEvent): typeof PointerEvent {
  class PointerEventFill extends MouseEventClass {
    readonly pointerId: number;
    readonly width: number;
    readonly height: number;
    readonly pressure: number;
    readonly tangentialPressure: number;
    readonly tiltX: number;
    readonly tiltY: number;
    readonly twist: number;
    readonly altitudeAngle: number;
    readonly azimuthAngle: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    readonly persistentDeviceId: number;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.width = init.width ?? 1;
      this.height = init.height ?? 1;
      this.pressure = init.pressure ?? 0;
      this.tangentialPressure = init.tangentialPressure ?? 0;
      this.tiltX = init.tiltX ?? 0;
      this.tiltY = init.tiltY ?? 0;
      this.twist = init.twist ?? 0;
      this.altitudeAngle = init.altitudeAngle ?? Math.PI / 2;
      this.azimuthAngle = init.azimuthAngle ?? 0;
      this.pointerType = init.pointerType ?? '';
      this.isPrimary = init.isPrimary ?? false;
      this.persistentDeviceId = 0;
    }

    getCoalescedEvents(): PointerEvent[] {
      return [];
    }

    getPredictedEvents(): PointerEvent[] {
      return [];
    }
  }

  Object.defineProperty(PointerEventFill, 'name', { value: 'PointerEvent' });

  return mark(PointerEventFill);
}

function resizeObserverClass(): typeof ResizeObserver {
  class ResizeObserverFill {
    observe(): void {
      noop();
    }

    unobserve(): void {
      noop();
    }

    disconnect(): void {
      noop();
    }
  }

  Object.defineProperty(ResizeObserverFill, 'name', { value: 'ResizeObserver' });

  return mark(ResizeObserverFill);
}

function cheapGetComputedStyle(doc: Document): typeof getComputedStyle {
  return mark((element: Element): CSSStyleDeclaration => {
    const declaration = doc.createElement('div').style;
    const inline: unknown = Reflect.get(element, 'style');

    declaration.cssText = typeof inline === 'object' && inline !== null ? String(Reflect.get(inline, 'cssText')) : '';

    return declaration;
  });
}

/**
 * Fill what the DOM environment is missing, and report what was filled.
 *
 * ```ts
 * // vitest.setup.ts
 * import { fillMissingDomApis } from 'vitest-auto-spy/dom-stubs';
 * import { setupAutoSpy } from 'vitest-auto-spy/setup';
 *
 * fillMissingDomApis();
 * setupAutoSpy();
 * ```
 *
 * Filled when absent: `PointerEvent` (over the realm's `MouseEvent`), a `ResizeObserver` whose
 * methods do nothing, `scrollTo` / `scrollBy` / `scrollIntoView` on `Element.prototype`, `scroll` /
 * `scrollTo` / `scrollBy` on `window` (jsdom's only log "Not implemented"), `getComputedStyle`, and a
 * `<!DOCTYPE html>` node on `document`. Without a `document` it does nothing and returns `[]`.
 *
 * @returns The names filled by this call — empty on a second call.
 */
export function fillMissingDomApis(options: FillMissingDomApisOptions = {}): readonly string[] {
  if (typeof globalThis.document === 'undefined') {
    return [];
  }

  const document = globalThis.document;
  const filled: string[] = [];

  if (typeof globalThis.PointerEvent !== 'function' && typeof globalThis.MouseEvent === 'function') {
    fill(globalThis, 'PointerEvent', pointerEventClass(globalThis.MouseEvent));
    filled.push('PointerEvent');
  }

  if (typeof globalThis.ResizeObserver !== 'function') {
    fill(globalThis, 'ResizeObserver', resizeObserverClass());
    filled.push('ResizeObserver');
  }

  const elementPrototype: unknown = Reflect.get(Object(Reflect.get(globalThis, 'Element')), 'prototype');

  if (typeof elementPrototype === 'object' && elementPrototype !== null) {
    for (const name of ['scrollTo', 'scrollBy', 'scrollIntoView']) {
      if (typeof Reflect.get(elementPrototype, name) !== 'function') {
        fill(
          elementPrototype,
          name,
          mark(() => noop()),
        );
        filled.push(`Element.prototype.${name}`);
      }
    }
  }

  for (const name of ['scroll', 'scrollTo', 'scrollBy']) {
    if (isMissingMethod(globalThis, name)) {
      fill(
        globalThis,
        name,
        mark(() => noop()),
      );
      filled.push(`window.${name}`);
    }
  }

  const computed: unknown = Reflect.get(globalThis, 'getComputedStyle');

  if (typeof computed !== 'function' || (options.cheapComputedStyle === true && !isOurs(computed))) {
    fill(globalThis, 'getComputedStyle', cheapGetComputedStyle(document));
    filled.push('getComputedStyle');
  }

  if (document.doctype === null) {
    document.insertBefore(document.implementation.createDocumentType('html', '', ''), document.firstChild);
    filled.push('document.doctype');
  }

  return filled;
}
