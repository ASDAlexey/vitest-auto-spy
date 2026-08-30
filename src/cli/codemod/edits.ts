/**
 * What a transform hands back, and the only place a source string is actually changed.
 *
 * A transform never rewrites text itself. It returns three things — the spans it wants replaced,
 * the imports the replacement needs, and the notes for what it refused to touch — and the runner
 * applies them together. That is what lets `--skip` drop one transform without the others having
 * already edited around it, and what keeps two transforms from producing overlapping edits nobody
 * notices until the file no longer parses.
 */
import type { Finding, Severity } from '../report';

export interface Edit {
  /** Start index in the source, inclusive. */
  readonly start: number;
  /** End index in the source, exclusive. */
  readonly end: number;
  readonly text: string;
}

/** A named import a rewrite made necessary: `asSpy` from the root entry, `Mock` from `vitest`. */
export interface ImportNeed {
  readonly specifier: string;
  readonly name: string;
  readonly typeOnly: boolean;
}

export interface TransformOutput {
  readonly edits: readonly Edit[];
  readonly needs: readonly ImportNeed[];
  /** Names to remove from an import when the rewrite left nothing referencing them. */
  readonly dropIfUnused: readonly string[];
  readonly notes: readonly Finding[];
}

export const EMPTY_OUTPUT: TransformOutput = { edits: [], needs: [], dropIfUnused: [], notes: [] };

/**
 * A note is a {@link Finding}, so the codemod prints through the same formatter `doctor` does and a
 * reader learns one report format instead of two. The location rides in `file` as `path:line`
 * because that is the form an editor turns into a jump.
 */
export function note(input: {
  readonly check: string;
  readonly severity: Severity;
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly fix: string;
}): Finding {
  return {
    check: input.check,
    severity: input.severity,
    file: `${input.file}:${input.line}`,
    message: input.message,
    fix: input.fix,
  };
}

/**
 * Applies the edits back to front, so an index computed against the original stays valid. An edit
 * reaching into a span already rewritten is dropped rather than merged — two transforms disagreeing
 * about one span is a bug in the tool, and dropping the earlier of the two is at least
 * deterministic. So is an inverted edit, which no transform should produce.
 */
export function applyEdits(source: string, edits: readonly Edit[]): string {
  const ordered = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let result = source;
  let barrier = source.length;

  for (const edit of ordered) {
    if (edit.end > barrier || edit.start > edit.end) {
      continue;
    }

    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    barrier = edit.start;
  }

  return result;
}

/** Merges the outputs of several transforms into one. */
export function mergeOutputs(outputs: readonly TransformOutput[]): TransformOutput {
  return {
    edits: outputs.flatMap((output) => output.edits),
    needs: outputs.flatMap((output) => output.needs),
    dropIfUnused: outputs.flatMap((output) => output.dropIfUnused),
    notes: outputs.flatMap((output) => output.notes),
  };
}
