/**
 * The registry, one file's worth of work, and the check that reads the result rather than the diff.
 *
 * Order is deliberate. `auto-spies-import` runs first because it is what creates the
 * `vitest-auto-spy` import `inject-cast` then adds `asSpy` to; everything after that is independent.
 * Nothing is applied until every transform has looked at the same untouched source, so `--skip`
 * removes a transform's edits and nothing else.
 */
import type { Finding } from '../report';
import type { TransformOutput } from './edits';
import { applyEdits, mergeOutputs, note } from './edits';
import type { EntryMap } from './entry-map';
import { applyImportPlan, listImports } from './imports';
import { lineOf, maskCode, maskComments } from './mask';
import type { Match, TransformContext, TransformSpec } from './transform-context';
import { scan } from './transform-context';
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
export function residueOf(file: string, text: string, transforms: readonly TransformSpec[]): Finding[] {
  const masked = maskComments(text);

  return transforms.flatMap((transform) =>
    scan(masked, new RegExp(transform.residue.source, `${transform.residue.flags.replace('g', '')}g`)).map((match) =>
      residueNote(file, text, match, transform),
    ),
  );
}

function residueNote(file: string, text: string, match: Match, transform: TransformSpec): Finding {
  return note({
    check: `residue/${transform.id}`,
    severity: 'error',
    file,
    line: lineOf(text, match.index),
    message: `Still matches after the run: ${JSON.stringify(match.whole.trim())}`,
    fix: `\`${transform.id}\` did not rewrite it — it declined (see its note), or it could not reach it: a template literal, an unbalanced bracket, a transform that was skipped. Rewrite this one by hand.`,
  });
}

function outputsFor(context: TransformContext, selected: readonly TransformSpec[]): [TransformOutput[], Map<string, number>] {
  const outputs: TransformOutput[] = [];
  const fired = new Map<string, number>();

  for (const transform of selected) {
    const output = transform.run(context);

    outputs.push(output);

    if (output.edits.length > 0) {
      fired.set(transform.id, output.edits.length);
    }
  }

  return [outputs, fired];
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
  const [outputs, fired] = outputsFor(context, input.selected);
  const merged = mergeOutputs(outputs);
  const after = applyImportPlan(applyEdits(input.source, merged.edits), merged.needs, merged.dropIfUnused);

  return {
    file: input.file,
    before: input.source,
    after,
    fired,
    importLines: input.source === after ? [] : relevantImports(after),
    notes: merged.notes,
    residue: residueOf(input.file, after, input.selected),
  };
}

const RELEVANT = /^(?:@jest\/globals|jest-auto-spies|vitest)|^@bugsplat\/vitest-auto-spies|^vitest-auto-spy/;

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

function split(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
