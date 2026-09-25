/**
 * Error reporting for `mustBeCalledWith` — thrown when a spy configured with
 * required arguments is called with anything else.
 *
 * The failure prints **both sides**. It used to print only the actual arguments, which reads as an
 * accusation without an alternative: the spec author is told the call was wrong and left to scroll
 * back through the setup to find what "right" was. `td.explain` and sinon's `printf('%C')` both
 * print wanted next to actual for the same reason — the diagnosis is the comparison, not either
 * half of it. Every configured list is already serialized inside {@link ArgsMap}, so showing it
 * costs a lookup on a path that is about to throw anyway.
 */
import type { ArgsMap } from './args-map';
import { defineHelper } from './define-helper';
import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';
import { serializeValue } from './serialize-args';

/** `name(1,'a')` — one argument list in the shape of the call that would satisfy it. */
const asCall = (functionName: string, args: string): string => `${functionName}(${args})`;

const actualCall = (functionName: string, actualArgs: unknown[]): string => {
  // `serializeValue` wraps the array in brackets — drop them to show a bare arg list (`1,'a'`),
  // which inside the parentheses reads as the call that was made. The result is always a string.
  const formatted = serializeValue(actualArgs);

  return asCall(functionName, formatted.substring(1, formatted.length - 1));
};

/**
 * The top-level items of a rendered argument list, `1,'a',{x:[1,2]}` → `1` / `'a'` / `{x:[1,2]}`.
 *
 * The configured half exists only as text, so the comparison is between renderings.
 */
export function splitRenderedArgs(list: string): string[] {
  if (list === '') {
    return [];
  }

  const items: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;

  for (let index = 0; index < list.length; index += 1) {
    const char = list.charAt(index);

    if (quoted) {
      if (char === '\\') {
        index += 1;
      } else if (char === "'") {
        quoted = false;
      }
    } else if (char === "'") {
      quoted = true;
    } else if ('([{<'.includes(char)) {
      depth += 1;
    } else if (')]}>'.includes(char)) {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      items.push(list.slice(start, index));
      start = index + 1;
    }
  }

  items.push(list.slice(start));

  return items;
}

function bare(list: string): string {
  return list.substring(1, list.length - 1);
}

/** Where the call left the one configured list: the first argument that differs, or the count. */
function firstDifference(wanted: string, actualArgs: unknown[]): string {
  const expected = splitRenderedArgs(bare(wanted));
  const actual = actualArgs.map((arg) => serializeValue(arg));

  if (expected.length !== actual.length) {
    return `expected ${expected.length} argument(s), got ${actual.length}`;
  }

  const position = expected.findIndex((item, index) => item !== actual[index]);

  return position < 0
    ? 'the arguments render the same but did not match the config'
    : `argument ${position + 1}: expected ${String(expected[position])}, got ${String(actual[position])}`;
}

/**
 * The `Wanted:` half — one line for a single config, an indented list when several are registered.
 *
 * Empty when the caller passed no map (the two-argument form this helper has always accepted, kept
 * because `errorHandler` is exported and a consumer may call it directly).
 */
function wantedCalls(functionName: string, wanted: string[]): string {
  if (wanted.length === 0) {
    return '';
  }

  const calls = wanted.map((args) => asCall(functionName, bare(args)));

  if (calls.length === 1) {
    return `\nWanted: ${calls[0]}`;
  }

  return `\nWanted (${calls.length} configured):\n  ${calls.join('\n  ')}`;
}

function diagnosis(spyName: string, wanted: string[], actualArgs: unknown[]): string {
  const opening = `[vitest-auto-spy] ${spyName} is set up with mustBeCalledWith, and this call matches none of its configs`;
  const [only] = wanted;

  if (wanted.length === 1 && only !== undefined) {
    return `${opening} — ${firstDifference(only, actualArgs)}.`;
  }

  return `${opening}.`;
}

export const errorHandler = {
  /**
   * Report a call that no `mustBeCalledWith` config accepts.
   *
   * @param actualArgs The arguments the spy was called with.
   * @param functionName The spied method's name, used to render both sides as calls.
   * @param configured The `mustBeCalledWith` map, so the message can show what was wanted.
   * @param className The class the method belongs to, named in the first line when known.
   */
  throwArgumentsError: defineHelper((actualArgs: unknown[], functionName: string, configured?: ArgsMap, className?: string): never => {
    const wanted = configured?.configured() ?? [];
    const spyName = className === undefined ? functionName : `${className}.${functionName}`;
    const message =
      diagnosis(spyName, wanted, actualArgs) +
      wantedCalls(functionName, wanted) +
      `\nActual: ${actualCall(functionName, actualArgs)}` +
      '\nFix the value the code under test passes, or configure this call too.';

    throw new Error(withDocs(message, DOCS_LINKS.mustBeCalledWith));
  }),
};
