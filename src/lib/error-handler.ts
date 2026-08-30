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
import { DOCS_LINKS, withDocs } from './docs-links';
import { serializeValue } from './serialize-args';

const MUST_BE_CALLED_WITH_PREAMBLE = (functionName: string): string =>
  `The function '${functionName}' was configured with 'mustBeCalledWith' and expects to be called with specific arguments.`;

/** `name(1,'a')` — one argument list in the shape of the call that would satisfy it. */
const asCall = (functionName: string, args: string): string => `${functionName}(${args})`;

const actualCall = (functionName: string, actualArgs: unknown[]): string => {
  // `serializeValue` wraps the array in brackets — drop them to show a bare arg list (`1,'a'`),
  // which inside the parentheses reads as the call that was made. The result is always a string.
  const formatted = serializeValue(actualArgs);

  return asCall(functionName, formatted.substring(1, formatted.length - 1));
};

/**
 * The `Wanted:` half — one line for a single config, an indented list when several are registered.
 *
 * Empty when the caller passed no map (the two-argument form this helper has always accepted, kept
 * because `errorHandler` is exported and a consumer may call it directly).
 */
function wantedCalls(functionName: string, configured: ArgsMap | undefined): string {
  const wanted = configured?.configured() ?? [];

  if (wanted.length === 0) {
    return '';
  }

  const calls = wanted.map((args) => asCall(functionName, args.substring(1, args.length - 1)));

  if (calls.length === 1) {
    return `\nWanted: ${calls[0]}`;
  }

  return `\nWanted (${calls.length} configured):\n  ${calls.join('\n  ')}`;
}

export const errorHandler = {
  /**
   * Report a call that no `mustBeCalledWith` config accepts.
   *
   * @param actualArgs The arguments the spy was called with.
   * @param functionName The spied method's name, used to render both sides as calls.
   * @param configured The `mustBeCalledWith` map, so the message can show what was wanted.
   */
  throwArgumentsError: defineHelper((actualArgs: unknown[], functionName: string, configured?: ArgsMap): never => {
    const message =
      MUST_BE_CALLED_WITH_PREAMBLE(functionName) +
      wantedCalls(functionName, configured) +
      `\nActual: ${actualCall(functionName, actualArgs)}`;

    throw new Error(withDocs(message, DOCS_LINKS.controlHelpers));
  }),
};
