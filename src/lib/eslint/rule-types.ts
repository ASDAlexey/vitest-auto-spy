/**
 * The slice of ESTree/ESLint this plugin needs, declared locally.
 *
 * Importing `eslint`'s own types would put `@types/eslint` in the way of every consumer of the
 * published `.d.ts`, for a plugin most of them never load. The shapes below are the ones the rules
 * actually read, and the guards narrow to them at runtime — the same check ESLint itself performs.
 */

/** Any ESTree node, as ESLint hands it to a rule. */
export interface EsNode {
  type: string;
  /** ESLint sets this on every node a rule can visit (only `Program` has none, and no rule here visits it). */
  parent: EsNode;
}

export interface EsIdentifier extends EsNode {
  name: string;
}

export interface EsLiteral extends EsNode {
  value: unknown;
}

export interface EsProperty extends EsNode {
  key: EsNode;
  value: EsNode;
  computed: boolean;
}

export interface EsVariableDeclarator extends EsNode {
  init: EsNode | null;
}

/** A function expression or arrow, as the second argument of a test or hook. */
export interface EsFunction extends EsNode {
  params: EsNode[];
}

export interface EsObjectExpression extends EsNode {
  properties: EsNode[];
}

export interface EsCallExpression extends EsNode {
  callee: EsNode;
  arguments: EsNode[];
}

export interface EsMemberExpression extends EsNode {
  object: EsNode;
  property: EsNode;
}

/** What a rule passes to `context.report`. */
export interface ReportDescriptor {
  node: EsNode;
  messageId: string;
}

/** The sliver of ESLint's rule context the rules use. */
export interface RuleContext {
  report(descriptor: ReportDescriptor): void;
}

/**
 * Visitor map returned by `create`, keyed by node type or esquery selector.
 *
 * The parameter is `never` so that each visitor may declare the concrete node type its selector
 * guarantees — a runtime re-check of what the selector already matched would be an untestable
 * branch, which is exactly what this library's own 100% coverage gate forbids.
 */
export type RuleListener = Record<string, (node: never) => void>;

/** An ESLint rule module, as `plugin.rules[name]`. */
export interface RuleModule {
  meta: {
    type: 'problem' | 'suggestion';
    docs: { description: string; url: string };
    messages: Record<string, string>;
    schema: [];
  };
  create(context: RuleContext): RuleListener;
}

/** Narrow to an object literal. */
export function isObjectExpression(node: EsNode): node is EsObjectExpression {
  return node.type === 'ObjectExpression';
}

/** Narrow to a call expression. */
export function isCallExpression(node: EsNode): node is EsCallExpression {
  return node.type === 'CallExpression';
}

/** Narrow to a member expression. */
export function isMemberExpression(node: EsNode): node is EsMemberExpression {
  return node.type === 'MemberExpression';
}

/** Narrow to an identifier — the shape a non-computed member key takes. */
export function isIdentifier(node: EsNode): node is EsIdentifier {
  return node.type === 'Identifier';
}

/** The static name of a property key (`{ foo: … }`, `{ 'foo': … }`), or `undefined` when computed. */
export function propertyName(node: EsNode): string | undefined {
  if (node.type !== 'Property') {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `type === 'Property'` is ESTree's own discriminant; the local interface mirrors the shape ESLint guarantees for it.
  const property = node as EsProperty;

  if (property.computed) {
    return undefined;
  }

  if (property.key.type === 'Identifier') {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- same discriminant narrowing, for the key node.
    return (property.key as EsIdentifier).name;
  }

  // A non-computed key is an `Identifier` or a `Literal` — there is no third form to fall through to.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- same discriminant narrowing, for a quoted or numeric key.
  return String((property.key as EsLiteral).value);
}

/** The property named `name` of an object literal, if it has one. */
export function findProperty(object: EsObjectExpression, name: string): EsProperty | undefined {
  const found = object.properties.find((property) => propertyName(property) === name);

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `propertyName` only returns a name for nodes whose `type` is `'Property'`.
  return found ? (found as EsProperty) : undefined;
}

/** Whether a node is a `vi.fn(…)` / `jest.fn(…)` call — the hand-rolled mock this plugin steers away from. */
export function isRunnerFnCall(node: EsNode): boolean {
  if (!isCallExpression(node) || node.callee.type !== 'MemberExpression') {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowed by `type === 'MemberExpression'` on the line above.
  const callee = node.callee as EsMemberExpression;

  return callee.object.type === 'Identifier' && callee.property.type === 'Identifier' && isFnOf(callee);
}

function isFnOf(callee: EsMemberExpression): boolean {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- both sides were checked to be `Identifier` by the caller.
  const object = callee.object as EsIdentifier;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above.
  const property = callee.property as EsIdentifier;

  return (object.name === 'vi' || object.name === 'jest') && property.name === 'fn';
}

/** Node types whose body is a *later* evaluation — the boundary the module-scope search stops at, and what `enclosingFunction` returns. */
const FUNCTION_TYPES = new Set(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression']);

/** Whether a value read off a node is itself a node (ESTree marks every one with a `type`). */
function isNode(value: unknown): value is EsNode {
  return typeof value === 'object' && value !== null && typeof Reflect.get(value, 'type') === 'string';
}

/**
 * Whether the subtree of `node` builds a `vi.fn()` **at module evaluation time**.
 *
 * The walk deliberately stops at every function boundary: a `vi.fn()` inside an arrow is created
 * per call, which is the shape the rule steers towards, and descending into it would flag the fix
 * along with the problem. Generic over the node shape rather than selector-based, because "not
 * inside a function" is not something an esquery selector can say.
 */
export function buildsRunnerFnAtModuleScope(node: EsNode): boolean {
  if (FUNCTION_TYPES.has(node.type)) {
    return false;
  }

  if (isRunnerFnCall(node)) {
    return true;
  }

  return Object.entries(node).some(([key, value]) => {
    // `parent` points back up the tree; following it would walk the whole program, twice.
    if (key === 'parent') {
      return false;
    }

    if (Array.isArray(value)) {
      return value.some((item: unknown) => isNode(item) && buildsRunnerFnAtModuleScope(item));
    }

    return isNode(value) && buildsRunnerFnAtModuleScope(value);
  });
}

/**
 * The innermost function whose body contains `node`, or `undefined` when `node` sits at module scope.
 *
 * An esquery selector reaches downward: it can say "an `expect()` somewhere below a `.then()`", which
 * is equally true of one buried two callbacks deeper inside a `subscribe`. Telling those apart means
 * asking the question upward — which callback is this expression actually the body of — so the walk
 * is manual.
 */
export function enclosingFunction(node: EsNode): EsNode | undefined {
  let current = node;

  while (current.type !== 'Program') {
    if (FUNCTION_TYPES.has(current.type)) {
      return current;
    }

    current = current.parent;
  }

  return undefined;
}
