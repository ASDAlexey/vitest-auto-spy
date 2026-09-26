/** `export const events = [...BaseEvents]` at module scope → a TypeError, or a silently empty object, while the bundle loads. */
import { defineRule } from './define-rule';
import { lazyValueSuggestion, runsAtImportTime, spreadFailureMode, spreadOfImport } from './import-time-spread';
import type { EsSpreadElement } from './rule-types';

export const noImportTimeSpread = defineRule({
  name: 'no-import-time-spread',
  description: 'Do not spread an imported binding at module scope — inside a bundle it can still be undefined',
  hasSuggestions: true,
  messages: {
    noImportTimeSpread:
      'This spreads `{{name}}` from another module while this one is still loading. In a bundle that module’s chunk can run later, `{{name}}` is still `undefined`, and the spread throws `Spread syntax requires ...iterable[Symbol.iterator] to be a function` before any test runs. Build the value lazily, in a function called where it is read.',
    noImportTimeSpreadObject:
      'This spreads `{{name}}` from another module into an object while this one is still loading. In a bundle that module’s chunk can run later, and `{ ...undefined }` is `{}`, so every key reads `undefined` with no error. Build the value lazily, in a function called where it is read.',
  },
  create: (context) => ({
    SpreadElement: (node: EsSpreadElement): void => {
      const imported = spreadOfImport(context, node);

      if (!imported || !runsAtImportTime(node)) {
        return;
      }

      const suggestion = lazyValueSuggestion(context, node);
      const messageId = spreadFailureMode(node) === 'object' ? 'noImportTimeSpreadObject' : 'noImportTimeSpread';
      const report = { node, messageId, data: { name: imported.name } };

      context.report(suggestion ? { ...report, suggest: [suggestion] } : report);
    },
  }),
});
