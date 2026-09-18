/**
 * `prefer-render-shallow`, in its own module for the same reason the newer rules are: the registry
 * counts every rule it still defines inline against its own line budget.
 */
import { defineRule } from './define-rule';
import { RENDER_MESSAGES, renderShallowSuggestion, rendersOnlyWhatIsRead, templatePolicy } from './dom-reads';
import type { EsCallExpression, EsNode, RuleModule } from './rule-types';

export const preferRenderShallow: RuleModule = defineRule({
  anchor: '-a-components-children',
  description: 'Render through renderShallow() when the spec never reads the rendered template',
  hasSuggestions: true,
  schema: [{ type: 'object', properties: { templates: { enum: ['as-needed', 'never'] } }, additionalProperties: false }],
  messages: RENDER_MESSAGES,
  create: (context) => {
    // The exemption is about the whole file, and the file does not change while it is being linted:
    // a spec with forty `TestBed.createComponent` calls used to re-read all 1.7 MB of it forty times.
    let exempt: boolean | undefined;

    return {
      'CallExpression[callee.object.name="TestBed"][callee.property.name="createComponent"]': (node: EsCallExpression): void => {
        exempt ??= rendersOnlyWhatIsRead(context);

        if (exempt) {
          return;
        }

        // Two findings, not one wording: `as-needed` reports a render nobody reads and may say so,
        // while `never` reports the policy and knows nothing about the reads — under it the file
        // that gets reported is usually the one that reads the template hardest.
        const messageId = templatePolicy(context) === 'never' ? 'templatesNever' : 'preferRenderShallow';
        const suggestion = renderShallowSuggestion(context, node);

        context.report(suggestion ? { node, messageId, suggest: [suggestion] } : { node, messageId });
      },
      'Property[key.name="keepTemplate"][value.value=true]': (node: EsNode): void => {
        if (templatePolicy(context) === 'never') {
          context.report({ node, messageId: 'keepTemplate' });
        }
      },
    };
  },
});
