/**
 * Whether a file may write `.and`, `.calls` and `.withArgs` at all.
 *
 * Those three namespaces do not exist on a spy this library builds. They are installed by the
 * `vitest-auto-spy/jasmine` entry — or, on a runtime that cannot import it, by a single
 * `enableJasmineCompat()` call — and a spy built before that call never gets them. A spec that uses
 * one anyway dies on `Cannot read properties of undefined (reading 'returnValue')`, which names
 * neither the missing import nor the spy.
 *
 * **What is knowable from one file.** Whether the *project* installs the layer is not: the call
 * usually sits in a Vitest `setupFiles` entry that no spec imports. So the question is narrowed
 * until a single file can answer it honestly, and the answer is only ever "this file uses a
 * namespace on a spy this file built, and this file installs nothing":
 *
 * - the spy has to be traceable to one of this library's own factories, so `.and` on somebody
 *   else's object — an options bag, a jasmine `spyOn` result, a domain model with a `calls`
 *   property — is not this rule's business;
 * - importing any entry of this package that *cannot* load the jasmine one silences the file.
 *   `vitest-auto-spy/bun` and `…/node` are exactly that: the jasmine entry pulls in Vitest, which
 *   neither runtime can load, so those suites necessarily install the layer from a setup file and
 *   reporting them would be reporting the documented arrangement;
 * - a project whose specs reach the layer through a barrel of its own says so once, in the rule's
 *   `setupModules` option.
 *
 * An `import type { Spy } from 'vitest-auto-spy/jasmine'` does **not** count. The compiler erases
 * it, so it installs nothing — and a file that imports the type from the jasmine entry and its
 * factories from the core one is the exact shape this rule was written for.
 */
import { findBinding } from './bindings';
import {
  type EsImportDeclaration,
  type EsMemberExpression,
  type EsNode,
  type RuleContext,
  isCallExpression,
  isCallee,
  isIdentifier,
  isMemberExpression,
  memberName,
} from './rule-types';

/** Both names this package is published under — the canonical one and the migration alias. */
const PACKAGES = ['vitest-auto-spy', 'vitest-auto-spies'];

/** Every spelling of the given subpaths, across both package names. */
function entries(...subpaths: string[]): Set<string> {
  return new Set(PACKAGES.flatMap((name) => subpaths.map((subpath) => `${name}/${subpath}`)));
}

/** The entry whose import installs the namespaces. */
const JASMINE_ENTRIES = entries('jasmine');

/**
 * The entries whose runtime cannot load the jasmine one.
 *
 * Bun and `node:test` get the layer from `enableJasmineCompat()` in a setup file — the only
 * arrangement the docs offer them — so a spec of theirs importing nothing else is correct.
 */
const FOREIGN_RUNTIME_ENTRIES = entries('bun', 'bun-angular', 'node');

/** The factories whose result carries this library's spy helpers, and therefore the namespaces. */
const SPY_FACTORIES = new Set([
  'asSpy',
  'autoMocked',
  'createAutoMock',
  'createFunctionSpy',
  'createMock',
  'createSpyFromClass',
  'createSpyObj',
  'injectSpy',
  'mockDeep',
]);

/** The one call that installs the layer by hand, wherever it is written. */
export const ENABLE_CALL = 'enableJasmineCompat';

/** Module specifiers the project has declared as installing the layer. */
export function setupModules(context: RuleContext): string[] {
  const configured: unknown = Reflect.get(Object(context.options[0]), 'setupModules');

  return Array.isArray(configured) ? configured.map(String) : [];
}

/** Whether this import is one that puts the namespaces on every spy built afterwards. */
export function installsJasmineCompat(node: EsImportDeclaration, declared: readonly string[]): boolean {
  // `import type` is erased before anything runs, so it installs nothing at all.
  if (node.importKind === 'type') {
    return false;
  }

  const source = String(node.source.value);

  return JASMINE_ENTRIES.has(source) || FOREIGN_RUNTIME_ENTRIES.has(source) || declared.includes(source);
}

/** Whether a node is a call to one of this library's spy factories. */
function isFactoryCall(node: EsNode): boolean {
  return isCallExpression(node) && isIdentifier(node.callee) && SPY_FACTORIES.has(node.callee.name);
}

/** Whether a name ever holds the result of one of those factories — initialised or assigned later. */
function holdsFactoryResult(context: RuleContext, node: EsNode): boolean {
  if (!isIdentifier(node)) {
    return false;
  }

  const binding = findBinding(context.sourceCode.getScope(node), node.name);
  // Every write counts, the initialiser included: `let api: Spy<Api>` assigned in a `beforeEach` is
  // how most suites build their doubles, and reading only the declarator would miss all of them.
  const written = (binding?.references ?? []).flatMap((reference) => (reference.writeExpr ? [reference.writeExpr] : []));

  return written.some(isFactoryCall);
}

/**
 * Whether the object a namespace hangs off came out of one of this library's factories.
 *
 * The walk goes down the chain rather than one step, because the namespace is read off a *method*
 * of the double — `api.load.and.returnValue(…)` — and the double itself is the root of it.
 */
export function fromLibrarySpy(context: RuleContext, node: EsNode): boolean {
  let current = node;

  while (isMemberExpression(current) || isCallExpression(current)) {
    if (isFactoryCall(current)) {
      return true;
    }

    current = isMemberExpression(current) ? current.object : current.callee;
  }

  return holdsFactoryResult(context, current);
}

/** Whether `spy.and` / `spy.calls` is read *through* — `spy.and.returnValue(…)`, not a bare `spy.and`. */
function readsThrough(node: EsNode): boolean {
  return isMemberExpression(node.parent) && node.parent.object === node;
}

/**
 * Whether the `.and` sits on a `withArgs(…)` call.
 *
 * `spy.withArgs(1).and.returnValue(2)` is one line with one repair, and both halves of it are
 * missing together. Reported at the `withArgs`, whose message names the whole rewrite, so that the
 * chain does not come back as two messages saying the same thing.
 */
function onWithArgsCall(node: EsMemberExpression): boolean {
  return isCallExpression(node.object) && memberName(node.object.callee) === 'withArgs';
}

/** Whether this is `<a spy of this library>.<name>.<something>`. */
export function namespaceOnSpy(context: RuleContext, node: EsMemberExpression, name: string): boolean {
  return memberName(node) === name && readsThrough(node) && !onWithArgsCall(node) && fromLibrarySpy(context, node.object);
}

/** Whether this is `<a spy of this library>.withArgs(…)`. */
export function withArgsOnSpy(context: RuleContext, node: EsMemberExpression): boolean {
  return memberName(node) === 'withArgs' && isCallee(node) && fromLibrarySpy(context, node.object);
}
