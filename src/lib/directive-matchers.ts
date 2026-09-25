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
import { type Type, isStandalone } from '@angular/core';
import { By } from '@angular/platform-browser';
import { expect } from 'vitest';

import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';
import { count } from './message-text';

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

/** The `DebugElement` surface this matcher reads. */
interface DebugElementLike {
  queryAll(predicate: unknown): DebugElementLike[];
  /** Always present on a `DebugElement`; it is how "which directives are on this element" is asked. */
  providerTokens: unknown[];
}

/** What a matcher hands back to the runner. */
interface MatcherResult {
  pass: boolean;
  message: () => string;
}

function rootOf(received: unknown): DebugElementLike | undefined {
  if (typeof received !== 'object' || received === null) {
    return undefined;
  }

  const fixtureRoot: unknown = Reflect.get(received, 'debugElement');
  const candidate = fixtureRoot ?? received;

  return typeof candidate === 'object' && candidate !== null && typeof Reflect.get(candidate, 'queryAll') === 'function'
    ? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowed by the `queryAll` probe above; the matcher accepts a fixture or a DebugElement and reads nothing else.
      (candidate as DebugElementLike)
    : undefined;
}

function diagnose(directive: Type<unknown>, selector: string | undefined, root: DebugElementLike): string {
  const matching = selector === undefined ? [] : root.queryAll(By.css(selector));
  const where = selector === undefined ? '' : ` on '${selector}'`;
  const prefix = `[vitest-auto-spy] expected ${directive.name} to be applied${where}`;

  if (selector !== undefined && matching.length === 0) {
    return withDocs(
      `${prefix}, but no element matches that selector.\n` +
        'Run fixture.detectChanges() before asserting, and check the selector against the template.',
      DOCS_LINKS.angularDirectiveApplied,
    );
  }

  const cause = isStandalone(directive)
    ? `${directive.name} is standalone, so only the host component's own imports put it in scope`
    : `${directive.name} is declared by an NgModule, and a test bundle drops that module's scope, so importing it contributes nothing`;

  return withDocs(
    `${prefix}, but it is not on any element of this fixture — ${cause}.\n` +
      `Build the host with createDirectiveHost({ template, scope: [${isStandalone(directive) ? directive.name : 'ItsModule'}] }).`,
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
        `[vitest-auto-spy] toHaveDirectiveApplied: expected a ComponentFixture or a DebugElement, received ${describeReceived(received)}.\n` +
          'Pass the fixture itself, or fixture.debugElement — not fixture.nativeElement.',
        DOCS_LINKS.angularDirectiveApplied,
      ),
    );
  }

  const withDirective = root.queryAll(By.directive(directive));
  const applied =
    selector === undefined
      ? withDirective.length > 0
      : root.queryAll(By.css(selector)).some((element) => element.providerTokens.includes(directive));

  return {
    pass: applied,
    message: (): string =>
      applied
        ? `[vitest-auto-spy] expected ${directive.name} not to be applied, but it is on ${count(withDirective.length, 'element')}.`
        : diagnose(directive, selector, root),
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
