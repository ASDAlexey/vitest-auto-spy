/**
 * Whether a spec ever reads the rendered template.
 *
 * The question decides `prefer-render-shallow`, and it is asked of the **file** rather than of the
 * fixture the call returned. Following one variable would miss the shapes a component suite is
 * actually written in — the fixture parked in a `let` and filled in `beforeEach`, a `createFixture()`
 * helper that returns it, a `debugElement` read through a local alias — and a rule that reports on
 * half of them is worse than one that reports on none. One DOM read anywhere silences the file, so
 * the rule under-reports by construction and never claims a spec reads nothing when it does.
 */
import type { RuleContext } from './rule-types';

/**
 * Members and helpers that only mean something against a rendered template.
 *
 * Matched as substrings of the source, not resolved: `By.css` reached through an import alias, a
 * `querySelector` on a node pulled out three helpers ago and a `textContent` read inside a matcher
 * all count, and each one is a reason to leave the file alone.
 */
const TEMPLATE_READS = [
  'nativeElement',
  'debugElement',
  'elementRef',
  'querySelector',
  'getComputedStyle',
  'triggerEventHandler',
  'innerHTML',
  'innerText',
  'textContent',
  'getAttribute',
  'classList',
  'shadowRoot',
  'By.css',
  'By.directive',
];

/**
 * How much of a template a project is willing to render, from the rule's option.
 *
 * `'as-needed'` — the default — reports only the render nobody reads, which is a defect-free finding
 * about cost. `'never'` is a **policy**: markup is e2e's business, so no spec renders a real template
 * at all. It is an option rather than a second rule because every rule this plugin ships is on in
 * `recommended`, and a policy nobody in the project agreed to cannot be — the cost finding itself only
 * earns a place there as a `warn`, and `'never'` would point that warning at every component spec.
 * Measured before it was offered: on one consumer suite `'never'` took 18 of 40 tests in a component
 * spec red and coverage from 100 % to 95.7 %, because the `computed`s and handlers a template reaches
 * stop executing. That cost belongs to whoever chooses it.
 */
export function templatePolicy(context: RuleContext): 'as-needed' | 'never' {
  return Reflect.get(Object(context.options[0]), 'templates') === 'never' ? 'never' : 'as-needed';
}

/** What `prefer-render-shallow` reports, kept here so `rules.ts` stays inside its line budget. */
export const RENDER_MESSAGES = {
  keepTemplate:
    "`keepTemplate: true` puts the real template back, and this project set `{ templates: 'never' }`. Drop it, unless the component reads its own template through `viewChild` or content projection.",
  templatesNever:
    "`TestBed.createComponent({{component}})` renders the template, and this project set `{ templates: 'never' }`, which leaves markup to e2e. Render it with `renderShallow({{component}})`: the same component, inputs, signals and DI, with the children dropped and the template blank.",
  preferRenderShallow:
    '`TestBed.createComponent({{component}})` compiles the template and builds every child, and nothing in this file reads the DOM. Render it with `renderShallow({{component}})`, which keeps inputs, signals, hooks and DI and drops the children; add `{ keepTemplate: true }` if the component reads its own template through `viewChild`.',
};

/**
 * Whether the file builds a directive harness, and is therefore exempt from `{ templates: 'never' }`.
 *
 * `createDirectiveHost({ template, scope })` exists because a directive has no other way to be
 * reached: it attaches to an element, so something must render that element. That template is the
 * harness, not the markup under test, and banning it would ban testing directives at all — including
 * the way this package's own documentation recommends.
 *
 * Asked of the file for the same reason `readsRenderedTemplate` is: the host reaches
 * `TestBed.createComponent` through a `hostOf(component)` helper as often as it arrives inline, and
 * an exemption that only recognised the inline form would send every directive suite to a
 * per-line disable.
 */
export function buildsDirectiveHarness(source: string): boolean {
  return source.includes('createDirectiveHost');
}

/**
 * A `DOCUMENT` stand-in delegating to the real one, which is not a read of any rendered template.
 *
 * `{ provide: DOCUMENT, useValue: { querySelector: document.querySelector.bind(document), … } }` is
 * how a spec swaps `location` or `defaultView` while leaving the rest of the document alone, and
 * every key it copies over is a word from {@link TEMPLATE_READS}. Asked of the whole file, that mock
 * answered "this file reads the template" and the rule went quiet on exactly the spec it exists for
 * — measured on a consumer suite, where the only component spec rendering a template nobody reads
 * was also the only one silenced.
 *
 * Just the `name: document.name` shape, and only where the two names match: that is a delegation and
 * can be nothing else. A bare `document.querySelector('.row')` elsewhere is left counting, because a
 * fixture attached to the document is read exactly that way.
 */
const DOCUMENT_DELEGATION = /\b(\w+)\s*:\s*document\s*\.\s*\1\b/g;

/**
 * Whether `source` reads the rendered template anywhere.
 *
 * The delegation is stripped once rather than inside the search: rebuilding the whole file per
 * member — fourteen times per `createComponent`, and again for the next one — was 77 % of the
 * plugin's time on a 1.7 MB spec. The answer is about the file, so the caller asks it once.
 */
export function readsRenderedTemplate(source: string): boolean {
  const read = source.replace(DOCUMENT_DELEGATION, '');

  return TEMPLATE_READS.some((member) => read.includes(member));
}

/**
 * Whether this file may render a template the rule would otherwise report.
 *
 * The two policies ask different questions of the same text — "is the template read back" against
 * "is this a directive harness" — and both are about the file, which is why the caller asks this
 * once and keeps the answer.
 */
export function rendersOnlyWhatIsRead(context: RuleContext): boolean {
  const source = context.sourceCode.getText();

  return templatePolicy(context) === 'as-needed' ? readsRenderedTemplate(source) : buildsDirectiveHarness(source);
}
