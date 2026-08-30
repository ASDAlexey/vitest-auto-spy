/**
 * `codemod` — the command, its file selection, and its report.
 *
 * Read-only by default, for the reason the rest of this CLI is read-only: trust before edit rights.
 * A run with no flags prints the diff it *would* apply and writes nothing, so the first thing a
 * repository sees from this tool is a proposal it can reject. `--write` is the opt-in, and even
 * then every span the codemod could not decide is left exactly as it was and named in the report —
 * the failure to avoid is not a crash, it is a silent wrong rewrite that still compiles.
 */
import { join } from 'node:path';

import { readTextFile, writeTextFile } from '../fs-scan';
import type { CliIo } from '../main';
import { readProfile } from '../profile';
import type { Finding } from '../report';
import { formatFindings, summarize } from '../report';
import { ownPackageRoot } from '../self';
import type { FileResult } from './codemod';
import { TRANSFORMS, residueOf, runTransforms, selectTransforms } from './codemod';
import { unifiedDiff } from './diff';
import type { EntryMap } from './entry-map';
import { buildEntryMap, findPackageRoot } from './entry-map';
import type { TransformSpec } from './transform-context';

export interface CodemodOptions {
  readonly write: boolean;
  readonly verify: boolean;
  readonly list: boolean;
  readonly only: string | undefined;
  readonly skip: string | undefined;
  /** Repository-relative paths to restrict the run to. Empty means every spec file. */
  readonly paths: readonly string[];
}

const SPEC_FILE = /\.(?:spec|test)\.[cm]?tsx?$/;
const SOURCE_FILE = /(?<!\.d)\.[cm]?tsx?$/;

/**
 * With no path, every spec file; with a path, every TypeScript file under it. The narrow default is
 * on purpose — `jest.` in a `main.ts` is not a test to migrate, and a codemod that offers to edit
 * application code on its first run does not get a second one.
 */
export function selectFiles(files: readonly string[], paths: readonly string[]): string[] {
  const sources = files.filter((file) => SOURCE_FILE.test(file));

  if (paths.length === 0) {
    return sources.filter((file) => SPEC_FILE.test(file));
  }

  const wanted = paths.map((path) => path.replace(/^\.\//, '').replace(/\/+$/, ''));

  return sources.filter((file) => wanted.some((path) => file === path || file.startsWith(`${path}/`)));
}

/** `--list`: the transforms, marked for what this run would skip, and the generated table. */
export function listing(entries: EntryMap | undefined, selected: readonly TransformSpec[]): string {
  const rows = TRANSFORMS.map((transform) => {
    const mark = selected.includes(transform) ? ' ' : '-';

    return `  ${mark} ${transform.id.padEnd(26)}${transform.summary}`;
  });
  const table =
    entries === undefined
      ? ['  (no installed vitest-auto-spy found — the two import transforms will decline to run)']
      : [...entries.byName]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, specifiers]) => `  ${name.padEnd(30)}${specifiers.join(', ')}`);

  return ['Transforms', ...rows, '', `Entry-point table (${entries?.source ?? 'unavailable'})`, ...table].join('\n');
}

function fired(result: FileResult): string[] {
  return [...result.fired]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, count]) => `  ${id.padEnd(26)}${count} edit${count === 1 ? '' : 's'}`);
}

function reportFile(result: FileResult, io: CliIo): void {
  io.out(`\n${result.file}`);

  for (const line of fired(result)) {
    io.out(line);
  }

  for (const line of result.importLines) {
    io.out(`    ${line.replace(/\n/g, '\n    ')}`);
  }

  const diff = unifiedDiff(result.file, result.before, result.after);

  if (diff !== '') {
    io.out(`\n${diff}`);
  }
}

/**
 * The files that could be read, as `[path, text]`. A file the scan listed and something removed
 * before this line is skipped rather than treated as an empty one, which would report every
 * transform as "nothing left to do" for it.
 */
export function readAll(cwd: string, files: readonly string[]): [string, string][] {
  return files.flatMap((file): [string, string][] => {
    const text = readTextFile(join(cwd, file));

    return text === undefined ? [] : [[file, text]];
  });
}

function verifyCommand(cwd: string, files: readonly string[], selected: readonly TransformSpec[], io: CliIo): number {
  const findings = readAll(cwd, files).flatMap(([file, text]) => residueOf(file, text, selected));

  io.out(`${files.length} files matched against ${selected.length} transform patterns.\n`);

  if (findings.length === 0) {
    io.out('Nothing left to migrate.');

    return 0;
  }

  io.out(formatFindings(findings));
  io.out(`\n${summarize(findings)}`);

  return 1;
}

interface RunTotals {
  readonly results: readonly FileResult[];
  readonly findings: readonly Finding[];
}

function transformAll(
  cwd: string,
  files: readonly string[],
  options: CodemodOptions,
  selected: readonly TransformSpec[],
  profileEntry: string,
): RunTotals {
  const entries = buildEntryMap(findPackageRoot(cwd, ownPackageRoot()));
  const results = readAll(cwd, files).flatMap(([file, source]) =>
    selected.some((transform) => transform.residue.test(source))
      ? [runTransforms({ file, source, entries, preferredEntry: profileEntry, selected })]
      : [],
  );
  const touched = results.filter((result) => result.before !== result.after || result.notes.length > 0 || result.residue.length > 0);

  if (options.write) {
    for (const result of touched) {
      writeTextFile(join(cwd, result.file), result.after);
    }
  }

  return { results: touched, findings: touched.flatMap((result) => [...result.notes, ...result.residue]) };
}

function summary(totals: RunTotals, write: boolean): string {
  const changed = totals.results.filter((result) => result.before !== result.after);
  const edits = changed.reduce((sum, result) => sum + [...result.fired.values()].reduce((inner, count) => inner + count, 0), 0);
  const verb = write ? 'written' : 'would change';

  return `${changed.length} file${changed.length === 1 ? '' : 's'} ${verb}, ${edits} edit${edits === 1 ? '' : 's'}`;
}

/** The command. Returns the exit code; every byte of output goes through `io`. */
export function runCodemod(cwd: string, options: CodemodOptions, io: CliIo): number {
  const selected = selectTransforms(options.only, options.skip);

  if (typeof selected === 'string') {
    io.err(selected);

    return 2;
  }

  const profile = readProfile(cwd);
  const files = selectFiles(profile.files, options.paths);

  io.out(`vitest-auto-spy codemod — ${cwd}`);

  if (options.list) {
    io.out(listing(buildEntryMap(findPackageRoot(cwd, ownPackageRoot())), selected));

    return 0;
  }

  if (options.verify) {
    return verifyCommand(cwd, files, selected, io);
  }

  return report(transformAll(cwd, files, options, selected, profile.entry), options, io);
}

function report(totals: RunTotals, options: CodemodOptions, io: CliIo): number {
  io.out(options.write ? 'Writing files.\n' : 'Dry run — nothing is written. Re-run with --write to apply.\n');

  for (const result of totals.results) {
    reportFile(result, io);
  }

  io.out(`\n${summary(totals, options.write)}`);

  if (totals.findings.length === 0) {
    return 0;
  }

  io.out(`\n${formatFindings(totals.findings)}`);
  io.out(`\n${summarize(totals.findings)}`);

  // Every note this command produces is a warning or an error — it only writes one when a span was
  // left alone — so a non-empty report is always something a person still has to do.
  return 1;
}
