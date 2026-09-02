/**
 * Reading the call that follows a member, and the two note shapes every jasmine transform needs.
 *
 * All of it goes through the mask, so a `jasmine.` inside a comment or a string is never a call to
 * anybody. A call whose brackets do not balance answers `undefined` rather than a guessed end —
 * the region is then left alone and the residue check reports it, which is the same bargain
 * `matchBracket` makes everywhere else in this codemod.
 */
import type { Finding } from '../report';
import type { Edit, TransformOutput } from './edits';
import { EMPTY_OUTPUT, note } from './edits';
import type { Range } from './mask';
import { lineOf, matchBracket, splitTopLevel } from './mask';
import type { Match, TransformContext } from './transform-context';
import { group, scan, textOf } from './transform-context';

/**
 * The `(` … `)` that starts at or just after `after`, or `undefined` when there is none and when it
 * does not close.
 */
export function callRange(context: TransformContext, after: number): Range | undefined {
  const gap = /^\s*\(/.exec(context.masked.slice(after));

  if (gap === null) {
    return undefined;
  }

  const open = after + group(gap, 0).length - 1;
  const close = matchBracket(context.masked, open);

  return close === undefined ? undefined : [open, close];
}

/** That call's arguments, each as it is written in the source. */
export function callArguments(context: TransformContext, [open, close]: Range): string[] {
  return splitTopLevel(context.masked, open + 1, close - 1).map((range) => textOf(context, range));
}

/** One span, replaced. The shape nearly every rewrite in these transforms has. */
export function replacement(start: number, end: number, text: string): TransformOutput {
  return { ...EMPTY_OUTPUT, edits: [{ start, end, text }] };
}

/** Every match of a global pattern, replaced by what `text` says about it. */
export function replacements(context: TransformContext, pattern: RegExp, text: (match: Match) => string): TransformOutput {
  return {
    ...EMPTY_OUTPUT,
    edits: scan(context.masked, pattern).map(
      (match): Edit => ({ start: match.index, end: match.index + match.whole.length, text: text(match) }),
    ),
  };
}

/** A warning addressed to a source position. Every note these transforms produce is one of these. */
export function jasmineNote(context: TransformContext, check: string, index: number, message: string, fix: string): Finding {
  return note({ check, severity: 'warning', file: context.file, line: lineOf(context.source, index), message, fix });
}

/**
 * The note for a name that has to move to one of this package's entry points while the entry table
 * could not be generated. Same refusal `inject-cast` makes: without the installed package's own
 * export map there is no honest answer to "which subpath exports this".
 */
export function missingEntryNote(context: TransformContext, index: number, name: string): Finding {
  return jasmineNote(
    context,
    'no-entry-table',
    index,
    `The entry-point table could not be generated, so \`${name}\` has no import to be added from.`,
    'Install vitest-auto-spy in this repository (`npm i -D vitest-auto-spy`) and run again — the table is read from its own export map, never hard-coded.',
  );
}
