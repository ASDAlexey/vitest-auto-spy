/** `vi.resetAllMocks()` → `resetAutoSpy(double)`: the global reset reaches mocks this file never created. Silent until `{ isolate: false }`. */
import { defineRule } from './define-rule';
import { type EsCallExpression, type RuleContext, isRunnerCall } from './rule-types';

function sharesWorker(context: RuleContext): boolean {
  return Reflect.get(Object(context.options[0]), 'isolate') === false;
}

const RESET_ALL = new Set(['resetAllMocks']);

export const noResetAllMocks = defineRule({
  name: 'no-reset-all-mocks',
  description: 'Do not reset every mock of the worker — reset the one double the test owns',
  schema: [{ type: 'object', properties: { isolate: { enum: [false] } }, additionalProperties: false }],
  messages: {
    noResetAllMocks:
      '`{{call}}` resets every live mock of the worker, including those of other spec files when `isolate: false` shares the module registry, so neighbouring specs fail intermittently. Reset one double with `resetAutoSpy(double)`, or scope it with `using spy = createSpyFromClass(X)`; the runner’s `clearMocks` / `restoreMocks` already cover the per-test cleanup.',
  },
  create: (context) =>
    sharesWorker(context)
      ? {
          CallExpression: (node: EsCallExpression): void => {
            if (isRunnerCall(node, RESET_ALL)) {
              context.report({ node, messageId: 'noResetAllMocks', data: { call: context.sourceCode.getText(node.callee) + '()' } });
            }
          },
        }
      : {},
});
