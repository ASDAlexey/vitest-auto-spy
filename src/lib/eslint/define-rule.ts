/**
 * How a rule of this plugin is assembled.
 *
 * Every rule links to its own section of the rules page, and every message ends with that link: the
 * message says what is wrong here and the one fix, the section carries the reasoning behind it. The
 * builder lives on its own so that a second file of rules can use it without importing the first one
 * back: `rules.ts` holds the rules a Vitest suite is linted by, `jasmine-rules.ts` the ones a suite
 * still on the compatibility layer is, and neither is the other's dependency.
 */
import { DOCS } from '../message-link';
import type { RuleContext, RuleListener, RuleModule } from './rule-types';

/** The rules page; each rule's section is its heading, so the fragment is the rule's name. */
export const RULES_PAGE = `${DOCS}/utilities/eslint-rules`;

/** Build a rule, appending the link to its own docs section to every message. */
export function defineRule(options: {
  name: string;
  description: string;
  messages: Record<string, string>;
  fixable?: true;
  hasSuggestions?: true;
  schema?: readonly object[];
  create: (context: RuleContext) => RuleListener;
}): RuleModule {
  const url = `${RULES_PAGE}#${options.name}`;
  const messages = Object.fromEntries(Object.entries(options.messages).map(([id, text]) => [id, `${text} Docs: ${url}`]));

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
