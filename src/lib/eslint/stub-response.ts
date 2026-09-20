/**
 * A `Response` written by hand — `{ ok: true, json: async () => data } as Response`, or
 * `createMock<Response>({ … })` — where `stubResponse({ body })` builds the real one.
 *
 * It is the shape every `fetch` tutorial shows, and it answers the two or three members the author
 * thought of and `undefined` for the rest. That is the defect rather than the style: production
 * code reading `response.status`, `response.headers.get('content-type')` or `response.text()` gets
 * `undefined`, and the branch it takes on that is one the real response could never have produced —
 * a test green on a path that does not exist. The strict preset catches the same class of thing on
 * a double the library built; a plain object literal is not one, so nothing was watching this
 * corner.
 *
 * **The evidence is entirely in the syntax**, which is why this rule needs no program: the type
 * argument of `createMock<Response>` and the type an `as Response` names are both written on the
 * line. `no-sync-testbed-await` reads the same kind of fact for the same reason.
 *
 * **What keeps it off a `Response` that is not the platform's.** `Response` is a popular name — an
 * Express handler's, a generated API client's envelope, a domain type a spec declares itself — and
 * for none of those is `stubResponse` the repair. So a report is made only where `Response`
 * resolves to no declaration in the file and no import: the DOM / undici global, which is the only
 * one `stubResponse` builds. A binding with no definitions counts as the global too, because that
 * is what `languageOptions.globals` puts in scope for a project that declares its environment.
 */
import { findBinding } from './bindings';
import { defineRule } from './define-rule';
// `withoutCasts` lives with `prefer-observer-stub` because that is the rule that needed it first;
// `no-hand-assigned-global` already reaches for it the same way.
import { withoutCasts } from './observer-stub';
import { type EsCallExpression, type EsNode, type RuleContext, isIdentifier, isObjectExpression, isTypeReference } from './rule-types';

/** The name the platform gives the constructor `stubResponse` builds from. */
const RESPONSE = 'Response';

/**
 * The helpers that build a double out of a type argument alone.
 *
 * Both are this package's, and both are right for a partial fixture of a *domain* type — which is
 * exactly why they get reached for here too. Neither can produce a body a caller reads: one leaves
 * every member the seed omits `undefined`, the other answers it with a spy, and `response.ok` is
 * not a function.
 */
const TYPE_ARGUMENT_DOUBLES = new Set(['createAutoMock', 'createMock']);

/** Both spellings of the cast, each narrowed to the one that names `Response`. */
const CAST_SELECTORS = [
  'TSAsExpression[typeAnnotation.type="TSTypeReference"][typeAnnotation.typeName.name="Response"]',
  'TSTypeAssertion[typeAnnotation.type="TSTypeReference"][typeAnnotation.typeName.name="Response"]',
];

/**
 * Whether `Response` here is the environment's own.
 *
 * `findBinding` answers `undefined` for a name nothing declares, and a variable with an empty
 * `defs` for one the config declared as a global — both are the platform's. Anything with a
 * definition is this file's `Response`, whatever it is, and none of this rule's advice applies.
 */
function namesPlatformResponse(context: RuleContext, node: EsNode): boolean {
  const binding = findBinding(context.sourceCode.getScope(node), RESPONSE);

  return binding === undefined || binding.defs.length === 0;
}

/** `{ … } as Response` — reported on the cast, so a reader sees the claim and not just the literal. */
function readCast(context: RuleContext, node: EsNode): void {
  // Through `as unknown as Response` as well: the inner cast is the spelling a suite reaches for
  // once the compiler refuses the single one, and it is the same object with the same holes.
  if (isObjectExpression(withoutCasts(node)) && namesPlatformResponse(context, node)) {
    context.report({ node, messageId: 'castResponse' });
  }
}

/** `createMock<Response>(…)` and `createAutoMock<Response>(…)`. */
function readCall(context: RuleContext, node: EsCallExpression): void {
  const helper = isIdentifier(node.callee) ? node.callee.name : undefined;
  const argument = node.typeArguments?.params[0];

  if (helper === undefined || !TYPE_ARGUMENT_DOUBLES.has(helper) || argument === undefined) {
    return;
  }

  if (isTypeReference(argument) && isIdentifier(argument.typeName) && argument.typeName.name === RESPONSE) {
    if (namesPlatformResponse(context, node)) {
      context.report({ node, messageId: 'mockedResponse', data: { helper } });
    }
  }
}

const REPAIR =
  '`stubResponse({ body })` from `vitest-auto-spy/setup` builds the real one from the environment’s own constructor: `body` ' +
  'is serialised as JSON with an `application/json` content type (a string, `Blob` or typed array is sent as it is, `null` is ' +
  'the JSON literal, and an omitted `body` is no body at all), `status` / `ok` / `statusText` / `headers` / `url` are the ' +
  'other fields, and every member the code under test reads is the platform’s own. A body can be read once, so a stub ' +
  'answering more than one call builds one per call — `vi.fn(async () => stubResponse({ body }))`, not `mockResolvedValue`. ' +
  'A `Response` that is not the platform’s — an Express handler’s, a generated client’s envelope — is never reported here: ' +
  'the name has to resolve to the global for this rule to fire at all.';

/** `{ ok: true, json: … } as Response` / `createMock<Response>(…)` → `stubResponse({ body })`. */
export const preferStubResponse = defineRule({
  anchor: '-fetch-and-other-globals',
  description: 'Build a stubbed fetch’s Response with stubResponse(), not an object literal cast to Response',
  messages: {
    castResponse:
      'This is an object literal wearing `Response`’s type, so it answers the members it lists and `undefined` for every ' +
      'other one: `status`, `statusText`, `headers`, `url`, `text()`, `arrayBuffer()`, `clone()`. The cast is what makes that ' +
      'compile, and it is also what makes the gap invisible — the code under test takes a branch on a value the real response ' +
      `could never hand it, and the test is green on a path that does not exist. ${REPAIR}`,
    mockedResponse:
      '`{{helper}}<Response>(…)` builds a partial fixture, which is the right tool for a domain type and the wrong one for ' +
      '`Response`: the members the seed does not name are left `undefined` or answered with a spy, so `response.ok` reads as ' +
      'a function rather than a boolean and `response.json()` resolves whatever the seed said instead of parsing a body. ' +
      `${REPAIR}`,
  },
  create: (context) => ({
    CallExpression: (node: EsCallExpression): void => {
      readCall(context, node);
    },
    [CAST_SELECTORS.join(', ')]: (node: EsNode): void => {
      readCast(context, node);
    },
  }),
});
