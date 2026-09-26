/** `TestBed.inject()` / `injectSpy()` in a hook, in a suite that still overrides → the override throws. */
import { defineRule } from './define-rule';
import { excerpt } from './message-data';
import type { EsNode } from './rule-types';
import { INSTANTIATES_THE_MODULE, OVERRIDES_THE_MODULE, RESETS_THE_MODULE, type TestBedOrdering, breaksAnOverride } from './testbed-order';

export const noInjectBeforeOverride = defineRule({
  name: 'no-inject-before-override',
  description: 'Do not instantiate the TestBed in a hook when the suite still needs to override a provider',
  messages: {
    noInjectBeforeOverride:
      '`{{call}}` instantiates the testing module here, and this suite still calls `TestBed.override*` later, which then throws `Cannot override provider when the test module has already been instantiated`. Read the double inside the test, after the overrides, or keep it lazy: `const api = () => {{call}}`.',
  },
  create: (context) => {
    // Collected first, decided at the end: an `override*` runs whenever its suite calls it, so the
    // question is about the whole file and asking it per injection re-read the file once per
    // injection — 96 % of the plugin's time on a spec with fifteen of them in one hook.
    const ordering: TestBedOrdering = { overrides: [], resets: [] };
    const injections: EsNode[] = [];

    return {
      [OVERRIDES_THE_MODULE]: (node: EsNode): void => {
        ordering.overrides.push(node);
      },
      [RESETS_THE_MODULE]: (node: EsNode): void => {
        ordering.resets.push(node);
      },
      [INSTANTIATES_THE_MODULE]: (node: EsNode): void => {
        injections.push(node);
      },
      'Program:exit': (): void => {
        injections.forEach((node) => {
          if (breaksAnOverride(node, ordering)) {
            context.report({ node, messageId: 'noInjectBeforeOverride', data: { call: excerpt(context, node) } });
          }
        });
      },
    };
  },
});
