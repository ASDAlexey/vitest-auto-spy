/**
 * The count-based rule: an object of `vi.fn()`s where a class or a type should be read instead.
 * Both sides are checked — the shapes it flags, and every call that merely resembles a runner mock.
 */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'prefer-create-spy-from-class';

/** Lint one snippet with only this rule enabled, configured when options are given. */
function verify(code: string, options?: object): LintMessage[] {
  return runRule(RULE, code, { options });
}

/** The rule ids reported for a snippet. */
function lint(code: string): string[] {
  return verify(code).map((message) => message.ruleId ?? 'parse-error');
}

/** Lint one snippet with a rule configured — the options every ESLint config passes after the severity. */
function lintWith(code: string, options: object): string[] {
  return verify(code, options).map((message) => message.ruleId ?? 'parse-error');
}

/** The full message text of the first report, for the rules that must point at the README. */
function firstMessage(code: string): string {
  return verify(code)[0]?.message ?? '';
}

describe('prefer-create-spy-from-class', () => {
  it('flags an object literal built from several vi.fn()s', () => {
    expect(lint('const cart = { total: vi.fn(), clear: vi.fn() };')).toHaveLength(1);
  });

  it('takes the threshold from the options when a suite wants a stricter reading', () => {
    const single = 'const nav = { go: vi.fn() };';

    expect(lint(single)).toEqual([]);
    expect(lintWith(single, { minRunnerFns: 1 })).toHaveLength(1);
  });

  it('names the threshold, so the asymmetry between two neighbouring lines is readable', () => {
    expect(firstMessage('const p = { a: vi.fn(), b: vi.fn() };')).toContain('two or more');
    expect(firstMessage('const p = { a: vi.fn(), b: vi.fn() };')).toContain('minRunnerFns');
  });

  it('leaves the overrides bag of a built-in double alone — there is no class behind it to read', () => {
    const calls = [
      'provideWindowDouble(WINDOW, { history: { back: vi.fn() }, addEventListener: vi.fn(), removeEventListener: vi.fn() });',
      'provideDocumentDouble({ addEventListener: vi.fn(), removeEventListener: vi.fn() });',
      "provideRouterDouble({ url: '/', currentNavigation: { abort: vi.fn(), removeAbortListener: vi.fn() } });",
      'createWindowDouble({ scrollTo: vi.fn(), matchMedia: vi.fn() });',
    ];

    for (const call of calls) {
      expect(lint(call)).toEqual([]);
    }
  });

  it('leaves a stub seed alone — the class is the first argument, so the repair it names is not one', () => {
    const calls = [
      'const ChartStub = createComponentStub(ChartComponent, { redraw: vi.fn(), reset: vi.fn() });',
      "const Host = createDirectiveHost({ template: '<div appTruncate></div>', props: { onDone: vi.fn(), onFail: vi.fn() } });",
    ];

    for (const call of calls) {
      expect(lint(call)).toEqual([]);
    }
  });

  it('leaves a vi.mock factory alone — its exports are DI tokens, not a service double', () => {
    expect(lint("vi.mock('@acme/ui', () => ({ DialogRef: vi.fn(), ToastService: vi.fn() }));")).toEqual([]);
    expect(lint("vi.doMock('x', () => ({ A: vi.fn(), B: vi.fn() }));")).toEqual([]);
    expect(lint("register('x', () => ({ A: vi.fn(), B: vi.fn() }));")).toHaveLength(1);
  });

  it('counts a configured spy as a spy — the tuned double is the one that drifted furthest', () => {
    // Reported from four migration batches on four files: in one `providers` array the bare-`vi.fn()`
    // double was flagged and the `.mockReturnValue` one on the next line was not.
    expect(
      lint('const p = { getProducts: vi.fn().mockReturnValue(of([])), getProductById: vi.fn().mockReturnValue(of(null)) };'),
    ).toHaveLength(1);
    expect(lint('const p = { a: vi.fn(), b: vi.fn().mockResolvedValue(1) };')).toHaveLength(1);
    // However long the chain gets.
    expect(lint("const p = { a: vi.fn().mockReturnValue(1).mockName('a'), b: jest.fn().mockReturnThis() };")).toHaveLength(1);
  });

  it('leaves every call that merely resembles a runner mock alone', () => {
    expect(lint('const p = { a: fn(), b: fn() };')).toEqual([]);
    expect(lint('const p = { a: helpers.mocks.fn(), b: helpers.mocks.fn() };')).toEqual([]);
    expect(lint("const p = { a: vi['fn'](), b: vi['fn']() };")).toEqual([]);
    expect(lint('const p = { a: other.fn(), b: other.fn() };')).toEqual([]);
    expect(lint("const p = { a: vi.spyOn(x, 'y'), b: vi.spyOn(x, 'z') };")).toEqual([]);
    expect(lint('const p = { a: cart, b: cart };')).toEqual([]);
  });

  it('leaves the seed of one of this library’s own factories alone — that is the fix, not the problem', () => {
    expect(lint('const xhr = createAutoMock<XhrLike>({ send: vi.fn(), abort: vi.fn() });')).toEqual([]);
    expect(lint('const api = mockDeep<Api>({ api: { load: vi.fn(), save: vi.fn() } });')).toEqual([]);
    expect(lint('const p = provideAutoSpy(Cart, { methodsToSpyOn: [], extra: { a: vi.fn(), b: vi.fn() } });')).toEqual([]);
  });

  it('still flags an object of spies handed to anything else', () => {
    expect(lint('const cart = wrap({ total: vi.fn(), clear: vi.fn() });')).toHaveLength(1);
    expect(lint('const cart = helpers.createAutoMock({ total: vi.fn(), clear: vi.fn() });')).toHaveLength(1);
  });

  it('leaves a single stub, a spread and a provider useValue alone', () => {
    expect(lint('const cart = { total: vi.fn() };')).toEqual([]);
    expect(lint('const cart = { ...base, total: vi.fn() };')).toEqual([]);
    expect(lint('const p = { provide: Cart, useValue: { total: vi.fn(), clear: vi.fn() } };')).toEqual([]);
  });
});
