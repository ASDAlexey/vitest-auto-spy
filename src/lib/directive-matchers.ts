/**
 * `toHaveDirectiveApplied` — the one fact a directive spec is about, and the one Angular reports
 * three different wrong ways.
 *
 * When a directive is not in the host's scope, what surfaces is: `NG0303: Can't bind to 'appTruncate'
 * since it isn't a known property of 'div'` (which sends the reader to the `@NgModule` where the
 * directive *is* declared, correctly); `NG0304: 'x' is not a known element` (an absent **directive**
 * reported as an absent **component**); or — for a directive used as a bare attribute, with no
 * binding — nothing at all, and a green test asserting on a directive that never ran.
 *
 * The matcher asserts the fact directly, and its failure names the two things that actually cause
 * it in a bundled test build.
 */
import { DebugElement, type DebugNode, type Predicate, type Type, isStandalone, reflectComponentType } from '@angular/core';
import { By } from '@angular/platform-browser';
import { expect } from 'vitest';

import { DIRECTIVE_HOST } from './directive-host';
import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';
import { count, sourceClassName } from './message-text';

// Chai's `Assertion`, not Vitest's `Matchers`: `Matchers` is `<T>` on Vitest 4 and `<R, T>` on
// Vitest 5, and declaration merging demands an exact type-parameter match — this one merges on both.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Chai publishes `Assertion` inside a namespace; merging into it is the only way in.
  namespace Chai {
    interface Assertion {
      /** Assert that `directive` is applied somewhere in this fixture (optionally, on `selector`). */
      toHaveDirectiveApplied(directive: Type<unknown>, selector?: string): void;
    }
  }
}

/** What a matcher hands back to the runner. */
interface MatcherResult {
  pass: boolean;
  message: () => string;
}

function rootOf(received: unknown): DebugElement | undefined {
  if (typeof received !== 'object' || received === null) {
    return undefined;
  }

  const fixtureRoot: unknown = Reflect.get(received, 'debugElement');
  const candidate = fixtureRoot ?? received;

  return typeof candidate === 'object' && candidate !== null && typeof Reflect.get(candidate, 'queryAll') === 'function'
    ? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowed by the `queryAll` probe above; the matcher accepts a fixture or a DebugElement and reads nothing else.
      (candidate as DebugElement)
    : undefined;
}

/**
 * `queryAll` plus the root itself: a `TestBed.createDirective` fixture is rooted at the element
 * that carries the directive, which `queryAll` never returns.
 */
function matching(root: DebugElement, predicate: Predicate<DebugElement>): DebugElement[] {
  return predicate(root) ? [root, ...root.queryAll(predicate)] : root.queryAll(predicate);
}

/** `queryAllNodes`, not `queryAll`: a structural directive sits on its template's comment anchor, which is no element. */
function matchingNodes(root: DebugElement, predicate: Predicate<DebugNode>): DebugNode[] {
  return predicate(root) ? [root, ...root.queryAllNodes(predicate)] : root.queryAllNodes(predicate);
}

function isAnchor(node: DebugNode): boolean {
  return !(node instanceof DebugElement);
}

function located(nodes: DebugNode[]): string {
  const anchors = nodes.filter(isAnchor).length;
  const elements = nodes.length - anchors;

  return [elements > 0 ? count(elements, 'element') : '', anchors > 0 ? count(anchors, 'template anchor') : '']
    .filter((part) => part !== '')
    .join(' and ');
}

function isClass(value: unknown): value is Type<unknown> {
  return typeof value === 'function';
}

/** Angular does not export the host `TestBed.createDirective` builds; its selector is the only handle. */
const TESTBED_DIRECTIVE_HOST = 'ng-directive-test-component';

/** The component a fixture is rooted at, unless `createDirectiveHost` or `TestBed.createDirective` built it for the spec. */
function componentUnderTest(root: DebugElement): string | undefined {
  const type: unknown = Reflect.get(Object(root.componentInstance), 'constructor');

  if (!isClass(type) || !root.providerTokens.includes(type) || Reflect.get(type, DIRECTIVE_HOST) === true) {
    return undefined;
  }

  const mirror = reflectComponentType(type);

  return mirror === null || mirror.selector.includes(TESTBED_DIRECTIVE_HOST) ? undefined : sourceClassName(type.name);
}

/** `ɵcmp.directiveDefs`: the host's compiled scope, NgModules already flattened, as the array or a factory for it. */
function inHostScope(root: DebugElement, directive: Type<unknown>): boolean {
  const host: unknown = Reflect.get(Object(root.componentInstance), 'constructor');
  const defs: unknown = Reflect.get(Object(Reflect.get(Object(host), 'ɵcmp')), 'directiveDefs');
  const list: unknown = typeof defs === 'function' ? Reflect.apply(defs, undefined, []) : defs;

  return Array.isArray(list) && list.some((def) => Reflect.get(Object(def), 'type') === directive);
}

const SELECTOR_NOT = 1;
const SELECTOR_CLASS = 8;

/** Angular's `CssSelectorList` back as CSS, for the plain attribute, element and class forms; `undefined` for a `:not()`. */
function selectorText(directive: Type<unknown>): string | undefined {
  const selectors: unknown = Reflect.get(Object(Reflect.get(directive, 'ɵdir') ?? Reflect.get(directive, 'ɵcmp')), 'selectors');

  if (!Array.isArray(selectors) || selectors.length === 0) {
    return undefined;
  }

  const parts: string[] = [];

  for (const selector of selectors) {
    if (!Array.isArray(selector)) {
      return undefined;
    }

    let text = String(selector[0]);
    let classes = false;

    for (let index = 1; index < selector.length; index++) {
      const entry: unknown = selector[index];

      if (typeof entry === 'number') {
        if ((entry & SELECTOR_NOT) !== 0) {
          return undefined;
        }

        classes = (entry & SELECTOR_CLASS) !== 0;
      } else if (classes) {
        text += `.${String(entry)}`;
      } else {
        const value = String(selector[++index]);

        text += value === '' ? `[${String(entry)}]` : `[${String(entry)}="${value}"]`;
      }
    }

    parts.push(text);
  }

  return parts.join(', ');
}

/** The failure when scope is not the cause: the directive is elsewhere, or its own selector matches nothing. */
function selectorMismatch(
  directive: Type<unknown>,
  selector: string | undefined,
  root: DebugElement,
  withDirective: DebugNode[],
): string | undefined {
  const name = sourceClassName(directive.name);

  if (selector !== undefined && withDirective.length > 0) {
    return (
      `it is on ${located(withDirective)} that selector does not match.\n` +
      `Check the selector against the template, or drop it: expect(fixture).toHaveDirectiveApplied(${name}).`
    );
  }

  if (!inHostScope(root, directive)) {
    return undefined;
  }

  const own = selectorText(directive);

  return (
    `it is not on any element of this fixture, though it is in the host's scope — so its selector` +
    `${own === undefined ? '' : ` '${own}'`} matches nothing the template renders.\n` +
    'Check that selector against the template, and run fixture.detectChanges() before asserting if the element renders later.'
  );
}

function diagnose(directive: Type<unknown>, selector: string | undefined, root: DebugElement, withDirective: DebugNode[]): string {
  const name = sourceClassName(directive.name);
  const elements = selector === undefined ? [] : matching(root, By.css(selector));
  const where = selector === undefined ? '' : ` on '${selector}'`;
  const prefix = `[vitest-auto-spy] expected ${name} to be applied${where}`;

  if (selector !== undefined && elements.length === 0) {
    return withDocs(
      `${prefix}, but no element matches that selector.\n` +
        'Run fixture.detectChanges() before asserting, and check the selector against the template.',
      DOCS_LINKS.angularDirectiveApplied,
    );
  }

  if (selector !== undefined && withDirective.some(isAnchor)) {
    return withDocs(
      `${prefix}, but it is on a template anchor, not on an element — a structural directive sits on the comment Angular leaves in place of its template.\n` +
        `Assert it without a selector: expect(fixture).toHaveDirectiveApplied(${name}).`,
      DOCS_LINKS.angularDirectiveApplied,
    );
  }

  const mismatch = selectorMismatch(directive, selector, root, withDirective);

  if (mismatch !== undefined) {
    return withDocs(`${prefix}, but ${mismatch}`, DOCS_LINKS.angularDirectiveApplied);
  }

  const component = componentUnderTest(root);

  if (component !== undefined) {
    const scope = isStandalone(directive)
      ? `list ${name} in ${component}'s hostDirectives if the component should carry it, or in its imports if its template uses it`
      : `add the NgModule that declares ${name} to ${component}'s imports if its template uses it`;

    return withDocs(
      `${prefix}, but it is not on ${component}'s host element or in its template.\n` + `To apply it, ${scope}.`,
      DOCS_LINKS.angularDirectiveApplied,
    );
  }

  const cause = isStandalone(directive)
    ? `${name} is standalone, so only the host component's own imports put it in scope`
    : `${name} is declared by an NgModule, and a test bundle drops that module's scope, so importing it contributes nothing`;

  return withDocs(
    `${prefix}, but it is not on any element of this fixture — ${cause}.\n` +
      `Build the host with createDirectiveHost({ template, scope: [${isStandalone(directive) ? name : 'ItsModule'}] }).`,
    DOCS_LINKS.angularDirectiveApplied,
  );
}

function describeReceived(received: unknown): string {
  if (received === null || received === undefined) {
    return String(received);
  }

  const name: unknown = Reflect.get(Object(Reflect.get(Object(received), 'constructor')), 'name');

  return typeof received === 'object' && typeof name === 'string' && name !== 'Object' ? `a ${name}` : typeof received;
}

function directiveResult(received: unknown, directive: Type<unknown>, selector?: string): MatcherResult {
  const root = rootOf(received);

  // Thrown rather than answered with `{ pass: false }`: a `nativeElement` or an `undefined` handed
  // over by mistake is not a failed assertion, and under `.not` a returned `false` passed.
  if (!root) {
    throw new Error(
      withDocs(
        `[vitest-auto-spy] toHaveDirectiveApplied: expected a ComponentFixture, a DirectiveFixture or a DebugElement, received ${describeReceived(received)}.\n` +
          'Pass the fixture itself, or fixture.debugElement — not fixture.nativeElement.',
        DOCS_LINKS.angularDirectiveApplied,
      ),
    );
  }

  const withDirective = matchingNodes(root, By.directive(directive));
  const applied =
    selector === undefined
      ? withDirective.length > 0
      : matching(root, By.css(selector)).some((element) => element.providerTokens.includes(directive));

  return {
    pass: applied,
    message: (): string =>
      applied
        ? `[vitest-auto-spy] expected ${sourceClassName(directive.name)} not to be applied, but it is on ${located(withDirective)}.`
        : diagnose(directive, selector, root, withDirective),
  };
}

/**
 * Register {@link Matchers.toHaveDirectiveApplied}. Call once, from your setup file.
 *
 * ```ts
 * registerDirectiveMatchers();
 *
 * expect(fixture).toHaveDirectiveApplied(TruncateDirective, 'div');
 * ```
 */
export function registerDirectiveMatchers(): void {
  expect.extend({
    toHaveDirectiveApplied(received: unknown, directive: Type<unknown>, selector?: string): MatcherResult {
      return directiveResult(received, directive, selector);
    },
  });
}
