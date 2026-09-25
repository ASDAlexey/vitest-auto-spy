/**
 * A promise-returning helper called as a statement and dropped.
 *
 * `await expectEmission(spy.value$, 1)` asserts; `expectEmission(spy.value$, 1)` schedules an
 * assertion that settles after the test has already passed, so it reports into a later test or
 * nowhere. Nothing fails, which is the whole family this command exists for.
 *
 * It needs no type checker, only name resolution: the callee is matched against the local bindings
 * *this file* took from our export map, and the promise-returning set is generated from the
 * signatures rather than listed by hand. A file that defines its own `stable` is not our business,
 * and a file that renamed ours with `as` still is.
 */
import { findStringEnd } from '../fs-scan';
import type { Profile } from '../profile';
import type { Finding } from '../report';
import { findEntryImports, isAwaitableHelper, scanSources } from './entry-imports';
import type { SourceGraph } from './graph';
import { isInsideLiteral, literalSpans } from './literals';

const QUOTES = new Set(["'", '"', '`']);
const SPACING = new Set([' ', '\t']);

/** What may follow the call for it to have been a statement. The empty string is end of file. */
const STATEMENT_ENDERS = new Set(['', ';', '\n', '\r', '}']);

/** The identifiers this file bound to a promise-returning export of ours, renames included. */
export function awaitableLocals(source: string): string[] {
  const locals = findEntryImports(source)
    .filter(({ name }) => isAwaitableHelper(name))
    .map(({ local }) => local);

  return [...new Set(locals)];
}

/** The index of the `)` closing the call whose `(` is at `open`, or `-1` when it is unbalanced. */
function endOfCall(source: string, open: number): number {
  let depth = 0;
  let index = open;

  while (index < source.length) {
    const char = source.charAt(index);

    if (QUOTES.has(char)) {
      index = findStringEnd(source, index);

      continue;
    }

    if (char === '(') {
      depth += 1;
    }

    if (char === ')') {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }

    index += 1;
  }

  return -1;
}

function isStatementEnd(source: string, from: number): boolean {
  let index = from;

  while (SPACING.has(source.charAt(index))) {
    index += 1;
  }

  return STATEMENT_ENDERS.has(source.charAt(index));
}

/**
 * The one shape that is unambiguous without a parser: a call that both begins a statement and ends
 * one. Anything the value could still flow out of — `await`, `return`, an assignment, an argument,
 * a `.then`, a concise arrow body, `void` — is left alone, and so is a method of the same name and
 * a call that is quoted or commented out rather than run.
 */
export function findUnawaitedCalls(source: string, locals: readonly string[]): string[] {
  return findUnawaitedSites(source, locals).map((site) => site.local);
}

/** {@link findUnawaitedCalls}, with the line each call starts on. */
export function findUnawaitedSites(source: string, locals: readonly string[]): { local: string; line: number }[] {
  if (locals.length === 0) {
    return [];
  }

  const spans = literalSpans(source);
  const pattern = new RegExp(`(?:^|[;{}])\\s*(${locals.join('|')})\\s*\\(`, 'g');
  const found: { local: string; line: number }[] = [];

  source.replace(pattern, (whole: string, local: string, offset: number): string => {
    const close = endOfCall(source, offset + whole.length - 1);

    if (!isInsideLiteral(spans, offset) && close !== -1 && isStatementEnd(source, close + 1)) {
      found.push({ local, line: source.slice(0, offset + whole.indexOf(local)).split('\n').length });
    }

    return whole;
  });

  return found;
}

export function checkUnawaitedHelper(profile: Profile, graph: SourceGraph): Finding[] {
  return scanSources(profile, graph, (file, text, report) => {
    const lines = new Map<string, number[]>();

    for (const { local, line } of findUnawaitedSites(text, awaitableLocals(text))) {
      lines.set(local, [...(lines.get(local) ?? []), line]);
    }

    for (const [local, at] of lines) {
      report({
        check: 'no-unawaited-helper',
        severity: 'error',
        file,
        message: `${at.length === 1 ? 'Line' : 'Lines'} ${at.join(', ')}: \`${local}()\` is called as a statement, and the promise it returns is dropped.`,
        fix: 'Await it. Unawaited, it settles after the test has ended, so its assertion reports into a later test or nowhere.',
      });
    }
  });
}
