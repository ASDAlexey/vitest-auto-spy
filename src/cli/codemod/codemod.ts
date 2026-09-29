/**
 * The registry, one file's worth of work, and the check that reads the result rather than the diff.
 *
 * Order is deliberate. `auto-spies-import` runs first because it is what creates the
 * `vitest-auto-spy` import `inject-cast` then adds `asSpy` to; everything after that is independent.
 * Nothing is applied until every transform has looked at the same untouched source, so `--skip`
 * removes a transform's edits and nothing else.
 */
import type { Finding } from '../report';
import type { Edit, ImportNeed, TransformOutput } from './edits';
import { applyEdits, note } from './edits';
import type { EntryMap } from './entry-map';
import type { Shadowed } from './imports';
import { boundNames, listImports, planImports } from './imports';
import { lineOf, maskCode, maskComments } from './mask';
import type { Match, TransformContext, TransformFamily, TransformSpec } from './transform-context';
import { scan } from './transform-context';
import { jasmineAndHelpers, jasmineSpyOn, jasmineStrategies } from './transforms-jasmine';
import { jasmineGlobals, jasmineMatchers, jasmineTypes } from './transforms-jasmine-globals';
import { jasmineAliases, jestGlobalsImport, jestNamespace, jestTypes, mockImplementationArity } from './transforms-jest';
import { autoSpiesImport, injectCast } from './transforms-spies';

export const TRANSFORMS: readonly TransformSpec[] = [
  autoSpiesImport,
  injectCast,
  jestGlobalsImport,
  jestNamespace,
  jestTypes,
  jasmineAliases,
  mockImplementationArity,
  jasmineAndHelpers,
  jasmineStrategies,
  jasmineSpyOn,
  jasmineGlobals,
  jasmineTypes,
  jasmineMatchers,
];

export interface FileResult {
  readonly file: string;
  readonly before: string;
  readonly after: string;
  /** Transform id → how many spans it rewrote. The report says which transform fired where. */
  readonly fired: ReadonlyMap<string, number>;
  /** The import statements the run produced, in full — a count would hide a second wrong shape. */
  readonly importLines: readonly string[];
  readonly notes: readonly Finding[];
  readonly residue: readonly Finding[];
}

export interface RunInput {
  readonly file: string;
  readonly source: string;
  readonly entries: EntryMap | undefined;
  readonly preferredEntry: string;
  readonly selected: readonly TransformSpec[];
  /** Whether the Vitest config turns `globals` on; `undefined` when that is not known. */
  readonly globals?: boolean | undefined;
}

const GLOBAL_RESIDUE = new WeakMap<TransformSpec, RegExp>();

/** The transform's residue pattern as a global one, built once per transform rather than per file. */
function globalResidue(transform: TransformSpec): RegExp {
  const cached = GLOBAL_RESIDUE.get(transform);

  if (cached !== undefined) {
    return cached;
  }

  const pattern = new RegExp(transform.residue.source, `${transform.residue.flags.replace('g', '')}g`);

  GLOBAL_RESIDUE.set(transform, pattern);

  return pattern;
}

/**
 * Every place the result still matches what a transform was supposed to remove.
 *
 * This is the check `migrating.md` argues for, applied to a codemod that rewrites imports rather
 * than globs: the diff can look exactly right while the file still says `jest.` — inside a template
 * literal the transforms decline to enter, in a statement whose brackets did not balance, or
 * because the transform was skipped. Matching the *result* is the only form that notices, and it
 * works the same on a file this tool edited and on one somebody edited by hand.
 */
export function residueOf(
  file: string,
  text: string,
  transforms: readonly TransformSpec[],
  said?: ReadonlyMap<string, readonly Finding[]>,
): Finding[] {
  const masked = maskComments(text);

  return transforms.flatMap((transform) =>
    scan(masked, globalResidue(transform))
      .filter((match) => transform.residueIgnores?.(masked, match) !== true)
      .map((match) => residueNote(file, text, match, transform, said?.get(transform.id))),
  );
}

function residueFix(id: string, line: number, file: string, notes: readonly Finding[] | undefined): string {
  if (notes === undefined) {
    return `\`${id}\` did not rewrite this. Rewrite it by hand.`;
  }

  const declined = notes.find((entry) => entry.file === `${file}:${line}`);

  return declined === undefined
    ? `\`${id}\` could not reach this, usually because it sits in a template literal or after an unbalanced bracket. Rewrite it by hand.`
    : `\`${id}\` declined it: ${declined.message} Rewrite it by hand.`;
}

function residueNote(file: string, text: string, match: Match, transform: TransformSpec, notes: readonly Finding[] | undefined): Finding {
  const line = lineOf(text, match.index);

  return note({
    check: `residue/${transform.id}`,
    severity: 'error',
    file,
    line,
    message: `Still matches after the run: ${JSON.stringify(match.whole.trim())}`,
    fix: residueFix(transform.id, line, file, notes),
  });
}

interface OwnedEdit extends Edit {
  readonly owner: string;
}

interface Owned {
  readonly id: string;
  readonly output: TransformOutput;
}

interface Outputs {
  readonly outputs: Owned[];
  readonly edits: OwnedEdit[];
  readonly said: Map<string, readonly Finding[]>;
}

function outputsFor(context: TransformContext, selected: readonly TransformSpec[]): Outputs {
  const outputs: Owned[] = [];
  const edits: OwnedEdit[] = [];
  const said = new Map<string, readonly Finding[]>();

  for (const transform of selected) {
    const output = transform.run(context);

    outputs.push({ id: transform.id, output });
    said.set(transform.id, output.notes);
    edits.push(...output.edits.map((edit) => ({ ...edit, owner: transform.id })));
  }

  return { outputs, edits, said };
}

function firedCounts(edits: readonly OwnedEdit[], dropped: ReadonlySet<OwnedEdit>): Map<string, number> {
  const fired = new Map<string, number>();

  for (const edit of edits) {
    if (!dropped.has(edit)) {
      fired.set(edit.owner, (fired.get(edit.owner) ?? 0) + 1);
    }
  }

  return fired;
}

function overlapNote(file: string, source: string, edit: OwnedEdit): Finding {
  return note({
    check: 'overlapping-edit',
    severity: 'warning',
    file,
    line: lineOf(source, edit.start),
    message: `\`${edit.owner}\` wanted to rewrite ${JSON.stringify(source.slice(edit.start, edit.end).trim())}, but another edit had already rewritten part of that span, so this one was not applied.`,
    fix: 'Check the line by hand: the other rewrite is in the diff, this one is not.',
  });
}

function shadowedNote(file: string, source: string, { need, at }: Shadowed): Finding {
  return note({
    check: 'name-declared-locally',
    severity: 'warning',
    file,
    line: lineOf(source, at),
    message: `The rewrite needs \`${need.name}\` from '${need.specifier}', but this file declares a \`${need.name}\` of its own, so no import was added.`,
    fix: `Rename the local \`${need.name}\` and import the one from '${need.specifier}' — until then the rewritten code calls whichever is in scope.`,
  });
}

/**
 * The needs of a transform that lost an edit, cut to the names the result still mentions: an
 * import whose only user was the dropped edit would be one nobody reads.
 */
function liveNeeds(outputs: readonly Owned[], dropped: readonly OwnedEdit[], text: string): ImportNeed[] {
  const losers = new Set(dropped.map((edit) => edit.owner));
  const code = losers.size === 0 ? '' : maskCode(text);

  return outputs.flatMap(({ id, output }) =>
    losers.has(id)
      ? output.needs.filter((need) => new RegExp(`(?<![\\w$.])${need.name.replace(/\$/g, '\\$')}(?![\\w$])`).test(code))
      : output.needs,
  );
}

const BARE_VI = /(?<![\w$.])vi\s*\./;

/**
 * Jest's `jest` is a global in every Jest suite; Vitest's `vi` is one only under `globals: true`.
 * A rename to `vi.` with globals off is a `ReferenceError` on the first line that runs it.
 */
function viWithoutGlobals(file: string, text: string, globals: boolean | undefined): Finding[] {
  if (globals !== false) {
    return [];
  }

  const masked = maskCode(text);
  const use = BARE_VI.exec(masked);
  const bound = listImports(text, masked).some(
    (statement) => statement.braces !== undefined && boundNames(text, statement.braces, masked).includes('vi'),
  );

  if (use === null || bound) {
    return [];
  }

  return [
    note({
      check: 'vi-without-globals',
      severity: 'warning',
      file,
      line: lineOf(text, use.index),
      message:
        'This file uses `vi` without importing it, and the Vitest config does not turn `globals` on — it fails with `ReferenceError: vi is not defined`.',
      fix: "Add `import { vi } from 'vitest'` (and `describe`, `it`, `expect`, which are not globals either), or set `test.globals: true` in the Vitest config.",
    }),
  ];
}

/** One file, start to finish: transform, apply, fix the import block, then read the result back. */
export function runTransforms(input: RunInput): FileResult {
  const context: TransformContext = {
    file: input.file,
    source: input.source,
    masked: maskCode(input.source),
    entries: input.entries,
    preferredEntry: input.preferredEntry,
  };
  const { outputs, edits, said } = outputsFor(context, input.selected);
  const applied = applyEdits(input.source, edits);
  const dropped = new Set(applied.dropped);
  const plan = planImports(
    applied.text,
    liveNeeds(outputs, applied.dropped, applied.text),
    outputs.flatMap(({ output }) => output.dropIfUnused),
  );
  const after = plan.text;

  return {
    file: input.file,
    before: input.source,
    after,
    fired: firedCounts(edits, dropped),
    importLines: input.source === after ? [] : relevantImports(after),
    notes: [
      ...outputs.flatMap(({ output }) => output.notes),
      ...applied.dropped.map((edit) => overlapNote(input.file, input.source, edit)),
      ...plan.shadowed.map((shadowed) => shadowedNote(input.file, applied.text, shadowed)),
      ...viWithoutGlobals(input.file, after, input.globals),
    ],
    residue: residueOf(input.file, after, input.selected, said),
  };
}

const RELEVANT = /^(?:@jest\/globals|j(?:asmine|est)-auto-spies|vitest)|^@bugsplat\/vitest-auto-spies|^vitest-auto-spy/;

/**
 * The resulting imports, in full rather than as a count. `migrating.md` makes the argument on the
 * repair that produced two different wrong shapes and reported "fixed: 152" for both.
 */
function relevantImports(text: string): string[] {
  return listImports(text)
    .filter((statement) => RELEVANT.test(statement.specifier))
    .map((statement) => text.slice(statement.start, statement.end));
}

/** `--only` / `--skip`, resolved against the registry. An unknown id is an error, not a no-op. */
export function selectTransforms(only: string | undefined, skip: string | undefined): TransformSpec[] | string {
  const names = [...split(only), ...split(skip)];
  const unknown = names.filter((name) => !TRANSFORMS.some((transform) => transform.id === name));

  if (unknown.length > 0) {
    return `Unknown transform: ${unknown.join(', ')}. Known ids: ${TRANSFORMS.map((transform) => transform.id).join(', ')}.`;
  }

  const wanted = split(only);
  const unwanted = split(skip);

  return TRANSFORMS.filter((transform) => (wanted.length === 0 || wanted.includes(transform.id)) && !unwanted.includes(transform.id));
}

/** Which dialect a run migrates from. `auto` decides it per file. */
export type FromMode = 'auto' | 'jasmine' | 'jest';

/** What `--from` accepts. `jasmine` is the alias, because nobody types the package name twice. */
const FROM_VALUES: Readonly<Record<string, FromMode>> = {
  auto: 'auto',
  jasmine: 'jasmine',
  'jasmine-auto-spies': 'jasmine',
  'jest-auto-spies': 'jest',
};

export const FROM_ACCEPTED = 'auto, jasmine-auto-spies (alias: jasmine), jest-auto-spies';

/**
 * `--from`, resolved. `undefined` means the value is not one of {@link FROM_ACCEPTED}, and the
 * caller prints that rather than falling back — a misspelled dialect that silently ran the other
 * one is a migration that looks finished and is not.
 *
 * It answers `FromMode | undefined` rather than `FromMode | string` because `FromMode` *is* a union
 * of strings: the two would collapse into `string` and the error branch would stop being a type.
 */
export function resolveFrom(value: string | undefined): FromMode | undefined {
  return value === undefined ? 'auto' : FROM_VALUES[value];
}

/**
 * What makes a file jasmine's, under `--from auto`.
 *
 * Read against the residue view, so an import specifier is visible and an ordinary string is not.
 * Three markers, and each of them is a thing only a jasmine suite has: the legacy import, the
 * compatibility entry that replaces it, and the `jasmine` global itself — plus `.and.`, which is
 * the namespace both jasmine's strategies and `jasmine-auto-spies`' helpers live behind and which
 * has no meaning at all on a Jest double.
 *
 * A bare `spyOn(` is deliberately **not** a marker. It is the one construct both dialects spell the
 * same way and give opposite defaults to, so guessing which one a file meant is exactly the silent
 * behaviour inversion `jasmine-spy-on` exists to avoid. A suite that has nothing but `spyOn` needs
 * `--from jasmine` said out loud.
 */
const JASMINE_MARKER = /\bjasmine\s*\.|\.\s*and\s*\.|from\s*["'](?:jasmine-auto-spies|vitest-auto-spy\/jasmine)["']/;

/** The transforms `--from` leaves in play for one file. */
export function transformsFor(mode: FromMode, selected: readonly TransformSpec[], source: string): TransformSpec[] {
  if (mode === 'auto') {
    return JASMINE_MARKER.test(maskComments(source)) ? [...selected] : without(selected, 'jasmine');
  }

  return without(selected, mode === 'jasmine' ? 'jest' : 'jasmine');
}

function without(selected: readonly TransformSpec[], family: TransformFamily): TransformSpec[] {
  return selected.filter((transform) => transform.family !== family);
}

function split(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
