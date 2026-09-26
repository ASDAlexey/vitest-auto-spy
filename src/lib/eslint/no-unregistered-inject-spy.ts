/** `injectSpy(X)` for a token this file never registered as an auto-spy. */
import { defineRule } from './define-rule';
import type { EsArrayExpression, EsCallExpression } from './rule-types';
import { emptyRegistrations, readCall, readProviders, unregisteredInjections } from './unregistered-spy';

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
      'Property[key.name="providers"] > ArrayExpression': (node: EsArrayExpression): void => {
        readProviders(context, node, tally);
      },
      'Program:exit': (): void => {
        unregisteredInjections(tally).forEach(({ node, token }) => {
          context.report({ node, messageId: 'noUnregisteredInjectSpy', data: { token } });
        });
      },
    };
  },
});
