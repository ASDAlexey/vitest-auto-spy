/**
 * `createSpyFromInstance(x, { onlyMethodsToSpyOn: ['m'], passthrough: true })` read for `m` alone is
 * `spyOnOwnMethod(x, 'm')`; the same whitelist with a `returns: { m: undefined }` seed is
 * `spyOnVoidMethod(x, 'm')`. Both helpers are that call, so the rewrite is exact and ships as a fix.
 * A bare void seed on a real event or element is the one guess, and stays a suggestion.
 */
import {
  CORE_ENTRIES,
  PACKAGE,
  bindingState,
  boundValueOf,
  dropNamedImport,
  findBinding,
  importNamed,
  importSpecifierOf,
} from './bindings';
import { defineRule } from './define-rule';
import {
  type EsCallExpression,
  type EsFix,
  type EsFixer,
  type EsIdentifier,
  type EsImportSpecifier,
  type EsMemberExpression,
  type EsNode,
  type EsScope,
  type EsVariable,
  type RuleContext,
  findProperty,
  isArrayExpression,
  isAssignmentExpression,
  isCallExpression,
  isCast,
  isExpressionStatement,
  isIdentifier,
  isMemberExpression,
  isNamedImportSpecifier,
  isNewExpression,
  isObjectExpression,
  isTypeReference,
  isVariableDeclarator,
  memberName,
  propertyName,
  propertyValue,
} from './rule-types';

const FACTORY = 'createSpyFromInstance';
const OWN = 'spyOnOwnMethod';
const VOID = 'spyOnVoidMethod';

const METHOD_NAME = /^[$A-Z_a-z][\w$]*$/;
const EVENT_CONSTRUCTOR = /^[A-Za-z]*Event$/;
const DOM_GLOBALS = new Set(['document', 'window']);
const NODE_FACTORIES = new Set(['createElement', 'createElementNS', 'createEvent', 'getElementById', 'querySelector']);
const NODE_MEMBERS = new Set(['body', 'documentElement']);
const FIXTURE_NAME = /fixture$/i;
// `using` disposes what it holds, and the helpers hand back the spy rather than the instance.
const DECLARATION_KINDS = new Set(['const', 'let', 'var']);

interface Seed {
  helper: typeof OWN | typeof VOID;
  method: string;
  /** The options say exactly what the helper does, whatever the target is. */
  exact: boolean;
}

/** What replacing the call also has to touch, or `blocked` when an annotation the edit cannot carry is in the way. */
interface Rewrite {
  target: EsNode;
  edits: [EsNode, string][];
  typed: boolean;
  blocked: boolean;
}

interface EsObjectPattern extends EsNode {
  properties: EsNode[];
  typeAnnotation?: EsNode;
}

function isObjectPattern(node: EsNode): node is EsObjectPattern {
  return node.type === 'ObjectPattern';
}

function isUnwrapped(node: EsNode): node is EsNode & { expression: EsNode } {
  return isCast(node) || node.type === 'TSNonNullExpression';
}

function unwrap(node: EsNode): EsNode {
  return isUnwrapped(node) ? node.expression : node;
}

function methodString(node: EsNode): string | undefined {
  const value: unknown = node.type === 'Literal' ? Reflect.get(node, 'value') : undefined;

  return typeof value === 'string' && METHOD_NAME.test(value) ? value : undefined;
}

function listedMethod(value: EsNode): string | undefined {
  const list = unwrap(value);
  const elements = isArrayExpression(list) ? list.elements : [];
  const names = elements.filter((element): element is EsNode => element !== null).map(methodString);

  return elements.length === 1 ? names[0] : undefined;
}

function isUndefined(node: EsNode): boolean {
  return isIdentifier(node) && node.name === 'undefined';
}

/** The one key of `returns: { m: undefined }`, when that is all the seed says. */
function seededVoid(value: EsNode): string | undefined {
  const entries = isObjectExpression(value) ? value.properties : [];
  const seeds = entries.filter((entry) => propertyName(entry) !== undefined && isUndefined(propertyValue(entry)));
  const names = seeds.map((entry) => String(propertyName(entry))).filter((name) => METHOD_NAME.test(name));

  return entries.length === 1 ? names[0] : undefined;
}

function seedOf(options: EsNode): Seed | undefined {
  if (!isObjectExpression(options)) {
    return undefined;
  }

  const keys = options.properties.map(propertyName);
  const listed = findProperty(options, 'onlyMethodsToSpyOn');
  const method = listed ? listedMethod(listed.value) : undefined;
  const returns = findProperty(options, 'returns');
  const seeded = returns ? seededVoid(returns.value) : undefined;
  const passthrough = findProperty(options, 'passthrough')?.value;

  if (keys.length === 1 && seeded !== undefined) {
    return { helper: VOID, method: seeded, exact: false };
  }

  if (keys.length !== 2 || method === undefined) {
    return undefined;
  }

  if (passthrough?.type === 'Literal' && Reflect.get(passthrough, 'value') === true) {
    return { helper: OWN, method, exact: true };
  }

  return seeded === method ? { helper: VOID, method, exact: true } : undefined;
}

function readsMethod(member: EsMemberExpression, method: string): boolean {
  const named = member.computed ? methodString(member.property) : memberName(member);
  const { parent } = member;

  return named === method && !(isAssignmentExpression(parent) && parent.left === member);
}

/** `.m` on a real target: an event, a node of the document, or an element a fixture rendered. */
function isRealObject(scope: EsScope, node: EsNode, follow: boolean): boolean {
  const value = unwrap(node);

  if (isIdentifier(value)) {
    const bound = follow ? boundValueOf(scope, value) : undefined;

    return bound ? isRealObject(scope, bound, false) : DOM_GLOBALS.has(value.name) && bindingState(scope, value.name) === 'free';
  }

  if (isNewExpression(value)) {
    return isIdentifier(value.callee) && EVENT_CONSTRUCTOR.test(value.callee.name) && bindingState(scope, value.callee.name) === 'free';
  }

  if (isCallExpression(value)) {
    return (
      isMemberExpression(value.callee) &&
      NODE_FACTORIES.has(String(memberName(value.callee))) &&
      isRealObject(scope, value.callee.object, follow)
    );
  }

  const name = memberName(value);

  if (isMemberExpression(value) && name === 'nativeElement') {
    return isRenderedBy(value.object);
  }

  return isMemberExpression(value) && NODE_MEMBERS.has(String(name)) && isRealObject(scope, value.object, follow);
}

/** `fixture.nativeElement`, `…debugElement.nativeElement`, `…query(By.css('a')).nativeElement`. */
function isRenderedBy(node: EsNode): boolean {
  if (isIdentifier(node)) {
    return FIXTURE_NAME.test(node.name);
  }

  return memberName(node) === 'debugElement' || (isCallExpression(node) && memberName(node.callee) === 'query');
}

/** `Spy<X>` becomes `Spy<X>['m']`; any other annotation is one the rewrite cannot carry. */
function annotationEdit(context: RuleContext, id: EsIdentifier, method: string): Pick<Rewrite, 'blocked' | 'edits' | 'typed'> {
  const annotation = id.typeAnnotation?.typeAnnotation;

  if (!annotation) {
    return { edits: [], typed: false, blocked: false };
  }

  const { sourceCode } = context;
  const spy =
    isTypeReference(annotation) && sourceCode.getText(annotation.typeName) === 'Spy' && annotation.typeArguments?.params.length === 1;
  const edits: [EsNode, string][] = spy ? [[annotation, `${sourceCode.getText(annotation)}['${method}']`]] : [];

  return { edits, typed: true, blocked: !spy };
}

/** A name written once, with `call`, and otherwise read only as `name.m` — each of which becomes `name`. */
function variableRewrite(context: RuleContext, call: EsCallExpression, id: EsIdentifier, method: string): Rewrite | undefined {
  const variable = findBinding(context.sourceCode.getScope(call), id.name);
  const declarator = variable?.defs.map((definition) => definition.node).find(isVariableDeclarator);

  if (!variable || !declarator || !isIdentifier(declarator.id)) {
    return undefined;
  }

  const declaration = declarator.parent;
  const writes = variable.references.filter((reference) => reference.writeExpr);
  const members = variable.references.flatMap((reference) => (reference.writeExpr ? [] : [reference.identifier.parent]));
  const reads = members.filter((member): member is EsMemberExpression => isMemberExpression(member) && readsMethod(member, method));

  if (
    writes.length !== 1 ||
    !writes.every((write) => write.writeExpr === call) ||
    reads.length !== members.length ||
    !DECLARATION_KINDS.has(String(Reflect.get(declaration, 'kind'))) ||
    declaration.parent.type === 'ExportNamedDeclaration'
  ) {
    return undefined;
  }

  const annotation = annotationEdit(context, declarator.id, method);

  return { ...annotation, target: call, edits: [...annotation.edits, ...reads.map((read): [EsNode, string] => [read, id.name])] };
}

/** `const { m } = …` → `const m = …`, when the pattern names that one member and nothing else. */
function patternRewrite(call: EsCallExpression, pattern: EsObjectPattern, method: string): Rewrite | undefined {
  const [property] = pattern.properties;
  const local = property && propertyName(property) === method ? propertyValue(property) : undefined;

  if (pattern.properties.length !== 1 || !local || !isIdentifier(local)) {
    return undefined;
  }

  return { target: call, edits: [[pattern, local.name]], typed: false, blocked: pattern.typeAnnotation !== undefined };
}

function rewriteOf(context: RuleContext, call: EsCallExpression, method: string): Rewrite | undefined {
  const { parent } = call;

  if (isExpressionStatement(parent)) {
    return { target: call, edits: [], typed: false, blocked: false };
  }

  if (isMemberExpression(parent) && parent.object === call) {
    return readsMethod(parent, method) ? { target: parent, edits: [], typed: false, blocked: false } : undefined;
  }

  if (isVariableDeclarator(parent) && isObjectPattern(parent.id)) {
    return patternRewrite(call, parent.id, method);
  }

  if (isVariableDeclarator(parent) && isIdentifier(parent.id)) {
    return variableRewrite(context, call, parent.id, method);
  }

  return isAssignmentExpression(parent) && isIdentifier(parent.left) && isExpressionStatement(parent.parent)
    ? variableRewrite(context, call, parent.left, method)
    : undefined;
}

/** The factory's specifier with the helper in its place, sorted in where the list already is. */
function swapSpecifier(context: RuleContext, fixer: EsFixer, specifier: EsImportSpecifier, helper: string): EsFix {
  const { specifiers } = specifier.parent;
  const others = specifiers.filter((candidate) => candidate !== specifier).map((candidate) => context.sourceCode.getText(candidate));
  const keys = others.map((text) => text.toLowerCase());
  const ordered = keys.every((key, index) => keys.slice(0, index).every((before) => before <= key));

  if (!ordered || !specifiers.every(isNamedImportSpecifier)) {
    return fixer.replaceText(specifier, helper);
  }

  others.splice(keys.filter((key) => key < helper.toLowerCase()).length, 0, helper);

  return fixer.replaceTextRange(
    [Math.min(...specifiers.map((candidate) => candidate.range[0])), Math.max(...specifiers.map((candidate) => candidate.range[1]))],
    others.join(', '),
  );
}

/** Import the helper beside the factory's import, and take the factory out once this was its last use. */
function importEdits(
  context: RuleContext,
  fixer: EsFixer,
  call: EsCallExpression,
  helper: string,
  factory: EsVariable | undefined,
): EsFix[] {
  const specifier = factory ? importSpecifierOf(factory) : undefined;
  const module = specifier ? String(specifier.parent.source.value) : PACKAGE;
  const home = CORE_ENTRIES.has(module) ? module : PACKAGE;
  const orphaned = factory?.references.length === 1;
  const drop = orphaned ? dropNamedImport(context.sourceCode, fixer, factory) : undefined;
  const dropped = drop ? [drop] : [];

  if (bindingState(context.sourceCode.getScope(call), helper) === 'imported') {
    return dropped;
  }

  if (specifier && orphaned && home === module) {
    return [swapSpecifier(context, fixer, specifier, helper)];
  }

  return [importNamed(fixer, call, helper, home), ...dropped];
}

const MESSAGES: Record<string, string> = {
  ownMethod:
    "`createSpyFromInstance(…, { onlyMethodsToSpyOn: ['{{method}}'], passthrough: true })`, read for `{{method}}` alone, says " +
    "nothing `spyOnOwnMethod(target, '{{method}}')` does not: one method recorded and calling through, the rest of the object real, " +
    'the spy handed back directly. Name the method once.',
  voidExact:
    "`createSpyFromInstance(…, { onlyMethodsToSpyOn: ['{{method}}'], returns: { {{method}}: undefined } })` names `{{method}}` twice " +
    "to say what `spyOnVoidMethod(target, '{{method}}')` says once: one void method recorded, answering `undefined`, the rest real.",
  voidOnRealObject:
    'This seeds `{{method}}` of a real event or element with `undefined`, and discovery spies every other method of it too — on a ' +
    "DOM node that reaches the engine's own internals. `spyOnVoidMethod(target, '{{method}}')` patches `{{method}}` alone. A suggestion, " +
    'not a fix: check the test does not rely on another method being stubbed.',
};

function report(context: RuleContext, call: EsCallExpression, target: EsNode, seed: Seed, rewrite: Rewrite): void {
  const scope = context.sourceCode.getScope(call);
  const text = `${seed.helper}(${context.sourceCode.getText(target)}, '${seed.method}')`;
  const factory = findBinding(scope, FACTORY);
  const fix = (fixer: EsFixer): EsFix[] => [
    fixer.replaceText(rewrite.target, text),
    ...rewrite.edits.map(([node, replacement]) => fixer.replaceText(node, replacement)),
    ...importEdits(context, fixer, call, seed.helper, factory),
  ];
  const fixable = !rewrite.blocked && !call.typeArguments && bindingState(scope, seed.helper) !== 'taken';
  const safe = seed.exact && !rewrite.typed;
  const messageId = seed.helper === OWN ? 'ownMethod' : seed.exact ? 'voidExact' : 'voidOnRealObject';

  context.report({
    node: call,
    messageId,
    data: { method: seed.method },
    ...(fixable && safe ? { fix } : {}),
    ...(fixable && !safe ? { suggest: [{ desc: `Replace with ${text}`, fix }] } : {}),
  });
}

export const preferSpyOnOwnMethod = defineRule({
  name: 'prefer-spy-on-own-method',
  description: 'Spy one method of a real object with spyOnOwnMethod / spyOnVoidMethod instead of a one-method createSpyFromInstance',
  messages: MESSAGES,
  fixable: true,
  hasSuggestions: true,
  create: (context) => ({
    CallExpression: (call: EsCallExpression): void => {
      const [target, options, ...rest] = call.arguments;

      if (!isIdentifier(call.callee) || call.callee.name !== FACTORY || !target || !options || rest.length > 0) {
        return;
      }

      const scope = context.sourceCode.getScope(call);
      const seed = seedOf(options);

      if (!seed || bindingState(scope, FACTORY) === 'taken' || (!seed.exact && !isRealObject(scope, target, true))) {
        return;
      }

      const rewrite = rewriteOf(context, call, seed.method);

      if (rewrite) {
        report(context, call, target, seed, rewrite);
      }
    },
  }),
});
