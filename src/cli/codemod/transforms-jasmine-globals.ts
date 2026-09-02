/**
 * The `jasmine` global, its two types, and the matchers Vitest spells differently.
 *
 * These appear in *any* jasmine suite, auto-spies or not — nothing imports them, so nothing points
 * at them, and after the runner swap they fail as `ReferenceError: jasmine is not defined` at the
 * first line that reads one. They are also the part of the migration where a plausible rename is
 * wrong most often: `jasmine.createSpy('name')` takes a name Vitest has nowhere to put,
 * `jasmine.clock()` is four different `vi` calls depending on the member behind it, and
 * `jasmine.DEFAULT_TIMEOUT_INTERVAL = n` is a *config* setting with no statement to become.
 *
 * `vi` and `expect` are written bare rather than imported. A suite that ran under jasmine ran with
 * globals — `describe`, `it` and `expect` were never imported there either — so the file already
 * depends on them, and an added `from 'vitest'` would be the wrong specifier in a repository whose
 * runner is `bun test` or `node --test`.
 */
import type { Finding } from '../report';
import type { Edit, TransformOutput } from './edits';
import { EMPTY_OUTPUT, mergeOutputs } from './edits';
import { entryFor } from './entry-map';
import { ASYMMETRIC_MATCHERS, CLOCK_MEMBERS, MATCHER_RENAMES, NO_TWIN, TYPE_TARGETS } from './jasmine-api';
import { callArguments, callRange, jasmineNote, missingEntryNote, replacement, replacements } from './jasmine-calls';
import { matchBracket } from './mask';
import type { Match, TransformContext, TransformSpec } from './transform-context';
import { group, scan } from './transform-context';

const MEMBER = /\bjasmine\s*\.\s*([$A-Z_a-z][\w$]*)/g;
const ASYMMETRIC = new Set(ASYMMETRIC_MATCHERS);

/** `jasmine.any(X)` → `expect.any(X)`, and the dozen others, with the members that have no twin reported. */
export const jasmineGlobals: TransformSpec = {
  id: 'jasmine-globals',
  family: 'jasmine',
  summary: 'jasmine.createSpy / createSpyObj / any / clock() / addMatchers → their vi, expect and vitest-auto-spy twins.',
  // The two type names are excluded rather than left to overlap: `jasmine-types` owns them, and a
  // leftover `jasmine.SpyObj` reported twice would name a transform that never intended to touch it.
  residue: /\bjasmine\s*\.\s*(?!Spy(?:Obj)?\b)/,
  run: (context) =>
    mergeOutputs(
      scan(context.masked, MEMBER).flatMap((match) => {
        const name = group(match.groups, 1);

        return TYPE_TARGETS[name] === undefined ? [globalOutput(context, match, name)] : [];
      }),
    ),
};

function globalOutput(context: TransformContext, match: Match, name: string): TransformOutput {
  const after = match.index + match.whole.length;

  if (name === 'clock') {
    return clockOutput(context, match, after);
  }

  if (ASYMMETRIC.has(name)) {
    return replacement(match.index, after, `expect.${name}`);
  }

  if (name === 'addMatchers') {
    return replacement(match.index, after, 'expect.extend');
  }

  return calledGlobal(context, match, name, after);
}

/** The three members whose arguments decide the rewrite, and the fallback that reports the rest. */
function calledGlobal(context: TransformContext, match: Match, name: string, after: number): TransformOutput {
  const range = callRange(context, after);

  if (range === undefined) {
    return { ...EMPTY_OUTPUT, notes: [leftAloneNote(context, match.index, name)] };
  }

  if (name === 'createSpy') {
    return replacement(match.index, range[1], createSpyText(callArguments(context, range)));
  }

  if (name === 'addCustomEqualityTester') {
    return replacement(match.index, range[1], `expect.addEqualityTesters([${callArguments(context, range).join(', ')}])`);
  }

  return name === 'createSpyObj' ? spyObjOutput(context, match) : { ...EMPTY_OUTPUT, notes: [leftAloneNote(context, match.index, name)] };
}

/**
 * `jasmine.createSpy('load')` → `vi.fn()`. The name goes: Vitest reports the variable, not a label
 * the spy carries. `createSpy(name, original)` keeps the original, which is the one argument that
 * still means something.
 */
function createSpyText(args: readonly string[]): string {
  const [, original] = args;

  return original === undefined ? 'vi.fn()' : `vi.fn(${original})`;
}

/** `jasmine.createSpyObj(base, [...])` → `createSpyObj(base, [...])`, from wherever the installed package exports it. */
function spyObjOutput(context: TransformContext, match: Match): TransformOutput {
  const entry = context.entries === undefined ? undefined : entryFor(context.entries, 'createSpyObj', context.preferredEntry);

  if (entry === undefined) {
    return { ...EMPTY_OUTPUT, notes: [missingEntryNote(context, match.index, 'createSpyObj')] };
  }

  return {
    ...replacement(match.index, match.index + match.whole.length, 'createSpyObj'),
    needs: [{ specifier: entry, name: 'createSpyObj', typeOnly: false }],
  };
}

const CLOCK_CALL = /^\s*\(\s*\)\s*\.\s*([$A-Z_a-z][\w$]*)\s*\(/;

/** `jasmine.clock().tick(n)` → `vi.advanceTimersByTime(n)`, and the three others. */
function clockOutput(context: TransformContext, match: Match, after: number): TransformOutput {
  const tail = CLOCK_CALL.exec(context.masked.slice(after));

  if (tail === null) {
    return { ...EMPTY_OUTPUT, notes: [leftAloneNote(context, match.index, 'clock')] };
  }

  const member = group(tail, 1);
  const target = CLOCK_MEMBERS[member];

  if (target === undefined) {
    return { ...EMPTY_OUTPUT, notes: [leftAloneNote(context, match.index, `clock().${member}`)] };
  }

  return replacement(match.index, after + group(tail, 0).length, `vi.${target}(`);
}

function leftAloneNote(context: TransformContext, index: number, name: string): Finding {
  return jasmineNote(
    context,
    NO_TWIN[name] === undefined ? 'unknown-jasmine-member' : 'no-jasmine-twin',
    index,
    `\`jasmine.${name}\` was left alone.`,
    NO_TWIN[name] ?? 'No twin of that name is known to this codemod; check the Vitest API and rewrite it by hand.',
  );
}

const VITEST = 'vitest';

/**
 * `jasmine.Spy` → `Mock`, `jasmine.SpyObj<T>` → `Spy<T>`.
 *
 * Separate from the value members because the two names go to two different packages, and because
 * `--skip jasmine-types` is a thing somebody wants: a suite whose `SpyObj<T>` annotations are load
 * bearing may want them rewritten in a pass of their own.
 */
export const jasmineTypes: TransformSpec = {
  id: 'jasmine-types',
  family: 'jasmine',
  summary: 'jasmine.Spy → Mock from vitest, and jasmine.SpyObj<T> → Spy<T> from this package.',
  residue: /\bjasmine\s*\.\s*Spy(?:Obj)?\b/,
  run: (context) =>
    mergeOutputs(
      scan(context.masked, MEMBER).flatMap((match) => {
        const target = TYPE_TARGETS[group(match.groups, 1)];

        return target === undefined ? [] : [typeOutput(context, match, target)];
      }),
    ),
};

function typeOutput(context: TransformContext, match: Match, target: string): TransformOutput {
  const rewritten = replacement(match.index, match.index + match.whole.length, target);

  if (target === 'Mock') {
    return { ...rewritten, needs: [{ specifier: VITEST, name: 'Mock', typeOnly: true }] };
  }

  const entry = context.entries === undefined ? undefined : entryFor(context.entries, target, context.preferredEntry);

  if (entry === undefined) {
    return { ...EMPTY_OUTPUT, notes: [missingEntryNote(context, match.index, target)] };
  }

  return { ...rewritten, needs: [{ specifier: entry, name: target, typeOnly: true }] };
}

const BOOLEAN_MATCHER = /\.\s*toBe(True|False)\s*\(\s*\)/g;
const FAIL = /(^|[^\w$.])fail\s*\(/g;
const EXPECT = /\bexpect\s*\(/g;
const WITH_CONTEXT = /^\s*\.\s*withContext\s*\(/;

/**
 * The matchers jasmine has and Vitest spells differently, plus `withContext`.
 *
 * `expect(x).withContext(m).toBe(y)` → `expect(x, m).toBe(y)`: Vitest's second `expect` argument is
 * the message, so the context moves into the call rather than staying a link in the chain.
 */
export const jasmineMatchers: TransformSpec = {
  id: 'jasmine-matchers',
  family: 'jasmine',
  summary: 'toBeTrue / toBeFalse / toHaveSize / toHaveBeenCalledOnceWith / withContext / fail → their Vitest spellings.',
  residue: new RegExp(
    String.raw`\.\s*(?:toBeTrue|toBeFalse|withContext|${Object.keys(MATCHER_RENAMES).join('|')})\s*\(|(?:^|[^\w$.])fail\s*\(`,
  ),
  run: (context) =>
    mergeOutputs([
      replacements(context, BOOLEAN_MATCHER, (match) => `.toBe(${group(match.groups, 1).toLowerCase()})`),
      // One pattern per rename rather than one alternation and a lookup, for the reason
      // `jasmine-aliases` gives: the table drives the regexes, so there is no "the name matched but
      // the table did not have it" branch left with no input that can reach it.
      ...Object.entries(MATCHER_RENAMES).map(([from, to]) =>
        replacements(context, new RegExp(String.raw`\.\s*${from}\s*\(`, 'g'), () => `.${to}(`),
      ),
      replacements(context, FAIL, (match) => `${group(match.groups, 1)}expect.fail(`),
      { ...EMPTY_OUTPUT, edits: scan(context.masked, EXPECT).flatMap((match) => withContextEdits(context, match)) },
    ]),
};

function withContextEdits(context: TransformContext, match: Match): Edit[] {
  const close = matchBracket(context.masked, match.index + match.whole.length - 1);
  const tail = close === undefined ? null : WITH_CONTEXT.exec(context.masked.slice(close));

  if (close === undefined || tail === null) {
    return [];
  }

  const open = close + group(tail, 0).length - 1;
  const end = matchBracket(context.masked, open);

  return end === undefined ? [] : [{ start: close - 1, end, text: `, ${context.source.slice(open + 1, end - 1).trim()})` }];
}
