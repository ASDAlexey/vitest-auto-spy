/**
 * Several perf reports read back as the one report a suite would have written had it not been
 * sharded.
 *
 * CI splits a suite of this size by file: three or four jobs each run a quarter of it and each one
 * writes a report of its own. Every judgement `perf` makes about a file weighs it against the rest
 * of the run it is in — the median file, the share of the total — so a quarter of the files is a
 * quarter of the evidence, and the slowest file of 430 reads nothing like the same file among 1723.
 * A merged report is also the only thing left that can answer "where does the whole suite's time
 * go" once the suite is sharded.
 *
 * **Which numbers add, and which do not.** `transform` is a whole-run number per report and is
 * summed. `wall` is **not**: it is the largest of them. The shards ran at the same time on
 * different machines, so the suite took as long as its slowest job, not as long as all of them end
 * to end. A summed wall clock would tell a reader their suite takes four times what it takes, and
 * every conclusion drawn from that number — worker counts, whether a phase is worth an afternoon —
 * would be wrong by the same factor. `version` is the minimum, because a merged report is only as
 * rich as its poorest input: one version 1 shard among four leaves the whole merge without the
 * per-test data the gate judges.
 *
 * **One root, and the files moved onto it.** GitLab clones each job separately, so the same tree
 * arrives at a different absolute path in every shard. The merged `root` is the first non-empty one
 * and every file measured under another report's root is rewritten onto it, prefix for prefix. That
 * is not cosmetic: `measuredFiles` relativises each file against the working directory and drops
 * anything outside it, so a report carrying four build directories would keep the files of one
 * shard and silently throw away three. Rewriting is also what lets the same file measured twice be
 * recognised as the same file. Nothing else about a file is touched, and a file that does not sit
 * under its own report's root is kept exactly as measured — the merge does not invent a location
 * for anything.
 *
 * **The same file in two reports** means somebody merged overlapping selections. The slower of the
 * two measurements wins, by summed phase time, and ties keep the one read first; the path and the
 * reports that carried it go into `duplicates` so the caller can say it out loud. The field-by-field
 * maximum is deliberately not taken — it would be a file nobody measured.
 *
 * Nothing here throws. A path that does not exist, a file that is not JSON, a pattern matching
 * nothing and an empty list all come back as a result the caller can print.
 */
import { isAbsolute, join } from 'node:path';

import { isDirectory, listRepositoryFiles, readTextFile, toPosix } from './fs-scan';
import type { PerfFile, PerfRun } from './perf-data';
import { PERF_FORMAT_VERSION, formatMs, parsePerfRun } from './perf-data';

export interface MergeInput {
  readonly path: string;
  readonly run: PerfRun;
}

export interface MergeResult {
  readonly run: PerfRun;
  /** Files that appeared in more than one report, with the reports that carried them. */
  readonly duplicates: readonly string[];
  /** Reports that contributed no file at all. */
  readonly empty: readonly string[];
}

/** Summed phase time of one file — what "the slower measurement" means when two reports disagree. */
function fileTotal(file: PerfFile): number {
  return file.environment + file.prepare + file.setup + file.imports + file.tests;
}

/** Trailing separators off, so a report rooted at `/repo/` and one at `/repo` share a root. */
function trimRoot(root: string): string {
  return root.replace(/[/\\]+$/, '');
}

function reroot(path: string, from: string, to: string): string {
  if (from === '' || from === to || !path.startsWith(from)) {
    return path;
  }

  const rest = path.slice(from.length);

  return rest.startsWith('/') || rest.startsWith('\\') ? `${to}${rest}` : path;
}

/** Merges several reports into the one report they would have been if the suite had not been sharded. */
export function mergeRuns(inputs: readonly MergeInput[]): MergeResult {
  const root = trimRoot(inputs.find((input) => input.run.root !== '')?.run.root ?? '');
  const kept = new Map<string, PerfFile>();
  const carriedBy = new Map<string, string[]>();
  const empty: string[] = [];
  let transform = 0;
  let wall = 0;
  let version = PERF_FORMAT_VERSION;
  let failed = 0;

  for (const input of inputs) {
    const from = trimRoot(input.run.root);

    transform += input.run.transform;
    wall = Math.max(wall, input.run.wall);
    failed += input.run.failed;
    version = Math.min(version, input.run.version);

    if (input.run.files.length === 0) {
      empty.push(input.path);
    }

    for (const file of input.run.files) {
      const path = reroot(file.file, from, root);
      const moved: PerfFile = path === file.file ? file : { ...file, file: path };
      const previous = kept.get(path);

      carriedBy.set(path, [...(carriedBy.get(path) ?? []), input.path]);

      if (previous === undefined || fileTotal(moved) > fileTotal(previous)) {
        kept.set(path, moved);
      }
    }
  }

  return {
    // A shard that went red makes the whole merged run red: the gate must refuse it, and one
    // green shard is not evidence that the other three passed.
    run: { version, root, transform, wall, failed, files: [...kept.values()].sort((a, b) => a.file.localeCompare(b.file)) },
    duplicates: duplicatesOf(carriedBy),
    empty: empty.sort(),
  };
}

function duplicatesOf(carriedBy: ReadonlyMap<string, readonly string[]>): string[] {
  return [...carriedBy]
    .filter(([, paths]) => paths.length > 1)
    .map(([path, paths]) => `${path} (${paths.join(', ')})`)
    .sort();
}

/**
 * Reads every path, keeping the ones that parse; `failed` names the ones that did not.
 *
 * A path repeated in the list is read once. Two `--json` values can expand onto the same report —
 * a directory and a pattern inside it — and counting that report twice would double its transform
 * time and report every file in it as a duplicate of itself.
 */
export function readRuns(paths: readonly string[]): { readonly inputs: MergeInput[]; readonly failed: string[] } {
  const inputs: MergeInput[] = [];
  const failed: string[] = [];
  const seen = new Set<string>();

  for (const path of paths) {
    if (seen.has(path)) {
      continue;
    }

    seen.add(path);

    const text = readTextFile(path);
    const run = text === undefined ? undefined : parsePerfRun(text);

    if (run === undefined) {
      failed.push(path);

      continue;
    }

    inputs.push({ path, run });
  }

  return { inputs, failed };
}

/** A `*` in one path segment, as a matcher over a single file name. `*` never crosses a `/`. */
function segmentMatcher(pattern: string): (name: string) => boolean {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[$()+.?[\\\]^{|}]/g, '\\$&'))
    .join('[^/]*');
  const matches = new RegExp(`^${source}$`);

  return (name) => matches.test(name);
}

/**
 * File names under `directory` matching a one-segment pattern, as absolute paths.
 *
 * The listing is the repository scan, which skips dependency and build-output directories
 * (`node_modules`, `dist`, `coverage`, `tmp`, …) **below** its starting point but never the
 * starting point itself. So `coverage/*.json` and `coverage/**\/perf-*.json` both work, while
 * `**\/perf-*.json` from the repository root will not see a report inside `dist/`. Point the base
 * at the directory the reports are actually in.
 */
function matchesIn(directory: string, pattern: string, recursive: boolean): string[] {
  const matches = segmentMatcher(pattern);

  return listRepositoryFiles(directory)
    .filter((relative) => (recursive || !relative.includes('/')) && matches(relative.slice(relative.lastIndexOf('/') + 1)))
    .map((relative) => join(directory, relative));
}

/**
 * Expands one `--json` value into paths: a file as itself, a directory as the `*.json` files
 * directly in it, and a `*` pattern against the file system.
 *
 * The supported pattern syntax is two shapes and nothing else — `<dir>/<pattern>` for the files
 * directly in a directory (`coverage/*.json`) and `<dir>/**\/<pattern>` for the files anywhere
 * under it (`coverage/**\/perf-*.json`), where `<pattern>` is one segment in which `*` matches
 * anything but a `/`. There is no globbing dependency here to lean on and this package ships none,
 * so `a/*\/b/*.json`, `**\/**\/x.json` and a bare `<dir>/**` are not supported: such a value is
 * taken literally and comes back as itself, which fails to read and is then named by the caller
 * rather than quietly matching nothing.
 */
export function resolveReportPaths(value: string, cwd: string): string[] {
  const path = isAbsolute(value) ? value : join(cwd, value);

  if (!value.includes('*')) {
    return isDirectory(path) ? matchesIn(path, '*.json', false) : [path];
  }

  const segments = toPosix(path).split('/');
  const wildcardAt = segments.findIndex((segment) => segment.includes('*'));
  const tail = segments.slice(wildcardAt);
  const recursive = tail[0] === '**';
  const pattern = recursive ? tail[1] : tail[0];

  if (pattern === undefined || pattern.includes('**') || tail.length > (recursive ? 2 : 1)) {
    return [path];
  }

  return matchesIn(segments.slice(0, wildcardAt).join('/'), pattern, recursive);
}

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

/** One line for the report header: how many reports were merged and what came of them. */
export function describeMerge(result: MergeResult, inputCount: number): string {
  if (inputCount === 0) {
    return 'No perf report was read, so there is nothing to merge.';
  }

  const parts = [
    `Merged ${count(inputCount, 'report')} into ${count(result.run.files.length, 'file')}: transform ${formatMs(result.run.transform)} summed, wall ${formatMs(result.run.wall)} (the longest report, not the sum).`,
  ];

  if (result.duplicates.length > 0) {
    parts.push(`${count(result.duplicates.length, 'file')} appeared in more than one report and kept the slower measurement.`);
  }

  if (result.empty.length > 0) {
    parts.push(`${count(result.empty.length, 'report')} carried no file at all: ${result.empty.join(', ')}.`);
  }

  return parts.join(' ');
}
