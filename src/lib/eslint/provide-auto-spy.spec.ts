/**
 * The long-form arm of `prefer-provide-auto-spy`: the provider that spells the factory out.
 *
 * Both halves are checked here, because the fix is the point of the arm. What it reports comes from
 * a suite of 1771 spec files — 91 exact providers in 49 files, and the 51 in 41 files that build the
 * double from a *different* class, which is the shape that has to stay silent. What it rewrites is
 * checked character for character: the replacement is the factory's own body, so anything the fix
 * invents is a change of meaning rather than a shortening.
 */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { fixRule, runRule } from './run-rule';

const RULE = 'prefer-provide-auto-spy';

/** Every report the rule draws for a snippet. */
function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

/** How many reports the rule draws. */
function count(code: string): number {
  return verify(code).length;
}

/** The first report's message, for the cases about which of the five wordings arrives. */
function message(code: string): string {
  return verify(code)[0]?.message ?? '';
}

/** The source as `eslint --fix` would leave it, repeated passes and all. */
function autofix(code: string): string {
  return fixRule(RULE, code).output;
}

/** The rule ids reported for a snippet. */
function lint(code: string): string[] {
  return verify(code).map((message) => message.ruleId ?? 'parse-error');
}

/** The lines reported for a snippet — for asserting that every violator of a list is named, not just one. */
function lines(code: string): number[] {
  return verify(code).map((message) => message.line);
}

/** The first report's message again, under the name the hand-rolled arm's cases were written against. */
const firstMessage = message;

describe('prefer-provide-auto-spy — the long-form arm', () => {
  it('flags a provider that is provideAutoSpy written out', () => {
    expect(count('const p = { provide: Cart, useValue: createSpyFromClass(Cart) };')).toBe(1);
    expect(message('const p = { provide: Cart, useValue: createSpyFromClass(Cart) };')).toContain('spelled out');
  });

  it('rewrites it as the call and imports the factory', () => {
    const code = "import { createSpyFromClass } from 'vitest-auto-spy';\nconst p = { provide: Cart, useValue: createSpyFromClass(Cart) };";

    expect(autofix(code)).toBe("import { provideAutoSpy } from 'vitest-auto-spy/angular';\n\nconst p = provideAutoSpy(Cart);");
  });

  it('carries the configuration over character for character', () => {
    const code = [
      'TestBed.configureTestingModule({',
      '  providers: [',
      '    {',
      '      provide: Cart,',
      '      useValue: createSpyFromClass(Cart, {',
      '        returns: { total: 0, items: [] }, // the empty basket the page starts from',
      '      }),',
      '    },',
      '  ],',
      '});',
    ].join('\n');

    // The argument keeps its own columns — the formatter the project runs owns the re-indent, and a
    // fixer that guessed at it would be rewriting code it was only asked to move.
    expect(autofix(code)).toContain(
      [
        '    provideAutoSpy(Cart, {',
        '        returns: { total: 0, items: [] }, // the empty basket the page starts from',
        '      }),',
      ].join('\n'),
    );
  });

  it('leaves a double built from a different class alone', () => {
    // The token is abstract and the spy reads the implementation behind it, because the abstract
    // prototype carries none of the methods: `provideAutoSpy(LocalStorage)` would spy nothing.
    expect(count('const p = { provide: LocalStorage, useValue: createSpyFromClass(BaseLocalStorage) };')).toBe(0);
  });

  it('reports a call with explicit type arguments but does not rewrite it', () => {
    // `createSpyFromClass<T, Options>` takes two type parameters and `provideAutoSpy<T>` one, so the
    // shorter call cannot say what this one says.
    const code = 'const p = { provide: Cart, useValue: createSpyFromClass<Cart>(Cart) };';

    expect(count(code)).toBe(1);
    expect(autofix(code)).toBe(code);
  });

  it('reports a literal with a third property but does not rewrite it', () => {
    const code = 'const p = { provide: Cart, useValue: createSpyFromClass(Cart), deps: [] };';

    expect(count(code)).toBe(1);
    expect(autofix(code)).toBe(code);
  });

  it('says nothing at all about a multi provider', () => {
    expect(count('const p = { provide: HOOKS, useValue: createSpyFromClass(HOOKS), multi: true };')).toBe(0);
  });

  it('leaves a spy parked in a name alone, because the repair is every use of that name', () => {
    expect(count('const cart = createSpyFromClass(Cart);\nconst p = { provide: Cart, useValue: cart };')).toBe(0);
  });

  it('drops the factory import only when nothing else in the file calls it', () => {
    const both = [
      "import { createSpyFromClass } from 'vitest-auto-spy';",
      'const p = { provide: Cart, useValue: createSpyFromClass(Cart) };',
      'const q = { provide: Nav, useValue: createSpyFromClass(Nav) };',
    ].join('\n');

    expect(autofix(both)).toBe(
      [
        "import { provideAutoSpy } from 'vitest-auto-spy/angular';",
        '',
        'const p = provideAutoSpy(Cart);',
        'const q = provideAutoSpy(Nav);',
      ].join('\n'),
    );

    const kept = [
      "import { createSpyFromClass } from 'vitest-auto-spy';",
      'const cart = createSpyFromClass(Cart);',
      'const q = { provide: Nav, useValue: createSpyFromClass(Nav) };',
    ].join('\n');

    expect(autofix(kept)).toContain("import { createSpyFromClass } from 'vitest-auto-spy';");
  });

  it('keeps the factory import when the name is also handed around rather than called', () => {
    const code = [
      "import { createSpyFromClass } from 'vitest-auto-spy';",
      'const build = createSpyFromClass;',
      'register(createSpyFromClass);',
      'const p = { provide: Cart, useValue: createSpyFromClass(Cart) };',
    ].join('\n');

    expect(autofix(code)).toContain("import { createSpyFromClass } from 'vitest-auto-spy';");
    expect(autofix(code)).toContain('const p = provideAutoSpy(Cart);');
  });

  it('takes the specifier into the import of that entry point the file already has', () => {
    // A second `import … from 'vitest-auto-spy/angular'` would be valid and would then be reported by
    // `import/no-duplicates`, on the line the fixer wrote: 20 of the 49 files this rule rewrites on
    // the suite it was measured against already import from that entry point.
    const code = [
      "import { createSpyFromClass, injectSpy } from 'vitest-auto-spy/angular';",
      'const p = { provide: Cart, useValue: createSpyFromClass(Cart) };',
    ].join('\n');

    expect(autofix(code)).toBe(
      ["import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';", 'const p = provideAutoSpy(Cart);'].join('\n'),
    );
  });

  it('writes its own import when the file has two of that entry point, or none', () => {
    // Two declarations of the same module is a file `import/no-duplicates` already reports; picking
    // one of them to extend would be a guess, and the guess is not needed to make the fix valid.
    const twice = [
      "import { createSpyFromClass } from 'vitest-auto-spy/angular';",
      "import { injectSpy } from 'vitest-auto-spy/angular';",
      'const p = { provide: Cart, useValue: createSpyFromClass(Cart) };',
    ].join('\n');

    expect(autofix(twice)).toContain("import { provideAutoSpy } from 'vitest-auto-spy/angular';\n");
  });

  it('uses a provideAutoSpy the file already imports instead of importing it twice', () => {
    const code = [
      "import { createSpyFromClass, provideAutoSpy } from 'vitest-auto-spy/angular';",
      'const p = { provide: Cart, useValue: createSpyFromClass(Cart) };',
      'const q = provideAutoSpy(Nav);',
    ].join('\n');

    expect(autofix(code)).toBe(
      [
        "import { provideAutoSpy } from 'vitest-auto-spy/angular';",
        'const p = provideAutoSpy(Cart);',
        'const q = provideAutoSpy(Nav);',
      ].join('\n'),
    );
  });

  it('reports but does not rewrite when the file declares a provideAutoSpy of its own', () => {
    const code = ['function provideAutoSpy() {}', 'const p = { provide: Cart, useValue: createSpyFromClass(Cart) };'].join('\n');

    expect(count(code)).toBe(1);
    expect(autofix(code)).toBe(code);
  });

  it('still reports the hand-rolled shapes it always did', () => {
    expect(count('const p = { provide: Cart, useValue: { total: vi.fn() } };')).toBe(1);
    expect(message('const p = { provide: Cart, useValue: { total: vi.fn() } };')).toContain(
      'The `useValue` for `Cart` hand-lists 1 member',
    );
  });
});

/**
 * `ActivatedRoute` is the one token whose double is not a spy of the class.
 *
 * Every field a component reads off a route is an instance field, so a spy built from the prototype
 * has none of them — which is why the message for this token names `provideActivatedRoute()` from
 * `vitest-auto-spy/angular-router` rather than the factory the rest of the rule recommends.
 */
describe('prefer-provide-auto-spy — the ActivatedRoute token', () => {
  it('names provideActivatedRoute for a hand-built route, not provideAutoSpy', () => {
    const code = 'const p = { provide: ActivatedRoute, useValue: { snapshot: { params: vi.fn() } } };';

    expect(count(code)).toBe(1);
    expect(message(code)).toContain('provideActivatedRoute');
    expect(message(code)).toContain('vitest-auto-spy/angular-router');
    expect(message(code)).not.toContain('provideAutoSpy(Class)');
  });

  it('names it for the long form and for an override of the same token', () => {
    expect(message('const p = { provide: ActivatedRoute, useValue: createSpyFromClass(ActivatedRoute) };')).toContain(
      'provideActivatedRoute',
    );
    expect(message('TestBed.overrideProvider(ActivatedRoute, { useValue: { snapshot: vi.fn() } });')).toContain('provideActivatedRoute');
  });

  it('says nothing more than it used to about a route descriptor that hands over no double', () => {
    expect(count('const p = { provide: ActivatedRoute, useValue: route };')).toBe(0);
    expect(count('const p = { provide: Cart, useValue: { total: vi.fn() } };')).toBe(1);
  });
});

describe('prefer-provide-auto-spy — the hand-rolled arm', () => {
  it('flags it through a quoted key too', () => {
    expect(lint("const p = { 'provide': Cart, 'useValue': { total: jest.fn() } };")).toHaveLength(1);
  });

  it('leaves a plain configuration value alone', () => {
    expect(lint("const p = { provide: CONFIG, useValue: { apiUrl: '/api' } };")).toEqual([]);
  });

  it('leaves a spy-backed provider and a computed key alone', () => {
    // A spy read from the class the provider *names* is the long-form arm's business and has its own
    // file; what is silent here is a factory reading a different class — an abstract token's
    // implementation, which `provideAutoSpy` on the token itself could not stand in for.
    expect(lint('const p = { provide: Cart, useValue: createSpyFromClass(BaseCart) };')).toEqual([]);
    // A factory with a seed is the fix this rule recommends; the ` + '`' + `useValue` + '`' + ` is a call, not a literal.
    expect(lint('const p = { provide: Cart, useValue: createAutoMock<Cart>({ total: vi.fn() }) };')).toEqual([]);
    expect(lint("const p = { ['provide']: Cart, useValue: { total: vi.fn() } };")).toEqual([]);
    expect(lint('const p = { useValue: { total: vi.fn() } };')).toEqual([]);
  });

  it('leaves a multi provider alone, because the fix it would ask for does not exist', () => {
    // `provideAutoSpy` builds one double for a token and takes no registration mode, so following
    // this advice would quietly turn an accumulating provider into an overriding one.
    expect(lint('const p = { provide: HOOKS, useValue: { run: vi.fn() }, multi: true };')).toEqual([]);
  });

  it('follows a double declared above and passed by name', () => {
    // Eight doubles in one file of the suite this came from were written this way, and the rule
    // reported none of them.
    expect(lint('const nav = { go: vi.fn() };\nconst p = { provide: Nav, useValue: nav };')).toHaveLength(1);
  });

  it('follows a name a hook fills in, which is how a migrated suite writes one', () => {
    // The shape a whole 170-file migration shard was written in: every one of its six
    // `provideAutoSpy` opportunities was a `let` declared above and assigned in a `beforeEach`, and
    // the report it drew instead came from `prefer-create-spy-from-class`, whose message never
    // mentions `provideAutoSpy`.
    const assigned = [
      "describe('x', () => {",
      '  let nav: { go: Mock };',
      '  beforeEach(() => {',
      '    nav = { go: vi.fn() };',
      '    TestBed.configureTestingModule({ providers: [{ provide: NavService, useValue: nav }] });',
      '  });',
      '});',
    ].join('\n');

    expect(lines(assigned)).toEqual([5]);
  });

  it('leaves a name assigned more than once alone', () => {
    // From the second assignment on, what the name holds where it is used depends on run order.
    const twice = [
      'let nav;',
      'beforeEach(() => { nav = { go: vi.fn() }; });',
      'afterEach(() => { nav = { go: vi.fn(), back: vi.fn() }; });',
      'const p = { provide: NavService, useValue: nav };',
    ].join('\n');

    expect(lint(twice)).toEqual([]);
  });

  it('sees a spy nested below the top level of the useValue', () => {
    expect(lint("const p = { provide: PLATFORM, useValue: { type: 'tizen', application: { init: vi.fn() } } };")).toHaveLength(1);
  });

  it('leaves a name it cannot follow to an object of spies alone', () => {
    expect(lint('const p = { provide: Cart, useValue: buildCart() };')).toEqual([]);
    expect(lint("import { nav } from './fixtures';\nconst p = { provide: Nav, useValue: nav };")).toEqual([]);
    expect(lint('const nav = { go: () => vi.fn() };\nconst p = { provide: Nav, useValue: nav };')).toEqual([]);
  });

  /**
   * One pass, every violator — the property a lint rule has to have before a suite can be cleared
   * against it and the rule raised to `error`. A rule that reported in batches would make "zero
   * findings" mean nothing, and the inventory taken from one run an undercount.
   *
   * Reported as a defect from a migration and not reproducible: the two `providers` arrays behind
   * that report each held a shape this rule is deliberately silent on — the three in
   * "leaves a name it cannot follow to an object of spies alone" above, plus `multi: true`. That
   * silence is the real limit on the inventory, and it does not move when a neighbour is fixed.
   */
  it('reports every hand-rolled provider of one array in a single pass', () => {
    const providers = [
      'TestBed.configureTestingModule({',
      '  providers: [',
      '    { provide: PaymentCardService, useValue: { load: vi.fn(), save: vi.fn() } },',
      '    { provide: AppEventsService, useValue: { emit: vi.fn(), listen: vi.fn() } },',
      '    { provide: FocusService, useValue: { focus: vi.fn() } },',
      '  ],',
      '});',
    ].join('\n');

    expect(lines(providers)).toEqual([3, 4, 5]);
  });

  it('reports the survivors unchanged once one of them has been converted', () => {
    const converted = [
      'TestBed.configureTestingModule({',
      '  providers: [',
      '    provideAutoSpy(PaymentCardService),',
      '    { provide: AppEventsService, useValue: { emit: vi.fn(), listen: vi.fn() } },',
      '    { provide: FocusService, useValue: { focus: vi.fn() } },',
      '  ],',
      '});',
    ].join('\n');

    expect(lines(converted)).toEqual([4, 5]);
  });

  it('names provideAutoSpyForToken when the thing provided is a token, not a class', () => {
    // `provideAutoSpy` reads a class prototype; a token has none, so the old advice did not compile.
    // Six of eight reports in one migration batch were on tokens.
    expect(firstMessage('const p = { provide: PASSCODE_TOKEN, useValue: { check: vi.fn() } };')).toContain(
      'provideAutoSpyForToken(PASSCODE_TOKEN)',
    );
    // A declaration the resolver can reach settles it whatever the name looks like.
    expect(
      firstMessage("const Logger = new InjectionToken<Logger>('logger');\nconst p = { provide: Logger, useValue: { debug: vi.fn() } };"),
    ).toContain('provideAutoSpyForToken(Logger)');
  });

  it('names provideAutoSpy for a class, with the token and the members it hand-lists', () => {
    const message = firstMessage('const p = { provide: CartService, useValue: { total: vi.fn(), count: vi.fn() } };');

    expect(message).toMatch(/^The `useValue` for `CartService` hand-lists 2 members/);
    expect(message).toContain('provideAutoSpy(CartService)');
    expect(firstMessage('const double = { total: vi.fn() };\nconst p = { provide: CartService, useValue: double };')).toContain(
      'The `useValue` for `CartService` is a hand-rolled double',
    );
  });

  it('points at overrides for a data member, on both halves of the message', () => {
    // The rule was read as asking for something the class factory could not express — a double
    // whose `flagsConfig` has to *be* an object rather than answer with one — and the reader
    // reached for `gettersToSpyOn`, which is not that. `overrides` has been on the class
    // configuration for as long as it has been on the token factory; only the message was silent.
    expect(firstMessage('const p = { provide: CartService, useValue: { total: vi.fn() } };')).toContain('{ overrides }');

    // And the token half says what a nested shape needs, which is the same second argument: the
    // bare double makes every key a function spy, so `req.headers.get(…)` reads a property off one.
    expect(firstMessage('const p = { provide: REQUEST, useValue: { headers: { get: vi.fn() } } };')).toContain(
      'nested values go in its second argument',
    );

    // A chained call is the third argument's, and stays a spy — a `mockReturnThis()` seed did not.
    expect(firstMessage('const p = { provide: LOGGER, useValue: { channel: vi.fn() } };')).toContain('{ selfReturning }');
  });

  it('reads a class out of every initialiser that is not a token', () => {
    const classMessage = (setup: string): string => firstMessage(setup + '\nconst p = { provide: Cart, useValue: { total: vi.fn() } };');

    expect(classMessage('')).toContain('provideAutoSpy(Cart)');
    expect(classMessage('const Cart = class {};')).toContain('provideAutoSpy(Cart)');
    expect(classMessage('const Cart = new CartService();')).toContain('provideAutoSpy(Cart)');
    expect(classMessage('const Cart = new ng.InjectionToken();')).toContain('provideAutoSpy(Cart)');
    // Not an identifier at all — a token read off a namespace import.
    expect(firstMessage('const p = { provide: tokens.CART, useValue: { total: vi.fn() } };')).toContain('provideAutoSpy(tokens.CART)');
  });

  it('reads a hand-rolled double behind a useFactory, through the function', () => {
    // The `useValue` walk stops at function boundaries — a factory returning spies is the shape the
    // rules recommend. For `useFactory` the function *is* the value, so it reads through it.
    expect(lint('const p = { provide: A, useFactory: () => ({ isKeyEnabled: vi.fn() }) };')).toHaveLength(1);
    expect(
      lint('const spy = vi.fn().mockImplementation(() => ({ isKeyEnabled: vi.fn() }));\nconst p = { provide: A, useFactory: spy };'),
    ).toHaveLength(1);
    expect(lint('const p = { provide: A, useFactory: buildRealThing };')).toEqual([]);
    expect(lint('const p = { provide: A, useFactory: () => new CartService() };')).toEqual([]);
  });

  it('reads a stub class handed over by useExisting, not just by useClass', () => {
    // `useExisting` aliases the token instead of constructing the stub per injector, and neither
    // difference changes the repair. Reported from the class instead, it drew
    // `no-stub-class-double`'s message, which recommends `createSpyFromClass` and cannot know DI is
    // involved.
    const existing = 'class NavMock { go = vi.fn(); }\nconst p = { provide: NavService, useExisting: NavMock };';

    expect(lint(existing)).toHaveLength(1);
    expect(firstMessage(existing)).toMatch(/^`NavService` is provided with the stub class `NavMock`/);
    // Aliasing to a real class is the ordinary use of the slot.
    expect(lint('const p = { provide: PROMO_OPENER, useExisting: PromoOpenService };')).toEqual([]);
    // …and so is aliasing to a class this file cannot read.
    expect(lint("import { NavMock } from './nav.mock';\nconst p = { provide: NavService, useExisting: NavMock };")).toEqual([]);
  });

  it('flags a hand-rolled double handed to TestBed.overrideProvider', () => {
    // The same substitution from outside a `providers` array, and the `provide:` this rule looks for
    // is not there — the token is argument 0. 33 of one consumer's 61 override calls hand over an
    // object literal, and nothing reported any of them.
    expect(lint('TestBed.overrideProvider(CartService, { useValue: { total: vi.fn() } });')).toEqual([
      'vitest-auto-spy/prefer-provide-auto-spy',
    ]);
    // Chained off the configuration call, which is how most of them are written — a selector naming
    // `TestBed` would match none of these.
    expect(lint('TestBed.configureTestingModule({}).overrideProvider(Cart, { useValue: { total: vi.fn() } });')).toHaveLength(1);
    // A name above the call is followed here too.
    expect(lint('const cart = { total: vi.fn() };\nTestBed.overrideProvider(Cart, { useValue: cart });')).toHaveLength(1);
    // A stub class and a factory reach the same message.
    expect(lint('class CartMock { total = vi.fn(); }\nTestBed.overrideProvider(Cart, { useClass: CartMock });')).toHaveLength(1);
    expect(lint('TestBed.overrideProvider(Cart, { useFactory: () => ({ total: vi.fn() }) });')).toHaveLength(1);
  });

  it('says where the replacement goes at an override call site', () => {
    const message = firstMessage('TestBed.overrideProvider(Cart, { useValue: { total: vi.fn() } });');

    // The recommendation has to be the one that fits this call site: `provideAutoSpy` returns
    // `{ provide, useValue }`, which is why it can be handed straight to `overrideProvider`.
    expect(message).toMatch(/^`TestBed\.overrideProvider\(Cart, …\)` hands DI a hand-rolled double: its `useValue` hand-lists 1 member/);
    expect(message).toContain('Pass `provideAutoSpy(Cart)` as the override');
    expect(firstMessage('TestBed.overrideProvider(API_TOKEN, { useValue: { total: vi.fn() } });')).toContain(
      'Pass `provideAutoSpyForToken(API_TOKEN)` as the override',
    );
  });

  it('leaves an override that already hands over an auto-spy alone', () => {
    // The idiom one consumer settled on, 28 of its 61 override calls: the fix, not the problem.
    expect(lint('TestBed.overrideProvider(Cart, provideAutoSpy(Cart));')).toEqual([]);
    expect(lint('TestBed.overrideProvider(Cart, { useValue: createSpyFromClass(Cart) });')).toEqual([]);
    // Nothing to read: no descriptor, a descriptor that is a name, and an empty double.
    expect(lint('TestBed.overrideProvider(Cart);')).toEqual([]);
    expect(lint('TestBed.overrideProvider(Cart, descriptor);')).toEqual([]);
    expect(lint('TestBed.overrideProvider(ElementUtilsService, { useValue: {} });')).toEqual([]);
  });

  it('points at its own section of the rules page', () => {
    expect(firstMessage('const p = { provide: Cart, useValue: { total: vi.fn() } };')).toContain(
      'https://asdalexey.github.io/vitest-auto-spy/utilities/eslint-rules#prefer-provide-auto-spy',
    );
  });
});

it('reads a shorthand property that names a vi.fn() bound once, as the double it is', () => {
  const provider = '{ provide: NotificationsService, useValue: { open } }';

  expect(count(`const open = vi.fn();\nTestBed.configureTestingModule({ providers: [${provider}] });`)).toBe(1);
  expect(count(`let open;\nbeforeEach(() => { open = vi.fn(); });\nTestBed.configureTestingModule({ providers: [${provider}] });`)).toBe(1);
  expect(count(`let open = vi.fn();\nopen = vi.fn();\nTestBed.configureTestingModule({ providers: [${provider}] });`)).toBe(0);
  expect(count(`const open = () => 1;\nTestBed.configureTestingModule({ providers: [${provider}] });`)).toBe(0);
});
