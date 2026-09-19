/**
 * The four jasmine rules of `jasmine-rules.ts`, checked from both ends — the compatibility
 * layer's namespaces and globals, and the runner's own API they must not touch.
 */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { fixRule, runRule } from './run-rule';

/** Lint one snippet with a single rule of the plugin enabled, configured when options are given. */
function verify(code: string, rule: string, options?: object): LintMessage[] {
  return runRule(rule, code, { options });
}

/** The rule ids reported for a snippet. */
function lint(code: string, rule: string): string[] {
  return verify(code, rule).map((message) => message.ruleId ?? 'parse-error');
}

/** Lint one snippet with a rule configured — the options every ESLint config passes after the severity. */
function lintWith(code: string, rule: string, options: object): string[] {
  return verify(code, rule, options).map((message) => message.ruleId ?? 'parse-error');
}

/** The full message text of the first report. */
function firstMessage(code: string, rule: string): string {
  return verify(code, rule)[0]?.message ?? '';
}

/** Run the rule the way `eslint --fix` does, repeated passes and all. */
function autofix(code: string, rule: string): string {
  return fixRule(rule, code).output;
}

/** What the editor would offer for the first report. */
function suggestionsFor(code: string, rule: string): string[] {
  return (verify(code, rule)[0]?.suggestions ?? []).map((suggestion) => suggestion.desc);
}

/** The source as it would read after accepting the first report's first suggestion. */
function applySuggestion(code: string, rule: string): string {
  const suggestion = verify(code, rule)[0]?.suggestions?.[0];

  if (!suggestion) {
    return code;
  }

  const [start, end] = suggestion.fix.range;

  return `${code.slice(0, start)}${suggestion.fix.text}${code.slice(end)}`;
}

describe('jasmine-namespace-without-entry', () => {
  const RULE = 'jasmine-namespace-without-entry';

  /** The shape the rule exists for: a namespace on a spy this file built, and no entry anywhere. */
  const uninstalled = `
    const api = createSpyFromClass(Api);

    api.load.and.returnValue(1);
  `;

  it('reports a namespace used on a spy of this library that nothing equipped', () => {
    expect(lint(uninstalled, RULE)).toEqual([`vitest-auto-spy/${RULE}`]);
    expect(firstMessage(uninstalled, RULE)).toContain('vitest-auto-spy/jasmine');
    expect(firstMessage(uninstalled, RULE)).toContain('`.and.returnValue(x)` is `.mockReturnValue(x)`');
  });

  it.each([
    ['read as a whole', 'expect(api.load.mock.calls).toHaveLength(1);'],
    ['indexed', 'expect(api.load.mock.calls[0]).toEqual([1]);'],
    ['measured', 'expect(api.load.mock.calls.length).toBe(1);'],
    ['indexed twice, optionally', 'expect(api.load.mock.calls[0]?.[0]).toBe(1);'],
    ['on the spy rather than a method', 'expect(api.mock.calls[0]).toEqual([]);'],
  ])('leaves the runner’s own `mock.calls` alone — %s', (_label, statement) => {
    // The shape every Vitest suite that never heard of jasmine writes. It matched until 4.0.0: the
    // member is named `calls`, the `[0]` makes it read *through*, and the chain walks down to one of
    // this library's factories — all three conditions the rule had. Bare `mock.calls` passed and
    // `mock.calls[0]` was reported, a difference no message could explain, and at `warn` nobody
    // chased it. jasmine's shape is `spy.calls.…`; `.mock` is the runner's bookkeeping.
    expect(lint(`const api = createSpyFromClass(Api);\n${statement}`, RULE)).toEqual([]);
  });

  it('names the direct equivalent of each namespace', () => {
    expect(firstMessage('const api = injectSpy(Api);\napi.load.calls.count();', RULE)).toContain(
      '`.calls.count()` is `.mock.calls.length`',
    );
    expect(firstMessage('const api = injectSpy(Api);\napi.load.withArgs(1).and.returnValue(2);', RULE)).toContain(
      '`spy.calledWith(a).mockReturnValue(v)`',
    );
  });

  it.each([
    ['the jasmine entry itself', "import { createSpyFromClass } from 'vitest-auto-spy/jasmine';"],
    ['the alias package', "import { createSpyFromClass } from 'vitest-auto-spies/jasmine';"],
    ['a bare side-effect import of it', "import 'vitest-auto-spy/jasmine';"],
    // Neither runtime can load the jasmine entry — it pulls in Vitest — so both install the layer
    // from a setup file, which is the arrangement the docs prescribe rather than a mistake.
    ['a Bun entry, whose layer can only come from a setup file', "import { createSpyFromClass } from 'vitest-auto-spy/bun';"],
    ['a node:test entry, for the same reason', "import { createSpyFromClass } from 'vitest-auto-spy/node';"],
  ])('stays quiet in a file that imports %s', (_label, statement) => {
    expect(lint(`${statement}\n${uninstalled}`, RULE)).toEqual([]);
  });

  it('stays quiet when the file calls enableJasmineCompat itself, wherever the call sits', () => {
    expect(lint(`${uninstalled}\nenableJasmineCompat();`, RULE)).toEqual([]);
  });

  it('stops asking once one import has answered', () => {
    expect(lint(`import 'vitest-auto-spy/jasmine';\nimport { of } from 'rxjs';\n${uninstalled}`, RULE)).toEqual([]);
  });

  it('is not fooled by an import type, which the compiler erases', () => {
    // The exact shape it was written for: the type comes from the jasmine entry, the factory from
    // the core one, and nothing at all is installed at run time.
    expect(lint(`import type { Spy } from 'vitest-auto-spy/jasmine';\n${uninstalled}`, RULE)).toHaveLength(1);
  });

  it('takes a project-level setup module as the installation it cannot see', () => {
    const code = `import './test-setup';\n${uninstalled}`;

    expect(lint(code, RULE)).toHaveLength(1);
    expect(lintWith(code, RULE, { setupModules: ['./test-setup'] })).toEqual([]);
    // An import that installs nothing leaves the report where it was, whatever else the file loads.
    expect(lintWith(`import './other';\n${uninstalled}`, RULE, { setupModules: ['./test-setup'] })).toHaveLength(1);
  });

  it('follows a double assigned in a hook, not only one initialised where it is declared', () => {
    const inHook = `
      let api;

      beforeEach(() => {
        api = createSpyFromClass(Api);
      });

      it('loads', () => api.load.and.returnValue(1));
    `;

    expect(lint(inHook, RULE)).toHaveLength(1);
  });

  it('reads the namespace off the factory call itself', () => {
    expect(lint('createAutoMock().load.and.returnValue(1);', RULE)).toHaveLength(1);
  });

  it.each([
    ['the object is nobody’s spy', 'const plain = { and: { returnValue: () => 1 } };\nplain.and.returnValue(1);'],
    ['the receiver is the real instance DI holds', 'const api = TestBed.inject(Api);\napi.load.and.returnValue(1);'],
    ['the receiver is built by a factory this library does not ship', 'const api = buildDouble();\napi.load.and.returnValue(1);'],
    ['the receiver is `this`', 'this.api.load.and.returnValue(1);'],
    ['`calls` is a member of somebody else’s object', 'const report = buildReport();\nreport.calls.count();'],
    ['the namespace is read and not used', 'const api = injectSpy(Api);\nconst strategies = api.load.and;'],
    ['the namespace is the property of somebody else’s lookup', 'const api = injectSpy(Api);\nconst v = table[api.load.and];'],
    ['the key is computed, so it is not the name it spells', 'const api = injectSpy(Api);\napi.load[and].returnValue(1);'],
    ['`withArgs` is read without being called', 'const api = injectSpy(Api);\nconst w = api.load.withArgs;'],
    ['`withArgs` is passed rather than called', 'const api = injectSpy(Api);\nregister(api.load.withArgs);'],
    ['`withArgs` is somebody else’s method', 'query.withArgs(1);'],
  ])('leaves it alone when %s', (_label, code) => {
    expect(lint(code, RULE)).toEqual([]);
  });
});

describe('prefer-native-spy-api', () => {
  const RULE = 'prefer-native-spy-api';

  /** A spy this library built, so the rule may apply the edit rather than offer it. */
  const spy = 'const api = createSpyFromClass(Api);\n';

  it.each([
    ['a return value', 'api.load.and.returnValue(1);', 'api.load.mockReturnValue(1);'],
    ['a fake implementation', 'api.load.and.callFake(fake);', 'api.load.mockImplementation(fake);'],
    ['an observable helper, which only loses the namespace', 'api.load.and.nextWith(value);', 'api.load.nextWith(value);'],
    ['a promise helper, likewise', 'api.load.and.resolveWith(value);', 'api.load.resolveWith(value);'],
    ['the call count', 'expect(api.load.calls.count()).toBe(1);', 'expect(api.load.mock.calls.length).toBe(1);'],
    ['the arguments of one call', 'expect(api.load.calls.argsFor(0)).toEqual([1]);', 'expect(api.load.mock.calls[0]).toEqual([1]);'],
    ['a reset', 'api.load.calls.reset();', 'api.load.mockClear();'],
    ['an argument-scoped return value', 'api.load.withArgs(1, 2).and.returnValue(3);', 'api.load.calledWith(1, 2).mockReturnValue(3);'],
    ['an argument-scoped emission', 'api.load.withArgs(1).and.nextWith(v);', 'api.load.calledWith(1).nextWith(v);'],
  ])('rewrites %s', (_label, before, after) => {
    expect(lint(spy + before, RULE)).toHaveLength(1);
    expect(autofix(spy + before, RULE)).toBe(spy + after);
  });

  it('quotes both spellings in the message', () => {
    const message = firstMessage(`${spy}api.load.and.returnValue(1);`, RULE);

    expect(message).toContain('.and.returnValue(…)');
    expect(message).toContain('.mockReturnValue(…)');
  });

  it('offers the same edit as a suggestion when the receiver is not traceably a spy of this library', () => {
    const code = 'double.load.and.returnValue(1);';

    expect(lint(code, RULE)).toHaveLength(1);
    // Nothing is applied: `.calls` on somebody else's object is somebody else's method.
    expect(autofix(code, RULE)).toBe(code);
    expect(suggestionsFor(code, RULE)).toEqual(['Call the spy’s own API: .mockReturnValue(…)']);
    expect(applySuggestion(code, RULE)).toBe('double.load.mockReturnValue(1);');
  });

  it.each([
    ['a call that is not a `withArgs`', 'query.getBuilder().and.returnValue(1);'],
    ['a bare call in front of the namespace', 'makeDouble().and.returnValue(1);'],
  ])('still names the rewrite behind %s, without applying it', (_label, code) => {
    expect(lint(code, RULE)).toHaveLength(1);
    expect(autofix(code, RULE)).toBe(code);
  });

  it.each([
    ['a strategy with no single equivalent', 'api.load.and.callThrough();'],
    ['bookkeeping whose shape differs', 'expect(api.load.calls.mostRecent()).toEqual({});'],
    ['an `argsFor` with no index to write', 'api.load.calls.argsFor();'],
    ['a chain carrying an optional link, which the rewrite would drop', 'api.load?.and.returnValue(1);'],
    ['a namespace nobody calls', 'const strategies = api.load.and;'],
    ['a namespace read off somebody else’s lookup', 'const v = table[api.load.and];'],
    ['a computed member', 'api.load.and[key](1);'],
    ['a method that is passed rather than called', 'register(api.load.and.returnValue);'],
    ['a method that is only read', 'const set = api.load.and.returnValue;'],
    ['a bare factory call in front of a strategy with no equivalent', 'makeDouble().and.callThrough();'],
  ])('leaves %s alone', (_label, code) => {
    expect(lint(spy + code, RULE)).toEqual([]);
  });
});

describe('no-jasmine-globals', () => {
  const RULE = 'no-jasmine-globals';

  it.each([
    ['jasmine.createSpy', 'const s = jasmine.createSpy("load");', 'vi.fn()'],
    ['jasmine.any', 'expect(spy).toHaveBeenCalledWith(jasmine.any(String));', 'expect.any(Ctor)'],
    ['jasmine.anything', 'expect(spy).toHaveBeenCalledWith(jasmine.anything());', 'expect.anything()'],
    ['jasmine.objectContaining', 'expect(v).toEqual(jasmine.objectContaining({ a: 1 }));', 'expect.objectContaining'],
    ['jasmine.arrayContaining', 'expect(v).toEqual(jasmine.arrayContaining([1]));', 'expect.arrayContaining'],
    ['jasmine.stringMatching', 'expect(v).toEqual(jasmine.stringMatching(/a/));', 'expect.stringMatching'],
    ['jasmine.stringContaining', 'expect(v).toEqual(jasmine.stringContaining("a"));', 'expect.stringContaining'],
    ['jasmine.addMatchers', 'jasmine.addMatchers(matchers);', 'expect.extend'],
    ['jasmine.addCustomEqualityTester', 'jasmine.addCustomEqualityTester(tester);', 'expect.addEqualityTesters'],
    ['jasmine.DEFAULT_TIMEOUT_INTERVAL', 'jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;', 'testTimeout'],
    ['spyOnProperty', "spyOnProperty(obj, 'width', 'get');", 'mockReadonlyProp'],
    ['spyOnAllFunctions', 'spyOnAllFunctions(service);', 'createSpyFromClass(Class)'],
    ['fail', "fail('unreachable');", 'expect.fail(message)'],
    ['pending', 'pending();', 'ctx.skip()'],
  ])('flags %s and names its replacement', (_label, code, replacement) => {
    expect(lint(code, RULE)).toHaveLength(1);
    expect(firstMessage(code, RULE)).toContain(replacement);
  });

  it('flags createSpyObj and points at both landings', () => {
    const message = firstMessage("const s = jasmine.createSpyObj('api', ['load']);", RULE);

    expect(message).toContain('createSpyObj(baseName, methodNames)');
    expect(message).toContain('createAutoMock<T>()');
  });

  it('maps the whole clock, since one report has to cover four calls', () => {
    const message = firstMessage('jasmine.clock().install();', RULE);

    expect(message).toContain('vi.useFakeTimers()');
    expect(message).toContain('vi.advanceTimersByTime(n)');
    expect(message).toContain('mockSystemTime(date)');
  });

  it('says which way spyOn silently inverts, rather than only naming vi.spyOn', () => {
    const message = firstMessage("spyOn(service, 'load');", RULE);

    expect(message).toContain('jasmine’s `spyOn` stubs the method, `vi.spyOn` calls through');
    expect(message).toContain('mockImplementation(() => undefined)');
  });

  it('flags withContext, whose label moves into expect itself', () => {
    expect(firstMessage("expect(a).withContext('after reload').toBe(b);", RULE)).toContain('expect(value, message)');
  });

  it.each([
    // The compatibility layer exports the namespace as a value, and importing it is the documented
    // way to land a file green before the renames — so the import is the repair, not a violation.
    [
      'the namespace imported from the jasmine entry',
      "import { jasmine } from 'vitest-auto-spy/jasmine';\nexpect(v).toEqual(jasmine.any(String));",
    ],
    ['a `jasmine` the file declares itself', 'const jasmine = { any: () => 1 };\nexpect(v).toEqual(jasmine.any(String));'],
    ['a member of the namespace this rule has no advice about', 'jasmine.getEnv().allowRespy(true);'],
    ['a computed read off it', 'jasmine[key](String);'],
    ['a `spyOn` the file imported, which on Bun is the right one', "import { spyOn } from 'bun:test';\nspyOn(obj, 'm');"],
    ['a `fail` of somebody else’s', 'const fail = (m) => m;\nfail("boom");'],
    ['a `withContext` that is read and not called', 'const w = expect(a).withContext;'],
    ['a computed `withContext`', 'expect(a)[withContext]("m").toBe(b);'],
  ])('leaves %s alone', (_label, code) => {
    expect(lint(code, RULE)).toEqual([]);
  });
});

describe('no-save-arguments-by-value', () => {
  const RULE = 'no-save-arguments-by-value';

  it('reports the call and says that nothing will fail', () => {
    const code = 'api.load.calls.saveArgumentsByValue();';

    expect(lint(code, RULE)).toEqual([`vitest-auto-spy/${RULE}`]);
    expect(firstMessage(code, RULE)).toContain('no-op');
    expect(firstMessage(code, RULE)).toContain('captureArg<T>()');
  });

  it.each([
    ['another member of the same namespace', 'api.load.calls.reset();'],
    ['the namespace on its own', 'const calls = api.load.calls;'],
  ])('leaves %s alone', (_label, code) => {
    expect(lint(code, RULE)).toEqual([]);
  });
});
