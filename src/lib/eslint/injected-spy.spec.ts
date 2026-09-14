/**
 * `prefer-inject-spy` from the side it used to get wrong: the injected instance a spec keeps real.
 *
 * The three shapes below are transcribed from a production Angular suite where the rule reported at
 * `error` and every report was correct about the syntax and wrong about the code. Each one injects a
 * framework object it needs whole and spies one method of it — which is not the defect the rule was
 * written for (an auto-spy silently downgraded to a plain `vi.fn()`), because there is no auto-spy
 * anywhere near these lines and, for `DestroyRef`, there cannot be one.
 */
import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';

const RULE = 'prefer-inject-spy';

const linter = new Linter({ configType: 'flat' });

/** Lint one snippet with only this rule enabled, configured when options are given. */
function verify(code: string, options?: object): LintMessage[] {
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'vitest-auto-spy': plugin },
        rules: { [`vitest-auto-spy/${RULE}`]: options ? ['error', options] : 'error' },
      },
    ],
    'component.spec.ts',
  );
}

/** How many reports a snippet draws — the only number most of these cases are about. */
function count(code: string, options?: object): number {
  return verify(code, options).length;
}

/** The first message, for the case about what it has to say. */
function message(code: string): string {
  return verify(code)[0]?.message ?? '';
}

/** The same spy written the two ways the rule recognises: inline, and parked in a `const` first. */
function bothShapes(token: string, method: string): string[] {
  return [
    `vi.spyOn(TestBed.inject(${token}), '${method}');`,
    `const dependency = TestBed.inject(${token});\nvi.spyOn(dependency, '${method}');`,
  ];
}

describe('prefer-inject-spy tokens kept real', () => {
  it('says nothing about the tokens whose instance cannot be replaced by a double', () => {
    const kept = [
      // `ApplicationRef.injector` supplies the renderer a hand-built `createComponent()` needs;
      // `attachView` / `detachView` are spied so nothing is really attached.
      ['ApplicationRef', 'attachView'],
      // A provider for this one is accepted and ignored — see the test below.
      ['DestroyRef', 'onDestroy'],
      // Spied, `get()` answers a spy for every token resolved after it.
      ['Injector', 'get'],
      ['EnvironmentInjector', 'get'],
      // Real under `provideHttpClientTesting()`, with `HttpTestingController` flushing the request
      // the spy only reads the options of.
      ['HttpClient', 'get'],
    ];

    kept.forEach(([token = '', method = '']) => {
      bothShapes(token, method).forEach((code) => {
        expect(count(code)).toBe(0);
      });
    });
  });

  it('still reports an ordinary dependency, in both shapes', () => {
    bothShapes('BillingPlansService', 'getPlans').forEach((code) => {
      expect(count(code)).toBe(1);
    });
  });

  it('decides on the token, not on the method name', () => {
    // A service that happens to expose a method named after one of the kept tokens is a service.
    expect(count("vi.spyOn(TestBed.inject(Cart), 'applicationRef');")).toBe(1);
    // And a kept token stays kept whatever is spied on it.
    expect(count("vi.spyOn(TestBed.inject(ApplicationRef), 'tick');")).toBe(0);
  });

  it('adds the project tokens from `ignoreTokens` without dropping the built-in ones', () => {
    const code = "vi.spyOn(TestBed.inject(MapRendererService), 'draw');";

    expect(count(code)).toBe(1);
    expect(count(code, { ignoreTokens: ['MapRendererService'] })).toBe(0);
    // The built-ins are not a default value the option replaces: an empty list, or one naming
    // something else, leaves them exactly where they were.
    expect(count("vi.spyOn(TestBed.inject(DestroyRef), 'onDestroy');", { ignoreTokens: [] })).toBe(0);
    expect(count("vi.spyOn(TestBed.inject(DestroyRef), 'onDestroy');", { ignoreTokens: ['MapRendererService'] })).toBe(0);
    // And an injection token is a token like any other — the comparison is on the text.
    expect(count("vi.spyOn(TestBed.inject(WINDOW_REF), 'scrollTo');", { ignoreTokens: ['WINDOW_REF'] })).toBe(0);
  });

  it('rejects an options object the rule does not understand', () => {
    expect(() => count('vi.spyOn(x, "y");', { ignoreTokens: 'DestroyRef' })).toThrow();
    expect(() => count('vi.spyOn(x, "y");', { ignoreClasses: ['DestroyRef'] })).toThrow();
  });

  it('reports a kept token spelled under another name, and says what to do about it', () => {
    // Source text is all a single-file rule has to compare, so an alias misses the list. The report
    // is then the honest one: this rule cannot tell `NgDestroyRef` from a service of that name.
    const aliased = "vi.spyOn(TestBed.inject(NgDestroyRef), 'onDestroy');";

    expect(count(aliased)).toBe(1);
    expect(count(aliased, { ignoreTokens: ['NgDestroyRef'] })).toBe(0);
  });

  it('names the case where its own advice cannot work', () => {
    const reported = message("vi.spyOn(TestBed.inject(BillingPlansService), 'getPlans');");

    expect(reported).toContain('ignoreTokens');
    // `DestroyRef` is not a matter of taste: `{ provide: DestroyRef, useValue }` is accepted by the
    // testing module and never consulted, and a message that only said "provide it instead" would
    // be sending the reader after a provider that does nothing.
    expect(reported).toContain('DestroyRef');
    expect(reported).toContain('__NG_ENV_ID__');
  });

  it('keeps the suggestion on everything it still reports', () => {
    const [report] = verify("vi.spyOn(TestBed.inject(BillingPlansService), 'getPlans');");

    expect(report?.suggestions?.map((suggestion) => suggestion.desc)).toEqual([
      'Read the spy from DI instead: injectSpy(BillingPlansService).getPlans',
    ]);
  });
});
