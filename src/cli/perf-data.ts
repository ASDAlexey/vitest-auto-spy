/**
 * The JSON `perf` reads, and the six phases it is summed into.
 *
 * Vitest prints these numbers once, on the summary line — `Duration 8.91s (transform 26.20s, setup
 * 14.70s, import 55.27s, tests 27.24s, environment 155.65s)` — as ANSI-coloured, locale-dependent
 * prose. The same values live on every file task, which is where the shipped reporter reads them
 * from; nothing here parses terminal output.
 */
import { parseJsonc } from './fs-scan';
import { isRecord } from './profile';

/** Names the file the shipped reporter writes. A path cannot be passed to a reporter on the CLI. */
export const PERF_OUTPUT_ENV = 'VITEST_AUTO_SPY_PERF_OUT';

/** The page every message from this command points at. Deep links are anchors on it. */
export const PERF_DOCS = 'https://asdalexey.github.io/vitest-auto-spy/core/performance';

export const PERF_FORMAT_VERSION = 1;

export interface PerfFile {
  /** Absolute module id, exactly as Vitest reported it. */
  readonly file: string;
  readonly environment: number;
  readonly prepare: number;
  readonly setup: number;
  readonly imports: number;
  readonly tests: number;
}

export interface PerfRun {
  readonly version: number;
  /** Vitest's project root, so a reader can relativise `file` even from another directory. */
  readonly root: string;
  /** Transform time for the whole run: Vitest tracks it per run, not per file. */
  readonly transform: number;
  /** Wall clock of the run. The phase sums are CPU time across workers and exceed it. */
  readonly wall: number;
  readonly files: readonly PerfFile[];
}

export type PhaseName = 'environment' | 'import' | 'prepare' | 'setup' | 'tests' | 'transform';

export interface Phase {
  readonly name: PhaseName;
  readonly ms: number;
  /** Fraction of the summed phase time, 0–1. */
  readonly share: number;
}

/** The five phases Vitest measures per file. `transform` is the sixth and is a whole-run number. */
type FileKey = 'environment' | 'imports' | 'prepare' | 'setup' | 'tests';

const FILE_PHASES: readonly (readonly [PhaseName, FileKey])[] = [
  ['environment', 'environment'],
  ['import', 'imports'],
  ['tests', 'tests'],
  ['setup', 'setup'],
  ['prepare', 'prepare'],
];

function numberAt(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseFile(value: unknown): PerfFile | undefined {
  if (!isRecord(value) || typeof value['file'] !== 'string') {
    return undefined;
  }

  return {
    file: value['file'],
    environment: numberAt(value, 'environment') ?? 0,
    prepare: numberAt(value, 'prepare') ?? 0,
    setup: numberAt(value, 'setup') ?? 0,
    imports: numberAt(value, 'imports') ?? 0,
    tests: numberAt(value, 'tests') ?? 0,
  };
}

/**
 * A perf report, or `undefined` when the text is not one. Validated field by field rather than
 * trusted: `--json` points at a file somebody else wrote, possibly with a different version.
 */
export function parsePerfRun(text: string): PerfRun | undefined {
  const parsed = parseJsonc(text);

  if (!isRecord(parsed) || numberAt(parsed, 'version') !== PERF_FORMAT_VERSION || !Array.isArray(parsed['files'])) {
    return undefined;
  }

  const files: PerfFile[] = [];

  for (const entry of parsed['files']) {
    const file = parseFile(entry);

    if (file !== undefined) {
      files.push(file);
    }
  }

  return {
    version: PERF_FORMAT_VERSION,
    root: typeof parsed['root'] === 'string' ? parsed['root'] : '',
    transform: numberAt(parsed, 'transform') ?? 0,
    wall: numberAt(parsed, 'wall') ?? 0,
    files,
  };
}

function sumOf(run: PerfRun, key: FileKey): number {
  return run.files.reduce((total, file) => total + file[key], 0);
}

/** The six phases, largest share first. A phase with no time is kept — its absence is information. */
export function phasesOf(run: PerfRun): Phase[] {
  const raw: readonly (readonly [PhaseName, number])[] = [
    ...FILE_PHASES.map(([name, key]): readonly [PhaseName, number] => [name, sumOf(run, key)]),
    ['transform', run.transform],
  ];
  const total = raw.reduce((sum, [, ms]) => sum + ms, 0);

  return raw
    .map(([name, ms]) => ({ name, ms, share: total === 0 ? 0 : ms / total }))
    .sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name));
}

export function totalOf(phases: readonly Phase[]): number {
  return phases.reduce((sum, phase) => sum + phase.ms, 0);
}

export function shareOf(phases: readonly Phase[], name: PhaseName): number {
  return phases.find((phase) => phase.name === name)?.share ?? 0;
}

/** Milliseconds the way Vitest prints them, so the two reports can be read side by side. */
export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

export function formatShare(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}
