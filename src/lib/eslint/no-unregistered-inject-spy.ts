/** `injectSpy(X)` for a token this file never registered as an auto-spy. */
import { findBinding, initializerOf } from './bindings';
import { defineRule } from './define-rule';
import {
  type EsArrayExpression,
  type EsCallExpression,
  type EsNode,
  type EsProperty,
  type RuleContext,
  isArrayExpression,
  isIdentifier,
  isMemberExpression,
  propertyName,
} from './rule-types';
import { emptyRegistrations, readCall, readProviders, unregisteredInjections } from './unregistered-spy';

/**
 * The array a `providers` key holds: written in place, or a `const` declared with one and never
 * mutated through a member (`providers.push(…)` adds entries this scan cannot see).
 */
function providerArray(context: RuleContext, value: EsNode): EsArrayExpression | undefined {
  if (isArrayExpression(value)) {
    return value;
  }

  if (!isIdentifier(value)) {
    return undefined;
  }

  const scope = context.sourceCode.getScope(value);
  const init = initializerOf(scope, value);
  const touched = findBinding(scope, value.name)?.references.some(
    ({ identifier }) => isMemberExpression(identifier.parent) && identifier.parent.object === identifier,
  );

  return init && isArrayExpression(init) && touched === false ? init : undefined;
}

export const noUnregisteredInjectSpy = defineRule({
  name: 'no-unregistered-inject-spy',
  description: 'Do not read a token with injectSpy unless this file registered it as an auto-spy',
  messages: {
    noUnregisteredInjectSpy:
      'Nothing in this file registers `{{token}}` as an auto-spy, so `injectSpy({{token}})` returns what DI already had, usually the real service, and the first `.mockReturnValue(…)` on it throws. Add `provideAutoSpy({{token}})` to the providers.',
  },
  create: (context) => {
    const tally = emptyRegistrations();

    return {
      CallExpression: (node: EsCallExpression): void => {
        readCall(context, node, tally);
      },
      Property: (node: EsProperty): void => {
        if (propertyName(node) !== 'providers') {
          return;
        }

        const providers = providerArray(context, node.value);

        if (providers) {
          readProviders(context, providers, tally);
        } else {
          tally.opaque = true;
        }
      },
      'Program:exit': (): void => {
        unregisteredInjections(tally).forEach(({ node, token }) => {
          context.report({ node, messageId: 'noUnregisteredInjectSpy', data: { token } });
        });
      },
    };
  },
});
