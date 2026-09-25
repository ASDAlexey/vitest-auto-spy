/**
 * The count-based rule: an object of `vi.fn()`s where a class or a type should be read instead.
 * Both sides are checked — the shapes it flags, and every call that merely resembles a runner mock.
 */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'prefer-create-spy-from-class';
const REPORTED = [`vitest-auto-spy/${RULE}`];

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

  it('names the double, its mocks and the factory for its declared type', () => {
    expect(firstMessage('const p = { a: vi.fn(), b: vi.fn() };')).toMatch(
      /^`p` holds 2 `vi\.fn\(\)`s \(`a` and `b`\)[\s\S]*`createSpyFromClass\(Class\)` or `createAutoMock<T>\(\)`/,
    );
    expect(firstMessage('const p: Api = { a: vi.fn(), b: vi.fn() };')).toMatch(/^`p` holds[\s\S]*Build it with `createAutoMock<Api>\(\)`/);
    expect(firstMessage('use({ a: vi.fn(), b: vi.fn(), c: vi.fn(), d: vi.fn() });')).toMatch(
      /^This object holds 4 `vi\.fn\(\)`s \(`a`, `b`, `c` and 1 more\)/,
    );
  });

  it('counts the mocks it found under any threshold, and never advises lowering it', () => {
    const [atThree] = verify('const p = { a: vi.fn(), b: vi.fn(), c: vi.fn() };', { minRunnerFns: 3 });
    const [atOne] = verify('const p = { a: vi.fn(), b: 1 };', { minRunnerFns: 1 });

    expect(atThree?.message).toContain('holds 3 `vi.fn()`s');
    expect(atOne?.message).toContain('holds 1 `vi.fn()`');
    expect(atOne?.message).not.toContain('minRunnerFns');
  });

  it('points a data object with one callback field at createMock<T>, which keeps its values', () => {
    const [data] = verify('const item = { index: 0, label: "Land", click: vi.fn() };', { minRunnerFns: 1 });
    const [double] = verify('const nav = { go: vi.fn(), back: vi.fn() };', { minRunnerFns: 1 });

    expect(data?.message).toContain('`createMock<T>({ …, click: vi.fn() })`');
    expect(double?.message).not.toContain('data object');
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

  it('leaves an options bag handed straight to a call alone — one callback among values is not a double', () => {
    const one = { minRunnerFns: 1 };

    expect(lintWith('service.openDialog({ elRef, options, onColorChange: vi.fn() });', one)).toEqual([]);
    expect(lintWith('new Picker({ value: 1, onPick: vi.fn() });', one)).toEqual([]);
    // Two mocks, no values, not an argument, or a function value: each still reads as a double.
    expect(lintWith('service.open({ size: 1, load: vi.fn(), save: vi.fn() });', one)).toHaveLength(1);
    expect(lintWith('service.open({ onPick: vi.fn(), format: () => "" });', one)).toHaveLength(1);
    expect(lintWith('const bag = { value: 1, onPick: vi.fn() };', one)).toHaveLength(1);
    expect(lintWith('run(x, { ...rest, onPick: vi.fn() });', one)).toHaveLength(1);
    expect(lintWith('run[{ value: 1, onPick: vi.fn() }.k]();', one)).toHaveLength(1);
  });

  it('counts a name bound once to a vi.fn() as the mock it holds', () => {
    expect(lint('const load = vi.fn();\nconst save = vi.fn();\nconst api = { load, save };')).toHaveLength(1);
    expect(lint('const load = vi.fn();\nconst api = { load, save: other };')).toEqual([]);
    expect(lintWith('const onPick = vi.fn();\nservice.open({ value: 1, onPick });', { minRunnerFns: 1 })).toEqual([]);
  });

  it('leaves the defaults and overrides of createFixture / createFixtureFactory alone', () => {
    const one = { minRunnerFns: 1 };

    expect(lintWith('const options = createFixture<Options>({ size: 1, changeOptionsCallback: vi.fn() });', one)).toEqual([]);
    expect(lintWith('const make = createFixtureFactory<Options>({ nested: { changeOptionsCallback: vi.fn() } });', one)).toEqual([]);
    expect(lintWith('createFixture<Options>(defaults, { changeOptionsCallback: vi.fn() });', one)).toEqual([]);
    expect(lintWith('buildFixture<Options>({ changeOptionsCallback: vi.fn() });', one)).toHaveLength(1);
  });

  it('leaves an RxJS observer handed to subscribe or tap alone', () => {
    const one = { minRunnerFns: 1 };

    expect(lintWith('source$.subscribe({ error: vi.fn() });', one)).toEqual([]);
    expect(lintWith('source$.pipe(tap({ next: vi.fn(), error: vi.fn() }));', one)).toEqual([]);
    expect(lintWith('source$.pipe(operators.tap({ next: vi.fn() }));', one)).toEqual([]);
    expect(lintWith('source$.pipe(map({ next: vi.fn() }));', one)).toHaveLength(1);
    expect(lintWith('(factory())({ next: vi.fn() });', one)).toHaveLength(1);
  });

  it('names createMock<T> for a one-member object, which has no class to read', () => {
    const [thenable] = verify('const pending = { then: vi.fn() };', { minRunnerFns: 1 });

    expect(thenable?.message).toContain('`createMock<T>({ then: vi.fn() })`');
    expect(thenable?.message).not.toContain('createSpyFromClass(X)');
  });

  it('leaves a vi.hoisted bag alone — it only carries mocks into a vi.mock factory', () => {
    expect(lintWith('const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));', { minRunnerFns: 1 })).toEqual([]);
    expect(lint('const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));')).toEqual([]);
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
  describe('at minRunnerFns: 1, the shapes a one-member object takes that are not a double', () => {
    const one = { minRunnerFns: 1 };

    it('leaves a provider whose token is a function alone — the vi.fn() is the double, the object is DI syntax', () => {
      expect(lintWith('const modalClose = vi.fn();\nconst providers = [{ provide: MODAL_CLOSE, useValue: modalClose }];', one)).toEqual([]);
      expect(
        lintWith(
          'let closeFn;\nbeforeEach(() => {\n  closeFn = vi.fn();\n  render([{ provide: SIDE_PANEL_CLOSE, useValue: closeFn }]);\n});',
          one,
        ),
      ).toEqual([]);
    });

    it('leaves the input map of setInputs and of renderShallow alone — both check it against the inputs', () => {
      expect(
        lintWith('const disableHandler = vi.fn(() => true);\nawait setInputs(fixture, { disableDropHandler: disableHandler });', one),
      ).toEqual([]);
      expect(lintWith('const callback = vi.fn();\nawait setInputs(fixture, { setTopCallback: callback });', one)).toEqual([]);
      expect(lintWith('const onOptionSelect = vi.fn();\nrenderShallow(FieldMenuComponent, { inputs: { onOptionSelect } });', one)).toEqual(
        [],
      );
      // Any other slot of the same calls, or the same key handed to another helper, is not an input map.
      expect(lintWith('await setInputs(fixture, inputs, { onStable: vi.fn() });', one)).toHaveLength(1);
      expect(lintWith('await setInputs({ onStable: vi.fn() });', one)).toHaveLength(1);
      expect(lintWith('render(C, { inputs: { onPick: vi.fn() } });', one)).toHaveLength(1);
      expect(lintWith('renderShallow({ inputs: { onPick: vi.fn() } });', one)).toHaveLength(1);
      expect(lintWith('const options = { inputs: { onPick: vi.fn() } };', one)).toHaveLength(1);
    });

    it('leaves a helper returning spies it installed elsewhere alone — those are handles, not a double', () => {
      const helper = [
        'function dispatch() {',
        '  const preventDefault = vi.fn();',
        '  const stopPropagation = vi.fn();',
        '  emit(createMock<KeyboardEvent>({ preventDefault, stopPropagation }));',
        '  return { preventDefault, stopPropagation };',
        '}',
      ].join('\n');
      const withElements = [
        'function setup() {',
        '  const tooltipDiv = document.createElement("div");',
        '  const setContent = vi.fn();',
        '  popup.mockReturnValue(createAutoMock<Popup>({ setContent }));',
        '  return { tooltipDiv, setContent };',
        '}',
      ].join('\n');

      expect(lintWith(helper, one)).toEqual([]);
      expect(lintWith(withElements, one)).toEqual([]);
    });

    it('still reports a factory whose spies exist only in what it returns', () => {
      expect(lintWith('function make() {\n  const load = vi.fn();\n  return { load };\n}', one)).toHaveLength(1);
      expect(lintWith('function make() {\n  return { load: vi.fn() };\n}', one)).toHaveLength(1);
      expect(lintWith('function make() {\n  const load = vi.fn();\n  use(load);\n  return { load, ...rest };\n}', one)).toHaveLength(1);
      expect(lintWith('function make() {\n  return { load: globalLoad, save: vi.fn() };\n}', one)).toHaveLength(1);
    });

    it('leaves a one-member literal whose binding names its type alone — it is checked against that type already', () => {
      expect(lintWith('const fnValue = vi.fn();\nconst parameters: Record<string, unknown> = { fn: fnValue };', one)).toEqual([]);
      expect(lintWith('let params: Params;\nparams = { onDone: vi.fn() };', one)).toEqual([]);
      expect(lintWith('const fnValue = vi.fn();\nconst parameters: Record<string, unknown> = { nested: { fn: fnValue } };', one)).toEqual(
        [],
      );
    });

    it('leaves a one-member literal inside the value of a member stub alone — it is typed against that member', () => {
      const stub = "mockValueProp(angle, 'info_legend_config', [{ blockName: 'header', parameters: { fn: fnValue } }]);";

      expect(lintWith(`const fnValue = vi.fn();\n${stub}`, one)).toEqual([]);
      expect(lintWith("mockReadonlyProp(host, 'config', { onDone: vi.fn() });", one)).toEqual([]);
      expect(lintWith('mockValueProp(angle, { fn: vi.fn() });', one)).toHaveLength(1);
      expect(lintWith("stubValue(angle, 'config', { fn: vi.fn() });", one)).toHaveLength(1);
      expect(lintWith("helpers.mockValueProp(angle, 'config', { fn: vi.fn() });", one)).toHaveLength(1);
    });

    it('still reports a one-member literal whose declared type is itself an object of mocks, or that has no declaration', () => {
      expect(lintWith('let service: { devMode: Mock };\nservice = { devMode: vi.fn() };', one)).toHaveLength(1);
      expect(lintWith('let service;\nservice = { devMode: vi.fn() };', one)).toHaveLength(1);
      expect(lintWith('undeclared = { devMode: vi.fn() };', one)).toHaveLength(1);
      expect(lintWith('holder.service = { devMode: vi.fn() };', one)).toHaveLength(1);
      expect(lintWith('function f(p: Params) {\n  p = { devMode: vi.fn() };\n}', one)).toHaveLength(1);
      // An imported helper's parameter is out of reach without type information.
      expect(lintWith('const callback = vi.fn();\ncreateDefaultOptions({ changeOptionsCallback: callback });', one)).toHaveLength(1);
    });

    it('leaves a one-member literal passed to a typed parameter of a helper this file declares alone', () => {
      const call = 'const callback = vi.fn();\ncreateDefaultOptions({ changeOptionsCallback: callback });';

      expect(
        lintWith(
          `const createDefaultOptions = (overrides?: Partial<InfoboxOptions>): InfoboxOptions => ({ ...base, ...overrides });\n${call}`,
          one,
        ),
      ).toEqual([]);
      expect(
        lintWith(
          `function createDefaultOptions(id: number, overrides: Partial<InfoboxOptions> = {}) {}\n${call.replace('({', '(1, {')}`,
          one,
        ),
      ).toEqual([]);
      expect(lintWith(`const createDefaultOptions = function ({ changeOptionsCallback }: Overrides) {};\n${call}`, one)).toEqual([]);
      expect(
        lintWith(
          `const createDefaultOptions = (overrides?: Partial<InfoboxOptions>) => overrides;\ncreateDefaultOptions({ nested: { onDone: vi.fn() } });`,
          one,
        ),
      ).toEqual([]);
    });

    it('still reports it when the local helper leaves that parameter untyped, types it as mocks, or is not a function', () => {
      const call = 'const callback = vi.fn();\ncreateDefaultOptions({ changeOptionsCallback: callback });';

      expect(lintWith(`const createDefaultOptions = (overrides) => overrides;\n${call}`, one)).toEqual(REPORTED);
      expect(lintWith(`const createDefaultOptions = (overrides = {}) => overrides;\n${call}`, one)).toEqual(REPORTED);
      expect(lintWith(`const createDefaultOptions = (overrides: { changeOptionsCallback: Mock }) => overrides;\n${call}`, one)).toEqual(
        REPORTED,
      );
      expect(lintWith(`const createDefaultOptions = (...overrides: Partial<InfoboxOptions>[]) => overrides;\n${call}`, one)).toEqual(
        REPORTED,
      );
      expect(lintWith(`const createDefaultOptions = (id: number) => id;\n${call.replace('({', '(1, {')}`, one)).toEqual(REPORTED);
      expect(lintWith(`const createDefaultOptions = factories.options;\n${call}`, one)).toEqual(REPORTED);
      expect(
        lintWith(`const helpers = { build: (o: Options) => o };\nconst callback = vi.fn();\nhelpers.build({ onDone: callback });`, one),
      ).toEqual(REPORTED);
    });

    it('reads a bag nested in an argument as the options bag it is', () => {
      expect(lintWith('const onClose = vi.fn();\nrender({ options: { slide: slideMock, onClose }, router });', one)).toEqual([]);
      expect(lintWith('const onClose = vi.fn();\nconst params = { options: { slide: slideMock, onClose } };', one)).toHaveLength(1);
    });

    it('names mockSignalProp for a nested set / update, which createMock<T> cannot seed', () => {
      const [signal] = verify('const directive = { hide: { set: vi.fn() } };', one);
      const [update] = verify('const directive = { value: { update: vi.fn() } };', one);
      const [topLevel] = verify('const cache = { set: vi.fn() };', one);
      const [key] = verify('const map = { [{ set: vi.fn() }.set]: 1 };', one);

      expect(signal?.message).toContain("mockSignalProp(instance, 'hide', value)");
      expect(update?.message).toContain("mockSignalProp(instance, 'value', value)");
      expect(topLevel?.message).toContain('`createMock<T>({ set: vi.fn() })`');
      expect(key?.message).toContain('`createMock<T>({ set: vi.fn() })`');
    });
  });
});
