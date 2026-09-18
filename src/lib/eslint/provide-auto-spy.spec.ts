/**
 * The long-form arm of `prefer-provide-auto-spy`: the provider that spells the factory out.
 *
 * Both halves are checked here, because the fix is the point of the arm. What it reports comes from
 * a suite of 1771 spec files — 91 exact providers in 49 files, and the 51 in 41 files that build the
 * double from a *different* class, which is the shape that has to stay silent. What it rewrites is
 * checked character for character: the replacement is the factory's own body, so anything the fix
 * invents is a change of meaning rather than a shortening.
 */
import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';

const RULE = 'prefer-provide-auto-spy';

const linter = new Linter({ configType: 'flat' });

const config = [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsParser },
    plugins: { 'vitest-auto-spy': plugin },
    rules: { [`vitest-auto-spy/${RULE}`]: 'error' },
  },
];

/** Every report the rule draws for a snippet. */
function verify(code: string): LintMessage[] {
  return linter.verify(code, config, 'component.spec.ts');
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
  return linter.verifyAndFix(code, config, 'component.spec.ts').output;
}

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
    expect(message('const p = { provide: Cart, useValue: { total: vi.fn() } };')).toContain('hand-rolls a service mock');
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
