/**
 * Instantiating the TestBed in a hook, in a suite that still needs to override something.
 *
 * `TestBed.inject()` and `TestBed.createComponent()` **instantiate** the testing module, and after
 * that every `TestBed.overrideProvider` / `overrideComponent` / `overrideModule` throws
 * `Cannot override provider when the test module has already been instantiated`.
 *
 * This trap is one the rest of this plugin walks people into, which is why it is worth a rule of its
 * own. A hand-rolled `{ provide: X, useValue: { m: vi.fn(() => 1) } }` configures its return values
 * in the literal. Replace it with `provideAutoSpy(X)`, as `prefer-provide-auto-spy` asks, and there
 * is nowhere left to put them — so the line goes into `beforeEach`:
 *
 * ```ts
 * beforeEach(() => {
 *   TestBed.configureTestingModule({ providers: [provideAutoSpy(Api)] });
 *   asSpy(TestBed.inject(Api)).load.mockReturnValue(of(page)); // the module is now instantiated
 * });
 * ```
 *
 * …and any `override*` in the file, including one inside a `createComponent` helper, stops working.
 * Found twice independently, once for sixteen tests at a stroke, both times after a migration.
 *
 * **The same instantiation has three more spellings, and two of them are this package's own.**
 * `injectSpy(X)` *is* `TestBed.inject(X)` and `renderShallow(Cmp)` ends in
 * `TestBed.createComponent`, so a rule reading only the `TestBed.` forms stayed silent on exactly
 * the file the rest of the plugin had just rewritten — an `injectSpy` in `beforeEach` above a
 * `TestBed.overrideComponent`, failing at run time with `Cannot override component when the test
 * module has already been instantiated` and reported by nothing. Found by hand in a migrated suite.
 * `TestBed.runInInjectionContext` is the third, and needs the injector for the same reason.
 *
 * The check is deliberately order-free. Lexical order is not run order — an `override*` written
 * above the hook, inside a helper the tests call, still runs after it — so the question asked is
 * "does this suite override at all", with the one exemption that can be read off the source: an
 * `override*` that sits in the same hook body *before* the injection really does run first.
 */
import { type EsNode, countInSubtree, enclosingFunction, isCallExpression, isIdentifier, isMemberCall } from './rule-types';

/**
 * Every spelling that instantiates the testing module, as one esquery selector list.
 *
 * The second half is this package's own helpers, and leaving it out is what kept
 * `no-inject-before-override` silent on the file the rest of the plugin had just rewritten. A bare
 * callee, not a member one: the two-argument `injectSpy(moduleRef, token)` of
 * `vitest-auto-spy/nestjs` reaches no TestBed.
 */
export const INSTANTIATES_THE_MODULE =
  'CallExpression[callee.object.name="TestBed"][callee.property.name=/^(inject|createComponent|runInInjectionContext)$/],' +
  'CallExpression[callee.type="Identifier"][callee.name=/^(injectSpy|renderShallow)$/]';

/** The calls that need an uninstantiated module. */
const OVERRIDES = new Set([
  'overrideComponent',
  'overrideDirective',
  'overrideModule',
  'overridePipe',
  'overrideProvider',
  'overrideTemplateUsingTestingModule',
]);

/** The one call that puts the module back into a state where overriding is legal again. */
const RESETS = new Set(['resetTestingModule']);

const TEST_BED = new Set(['TestBed']);

/** The hooks that run before a test, where an eager injection does its damage. */
const HOOKS = new Set(['beforeAll', 'beforeEach']);

/** The blocks a suite is written in. */
const SUITES = new Set(['describe', 'suite']);

/** Whether a node is a call of one of `names`, written bare. */
function isNamedCall(node: EsNode, names: ReadonlySet<string>): boolean {
  return isCallExpression(node) && isIdentifier(node.callee) && names.has(node.callee.name);
}

/** The nearest enclosing call of one of `names`, or nothing. */
function enclosingCallOf(node: EsNode, names: ReadonlySet<string>): EsNode | undefined {
  let current = node;

  while (current.type !== 'Program') {
    if (isNamedCall(current, names)) {
      return current;
    }

    current = current.parent;
  }

  return undefined;
}

/**
 * The suite a node belongs to, or the whole file when it is written at the top level.
 *
 * Exported because `no-overridden-provider` compares the same scopes for the same reason: a
 * `TestBed.override*` decides what the tests of *its* block get, and nothing about the ones outside
 * it.
 */
export function enclosingSuite(node: EsNode): EsNode {
  return enclosingCallOf(node, SUITES) ?? programOf(node);
}

/** The `Program` a node belongs to — where {@link enclosingSuite} lands for a top-level statement. */
function programOf(node: EsNode): EsNode {
  let current = node;

  while (current.type !== 'Program') {
    current = current.parent;
  }

  return current;
}

/**
 * Whether a statement is reached by **every** test of its suite.
 *
 * True only for something written directly in a `beforeEach` / `beforeAll` body. A statement inside
 * a helper the suite declares — `const setRemoteConfig = (on) => TestBed.overrideProvider(…)` — runs
 * where it is called, and the call sites are the fact that decides the outcome; a statement inside an
 * `it` decides for that test alone. `no-overridden-provider` needs this before it may call a
 * registration dead, and the file that taught it is real: three tests of thirty-four called such a
 * helper, so the provider it "replaced" is what the other thirty-one ran against.
 */
export function runsBeforeEveryTest(node: EsNode): boolean {
  const enclosing = enclosingFunction(node);

  return enclosing !== undefined && isNamedCall(enclosing.parent, HOOKS);
}

/**
 * Whether a suite puts the testing module back, which makes a registration live again.
 *
 * The documented way out of both defects read off this scope — an eager injection before an
 * override, and a registration an override replaces — so a suite that uses it has already thought
 * about the ordering and is exempt from each.
 */
export function resetsTheTestingModule(suite: EsNode): boolean {
  return countInSubtree(suite, (node) => isMemberCall(node, TEST_BED, RESETS), true) > 0;
}

/** Whether an override is written in the same hook, ahead of the injection — the one order that works. */
function runsFirst(override: EsNode, injection: EsNode, hook: EsNode): boolean {
  const insideHook = override.range[0] >= hook.range[0] && override.range[1] <= hook.range[1];

  return insideHook && override.range[1] < injection.range[0];
}

/**
 * Whether this injection will break an override somewhere in its suite.
 *
 * A suite that calls `TestBed.resetTestingModule()` is exempt outright: that is the documented way
 * to put the module back, and a spec that uses it has already thought about this.
 */
export function breaksAnOverride(injection: EsNode): boolean {
  const hook = enclosingCallOf(injection, HOOKS);

  if (!hook) {
    return false;
  }

  const suite = enclosingSuite(injection);

  if (resetsTheTestingModule(suite)) {
    return false;
  }

  return countInSubtree(suite, (node) => isMemberCall(node, TEST_BED, OVERRIDES) && !runsFirst(node, injection, hook), true) > 0;
}
