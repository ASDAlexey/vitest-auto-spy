/**
 * `prefer-inject-spy` from the side it used to get wrong: the injected instance a spec keeps real.
 *
 * The three shapes below are transcribed from a production Angular suite where the rule reported at
 * `error` and every report was correct about the syntax and wrong about the code. Each one injects a
 * framework object it needs whole and spies one method of it — which is not the defect the rule was
 * written for (an auto-spy silently downgraded to a plain `vi.fn()`), because there is no auto-spy
 * anywhere near these lines and, for `DestroyRef`, there cannot be one.
 */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'prefer-inject-spy';

/** Lint one snippet with only this rule enabled, configured when options are given. */
function verify(code: string, options?: object): LintMessage[] {
  return runRule(RULE, code, { options });
}

/** The rule ids reported for a snippet. */
function lint(code: string): string[] {
  return verify(code).map((message) => message.ruleId ?? 'parse-error');
}

/** What the editor would offer for the first report. */
function suggestionsFor(code: string): string[] {
  return (verify(code)[0]?.suggestions ?? []).map((suggestion) => suggestion.desc);
}

/** The source as it would read after accepting the first report's first suggestion. */
function applySuggestion(code: string): string {
  const suggestion = verify(code)[0]?.suggestions?.[0];

  if (!suggestion) {
    return code;
  }

  const [start, end] = suggestion.fix.range;

  return `${code.slice(0, start)}${suggestion.fix.text}${code.slice(end)}`;
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

    expect(reported).toMatch(
      /^`vi\.spyOn\(TestBed\.inject\(BillingPlansService\), 'getPlans'\)` replaces one method of the `BillingPlansService` instance/,
    );
    expect(reported).toContain('provideAutoSpy(BillingPlansService)');
    expect(reported).toContain('list `BillingPlansService` in `{ ignoreTokens }`');
  });

  it('keeps the suggestion on everything it still reports', () => {
    const [report] = verify("vi.spyOn(TestBed.inject(BillingPlansService), 'getPlans');");

    expect(report?.suggestions?.map((suggestion) => suggestion.desc)).toEqual([
      'Read the spy from DI instead: injectSpy(BillingPlansService).getPlans',
    ]);
  });
});

describe('prefer-inject-spy', () => {
  it('resolves the variable through the scope it is used in, not only the one it is declared in', () => {
    expect(lint("const cart = TestBed.inject(Cart);\nit('x', () => { vi.spyOn(cart, 'total'); });")).toHaveLength(1);
  });

  it('leaves an ordinary spyOn alone', () => {
    expect(lint("vi.spyOn(window, 'scrollTo');")).toEqual([]);
    expect(lint('vi.spyOn();')).toEqual([]);
    expect(lint("vi.spyOn(this.cart, 'total');")).toEqual([]);
  });

  it('leaves a name that is not knowably the injected instance alone', () => {
    // Bound by an import, never by a declarator.
    expect(lint("import { cart } from './fixtures';\nvi.spyOn(cart, 'total');")).toEqual([]);
    // Declared without an initialiser, so what it holds was decided somewhere else.
    expect(lint("let cart;\nvi.spyOn(cart, 'total');")).toEqual([]);
    // Initialised from something else entirely.
    expect(lint("const cart = createSpyFromClass(Cart);\nvi.spyOn(cart, 'total');")).toEqual([]);
    // Injected once and then replaced — by the spyOn it holds whatever the assignment put there.
    expect(lint("let cart = TestBed.inject(Cart);\ncart = other;\nvi.spyOn(cart, 'total');")).toEqual([]);
  });

  it('leaves every call that merely looks like TestBed.inject alone', () => {
    const spyOnInit = (init: string): string[] => lint('const cart = ' + init + ";\nvi.spyOn(cart, 'total');");

    expect(spyOnInit('injected')).toEqual([]);
    expect(spyOnInit('inject(Cart)')).toEqual([]);
    expect(spyOnInit('bed.testBed.inject(Cart)')).toEqual([]);
    expect(spyOnInit('Injector.inject(Cart)')).toEqual([]);
    expect(spyOnInit('TestBed[key](Cart)')).toEqual([]);
    expect(spyOnInit('TestBed.get(Cart)')).toEqual([]);
  });

  it('suggests the replacement, and imports injectSpy with it', () => {
    expect(suggestionsFor("vi.spyOn(TestBed.inject(Cart), 'total');")).toEqual(['Read the spy from DI instead: injectSpy(Cart).total']);
    expect(applySuggestion("vi.spyOn(TestBed.inject(Cart), 'total');")).toBe(
      "import { injectSpy } from 'vitest-auto-spy/angular';\ninjectSpy(Cart).total;",
    );
  });

  it('suggests it for the two-step form too, naming the token the variable came from', () => {
    const code = "import { injectSpy } from 'vitest-auto-spy/angular';\nconst cart = TestBed.inject(Cart);\nvi.spyOn(cart, 'total');";

    // Already imported, so the edit is the call and nothing else.
    expect(applySuggestion(code)).toContain('injectSpy(Cart).total');
    expect(applySuggestion(code)).not.toContain('vi.spyOn');
  });

  it('reports without a suggestion when the rewrite would have to be invented', () => {
    // Nothing to name the token with.
    expect(suggestionsFor("vi.spyOn(TestBed.inject(), 'total');")).toEqual([]);
    // `injectSpy` takes the token alone; dropping the flags would change which instance comes back.
    expect(suggestionsFor("vi.spyOn(TestBed.inject(Cart, null), 'total');")).toEqual([]);
    // No method name to put after the dot.
    expect(suggestionsFor('vi.spyOn(TestBed.inject(Cart));')).toEqual([]);
    expect(suggestionsFor('vi.spyOn(TestBed.inject(Cart), method);')).toEqual([]);
    expect(suggestionsFor('vi.spyOn(TestBed.inject(Cart), 0);')).toEqual([]);
    expect(suggestionsFor("vi.spyOn(TestBed.inject(Cart), 'add-item');")).toEqual([]);
    // The name is already something else here.
    expect(suggestionsFor("const injectSpy = 1;\nvi.spyOn(TestBed.inject(Cart), 'total');")).toEqual([]);
  });
});
