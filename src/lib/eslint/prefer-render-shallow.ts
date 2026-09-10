/**
 * `prefer-render-shallow`, in its own module for the same reason the newer rules are: the registry
 * counts every rule it still defines inline against its own line budget.
 */
import { defineRule } from './define-rule';
import { RENDER_MESSAGES, buildsDirectiveHarness, readsRenderedTemplate, renderShallowSuggestion, templatePolicy } from './dom-reads';
import type { EsCallExpression, EsNode, RuleModule } from './rule-types';

export const preferRenderShallow: RuleModule = defineRule({
  anchor: '-a-components-children',
  description: 'Render through renderShallow() when the spec never reads the rendered template',
  hasSuggestions: true,
  schema: [{ type: 'object', properties: { templates: { enum: ['as-needed', 'never'] } }, additionalProperties: false }],
  messages: RENDER_MESSAGES,
  create: (context) => ({
    'CallExpression[callee.object.name="TestBed"][callee.property.name="createComponent"]': (node: EsCallExpression): void => {
      // Asked of the whole file, not of this fixture: see `readsRenderedTemplate`. Under
      // `{ templates: 'never' }` the question is not asked at all — no spec renders a template,
      // except the harness a directive has no way to be reached without.
      const source = context.sourceCode.getText();
      const policy = templatePolicy(context);

      if (policy === 'as-needed' ? readsRenderedTemplate(source) : buildsDirectiveHarness(source)) {
        return;
      }

      // Two findings, not one wording: `as-needed` reports a render nobody reads and may say so,
      // while `never` reports the policy and knows nothing about the reads — under it the file that
      // gets reported is usually the one that reads the template hardest.
      const messageId = policy === 'never' ? 'templatesNever' : 'preferRenderShallow';
      const suggestion = renderShallowSuggestion(context, node);

      context.report(suggestion ? { node, messageId, suggest: [suggestion] } : { node, messageId });
    },
    'Property[key.name="keepTemplate"][value.value=true]': (node: EsNode): void => {
      if (templatePolicy(context) === 'never') {
        context.report({ node, messageId: 'keepTemplate' });
      }
    },
  }),
});
