import { type RestoreProp, mockValueProp } from './prop-mock';

/**
 * Make `element.getBoundingClientRect()` report a box. jsdom lays nothing out and answers zeros for
 * every element; happy-dom does the same.
 *
 * ```ts
 * import { stubElementRect } from 'vitest-auto-spy/dom-stubs';
 *
 * stubElementRect(container, { width: 800, height: 600 });
 * ```
 *
 * The fields left out are `0`, and `top` / `right` / `bottom` / `left` are derived by a real
 * `DOMRect`, so they never disagree with `x` / `y` / `width` / `height`. Every call returns a fresh
 * rect, as the browser does. Installed through `mockValueProp`, so `restoreMockedProps()` — and
 * `setupAutoSpy()` after every test — puts the element's own method back; the returned function
 * does it sooner.
 */
export function stubElementRect(element: Element, rect: DOMRectInit = {}): RestoreProp {
  const { x = 0, y = 0, width = 0, height = 0 } = rect;

  return mockValueProp(element, 'getBoundingClientRect', (): DOMRect => new DOMRect(x, y, width, height));
}
