/** `vi.spyOn(TestBed.inject(X), 'method')`, in one step or in two → `injectSpy(X).method`. */
import { defineRule } from './define-rule';
import { INJECTED_SPY_SCHEMA, injectSpySuggestion, injectedFromVariable, isTestBedInject, keepsTheRealInstance } from './injected-spy';
import { argumentList } from './message-data';
import type { EsCallExpression } from './rule-types';

export const preferInjectSpy = defineRule({
  name: 'prefer-inject-spy',
  description: 'Read an already-spied dependency with injectSpy() instead of re-spying a TestBed.inject() result',
  hasSuggestions: true,
  schema: INJECTED_SPY_SCHEMA,
  messages: {
    preferInjectSpy:
      '`vi.spyOn({{args}})` replaces one method of the `{{token}}` instance DI handed out and leaves the rest of it real. Provide it with `provideAutoSpy({{token}})` and read it back with `injectSpy({{token}})`; if the spec needs the real instance, list `{{token}}` in `{ ignoreTokens }`.',
  },
  create: (context) => ({
    'CallExpression[callee.object.name="vi"][callee.property.name="spyOn"]': (node: EsCallExpression): void => {
      const [target] = node.arguments;

      if (!target) {
        return;
      }

      // Two shapes, one problem: the injected instance handed straight to `spyOn`, and the same
      // instance parked in a `const` first. The second one is the common half of the pair — both
      // were found on adjacent lines of the same file, and only the inline one used to be reported.
      const injectCall = isTestBedInject(target) ? target : injectedFromVariable(context, target);

      // The token decides, not the spy: for a handful of framework objects the replacement this
      // rule advertises is impossible or removes the reason the spec injected them — see
      // `KEPT_REAL_TOKENS`, which `{ ignoreTokens: [...] }` extends per project.
      if (!injectCall || keepsTheRealInstance(context, injectCall)) {
        return;
      }

      const suggestion = injectSpySuggestion(context, node, injectCall);
      const report = {
        node,
        messageId: 'preferInjectSpy',
        data: { args: argumentList(context, node), token: argumentList(context, injectCall) },
      };

      context.report(suggestion ? { ...report, suggest: [suggestion] } : report);
    },
  }),
});
