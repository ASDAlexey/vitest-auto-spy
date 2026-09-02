/**
 * The argument every transform takes, and the small helpers all of them share.
 *
 * A transform is a pure function from this to a {@link TransformOutput}: no disk, no ordering
 * assumptions, no edits applied. That is what makes `--skip` honest — dropping one transform cannot
 * change what another one sees — and what lets every one of them be tested on a string.
 */
import type { TransformOutput } from './edits';
import type { EntryMap } from './entry-map';
import type { Range } from './mask';
import { trimmed } from './mask';

export interface TransformContext {
  /** Repository-relative path, used only to address a note. */
  readonly file: string;
  readonly source: string;
  /** The code-only view of `source`. Passed in so one mask serves every transform. */
  readonly masked: string;
  /** The generated entry-point table, or `undefined` when no installed copy was found. */
  readonly entries: EntryMap | undefined;
  /** The entry this repository would import from, from the same detection `init` uses. */
  readonly preferredEntry: string;
}

/**
 * Which dialect a transform is about, and therefore which `--from` runs it.
 *
 * `shared` is not "both halves of the migration" — it is the transforms whose input exists in a
 * jasmine suite and a Jest suite alike: the legacy auto-spies import, the `Spy<T>` cast, `xit`, and
 * `mockImplementation()` with no argument. They run whatever `--from` says, because narrowing them
 * would mean a `--from jasmine` run leaving `xit` behind.
 */
export type TransformFamily = 'jasmine' | 'jest' | 'shared';

export interface TransformSpec {
  /** The id `--only` and `--skip` name, and the id the report prints. */
  readonly id: string;
  /** Which `--from` selects it — see {@link TransformFamily}. */
  readonly family: TransformFamily;
  /** One line, for `--help` and `--list`. */
  readonly summary: string;
  /**
   * What the transform is supposed to have removed. `--verify` matches this against the *result*
   * rather than diffing the change — the check `migrating.md` argues for, because a codemod whose
   * diff looks right can still leave the pattern it was pointed at.
   */
  readonly residue: RegExp;
  readonly run: (context: TransformContext) => TransformOutput;
}

/** The source text of a range, with the whitespace the mask says is whitespace trimmed off. */
export function textOf(context: TransformContext, range: Range): string {
  const [start, end] = trimmed(context.masked, range);

  return context.source.slice(start, end);
}

export interface Match {
  readonly index: number;
  readonly whole: string;
  /** Group 0 is the whole match, as `RegExp.exec` returns it. */
  readonly groups: readonly (string | undefined)[];
}

/**
 * A capture group, as a string.
 *
 * `slice().join('')` rather than `?? ''` for the same reason `fs-scan.captures` uses `replace`
 * rather than `matchAll`: under `noUncheckedIndexedAccess` a group that cannot be absent still
 * types as optional, and the guard for it is a branch no input can ever take — which is a hole in
 * a suite that is meant to be at 100%.
 */
export function group(groups: readonly (string | undefined)[], position: number): string {
  return groups.slice(position, position + 1).join('');
}

/** Every match of a global pattern against the mask. */
export function scan(masked: string, pattern: RegExp): Match[] {
  return [...masked.matchAll(pattern)].map((match) => ({ index: match.index, whole: group(match, 0), groups: [...match] }));
}
