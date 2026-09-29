/**
 * A `vi.mock` factory that reads a binding the file declares at the top level outside `vi.hoisted`.
 *
 * Vitest moves `vi.mock` above every import and declaration of the file, so the factory runs when
 * the first import reaches the mocked module — before the `const` it reads is initialised. Only a
 * read the factory makes while it runs counts: one inside a function the factory returns happens
 * later, in a test, when the binding is long initialised.
 */
import { defineRule } from './define-rule';
import {
  type EsAwaitExpression,
  type EsCallExpression,
  type EsNode,
  type EsScope,
  type EsVariable,
  type EsVariableDeclarator,
  type RuleContext,
  isFunctionNode,
  isMemberCall,
} from './rule-types';

const VITEST = new Set(['vi', 'vitest']);
const MOCK = new Set(['mock']);
const HOISTED = new Set(['hoisted']);

function isTopLevel(declaration: EsNode): boolean {
  const { parent } = declaration;

  return parent.type === 'Program' || (parent.type === 'ExportNamedDeclaration' && parent.parent.type === 'Program');
}

/** `vi.hoisted(…)`, awaited or not — the one initialiser that runs before the factory. */
function isHoisted(init: EsNode | null): boolean {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `type === 'AwaitExpression'` is ESTree's own discriminant.
  const call = init?.type === 'AwaitExpression' ? (init as EsAwaitExpression).argument : init;

  return call !== null && isMemberCall(call, VITEST, HOISTED);
}

/** Whether a binding is a top-level `const` / `let` / `var` / `class` the hoisted factory reaches before it is initialised. */
function initialisedLate(variable: EsVariable): boolean {
  const [definition] = variable.defs;

  if (definition?.type === 'ClassName') {
    return isTopLevel(definition.node);
  }

  if (definition?.type !== 'Variable') {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the scope manager records a `Variable` definition on its declarator.
  const declarator = definition.node as EsVariableDeclarator;

  return isTopLevel(declarator.parent) && !isHoisted(declarator.init);
}

/** An instance field's initialiser, which runs when the class is constructed, not when it is declared. */
function isInstanceFieldValue(node: EsNode, child: EsNode): boolean {
  return (
    (node.type === 'PropertyDefinition' || node.type === 'AccessorProperty') &&
    Reflect.get(node, 'static') !== true &&
    Reflect.get(node, 'value') === child
  );
}

/** Whether a read runs later than the factory: a function or an instance field initialiser inside the factory stands between them. */
function isDeferred(identifier: EsNode, factory: EsNode): boolean {
  for (let child = identifier, current = identifier.parent; current !== factory; child = current, current = current.parent) {
    if (isFunctionNode(current) || isInstanceFieldValue(current, child)) {
      return true;
    }
  }

  return false;
}

function within(node: EsNode, container: EsNode): boolean {
  return node.range[0] >= container.range[0] && node.range[1] <= container.range[1];
}

/** The first read of `variable` the factory makes while it runs. */
function eagerRead(variable: EsVariable, factory: EsNode): EsNode | undefined {
  return variable.references.find(
    (reference) =>
      !reference.writeExpr &&
      Reflect.get(reference, 'isValueReference') !== false &&
      within(reference.identifier, factory) &&
      !isDeferred(reference.identifier, factory),
  )?.identifier;
}

function outerScopes(context: RuleContext, factory: EsNode): EsScope[] {
  const scopes: EsScope[] = [];

  for (let scope = context.sourceCode.getScope(factory).upper; scope; scope = scope.upper) {
    scopes.push(scope);
  }

  return scopes;
}

export const noOuterBindingInMockFactory = defineRule({
  name: 'no-outer-binding-in-mock-factory',
  description: 'Declare what a vi.mock factory reads through vi.hoisted — vi.mock runs before the file’s declarations',
  messages: {
    noOuterBindingInMockFactory:
      "`vi.mock` is hoisted above every declaration in the file, so this factory reads `{{name}}` before it is initialised: `Cannot access '{{name}}' before initialization`, or `undefined` for a `var`. Declare it through `vi.hoisted` — `const { {{name}} } = vi.hoisted(() => ({ {{name}}: … }))` — or build it inside the factory; a module the spec only imports inside a test takes `vi.doMock`, which is not hoisted.",
  },
  create: (context) => ({
    CallExpression: (node: EsCallExpression): void => {
      const factory = node.arguments[1];

      if (!factory || !isFunctionNode(factory) || !isMemberCall(node, VITEST, MOCK)) {
        return;
      }

      outerScopes(context, factory)
        .flatMap((scope) => scope.variables)
        .filter(initialisedLate)
        .forEach((variable) => {
          const read = eagerRead(variable, factory);

          if (read) {
            context.report({ node: read, messageId: 'noOuterBindingInMockFactory', data: { name: variable.name } });
          }
        });
    },
  }),
});
