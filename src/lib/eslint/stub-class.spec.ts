/**
 * `no-stub-class-double` and the `useClass:` arm of `prefer-provide-auto-spy`, checked from both ends.
 *
 * The flagged shapes are transcribed from a monorepo of 1759 spec files, where 46 classes across 32
 * files held 112 `vi.fn()` fields and not one of them was reported by any rule of `recommended` —
 * a suite with no `eslint-disable` anywhere, so the blind spot was the only thing keeping it green.
 * The silent ones come from the same search, and they are what the design is really about: every
 * class in that suite that holds a `vi.fn()` field and is *not* a service double is here, because
 * that is the number a rule this broad is judged on — a decorated test host whose `vi.fn()`s are
 * event handlers, a `TestCtrl extends ControlBaseComponent`, four stubs with an `implements` clause
 * the compiler already holds to the type, and a class expression in a property slot standing in for
 * a module export.
 */
import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';

const RULE = 'no-stub-class-double';
const PROVIDER_RULE = 'prefer-provide-auto-spy';

const linter = new Linter({ configType: 'flat' });

/** Lint one snippet with a single rule of the plugin enabled, configured when options are given. */
function verify(code: string, rule: string, options?: object): LintMessage[] {
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'vitest-auto-spy': plugin },
        rules: { [`vitest-auto-spy/${rule}`]: options ? ['error', options] : 'error' },
      },
    ],
    'component.spec.ts',
  );
}

/** How many reports this rule draws — the only number most of these cases are about. */
function count(code: string, options?: object): number {
  return verify(code, RULE, options).length;
}

/** The lines reported, for the cases about *which* class of several is named. */
function lines(code: string): number[] {
  return verify(code, RULE).map((report) => report.line);
}

/** How many reports the provider rule draws for the same snippet. */
function providerCount(code: string): number {
  return verify(code, PROVIDER_RULE).length;
}

/** The provider rule's first message, for the cases about which of its three wordings arrives. */
function providerMessage(code: string): string {
  return verify(code, PROVIDER_RULE)[0]?.message ?? '';
}

/** The shape the whole thing exists for, verbatim from the suite it was measured on. */
const STUB = ['class NewCardServiceMock {', '  getTrailerPlayUrl = vi.fn().mockReturnValue(of(url));', '  load = vi.fn();', '}'].join('\n');

describe('no-stub-class-double', () => {
  it('flags a class whose fields are vi.fn()s', () => {
    expect(lines(`${STUB}\nconst mock = new NewCardServiceMock();`)).toEqual([1]);
  });

  it('flags it at a single field, which is where the object-literal rule stops', () => {
    // 28 of the 46 classes in that suite have exactly one, and after the four exemptions every one
    // of them is a service double — `MockHttpClient`, `MockDomainEventsService`, `RouterMock`.
    expect(count('class MockHttpClient {\n  get = vi.fn();\n}\nconst http = new MockHttpClient();')).toBe(1);
  });

  it('counts a configured mock and a static field, and ignores what has no value to read', () => {
    expect(count('class M {\n  a = vi.fn().mockReturnValue(1).mockName("a");\n}\nconst m = new M();')).toBe(1);
    expect(count('class M {\n  static shared = vi.fn();\n}\nconst m = new M();')).toBe(1);
    expect(count('class M {\n  declare a: () => void;\n  b?: () => void;\n}\nconst m = new M();')).toBe(0);
    expect(count('class M {\n  ["computed"] = vi.fn();\n}\nconst m = new M();')).toBe(0);
    expect(count('class M {\n  a = () => vi.fn();\n  m() { return vi.fn(); }\n}\nconst m = new M();')).toBe(0);
  });

  it('reports the class name, and the class itself when it has none', () => {
    // The keyword and the name are split across two lines on purpose, so the reported line says
    // which node was chosen: a named class expression is reported at its own name, and
    // `class { … }`, which has no `id` at all, is reported at the keyword rather than going missing.
    expect(lines('const M = class\n  Named {\n  a = vi.fn();\n};')).toEqual([2]);
    expect(lines('const M = class\n  {\n  a = vi.fn();\n};')).toEqual([1]);
  });

  it('leaves a decorated class alone — a test host, whose vi.fn() fields are event handlers', () => {
    expect(count("@Component({ template: '' })\nclass HostComponent {\n  onVis = vi.fn();\n  onEnd = vi.fn();\n}")).toBe(0);
  });

  it('leaves a class the compiler already holds to a type alone', () => {
    // `implements` cannot drift: add a member to the type and the stub stops compiling, which is
    // exactly the failure the report would be claiming. Four of that suite's stubs are this shape.
    expect(count('class ProviderMock implements MenuItemProvider {\n  scroll = vi.fn();\n}\nconst p = new ProviderMock();')).toBe(0);
  });

  it('leaves a class that extends something alone', () => {
    expect(count('class TestCtrl extends ControlBaseComponent {\n  spy = vi.fn();\n}\nconst c = new TestCtrl();')).toBe(0);
  });

  it('leaves a class expression in a property slot alone — that one replaces a module export', () => {
    // Verbatim from `context-menu.service.spec.ts`, and the one false positive the first draft had:
    // the object is a `const` the factory only names, so `insideModuleMock` never sees the class.
    const moduleShape = [
      'const contextMenuModule = {',
      '  KdsWebContextMenuComponent: class MockContextMenu { open = vi.fn(); },',
      '};',
      "vi.mock('@kion/kds-web', () => contextMenuModule);",
    ].join('\n');

    expect(count(moduleShape)).toBe(0);
    expect(count("vi.mock('@kion/kds-web', () => ({ C: class Inline { open = vi.fn(); } }));")).toBe(0);
  });

  it('leaves a class inside one of this library’s own factory seeds alone', () => {
    expect(count('const spy = createAutoMock<Api>({ Ctor: class M { a = vi.fn(); } });')).toBe(0);
  });

  it('takes a higher field count when a project asks for one', () => {
    const single = 'class M {\n  a = vi.fn();\n}\nconst m = new M();';

    expect(count(single, { minRunnerFns: 2 })).toBe(0);
    expect(count(`${STUB}\nconst m = new NewCardServiceMock();`, { minRunnerFns: 2 })).toBe(1);
  });

  it('stands down on a class the same file hands to DI, which is the provider rule’s report', () => {
    const provided = `${STUB}\nconst p = { provide: NewCardService, useClass: NewCardServiceMock };`;

    expect(count(provided)).toBe(0);
    expect(providerCount(provided)).toBe(1);
  });

  it('does not stand down where the provider rule stays silent', () => {
    // A `multi: true` registration has no `provideAutoSpy` form, so that rule says nothing about it
    // — standing down there would leave the class reported by nobody.
    const multi = `${STUB}\nconst p = { provide: HOOKS, useClass: NewCardServiceMock, multi: true };`;

    expect(providerCount(multi)).toBe(0);
    expect(count(multi)).toBe(1);
    // And an object with a `useClass` but no `provide` is not a provider at all.
    expect(count(`${STUB}\nconst p = { useClass: NewCardServiceMock };`)).toBe(1);
  });

  it('stands down on a class handed over as a hand-built instance too', () => {
    const provided = `${STUB}\nconst p = { provide: NewCardService, useValue: new NewCardServiceMock() };`;

    expect(count(provided)).toBe(0);
    expect(providerCount(provided)).toBe(1);
  });

  it('stands down on a class handed over through useExisting, and on one an override hands over', () => {
    // `useExisting` aliases the token rather than constructing the stub per injector; the repair is
    // the same and belongs in the provider rule's message, which is the one that knows DI is
    // involved. Two of one consumer's stubs enter DI this way.
    const existing = `${STUB}\nconst p = { provide: NewCardService, useExisting: NewCardServiceMock };`;

    expect(count(existing)).toBe(0);
    expect(providerCount(existing)).toBe(1);

    // `TestBed.overrideProvider` is the same substitution with the token in argument 0.
    const overridden = `${STUB}\nTestBed.overrideProvider(NewCardService, { useClass: NewCardServiceMock });`;

    expect(count(overridden)).toBe(0);
    expect(providerCount(overridden)).toBe(1);

    // An override that hands over something this cannot read leaves the class to this rule.
    expect(count(`${STUB}\nTestBed.overrideProvider(NewCardService, descriptor);`)).toBe(1);
  });

  it('does not stand down on a registration that hands over something else', () => {
    expect(count(`${STUB}\nconst p = { provide: NewCardService, useValue: someObject };`)).toBe(1);
    expect(count(`${STUB}\nconst p = { provide: NewCardService, useFactory: () => new NewCardServiceMock() };`)).toBe(1);
  });

  it('reports every stub class of a file, not the first', () => {
    const two = 'class A {\n  a = vi.fn();\n}\nclass B {\n  b = vi.fn();\n}\nconst x = [new A(), new B()];';

    expect(lines(two)).toEqual([1, 4]);
  });
});

describe('prefer-provide-auto-spy — the stub-class arm', () => {
  it('flags a useClass naming a stub class the file declares', () => {
    expect(providerCount(`${STUB}\nconst p = { provide: NewCardService, useClass: NewCardServiceMock };`)).toBe(1);
  });

  it('flags it through a quoted key too', () => {
    expect(providerCount(`${STUB}\nconst p = { 'provide': NewCardService, 'useClass': NewCardServiceMock };`)).toBe(1);
  });

  it('flags a stub class instantiated by hand in a useValue', () => {
    // The object reading cannot see this one: `providedDouble` answers for an `ObjectExpression`,
    // and a `new` expression is not one.
    expect(providerCount(`${STUB}\nconst p = { provide: NewCardService, useValue: new NewCardServiceMock() };`)).toBe(1);
  });

  it('names the stub class in the message, not the useValue object', () => {
    const message = providerMessage(`${STUB}\nconst p = { provide: NewCardService, useClass: NewCardServiceMock };`);

    expect(message).toContain('stub class');
    expect(message).toContain('provideAutoSpy(Class)');
  });

  it('follows a `const X = class` as well as a declaration', () => {
    expect(providerCount('const M = class { a = vi.fn(); };\nconst p = { provide: X, useClass: M };')).toBe(1);
  });

  it('leaves a useClass naming a real class alone', () => {
    expect(providerCount('class RealCache { get() { return 1; } }\nconst p = { provide: Cache, useClass: RealCache };')).toBe(0);
    expect(providerCount('const p = { provide: LocalStorage, useClass: BrowserLocalStorage };')).toBe(0);
  });

  it('leaves a stub class it cannot see the declaration of alone', () => {
    // A shared `*.mock.ts` is out of reach, and nothing in the linted file says what its fields are.
    expect(providerCount("import { CardMock } from './card.mock';\nconst p = { provide: Card, useClass: CardMock };")).toBe(0);
    // Nor is a class reached through a namespace a name this can resolve.
    expect(providerCount(`${STUB}\nconst p = { provide: Card, useClass: mocks.NewCardServiceMock };`)).toBe(0);
  });

  it('leaves a hand-built instance of something that is not a stub class alone', () => {
    expect(providerCount('class RealClock { now() { return 0; } }\nconst p = { provide: Clock, useValue: new RealClock() };')).toBe(0);
    expect(providerCount('const p = { provide: NOW, useValue: new Date(0) };')).toBe(0);
  });

  it('leaves the exempt shapes alone here too, and a multi registration', () => {
    expect(providerCount('class M implements Api { a = vi.fn(); }\nconst p = { provide: Api, useClass: M };')).toBe(0);
    expect(providerCount(`${STUB}\nconst p = { provide: HOOKS, useClass: NewCardServiceMock, multi: true };`)).toBe(0);
    expect(providerCount(`${STUB}\nconst p = { useClass: NewCardServiceMock };`)).toBe(0);
  });

  it('still reports the two shapes it reported before', () => {
    expect(providerCount('const p = { provide: Cart, useValue: { total: vi.fn() } };')).toBe(1);
    expect(providerCount('const p = { provide: Cart, useFactory: () => ({ total: vi.fn() }) };')).toBe(1);
  });
});
