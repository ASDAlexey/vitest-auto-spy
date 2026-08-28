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

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- declaration merging requires the type parameter list (defaults included) to match Vitest's own `interface Matchers<T = any>` exactly.
  interface Matchers<T = any> {
    /** Assert that `directive` is applied somewhere in this fixture (optionally, on `selector`). */
    toHaveDirectiveApplied(directive: Type<unknown>, selector?: string): T;
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

  if (selector !== undefined && matching.length === 0) {
    return (
      `expected ${directive.name} to be applied${where}, but no element matches that selector.\n` +
      'Render the fixture (`fixture.detectChanges()`) before asserting, and check the selector against the template.'
    );
  }

  return (
    `expected ${directive.name} to be applied${where}, but it is not on any element of this fixture.\n` +
    `${directive.name} is ${isStandalone(directive) ? 'standalone, so it belongs in the host component’s own `imports`' : 'declared by an NgModule — and a test bundle does not emit `ɵɵsetNgModuleScope`, so that module contributes nothing through `TestBed.configureTestingModule({ imports: [Module] })`'}.\n` +
    'Build the host with `createDirectiveHost({ template, scope: [Module] })`: only a **standalone** host has its ' +
    '`imports` resolved by the compiler, which is what puts the directive in scope. `schemas: [NO_ERRORS_SCHEMA]` ' +
    'cannot help here — schemas apply to a testing module’s `declarations`, never to a standalone component.'
  );
}

function directiveResult(received: unknown, directive: Type<unknown>, selector?: string): MatcherResult {
  const root = rootOf(received);

  if (!root) {
    return {
      pass: false,
      message: (): string => `expected a ComponentFixture or a DebugElement, received ${typeof received}.`,
    };
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
        ? `expected ${directive.name} not to be applied, but it is on ${withDirective.length} element(s).`
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
