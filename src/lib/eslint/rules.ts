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
  type EsNode,
  type EsObjectExpression,
  type EsProperty,
  type RuleContext,
  type RuleListener,
  type RuleModule,
  findProperty,
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

/** Every rule the plugin ships, keyed by the name used in an ESLint config. */
export const rules: Record<string, RuleModule> = {
  'prefer-provide-auto-spy': preferProvideAutoSpy,
  'prefer-create-spy-from-class': preferCreateSpyFromClass,
  'prefer-inject-spy': preferInjectSpy,
  'no-object-define-property': noObjectDefineProperty,
  'no-expect-in-subscribe': noExpectInSubscribe,
};
