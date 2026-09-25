/**
 * `hostElement` / `queryElement` — a typed element out of a fixture, without a cast.
 *
 * Angular types `ComponentFixture.nativeElement` and `DebugElement.nativeElement` as `any`. Under
 * `@typescript-eslint/strict-type-checked` every read of it is a `no-unsafe-*` report, and the one
 * way to type it — `fixture.nativeElement as HTMLElement` — is exactly what
 * `consistent-type-assertions: 'never'` forbids. A suite that turns both on has no clean route to
 * its own DOM.
 *
 * These two check the element at run time with `instanceof` and return it typed, so the narrowing
 * is a fact rather than a claim: a selector that matches nothing, or matches an element of another
 * kind, fails at the call that asked, with the selector and what it found in the message.
 */
import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';

/** A `ComponentFixture` or a `DebugElement` — the only member read is `nativeElement`. */
export interface NativeElementHolder {
  readonly nativeElement: unknown;
}

/** The constructor an element is checked against: `HTMLButtonElement`, `SVGElement`, `Element`. */
export type ElementConstructor<E extends Element> = abstract new (...args: never[]) => E;

/** `<button.close>` (HTMLButtonElement) — a one-line description, never a subtree dump. */
function describeElement(element: Element): string {
  const classes = [...element.classList].map((name) => `.${name}`).join('');

  return `<${element.tagName.toLowerCase()}${classes}> (${element.constructor.name})`;
}

function fail(message: string): string {
  return withDocs(`[vitest-auto-spy] ${message}`, DOCS_LINKS.angularTypedElements);
}

function rootElement(helper: string, source: Element | NativeElementHolder | null): Element {
  // DebugElement.query() is typed non-null but returns null on a miss, so the type check cannot catch it.
  if (source === null) {
    throw new TypeError(
      fail(
        `${helper}: received null instead of a ComponentFixture, a DebugElement or an Element — a debugElement.query() that matched nothing?\n` +
          'Check the predicate against the rendered template, or use queryElement(fixture, selector), which names the selector on a miss.',
      ),
    );
  }

  const element = source instanceof Element ? source : source.nativeElement;

  if (!(element instanceof Element)) {
    throw new TypeError(
      fail(
        `${helper}: expected a ComponentFixture, a DebugElement or an Element, received a nativeElement of ${element === null ? 'null' : typeof element}.`,
      ),
    );
  }

  return element;
}

function checkType<E extends Element>(element: Element, type: ElementConstructor<E>, what: string, helper: string): E {
  if (!(element instanceof type)) {
    throw new TypeError(fail(`${helper}: ${what} ${describeElement(element)}, not ${type.name}.`));
  }

  return element;
}

/**
 * The fixture's host element, typed.
 *
 * ```ts
 * const host = hostElement(fixture);                  // HTMLElement
 * const chart = hostElement(fixture.debugElement.children[0], SVGSVGElement); // a nested <svg> DebugElement
 * ```
 *
 * @param source A `ComponentFixture` or a `DebugElement`.
 * @param type The element type to check against and return; `HTMLElement` when omitted.
 * @throws TypeError when `source` is null, `nativeElement` is not an element, or it is not an instance of `type`.
 */
export function hostElement(source: NativeElementHolder): HTMLElement;
export function hostElement<E extends Element>(source: NativeElementHolder, type: ElementConstructor<E>): E;
export function hostElement(source: NativeElementHolder, type: ElementConstructor<Element> = HTMLElement): Element {
  return checkType(rootElement('hostElement', source), type, 'the host is', 'hostElement');
}

/**
 * The first element under the fixture that matches `selector`, typed — or a failure that names the
 * selector.
 *
 * ```ts
 * queryElement(fixture, '.close').click();                                 // HTMLElement
 * expect(queryElement(fixture, 'input[name=q]', HTMLInputElement).value).toBe('');
 * ```
 *
 * `querySelector` answers a miss with `null`, and the spec then fails a line later on
 * `Cannot read properties of null`. This throws at the query instead.
 *
 * @param source A `ComponentFixture`, a `DebugElement`, or an element found earlier.
 * @param selector A CSS selector, matched against the descendants of the host.
 * @param type The element type to check against and return; `HTMLElement` when omitted.
 * @throws Error when nothing matches; TypeError when the match is not an instance of `type`.
 */
export function queryElement(source: Element | NativeElementHolder, selector: string): HTMLElement;
export function queryElement<E extends Element>(source: Element | NativeElementHolder, selector: string, type: ElementConstructor<E>): E;
export function queryElement(
  source: Element | NativeElementHolder,
  selector: string,
  type: ElementConstructor<Element> = HTMLElement,
): Element {
  const root = rootElement('queryElement', source);
  const match = root.querySelector(selector);

  if (match === null) {
    throw new Error(
      fail(
        `queryElement: no element matches '${selector}' inside ${describeElement(root)}.\n` +
          'Render first (`fixture.detectChanges()` or `await stable(fixture)`), then check the selector against the template.',
      ),
    );
  }

  return checkType(match, type, `'${selector}' matched`, 'queryElement');
}
