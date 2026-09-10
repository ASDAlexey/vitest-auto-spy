/**
 * `schemas` in a testing module that declares nothing — the charm that protects nobody.
 *
 * A schema is a property of the module's **`declarations`**: `NO_ERRORS_SCHEMA` tells the compiler
 * to stop complaining about unknown elements and attributes in the templates of the components this
 * module declares. A standalone component brought in through `imports` carries its own dependency
 * scope, and the schema never reaches it. So a configuration with `schemas` and no `declarations`
 * has configured nothing at all.
 *
 * **What that costs is not a broken test — it is a false sense of one.** `NO_ERRORS_SCHEMA` is the
 * commonest way to make `NG8001` go away, so a spec carrying it reads as "unknown elements are
 * excused here" to everyone who opens it, and neither the line nor the run says otherwise. The day
 * `declarations` are added the same line starts working, and a typo in a template stops being an
 * error — silently, in a file nobody edited.
 *
 * This is the static twin of `enableAngularDiagnostics({ deadSchemas })`, and the two are worth
 * having separately. The diagnostic knows more — it can see that an `imports` entry really is a
 * standalone component — but it throws inside `it()`, so a suite yields its list one red run at a
 * time. The rule reads one object and hands over the whole list at once, which is what a cleanup is
 * planned from.
 *
 * **The file, not the call, decides.** Angular merges successive `configureTestingModule` calls
 * before the module is instantiated, so `configureTestingModule({ schemas })` in one hook and
 * `configureTestingModule({ declarations })` in another is a live schema written in two statements.
 * Reporting per call would flag it; the rule therefore stays silent for the whole file as soon as
 * any configuration in it declares something.
 *
 * **`TestBed.overrideComponent` / `overrideModule` are outside the rule entirely**, and that is a
 * decision rather than a consequence of the selector — the tests pin it. A schema added there is
 * compensating a real removal the spec made on purpose:
 *
 * ```ts
 * TestBed.overrideComponent(TicketQrCode, {
 *   remove: { imports: [QRCodeComponent] }, // draws on a canvas; jsdom cannot
 *   add: { schemas: [NO_ERRORS_SCHEMA] }, // so the element it left behind needs excusing
 * });
 * ```
 *
 * Take that schema away and the template stops compiling. In a suite where the rule cleaned 85
 * files, every one of the four such blocks was live — `set: { imports: [] }`,
 * `set: { imports: [MockThing] }`, `remove: { imports: [X] }` — so the signal of a live schema on a
 * standalone component is **any interference with the component's own `imports`**, never the
 * module's `declarations`.
 *
 * A `remove: { imports }` is deliberately **not** read as "this file declares something" either. In
 * all four of those files the module-level `schemas` was dead *as well*, and removing it left the
 * specs green — so treating an override as a file-wide silencer would have hidden exactly the
 * findings the cleanup confirmed.
 */
import { defineRule } from './define-rule';
import {
  type EsCallExpression,
  type EsObjectExpression,
  type EsProperty,
  type RuleModule,
  findProperty,
  isArrayExpression,
  isObjectExpression,
} from './rule-types';

/** Whether a configuration key is present and holds a non-empty array. */
function listedIn(config: EsObjectExpression, key: string): EsProperty | undefined {
  const property = findProperty(config, key);

  if (!property) {
    return undefined;
  }

  // A key spelled as anything but a literal array — a spread, a helper call, a name — is a list this
  // rule cannot count, and "cannot count" has to read as "there is one": the alternative is
  // reporting a live schema because the declarations arrived through a variable.
  return !isArrayExpression(property.value) || property.value.elements.length > 0 ? property : undefined;
}

/** The configuration object of a `TestBed.configureTestingModule({ … })` call, when it is a literal. */
function configOf(node: EsCallExpression): EsObjectExpression | undefined {
  const [config] = node.arguments;

  return config && isObjectExpression(config) ? config : undefined;
}

/** `schemas` next to no `declarations` → the schema applies to nothing. */
export const noDeadSchemas: RuleModule = defineRule({
  anchor: '-a-components-children',
  description: 'Do not configure schemas on a testing module that declares nothing — they apply to nothing',
  messages: {
    noDeadSchemas:
      "A schema is a property of the module's `declarations`, and this configuration declares nothing — so `schemas` here excuses nothing. A standalone component brought in through `imports` carries its own dependency scope, and `NO_ERRORS_SCHEMA` never reaches it. Nothing is being silenced: whatever the schema was added for is still unresolved, and the template renders without it. Delete **this** entry, then put the missing directive, component or pipe into the standalone component's own `imports` — or render it through a host built with `createDirectiveHost({ template, scope: [...] })`. Two things to get right while removing it. **Drop the `NO_ERRORS_SCHEMA` import only if nothing else in the file still uses it** — a `TestBed.overrideComponent(X, { set: { imports: [...], schemas: [...] } })` block often does, and that schema is live: it is excusing an element left behind by an import the spec removed on purpose. And **verify with a run, not with a green lint**: this rule has no autofix precisely because nothing else checks the edit — the compiler is silent either way, and removing a live schema by mistake surfaces as `NG0303: Can't bind to 'x' since it isn't a known property` when the tests execute. Leaving the line costs more than the line: it reads as \"unknown elements are excused in this spec\" to everyone who opens it, and the day `declarations` are added it starts being true, so a typo in a template quietly stops being an error.",
  },
  create: (context) => {
    // Collected and decided at the end, because the question "does this **file** declare anything"
    // cannot be answered while the first configuration is still being visited.
    const configs: EsObjectExpression[] = [];
    let declaresSomething = false;

    return {
      'CallExpression[callee.object.name="TestBed"][callee.property.name="configureTestingModule"]': (node: EsCallExpression): void => {
        const config = configOf(node);

        if (!config) {
          return;
        }

        declaresSomething ||= listedIn(config, 'declarations') !== undefined;
        configs.push(config);
      },

      'Program:exit': (): void => {
        if (declaresSomething) {
          return;
        }

        configs.forEach((config) => {
          const schemas = listedIn(config, 'schemas');

          if (schemas) {
            context.report({ node: schemas, messageId: 'noDeadSchemas' });
          }
        });
      },
    };
  },
});
