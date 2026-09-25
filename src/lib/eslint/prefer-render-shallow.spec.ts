/**
 * `prefer-render-shallow`, from both ends: the full render cycle paid for, only TypeScript state
 * read back — and the `{ templates: "never" }` policy that reports even a template read.
 */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'prefer-render-shallow';

/** Lint one snippet with only this rule enabled. */
function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

/** Lint one snippet with a rule configured — the options every ESLint config passes after the severity. */
function verifyWith(code: string, options: object): LintMessage[] {
  return runRule(RULE, code, { options });
}

/** The rule ids reported for a snippet. */
function lint(code: string): string[] {
  return verify(code).map((message) => message.ruleId ?? 'parse-error');
}

/** Lint one snippet with a rule configured — the options every ESLint config passes after the severity. */
function lintWith(code: string, options: object): string[] {
  return verifyWith(code, options).map((message) => message.ruleId ?? 'parse-error');
}

/** The full message text of the first report, for the rules that must point at the README. */
function firstMessage(code: string): string {
  return verify(code)[0]?.message ?? '';
}

describe('prefer-render-shallow', () => {
  /** The shape the rule exists for: the full cycle paid for, only TypeScript state read back. */
  const stateOnly = `
    const fixture = TestBed.createComponent(CardComponent);

    fixture.componentRef.setInput('total', 3);
    await fixture.whenStable();

    expect(fixture.componentInstance.label()).toBe('3 items');
  `;

  it('reports a createComponent in a file that never reads the template', () => {
    expect(lint(stateOnly)).toEqual([`vitest-auto-spy/${RULE}`]);
    expect(firstMessage(stateOnly)).toContain('renderShallow');
  });

  it.each([
    ['nativeElement', 'const host = fixture.nativeElement;'],
    ['debugElement', 'const row = fixture.debugElement;'],
    ['By.css', 'const row = fixture.debugElement.query(By.css(".row"));'],
    ['querySelector', 'const row = host.querySelector(".row");'],
    ['textContent', "expect(host.textContent).toContain('3 items');"],
    ['triggerEventHandler', "row.triggerEventHandler('click');"],
  ])('stays silent when the file reads the template through %s', (_label, read) => {
    expect(lint(`${stateOnly}\n${read}`)).toEqual([]);
  });

  it('reports every createComponent of a file that reads nothing', () => {
    const twice = `
      const first = TestBed.createComponent(CardComponent);
      const second = TestBed.createComponent(OtherComponent);

      expect(first.componentInstance.label()).toBe('a');
      expect(second.componentInstance.label()).toBe('b');
    `;

    expect(lint(twice)).toEqual([`vitest-auto-spy/${RULE}`, `vitest-auto-spy/${RULE}`]);
  });

  /** The source after accepting the first report's suggestion, or `undefined` without one. */
  function applied(code: string): string | undefined {
    const fix = verify(code)[0]?.suggestions?.[0]?.fix;

    return fix && `${code.slice(0, fix.range[0])}${fix.text}${code.slice(fix.range[1])}`;
  }

  /** A `beforeEach` holding the given lines, and a test that reads only component state. */
  function spec(...lines: string[]): string {
    return `beforeEach(() => {\n${lines.map((line) => `  ${line}`).join('\n')}\n});\nit('labels', () => { expect(fixture.componentInstance.label()).toBe('a'); });`;
  }

  const configure = 'TestBed.configureTestingModule({ imports: [CardComponent, RouterStub], providers: [provideAutoSpy(Api)] });';

  it('folds the testing module into renderShallow, keeping the render where the spec had it', () => {
    expect(applied(spec(configure, 'fixture = TestBed.createComponent(CardComponent);', 'fixture.detectChanges();'))).toBe(
      "import { renderShallow } from 'vitest-auto-spy/angular';\n" +
        spec('fixture = renderShallow(CardComponent, { imports: [RouterStub], providers: [provideAutoSpy(Api)] }).fixture;'),
    );
  });

  it('asks for no render where the spec did not render straight away', () => {
    const code = spec(
      'TestBed.configureTestingModule({ imports: [CardComponent] });',
      'const fixture = TestBed.createComponent(CardComponent);',
      "fixture.componentRef.setInput('total', 3);",
      'fixture.detectChanges();',
    );

    expect(applied(code)).toContain(
      'const fixture = renderShallow(CardComponent, { detectChanges: false }).fixture;\n  fixture.componentRef',
    );
  });

  it('writes the bare call when nothing is left to fold', () => {
    const code = spec(
      'TestBed.configureTestingModule({ imports: [CardComponent] });',
      'fixture = TestBed.createComponent(CardComponent);',
      'fixture.detectChanges();',
    );

    expect(applied(code)).toContain('  fixture = renderShallow(CardComponent).fixture;\n});');
  });

  it('moves the injectSpy reads between the two below the render, where the module exists', () => {
    const code = spec(
      configure,
      'api = injectSpy(Api);',
      'store = injectSpy(Store);',
      'fixture = TestBed.createComponent(CardComponent);',
      'fixture.detectChanges();',
    );

    expect(applied(code)).toContain(
      'fixture = renderShallow(CardComponent, { imports: [RouterStub], providers: [provideAutoSpy(Api)] }).fixture;\n  api = injectSpy(Api);\n  store = injectSpy(Store);\n});',
    );
  });

  it('merges the helper into an import the file already has from the Angular entry', () => {
    const code = `import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';\n${spec(configure, 'fixture = TestBed.createComponent(CardComponent);')}`;

    expect(applied(code)).toContain("import { injectSpy, provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';");
    expect(
      applied(
        `import { renderShallow } from 'vitest-auto-spy/angular';\n${spec(configure, 'fixture = TestBed.createComponent(CardComponent);')}`,
      ),
    ).toMatch(/^import \{ renderShallow \} from 'vitest-auto-spy\/angular';\nbeforeEach/);
  });

  it.each([
    ['no configureTestingModule in the block', ['fixture = TestBed.createComponent(CardComponent);']],
    [
      'a key renderShallow spells differently',
      ['TestBed.configureTestingModule({ imports: [CardComponent], schemas: [] });', 'fixture = TestBed.createComponent(CardComponent);'],
    ],
    [
      'a spread into the configuration',
      ['TestBed.configureTestingModule({ ...base, imports: [CardComponent] });', 'fixture = TestBed.createComponent(CardComponent);'],
    ],
    [
      'a configuration that is not a literal',
      ['TestBed.configureTestingModule(moduleDef);', 'fixture = TestBed.createComponent(CardComponent);'],
    ],
    [
      'a chained compileComponents',
      [
        'TestBed.configureTestingModule({ imports: [CardComponent] }).compileComponents();',
        'fixture = TestBed.createComponent(CardComponent);',
      ],
    ],
    [
      'the component missing from imports',
      ['TestBed.configureTestingModule({ providers: [] });', 'fixture = TestBed.createComponent(CardComponent);'],
    ],
    [
      'imports that are not an array',
      ['TestBed.configureTestingModule({ imports: shared });', 'fixture = TestBed.createComponent(CardComponent);'],
    ],
    [
      'a configured spy between the two',
      [configure, 'injectSpy(Api).load.mockReturnValue(of([]));', 'fixture = TestBed.createComponent(CardComponent);'],
    ],
    ['an injectSpy read into a member', [configure, 'this.api = injectSpy(Api);', 'fixture = TestBed.createComponent(CardComponent);']],
    ['an assignment of something else', [configure, 'api = TestBed.inject(Api);', 'fixture = TestBed.createComponent(CardComponent);']],
    ['a comment the edit would delete', [configure, '// the module is ready', 'fixture = TestBed.createComponent(CardComponent);']],
    ['a render that is not assigned', [configure, 'TestBed.createComponent(CardComponent);']],
    ['a render inside a larger expression', [configure, 'fixture = wrap(TestBed.createComponent(CardComponent));']],
    ['two declarations in one statement', [configure, 'const fixture = TestBed.createComponent(CardComponent), other = 1;']],
    ['a component that is not a name', [configure, 'fixture = TestBed.createComponent(components.card);']],
    ['a render with no component', [configure, 'fixture = TestBed.createComponent();']],
  ])('offers no suggestion for %s', (_label, lines) => {
    expect(verify(spec(...lines))[0]?.suggestions ?? []).toHaveLength(0);
  });

  it('offers no suggestion outside a block, where there is no setup to read', () => {
    expect(verify(stateOnly)[0]?.suggestions ?? []).toHaveLength(0);
  });

  it('offers no suggestion when createComponent carries a second argument', () => {
    const withOptions =
      "const fixture = TestBed.createComponent(CardComponent, { autoDetect: true });\nexpect(fixture.componentInstance.label()).toBe('a');";

    expect(verify(withOptions)[0]?.suggestions ?? []).toHaveLength(0);
  });

  it('offers no suggestion when renderShallow already names something else', () => {
    const shadowed = `
      const renderShallow = 1;
      const fixture = TestBed.createComponent(CardComponent);

      expect(fixture.componentInstance.label()).toBe(renderShallow);
    `;

    expect(verify(shadowed)[0]?.suggestions ?? []).toHaveLength(0);
  });

  it('leaves a fixture obtained through renderShallow alone', () => {
    const shallow = `
      const { component } = renderShallow(CardComponent, { inputs: { total: 3 } });

      expect(component.label()).toBe('3 items');
    `;

    expect(lint(shallow)).toEqual([]);
  });

  it('reports through a DOCUMENT stand-in that only delegates to the real document', () => {
    const standIn = `
      const mockDoc = {
        querySelector: document.querySelector.bind(document),
        querySelectorAll: document.querySelectorAll.bind(document),
        documentElement: document.documentElement,
        location: { href: '/' },
      };
      TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: mockDoc }] });
      const fixture = TestBed.createComponent(ScreenComponent);

      expect(fixture.componentInstance.envLine).toBe('X');
    `;

    expect(lint(standIn)).toEqual([`vitest-auto-spy/${RULE}`]);
  });

  it('still leaves a document read that is not a delegation alone', () => {
    const live = `
      const fixture = TestBed.createComponent(CardComponent);

      expect(document.querySelector('.row')).not.toBeNull();
    `;

    expect(lint(live)).toEqual([]);
  });
});

describe('prefer-render-shallow, { templates: "never" }', () => {
  const RULE = 'prefer-render-shallow';
  const NEVER = { templates: 'never' };

  it('reports a createComponent even when the spec reads the template', () => {
    const reads = `
      const fixture = TestBed.createComponent(CardComponent);

      expect(fixture.nativeElement.textContent).toContain('3 items');
    `;

    expect(lint(reads)).toEqual([]);
    expect(lintWith(reads, NEVER)).toEqual([`vitest-auto-spy/${RULE}`]);
  });

  it('reports the policy, not a claim that the file reads nothing', () => {
    const reads = `
      const fixture = TestBed.createComponent(CardComponent);

      expect(fixture.nativeElement.textContent).toContain('3 items');
    `;

    const policy = verifyWith(reads, NEVER)[0]?.message ?? '';

    expect(policy).toContain("this project set `{ templates: 'never' }`");
    expect(policy).toContain('renderShallow(CardComponent)');
    expect(policy).not.toContain('nothing in this file reads the DOM');
  });

  it('reports keepTemplate, which puts the template back', () => {
    const kept = 'renderShallow(CardComponent, { keepTemplate: true });';

    expect(lint(kept)).toEqual([]);
    expect(lintWith(kept, NEVER)).toEqual([`vitest-auto-spy/${RULE}`]);
  });

  it.each([
    ['inline', "TestBed.createComponent(createDirectiveHost({ template: '<div appX></div>' }));"],
    [
      'through a helper the host reaches as a parameter',
      "const Host = createDirectiveHost({ template: '<div appX></div>' });\nconst hostOf = (c) => TestBed.createComponent(c);",
    ],
  ])('leaves a directive harness alone, built %s', (_label, code) => {
    expect(lintWith(code, NEVER)).toEqual([]);
  });

  it('still reports a component spec that builds no harness', () => {
    const parked = 'const Card = CardComponent;\nTestBed.createComponent(Card);';

    expect(lintWith(parked, NEVER)).toEqual([`vitest-auto-spy/${RULE}`]);
  });

  it('leaves keepTemplate: false and a plain renderShallow alone', () => {
    expect(lintWith('renderShallow(CardComponent, { keepTemplate: false });', NEVER)).toEqual([]);
    expect(lintWith('renderShallow(CardComponent, { inputs: { total: 3 } });', NEVER)).toEqual([]);
  });
});
