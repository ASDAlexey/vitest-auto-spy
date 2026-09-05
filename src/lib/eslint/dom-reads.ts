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
import { PACKAGE, bindingState, insertImport } from './bindings';
import type { EsCallExpression, EsFix, RuleContext, SuggestionDescriptor } from './rule-types';

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
 * at all. It is an option rather than a second rule because every rule this plugin ships is on and
 * `error`, and a policy that turns a working component suite red cannot be that. Measured before it
 * was offered: on one consumer suite `'never'` took 18 of 40 tests in a component spec red and
 * coverage from 100 % to 95.7 %, because the `computed`s and handlers a template reaches stop
 * executing. That cost belongs to whoever chooses it.
 */
export function templatePolicy(context: RuleContext): 'as-needed' | 'never' {
  return Reflect.get(Object(context.options[0]), 'templates') === 'never' ? 'never' : 'as-needed';
}

/** What `prefer-render-shallow` reports, kept here so `rules.ts` stays inside its line budget. */
export const RENDER_MESSAGES = {
  keepTemplate:
    '`keepTemplate: true` puts the real template back, and this project set `{ templates: "never" }`. Drop it — or, when the component genuinely reads its own template through `viewChild` or content projection, silence this line, because the alternative is a spec that cannot reach the component at all.',
  preferRenderShallow:
    '`TestBed.createComponent` pays for compiling the template and instantiating the whole child subtree, and nothing in this file reads either — no `nativeElement`, no `debugElement`, no `By.css`, no `querySelector`. `renderShallow(X)` brings the same component up through the same `TestBed` with the children dropped and the template blank, and leaves inputs, signals, lifecycle hooks and DI exactly where they were; `fixture` is still a real `ComponentFixture`. What it buys is measured in `bench-angular/`: **0.24×** the per-test cycle at 100 children and **0.05×** at 400 — but at **zero** children the two are level (measurements straddle 1.0, and it is the noisiest row in the benchmark), so a leaf component gains nothing and this report is worth ignoring there. Reach for `{ keepTemplate: true }` when the component reads its own template through `viewChild` or content projection, which this rule cannot see from the spec.',
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

/** Whether `source` reads the rendered template anywhere. */
export function readsRenderedTemplate(source: string): boolean {
  return TEMPLATE_READS.some((member) => source.includes(member));
}

/**
 * The rewrite, offered rather than applied.
 *
 * It is a **suggestion** and not a `--fix` for one reason: `renderShallow` calls
 * `configureTestingModule` itself, adds `NO_ERRORS_SCHEMA` and runs the first change detection. That
 * is the right module for a spec that reads no markup, but it is not the module the file had, and
 * `--fix` runs unattended across a repository. A spec that already instantiated the module — any
 * `TestBed.inject` before this line — would start throwing "Cannot configure the test module when
 * the test module has already been instantiated", and finding out from a red suite is worse than
 * pressing the suggestion and reading the diff.
 *
 * Offered only for `TestBed.createComponent(X)` with the component alone: the two-argument form
 * carries a `ComponentFixtureAutoDetect`-style options object that `renderShallow` spells
 * differently, and a rewrite that dropped it would be silent damage.
 */
export function renderShallowSuggestion(context: RuleContext, node: EsCallExpression): SuggestionDescriptor | undefined {
  const [component, ...extra] = node.arguments;
  const state = bindingState(context.sourceCode.getScope(node), 'renderShallow');

  if (!component || extra.length > 0 || state === 'taken') {
    return undefined;
  }

  const replacement = `renderShallow(${context.sourceCode.getText(component)}).fixture`;

  return {
    desc: `Render without the children and the template: ${replacement}`,
    fix: (fixer): EsFix[] => {
      const edits = [fixer.replaceText(node, replacement)];

      if (state === 'free') {
        edits.push(insertImport(fixer, `import { renderShallow } from '${PACKAGE}/angular';`));
      }

      return edits;
    },
  };
}
