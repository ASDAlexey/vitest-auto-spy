/**
 * `prefer-set-inputs`, from both ends.
 *
 * The shapes are transcribed from the 773 `componentRef.setInput` calls one Angular monorepo of 1771
 * spec files carries across 140 of them: runs of one to seven calls on a fixture named `fixture`,
 * `hostFixture` or `f`, a `detectChanges()` under about a quarter of the runs, and not one computed
 * input name. The silent ones are what the same suite would have this rule rewrite wrongly — a bare
 * `ComponentRef`, a receiver no reading settles, a call whose result goes somewhere.
 *
 * The edit is asserted the way a reader meets it — accepted one report at a time — because the rule
 * offers it and never applies it: on that suite, accepting all 451 of them turns 57 of 105 green
 * files red under zone.js, which is the measurement behind `hasSuggestions` rather than `fixable`.
 */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { fixRule, runRule } from './run-rule';

const RULE = 'prefer-set-inputs';

/** Lint one snippet with only this rule enabled. */
function verify(code: string): LintMessage[] {
  return runRule(RULE, code, { filename: 'card.component.spec.ts' });
}

/** How many reports a snippet draws. */
function count(code: string): number {
  return verify(code).length;
}

/**
 * The source after every suggestion has been accepted, one report at a time.
 *
 * The rule offers its edit rather than applying it, so `verifyAndFix` changes nothing; this is what
 * a reader does in an editor, and what the rollout that measured this rule did in a copy of a
 * consumer's tree. Each round takes the first report that carries one, because the edits of two
 * reports in one file share the range the import goes in.
 */
function fixed(code: string): string {
  let current = code;

  for (let round = 0; round < 20; round += 1) {
    const fix = verify(current).flatMap((message) => message.suggestions ?? [])[0]?.fix;

    if (!fix) {
      return current;
    }

    current = `${current.slice(0, fix.range[0])}${fix.text}${current.slice(fix.range[1])}`;
  }

  return current;
}

/** A test body, indented the way a spec writes one. */
function test(body: string): string {
  return `it('renders', () => {\n${body}\n});`;
}

describe(RULE, () => {
  it('reports the call and names what NG0303 does instead of failing', () => {
    const [report] = verify(test("  fixture.componentRef.setInput('title', 'Hi');"));

    expect(report?.message).toContain('NG0303');
    expect(report?.message).toContain('a typo in `title` would fail only at a later assertion');
    expect(report?.message).toContain('await setInputs(fixture, { … })');
    expect(report?.message).toContain('/utilities/eslint-rules#prefer-set-inputs');
  });

  it('offers the edit rather than applying it, and says what accepting it does', () => {
    const [report] = verify(test("  fixture.componentRef.setInput('title', 'Hi');"));

    expect(report?.suggestions).toHaveLength(1);
    expect(report?.suggestions?.[0]?.desc).toBe('Set the inputs through setInputs() — an awaited call, so the callback becomes async');
    expect(fixRule(RULE, test("  fixture.componentRef.setInput('title', 'Hi');"), { filename: 'card.component.spec.ts' }).fixed).toBe(
      false,
    );
  });

  it('rewrites one call, and makes the callback that now awaits it async', () => {
    expect(fixed(test("  fixture.componentRef.setInput('title', 'Hi');"))).toBe(
      "import { setInputs } from 'vitest-auto-spy/angular';\nit('renders', async () => {\n  await setInputs(fixture, { title: 'Hi' });\n});",
    );
  });

  it('collapses a run on one fixture into a single call', () => {
    const body = [
      "  fixture.componentRef.setInput('title', 'Hi');",
      "  fixture.componentRef.setInput('count', 2);",
      "  fixture.componentRef.setInput('mode', mode);",
    ].join('\n');

    expect(count(test(body))).toBe(1);
    expect(fixed(test(body))).toContain("await setInputs(fixture, { title: 'Hi', count: 2, mode: mode });");
  });

  it('drops the detectChanges under the run, which stable() already does more than', () => {
    expect(fixed(test("  fixture.componentRef.setInput('title', 'Hi');\n  fixture.detectChanges();"))).toBe(
      "import { setInputs } from 'vitest-auto-spy/angular';\nit('renders', async () => {\n  await setInputs(fixture, { title: 'Hi' });\n});",
    );
  });

  it('keeps a detectChanges that is not the pass stable() runs', () => {
    // An argument makes it a pass that skips check-no-changes; another receiver makes it another view.
    expect(fixed(test("  fixture.componentRef.setInput('title', 'Hi');\n  fixture.detectChanges(false);"))).toContain(
      'fixture.detectChanges(false);',
    );
    expect(fixed(test("  fixture.componentRef.setInput('title', 'Hi');\n  hostFixture.detectChanges();"))).toContain(
      'hostFixture.detectChanges();',
    );
    expect(fixed(test("  fixture.componentRef.setInput('title', 'Hi');\n  detectChanges();"))).toContain('\n  detectChanges();');
    expect(fixed(test("  fixture.componentRef.setInput('title', 'Hi');\n  fixture.whenStable();"))).toContain('fixture.whenStable();');
    expect(fixed(test("  fixture.componentRef.setInput('title', 'Hi');\n  const x = 1;"))).toContain('const x = 1;');
  });

  it('keeps a detectChanges a comment stands between', () => {
    const body = [
      "  fixture.componentRef.setInput('title', 'Hi');",
      '  // the second pass is the one that matters',
      '  fixture.detectChanges();',
    ].join('\n');

    expect(fixed(test(body))).toContain('fixture.detectChanges();');
  });

  it('ends a run at a comment, so nothing is left hanging over a line that is gone', () => {
    const body = [
      "  fixture.componentRef.setInput('title', 'Hi');",
      '  // the second one has to come after the first',
      "  fixture.componentRef.setInput('count', 2);",
    ].join('\n');

    expect(count(test(body))).toBe(2);
    expect(fixed(test(body))).toContain('// the second one has to come after the first');
  });

  it('ends a run at another fixture, and starts a new one there', () => {
    const body = ["  fixture.componentRef.setInput('title', 'Hi');", "  hostFixture.componentRef.setInput('title', 'Hi');"].join('\n');

    expect(count(test(body))).toBe(2);
    expect(fixed(test(body))).toContain("await setInputs(fixture, { title: 'Hi' });\n  await setInputs(hostFixture, { title: 'Hi' });");
  });

  it('starts a new run after the detectChanges it took with the first one', () => {
    const body = [
      "  fixture.componentRef.setInput('title', 'Hi');",
      '  fixture.detectChanges();',
      "  fixture.componentRef.setInput('count', 2);",
    ].join('\n');

    expect(count(test(body))).toBe(2);
    expect(fixed(test(body))).toContain("await setInputs(fixture, { title: 'Hi' });\n  await setInputs(fixture, { count: 2 });");
  });

  it('ends a run where the same input is set twice, which is a spec changing a value', () => {
    // Verbatim shape from the measured suite: the second write is what the test is about, and one
    // literal carrying both keys is TS1117 — or, had it compiled, a test that no longer tests it.
    const body = ["  fixture.componentRef.setInput('url', first);", "  fixture.componentRef.setInput('url', second);"].join('\n');

    expect(count(test(body))).toBe(2);
    expect(fixed(test(body))).toContain('await setInputs(fixture, { url: first });\n  await setInputs(fixture, { url: second });');
  });

  it('reports the call that sits between two runs the repeat cut apart', () => {
    const body = [
      "  fixture.componentRef.setInput('title', 'Hi');",
      "  fixture.componentRef.setInput('count', 1);",
      "  fixture.componentRef.setInput('title', 'There');",
      "  fixture.componentRef.setInput('mode', 'wide');",
    ].join('\n');

    expect(count(test(body))).toBe(2);
    expect(fixed(test(body))).toContain(
      "await setInputs(fixture, { title: 'Hi', count: 1 });\n  await setInputs(fixture, { title: 'There', mode: 'wide' });",
    );
  });

  it('quotes a key a literal cannot carry bare', () => {
    expect(fixed(test("  fixture.componentRef.setInput('data-id', 7);"))).toContain("await setInputs(fixture, { 'data-id': 7 });");
  });

  it('leaves an async callback alone, and imports the helper once for the whole file', () => {
    const code = [
      "import { setInputs } from 'vitest-auto-spy/angular';",
      "it('renders', async () => {",
      "  fixture.componentRef.setInput('title', 'Hi');",
      '});',
      "it('renders again', async () => {",
      "  fixture.componentRef.setInput('count', 2);",
      '});',
    ].join('\n');

    expect(count(code)).toBe(2);
    expect(fixed(code)).toBe(
      [
        "import { setInputs } from 'vitest-auto-spy/angular';",
        "it('renders', async () => {",
        "  await setInputs(fixture, { title: 'Hi' });",
        '});',
        "it('renders again', async () => {",
        '  await setInputs(fixture, { count: 2 });',
        '});',
      ].join('\n'),
    );
  });

  it('merges the helper into an import the file already has from the Angular entry', () => {
    const code = `import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';\n${test("  fixture.componentRef.setInput('title', 'Hi');")}`;

    expect(fixed(code)).toBe(
      "import { injectSpy, provideAutoSpy, setInputs } from 'vitest-auto-spy/angular';\nit('renders', async () => {\n  await setInputs(fixture, { title: 'Hi' });\n});",
    );
  });

  it('adds the import once when two callbacks need it', () => {
    const code = [
      "beforeEach(() => {\n  fixture.componentRef.setInput('title', 'Hi');\n});",
      "it('renders', function () {\n  fixture.componentRef.setInput('count', 2);\n});",
    ].join('\n');
    const output = fixed(code);

    expect(output.match(/vitest-auto-spy\/angular/gu)).toHaveLength(1);
    expect(output).toContain('beforeEach(async () => {');
    expect(output).toContain("it('renders', async function () {");
  });

  it('reads the fixture off the name, and off the one value the file gives it', () => {
    expect(count(test("  hostFixture.componentRef.setInput('title', 'Hi');"))).toBe(1);
    expect(count('const f = TestBed.createComponent(Card);\n\n' + test("  f.componentRef.setInput('title', 'Hi');"))).toBe(1);
    expect(count('const f = renderShallow(Card).fixture;\n\n' + test("  f.componentRef.setInput('title', 'Hi');"))).toBe(1);
    expect(count('let f;\n\nbeforeEach(() => {\n  f = render(Card);\n});\n\n' + test("  f.componentRef.setInput('title', 'Hi');"))).toBe(1);
  });

  it('says nothing about a receiver no reading settles as a fixture', () => {
    expect(count(test("  page.componentRef.setInput('title', 'Hi');"))).toBe(0);
    expect(count('const f = buildPage();\n\n' + test("  f.componentRef.setInput('title', 'Hi');"))).toBe(0);
    expect(count('const f = page;\n\n' + test("  f.componentRef.setInput('title', 'Hi');"))).toBe(0);
    expect(count('const f = TestBed[make](Card);\n\n' + test("  f.componentRef.setInput('title', 'Hi');"))).toBe(0);
    expect(count('const f = TestBed.createComponent(Card);\n\nf = other;\n\n' + test("  f.componentRef.setInput('title', 'Hi');"))).toBe(0);
  });

  it('follows a componentRef the file binds once to a fixture, and names the fixture in the edit', () => {
    const local = "it('renders', () => {\n  const componentRef = fixture.componentRef;\n  componentRef.setInput('title', 'Hi');\n});";
    const hooked = [
      'let fixture: ComponentFixture<Card>;',
      'let componentRef: ComponentRef<Card>;',
      'beforeEach(() => {',
      '  fixture = TestBed.createComponent(Card);',
      '  componentRef = fixture.componentRef;',
      '});',
      test("  componentRef.setInput('title', 'Hi');\n  fixture.componentRef.setInput('size', 2);"),
    ].join('\n');

    expect(fixed(local)).toContain("const componentRef = fixture.componentRef;\n  await setInputs(fixture, { title: 'Hi' });");
    expect(fixed(hooked)).toContain("await setInputs(fixture, { title: 'Hi', size: 2 });");
  });

  it('does not follow a componentRef bound twice, to a non-fixture, or to a fixture out of reach', () => {
    const twice = 'let ref = fixture.componentRef;\nref = other.componentRef;\n';
    const outOfReach =
      'beforeEach(() => {\n  const fixture = TestBed.createComponent(Card);\n  ref = fixture.componentRef;\n});\nlet ref;\n';

    expect(count(`${twice}${test("  ref.setInput('title', 'Hi');")}`)).toBe(0);
    expect(count(`const ref = page.componentRef;\n${test("  ref.setInput('title', 'Hi');")}`)).toBe(0);
    expect(count(`const ref = view.create();\n${test("  ref.setInput('title', 'Hi');")}`)).toBe(0);
    expect(count(`${outOfReach}${test("  ref.setInput('title', 'Hi');")}`)).toBe(0);
  });

  it('says nothing about a ComponentRef that is not a fixture’s', () => {
    // `ViewContainerRef.createComponent()` hands one back directly, and `setInputs` does not take it.
    expect(count(test("  ref.setInput('title', 'Hi');"))).toBe(0);
    expect(count(test("  fixture.ref.setInput('title', 'Hi');"))).toBe(0);
    expect(count(test("  this.fixture.componentRef.setInput('title', 'Hi');"))).toBe(0);
    expect(count(test("  setInput('title', 'Hi');"))).toBe(0);
  });

  it('says nothing about a name it cannot read, or a call it cannot account for', () => {
    expect(count(test('  fixture.componentRef.setInput(name, value);'))).toBe(0);
    expect(count(test('  fixture.componentRef.setInput(`${prefix}Title`, value);'))).toBe(0);
    expect(count(test('  fixture.componentRef.setInput(`title`, value);'))).toBe(0);
    expect(count(test("  fixture.componentRef.setInput('title');"))).toBe(0);
    expect(count(test("  fixture.componentRef[write]('title', 'Hi');"))).toBe(0);
    expect(count(test("  const done = fixture.componentRef.setInput('title', 'Hi');"))).toBe(0);
    expect(count(test("  await fixture.componentRef.setInput('title', 'Hi');"))).toBe(0);
  });

  it('reports without an edit where the async would change a signature nobody in the file calls', () => {
    const helper = "function setTitle() {\n  fixture.componentRef.setInput('title', 'Hi');\n}";
    const wrapped = "it('renders', waitForAsync(() => {\n  fixture.componentRef.setInput('title', 'Hi');\n}));";
    const bare = "describe('Card', () => {\n  fixture.componentRef.setInput('title', 'Hi');\n});";

    [helper, wrapped, bare].forEach((code) => {
      expect(count(code)).toBe(1);
      expect(fixed(code)).toBe(code);
    });
  });

  it('reports without an edit where the file declares a setInputs of its own', () => {
    const code = [
      'const setInputs = (values) => values;',
      "it('renders', () => {",
      "  fixture.componentRef.setInput('title', 'Hi');",
      '});',
    ].join('\n');

    expect(count(code)).toBe(1);
    expect(fixed(code)).toBe(code);
  });

  it('rewrites a call that is a statement of a branch, where there is no run to read', () => {
    const code = "it('renders', () => {\n  if (wide) fixture.componentRef.setInput('title', 'Hi');\n});";

    expect(fixed(code)).toContain("if (wide) await setInputs(fixture, { title: 'Hi' });");
  });

  it('reports a call at the top level of the file, and leaves it alone', () => {
    const code = "fixture.componentRef.setInput('title', 'Hi');";

    expect(count(code)).toBe(1);
    expect(fixed(code)).toBe(code);
  });
});
