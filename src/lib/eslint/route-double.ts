/**
 * `prefer-provide-activated-route` — a hand-built `ActivatedRoute`, reported wherever it is provided.
 *
 * `ActivatedRoute` is the one collaborator where the obvious mock is wrong in a way a green test
 * hides. It keeps `snapshot`, `params`, `queryParams`, `data`, `fragment` and `url` in instance
 * fields, so a hand-written `useValue` knows whichever half its author read first — the component
 * that reads the other half gets `undefined` — and a spec that sets `snapshot.params` and never
 * emits `params` tests a route no navigation can produce. In the monorepo this rule was measured
 * on, 42 providers of a hand-built route sit across 36 spec files, and the shapes are all halves:
 * a lone `snapshot`, an empty `{}`, a `createSpyFromClass(ActivatedRoute)` whose instance fields no
 * longer exist, a `useFactory` assembling the two halves with `mockReadonlyPropGetter` one by one.
 *
 * The repair is not another shape but the library's own route: `provideActivatedRoute()` builds
 * Angular's `ActivatedRoute` over one state record, so the streams and the snapshot cannot
 * disagree, and `injectActivatedRoute().setParams(…)` moves both mid-test, in the order and with
 * the equality a navigation uses. That is also why `provideAutoSpy(ActivatedRoute)` is reported
 * rather than left alone: a spy reads the prototype, an `ActivatedRoute` has nothing there, so
 * every field the component reads is `undefined` until the spec seeds it — the half-route failure
 * with a cast-friendly face.
 *
 * **What stays silent.** `provideActivatedRoute(…)` itself, by shape — it is a call, not a
 * descriptor. A descriptor whose value comes from `createActivatedRoute(…)` — the standalone
 * factory, spelled `.route`, destructured, or built inside a `useFactory` — because that is the
 * library's non-TestBed spelling of the same route. And any other token: the name is read as
 * written, the same last resort the token rules use, so a project-local class that happens to be
 * called `ActivatedRoute` is out of scope rather than half-covered.
 */
import { findBinding } from './bindings';
import { defineRule } from './define-rule';
import {
  type EsCallExpression,
  type EsIdentifier,
  type EsNode,
  type EsObjectExpression,
  type RuleContext,
  type RuleModule,
  findProperty,
  isCallExpression,
  isIdentifier,
  isMemberExpression,
  isVariableDeclarator,
} from './rule-types';

/** The slot a hand-built route arrives in, for the message to name. */
const SLOTS = ['useValue', 'useClass', 'useFactory', 'useExisting'] as const;

/** Whether a `provide:` value names Angular's route class. */
function namesActivatedRoute(provide: EsNode | undefined): provide is EsIdentifier {
  return provide !== undefined && isIdentifier(provide) && provide.name === 'ActivatedRoute';
}

/** An ESLint node, as opposed to the metadata every node also carries. */
function isEsNode(value: unknown): value is EsNode {
  return typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string';
}

/**
 * Whether `createActivatedRoute(…)` is anywhere in a subtree — the standalone factory, so the
 * descriptor is the library's own spelling of the route rather than a hand-built half.
 *
 * Walked by hand because the walk has to go *down* — `hasAncestor` answers up — and skipping
 * `parent` on every step, which is the one key that would otherwise walk the whole file and then
 * some.
 */
function mentionsRouteFactory(node: EsNode): boolean {
  if (isCallExpression(node) && isIdentifier(node.callee) && node.callee.name === 'createActivatedRoute') {
    return true;
  }

  return Object.entries(node)
    .filter(([key]) => key !== 'parent')
    .some(([, value]) =>
      Array.isArray(value)
        ? value.some((item) => isEsNode(item) && mentionsRouteFactory(item))
        : isEsNode(value) && mentionsRouteFactory(value),
    );
}

/**
 * The one name a hand-built route hides behind — `const route = { snapshot: … }` parked above the
 * TestBed — resolved far enough to see whether the name holds the library's factory after all.
 *
 * All three spellings a name can arrive in are read: a plain name, `.route` off a name, and a
 * destructure — `const { route } = createActivatedRoute(…)` parks the route under a name whose
 * declarator init is the factory call, which is the form a spec keeping the driving handle next to
 * the TestBed writes. Generous on purpose — this is the exemption, so a name this reading cannot
 * settle is reported rather than excused, and a name it can settle in the factory's favour is
 * silent whatever run order would do.
 */
function exemptDescriptor(context: RuleContext, descriptor: EsObjectExpression): boolean {
  if (mentionsRouteFactory(descriptor)) {
    return true;
  }

  const useValue = findProperty(descriptor, 'useValue');
  const value = useValue?.value;
  const root =
    value !== undefined
      ? isIdentifier(value)
        ? value
        : isMemberExpression(value) && isIdentifier(value.object)
          ? value.object
          : undefined
      : undefined;

  if (!root) {
    return false;
  }

  const binding = findBinding(context.sourceCode.getScope(root), root.name);
  const written = binding?.references.flatMap((reference) => (reference.writeExpr ? [reference.writeExpr] : [])) ?? [];
  const declared =
    binding?.defs.flatMap((definition) => (isVariableDeclarator(definition.node) && definition.node.init ? [definition.node.init] : [])) ??
    [];

  return [...written, ...declared].some(mentionsRouteFactory);
}

/** The slot the report names: the key the descriptor actually carries, `value` when it carries none. */
function slotOf(descriptor: EsObjectExpression): string {
  return SLOTS.find((name) => findProperty(descriptor, name) !== undefined) ?? 'value';
}

export const preferProvideActivatedRoute: RuleModule = defineRule({
  anchor: '-an-activatedroute-whose-halves-agree--vitest-auto-spyangular-router',
  description:
    'Provide ActivatedRoute with provideActivatedRoute() — a hand-built half knows either the streams or the snapshot, never both',
  messages: {
    preferProvideActivatedRoute:
      "`ActivatedRoute` is being provided as a hand-built `{{slot}}`. The real class keeps `snapshot`, `params`, `queryParams`, `data`, `fragment` and `url` in instance fields, so a double written by hand holds whichever half its author read first and `undefined` in the other — and a spec that sets `snapshot.params` without emitting `params` tests a route no navigation can produce. `provideActivatedRoute({ params: { id: '1' } })` from `vitest-auto-spy/angular-router` is Angular's own `ActivatedRoute` over one state record: the streams and the snapshot cannot disagree, `injectActivatedRoute()` is the handle, and its `setParams({ id: '2' })` moves both mid-test the way a navigation does.",
    preferProvideActivatedRouteOverSpy:
      "`provideAutoSpy(ActivatedRoute)` reads the prototype, and every half of an `ActivatedRoute` — `snapshot`, `params`, `queryParams`, `data`, `fragment`, `url` — is an instance field: the spy has none of them, so each read is `undefined` until the spec seeds it one by one. `provideActivatedRoute({ params: { id: '1' } })` from `vitest-auto-spy/angular-router` builds the real class over one state record, and `injectActivatedRoute().setParams({ id: '2' })` moves the streams and the snapshot together, the way a navigation does.",
  },
  create: (context) => ({
    ObjectExpression: (node: EsObjectExpression): void => {
      const provide = findProperty(node, 'provide');

      if (!provide || !namesActivatedRoute(provide.value) || exemptDescriptor(context, node)) {
        return;
      }

      context.report({ node: provide, messageId: 'preferProvideActivatedRoute', data: { slot: slotOf(node) } });
    },

    CallExpression: (node: EsCallExpression): void => {
      const [token] = node.arguments;

      if (isIdentifier(node.callee) && node.callee.name === 'provideAutoSpy' && namesActivatedRoute(token)) {
        context.report({ node, messageId: 'preferProvideActivatedRouteOverSpy' });
      }
    },
  }),
});
