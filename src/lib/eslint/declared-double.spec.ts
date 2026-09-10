/**
 * `no-structural-double`, checked from both ends — and the ends are the whole point of the rule.
 *
 * Both sides are transcribed from a monorepo of 1759 spec files that types its doubles as Vitest's
 * `Mock` 290 times. 120 of those are the member of an object type annotating a variable, and every
 * single one of the 120 is assigned an object literal of `vi.fn()`s — a service double written by
 * hand. 109 are a bare `let fn: Mock` holding a plain `vi.fn()` callback, which is `Mock`'s correct
 * use and must never be reported; the rest are `as Mock` casts of a function that already exists.
 * So the silent cases below are not defensive padding: they are the majority of the occurrences,
 * and getting them wrong would have made the rule unusable on the suite it was written for.
 */
import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';

const RULE = 'no-structural-double';

const linter = new Linter({ configType: 'flat' });

/** Lint one snippet with only this rule enabled, configured when options are given. */
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

/** How many reports a snippet draws — the only number most of these cases are about. */
function count(code: string, options?: object): number {
  return verify(code, RULE, options).length;
}

/** The lines reported, for the cases about *which* object of several is named. */
function lines(code: string): number[] {
  return verify(code, RULE).map((report) => report.line);
}

/** The first message, for the cases about what it has to say. */
function message(code: string): string {
  return verify(code, RULE)[0]?.message ?? '';
}

describe('no-structural-double', () => {
  it('flags the shape it exists for — a declared stand-in filled in a beforeEach', () => {
    // Verbatim from `dev-mode.guard.spec.ts`, and the shape all 120 of that suite's occurrences take.
    const shape = [
      'let devModeService: { devMode: Mock };',
      'beforeEach(() => {',
      '  devModeService = { devMode: vi.fn().mockReturnValue(true) };',
      '});',
    ].join('\n');

    expect(lines(shape)).toEqual([3]);
  });

  it('flags it written in one line as well', () => {
    expect(count('const svc: { load: Mock } = { load: vi.fn() };')).toBe(1);
  });

  it('leaves a bare `let fn: Mock` alone — that is a vi.fn() callback, correctly typed', () => {
    // 109 of that suite's 290 `Mock` references are this, and reporting them would be wrong: `Mock`
    // is the type of a `vi.fn()`, and its type parameter is constrained to a procedure, so it cannot
    // name a class in the first place.
    expect(count('let announce: Mock;\nbeforeEach(() => {\n  announce = vi.fn();\n});')).toBe(0);
    expect(count('let inner: Mock<typeof fetch>;\nbeforeEach(() => {\n  inner = vi.fn();\n});')).toBe(0);
  });

  it('leaves an unannotated object alone, whatever it holds', () => {
    // Which is the threshold `prefer-create-spy-from-class` keeps for exactly this reason: an object
    // with one `vi.fn()` and nothing declaring it is indistinguishable from an options bag.
    expect(count('const opts = { onDone: vi.fn() };')).toBe(0);
    expect(count('let opts;\nbeforeEach(() => {\n  opts = { onDone: vi.fn() };\n});')).toBe(0);
  });

  it('leaves an object of plain values alone even when its declaration mentions Mock', () => {
    expect(count('let svc: { load: Mock; url: string };\nbeforeEach(() => {\n  svc = { url: "/" };\n});')).toBe(0);
  });

  it('reads past the members of a declaration that are not a named mock type', () => {
    // A member the walk has to step over before it reaches the mock: a plain type, a member with no
    // annotation at all, a method signature and an index signature are each a different node.
    expect(count('let svc: { url: string; load: Mock };\nbeforeEach(() => {\n  svc = { load: vi.fn() };\n});')).toBe(1);
    expect(count('let svc: { url; load: Mock };\nbeforeEach(() => {\n  svc = { load: vi.fn() };\n});')).toBe(1);
    expect(count('let svc: { ping(): void; load: Mock };\nbeforeEach(() => {\n  svc = { load: vi.fn() };\n});')).toBe(1);
    expect(count('let svc: { [key: string]: unknown };\nbeforeEach(() => {\n  svc = { load: vi.fn() };\n});')).toBe(0);
  });

  it('leaves a target that is not a plain name alone', () => {
    // `state.svc = { … }` assigns into something this cannot follow to a declaration, so there is no
    // annotation to read and the threshold stays where it was.
    expect(count('const state = { svc: undefined };\nbeforeEach(() => {\n  state.svc = { load: vi.fn() };\n});')).toBe(0);
    expect(count('const [svc]: [{ load: Mock }] = [{ load: vi.fn() }];')).toBe(0);
  });

  it('leaves a name that is not declared by a `let` or `const` alone', () => {
    // A parameter and a destructured binding are both names with no declarator carrying a `: T`,
    // which is the honest answer: there is no annotation in the file to read.
    expect(count('function setUp(svc) {\n  svc = { load: vi.fn() };\n}')).toBe(0);
    expect(count('let { svc } = holder;\nbeforeEach(() => {\n  svc = { load: vi.fn() };\n});')).toBe(0);
  });

  it('keeps quiet at the count where prefer-create-spy-from-class already speaks', () => {
    // One double, one report: at two `vi.fn()`s that rule reports at `error` and this one stops.
    const two = 'let svc: { a: Mock; b: Mock };\nbeforeEach(() => {\n  svc = { a: vi.fn(), b: vi.fn() };\n});';

    expect(count(two)).toBe(0);
    expect(verify(two, 'prefer-create-spy-from-class')).toHaveLength(1);
    // And the two rules move together when a project moves the threshold.
    expect(count(two, { minRunnerFns: 3 })).toBe(1);
  });

  it('reads every mock type Vitest exports, not only Mock', () => {
    expect(count('let svc: { load: MockInstance };\nbeforeEach(() => {\n  svc = { load: vi.fn() };\n});')).toBe(1);
    expect(count('let svc: { load: MockedFunction<() => void> };\nbeforeEach(() => {\n  svc = { load: vi.fn() };\n});')).toBe(1);
    expect(count('let svc: { load: Spy };\nbeforeEach(() => {\n  svc = { load: vi.fn() };\n});')).toBe(0);
  });

  it('does not follow a declaration through a wrapper or an intersection', () => {
    // `Mocked<{ a: Mock }>` is `no-mocked-for-spy`'s report, and an intersection carrying real
    // fields alongside the mocks is the one shape where the object genuinely is part configuration.
    expect(count('let svc: Mocked<{ load: Mock }>;\nbeforeEach(() => {\n  svc = { load: vi.fn() };\n});')).toBe(0);
    expect(count('let svc: { load: Mock } & { url: string };\nbeforeEach(() => {\n  svc = { load: vi.fn() };\n});')).toBe(0);
  });

  it('does not follow a declaration written as an interface or a type alias', () => {
    // Those describe a shape with no value in view, so there is no creation site to point at — and
    // the repair a report would ask for cannot be read off the file.
    const named = [
      'interface StrategyLike { handleAction: Mock }',
      'let strategy: StrategyLike;',
      'beforeEach(() => {',
      '  strategy = { handleAction: vi.fn() };',
      '});',
    ].join('\n');

    expect(count(named)).toBe(0);
  });

  it('leaves a provider’s useValue to prefer-provide-auto-spy', () => {
    const provided = 'let svc: { load: Mock };\nconst p = { provide: Card, useValue: { load: vi.fn() } };';

    expect(count(provided)).toBe(0);
    expect(verify(provided, 'prefer-provide-auto-spy')).toHaveLength(1);
  });

  it('leaves a double DI is handed by name to prefer-provide-auto-spy as well', () => {
    // This is where most of them are: of the 115 reports this rule made on the consumer it was
    // measured against, 110 turned out to be handed to Angular DI one name away — a `provide:`
    // beside them, and `provideAutoSpy(X)` rather than `createAutoMock<T>()` as the answer. The
    // rule's own anchor is "a service *without* DI", so carving those out is what it says it does.
    const byName = [
      "describe('card', () => {",
      '  let svc: { load: Mock };',
      '  beforeEach(() => {',
      '    svc = { load: vi.fn() };',
      '    TestBed.configureTestingModule({ providers: [{ provide: Card, useValue: svc }] });',
      '  });',
      '});',
    ].join('\n');

    expect(count(byName)).toBe(0);
    expect(verify(byName, 'prefer-provide-auto-spy')).toHaveLength(1);

    // A name nothing provides is still this rule's.
    const unprovided = [
      "describe('card', () => {",
      '  let svc: { load: Mock };',
      '  beforeEach(() => {',
      '    svc = { load: vi.fn() };',
      '  });',
      '});',
    ].join('\n');

    expect(count(unprovided)).toBe(1);
  });

  it('reads a destructured binding as no name at all', () => {
    // `boundName` answers for a plain identifier; a pattern is not one, and following it would mean
    // deciding which of its keys the provider was handed.
    expect(count('const { load } = { load: vi.fn() };')).toBe(0);
  });

  it('leaves a factory seed and a module mock alone', () => {
    expect(count('const svc: { load: Mock } = createAutoMock<Card>({ load: vi.fn() });')).toBe(0);
    expect(count("vi.mock('./card', () => ({ load: vi.fn() }));")).toBe(0);
  });

  it('names both the declaration and the replacement in the message', () => {
    const text = message('const svc: { load: Mock } = { load: vi.fn() };');

    expect(text).toContain('createAutoMock<T>()');
    expect(text).toContain('provideAutoSpy(X)');
    expect(text).toContain('#how-to-mock');
  });

  it('reports every declared stand-in of a file, not the first', () => {
    const two = [
      'let a: { x: Mock };',
      'let b: { y: Mock };',
      'beforeEach(() => {',
      '  a = { x: vi.fn() };',
      '  b = { y: vi.fn() };',
      '});',
    ].join('\n');

    expect(lines(two)).toEqual([4, 5]);
  });
});
