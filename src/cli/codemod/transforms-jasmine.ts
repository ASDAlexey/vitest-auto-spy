/**
 * The three rewrites that decide whether a migrated jasmine suite still means what it meant.
 *
 * `.and` is one namespace holding two unrelated things (see `jasmine-api.ts`), so it is split
 * across two transforms rather than one pattern with a lookup: the helper strip and the strategy
 * map have different residues, and `--skip` has to be able to drop one without the other.
 *
 * `spyOn` is the dangerous one, and it is dangerous in a way no compiler catches. jasmine's `spyOn`
 * installs a **stub** — the real method does not run — while `vi.spyOn` **calls through** by
 * default. A bare rename is green, silent, and inverts the behaviour of every spec that relied on
 * the original not running. So the rewrite installs the no-op jasmine installed for free, and skips
 * it only where the expression already chains a strategy that replaces the implementation anyway.
 */
import type { Finding } from '../report';
import type { Edit, TransformOutput } from './edits';
import { EMPTY_OUTPUT, mergeOutputs } from './edits';
import { AND_HELPERS, NATIVE_STRATEGIES, STRATEGY_RENAMES } from './jasmine-api';
import { callArguments, callRange, jasmineNote, replacement, replacements } from './jasmine-calls';
import type { Range } from './mask';
import type { Match, TransformContext, TransformSpec } from './transform-context';
import { group, scan } from './transform-context';

const HELPERS = AND_HELPERS.join('|');
const HELPER_NAMES = new Set(AND_HELPERS);
const AND_HELPER = new RegExp(String.raw`\.\s*and\s*\.\s*(${HELPERS})\b`, 'g');

/**
 * `spy.load.and.nextWith(v)` → `spy.load.nextWith(v)`.
 *
 * The whole `.and` namespace exists upstream because that is where jasmine keeps spy strategies;
 * this package puts the helpers on the method itself, so the namespace is the only thing that goes.
 */
export const jasmineAndHelpers: TransformSpec = {
  id: 'jasmine-and-helpers',
  family: 'jasmine',
  summary: 'spy.load.and.nextWith(v) → spy.load.nextWith(v): the auto-spies helpers drop the .and namespace.',
  residue: new RegExp(String.raw`\.\s*and\s*\.\s*(?:${HELPERS})\b`),
  run: (context) => replacements(context, AND_HELPER, (match) => `.${group(match.groups, 1)}`),
};

const AND_STRATEGY = /\.\s*and\s*\.\s*([$A-Z_a-z][\w$]*)\s*\(/g;
const WITH_ARGS = /\.\s*withArgs\s*\(/g;

/**
 * jasmine's own `.and` strategies, and the argument matcher that leads into them.
 *
 * `.and.returnValues(a, b)` is why the arguments are read rather than carried: Vitest has no
 * n-valued twin, and the honest equivalent is a chain of `mockReturnValueOnce`. `.and.throwError`
 * is the other one — jasmine accepts a message *or* an error, and only the message form needs an
 * `Error` built around it.
 */
export const jasmineStrategies: TransformSpec = {
  id: 'jasmine-strategies',
  family: 'jasmine',
  summary: '.and.returnValue / callFake / throwError / returnValues / stub / resolveTo → the mock* twin, and .withArgs → .calledWith.',
  residue: new RegExp(String.raw`\.\s*and\s*\.\s*(?:${NATIVE_STRATEGIES.join('|')})\b|\.\s*withArgs\s*\(`),
  run: (context) => mergeOutputs([withArgsOutput(context), strategyOutputs(context)]),
};

/**
 * `.withArgs(…)` is `calledWith` on an auto-spy and nothing at all on `vi.spyOn`, which has no such
 * method — the rewritten line threw `calledWith is not a function` on the first run. On a chain
 * rooted in `spyOn(…)` it is therefore reported rather than renamed.
 */
function withArgsOutput(context: TransformContext): TransformOutput {
  const closes = spyOnCloses(context);

  return mergeOutputs(
    scan(context.masked, WITH_ARGS).map((match) =>
      closes.has(lastCodeBefore(context.masked, match.index))
        ? { ...EMPTY_OUTPUT, notes: [withArgsOnSpyOnNote(context, match.index)] }
        : replacement(match.index, match.index + match.whole.length, '.calledWith('),
    ),
  );
}

function withArgsOnSpyOnNote(context: TransformContext, index: number): Finding {
  return jasmineNote(
    context,
    'jasmine-with-args-on-spy-on',
    index,
    '`.withArgs(…)` on a `spyOn(…)` was left exactly as it was.',
    '`vi.spyOn` has no `calledWith`. Branch on the arguments inside one `mockImplementation`, or replace the whole double with `createSpyFromClass` / `createAutoMock`, whose methods do have `calledWith`.',
  );
}

/** Index just past the last code character before `index`. */
function lastCodeBefore(masked: string, index: number): number {
  let cursor = index;

  while (cursor > 0 && /\s/.test(masked.charAt(cursor - 1))) {
    cursor -= 1;
  }

  return cursor;
}

function strategyOutputs(context: TransformContext): TransformOutput {
  return mergeOutputs(
    scan(context.masked, AND_STRATEGY).flatMap((match) => {
      const name = group(match.groups, 1);

      return HELPER_NAMES.has(name) ? [] : [strategyOutput(context, match, name)];
    }),
  );
}

function strategyOutput(context: TransformContext, match: Match, name: string): TransformOutput {
  const rename = STRATEGY_RENAMES[name];

  if (rename !== undefined) {
    return replacement(match.index, match.index + match.whole.length, `.${rename}(`);
  }

  if (name === 'callThrough') {
    return { ...EMPTY_OUTPUT, notes: [callThroughNote(context, match.index)] };
  }

  const range = callRange(context, match.index + match.whole.length - 1);

  return range === undefined ? EMPTY_OUTPUT : rewrittenStrategy(context, match, name, range);
}

function rewrittenStrategy(context: TransformContext, match: Match, name: string, range: Range): TransformOutput {
  const text = strategyText(name, callArguments(context, range));

  if (text === undefined) {
    return { ...EMPTY_OUTPUT, notes: [unknownStrategyNote(context, match.index, name)] };
  }

  return replacement(match.index, range[1], text);
}

/** The three strategies whose arguments have to be read to be rewritten. */
function strategyText(name: string, args: readonly string[]): string | undefined {
  if (name === 'stub') {
    return '.mockImplementation(() => undefined)';
  }

  if (name === 'returnValues' && args.length > 0) {
    return args.map((value) => `.mockReturnValueOnce(${value})`).join('');
  }

  return name === 'throwError' ? throwText(args) : undefined;
}

/**
 * `throwError('boom')` throws an `Error` built from the message; `throwError(err)` throws the value;
 * `throwError(Klass, 'boom')` builds the class. Anything else is not a form jasmine documents, and
 * inventing one here would put a `throw` in the suite that nobody wrote.
 *
 * A variable is the case the literal rule gets wrong: jasmine wraps *any* string it is handed, so
 * `throwError(message)` with a string in `message` threw an `Error` there and threw the bare string
 * here — and `toThrow(Error)` then failed on a spec nobody had changed.
 */
function throwText(args: readonly string[]): string | undefined {
  const [first, second] = args;

  if (first === undefined || args.length > 2) {
    return undefined;
  }

  if (second !== undefined) {
    return `.mockImplementation(() => { throw new ${first}(${second}); })`;
  }

  if (/^["'`]/.test(first)) {
    return `.mockImplementation(() => { throw new Error(${first}); })`;
  }

  return PLAIN_PATH.test(first)
    ? `.mockImplementation(() => { throw typeof ${first} === 'string' ? new Error(${first}) : ${first}; })`
    : undefined;
}

/** An expression safe to name twice: no call, no index, nothing that can run. */
const PLAIN_PATH = /^[$A-Z_a-z][\w$]*(?:\s*\.\s*[$A-Z_a-z][\w$]*)*$/;

function callThroughNote(context: TransformContext, index: number): Finding {
  return jasmineNote(
    context,
    'jasmine-call-through',
    index,
    '`.and.callThrough()` was left exactly as it was.',
    'On an auto-spy there is no original to call through to, so there is nothing to rewrite it into. On a `spyOn` of a real object, delete the call — `vi.spyOn` already calls through.',
  );
}

function unknownStrategyNote(context: TransformContext, index: number, name: string): Finding {
  return jasmineNote(
    context,
    'unknown-jasmine-strategy',
    index,
    `\`.and.${name}(…)\` was left alone.`,
    'No strategy of that name is known to this codemod, or its arguments are not a form jasmine documents. Rewrite it by hand.',
  );
}

const SPY_ON = /(^|[^\w$.])(spyOn|spyOnProperty)\s*\(/g;

/**
 * A chain that already replaces the implementation, so the stub does not have to be added.
 *
 * `.and.` covers every jasmine strategy — including `callThrough`, which is precisely the case
 * where calling through is what was meant — and `mock…` covers a spec that was half-migrated by
 * hand before this ran.
 */
const CHAINED_STRATEGY = /^\s*\.\s*(?:and\s*\.|mock[A-Z])/;

/**
 * `spyOn(o, 'm')` → `vi.spyOn(o, 'm').mockImplementation(() => undefined)`.
 *
 * The appended no-op is the entire point. jasmine's `spyOn` stubs and Vitest's calls through, so
 * the rename alone is a silent behaviour inversion: the real method starts running inside every
 * spec that installed the spy to stop it. `spyOnProperty(o, 'p', 'get')` is the same call with an
 * accessor kind, and the same default, so it goes the same way.
 */
export const jasmineSpyOn: TransformSpec = {
  id: 'jasmine-spy-on',
  family: 'jasmine',
  summary: "spyOn(o, 'm') → vi.spyOn(o, 'm').mockImplementation(() => undefined) — jasmine stubs where vi.spyOn calls through.",
  residue: /(?:^|[^\w$.])spyOn(?:Property)?\s*\(/,
  run: (context) => ({
    ...EMPTY_OUTPUT,
    edits: scan(context.masked, SPY_ON).flatMap((match) => spyOnEdits(context, match)),
  }),
};

/** Where every `spyOn(…)` / `spyOnProperty(…)` call ends, for the transforms that read its chain. */
function spyOnCloses(context: TransformContext): Set<number> {
  return new Set(
    scan(context.masked, SPY_ON).flatMap((match) => {
      const range = spyOnRange(context, match);

      return range === undefined ? [] : [range[1]];
    }),
  );
}

function spyOnRange(context: TransformContext, match: Match): Range | undefined {
  const start = match.index + group(match.groups, 1).length;

  return callRange(context, start + group(match.groups, 2).length);
}

const CHAINED_WITH_ARGS = /^\s*\.\s*withArgs\s*\(/;

function spyOnEdits(context: TransformContext, match: Match): Edit[] {
  const name = group(match.groups, 2);
  const start = match.index + group(match.groups, 1).length;
  const range = spyOnRange(context, match);

  // A `.withArgs(…)` chain has no Vitest shape at all — `jasmine-strategies` reports it — so the
  // call it hangs off is left as written rather than half-rewritten around a chain that cannot run.
  if (range === undefined || CHAINED_WITH_ARGS.test(context.masked.slice(range[1]))) {
    return [];
  }

  const rename: Edit = { start, end: start + name.length, text: 'vi.spyOn' };
  const accessor = accessorEdits(context, name, range);

  if (CHAINED_STRATEGY.test(context.masked.slice(range[1]))) {
    return [rename, ...accessor];
  }

  return [rename, ...accessor, { start: range[1], end: range[1], text: '.mockImplementation(() => undefined)' }];
}

/**
 * jasmine's `spyOnProperty(o, 'p')` defaults to the getter; `vi.spyOn(o, 'p')` with no third
 * argument spies on a *method* and throws "can only spy on a function" the moment it runs.
 */
function accessorEdits(context: TransformContext, name: string, range: Range): Edit[] {
  if (name !== 'spyOnProperty' || callArguments(context, range).length !== 2) {
    return [];
  }

  return [{ start: range[1] - 1, end: range[1] - 1, text: ", 'get'" }];
}
