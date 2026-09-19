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

  it('suggests the renderShallow rewrite and adds the import', () => {
    const [message] = verify(stateOnly);
    const suggestion = message?.suggestions?.[0];

    expect(suggestion?.desc).toContain('renderShallow(CardComponent).fixture');
    expect(suggestion?.fix.text).toBeDefined();
  });

  it('adds no import when renderShallow is already imported', () => {
    const imported = `
      import { renderShallow } from 'vitest-auto-spy/angular';

      const fixture = TestBed.createComponent(CardComponent);

      expect(fixture.componentInstance.label()).toBe('a');
    `;
    const suggestion = verify(imported)[0]?.suggestions?.[0];

    expect(suggestion?.fix.text).toBe('renderShallow(CardComponent).fixture');
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

    expect(policy).toContain('{ templates: "never" }');
    expect(policy).not.toContain('nothing in this file reads either');
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
