/**
 * How a rule of this plugin is assembled.
 *
 * Every message ends with the recipe that shows the replacement, so a report is one click away from
 * the code that repairs it — a rule that only says "don't" moves the problem instead of solving it.
 * The builder lives on its own so that a second file of rules can use it without importing the first
 * one back: `rules.ts` holds the rules a Vitest suite is linted by, `jasmine-rules.ts` the ones a
 * suite still on the compatibility layer is, and neither is the other's dependency.
 */
import type { RuleContext, RuleListener, RuleModule } from './rule-types';

/** The section of the README every rule points into; the anchor continues this fragment. */
const README = 'https://github.com/ASDAlexey/vitest-auto-spy#how-to-mock';

/** Build a rule, appending the recipe link to every message so the fix is one click away. */
export function defineRule(options: {
  anchor: string;
  description: string;
  messages: Record<string, string>;
  fixable?: true;
  hasSuggestions?: true;
  schema?: readonly object[];
  create: (context: RuleContext) => RuleListener;
}): RuleModule {
  const url = `${README}${options.anchor}`;
  const messages = Object.fromEntries(Object.entries(options.messages).map(([id, text]) => [id, `${text} Recipe: ${url}`]));

  return {
    meta: {
      type: 'suggestion',
      docs: { description: options.description, url },
      messages,
      schema: options.schema ?? [],
      // Spread rather than assigned: ESLint reads the presence of these keys, and
      // `exactOptionalPropertyTypes` will not let an absent one be spelled as `undefined`.
      ...(options.fixable ? { fixable: 'code' as const } : {}),
      ...(options.hasSuggestions ? { hasSuggestions: true } : {}),
    },
    create: options.create,
  };
}
