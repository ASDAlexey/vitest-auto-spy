/**
 * The rules shipped with the library.
 *
 * A lint rule that lives next to the API it steers towards travels with it: it is versioned with
 * the helper it recommends, and it stops being re-written in every project that installs the
 * package. Each rule points at the README recipe that shows the replacement, because a rule that
 * only says "don't" moves the problem instead of solving it.
 *
 * They are deliberately narrow — every one of them fires on a shape that has a single, mechanical
 * replacement, so `--fix`-less autopilot is still safe to leave on in CI.
 */
import {
  type EsFunction,
  type EsNode,
  type EsObjectExpression,
  type EsProperty,
  type EsVariableDeclarator,
  type RuleContext,
  type RuleListener,
  type RuleModule,
  buildsRunnerFnAtModuleScope,
  enclosingFunction,
  findProperty,
  isCallExpression,
  isIdentifier,
  isMemberExpression,
  isObjectExpression,
  isRunnerFnCall,
  propertyName,
} from './rule-types';

const README = 'https://github.com/ASDAlexey/vitest-auto-spy#how-to-mock';

/** Build a rule, appending the recipe link to every message so the fix is one click away. */
function defineRule(options: {
  anchor: string;
  description: string;
  messages: Record<string, string>;
  create: (context: RuleContext) => RuleListener;
}): RuleModule {
  const url = `${README}${options.anchor}`;
  const messages = Object.fromEntries(Object.entries(options.messages).map(([id, text]) => [id, `${text} Recipe: ${url}`]));

  return {
    meta: {
      type: 'suggestion',
      docs: { description: options.description, url },
      messages,
      schema: [],
    },
    create: options.create,
  };
}

/** Whether an object literal stubs behaviour (holds at least one `vi.fn()`), as opposed to carrying plain config values. */
function looksLikeHandRolledMock(object: EsObjectExpression): boolean {
  return object.properties.some((property) => propertyName(property) !== undefined && isRunnerFnCall(propertyValue(property)));
}

function propertyValue(property: EsNode): EsNode {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- only called for nodes `propertyName` already accepted, i.e. `type === 'Property'`.
  return (property as EsProperty).value;
}

function countRunnerFns(object: EsObjectExpression): number {
  return object.properties.filter((property) => propertyName(property) !== undefined && isRunnerFnCall(propertyValue(property))).length;
}

/** `{ provide: X, useValue: { a: vi.fn() } }` → `provideAutoSpy(X)`. */
const preferProvideAutoSpy = defineRule({
  anchor: '-a-service-behind-angular-di',
  description: 'Provide a spied service with provideAutoSpy() instead of a hand-rolled useValue object',
  messages: {
    preferProvideAutoSpy:
      'This `useValue` object hand-rolls a service mock. `provideAutoSpy(Token)` spies every method of the real class, so the stub cannot drift from it.',
  },
  create: (context) => ({
    ObjectExpression: (node: EsObjectExpression): void => {
      const useValue = findProperty(node, 'useValue');

      if (!findProperty(node, 'provide') || !useValue || !isObjectExpression(useValue.value) || !looksLikeHandRolledMock(useValue.value)) {
        return;
      }

      context.report({ node: useValue, messageId: 'preferProvideAutoSpy' });
    },
  }),
});

/** `{ a: vi.fn(), b: vi.fn() }` → `createSpyFromClass(X)` / `createAutoMock<T>()`. */
const preferCreateSpyFromClass = defineRule({
  anchor: '-a-service-without-di',
  description: 'Build a spy from the class (createSpyFromClass / createAutoMock) instead of an object of vi.fn()s',
  messages: {
    preferCreateSpyFromClass:
      'An object of `vi.fn()`s only mocks the methods you remembered. `createSpyFromClass(X)` reads the class, `createAutoMock<T>()` the type — both stay in step with it.',
  },
  create: (context) => ({
    ObjectExpression: (node: EsObjectExpression): void => {
      // The provider form is `prefer-provide-auto-spy`'s business — do not report it twice.
      if (propertyName(node.parent) === 'useValue' || countRunnerFns(node) < 2) {
        return;
      }

      context.report({ node, messageId: 'preferCreateSpyFromClass' });
    },
  }),
});

/** `vi.spyOn(TestBed.inject(X), 'method')` → `injectSpy(X).method`. */
const preferInjectSpy = defineRule({
  anchor: '-reading-a-spy-back-from-di',
  description: 'Read an already-spied dependency with injectSpy() instead of re-spying a TestBed.inject() result',
  messages: {
    preferInjectSpy:
      'Spying the instance DI just handed you replaces one method and leaves the rest real. Provide it with `provideAutoSpy(X)` and read it back with `injectSpy(X)`.',
  },
  create: (context) => ({
    'CallExpression[callee.object.name="vi"][callee.property.name="spyOn"] CallExpression[callee.object.name="TestBed"][callee.property.name="inject"]':
      (node: EsNode): void => context.report({ node, messageId: 'preferInjectSpy' }),
  }),
});

/** `Object.defineProperty(obj, 'x', …)` → `mockReadonlyProp` / `mockValueProp`. */
const noObjectDefineProperty = defineRule({
  anchor: '-a-readonly-property-or-a-signal',
  description: 'Patch properties with mockReadonlyProp / mockValueProp, which record the undo',
  messages: {
    noObjectDefineProperty:
      '`Object.defineProperty` in a spec leaves no way back: nothing restores the original descriptor, so the patch leaks into the next file under `isolate: false`. `mockReadonlyProp` / `mockValueProp` return the undo and register it with `restoreMockedProps()`.',
  },
  create: (context) => ({
    'CallExpression[callee.object.name="Object"][callee.property.name=/^definePropert(y|ies)$/]': (node: EsNode): void =>
      context.report({ node, messageId: 'noObjectDefineProperty' }),
  }),
});

/** `source$.subscribe(v => expect(v)…)` → `await expectEmission(source$)`. */
const noExpectInSubscribe = defineRule({
  anchor: '-an-observable',
  description: 'Assert observables with expectEmission() instead of expect() inside a subscribe callback',
  messages: {
    noExpectInSubscribe:
      'If the stream never emits, this callback never runs and the test passes having asserted nothing. `await expectEmission(source$)` fails when the value does not arrive.',
  },
  create: (context) => ({
    'CallExpression[callee.property.name="subscribe"] CallExpression[callee.name="expect"]': (node: EsNode): void =>
      context.report({ node, messageId: 'noExpectInSubscribe' }),
  }),
});

/** `export const fixture = { m: vi.fn() }` → `export const createFixture = () => ({ m: vi.fn() })`. */
const noSharedModuleLevelMock = defineRule({
  anchor: '-a-double-more-than-one-spec-uses',
  description: 'Export a factory that builds the shared double, not a module-level object holding vi.fn()s',
  messages: {
    noSharedModuleLevelMock:
      'This exported double is built once per module, not once per test. Under `isolate: false` every importing spec shares the same spies and subjects, `clearMocks` reaches only the file that imported first, and the failure lands in whichever file happens to run next. Export a **factory** that returns it.',
  },
  create: (context) => ({
    'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator': (node: EsVariableDeclarator): void => {
      if (node.init && buildsRunnerFnAtModuleScope(node.init)) {
        context.report({ node, messageId: 'noSharedModuleLevelMock' });
      }
    },
  }),
});

/** `let s: Mocked<Cart>` → `let s: Spy<Cart>`. */
const noMockedForSpy = defineRule({
  anchor: '-reading-a-spy-back-from-di',
  description: 'Declare a spy as Spy<T>, not as Vitest’s Mocked<T>',
  messages: {
    noMockedForSpy:
      '`Mocked<T>` keeps `T`’s private members, so assigning a spy to it fails with "is missing the following properties: _zone, _queries, …" — a list of private field names that says nothing about the real problem, which is the declaration. Declare `Spy<T>`.',
  },
  create: (context) => ({
    'VariableDeclarator > Identifier > TSTypeAnnotation > TSTypeReference > Identifier[name=/^Mocked(Object)?$/]': (node: EsNode): void =>
      context.report({ node, messageId: 'noMockedForSpy' }),
  }),
});

/** `it('x', (done) => …)` → `async` + an awaited assertion. */
const noDoneCallback = defineRule({
  anchor: '-an-observable',
  description: 'Vitest has no done callback — the first parameter of a test or hook is its TestContext',
  messages: {
    noDoneCallback:
      'Vitest passes a `TestContext` here, not a `done` callback: calling it throws `TestContext is not a function` inside a promise nobody awaits, so the test **passes** having run almost none of its body. Make the callback `async` and await the result (`firstValueFrom`, `expectEmission`), or destructure the context (`({ task })`) if that is what you meant.',
  },
  create: (context) => ({
    'CallExpression[callee.name=/^(it|test|beforeAll|beforeEach|afterAll|afterEach)$/] > :matches(ArrowFunctionExpression, FunctionExpression)':
      (node: EsFunction): void => {
        // An identifier parameter, not a destructuring pattern: Vitest's own fixtures must be
        // destructured, so a plain name here is a `done` carried over from Jest.
        if (node.params[0]?.type === 'Identifier') {
          context.report({ node: node.params[0], messageId: 'noDoneCallback' });
        }
      },
  }),
});

/** The promise methods whose callback is deferred: nothing inside it runs during the synchronous test body. */
const PROMISE_CALLBACK_METHODS = new Set(['catch', 'finally', 'then']);

/** Whether `fn` is the callback handed to `.then()` / `.catch()` / `.finally()`, rather than to anything else. */
function isPromiseCallback(fn: EsNode): boolean {
  const call = fn.parent;

  if (!isCallExpression(call) || !isMemberExpression(call.callee)) {
    return false;
  }

  // A computed method name (`p[settle](…)`) is not knowably a promise callback, so it is left alone.
  return isIdentifier(call.callee.property) && PROMISE_CALLBACK_METHODS.has(call.callee.property.name);
}

/** Whether the chain grows past `node`: `p.then(a)` is the object of `.catch`, which is the callee of `.catch(b)`. */
function continuesChain(node: EsNode): boolean {
  return isMemberExpression(node.parent) || (isCallExpression(node.parent) && node.parent.callee === node);
}

/**
 * Whether the chain `call` belongs to is a bare expression statement — nobody awaits, returns, stores
 * or passes on the promise.
 *
 * The walk to the top of the chain is the whole point: in `p.then(a).catch(b)` the parent of
 * `p.then(a)` is a member expression, so only the *last* call in the chain has a parent that says
 * whether anything ever consumes the promise. Reading the immediate parent would clear the first
 * callback of every chain that has a second one.
 */
function isFloatingChain(call: EsNode): boolean {
  let current = call;

  while (continuesChain(current)) {
    current = current.parent;
  }

  return current.parent.type === 'ExpressionStatement';
}

/** `p.then(() => expect(…))` as a statement of its own → `expect(await p)`. */
const noFloatingAssertion = defineRule({
  anchor: '-a-promise-a-test-forgets-to-await',
  description: 'Await or return a promise chain that asserts, instead of leaving the .then() callback floating',
  messages: {
    noFloatingAssertion:
      'Nothing awaits this chain, so the test ends before the callback runs: the assertion never runs, and the test passes no matter what it claims — including claims that are false. Await the chain (or `return` it) and assert on the settled value: `expect(await promise)`, `await expectEmission(source$)`.',
  },
  create: (context) => ({
    'CallExpression[callee.name="expect"]': (node: EsNode): void => {
      // Only the *immediately* enclosing function counts. One nested callback deeper the advice stops
      // being true: awaiting the chain revives an `expect` sitting directly in the `.then()` callback,
      // but not one parked in a `subscribe` or a `setTimeout` inside it — and which of those a
      // callback is cannot be read off the syntax. Reporting only what awaiting actually fixes keeps
      // the message honest, and leaves the deferred-callback shapes to `no-expect-in-subscribe`.
      const callback = enclosingFunction(node);

      if (!callback || !isPromiseCallback(callback) || !isFloatingChain(callback.parent)) {
        return;
      }

      context.report({ node, messageId: 'noFloatingAssertion' });
    },
  }),
});

/** Every rule the plugin ships, keyed by the name used in an ESLint config. */
export const rules: Record<string, RuleModule> = {
  'prefer-provide-auto-spy': preferProvideAutoSpy,
  'prefer-create-spy-from-class': preferCreateSpyFromClass,
  'prefer-inject-spy': preferInjectSpy,
  'no-object-define-property': noObjectDefineProperty,
  'no-expect-in-subscribe': noExpectInSubscribe,
  'no-shared-module-level-mock': noSharedModuleLevelMock,
  'no-mocked-for-spy': noMockedForSpy,
  'no-done-callback': noDoneCallback,
  'no-floating-assertion': noFloatingAssertion,
};
