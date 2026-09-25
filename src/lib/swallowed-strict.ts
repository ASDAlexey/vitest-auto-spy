/**
 * The report for a strict double's throw that something caught before the test saw it: the call with
 * its arguments, where the code under test made it, and what most likely swallowed it.
 */
import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';
import { count, displayFrame } from './message-text';
import { ownFrames, stackFrames } from './stack-frames';

/** This package's own source, for a checkout linked in place of the published build; its specs stay. */
const LIBRARY_SOURCE_FRAME = /[/\\]vitest-auto-spy[/\\]src[/\\](?:lib[/\\])?[\w-]+\.[cm]?[jt]s:/;

const RXJS_FRAME = /[/\\]node_modules[/\\]rxjs[/\\]/;

/** `CartService.load(42, "eu")`: the "Called as" line when the error has one, else the call its headline names. */
function strictCallOf(message: string): string {
  const lines = message.split('\n');
  const calledAs = lines.find((line) => line.startsWith('Called as: '));

  if (calledAs !== undefined) {
    return calledAs.slice('Called as: '.length);
  }

  const headline = String(lines[0]).replace(/^\[vitest-auto-spy] /, '');

  return /^(.+?) was called\b/.exec(headline)?.[1] ?? headline;
}

/** The first frame in the code under test: the error's own "Called from" line, or its stack past this package. */
function strictFrameOf(error: Error): string | undefined {
  const calledFrom = error.message.split('\n').find((line) => line.startsWith('Called from '));

  if (calledFrom !== undefined) {
    const frame = calledFrom.slice('Called from '.length);

    return displayFrame(frame.startsWith('at ') ? frame : `at ${frame}`);
  }

  const frame = ownFrames(
    stackFrames(error.stack).filter((line) => !LIBRARY_SOURCE_FRAME.test(line)),
    1,
  )[0];

  return frame === undefined ? undefined : displayFrame(frame);
}

function swallowedBy(error: Error): string {
  return RXJS_FRAME.test(String(error.stack))
    ? 'an RxJS subscriber with no error callback took it'
    : 'the code under test caught it (try/catch, .catch or catchError)';
}

function describeSwallowedStrictCall(error: Error): string {
  const frame = strictFrameOf(error);

  return `  - ${strictCallOf(error.message)}${frame === undefined ? '' : ` ${frame}`} — ${swallowedBy(error)}`;
}

/** Exported for its spec, which builds the errors with the real strict double. */
export function describeSwallowedStrictCalls(swallowed: readonly Error[], test: string | undefined): string {
  const one = swallowed.length === 1;
  const subject = test === undefined ? 'This test' : `"${test}"`;

  return withDocs(
    `[vitest-auto-spy] ${subject} made ${count(swallowed.length, 'call')} a strict double had nothing configured for, and ` +
      `${one ? 'the throw never' : 'none of the throws'} reached the test:\n${swallowed.map(describeSwallowedStrictCall).join('\n')}\n` +
      `Configure ${one ? 'that method' : 'each method'} (.mockReturnValue, .calledWith or the returns option), or drain ` +
      `${one ? 'the throw' : 'the throws'} with takeStrictViolations() when the test provokes ${one ? 'it' : 'them'} on purpose.`,
    DOCS_LINKS.strictSwallowed,
  );
}
