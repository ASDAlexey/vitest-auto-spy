import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'prefer-render-shallow';
const NEVER = { templates: 'never' };

function verify(code: string): LintMessage[] {
  return runRule(RULE, code, { options: NEVER });
}

function reads(code: string): string[] {
  return verify(code).map((message) => message.message.split(' ')[0] ?? '');
}

describe('prefer-render-shallow, { templates: "never" } on a whole spec', () => {
  it('reports every DOM read, once per statement, and links to the recipe', () => {
    const code = [
      'const { component, fixture } = renderShallow(CardComponent);',
      "expect(fixture.nativeElement.querySelector('.row').textContent).toBe('x');",
      'fixture.debugElement.query(By.all());',
      "expect(el.classList).toContain('open');",
      'getComputedStyle(el);',
      "el['innerText'];",
    ].join('\n');
    const messages = verify(code);

    expect(messages.map((message) => message.line)).toEqual([2, 3, 4, 5, 6]);
    expect(messages[0]?.message).toContain('`nativeElement` reads the DOM');
    expect(messages[0]?.message).toContain('/guides/testing-without-the-dom');
  });

  it('reports the document, however the spec reaches it', () => {
    expect(reads('document.body.append(host);')).toEqual(['`document`']);
    expect(reads('const doc = TestBed.inject(DOCUMENT);')).toEqual(['`DOCUMENT`']);
    expect(reads('const doc = inject(DOCUMENT);')).toEqual(['`DOCUMENT`']);
    expect(reads('const doc = injectSpy(DOCUMENT);')).toEqual(['`DOCUMENT`']);
    expect(reads('TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: fake }] });')).toEqual([]);
    expect(reads('const document = fakeDocument();\ndocument.title;')).toEqual([]);
    expect(reads('win.document;\nconst x = { document: 1 };\nlog(DOCUMENT);\nDOCUMENT();\nnew Holder(DOCUMENT);')).toEqual([]);
    expect(reads("strategies.By;\nconst By = 1;\nrow['id'];")).toEqual([]);
  });

  it('reports a component declared with markup, and a template handed to a shallow render', () => {
    const code = [
      "@Component({ selector: 'host', template: '<app-card />' }) class Host {}",
      "@Component({ templateUrl: './host.html' }) class Other {}",
      "@Component({ template: '' }) class Blank {}",
      '@Component({ template: `` }) class AlsoBlank {}',
      "renderShallow(CardComponent, { template: '<p>{{ total }}</p>' });",
      'prepareShallow(CardComponent, { template: `<p></p>` });',
      "renderShallow(CardComponent, { template: '' });",
    ].join('\n');

    expect(verify(code).map((message) => [message.line, message.message.slice(0, 20)])).toEqual([
      [1, 'This `@Component` re'],
      [2, 'This `@Component` re'],
      [5, '`template:` puts mar'],
      [6, '`template:` puts mar'],
    ]);
  });

  it('leaves templates that are not markup of the spec alone', () => {
    const code = [
      "@Pipe({ name: 'x', template: '<p></p>' }) class P {}",
      "Component({ template: '<p></p>' });",
      "build({ template: '<p></p>' });",
      "renderShallow(CardComponent, options, { template: '<p></p>' });",
      "renderShallow({ template: '<p></p>' });",
      "renderShallow(CardComponent, { templateUrl: './x.html' });",
      "const config = { template: '<p></p>' };",
      "factory.renderShallow(CardComponent, { template: '<p></p>' });",
      "const options = { ['template']: '<p></p>' };",
    ].join('\n');

    expect(verify(code)).toEqual([]);
  });

  it('keeps a directive harness file legal, DOM reads included', () => {
    const code = [
      "const { fixture } = createDirectiveHost({ template: '<div appTooltip></div>', scope: [TooltipDirective] });",
      "expect(fixture.nativeElement.querySelector('div').classList).toContain('open');",
      "@Component({ template: '<div appTooltip></div>' }) class Host {}",
    ].join('\n');

    expect(verify(code)).toEqual([]);
  });

  it('adds nothing under the default policy', () => {
    expect(runRule(RULE, "document.body;\n@Component({ template: '<p></p>' }) class Host {}")).toEqual([]);
  });
});
