/**
 * A global observer constructor replaced by hand — the stub nobody knew was already written.
 *
 * `IntersectionObserver`, `ResizeObserver` and `MutationObserver` are the three globals a component
 * constructs for itself and then keeps private, so the only seam a spec has is the constructor.
 * jsdom ships none of them, which makes the first spec that renders such a component fail on
 * `IntersectionObserver is not defined` — and the repair everyone reaches for is the same twenty
 * lines: save the global, assign a class of empty methods with a `vi.fn()` smuggled into
 * `disconnect`, cast it to `typeof IntersectionObserver`, put the original back in an `afterEach`.
 *
 * `stubIntersectionObserver()` is those twenty lines, and the reason the hand-rolled version keeps
 * being written is not laziness — it is that nothing tells the author the helper exists. One of
 * them carried a comment saying there was no other way. So the message names the helper, names what
 * it hands back, and says the part the author has no way to guess: **the restore is not theirs to
 * write.** The stub goes on through `mockValueProp` and comes off in `restoreMockedProps()`, which
 * `setupAutoSpy()` already runs after every test.
 *
 * That last part is the defect rather than the verbosity. A restore in an `afterEach` is at least
 * correct; a restore written as the last statement of the `it` — which is how a good half of them
 * are written — runs only if every assertion above it passed, so the first red test leaves the stub
 * installed for the rest of the file and, under `isolate: false`, for every later file the worker
 * picks up. What surfaces there is `observe is not a function` in a component nobody edited.
 *
 * **Three forms, because only one of the three is an assignment.** `vi.stubGlobal('IntersectionObserver', …)`
 * and `vi.spyOn(globalThis, 'MutationObserver')` install the same fake through the runner, and the
 * second one has a failure of its own: the usual `.mockImplementation((cb) => ({ observe() {} }))`
 * is an arrow, an arrow cannot be called with `new`, and the constructor inside the component
 * throws before the spec reaches an assertion.
 *
 * **`Object.defineProperty(globalThis, 'ResizeObserver', …)` is deliberately not here.**
 * `no-object-define-property` already reports every `defineProperty` in a spec and names the helper
 * family, so adding the shape would put two reports on one line saying the same thing.
 *
 * **What the rule refuses to report** is what keeps it usable, and each exclusion answers a real
 * line found in a large monorepo:
 *
 *  - the restore itself — `globalThis.IntersectionObserver = original` — because the value is a name
 *    holding whatever was read out of the global rather than a double, and reporting it would
 *    double every finding;
 *  - a real implementation being installed, `window.ResizeObserver = ResizeObserver` from a
 *    polyfill, which is application code doing exactly what it should;
 *  - a receiver that is not the global object: a fake `window` a spec builds and hands to the code
 *    under test is a value like any other.
 */
import { findBinding, initializerOf } from './bindings';
import { defineRule } from './define-rule';
import {
  type EsAssignmentExpression,
  type EsCallExpression,
  type EsIdentifier,
  type EsMemberExpression,
  type EsNode,
  type EsVariableDefinition,
  type RuleContext,
  type RuleModule,
  isCast,
  isFunctionNode,
  isIdentifier,
  isMemberExpression,
  isRunnerCall,
  isRunnerFnCall,
  isVariableDeclarator,
  memberName,
} from './rule-types';

/** The names a spec writes the global object under. An alias — `const g = globalThis` — is out of reach and out of scope. */
const GLOBAL_RECEIVERS = new Set(['global', 'globalThis', 'self', 'window']);

/** What a report says about one observer: the global's own name, the installer, and the entry builder a spec drives it with. */
interface ObserverTarget extends Record<string, string> {
  entry: string;
  helper: string;
  observer: string;
}

/** The three observers this rule knows a one-line replacement for. */
const OBSERVERS: Record<string, ObserverTarget | undefined> = {
  IntersectionObserver: { entry: 'intersectionEntry', helper: 'stubIntersectionObserver', observer: 'IntersectionObserver' },
  MutationObserver: { entry: 'mutationRecord', helper: 'stubMutationObserver', observer: 'MutationObserver' },
  ResizeObserver: { entry: 'resizeEntry', helper: 'stubResizeObserver', observer: 'ResizeObserver' },
};

/** `vi.stubGlobal(name, value)` — the runner's own way of writing the same fake into the same global. */
const STUB_GLOBAL = new Set(['stubGlobal']);

/** `vi.spyOn(globalThis, name)` — the third spelling, and the one that also breaks `new`. */
const SPY_ON = new Set(['spyOn']);

/** Strip `as T` / `<T>x` — a hand-rolled observer is cast to `typeof IntersectionObserver` almost by convention. */
function withoutCasts(node: EsNode): EsNode {
  let current = node;

  while (isCast(current)) {
    current = current.expression;
  }

  return current;
}

/** The string a literal spells, for the two forms that name the global in an argument. */
function literalString(node: EsNode): string | undefined {
  const value: unknown = node.type === 'Literal' ? Reflect.get(node, 'value') : undefined;

  return typeof value === 'string' ? value : undefined;
}

/** Whether a node reads the global object — `globalThis`, or one of its three aliases, cast or not. */
function isGlobalReceiver(node: EsNode): boolean {
  const receiver = withoutCasts(node);

  return isIdentifier(receiver) && GLOBAL_RECEIVERS.has(receiver.name);
}

/** The key a member expression addresses, when it is a name rather than something computed at run time. */
function memberKey(member: EsMemberExpression): string | undefined {
  return member.computed ? literalString(member.property) : memberName(member);
}

/** The observer a member expression addresses on the global — dotted or through a string key. */
function observerOn(node: EsNode): ObserverTarget | undefined {
  if (!isMemberExpression(node) || !isGlobalReceiver(node.object)) {
    return undefined;
  }

  const key = memberKey(node);

  return key === undefined ? undefined : OBSERVERS[key];
}

/** The observer a `'IntersectionObserver'` argument names. */
function observerNamed(node: EsNode | undefined): ObserverTarget | undefined {
  const name = node === undefined ? undefined : literalString(node);

  return name === undefined ? undefined : OBSERVERS[name];
}

/**
 * The definition kinds eslint-scope gives a name, read by kind rather than by node.
 *
 * A parameter's definition points at the **function** it belongs to, so reading
 * `isFunctionNode(definition.node)` calls every parameter a function — and `function restore(original) {
 * globalThis.ResizeObserver = original; }` is then reported as installing a double. Found by the
 * test that pins the restore silent.
 */
const DECLARES_A_CONSTRUCTOR = new Set(['ClassName', 'FunctionName']);

/** Whether a definition is a `const` / `let` declarator, the only kind `initializerOf` can read. */
function declaresAVariable(definition: EsVariableDefinition): boolean {
  return definition.type === 'Variable' && isVariableDeclarator(definition.node);
}

/** Whether a definition is a class or function declaration — a double written above the hook that installs it. */
function declaresAConstructor(definition: EsVariableDefinition): boolean {
  return DECLARES_A_CONSTRUCTOR.has(definition.type);
}

/**
 * Whether a value is a double rather than a real implementation.
 *
 * This is the whole of the rule's discrimination, and it is what separates the stub from both the
 * `afterEach` that puts the original back and the polyfill an application installs on purpose: a
 * class or a function written here, or a runner mock, is a double; a name that came from an import
 * or from a `let` the spec filled with the old value is not.
 */
function isDouble(context: RuleContext, value: EsNode): boolean {
  const node = withoutCasts(value);

  if (node.type === 'ClassExpression' || isFunctionNode(node) || isRunnerFnCall(node)) {
    return true;
  }

  return isIdentifier(node) && namesADouble(context, node);
}

/**
 * The same question one step through a name, which is how the majority of them are written.
 *
 * A `class RecordingIntersectionObserver { … }` above the `beforeEach` is the commonest spelling of
 * all, and it is a declaration rather than an initialiser — so the binding is read directly as well
 * as through `initializerOf`, which only knows about `const` and `let`.
 */
function namesADouble(context: RuleContext, identifier: EsIdentifier): boolean {
  const scope = context.sourceCode.getScope(identifier);
  const binding = findBinding(scope, identifier.name);

  if (!binding) {
    return false;
  }

  if (binding.defs.some(declaresAConstructor)) {
    return true;
  }

  // A `const` or `let` is followed only where the value is still knowably what it was initialised
  // with: `initializerOf` gives up on a name assigned twice, which is exactly the save-and-restore
  // variable this rule has to stay silent about.
  const initializer = binding.defs.some(declaresAVariable) ? initializerOf(scope, identifier) : undefined;

  return initializer !== undefined && isDouble(context, initializer);
}

/** `globalThis.IntersectionObserver = class { … }`, and the two runner spellings of the same fake. */
export const preferObserverStub: RuleModule = defineRule({
  anchor: '-a-class-the-code-under-test-builds-with-new',
  description:
    'Install an observer global with stubIntersectionObserver / stubResizeObserver / stubMutationObserver instead of writing one by hand',
  messages: {
    preferObserverStub:
      '`{{observer}}` is being replaced by hand. `{{helper}}()` from `vitest-auto-spy/dom-stubs` is that stub in one line, and it hands back the observers the code under test constructed: `observers.last.emit([{{entry}}(…)])` fires the callback, `observers.last.disconnected` is the teardown assertion the hand-rolled `disconnect` spy was written for, `observers.last.options` is the init object it was built with, and `observers.instances` is every one of them in construction order. **Do not write the restore.** The stub goes on through `mockValueProp`, so `restoreMockedProps()` — which `setupAutoSpy()` already runs after every test — puts the real constructor back: the `let original = globalThis.{{observer}}` above and the `afterEach` that assigns it back are both dead weight, and the second one is worse than dead. A restore written inside the test runs only if every assertion above it passed, so the first red test leaves the stub installed for the rest of the file and, under `isolate: false`, for every later file the worker picks up — where it surfaces as `observe is not a function` in a component nobody edited.',
    preferObserverStubOverRunner:
      '`{{observer}}` is being faked through the runner. `{{helper}}()` from `vitest-auto-spy/dom-stubs` replaces the whole of that and returns a handle rather than a static field: `observers.last.emit([{{entry}}(…)])` drives the callback, `observers.last.targets` is what was observed, `observers.last.disconnected` is the teardown assertion, and `observers.instances.length` counts constructions — which is what a spy on the constructor was being counted for. Two things the runner form does not give you. It is not a constructor: `vi.fn().mockImplementation((callback) => ({ observe() {} }))` is an arrow, `new {{observer}}(callback)` inside the component cannot call it, and the `TypeError` lands in application code with the spec still looking correct. And it is not undone: `{{helper}}()` registers its undo with `restoreMockedProps()`, which `setupAutoSpy()` runs after every test, so nothing has to remember `vi.unstubAllGlobals()` or an `afterEach`.',
  },
  create: (context) => {
    const report = (node: EsNode, target: ObserverTarget, messageId: string): void => context.report({ node, messageId, data: target });

    /** `vi.spyOn(globalThis, 'MutationObserver')` — a global receiver and an observer named after it. */
    const spiedObserver = (node: EsCallExpression): ObserverTarget | undefined => {
      const target = node.arguments[0];

      return target !== undefined && isGlobalReceiver(target) ? observerNamed(node.arguments[1]) : undefined;
    };

    return {
      AssignmentExpression: (node: EsAssignmentExpression): void => {
        const target = observerOn(node.left);

        if (target !== undefined && isDouble(context, node.right)) {
          report(node, target, 'preferObserverStub');
        }
      },

      CallExpression: (node: EsCallExpression): void => {
        if (isRunnerCall(node, STUB_GLOBAL)) {
          const stubbed = observerNamed(node.arguments[0]);
          const value = node.arguments[1];

          if (stubbed !== undefined && value !== undefined && isDouble(context, value)) {
            report(node, stubbed, 'preferObserverStubOverRunner');
          }

          return;
        }

        const spied = isRunnerCall(node, SPY_ON) ? spiedObserver(node) : undefined;

        if (spied !== undefined) {
          report(node, spied, 'preferObserverStubOverRunner');
        }
      },
    };
  },
});
