/**
 * Whether a spec ever reads the rendered template.
 *
 * The question decides `prefer-render-shallow`, and it is asked of the **file** rather than of the
 * fixture the call returned. Following one variable would miss the shapes a component suite is
 * actually written in — the fixture parked in a `let` and filled in `beforeEach`, a `createFixture()`
 * helper that returns it, a `debugElement` read through a local alias — and a rule that reports on
 * half of them is worse than one that reports on none. One DOM read anywhere silences the file, so
 * the rule under-reports by construction and never claims a spec reads nothing when it does.
 *
 * A read is looked for in the **code**, not the text: a comment, a string literal and the key of an
 * object the spec builds itself (`{ getAttribute: 'nope' }`) all spell the word and read nothing, and
 * each of them used to silence every `createComponent` in the file.
 */
import { DOCS } from '../message-link';
import { findBinding } from './bindings';
import {
  anyInSubtree,
  isCallExpression,
  isFunctionNode,
  isIdentifier,
  isMemberExpression,
  propertyName,
  propertyValue,
} from './rule-types';
import type { EsNode, RuleContext, RuleListener } from './rule-types';

/**
 * Members and helpers that only mean something against a rendered template.
 *
 * Matched as substrings of an identifier, not resolved: a `querySelector` on a node pulled out three
 * helpers ago, a `nativeElementOf(fixture)` helper and a `textContent` read inside a matcher all
 * count, and each one is a reason to leave the file alone.
 */
const TEMPLATE_READS = [
  'nativeElement',
  'debugElement',
  'elementRef',
  'hostElement',
  'queryElement',
  'querySelector',
  'getComputedStyle',
  'triggerEventHandler',
  'innerHTML',
  'innerText',
  'textContent',
  'getAttribute',
  'classList',
  'shadowRoot',
];

/** The `By` predicates, whose own names are too common to count without the `By.` in front. */
const BY_PREDICATES = new Set(['css', 'directive']);

/** Nodes whose key declares a member rather than reads one: an object literal, a class, a type. */
const MEMBER_DECLARATIONS = new Set(['Property', 'PropertyDefinition', 'MethodDefinition', 'TSPropertySignature', 'TSMethodSignature']);

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

/** The recipe every `{ templates: 'never' }` finding links to: what a spec asserts once the DOM is gone. */
export const TESTING_WITHOUT_THE_DOM = `${DOCS}/guides/testing-without-the-dom`;

/** What `prefer-render-shallow` reports, kept here so `rules.ts` stays inside its line budget. */
export const RENDER_MESSAGES = {
  domAccess: `\`{{read}}\` reads the DOM, and this project set \`{ templates: 'never' }\`, which leaves markup to e2e. Assert on the component instead — its signals, outputs and the doubles it called: ${TESTING_WITHOUT_THE_DOM}`,
  templateInSpec: `This \`@Component\` renders a template of its own, and this project set \`{ templates: 'never' }\`. Render the component under test with \`renderShallow\`; a directive gets \`createDirectiveHost\`, the one host the policy allows: ${TESTING_WITHOUT_THE_DOM}`,
  shallowTemplate: `\`template:\` puts markup back into the shallow render, and this project set \`{ templates: 'never' }\`. Drop it and assert on the component's state; a directive gets \`createDirectiveHost\`: ${TESTING_WITHOUT_THE_DOM}`,
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
 * Asked of the file for the same reason a template read is: the host reaches
 * `TestBed.createComponent` through a `hostOf(component)` helper as often as it arrives inline, and
 * an exemption that only recognised the inline form would send every directive suite to a
 * per-line disable.
 */
function buildsDirectiveHarness(context: RuleContext): boolean {
  return anyInSubtree(context, context.sourceCode.ast, (node) => isIdentifier(node) && node.name === 'createDirectiveHost', true);
}

/** The name a node spells in code — an identifier, or the string of `el['textContent']`. */
function spelledName(node: EsNode): string | undefined {
  if (isIdentifier(node)) {
    return node.name;
  }

  const value: unknown = Reflect.get(node, 'value');

  return node.type === 'Literal' && isMemberExpression(node.parent) && node.parent.property === node && typeof value === 'string'
    ? value
    : undefined;
}

/** Whether `node` is the key of a member being declared, not read: `{ getAttribute: 'nope' }`. */
function declaresMember(node: EsNode): boolean {
  const { parent } = node;

  if (!MEMBER_DECLARATIONS.has(parent.type) || Reflect.get(parent, 'key') !== node || Reflect.get(parent, 'computed') === true) {
    return false;
  }

  // A destructuring key reads the member, and a shorthand key is its own value.
  return parent.type !== 'Property' || (parent.parent.type === 'ObjectExpression' && Reflect.get(parent, 'value') !== node);
}

/**
 * A `DOCUMENT` stand-in delegating to the real one, which is not a read of any rendered template.
 *
 * `{ provide: DOCUMENT, useValue: { querySelector: document.querySelector.bind(document), … } }` is
 * how a spec swaps `location` or `defaultView` while leaving the rest of the document alone, and
 * every key it copies over is a word from {@link TEMPLATE_READS}. Counted, that mock answered "this
 * file reads the template" and the rule went quiet on exactly the spec it exists for — measured on a
 * consumer suite, where the only component spec rendering a template nobody reads was also the only
 * one silenced.
 *
 * Just the `name: document.name` shape, and only where the two names match: that is a delegation and
 * can be nothing else. A bare `document.querySelector('.row')` elsewhere is left counting, because a
 * fixture attached to the document is read exactly that way.
 */
function delegatesToDocument(name: string, member: EsNode): boolean {
  if (!isMemberExpression(member) || !isIdentifier(member.object) || member.object.name !== 'document') {
    return false;
  }

  let value: EsNode = member;

  while (
    (isMemberExpression(value.parent) && value.parent.object === value) ||
    (isCallExpression(value.parent) && value.parent.callee === value)
  ) {
    value = value.parent;
  }

  return propertyName(value.parent) === name && Reflect.get(value.parent, 'value') === value;
}

/** Whether one node of the file reads the rendered template. */
function readsTemplate(node: EsNode): boolean {
  const name = spelledName(node);

  if (name === undefined) {
    return false;
  }

  const { parent } = node;

  if (isMemberExpression(parent) && parent.property === node && isIdentifier(parent.object) && parent.object.name === 'By') {
    return BY_PREDICATES.has(name);
  }

  return TEMPLATE_READS.some((member) => name.includes(member)) && !declaresMember(node) && !delegatesToDocument(name, parent);
}

/**
 * Whether this file may render a template the rule would otherwise report.
 *
 * The two policies ask different questions of the same file — "is the template read back" against
 * "is this a directive harness" — and both are about the file, which is why the caller asks this
 * once and keeps the answer. One walk, stopping at the first match: on a 1.7 MB spec the whole-file
 * question is most of what the plugin costs.
 */
export function rendersOnlyWhatIsRead(context: RuleContext): boolean {
  return templatePolicy(context) === 'as-needed'
    ? anyInSubtree(context, context.sourceCode.ast, readsTemplate, true)
    : buildsDirectiveHarness(context);
}

/** The calls that resolve a token — where `DOCUMENT` hands a spec the real document. */
const INJECTORS = new Set(['inject', 'injectSpy']);

/** The shallow-render helpers whose `template:` option is markup of the spec's own. */
const SHALLOW_RENDERS = new Set(['renderShallow', 'prepareShallow']);

/** `document` itself, as a value the spec reads — not a key, not a member, not a local of that name. */
function isGlobalDocument(context: RuleContext, node: EsNode): boolean {
  const { parent } = node;

  if (!isIdentifier(node) || node.name !== 'document' || declaresMember(node)) {
    return false;
  }

  if (isMemberExpression(parent) && parent.property === node && !parent.computed) {
    return false;
  }

  return (findBinding(context.sourceCode.getScope(node), 'document')?.defs.length ?? 0) === 0;
}

/** `inject(DOCUMENT)`, `TestBed.inject(DOCUMENT)`. */
function injectsDocument(node: EsNode): boolean {
  const { parent } = node;

  if (!isIdentifier(node) || node.name !== 'DOCUMENT' || !isCallExpression(parent) || parent.callee === node) {
    return false;
  }

  const callee = isMemberExpression(parent.callee) ? parent.callee.property : parent.callee;

  return isIdentifier(callee) && INJECTORS.has(callee.name);
}

/** Any `By.*` predicate — under the policy `By.all()` is as much a DOM query as `By.css()`. */
function isByQuery(node: EsNode): boolean {
  return isIdentifier(node) && node.name === 'By' && isMemberExpression(node.parent) && node.parent.object === node;
}

/** The node types whose children are statements. */
const STATEMENT_LISTS = new Set(['Program', 'BlockStatement', 'StaticBlock', 'SwitchCase', 'ClassBody']);

/** The statement a node belongs to, so a line reading three DOM members is reported once. */
function statementOf(node: EsNode): EsNode {
  let current = node;

  while (!STATEMENT_LISTS.has(current.parent.type) && !(isFunctionNode(current.parent) && current.parent.body === current)) {
    current = current.parent;
  }

  return current;
}

/** Whether a `template:` value renders something: anything but an empty string. */
function rendersMarkup(value: EsNode): boolean {
  const text: unknown = value.type === 'Literal' ? Reflect.get(value, 'value') : undefined;
  const quasis: unknown = value.type === 'TemplateLiteral' ? Reflect.get(value, 'quasis') : undefined;
  const blankTemplate =
    Array.isArray(quasis) && quasis.length === 1 && Reflect.get(Object(Reflect.get(Object(quasis[0]), 'value')), 'raw') === '';

  return text !== '' && !blankTemplate;
}

/** Whether a property is an option of a `renderShallow(Cmp, { … })` call, written inline. */
function isShallowOption(property: EsNode): boolean {
  const call = property.parent.parent;

  return (
    isCallExpression(call) && isIdentifier(call.callee) && SHALLOW_RENDERS.has(call.callee.name) && call.arguments[1] === property.parent
  );
}

/** Whether a property is the metadata of a `@Component({ … })` decorator. */
function isComponentMetadata(property: EsNode): boolean {
  const call = property.parent.parent;

  return isCallExpression(call) && call.parent.type === 'Decorator' && isIdentifier(call.callee) && call.callee.name === 'Component';
}

/**
 * The `{ templates: 'never' }` half that is about the whole spec rather than one render: every DOM
 * read, a `@Component` with markup of its own, and a shallow render handed a `template:`. A directive
 * harness file is exempt from all of it, for the reason `buildsDirectiveHarness` gives.
 */
export function templateFreeListeners(context: RuleContext): RuleListener {
  let exempt: boolean | undefined;
  const reported = new Set<EsNode>();

  const exempted = (): boolean => (exempt ??= buildsDirectiveHarness(context));

  const readOf = (node: EsNode): void => {
    const statement = statementOf(node);

    if (reported.has(statement) || exempted()) {
      return;
    }

    if (readsTemplate(node) || isGlobalDocument(context, node) || injectsDocument(node) || isByQuery(node)) {
      reported.add(statement);
      context.report({ node, messageId: 'domAccess', data: { read: context.sourceCode.getText(node) } });
    }
  };

  return {
    Identifier: readOf,
    'MemberExpression > Literal.property': readOf,
    Property: (node: EsNode): void => {
      const name = propertyName(node);
      const markup = name === 'templateUrl' || (name === 'template' && rendersMarkup(propertyValue(node)));

      if (!markup || exempted()) {
        return;
      }

      if (isComponentMetadata(node)) {
        context.report({ node, messageId: 'templateInSpec' });
      } else if (name === 'template' && isShallowOption(node)) {
        context.report({ node, messageId: 'shallowTemplate' });
      }
    },
  };
}
