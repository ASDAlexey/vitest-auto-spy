import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-redundant-smoke-test';

function verify(code: string): LintMessage[] {
  const messages = runRule(RULE, code, { filename: 'pipe.spec.ts' });

  expect(messages.filter((message) => message.ruleId === null)).toEqual([]);

  return messages;
}

/** The test a spec of this file is built around: one that uses the subject rather than weighing it. */
const PROVING = "it('drops the empty entries', () => { expect(pipe.transform([])).toEqual([]); });";

/** The reported lines of a block, by the subject each report names. */
const subjects = (...tests: string[]): string[] =>
  verify(`describe('MyPipe', () => {\n${tests.join('\n')}\n});`).map(
    (message) => /`(.*?)` existing/.exec(message.message)?.[1] ?? message.message,
  );

describe(RULE, () => {
  it('reports a body that asks only whether the subject is there', () => {
    const smoke = [
      "it('should create', () => { expect(pipe).toBeTruthy(); });",
      "it('should create', () => expect(pipe).toBeTruthy());",
      "it('should create', () => { expect(pipe).toBeDefined(); });",
      "it('should create', () => { expect(pipe).toBeInstanceOf(MyPipe); });",
      "it('should create', () => { expect(pipe).not.toBeNull(); });",
      "it('should create', () => { expect(pipe).not.toBeUndefined(); });",
      "it('should create', () => { expect(pipe).not.toBeFalsy(); });",
      "it('should create', () => { expect(pipe).not.not.toBeTruthy(); });",
      "it('should create', function () { expect(pipe).toBeTruthy(); });",
      "test('should create', async () => { expect(pipe).toBeTruthy(); });",
      "it('should create', () => { expect(pipe).toBeTruthy(); expect(pipe.transform).toBeDefined(); });",
      "it.each([1, 2])('should create', () => { expect(pipe).toBeTruthy(); });",
      "it.skip('should create', () => { expect(pipe).toBeTruthy(); });",
      "fit('should create', () => { expect(pipe).toBeTruthy(); });",
    ];

    expect(subjects(PROVING, ...smoke)).toEqual(smoke.map(() => 'pipe'));
  });

  it('names the subject, the company it keeps and the way out', () => {
    const [report] = verify(`describe('MyPipe', () => {\n${PROVING}\nit('should create', () => { expect(pipe).toBeTruthy(); });\n});`);

    expect(report?.message).toContain(
      'The whole of this test is `pipe` existing, and another test under the same setup already runs against it',
    );
    expect(report?.message).toMatch(/Delete it\.[\s\S]*expect\(\(\) => new Subject\(null\)\)\.toThrow/);
    expect(report?.message).toContain('#how-to-mock-a-promise-a-test-forgets-to-await');
  });

  it('counts the tests that will actually run', () => {
    const [report] = verify(
      `describe('MyPipe', () => {\n${PROVING}\n${PROVING}\nit.skip('parses a date', () => { expect(pipe.transform('x')).toBe(1); });\nit('should create', () => { expect(pipe).toBeTruthy(); });\n});`,
    );

    expect(report?.message).toContain('2 other tests under the same setup');
  });

  it('offers to remove the test, blank line above it included', () => {
    const source = `describe('MyPipe', () => {\n  ${PROVING}\n\n  it('should create', () => { expect(pipe).toBeTruthy(); });\n});`;
    const [report] = verify(source);
    const [suggestion] = report?.suggestions ?? [];
    const fixed = suggestion
      ? source.slice(0, suggestion.fix.range[0]) + suggestion.fix.text + source.slice(suggestion.fix.range[1])
      : source;

    expect(suggestion?.desc).toBe('Remove this test');
    expect(fixed).toBe(`describe('MyPipe', () => {\n  ${PROVING}\n});`);
  });

  it('removes a test that opens the file, where there is nothing above it to keep', () => {
    const source = `it('should create', () => { expect(pipe).toBeTruthy(); });\n${PROVING}`;
    const [suggestion] = verify(source)[0]?.suggestions ?? [];

    expect(suggestion && source.slice(0, suggestion.fix.range[0]) + suggestion.fix.text + source.slice(suggestion.fix.range[1])).toBe(
      `\n${PROVING}`,
    );
  });

  it('reports without a suggestion where the test is not a statement of its own', () => {
    const [report] = verify(`describe('MyPipe', () => {\n${PROVING}\nvoid it('should create', () => { expect(pipe).toBeTruthy(); });\n});`);

    expect(report?.message).toContain('The whole of this test is `pipe` existing');
    expect(report?.suggestions ?? []).toEqual([]);
  });

  it('stays silent where the block has nothing else that runs', () => {
    expect(
      subjects(
        "it('should create', () => { expect(pipe).toBeTruthy(); });",
        "it('should create the service', () => { expect(service).toBeTruthy(); });",
        "it.skip('drops the empty entries', () => { expect(pipe.transform([])).toEqual([]); });",
        "xit('parses a date', () => { expect(pipe.transform('x')).toBe(1); });",
        "it.todo('rejects a bad pattern');",
        "it.each([1, 2])('should create', () => { expect(pipe).toBeTruthy(); });",
      ),
    ).toEqual([]);
  });

  it('counts the tests a nested block declares, which run the outer setup before their own', () => {
    const source = `describe('MyPipe', () => {
  it('should create', () => { expect(pipe).toBeTruthy(); });

  describe('transform', () => {
    ${PROVING}
  });
});`;

    expect(verify(source).map((message) => message.line)).toEqual([2]);
  });

  it('does not weigh a nested test against the block above it, whose setup it does not run', () => {
    const source = `describe('MyPipe', () => {
  ${PROVING}

  describe('transform', () => {
    it('should create', () => { expect(pipe).toBeTruthy(); });
  });
});`;

    expect(verify(source)).toEqual([]);
  });

  it('stays silent on a body that does anything besides asking for the subject', () => {
    const live = [
      "it('should create', () => { const local = new MyPipe(); expect(local).toBeTruthy(); });",
      "it('should create', () => { expect(pipe.transform([])).toBeTruthy(); expect(calls).toBe(1); });",
      "it('should create', () => { if (ready) { expect(pipe).toBeTruthy(); } });",
      "it('should create', () => {});",
      "it('should create', handler);",
    ];

    expect(subjects(PROVING, ...live)).toEqual([]);
  });

  it('stays silent on an assertion that asks more than whether the value is there', () => {
    const live = [
      "it('should create', () => { expect(pipe).toBe(created); });",
      "it('should create', () => { expect(pipe).not.toBeTruthy(); });",
      "it('should create', () => { expect(pipe).toBeNull(); });",
      "it('should create', () => { expect(pipe).resolves.toBeTruthy(); });",
      "it('should create', () => { expect(pipe); });",
      "it('should create', () => { expect().toBeTruthy(); });",
      "it('should create', () => { expect(pipe).toBeTruthy; });",
      "it('should create', () => { assert(pipe).toBeTruthy(); });",
      "it('should create', () => { expect(pipe)[matcher](); });",
      "it('should create', () => { check(pipe); });",
    ];

    expect(subjects(PROVING, ...live)).toEqual([]);
  });

  it('leaves alone every call that is not a test', () => {
    const live = [
      "describe('nested', () => { expect(pipe).toBeTruthy(); });",
      'beforeEach(() => { expect(pipe).toBeTruthy(); });',
      "runner[name]('should create', () => { expect(pipe).toBeTruthy(); });",
      "(0, it)('should create', () => { expect(pipe).toBeTruthy(); });",
      "suites.unit.it('should create', () => { expect(pipe).toBeTruthy(); });",
      'it(name, () => { expect(pipe).toBeTruthy(); });',
      'it();',
    ];

    expect(subjects(PROVING, ...live)).toEqual([]);
  });

  it('leaves alone a value the test computed, however existence-shaped the matcher looks', () => {
    // Every one of these was reported before the subject had to be a reference, and every one was
    // the only check of the behaviour it names — found rolling the rule out over a 1771-file suite.
    const live = [
      "it('resolves the type', () => { expect(createService().resolve(type)).toBeTruthy(); });",
      "it('is a child role', () => { expect(isChildProfile(FAMILY_ROLE.CHILD)).toBeTruthy(); });",
      "it('builds a transport', () => { expect(consoleTransport(true)).toBeTruthy(); });",
      "it('offsets the periods', () => { expect(component.periodsOffset()).not.toBeNull(); });",
      "it('renders the card', () => { expect(fixture.nativeElement.querySelector('expand-card')).toBeTruthy(); });",
      "it('applies the directive', () => { expect(fixture.debugElement.query(By.directive(Dir))).toBeTruthy(); });",
      "it('stays in range', () => { expect(samples.every((x) => x >= 0 && x <= 100)).toBeTruthy(); });",
      "it('holds a ref', () => { expect(component.contentRef()).toBeInstanceOf(ViewContainerRef); });",
      // A builder with toBeInstanceOf pairs two names and asserts they resolve to each other.
      "it('wires the token', () => { expect(TestBed.inject(TOKEN)).toBeInstanceOf(RealService); });",
      "it('wires the token', () => { expect(createService()).toBeInstanceOf(RealService); });",
    ];

    expect(subjects(PROVING, ...live)).toEqual([]);
  });

  it('still reports the subject reached through a builder that takes no input', () => {
    // Each one needs a running sibling reaching the subject through the same name, which is the
    // condition the message states.
    expect(
      subjects(
        "it('transforms', () => { expect(createService().transform([])).toEqual([]); });",
        "it('should create', () => { expect(createService()).toBeTruthy(); });",
      ),
    ).toEqual(['createService()']);

    expect(
      subjects(
        "it('transforms', () => { expect(TestBed.inject(MyService).transform([])).toEqual([]); });",
        "it('should create', () => { expect(TestBed.inject(MyService)).toBeTruthy(); });",
      ),
    ).toEqual(['TestBed.inject(MyService)']);

    expect(
      subjects(
        "it('transforms', () => { expect(fixture.componentInstance.transform([])).toEqual([]); });",
        "it('should create', () => { expect(fixture.componentInstance).toBeTruthy(); });",
      ),
    ).toEqual(['fixture.componentInstance']);

    // A token named as a path is still a token, not input the test computed.
    expect(
      subjects(
        "it('transforms', () => { expect(TestBed.inject(TOKENS.beta).transform([])).toEqual([]); });",
        "it('should create', () => { expect(TestBed.inject(TOKENS.beta)).toBeTruthy(); });",
      ),
    ).toEqual(['TestBed.inject(TOKENS.beta)']);
  });

  it('leaves alone a path that reaches through a call, and a subject that is neither name nor call', () => {
    const live = [
      // The call is inside the chain rather than at the end of it, so the path is still computed.
      "it('should create', () => { expect(getFixture().componentInstance).toBeTruthy(); });",
      // Neither an identifier, a path, nor a call: nothing here names a subject.
      "it('should create', () => { expect([]).toBeTruthy(); });",
      "it('should create', () => { expect(first || second).toBeTruthy(); });",
    ];

    expect(subjects(PROVING, ...live)).toEqual([]);
  });

  it('takes a builder only in the exact shape that names a subject', () => {
    const live = [
      // The member is computed, so there is no name to match against the builders.
      "it('should create', () => { expect(TestBed[member](MyService)).toBeTruthy(); });",
      // The builder is reached through a call, so producing it is itself work the test did.
      "it('should create', () => { expect(getBed().inject(MyService)).toBeTruthy(); });",
      // Not one token: neither of these is "inject this and nothing else".
      "it('should create', () => { expect(TestBed.inject(MyService, optional)).toBeTruthy(); });",
      "it('should create', () => { expect(TestBed.inject()).toBeTruthy(); });",
      // The callee is itself a call, so it is neither a name nor a path to weigh anything against.
      "it('should create', () => { expect(makeInjector()(MyService)).toBeTruthy(); });",
      // The token is produced by a call, which is work the test did rather than a token it named.
      "it('should create', () => { expect(TestBed.inject(getTokens().beta)).toBeTruthy(); });",
    ];

    expect(subjects(PROVING, ...live)).toEqual([]);
  });

  it('reports a builder whose chain bottoms out in something with no name', () => {
    // `this.inject(Token)` is the shape: accepted as a builder, but there is no identifier under it
    // for a sibling to be compared against, so the block's tests cannot rule it out.
    const smoke = "it('should create', () => { expect(this.inject(MyService)).toBeTruthy(); });";

    expect(subjects(PROVING, smoke)).toEqual(['this.inject(MyService)']);
  });

  it('leaves alone a name no running test in the block mentions', () => {
    // The message claims the siblings already run against the subject. Where none of them names it,
    // the claim is false and the test is the only thing checking whatever the name holds — the flag
    // a beforeAll set from an observable's complete, an export a barrel spec exists to assert.
    const orphans = [
      "it('should complete', () => { expect(completed).toBeTruthy(); });",
      // The sibling below checks a different export, so it shares only the word `publicApi`.
      "it('exports the module', () => { expect(publicApi.FocusModule).toBeDefined(); });",
      "it('exports the settings', () => { expect(typeof publicApi.settings.factory).toBe('function'); });",
    ];

    expect(subjects(PROVING, ...orphans)).toEqual([]);
  });
});
