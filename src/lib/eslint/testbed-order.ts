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
 * The check is deliberately order-free. Lexical order is not run order — an `override*` written
 * above the hook, inside a helper the tests call, still runs after it — so the question asked is
 * "does this suite override at all", with the one exemption that can be read off the source: an
 * `override*` that sits in the same hook body *before* the injection really does run first.
 */
import { type EsNode, countInSubtree, isCallExpression, isIdentifier, isMemberCall } from './rule-types';

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

/** The nearest enclosing call of one of `names`, or nothing. */
function enclosingCallOf(node: EsNode, names: ReadonlySet<string>): EsNode | undefined {
  let current = node;

  while (current.type !== 'Program') {
    if (isCallExpression(current) && isIdentifier(current.callee) && names.has(current.callee.name)) {
      return current;
    }

    current = current.parent;
  }

  return undefined;
}

/** The suite a node belongs to, or the whole file when it is written at the top level. */
function enclosingSuite(node: EsNode): EsNode {
  let current = node;

  while (current.type !== 'Program') {
    if (isCallExpression(current) && isIdentifier(current.callee) && SUITES.has(current.callee.name)) {
      return current;
    }

    current = current.parent;
  }

  return current;
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

  if (countInSubtree(suite, (node) => isMemberCall(node, TEST_BED, RESETS), true) > 0) {
    return false;
  }

  return countInSubtree(suite, (node) => isMemberCall(node, TEST_BED, OVERRIDES) && !runsFirst(node, injection, hook), true) > 0;
}
