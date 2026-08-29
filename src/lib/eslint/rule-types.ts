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
  /** Character offsets in the source text. ESLint guarantees them on every node; a fixer is nothing without them. */
  range: [number, number];
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
  /** A block for a statement body, the expression itself for a concise arrow. */
  body: EsNode;
}

/** A `{ … }` block, whose `body` is the statement list rather than one node. */
export interface EsBlockStatement extends EsNode {
  body: EsNode[];
}

/** A statement that is nothing but an expression — `source$.subscribe(…);`. */
export interface EsExpressionStatement extends EsNode {
  expression: EsNode;
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

/**
 * A named specifier of an import declaration — the `{ Mocked }` of `import { Mocked } from 'vitest'`.
 *
 * Its `parent` is narrowed here rather than re-checked at the use site: ESTree gives a specifier no
 * other place to live, so a runtime guard would be a branch nothing could ever take.
 */
export interface EsImportSpecifier extends EsNode {
  parent: EsImportDeclaration;
}

/** An import statement, with the specifiers a fixer has to rewrite and the module they come from. */
export interface EsImportDeclaration extends EsNode {
  specifiers: EsNode[];
  source: EsLiteral;
}

/** The arguments of a generic type reference — `<CartService>` in `Mocked<CartService>`. */
export interface EsTypeArguments extends EsNode {
  params: EsNode[];
}

/** A type reference, as the parent of the identifier that names it. */
export interface EsTypeReference extends EsNode {
  typeArguments?: EsTypeArguments;
}

/** One declaration of a variable, as the scope manager recorded it. */
export interface EsVariableDefinition {
  /** `'ImportBinding'` for a name an import introduced, `'Variable'` for a `const` / `let`, and so on. */
  type: string;
  node: EsNode;
}

/** One mention of a variable. `writeExpr` is set for the ones that assign to it, initialisers included. */
export interface EsReference {
  identifier: EsNode;
  writeExpr?: EsNode | null;
}

/** A name the scope manager resolved, with everything that declares and mentions it. */
export interface EsVariable {
  name: string;
  defs: EsVariableDefinition[];
  /** Type positions count: `Mocked<T>` is a reference to `Mocked`, which is what makes an orphan detectable. */
  references: EsReference[];
}

/** A lexical scope, and the chain out of it. */
export interface EsScope {
  variables: EsVariable[];
  upper: EsScope | null;
}

/** One edit. ESLint sorts and merges the array a fixer returns, and refuses overlapping ranges. */
export interface EsFix {
  range: [number, number];
  text: string;
}

/** The sliver of ESLint's fixer the fixes here need. */
export interface EsFixer {
  replaceText(node: EsNode, text: string): EsFix;
  replaceTextRange(range: [number, number], text: string): EsFix;
  insertTextBeforeRange(range: [number, number], text: string): EsFix;
  remove(node: EsNode): EsFix;
}

/** What a rule hands ESLint to perform an edit; `null` when it turns out there is nothing to do. */
export type FixFunction = (fixer: EsFixer) => EsFix | EsFix[] | null;

/**
 * An edit ESLint offers but never applies on its own.
 *
 * `desc` rather than `messageId`: a suggestion is read in a one-line editor menu, and the messages
 * of this plugin all carry a recipe URL that has no business there.
 */
export interface SuggestionDescriptor {
  desc: string;
  fix: FixFunction;
}

/** What a rule passes to `context.report`. */
export interface ReportDescriptor {
  node: EsNode;
  messageId: string;
  /** Values for the `{{placeholders}}` of the message. */
  data?: Record<string, string>;
  fix?: FixFunction;
  suggest?: SuggestionDescriptor[];
}

/** The sliver of ESLint's `SourceCode` the rules read. */
export interface EsSourceCode {
  /** The scope a node sits in. Available since ESLint 8.37 — flat config is well past that. */
  getScope(node: EsNode): EsScope;
  /** The source of one node, or — with no argument — of the whole file. */
  getText(node?: EsNode): string;
}

/** The sliver of ESLint's rule context the rules use. */
export interface RuleContext {
  readonly sourceCode: EsSourceCode;
  /** Whatever the ESLint config passed after the severity, validated against `meta.schema`. */
  readonly options: readonly unknown[];
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
    /** JSON Schema for the rule's options — the empty list for a rule that takes none. */
    schema: readonly object[];
    /** Present only where the rule ships a fix — ESLint refuses one from a rule that has not said so. */
    fixable?: 'code';
    /** The same declaration for suggestions, which ESLint gates separately. */
    hasSuggestions?: boolean;
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

/** Narrow to a `new X(…)`, which carries the same `callee` / `arguments` shape as a call. */
export function isNewExpression(node: EsNode): node is EsCallExpression {
  return node.type === 'NewExpression';
}

/** Narrow to a member expression. */
export function isMemberExpression(node: EsNode): node is EsMemberExpression {
  return node.type === 'MemberExpression';
}

/** Narrow to a statement block. */
export function isBlockStatement(node: EsNode): node is EsBlockStatement {
  return node.type === 'BlockStatement';
}

/** Narrow to an expression statement. */
export function isExpressionStatement(node: EsNode): node is EsExpressionStatement {
  return node.type === 'ExpressionStatement';
}

/** Narrow to a named import specifier — see {@link EsImportSpecifier} for why the parent comes with it. */
export function isNamedImportSpecifier(node: EsNode): node is EsImportSpecifier {
  return node.type === 'ImportSpecifier';
}

/** Narrow to a variable declarator, the node a `const` / `let` definition points at. */
export function isVariableDeclarator(node: EsNode): node is EsVariableDeclarator {
  return node.type === 'VariableDeclarator';
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

/** The value of a property node — only ever called for nodes {@link propertyName} has accepted. */
export function propertyValue(property: EsNode): EsNode {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- only called for nodes `propertyName` already accepted, i.e. `type === 'Property'`.
  return (property as EsProperty).value;
}

/** The property named `name` of an object literal, if it has one. */
export function findProperty(object: EsObjectExpression, name: string): EsProperty | undefined {
  const found = object.properties.find((property) => propertyName(property) === name);

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `propertyName` only returns a name for nodes whose `type` is `'Property'`.
  return found ? (found as EsProperty) : undefined;
}

/** Whether a node is a `vi.fn(…)` / `jest.fn(…)` call — the hand-rolled mock this plugin steers away from. */
export function isRunnerFnCall(node: EsNode): boolean {
  return isRunnerCall(rootCall(node), FN);
}

/** The runners whose `fn()` builds a mock. */
const RUNNERS = new Set(['jest', 'vi']);

/** The single member that builds one. */
const FN = new Set(['fn']);

/**
 * Unwrap a configured mock back to the call that created it.
 *
 * `vi.fn()` and `vi.fn().mockReturnValue(of([]))` are the same double, one of them tuned; the second
 * one is a call whose callee's *object* is the first. Reading the immediate callee and stopping — as
 * this used to — therefore saw the bare form and missed every configured one, which is exactly
 * backwards: the further a hand-rolled double has been tuned, the further it has drifted from the
 * class it stands in for, and the more the rules that sit on this check were needed. Reported from
 * four independent migration batches, on four files, before the shape was recognised.
 *
 * The walk is down the chain rather than one step, so `vi.fn().mockReturnValue(x).mockName('y')`
 * arrives at the same place.
 */
function rootCall(node: EsNode): EsNode {
  let current = node;

  while (isCallExpression(current) && isMemberExpression(current.callee) && isCallExpression(current.callee.object)) {
    current = current.callee.object;
  }

  return current;
}

/**
 * Whether a node is `vi.<member>(…)` / `jest.<member>(…)` for one of `members`.
 *
 * The runner's own name is not configurable and nor should it be: `vi` and `jest` are what a spec
 * writes, and a project that aliases either has bigger problems than this plugin.
 */
export function isRunnerCall(node: EsNode, members: ReadonlySet<string>): boolean {
  if (
    !isCallExpression(node) ||
    !isMemberExpression(node.callee) ||
    !isIdentifier(node.callee.object) ||
    !isIdentifier(node.callee.property)
  ) {
    return false;
  }

  return RUNNERS.has(node.callee.object.name) && members.has(node.callee.property.name);
}

/** Node types whose body is a *later* evaluation — the boundary the module-scope search stops at, and what `enclosingFunction` returns. */
const FUNCTION_TYPES = new Set(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression']);

/** Narrow to a function of any spelling — arrow, expression or declaration. */
export function isFunctionNode(node: EsNode): node is EsFunction {
  return FUNCTION_TYPES.has(node.type);
}

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
  return buildsRunnerFn(node, false);
}

/**
 * The same walk, optionally descending *into* functions.
 *
 * Which side of a function boundary counts depends on what is being looked at. For a value — an
 * exported fixture, a `useValue` — a `vi.fn()` behind a function is created per call, which is the
 * shape these rules steer towards, and descending would flag the fix along with the problem. For a
 * `useFactory` the function *is* the value: everything it builds is what DI hands over, so stopping
 * at the boundary means never looking at the double at all.
 */
export function buildsRunnerFn(node: EsNode, throughFunctions: boolean): boolean {
  return countInSubtree(node, isRunnerFnCall, throughFunctions) > 0;
}

/**
 * How many nodes below `node` a predicate accepts.
 *
 * Pruned at every match — a match's own children are not searched again — and, unless
 * `throughFunctions`, at every function boundary. Both callers want the same walk over a different
 * predicate, which is the only reason it is spelled generically: a second copy of a tree walk is a
 * second place for the `parent` back-reference to be forgotten.
 */
export function countInSubtree(node: EsNode, matches: (candidate: EsNode) => boolean, throughFunctions: boolean): number {
  if (!throughFunctions && FUNCTION_TYPES.has(node.type)) {
    return 0;
  }

  if (matches(node)) {
    return 1;
  }

  return Object.entries(node).reduce((total, [key, value]) => {
    // `parent` points back up the tree; following it would walk the whole program, twice.
    if (key === 'parent') {
      return total;
    }

    if (Array.isArray(value)) {
      return value.reduce<number>(
        (sum, item: unknown) => (isNode(item) ? sum + countInSubtree(item, matches, throughFunctions) : sum),
        total,
      );
    }

    return isNode(value) ? total + countInSubtree(value, matches, throughFunctions) : total;
  }, 0);
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
