import { defineRule } from './define-rule';
import {
  countRunnerFns,
  insideFactorySeed,
  insideFixtureSeed,
  insideModuleMock,
  isObserverArgument,
  isOptionsArgument,
  minRunnerFns,
  runnerFnNames,
  substitutesADependency,
} from './hand-rolled-doubles';
import { type EsObjectExpression } from './rule-types';

const LOWER_THRESHOLD =
  ' An object with fewer is not flagged: on its own it is indistinguishable from an options bag with a callback in it. Lower the threshold with `{ minRunnerFns: 1 }` if the suite has no such objects — a one-method double handed to DI, or one whose declared type is an object of Vitest `Mock`s, is reported at one either way.';

/** `{ a: vi.fn(), b: vi.fn() }` → `createSpyFromClass(X)` / `createAutoMock<T>()`. */
export const preferCreateSpyFromClass = defineRule({
  anchor: '-a-service-without-di',
  description: 'Build a spy from the class (createSpyFromClass / createAutoMock) instead of an object of vi.fn()s',
  schema: [{ type: 'object', properties: { minRunnerFns: { type: 'integer', minimum: 1 } }, additionalProperties: false }],
  messages: {
    preferCreateSpyFromClass:
      'An object of {{threshold}} `vi.fn()`s only mocks the methods you remembered. `createSpyFromClass(X)` reads the class, `createAutoMock<T>()` the type — both stay in step with it.{{lower}}',
    singleMember:
      'A one-member object of a `vi.fn()` — a thenable, a callback holder — has no class for `createSpyFromClass` to read. Type it instead: `createMock<T>({ {{name}}: vi.fn() })` checks the key and the signature against `T`, which this literal is checked against nowhere.',
  },
  create: (context) => ({
    ObjectExpression: (node: EsObjectExpression): void => {
      // The provider form is `prefer-provide-auto-spy`'s business — do not report it twice; a seed
      // handed to one of this library's own factories is the fix rather than the problem; and a
      // module mock's exports are not a service double at all.
      //
      // "The provider form" is read one name wide, because that is how far the provider rule reads:
      // a literal parked in a `const` and passed to `useValue` by name drew a report from each of
      // the two, one recommending `createSpyFromClass` and one `provideAutoSpy`, on the same double.
      if (
        substitutesADependency(context, node) ||
        countRunnerFns(context, node) < minRunnerFns(context) ||
        insideFactorySeed(node) ||
        insideFixtureSeed(node) ||
        insideModuleMock(node) ||
        isOptionsArgument(context, node) ||
        isObserverArgument(node)
      ) {
        return;
      }

      const threshold = minRunnerFns(context);

      if (node.properties.length === 1) {
        context.report({ node, messageId: 'singleMember', data: { name: runnerFnNames(context, node).join('') } });

        return;
      }

      context.report({
        node,
        messageId: 'preferCreateSpyFromClass',
        data: threshold === 1 ? { threshold: 'one or more', lower: '' } : { threshold: `${threshold} or more`, lower: LOWER_THRESHOLD },
      });
    },
  }),
});
