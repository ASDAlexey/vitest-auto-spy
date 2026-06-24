/**
 * Error reporting for `mustBeCalledWith` — thrown when a spy configured with
 * required arguments is called with anything else.
 */
import { serializeValue } from './serialize-args';

const MUST_BE_CALLED_WITH_PREAMBLE = (functionName: string): string =>
  `The function '${functionName}' was configured with 'mustBeCalledWith' ` + `and expects to be called with specific arguments. `;

const NO_ARGUMENTS_MESSAGE = `But the function was called without any arguments.`;

const actualArgumentsMessage = (actualArgs: unknown[]): string => {
  // `serializeValue` wraps the (always non-empty) array in brackets — drop them
  // to show a bare arg list (e.g. `1,'a'`). The result is always a string.
  const formatted = serializeValue(actualArgs);
  return `But the actual arguments were: ${formatted.substring(1, formatted.length - 1)}`;
};

export const errorHandler = {
  throwArgumentsError(actualArgs: unknown[], functionName: string): never {
    const detail = actualArgs.length === 0 ? NO_ARGUMENTS_MESSAGE : actualArgumentsMessage(actualArgs);
    throw new Error(MUST_BE_CALLED_WITH_PREAMBLE(functionName) + detail);
  },
};
