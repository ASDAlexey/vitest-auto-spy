/** An injection that instantiates the testing module before an override runs, which is the order that fails. */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-inject-before-override';

/** Lint one snippet with only this rule enabled. */
function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

/** The rule ids reported for a snippet. */
function lint(code: string): string[] {
  return verify(code).map((message) => message.ruleId ?? 'parse-error');
}

/** The full message text of the first report, for the rules that must point at the README. */
function firstMessage(code: string): string {
  return verify(code)[0]?.message ?? '';
}

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

    expect(lint(broken)).toEqual(['vitest-auto-spy/no-inject-before-override']);
    expect(firstMessage(broken)).toContain('already been instantiated');
  });

  it('flags createComponent in the hook too — it instantiates just the same', () => {
    expect(lint(suite('fixture = TestBed.createComponent(PageComponent);', 'TestBed.overrideComponent(PageComponent, {});'))).toHaveLength(
      1,
    );
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

    expect(lint(viaHelper)).toHaveLength(1);
  });

  it('leaves the orders that actually work alone', () => {
    // Nothing overrides.
    expect(lint(suite('asSpy(TestBed.inject(Api)).load.mockReturnValue(of(page));', 'expect(1).toBe(1);'))).toEqual([]);
    // The override is in the same hook, ahead of the injection.
    expect(lint(suite('TestBed.overrideProvider(Other, { useValue: x });\n    TestBed.inject(Api);', 'expect(1).toBe(1);'))).toEqual([]);
    // Injected inside the test rather than the hook, which is the fix the message names.
    expect(lint(suite('noop();', 'TestBed.overrideProvider(Other, {});\n    injectSpy(Api);'))).toEqual([]);
    // A suite that resets the module has already thought about this.
    expect(lint(suite('TestBed.inject(Api);', 'TestBed.resetTestingModule();\n    TestBed.overrideProvider(Other, {});'))).toEqual([]);
    // Two suites, only one of which overrides.
    const separate = [
      "describe('a', () => { beforeEach(() => { TestBed.inject(Api); }); });",
      "describe('b', () => { it('x', () => TestBed.overrideProvider(Other, {})); });",
    ].join('\n');

    expect(lint(separate)).toEqual([]);
  });

  /**
   * The spelling the rest of this plugin asks for. `injectSpy(X)` **is** `TestBed.inject(X)` and
   * `renderShallow` ends in `TestBed.createComponent`, so a rule that read only the `TestBed.` forms
   * stayed silent on precisely the file the other rules had just rewritten — found by hand in a
   * migrated suite, as `Cannot override component when the test module has already been
   * instantiated` with no lint report anywhere near it.
   */
  it("flags this package's own helpers, which instantiate the module just as `TestBed.` does", () => {
    expect(lint(suite('api = injectSpy(Api);', 'TestBed.overrideComponent(PageComponent, {});'))).toEqual([
      'vitest-auto-spy/no-inject-before-override',
    ]);
    expect(lint(suite('host = renderShallow(PageComponent);', 'TestBed.overrideProvider(Other, {});'))).toHaveLength(1);
    expect(lint(suite('TestBed.runInInjectionContext(() => inject(Api));', 'TestBed.overrideProvider(Other, {});'))).toHaveLength(1);
  });

  it('flags the override written after the injection in one hook, which is the order that fails', () => {
    // The shape the report came in on: both lines in the same `beforeEach`, the override second.
    const hook = 'const api = injectSpy(Api);\n    TestBed.overrideComponent(PageComponent, {});';

    expect(lint(suite(hook, 'expect(1).toBe(1);'))).toHaveLength(1);
  });

  it('reads an injection written outside any suite, and any call that merely looks like one', () => {
    expect(lint('TestBed.inject(Api);\nTestBed.overrideProvider(Other, {});')).toEqual([]);
    // A member call of the same name is somebody else's API — `vitest-auto-spy/nestjs` aside, which
    // reaches no TestBed and therefore no `TestBed.override*` either.
    expect(lint(suite('api = moduleRef.injectSpy(Api);', 'TestBed.overrideProvider(Other, {});'))).toEqual([]);
    expect(lint("beforeEach(() => { TestBed.inject(Api); });\nit('x', () => bed.overrideProvider(Other, {}));")).toEqual([]);
    expect(lint("beforeEach(() => { TestBed.inject(Api); });\nit('x', () => TestBed.compileComponents());")).toEqual([]);
  });
});
