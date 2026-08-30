/**
 * The rules are linted against real source, through the real ESLint engine and the TypeScript
 * parser — a rule tested against hand-built AST nodes proves nothing about the selectors it ships.
 *
 * Each rule is checked on both sides: the shape it must flag, and the shapes next to it that it
 * must leave alone (a config object that merely uses `useValue`, a single `vi.fn()`, an assertion
 * outside a `subscribe` callback).
 */
import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';
import { rules } from './rules';

const linter = new Linter({ configType: 'flat' });

/** Lint one snippet with a single rule of the plugin enabled. */
function verify(code: string, ruleName: string): LintMessage[] {
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'vitest-auto-spy': plugin },
        rules: { [`vitest-auto-spy/${ruleName}`]: 'error' },
      },
    ],
    'component.spec.ts',
  );
}

/** Lint one snippet with a rule configured — the options every ESLint config passes after the severity. */
function lintWith(code: string, ruleName: string, options: object): string[] {
  return linter
    .verify(
      code,
      [
        {
          files: ['**/*.ts'],
          languageOptions: { parser: tsParser },
          plugins: { 'vitest-auto-spy': plugin },
          rules: { [`vitest-auto-spy/${ruleName}`]: ['error', options] },
        },
      ],
      'component.spec.ts',
    )
    .map((message) => message.ruleId ?? 'parse-error');
}

/** The rule ids reported for a snippet. */
function lint(code: string, ruleName: string): string[] {
  return verify(code, ruleName).map((message) => message.ruleId ?? 'parse-error');
}

/** Run the rule the way `eslint --fix` does, repeated passes and all. */
function autofix(code: string, ruleName: string): string {
  return linter.verifyAndFix(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'vitest-auto-spy': plugin },
        rules: { [`vitest-auto-spy/${ruleName}`]: 'error' },
      },
    ],
    'component.spec.ts',
  ).output;
}

/** What the editor would offer for the first report. */
function suggestionsFor(code: string, ruleName: string): string[] {
  return (verify(code, ruleName)[0]?.suggestions ?? []).map((suggestion) => suggestion.desc);
}

/** The source as it would read after accepting the first report's first suggestion. */
function applySuggestion(code: string, ruleName: string): string {
  const suggestion = verify(code, ruleName)[0]?.suggestions?.[0];

  if (!suggestion) {
    return code;
  }

  const [start, end] = suggestion.fix.range;

  return `${code.slice(0, start)}${suggestion.fix.text}${code.slice(end)}`;
}

/** The full message text of the first report, for the rules that must point at the README. */
function firstMessage(code: string, ruleName: string): string {
  return verify(code, ruleName)[0]?.message ?? '';
}

describe('prefer-provide-auto-spy', () => {
  it('flags a provider whose useValue hand-rolls a mock', () => {
    expect(lint('const p = { provide: Cart, useValue: { total: vi.fn() } };', 'prefer-provide-auto-spy')).toEqual([
      'vitest-auto-spy/prefer-provide-auto-spy',
    ]);
  });

  it('flags it through a quoted key too', () => {
    expect(lint("const p = { 'provide': Cart, 'useValue': { total: jest.fn() } };", 'prefer-provide-auto-spy')).toHaveLength(1);
  });

  it('leaves a plain configuration value alone', () => {
    expect(lint("const p = { provide: CONFIG, useValue: { apiUrl: '/api' } };", 'prefer-provide-auto-spy')).toEqual([]);
  });

  it('leaves a spy-backed provider and a computed key alone', () => {
    expect(lint('const p = { provide: Cart, useValue: createSpyFromClass(Cart) };', 'prefer-provide-auto-spy')).toEqual([]);
    // A factory with a seed is the fix this rule recommends; the ` + '`' + `useValue` + '`' + ` is a call, not a literal.
    expect(lint('const p = { provide: Cart, useValue: createAutoMock<Cart>({ total: vi.fn() }) };', 'prefer-provide-auto-spy')).toEqual([]);
    expect(lint("const p = { ['provide']: Cart, useValue: { total: vi.fn() } };", 'prefer-provide-auto-spy')).toEqual([]);
    expect(lint('const p = { useValue: { total: vi.fn() } };', 'prefer-provide-auto-spy')).toEqual([]);
  });

  it('leaves a multi provider alone, because the fix it would ask for does not exist', () => {
    // `provideAutoSpy` builds one double for a token and takes no registration mode, so following
    // this advice would quietly turn an accumulating provider into an overriding one.
    expect(lint('const p = { provide: HOOKS, useValue: { run: vi.fn() }, multi: true };', 'prefer-provide-auto-spy')).toEqual([]);
  });

  it('follows a double declared above and passed by name', () => {
    // Eight doubles in one file of the suite this came from were written this way, and the rule
    // reported none of them.
    expect(lint('const nav = { go: vi.fn() };\nconst p = { provide: Nav, useValue: nav };', 'prefer-provide-auto-spy')).toHaveLength(1);
  });

  it('sees a spy nested below the top level of the useValue', () => {
    expect(
      lint("const p = { provide: PLATFORM, useValue: { type: 'tizen', application: { init: vi.fn() } } };", 'prefer-provide-auto-spy'),
    ).toHaveLength(1);
  });

  it('leaves a name it cannot follow to an object of spies alone', () => {
    expect(lint('const p = { provide: Cart, useValue: buildCart() };', 'prefer-provide-auto-spy')).toEqual([]);
    expect(lint("import { nav } from './fixtures';\nconst p = { provide: Nav, useValue: nav };", 'prefer-provide-auto-spy')).toEqual([]);
    expect(lint('const nav = { go: () => vi.fn() };\nconst p = { provide: Nav, useValue: nav };', 'prefer-provide-auto-spy')).toEqual([]);
  });

  it('names provideAutoSpyForToken when the thing provided is a token, not a class', () => {
    // `provideAutoSpy` reads a class prototype; a token has none, so the old advice did not compile.
    // Six of eight reports in one migration batch were on tokens.
    expect(firstMessage('const p = { provide: PASSCODE_TOKEN, useValue: { check: vi.fn() } };', 'prefer-provide-auto-spy')).toContain(
      'provideAutoSpyForToken(TOKEN)',
    );
    // A declaration the resolver can reach settles it whatever the name looks like.
    expect(
      firstMessage(
        "const Logger = new InjectionToken<Logger>('logger');\nconst p = { provide: Logger, useValue: { debug: vi.fn() } };",
        'prefer-provide-auto-spy',
      ),
    ).toContain('provideAutoSpyForToken(TOKEN)');
  });

  it('names provideAutoSpy for a class, and still mentions the token form', () => {
    const message = firstMessage('const p = { provide: CartService, useValue: { total: vi.fn() } };', 'prefer-provide-auto-spy');

    expect(message).toContain('provideAutoSpy(Class)');
    expect(message).toContain('provideAutoSpyForToken(TOKEN)');
  });

  it('reads a class out of every initialiser that is not a token', () => {
    const classMessage = (setup: string): string =>
      firstMessage(setup + '\nconst p = { provide: Cart, useValue: { total: vi.fn() } };', 'prefer-provide-auto-spy');

    expect(classMessage('')).toContain('provideAutoSpy(Class)');
    expect(classMessage('const Cart = class {};')).toContain('provideAutoSpy(Class)');
    expect(classMessage('const Cart = new CartService();')).toContain('provideAutoSpy(Class)');
    expect(classMessage('const Cart = new ng.InjectionToken();')).toContain('provideAutoSpy(Class)');
    // Not an identifier at all — a token read off a namespace import.
    expect(firstMessage('const p = { provide: tokens.CART, useValue: { total: vi.fn() } };', 'prefer-provide-auto-spy')).toContain(
      'provideAutoSpy(Class)',
    );
  });

  it('reads a hand-rolled double behind a useFactory, through the function', () => {
    // The `useValue` walk stops at function boundaries — a factory returning spies is the shape the
    // rules recommend. For `useFactory` the function *is* the value, so it reads through it.
    expect(lint('const p = { provide: A, useFactory: () => ({ isKeyEnabled: vi.fn() }) };', 'prefer-provide-auto-spy')).toHaveLength(1);
    expect(
      lint(
        'const spy = vi.fn().mockImplementation(() => ({ isKeyEnabled: vi.fn() }));\nconst p = { provide: A, useFactory: spy };',
        'prefer-provide-auto-spy',
      ),
    ).toHaveLength(1);
    expect(lint('const p = { provide: A, useFactory: buildRealThing };', 'prefer-provide-auto-spy')).toEqual([]);
    expect(lint('const p = { provide: A, useFactory: () => new CartService() };', 'prefer-provide-auto-spy')).toEqual([]);
  });

  it('points at the README recipe', () => {
    expect(firstMessage('const p = { provide: Cart, useValue: { total: vi.fn() } };', 'prefer-provide-auto-spy')).toContain(
      'https://github.com/ASDAlexey/vitest-auto-spy#how-to-mock',
    );
  });
});

describe('prefer-create-spy-from-class', () => {
  it('flags an object literal built from several vi.fn()s', () => {
    expect(lint('const cart = { total: vi.fn(), clear: vi.fn() };', 'prefer-create-spy-from-class')).toHaveLength(1);
  });

  it('takes the threshold from the options when a suite wants a stricter reading', () => {
    const single = 'const nav = { go: vi.fn() };';

    expect(lint(single, 'prefer-create-spy-from-class')).toEqual([]);
    expect(lintWith(single, 'prefer-create-spy-from-class', { minRunnerFns: 1 })).toHaveLength(1);
  });

  it('names the threshold, so the asymmetry between two neighbouring lines is readable', () => {
    expect(firstMessage('const p = { a: vi.fn(), b: vi.fn() };', 'prefer-create-spy-from-class')).toContain('two or more');
    expect(firstMessage('const p = { a: vi.fn(), b: vi.fn() };', 'prefer-create-spy-from-class')).toContain('minRunnerFns');
  });

  it('leaves a vi.mock factory alone — its exports are DI tokens, not a service double', () => {
    expect(lint("vi.mock('@acme/ui', () => ({ DialogRef: vi.fn(), ToastService: vi.fn() }));", 'prefer-create-spy-from-class')).toEqual([]);
    expect(lint("vi.doMock('x', () => ({ A: vi.fn(), B: vi.fn() }));", 'prefer-create-spy-from-class')).toEqual([]);
    expect(lint("register('x', () => ({ A: vi.fn(), B: vi.fn() }));", 'prefer-create-spy-from-class')).toHaveLength(1);
  });

  it('counts a configured spy as a spy — the tuned double is the one that drifted furthest', () => {
    // Reported from four migration batches on four files: in one `providers` array the bare-`vi.fn()`
    // double was flagged and the `.mockReturnValue` one on the next line was not.
    expect(
      lint(
        'const p = { getProducts: vi.fn().mockReturnValue(of([])), getProductById: vi.fn().mockReturnValue(of(null)) };',
        'prefer-create-spy-from-class',
      ),
    ).toHaveLength(1);
    expect(lint('const p = { a: vi.fn(), b: vi.fn().mockResolvedValue(1) };', 'prefer-create-spy-from-class')).toHaveLength(1);
    // However long the chain gets.
    expect(
      lint("const p = { a: vi.fn().mockReturnValue(1).mockName('a'), b: jest.fn().mockReturnThis() };", 'prefer-create-spy-from-class'),
    ).toHaveLength(1);
  });

  it('leaves every call that merely resembles a runner mock alone', () => {
    expect(lint('const p = { a: fn(), b: fn() };', 'prefer-create-spy-from-class')).toEqual([]);
    expect(lint('const p = { a: helpers.mocks.fn(), b: helpers.mocks.fn() };', 'prefer-create-spy-from-class')).toEqual([]);
    expect(lint("const p = { a: vi['fn'](), b: vi['fn']() };", 'prefer-create-spy-from-class')).toEqual([]);
    expect(lint('const p = { a: other.fn(), b: other.fn() };', 'prefer-create-spy-from-class')).toEqual([]);
    expect(lint("const p = { a: vi.spyOn(x, 'y'), b: vi.spyOn(x, 'z') };", 'prefer-create-spy-from-class')).toEqual([]);
    expect(lint('const p = { a: cart, b: cart };', 'prefer-create-spy-from-class')).toEqual([]);
  });

  it('leaves the seed of one of this library’s own factories alone — that is the fix, not the problem', () => {
    expect(lint('const xhr = createAutoMock<XhrLike>({ send: vi.fn(), abort: vi.fn() });', 'prefer-create-spy-from-class')).toEqual([]);
    expect(lint('const api = mockDeep<Api>({ api: { load: vi.fn(), save: vi.fn() } });', 'prefer-create-spy-from-class')).toEqual([]);
    expect(
      lint('const p = provideAutoSpy(Cart, { methodsToSpyOn: [], extra: { a: vi.fn(), b: vi.fn() } });', 'prefer-create-spy-from-class'),
    ).toEqual([]);
  });

  it('still flags an object of spies handed to anything else', () => {
    expect(lint('const cart = wrap({ total: vi.fn(), clear: vi.fn() });', 'prefer-create-spy-from-class')).toHaveLength(1);
    expect(lint('const cart = helpers.createAutoMock({ total: vi.fn(), clear: vi.fn() });', 'prefer-create-spy-from-class')).toHaveLength(
      1,
    );
  });

  it('leaves a single stub, a spread and a provider useValue alone', () => {
    expect(lint('const cart = { total: vi.fn() };', 'prefer-create-spy-from-class')).toEqual([]);
    expect(lint('const cart = { ...base, total: vi.fn() };', 'prefer-create-spy-from-class')).toEqual([]);
    expect(lint('const p = { provide: Cart, useValue: { total: vi.fn(), clear: vi.fn() } };', 'prefer-create-spy-from-class')).toEqual([]);
  });
});

describe('prefer-inject-spy', () => {
  it('flags re-spying a TestBed.inject() result', () => {
    expect(lint("vi.spyOn(TestBed.inject(Cart), 'total');", 'prefer-inject-spy')).toHaveLength(1);
  });

  it('flags the same thing said in two steps — the form that used to slip through', () => {
    expect(lint("const cart = TestBed.inject(Cart);\nvi.spyOn(cart, 'total');", 'prefer-inject-spy')).toHaveLength(1);
  });

  it('resolves the variable through the scope it is used in, not only the one it is declared in', () => {
    expect(lint("const cart = TestBed.inject(Cart);\nit('x', () => { vi.spyOn(cart, 'total'); });", 'prefer-inject-spy')).toHaveLength(1);
  });

  it('leaves an ordinary spyOn alone', () => {
    expect(lint("vi.spyOn(window, 'scrollTo');", 'prefer-inject-spy')).toEqual([]);
    expect(lint('vi.spyOn();', 'prefer-inject-spy')).toEqual([]);
    expect(lint("vi.spyOn(this.cart, 'total');", 'prefer-inject-spy')).toEqual([]);
  });

  it('leaves a name that is not knowably the injected instance alone', () => {
    // Bound by an import, never by a declarator.
    expect(lint("import { cart } from './fixtures';\nvi.spyOn(cart, 'total');", 'prefer-inject-spy')).toEqual([]);
    // Declared without an initialiser, so what it holds was decided somewhere else.
    expect(lint("let cart;\nvi.spyOn(cart, 'total');", 'prefer-inject-spy')).toEqual([]);
    // Initialised from something else entirely.
    expect(lint("const cart = createSpyFromClass(Cart);\nvi.spyOn(cart, 'total');", 'prefer-inject-spy')).toEqual([]);
    // Injected once and then replaced — by the spyOn it holds whatever the assignment put there.
    expect(lint("let cart = TestBed.inject(Cart);\ncart = other;\nvi.spyOn(cart, 'total');", 'prefer-inject-spy')).toEqual([]);
  });

  it('leaves every call that merely looks like TestBed.inject alone', () => {
    const spyOnInit = (init: string): string[] => lint('const cart = ' + init + ";\nvi.spyOn(cart, 'total');", 'prefer-inject-spy');

    expect(spyOnInit('injected')).toEqual([]);
    expect(spyOnInit('inject(Cart)')).toEqual([]);
    expect(spyOnInit('bed.testBed.inject(Cart)')).toEqual([]);
    expect(spyOnInit('Injector.inject(Cart)')).toEqual([]);
    expect(spyOnInit('TestBed[key](Cart)')).toEqual([]);
    expect(spyOnInit('TestBed.get(Cart)')).toEqual([]);
  });

  it('suggests the replacement, and imports injectSpy with it', () => {
    expect(suggestionsFor("vi.spyOn(TestBed.inject(Cart), 'total');", 'prefer-inject-spy')).toEqual([
      'Read the spy from DI instead: injectSpy(Cart).total',
    ]);
    expect(applySuggestion("vi.spyOn(TestBed.inject(Cart), 'total');", 'prefer-inject-spy')).toBe(
      "import { injectSpy } from 'vitest-auto-spy/angular';\ninjectSpy(Cart).total;",
    );
  });

  it('suggests it for the two-step form too, naming the token the variable came from', () => {
    const code = "import { injectSpy } from 'vitest-auto-spy/angular';\nconst cart = TestBed.inject(Cart);\nvi.spyOn(cart, 'total');";

    // Already imported, so the edit is the call and nothing else.
    expect(applySuggestion(code, 'prefer-inject-spy')).toContain('injectSpy(Cart).total');
    expect(applySuggestion(code, 'prefer-inject-spy')).not.toContain('vi.spyOn');
  });

  it('reports without a suggestion when the rewrite would have to be invented', () => {
    // Nothing to name the token with.
    expect(suggestionsFor("vi.spyOn(TestBed.inject(), 'total');", 'prefer-inject-spy')).toEqual([]);
    // `injectSpy` takes the token alone; dropping the flags would change which instance comes back.
    expect(suggestionsFor("vi.spyOn(TestBed.inject(Cart, null), 'total');", 'prefer-inject-spy')).toEqual([]);
    // No method name to put after the dot.
    expect(suggestionsFor('vi.spyOn(TestBed.inject(Cart));', 'prefer-inject-spy')).toEqual([]);
    expect(suggestionsFor('vi.spyOn(TestBed.inject(Cart), method);', 'prefer-inject-spy')).toEqual([]);
    expect(suggestionsFor('vi.spyOn(TestBed.inject(Cart), 0);', 'prefer-inject-spy')).toEqual([]);
    expect(suggestionsFor("vi.spyOn(TestBed.inject(Cart), 'add-item');", 'prefer-inject-spy')).toEqual([]);
    // The name is already something else here.
    expect(suggestionsFor("const injectSpy = 1;\nvi.spyOn(TestBed.inject(Cart), 'total');", 'prefer-inject-spy')).toEqual([]);
  });
});

describe('no-object-define-property', () => {
  it('flags both defineProperty and defineProperties', () => {
    expect(lint("Object.defineProperty(service, 'ready', { value: true });", 'no-object-define-property')).toHaveLength(1);
    expect(lint('Object.defineProperties(service, descriptors);', 'no-object-define-property')).toHaveLength(1);
  });

  it('leaves other Object statics alone', () => {
    expect(lint('Object.assign(service, { ready: true });', 'no-object-define-property')).toEqual([]);
  });

  it('suggests mockValueProp for the one descriptor it reproduces exactly', () => {
    expect(suggestionsFor("Object.defineProperty(service, 'ready', { value: true });", 'no-object-define-property')).toEqual([
      "Record the undo: mockValueProp(service, 'ready', true)",
    ]);
    expect(applySuggestion("Object.defineProperty(service, 'ready', { value: true });", 'no-object-define-property')).toBe(
      "import { mockValueProp } from 'vitest-auto-spy';\nmockValueProp(service, 'ready', true);",
    );
  });

  it('uses the import the file already has', () => {
    const code = "import { mockValueProp } from 'vitest-auto-spy';\nObject.defineProperty(service, 'ready', { value: true });";

    expect(applySuggestion(code, 'no-object-define-property')).toBe(
      "import { mockValueProp } from 'vitest-auto-spy';\nmockValueProp(service, 'ready', true);",
    );
  });

  it('suggests the getter helper for a getter descriptor, configurable and all', () => {
    // The shape a spec reaches for when it needs a DOM measurement: `offsetHeight` is a getter.
    expect(
      suggestionsFor("Object.defineProperty(host, 'offsetHeight', { get: () => 1000, configurable: true });", 'no-object-define-property'),
    ).toEqual(["Record the undo: mockReadonlyPropGetter(host, 'offsetHeight', () => 1000)"]);
    expect(
      applySuggestion("Object.defineProperty(host, 'offsetHeight', { get: () => 1000, configurable: true });", 'no-object-define-property'),
    ).toBe("import { mockReadonlyPropGetter } from 'vitest-auto-spy';\nmockReadonlyPropGetter(host, 'offsetHeight', () => 1000);");
  });

  it('reports without a suggestion for every descriptor it would have to reinterpret', () => {
    // An accessor pair is `mockAccessorsProp`, which takes an object rather than a value.
    expect(
      suggestionsFor("Object.defineProperty(service, 'ready', { get: () => true, set: (v) => v });", 'no-object-define-property'),
    ).toEqual([]);
    // `mockValueProp` writes its own `writable` and `configurable`; anything spelled out here would be lost.
    expect(
      suggestionsFor("Object.defineProperty(service, 'ready', { value: true, writable: false });", 'no-object-define-property'),
    ).toEqual([]);
    // A descriptor built somewhere else cannot be read here at all.
    expect(suggestionsFor("Object.defineProperty(service, 'ready', descriptor);", 'no-object-define-property')).toEqual([]);
    expect(suggestionsFor('Object.defineProperty(service);', 'no-object-define-property')).toEqual([]);
    // The name already means something else in this file.
    expect(
      suggestionsFor("const mockValueProp = 1;\nObject.defineProperty(service, 'ready', { value: true });", 'no-object-define-property'),
    ).toEqual([]);
    // `defineProperties` is one statement per entry, which is not an edit of this node.
    expect(suggestionsFor('Object.defineProperties(service, descriptors);', 'no-object-define-property')).toEqual([]);
  });
});

it('names the helper each descriptor asks for, including the ones it will not rewrite', () => {
  const message = firstMessage("Object.defineProperty(service, 'ready', { value: true });", 'no-object-define-property');

  expect(message).toContain('stubConstructor');
  expect(message).toContain('mockReadonlyPropGetter');
  expect(message).toContain('mockAccessorsProp');
  expect(message).toContain('instanceMethodsToSpyOn');
  // Third independent report of the same substitution: a signal replaced by a `vi.fn()` that
  // returns the value reads identically until something puts a `computed()` downstream of it.
  expect(message).toContain('signal(value)');
});

it('declines to suggest mockValueProp for a mock the code calls with new', () => {
  // Spelled with a `function` on purpose: an arrow cannot be constructed, and the resulting
  // "is not a constructor" is swallowed by the service's own try/catch three assertions earlier.
  const constructed = "Object.defineProperty(window, 'AudioContext', { value: vi.fn().mockImplementation(function () { return ctx; }) });";

  expect(suggestionsFor(constructed, 'no-object-define-property')).toEqual([]);
  // An arrow implementation is an ordinary value again.
  expect(
    suggestionsFor("Object.defineProperty(window, 'x', { value: vi.fn().mockImplementation(() => ctx) });", 'no-object-define-property'),
  ).toHaveLength(1);
});

it('says so when the patch is paired with a hand-written restore', () => {
  const manual = [
    "it('reads storage', () => {",
    "  Object.defineProperty(window, 'localStorage', { value: broken });",
    '  expect(read()).toBeUndefined();',
    "  Object.defineProperty(window, 'localStorage', { value: real });",
    '});',
  ].join('\n');

  expect(lint(manual, 'no-object-define-property')).toHaveLength(2);
  expect(firstMessage(manual, 'no-object-define-property')).toContain('the first red one skips it');
  // A patch in one test and a patch in another is not a restore pair.
  const separate = [
    "it('a', () => { Object.defineProperty(window, 'x', { value: 1 }); });",
    "it('b', () => { Object.defineProperty(window, 'x', { value: 2 }); });",
  ].join('\n');

  expect(firstMessage(separate, 'no-object-define-property')).toContain('leaves no way back');
  // Nor are two different properties of the same object.
  const twoKeys = "it('a', () => { Object.defineProperty(window, 'x', { value: 1 }); Object.defineProperty(window, 'y', { value: 2 }); });";

  expect(firstMessage(twoKeys, 'no-object-define-property')).toContain('leaves no way back');
  // A call with nothing to key on still reports.
  expect(lint('Object.defineProperty();', 'no-object-define-property')).toHaveLength(1);
});

describe('no-expect-in-subscribe', () => {
  it('flags an assertion that only runs if the stream emits', () => {
    expect(lint('source$.subscribe((value) => expect(value).toBe(1));', 'no-expect-in-subscribe')).toHaveLength(1);
  });

  it('reports the subscribe once, whatever it asserts inside', () => {
    const code = 'source$.subscribe((value) => { expect(value).toBe(1); expect(value).toBeTruthy(); expect(other).toBe(2); });';

    expect(lint(code, 'no-expect-in-subscribe')).toHaveLength(1);
    expect(firstMessage(code, 'no-expect-in-subscribe')).toContain('all 3 of these');
  });

  it('counts an assertion however it is buried, and keeps two subscribes apart', () => {
    // The walk up to the enclosing `subscribe` passes a member call, a plain call and a computed
    // one on the way; none of them is the callback that matters.
    const code = 'a$.subscribe(() => { assertThat(expect(1).toBe(1)); });\nb$.subscribe(() => { helpers[key](expect(2).toBe(2)); });';

    expect(lint(code, 'no-expect-in-subscribe')).toHaveLength(2);
  });

  it('tells the three repairs apart, because they are three different edits', () => {
    // The subscription is the last thing the test does: invert it.
    expect(firstMessage('source$.subscribe((value) => expect(value).toBe(1));', 'no-expect-in-subscribe')).toContain(
      'await firstValueFrom(source$)',
    );
    // Something after it is what makes the stream emit — the commonest Angular spec there is.
    const triggered = [
      "it('x', async () => {",
      '  source$.subscribe((value) => { expect(value).toBe(1); });',
      '  req.flush(payload);',
      '});',
    ].join('\n');

    expect(firstMessage(triggered, 'no-expect-in-subscribe')).toContain('Hold the promise instead');
    // The failure branch resolves on nothing: it is `rejects`, positionally or by name.
    expect(firstMessage('source$.subscribe({ error: (e) => expect(e).toBe(err) });', 'no-expect-in-subscribe')).toContain('.rejects.');
    expect(firstMessage('source$.subscribe((v) => v, (e) => expect(e).toBe(err));', 'no-expect-in-subscribe')).toContain('.rejects.');
    expect(firstMessage('source$.subscribe({ next: (v) => expect(v).toBe(1) });', 'no-expect-in-subscribe')).toContain(
      'await firstValueFrom(source$)',
    );
  });

  it('handles an assertion that is inside the chain but in no handler at all', () => {
    // Inside the `pipe`, which is the subscribe call's callee rather than one of its arguments.
    expect(firstMessage('source$.pipe(tap((v) => expect(v).toBe(1))).subscribe(spy);', 'no-expect-in-subscribe')).toContain(
      'await firstValueFrom',
    );
  });

  it('handles a subscription that is not a statement of its own', () => {
    // Kept for later unsubscription, so there is no statement list to look past.
    expect(
      firstMessage("it('x', () => { const sub = source$.subscribe((v) => expect(v).toBe(1)); });", 'no-expect-in-subscribe'),
    ).toContain('await firstValueFrom');
    // …and the same with no enclosing statement of any kind above it.
    expect(firstMessage('const sub = source$.subscribe((v) => expect(v).toBe(1));', 'no-expect-in-subscribe')).toContain(
      'await firstValueFrom',
    );
  });

  it('finds assertions parked in a helper the callback calls', () => {
    const viaHelper = [
      'const assertShape = (data) => {',
      '  expect(data.items).toHaveLength(3);',
      "  expect(data.title).toBe('x');",
      '};',
      '',
      'source$.subscribe((data) => assertShape(data));',
    ].join('\n');

    expect(lint(viaHelper, 'no-expect-in-subscribe')).toHaveLength(1);
    expect(firstMessage(viaHelper, 'no-expect-in-subscribe')).toContain('all 2 of these');
    // A function declaration is the same helper spelled differently.
    expect(
      firstMessage('function assertShape(d) { expect(d).toBe(1); }\nsource$.subscribe((d) => assertShape(d));', 'no-expect-in-subscribe'),
    ).toContain('all 1 of these');
  });

  it('counts a helper declared inside the callback once, not twice', () => {
    const inner = 'source$.subscribe((d) => { const check = () => { expect(d).toBe(1); }; check(); });';

    expect(firstMessage(inner, 'no-expect-in-subscribe')).toContain('all 1 of these');
  });

  it('leaves a call that resolves to no local function alone', () => {
    expect(lint('source$.subscribe((d) => notDeclaredHere(d));', 'no-expect-in-subscribe')).toEqual([]);
    expect(lint('const size = 5;\nsource$.subscribe(() => size());', 'no-expect-in-subscribe')).toEqual([]);
    expect(lint('const noop = () => undefined;\nsource$.subscribe(() => noop());', 'no-expect-in-subscribe')).toEqual([]);
  });

  it('leaves an awaited assertion alone', () => {
    expect(lint('expect(await expectEmission(source$)).toBe(1);', 'no-expect-in-subscribe')).toEqual([]);
  });
});

describe('no-expect-in-subscribe — the done-callback rewrite', () => {
  /** The template that accounted for 111 of 133 violations in one migration batch. */
  const wrapped = [
    "it('maps the products', () =>",
    '  new Promise<void>((done) => {',
    '    service.getProducts(id).subscribe((products) => {',
    '      expect(products).toEqual(expected);',
    '      done();',
    '    });',
    '  }));',
  ].join('\n');

  it('suggests awaiting the first emission, and imports firstValueFrom', () => {
    expect(suggestionsFor(wrapped, 'no-expect-in-subscribe')).toEqual([
      'Await the stream instead of resolving a done callback: firstValueFrom()',
    ]);
    expect(applySuggestion(wrapped, 'no-expect-in-subscribe')).toBe(
      [
        "import { firstValueFrom } from 'rxjs';",
        "it('maps the products', async () => {",
        '  const products = await firstValueFrom(service.getProducts(id));',
        '',
        '  expect(products).toEqual(expected);',
        '});',
      ].join('\n'),
    );
  });

  it('keeps the depth the test already sits at, and the shape of what it lifts', () => {
    const nested = [
      "describe('products', () => {",
      "  it('maps them', () =>",
      '    new Promise<void>((done) => {',
      '      service.getProducts().subscribe((products) => {',
      '        expect(products).toEqual([',
      '          { id: 1 },',
      '        ]);',
      '',
      '        expect(spy).toHaveBeenCalled();',
      '        done();',
      '      });',
      '    }));',
      '});',
    ].join('\n');

    expect(applySuggestion(nested, 'no-expect-in-subscribe')).toBe(
      [
        "import { firstValueFrom } from 'rxjs';",
        "describe('products', () => {",
        "  it('maps them', async () => {",
        '    const products = await firstValueFrom(service.getProducts());',
        '',
        '    expect(products).toEqual([',
        '      { id: 1 },',
        '    ]);',
        '',
        '    expect(spy).toHaveBeenCalled();',
        '  });',
        '});',
      ].join('\n'),
    );
  });

  it('awaits without binding a value when the callback takes none', () => {
    const code = [
      "it('completes', () =>",
      '  new Promise<void>((done) => {',
      '    service.reload().subscribe(() => {',
      '      expect(spy).toHaveBeenCalled();',
      '      done();',
      '    });',
      '  }));',
    ].join('\n');

    expect(applySuggestion(code, 'no-expect-in-subscribe')).toContain('  await firstValueFrom(service.reload());');
  });

  it('uses the firstValueFrom the file already imports', () => {
    const code = `import { firstValueFrom } from 'rxjs';\n${wrapped}`;

    expect(
      applySuggestion(code, 'no-expect-in-subscribe')
        .split('\n')
        .filter((line) => line.startsWith('import')).length,
    ).toBe(1);
  });

  it('declines every shape that only looks like the template', () => {
    /** Rebuild the template with one part swapped out. */
    const variant = (executor: string, handler: string, body: string[]): string =>
      ["it('x', () =>", `  new Promise<void>(${executor} {`, `    source$.subscribe(${handler} {`, ...body, '    });', '  }));'].join('\n');

    const assertions = ['      expect(value).toBe(1);', '      done();'];

    // No settle parameter to key the rewrite on, or more than one.
    expect(suggestionsFor(variant('() =>', '(value) =>', assertions), 'no-expect-in-subscribe')).toEqual([]);
    expect(suggestionsFor(variant('(done, fail) =>', '(value) =>', assertions), 'no-expect-in-subscribe')).toEqual([]);
    expect(suggestionsFor(variant('({ done }) =>', '(value) =>', assertions), 'no-expect-in-subscribe')).toEqual([]);
    // A destructured emission, or a handler taking more than one argument.
    expect(suggestionsFor(variant('(done) =>', '({ value }) =>', assertions), 'no-expect-in-subscribe')).toEqual([]);
    expect(suggestionsFor(variant('(done) =>', '(value, index) =>', assertions), 'no-expect-in-subscribe')).toEqual([]);
    // `done` reached twice: one of the two paths would be dropped.
    expect(
      suggestionsFor(variant('(done) =>', '(value) =>', ['      if (value) { done(); }', '      done();']), 'no-expect-in-subscribe'),
    ).toEqual([]);
    // Nothing kept but the settle call, and a settle call that is not the last statement.
    expect(suggestionsFor(variant('(done) =>', '(value) =>', ['      done();']), 'no-expect-in-subscribe')).toEqual([]);
    expect(
      suggestionsFor(variant('(done) =>', '(value) =>', ['      done();', '      expect(value).toBe(1);']), 'no-expect-in-subscribe'),
    ).toEqual([]);
    // A callback that never settles the promise: the test hangs, and there is no first emission to
    // key the rewrite on either.
    expect(
      suggestionsFor(
        variant('(done) =>', '(value) =>', ['      expect(value).toBe(1);', '      expect(value).toBeTruthy();']),
        'no-expect-in-subscribe',
      ),
    ).toEqual([]);
    // A last statement that is not a call at all, or not even an expression.
    expect(
      suggestionsFor(variant('(done) =>', '(value) =>', ['      expect(value).toBe(1);', '      done;']), 'no-expect-in-subscribe'),
    ).toEqual([]);
    expect(
      suggestionsFor(
        variant('(done) =>', '(value) =>', ['      expect(value).toBe(1);', '      if (value) { done(); }']),
        'no-expect-in-subscribe',
      ),
    ).toEqual([]);
    // A settle call that is handed something — a rejection, or a value the promise resolves with.
    expect(
      suggestionsFor(variant('(done) =>', '(value) =>', ['      expect(value).toBe(1);', '      done(value);']), 'no-expect-in-subscribe'),
    ).toEqual([]);
    // `firstValueFrom` already means something else in this file.
    expect(suggestionsFor(`const firstValueFrom = 1;\n${wrapped}`, 'no-expect-in-subscribe')).toEqual([]);
  });

  it('declines an executor that does anything besides subscribing', () => {
    // The extra statement is usually the one that *triggers* the source, and it has to run while
    // something is already listening — which an await cannot promise.
    const triggered = [
      "it('x', () =>",
      '  new Promise<void>((done) => {',
      '    source$.subscribe((value) => {',
      '      expect(value).toBe(1);',
      '      done();',
      '    });',
      '    trigger();',
      '  }));',
    ].join('\n');

    expect(suggestionsFor(triggered, 'no-expect-in-subscribe')).toEqual([]);
    // A concise executor body has no statement list to lift from at all.
    expect(
      suggestionsFor("it('x', () => new Promise<void>((done) => source$.subscribe(() => done())));", 'no-expect-in-subscribe'),
    ).toEqual([]);
  });

  it('rewrites a single-handler observer, choosing the awaiter that matches it', () => {
    const observer = (handler: string, extra = ''): string =>
      [
        "it('x', () =>",
        '  new Promise<void>((done) => {',
        `    source$.subscribe({ ${handler}: (${extra}) => {`,
        '      expect(spy).toHaveBeenCalled();',
        '      done();',
        '    } });',
        '  }));',
      ].join('\n');

    expect(applySuggestion(observer('next', 'value'), 'no-expect-in-subscribe')).toContain('await firstValueFrom(source$);');
    // `complete` fires after an empty stream too, which `firstValueFrom` rejects on.
    expect(applySuggestion(observer('complete'), 'no-expect-in-subscribe')).toContain(
      'await lastValueFrom(source$, { defaultValue: undefined });',
    );
    expect(applySuggestion(observer('complete'), 'no-expect-in-subscribe')).toContain("import { lastValueFrom } from 'rxjs';");
  });

  it('declines a subscribe whose argument is not a lone handler', () => {
    const wrap = (subscribe: string): string =>
      ["it('x', () =>", '  new Promise<void>((done) => {', `    ${subscribe}`, '  }));'].join('\n');

    // Two handlers: a one-off codemod that looked for `done()` as the last line of *a* callback
    // found it in `complete`, took `next` for the body, and broke the file.
    expect(
      suggestionsFor(
        wrap('source$.subscribe({ next: (v) => { expect(v).toBe(1); }, complete: () => { done(); } });'),
        'no-expect-in-subscribe',
      ),
    ).toEqual([]);
    // The failure branch is a different assertion, not a different call.
    expect(
      suggestionsFor(wrap('source$.subscribe({ error: (e) => { expect(e).toBeDefined(); done(); } });'), 'no-expect-in-subscribe'),
    ).toEqual([]);
    // Positional `next, error`.
    expect(
      suggestionsFor(wrap('source$.subscribe((v) => { expect(v).toBe(1); done(); }, (e) => done());'), 'no-expect-in-subscribe'),
    ).toEqual([]);
    // A handler that is not a block-bodied function, and an argument that is neither.
    expect(suggestionsFor(wrap('source$.subscribe({ next: assert });'), 'no-expect-in-subscribe')).toEqual([]);
    expect(suggestionsFor(wrap('source$.subscribe(handlers);'), 'no-expect-in-subscribe')).toEqual([]);
  });

  it('declines a test callback that takes the Vitest context', () => {
    const withContext = [
      "it('x', ({ task }) =>",
      '  new Promise<void>((done) => {',
      '    source$.subscribe((value) => {',
      '      expect(value).toBe(task.name);',
      '      done();',
      '    });',
      '  }));',
    ].join('\n');

    expect(suggestionsFor(withContext, 'no-expect-in-subscribe')).toEqual([]);
  });
});

describe('no-shared-module-level-mock', () => {
  it('flags an exported object holding a vi.fn()', () => {
    expect(lint('export const ctx = { actions: { navigate: vi.fn() } };', 'no-shared-module-level-mock')).toEqual([
      'vitest-auto-spy/no-shared-module-level-mock',
    ]);
  });

  it('flags an exported provider whose useValue holds spies', () => {
    expect(lint('export const provider = { provide: Cart, useValue: { total: vi.fn() } };', 'no-shared-module-level-mock')).toHaveLength(1);
  });

  it('leaves the factory form alone — that is the fix', () => {
    expect(lint('export const createCtx = () => ({ actions: { navigate: vi.fn() } });', 'no-shared-module-level-mock')).toEqual([]);
    expect(lint('export function createCtx() { return { navigate: vi.fn() }; }', 'no-shared-module-level-mock')).toEqual([]);
  });

  it('leaves a spy that stays inside the file alone', () => {
    expect(lint('const ctx = { navigate: vi.fn() };', 'no-shared-module-level-mock')).toEqual([]);
  });

  it('leaves an exported value that builds no spies alone', () => {
    expect(lint("export const routes = [{ path: '', component: Home }];", 'no-shared-module-level-mock')).toEqual([]);
    expect(lint('export const empty = undefined;', 'no-shared-module-level-mock')).toEqual([]);
    expect(lint('export let pending;', 'no-shared-module-level-mock')).toEqual([]);
  });
});

describe('no-mocked-for-spy', () => {
  it('flags a variable declared as Vitest’s Mocked<T>', () => {
    expect(lint('let cart: Mocked<CartService>;', 'no-mocked-for-spy')).toEqual(['vitest-auto-spy/no-mocked-for-spy']);
    expect(lint('let cart: MockedObject<CartService>;', 'no-mocked-for-spy')).toHaveLength(1);
  });

  it('flags Mocked<T> wherever the type is written, not only on a let', () => {
    // In all eight reports of one batch the cast stood on the line after the declaration; fixing the
    // declaration and leaving the cast spelled `Mocked` is how one file ends up saying both.
    expect(lint('const http = {} as unknown as Mocked<HttpClient>;', 'no-mocked-for-spy')).toHaveLength(1);
    expect(lint('function makeCart(): Mocked<CartService> { return cart; }', 'no-mocked-for-spy')).toHaveLength(1);
    expect(lint('const use = (cart: Mocked<CartService>): void => cart.total();', 'no-mocked-for-spy')).toHaveLength(1);
  });

  it('leaves the right declaration, and an unrelated call, alone', () => {
    expect(lint('let cart: Spy<CartService>;', 'no-mocked-for-spy')).toEqual([]);
    expect(lint('const cart = vi.mocked(service);', 'no-mocked-for-spy')).toEqual([]);
  });

  it('renames the type and brings the Spy import with it', () => {
    expect(autofix('let cart: Mocked<CartService>;', 'no-mocked-for-spy')).toBe(
      "import type { Spy } from 'vitest-auto-spy';\nlet cart: Spy<CartService>;",
    );
  });

  it('takes the orphaned import with it, and only once it is orphaned', () => {
    // The last surviving specifier is the whole declaration.
    expect(autofix("import { Mocked } from 'vitest';\nlet cart: Mocked<CartService>;", 'no-mocked-for-spy')).toBe(
      "import type { Spy } from 'vitest-auto-spy';\n\nlet cart: Spy<CartService>;",
    );
    // One of several: the list is re-printed without it.
    expect(autofix("import { Mocked, vi } from 'vitest';\nlet cart: Mocked<CartService>;", 'no-mocked-for-spy')).toBe(
      "import type { Spy } from 'vitest-auto-spy';\nimport { vi } from 'vitest';\nlet cart: Spy<CartService>;",
    );
    // Two declarations: the import goes on the pass that rewrites the last of them, and the `Spy`
    // import is added once — the second pass finds it already there.
    expect(autofix("import { Mocked } from 'vitest';\nlet a: Mocked<CartService>;\nlet b: Mocked<CartService>;", 'no-mocked-for-spy')).toBe(
      "import type { Spy } from 'vitest-auto-spy';\n\nlet a: Spy<CartService>;\nlet b: Spy<CartService>;",
    );
  });

  it('renames but leaves the import where it cannot be cut cleanly', () => {
    // A default import is not a named specifier, so there is nothing to take out of the braces.
    expect(autofix("import Mocked from 'vitest';\nlet cart: Mocked<CartService>;", 'no-mocked-for-spy')).toBe(
      "import type { Spy } from 'vitest-auto-spy';\nimport Mocked from 'vitest';\nlet cart: Spy<CartService>;",
    );
    // Re-joining the survivors with commas would move the default import inside the braces.
    expect(autofix("import vitest, { Mocked } from 'vitest';\nlet cart: Mocked<CartService>;", 'no-mocked-for-spy')).toBe(
      "import type { Spy } from 'vitest-auto-spy';\nimport vitest, { Mocked } from 'vitest';\nlet cart: Spy<CartService>;",
    );
  });

  it('does not add a Spy import the file already has', () => {
    expect(autofix("import type { Spy } from 'vitest-auto-spy';\nlet cart: Mocked<CartService>;", 'no-mocked-for-spy')).toBe(
      "import type { Spy } from 'vitest-auto-spy';\nlet cart: Spy<CartService>;",
    );
  });

  it('reports without fixing what it cannot prove', () => {
    // A `Mocked` this file declares is not Vitest’s.
    expect(autofix('type Mocked<T> = T;\nlet cart: Mocked<CartService>;', 'no-mocked-for-spy')).toBe(
      'type Mocked<T> = T;\nlet cart: Mocked<CartService>;',
    );
    // `Spy<T>` reads a class or an interface; an object literal of `Mock`s is a different question.
    expect(autofix('let cart: Mocked<{ total: Mock }>;', 'no-mocked-for-spy')).toBe('let cart: Mocked<{ total: Mock }>;');
    // No type argument at all.
    expect(autofix('let cart: Mocked;', 'no-mocked-for-spy')).toBe('let cart: Mocked;');
    // `Spy` already means something else here.
    expect(autofix('const Spy = 1;\nlet cart: Mocked<CartService>;', 'no-mocked-for-spy')).toBe(
      'const Spy = 1;\nlet cart: Mocked<CartService>;',
    );
    // …and each of those is still reported.
    expect(lint('let cart: Mocked;', 'no-mocked-for-spy')).toHaveLength(1);
  });

  it('demotes the fix to a suggestion when what is assigned is not one of the library’s doubles', () => {
    // The shape that shipped uncompilable code: the declaration was rewritten, the object literal a
    // few lines below was not, `eslint --fix` reported clean and the type gate failed afterwards.
    const literal = 'let register: Mocked<Registry>;\nregister = { metrics: vi.fn() };';

    expect(autofix(literal, 'no-mocked-for-spy')).toBe(literal);
    expect(suggestionsFor(literal, 'no-mocked-for-spy')).toEqual([
      'Declare Spy<T> — and rebuild what is assigned to it, which Spy<T> will reject if it is a literal',
    ]);
    expect(applySuggestion(literal, 'no-mocked-for-spy')).toContain('Spy<Registry>');

    // The annotation of the real report sat behind an intersection.
    const intersection = "let register: Mocked<Registry> & { contentType: string };\nregister = { contentType: 'x' };";

    expect(autofix(intersection, 'no-mocked-for-spy')).toBe(intersection);

    // The same question one line up, when the declaration carries the literal itself.
    const initialised = 'let cart: Mocked<CartService> = { total: vi.fn() };';

    expect(autofix(initialised, 'no-mocked-for-spy')).toBe(initialised);

    // A name assigned twice is only as safe as its worst assignment.
    const both = 'let cart: Mocked<CartService>;\ncart = createSpyFromClass(CartService);\ncart = { total: vi.fn() };';

    expect(autofix(both, 'no-mocked-for-spy')).toBe(both);
  });

  it('keeps the plain fix where the declaration really is the whole edit', () => {
    // A value this library built is a `Spy<T>` already, so the rename cannot break the assignment.
    expect(autofix('let cart: Mocked<CartService>;\ncart = createSpyFromClass(CartService);', 'no-mocked-for-spy')).toContain(
      'let cart: Spy<CartService>;',
    );
    expect(autofix('let cart: Mocked<CartService> = injectSpy(CartService);', 'no-mocked-for-spy')).toContain('let cart: Spy<CartService>');
    // An assignment to a member says nothing about the name declared here.
    expect(autofix('let cart: Mocked<CartService>;\nstate.cart = { total: vi.fn() };', 'no-mocked-for-spy')).toContain(
      'let cart: Spy<CartService>;',
    );
  });
});

describe('prefer-as-spy', () => {
  it('flags the cast a migrated suite carries in every file', () => {
    expect(lint('devices = TestBed.inject(DeviceListService) as Spy<DeviceListService>;', 'prefer-as-spy')).toEqual([
      'vitest-auto-spy/prefer-as-spy',
    ]);
    // Not only next to `TestBed.inject`: the cast is the report, wherever the value came from.
    expect(lint('const cart = injector.get(CartService) as Spy<CartService>;', 'prefer-as-spy')).toHaveLength(1);
    expect(lint('(component.cart as Spy<CartService>).total.mockReturnValue(1);', 'prefer-as-spy')).toHaveLength(1);
  });

  it('leaves everything that is not a cast to this library’s Spy alone', () => {
    expect(lint('const cart = asSpy(TestBed.inject(CartService));', 'prefer-as-spy')).toEqual([]);
    expect(lint('const cart = TestBed.inject(CartService) as CartService;', 'prefer-as-spy')).toEqual([]);
    expect(lint('let cart: Spy<CartService>;', 'prefer-as-spy')).toEqual([]);
    // A `Spy` the file declares itself is somebody else's type, and there is nothing to say about a
    // cast to it — unlike a `Mocked<T>` declaration, which is wrong whoever owns the name.
    expect(lint('type Spy<T> = T;\nconst cart = TestBed.inject(CartService) as Spy<CartService>;', 'prefer-as-spy')).toEqual([]);
  });

  it('rewrites the cast as the call and brings the asSpy import with it', () => {
    expect(autofix('devices = TestBed.inject(DeviceListService) as Spy<DeviceListService>;', 'prefer-as-spy')).toBe(
      "import { asSpy } from 'vitest-auto-spy';\ndevices = asSpy<DeviceListService>(TestBed.inject(DeviceListService));",
    );
  });

  it('carries the type arguments across verbatim, the second one included', () => {
    // `Spy<T, Options>` and `asSpy<T, Options>` take the same parameter list, so the rewrite is a
    // transposition — the overload option survives it, where inference would silently drop it.
    expect(
      autofix(
        "import { asSpy } from 'vitest-auto-spy';\nconst c = TestBed.inject(Cinemas) as Spy<Cinemas, { overload: 'first' }>;",
        'prefer-as-spy',
      ),
    ).toBe("import { asSpy } from 'vitest-auto-spy';\nconst c = asSpy<Cinemas, { overload: 'first' }>(TestBed.inject(Cinemas));");
    // Nothing to carry: a bare `Spy` names no type, and the call infers what the cast could not say.
    expect(autofix("import { asSpy } from 'vitest-auto-spy';\nconst cart = service as Spy;", 'prefer-as-spy')).toBe(
      "import { asSpy } from 'vitest-auto-spy';\nconst cart = asSpy(service);",
    );
  });

  it('takes the orphaned Spy import with it, and only once it is orphaned', () => {
    // The cast was the last thing naming the type.
    expect(autofix("import type { Spy } from 'vitest-auto-spy';\nconst cart = TestBed.inject(Cart) as Spy<Cart>;", 'prefer-as-spy')).toBe(
      "import { asSpy } from 'vitest-auto-spy';\n\nconst cart = asSpy<Cart>(TestBed.inject(Cart));",
    );
    // The declaration above still names it, so the import stays.
    expect(
      autofix(
        "import type { Spy } from 'vitest-auto-spy';\nlet cart: Spy<Cart>;\ncart = TestBed.inject(Cart) as Spy<Cart>;",
        'prefer-as-spy',
      ),
    ).toBe(
      "import { asSpy } from 'vitest-auto-spy';\nimport type { Spy } from 'vitest-auto-spy';\nlet cart: Spy<Cart>;\ncart = asSpy<Cart>(TestBed.inject(Cart));",
    );
  });

  it('does not add an asSpy import the file already has', () => {
    expect(autofix("import { asSpy } from 'vitest-auto-spy';\nconst cart = service as Spy<Cart>;", 'prefer-as-spy')).toBe(
      "import { asSpy } from 'vitest-auto-spy';\nconst cart = asSpy<Cart>(service);",
    );
  });

  it('reports without fixing when the name is already something else here', () => {
    expect(autofix('const asSpy = 1;\nconst cart = service as Spy<Cart>;', 'prefer-as-spy')).toBe(
      'const asSpy = 1;\nconst cart = service as Spy<Cart>;',
    );
    expect(lint('const asSpy = 1;\nconst cart = service as Spy<Cart>;', 'prefer-as-spy')).toHaveLength(1);
  });

  it('unwraps the `as unknown` hop only where the value is provably the instance', () => {
    // `TestBed.inject(X)` returns `X` by construction: the `as unknown` was there to silence TS2352.
    expect(
      autofix("import { asSpy } from 'vitest-auto-spy';\nconst cart = TestBed.inject(Cart) as unknown as Spy<Cart>;", 'prefer-as-spy'),
    ).toBe("import { asSpy } from 'vitest-auto-spy';\nconst cart = asSpy<Cart>(TestBed.inject(Cart));");
    // Anywhere else the hop through `unknown` says the value is *not* a `Cart`, so `asSpy<Cart>(…)`
    // would not compile — that shape wants a real double, and this rule stays out of it.
    expect(lint('const cart = {} as unknown as Spy<Cart>;', 'prefer-as-spy')).toEqual([]);
    expect(lint('const cart = TestBed.get(Cart) as unknown as Spy<Cart>;', 'prefer-as-spy')).toEqual([]);
    expect(lint('const cart = (service as CartService) as Spy<Cart>;', 'prefer-as-spy')).toEqual([]);
  });
});

describe('no-done-callback', () => {
  it('flags a done parameter on a test and on a hook', () => {
    expect(lint("it('emits', (done) => source$.subscribe(() => done()));", 'no-done-callback')).toEqual([
      'vitest-auto-spy/no-done-callback',
    ]);
    expect(lint('beforeEach((done) => setup(done));', 'no-done-callback')).toHaveLength(1);
    expect(lint("test('emits', function (done) { done(); });", 'no-done-callback')).toHaveLength(1);
  });

  it('leaves a context destructuring and a plain callback alone', () => {
    expect(lint("it('skips', ({ task }) => task.skip());", 'no-done-callback')).toEqual([]);
    expect(lint("it('works', () => expect(1).toBe(1));", 'no-done-callback')).toEqual([]);
    expect(lint("it('works', async () => expect(1).toBe(1));", 'no-done-callback')).toEqual([]);
  });
});

describe('no-floating-assertion', () => {
  it('flags an assertion in a .then() nobody awaits', () => {
    expect(lint('testBed.compileComponents().then(() => { expect(spy).toHaveBeenCalled(); });', 'no-floating-assertion')).toEqual([
      'vitest-auto-spy/no-floating-assertion',
    ]);
    expect(lint('firstValueFrom(value$).then((value) => expect(value).toBeFalsy());', 'no-floating-assertion')).toHaveLength(1);
    expect(lint('load().finally(() => { expect(spy).toHaveBeenCalled(); });', 'no-floating-assertion')).toHaveLength(1);
  });

  it('flags both callbacks of a .then().catch() chain — the first one’s parent is only a member expression', () => {
    expect(lint('load().then(() => { expect(1).toBe(1); }).catch(() => { expect(2).toBe(2); });', 'no-floating-assertion')).toHaveLength(2);
  });

  it('leaves a chain somebody consumes alone', () => {
    expect(lint("it('a', async () => { await load().then(() => { expect(1).toBe(1); }); });", 'no-floating-assertion')).toEqual([]);
    expect(lint('const run = () => load().then(() => { expect(1).toBe(1); });', 'no-floating-assertion')).toEqual([]);
    expect(lint('const settled = load().then(() => { expect(1).toBe(1); });', 'no-floating-assertion')).toEqual([]);
    expect(
      lint("it('a', async () => { await Promise.all([load().then(() => { expect(1).toBe(1); })]); });", 'no-floating-assertion'),
    ).toEqual([]);
    expect(lint('track(load().then(() => { expect(1).toBe(1); }));', 'no-floating-assertion')).toEqual([]);
  });

  it('leaves a floating chain that asserts nothing alone', () => {
    expect(lint('load().catch(() => {});', 'no-floating-assertion')).toEqual([]);
  });

  it('stops at the immediately enclosing callback — awaiting the chain would not revive a deeper one', () => {
    expect(lint('load().then(() => { [1].forEach(() => { expect(1).toBe(1); }); });', 'no-floating-assertion')).toEqual([]);
    expect(lint('load().then(() => source$.subscribe((v) => expect(v).toBe(1)));', 'no-floating-assertion')).toEqual([]);
  });

  it('leaves an assertion outside a promise callback alone', () => {
    expect(lint('expect(await load()).toBe(1);', 'no-floating-assertion')).toEqual([]);
    expect(lint("it('works', () => { expect(1).toBe(1); });", 'no-floating-assertion')).toEqual([]);
    expect(lint('const check = () => { expect(1).toBe(1); };', 'no-floating-assertion')).toEqual([]);
    expect(lint('value$.subscribe(() => { expect(1).toBe(1); });', 'no-floating-assertion')).toEqual([]);
    expect(lint('load()[settle](() => { expect(1).toBe(1); });', 'no-floating-assertion')).toEqual([]);
  });
});

describe('no-overridden-provider', () => {
  it('flags the provider a later one for the same token replaces', () => {
    // Eight tokens in one spec file were registered both ways at once, and every `provideAutoSpy`
    // among them was dead code.
    const both = 'providers: [provideAutoSpy(DisplaySettingsService), { provide: DisplaySettingsService, useValue: mockDisplaySettings }]';

    expect(lint(both, 'no-overridden-provider')).toEqual(['vitest-auto-spy/no-overridden-provider']);
    expect(firstMessage(both, 'no-overridden-provider')).toContain('`DisplaySettingsService`');
  });

  it('flags whatever the two spellings are, in either order', () => {
    expect(lint('const p = [{ provide: A, useValue: x }, provideAutoSpy(A)];', 'no-overridden-provider')).toHaveLength(1);
    expect(lint('const p = [provideAutoSpy(A), provideAutoSpy(A)];', 'no-overridden-provider')).toHaveLength(1);
    expect(lint('const p = [provideAutoSpyForToken(TOKEN), { provide: TOKEN, useValue: x }];', 'no-overridden-provider')).toHaveLength(1);
    expect(lint('const p = [{ provide: A, useValue: x }, { provide: A, useClass: B }];', 'no-overridden-provider')).toHaveLength(1);
  });

  it('reports every provider the last one buries, not just the one above it', () => {
    expect(
      lint('const p = [provideAutoSpy(A), { provide: A, useValue: x }, { provide: A, useValue: y }];', 'no-overridden-provider'),
    ).toHaveLength(2);
  });

  it('leaves an array that registers each token once alone', () => {
    expect(lint('const p = [provideAutoSpy(A), provideAutoSpy(B), { provide: C, useValue: x }];', 'no-overridden-provider')).toEqual([]);
    // Two arrays are two scopes; only a single array can be resolved this way.
    expect(lint('const a = [provideAutoSpy(A)];\nconst b = [provideAutoSpy(A)];', 'no-overridden-provider')).toEqual([]);
  });

  it('reads past everything in a providers array that is not a provider', () => {
    expect(lint('const p = [provideRouter([]), provideHttpClient(), provideAutoSpy(A)];', 'no-overridden-provider')).toEqual([]);
    expect(lint('const p = [SomeModule, ...sharedProviders, provideAutoSpy(A)];', 'no-overridden-provider')).toEqual([]);
    expect(lint('const p = [helpers.provideAutoSpy(A), provideAutoSpy(A)];', 'no-overridden-provider')).toEqual([]);
    expect(lint('const p = [provideAutoSpy(), provideAutoSpy()];', 'no-overridden-provider')).toEqual([]);
    expect(lint('const p = [{ useValue: x }, { useValue: y }];', 'no-overridden-provider')).toEqual([]);
    // A hole is not a provider either, and must not be read as one.
    expect(lint('const p = [provideAutoSpy(A), , provideAutoSpy(B)];', 'no-overridden-provider')).toEqual([]);
  });

  it('separates the exact duplicate, and offers to delete it', () => {
    // The larger half of the first field data: 20 reports across an 8 673-file workspace, most of
    // them a token registered twice in the same words.
    const duplicate = 'const p = [provideAutoSpy(KidsModeService), provideAutoSpy(KidsModeService)];';
    const message = firstMessage(duplicate, 'no-overridden-provider');

    expect(message).toContain('`KidsModeService` is provided twice in this array, in the same words');
    expect(message).toContain('the copy on line 1');
    expect(suggestionsFor(duplicate, 'no-overridden-provider')).toEqual(['Delete this duplicate provider for KidsModeService']);
    // The comma goes with it, or the array is left holding a hole.
    expect(applySuggestion(duplicate, 'no-overridden-provider')).toBe('const p = [ provideAutoSpy(KidsModeService)];');
  });

  it('says which provider survives, and that it is the barer of the two', () => {
    // The smaller and more interesting half: the double the spec configured is not the one it got.
    const barer = [
      'const p = [',
      '  provideAutoSpy(AccountService, { gettersToSpyOn: [], instanceMethodsToSpyOn: [] }),',
      '  provideAutoSpy(AccountService),',
      '];',
    ].join('\n');
    const message = firstMessage(barer, 'no-overridden-provider');

    expect(message).toContain('follows this one on line 3');
    expect(message).toContain('the **barer** of the two');
    // Which of the two to keep is the whole question, so there is nothing to offer.
    expect(suggestionsFor(barer, 'no-overridden-provider')).toEqual([]);

    // An options value that is not a literal counts as the one thing it is, and still outweighs none.
    expect(firstMessage('const p = [provideAutoSpy(A, options), provideAutoSpy(A)];', 'no-overridden-provider')).toContain('**barer**');
  });

  it('leaves two multi providers for one token alone — Angular keeps both', () => {
    // Angular accumulates multi providers instead of keeping the last, so the second is the feature.
    // A spec asserting that two BEFORE_INIT hooks run in registration order registers both on
    // purpose, and reporting it can only be silenced with an eslint-disable over a working test.
    const multi = [
      'const p = [',
      '  { provide: BEFORE_INIT, useValue: first, multi: true },',
      '  { provide: BEFORE_INIT, useValue: second, multi: true },',
      '];',
    ].join('\n');

    expect(lint(multi, 'no-overridden-provider')).toEqual([]);
    // Three of them accumulate the same way, and none of them buries another.
    expect(
      lint(
        'const p = [{ provide: T, useValue: a, multi: true }, { provide: T, useValue: b, multi: true }, { provide: T, useValue: c, multi: true }];',
        'no-overridden-provider',
      ),
    ).toEqual([]);
    // A value this rule cannot resolve is read as multi: a missed report costs nothing, a false one
    // costs a disable comment over correct code.
    expect(
      lint('const p = [{ provide: T, useValue: a, multi: flag }, { provide: T, useValue: b, multi: flag }];', 'no-overridden-provider'),
    ).toEqual([]);
  });

  it('still reports multi mixed with plain, which Angular refuses at runtime', () => {
    // `Cannot mix multi providers and regular providers` — a defect whichever half was meant.
    expect(
      lint('const p = [{ provide: T, useValue: a, multi: true }, { provide: T, useValue: b }];', 'no-overridden-provider'),
    ).toHaveLength(1);
    expect(
      lint('const p = [{ provide: T, useValue: a }, { provide: T, useValue: b, multi: true }];', 'no-overridden-provider'),
    ).toHaveLength(1);
    // `multi: false` is a plain provider written out, not an accumulating one.
    expect(
      lint('const p = [{ provide: T, useValue: a, multi: false }, { provide: T, useValue: b, multi: false }];', 'no-overridden-provider'),
    ).toHaveLength(1);
    // The library's factories have no multi form, so one beside a multi provider is still a mix.
    expect(lint('const p = [provideAutoSpy(T), { provide: T, useValue: b, multi: true }];', 'no-overridden-provider')).toHaveLength(1);
  });

  it('keeps the original wording where neither of those is true', () => {
    // The eight-tokens case: an auto-spy buried by a configured hand-rolled double.
    const shadowed = 'const p = [provideAutoSpy(A), { provide: A, useValue: mock }];';

    expect(firstMessage(shadowed, 'no-overridden-provider')).toContain('the one on line 1 is what DI hands out');
    expect(suggestionsFor(shadowed, 'no-overridden-provider')).toEqual([]);
  });
});

describe('no-inject-before-override', () => {
  /** The shape a migration to `provideAutoSpy` produces: return values configured in `beforeEach`. */
  const suite = (hookBody: string, testBody: string): string =>
    [
      "describe('page', () => {",
      '  beforeEach(() => {',
      `    ${hookBody}`,
      '  });',
      '',
      "  it('renders', () => {",
      `    ${testBody}`,
      '  });',
      '});',
    ].join('\n');

  it('flags an injection that will break an override run later', () => {
    const broken = suite('asSpy(TestBed.inject(Api)).load.mockReturnValue(of(page));', 'TestBed.overrideProvider(Other, { useValue: x });');

    expect(lint(broken, 'no-inject-before-override')).toEqual(['vitest-auto-spy/no-inject-before-override']);
    expect(firstMessage(broken, 'no-inject-before-override')).toContain('already been instantiated');
  });

  it('flags createComponent in the hook too — it instantiates just the same', () => {
    expect(
      lint(
        suite('fixture = TestBed.createComponent(PageComponent);', 'TestBed.overrideComponent(PageComponent, {});'),
        'no-inject-before-override',
      ),
    ).toHaveLength(1);
  });

  it('does not depend on the override being written after the injection', () => {
    // The helper is declared above the hook and called from the test, so it runs last whatever the
    // source order says. A lexical rule would miss exactly this one.
    const viaHelper = [
      "describe('page', () => {",
      '  const createComponent = () => {',
      '    TestBed.overrideProvider(Other, { useValue: x });',
      '    return TestBed.createComponent(PageComponent);',
      '  };',
      '',
      '  beforeEach(() => {',
      '    asSpy(TestBed.inject(Api)).load.mockReturnValue(of(page));',
      '  });',
      '',
      "  it('renders', () => createComponent());",
      '});',
    ].join('\n');

    expect(lint(viaHelper, 'no-inject-before-override')).toHaveLength(1);
  });

  it('leaves the orders that actually work alone', () => {
    // Nothing overrides.
    expect(
      lint(suite('asSpy(TestBed.inject(Api)).load.mockReturnValue(of(page));', 'expect(1).toBe(1);'), 'no-inject-before-override'),
    ).toEqual([]);
    // The override is in the same hook, ahead of the injection.
    expect(
      lint(
        suite('TestBed.overrideProvider(Other, { useValue: x });\n    TestBed.inject(Api);', 'expect(1).toBe(1);'),
        'no-inject-before-override',
      ),
    ).toEqual([]);
    // Injected inside the test rather than the hook, which is the fix the message names.
    expect(lint(suite('noop();', 'TestBed.overrideProvider(Other, {});\n    injectSpy(Api);'), 'no-inject-before-override')).toEqual([]);
    // A suite that resets the module has already thought about this.
    expect(
      lint(
        suite('TestBed.inject(Api);', 'TestBed.resetTestingModule();\n    TestBed.overrideProvider(Other, {});'),
        'no-inject-before-override',
      ),
    ).toEqual([]);
    // Two suites, only one of which overrides.
    const separate = [
      "describe('a', () => { beforeEach(() => { TestBed.inject(Api); }); });",
      "describe('b', () => { it('x', () => TestBed.overrideProvider(Other, {})); });",
    ].join('\n');

    expect(lint(separate, 'no-inject-before-override')).toEqual([]);
  });

  it('reads an injection written outside any suite, and any call that merely looks like one', () => {
    expect(lint('TestBed.inject(Api);\nTestBed.overrideProvider(Other, {});', 'no-inject-before-override')).toEqual([]);
    expect(
      lint("beforeEach(() => { TestBed.inject(Api); });\nit('x', () => bed.overrideProvider(Other, {}));", 'no-inject-before-override'),
    ).toEqual([]);
    expect(
      lint("beforeEach(() => { TestBed.inject(Api); });\nit('x', () => TestBed.compileComponents());", 'no-inject-before-override'),
    ).toEqual([]);
  });
});

describe('no-import-time-spread', () => {
  /** The shape the failure takes: a value another module owns, spread while this one is loading. */
  const imported = "import { BaseEvents } from './base-events';\n";

  it('flags a module-scope spread of an imported binding', () => {
    const spread = `${imported}export const webosEvents = [...BaseEvents];`;

    expect(lint(spread, 'no-import-time-spread')).toEqual(['vitest-auto-spy/no-import-time-spread']);
    expect(firstMessage(spread, 'no-import-time-spread')).toContain('`BaseEvents`');
  });

  it('reads an object spread and an argument list the same way', () => {
    expect(lint(`${imported}export const config = { ...BaseEvents };`, 'no-import-time-spread')).toHaveLength(1);
    expect(lint(`${imported}register(...BaseEvents);`, 'no-import-time-spread')).toHaveLength(1);
    // A static field is evaluated with the class declaration, which is while the module loads.
    expect(lint(`${imported}class Events { static all = [...BaseEvents]; }`, 'no-import-time-spread')).toHaveLength(1);
  });

  it('leaves what runs later, and what this file owns, alone', () => {
    expect(lint(`${imported}export const make = () => [...BaseEvents];`, 'no-import-time-spread')).toEqual([]);
    expect(lint(`${imported}class Events { all = [...BaseEvents]; }`, 'no-import-time-spread')).toEqual([]);
    // A local value is already evaluated by the time the line below it runs.
    expect(lint('const local = [1];\nexport const all = [...local];', 'no-import-time-spread')).toEqual([]);
    // A name from nowhere resolvable is not knowably an import.
    expect(lint('export const all = [...whateverThisIs];', 'no-import-time-spread')).toEqual([]);
    // The operand is a call, not the binding: whatever that throws is not this rule's business.
    expect(lint(`${imported}export const all = [...BaseEvents.slice()];`, 'no-import-time-spread')).toEqual([]);
  });

  it('offers the lazy value, and nothing where there is no value to defer', () => {
    const spread = `${imported}export const webosEvents = [...BaseEvents];`;
    const deferred = applySuggestion(spread, 'no-import-time-spread');

    expect(suggestionsFor(spread, 'no-import-time-spread')).toEqual([
      'Build the value lazily: wrap the initialiser in an arrow, and call it where it is read',
    ]);
    expect(deferred).toBe(`${imported}export const webosEvents = () => ([...BaseEvents]);`);
    // Accepting it puts the spread inside a function body, so the rule falls silent — and every use
    // of the name is now a call the type checker will point at.
    expect(lint(deferred, 'no-import-time-spread')).toEqual([]);
    // An argument list is not an initialiser: there is nothing local to defer.
    expect(suggestionsFor(`${imported}register(...BaseEvents);`, 'no-import-time-spread')).toEqual([]);
  });

  it('never fixes on its own — the safe rewrite is not decidable from this file', () => {
    const spread = `${imported}export const webosEvents = [...BaseEvents];`;

    expect(autofix(spread, 'no-import-time-spread')).toBe(spread);
  });
});

describe('the plugin', () => {
  it('ships every rule it recommends, wired to itself for flat config', () => {
    const recommended = Object.keys(plugin.configs.recommended.rules).map((id) => id.replace('vitest-auto-spy/', ''));

    expect(recommended.sort()).toEqual(Object.keys(rules).sort());
    expect(plugin.configs.recommended.plugins['vitest-auto-spy']).toBe(plugin);
    expect(plugin.rules).toBe(rules);
  });

  it('declares a fix or a suggestion exactly where it ships one', () => {
    const named = (predicate: (rule: (typeof rules)[string]) => boolean): string[] =>
      Object.entries(rules)
        .filter(([, rule]) => predicate(rule))
        .map(([name]) => name)
        .sort();

    // The README and AGENTS.md tables say the same thing in prose; this is what keeps them honest.
    expect(named((rule) => rule.meta.fixable !== undefined)).toEqual(['no-mocked-for-spy', 'prefer-as-spy']);
    // `no-mocked-for-spy` declares both: the same edit is applied where the declaration is the whole
    // story and offered where the creation site has to change with it.
    expect(named((rule) => rule.meta.hasSuggestions !== undefined)).toEqual([
      'no-expect-in-subscribe',
      'no-import-time-spread',
      'no-mocked-for-spy',
      'no-object-define-property',
      'no-overridden-provider',
      'prefer-inject-spy',
    ]);
  });

  it('documents every rule with a link to the recipe it recommends', () => {
    Object.values(rules).forEach((rule) => {
      expect(rule.meta.docs.url).toContain('#how-to-mock');
      expect(Object.values(rule.meta.messages).every((message) => message.includes(rule.meta.docs.url))).toBe(true);
    });
  });
});

describe('no-unregistered-inject-spy', () => {
  const RULE = 'no-unregistered-inject-spy';

  /** The shape the rule exists for: one token registered, another injected. */
  const unregistered = `
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [provideAutoSpy(UserService)],
    });

    const users = injectSpy(UserService);
    const route = injectSpy(ActivatedRoute);
  `;

  it('reports an injectSpy whose token nothing registered', () => {
    expect(lint(unregistered, RULE)).toEqual([`vitest-auto-spy/${RULE}`]);
    expect(firstMessage(unregistered, RULE)).toContain('ActivatedRoute');
  });

  it('accepts a token registered through provideAutoSpy or an auto-spy useValue', () => {
    const registered = `
      TestBed.configureTestingModule({
        providers: [provideAutoSpy(UserService), { provide: Clock, useValue: createAutoMock<Clock>() }],
      });

      injectSpy(UserService);
      injectSpy(Clock);
    `;

    expect(lint(registered, RULE)).toEqual([]);
  });

  it('says nothing about a token provided by hand — that is prefer-provide-auto-spy’s line', () => {
    const handRolled = `
      TestBed.configureTestingModule({
        providers: [provideAutoSpy(UserService), { provide: Clock, useValue: { now: () => 0 } }],
      });

      injectSpy(Clock);
    `;

    expect(lint(handRolled, RULE)).toEqual([]);
  });

  it('stays quiet in a file that never registers an auto-spy at all', () => {
    const noRegistrations = `
      TestBed.configureTestingModule({ providers: [] });

      injectSpy(ActivatedRoute);
    `;

    expect(lint(noRegistrations, RULE)).toEqual([]);
  });

  it.each([
    ['a spread of shared providers', 'providers: [provideAutoSpy(UserService), ...sharedMocks]'],
    ['an unknown provider factory', 'providers: [provideAutoSpy(UserService), provideRouterStubs()]'],
    ['a bare identifier', 'providers: [provideAutoSpy(UserService), routerProvider]'],
    ['a hole', 'providers: [provideAutoSpy(UserService), , ]'],
    ['an object with no provide key', 'providers: [provideAutoSpy(UserService), { useValue: 1 }]'],
  ])('stays quiet when the providers array contains %s', (_label, providers) => {
    const code = `
      TestBed.configureTestingModule({ ${providers} });

      injectSpy(ActivatedRoute);
    `;

    expect(lint(code, RULE)).toEqual([]);
  });

  it.each([
    ['createWithAutoSpies', 'createWithAutoSpies(HostComponent, [UserService]);'],
    ['renderShallow', 'renderShallow(HostComponent);'],
    ['TestBed.overrideProvider', 'TestBed.overrideProvider(ActivatedRoute, { useValue: {} });'],
  ])('stays quiet when %s builds the module elsewhere', (_label, statement) => {
    const code = `
      TestBed.configureTestingModule({ providers: [provideAutoSpy(UserService)] });
      ${statement}

      injectSpy(ActivatedRoute);
    `;

    expect(lint(code, RULE)).toEqual([]);
  });

  it('is unmoved by the calls around it — zero-argument, member and chained', () => {
    const noise = `
      TestBed.configureTestingModule({ providers: [provideAutoSpy(UserService)] });
      TestBed.resetTestingModule();
      TestBed.inject(UserService);
      fixture.debugElement.query(By.css('a'));
      helpers.build();

      injectSpy(ActivatedRoute);
    `;

    expect(lint(noise, RULE)).toEqual([`vitest-auto-spy/${RULE}`]);
  });
});
