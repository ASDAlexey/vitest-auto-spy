/**
 * `destroyAfterEach: false` — the pre-Angular-13 opt-out that keeps every fixture of a file alive
 * until the worker exits. Reported wherever the literal is written: `initTestEnvironment` in a setup
 * file, or `teardown` on one `configureTestingModule`.
 */
import { defineRule } from './define-rule';
import { type EsNode, propertyName } from './rule-types';

export const noDisabledTestbedTeardown = defineRule({
  name: 'no-disabled-testbed-teardown',
  description: 'Keep TestBed teardown on — destroyAfterEach: false leaks every fixture into the tests after it',
  messages: {
    noDisabledTestbedTeardown:
      '`destroyAfterEach: false` keeps every fixture alive after its test: `ngOnDestroy` never runs, the subscriptions and timers a component started keep firing into later tests, and the DOM and heap grow with the suite. Delete it — `true` is the default since Angular 13 — and fix the test that fails, which was reading a previous test’s leftovers.',
  },
  create: (context) => ({
    'Property[value.value=false]': (node: EsNode): void => {
      if (propertyName(node) === 'destroyAfterEach') {
        context.report({ node, messageId: 'noDisabledTestbedTeardown' });
      }
    },
  }),
});
