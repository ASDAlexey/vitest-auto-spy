/**
 * The Vitest reporter behind `vitest-auto-spy perf`, shipped as `dist/perf-reporter.js`.
 *
 * It reads the per-file phase timings through `TestModule.diagnostic()` — Vitest's own public
 * accessor for them — and writes one JSON file. The shapes below are structural rather than
 * `import type … from 'vitest/node'` on purpose: the Vitest that loads this file is the consumer's,
 * and a type-level dependency on ours would be a compile-time claim about a version we do not ship.
 *
 * The same reasoning is why every member it reads past `moduleId` and `diagnostic()` is optional
 * and guarded. A runner that exposes no test collection still produces a report — one without the
 * per-test rows the gate judges, which is a smaller report rather than a crash inside somebody's
 * suite.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeTextFile } from './fs-scan';
import type { PerfCase, PerfFile, PerfImport, PerfRun } from './perf-data';
import { CASES_PER_FILE, CASE_FLOOR_MS, PERF_FORMAT_VERSION, PERF_OUTPUT_ENV, PERF_PROFILE_ENV } from './perf-data';

/** Vitest keeps the slowest modules of the whole worker; this many leaves room for the spec's own imports among them. */
const IMPORT_LIMIT = 200;

export interface PerfDiagnostic {
  readonly environmentSetupDuration: number;
  readonly prepareDuration: number;
  readonly collectDuration: number;
  readonly setupDuration: number;
  readonly duration: number;
  /** Bytes, and only under `logHeapUsage`. */
  readonly heap?: number | undefined;
  /** Vitest 4.1+, and empty unless `experimental.importDurations` collects anything. */
  readonly importDurations?: Readonly<Record<string, PerfImportDuration>>;
}

export interface PerfImportDuration {
  readonly totalTime: number;
  readonly importer?: string | undefined;
}

/** What a finished test body reports. `undefined` from `diagnostic()` means it never ran. */
export interface PerfTestDiagnostic {
  readonly duration?: number;
  /** Passed only on a retry. */
  readonly flaky?: boolean;
}

export interface PerfTestCase {
  readonly fullName?: string;
  readonly name?: string;
  diagnostic?(): PerfTestDiagnostic | undefined;
}

export interface PerfTestCollection {
  allTests?(): Iterable<PerfTestCase>;
}

export interface PerfTestModule {
  readonly moduleId: string;
  diagnostic(): PerfDiagnostic;
  readonly children?: PerfTestCollection;
  /** Vitest's own "did everything in this file pass". Absent on a runner that does not expose it. */
  ok?(): boolean;
}

/** A project whose `setupFiles` the profiler is added to. The array is Vitest's own, read when a worker starts. */
export interface PerfProject {
  readonly config: {
    readonly setupFiles: string[];
    readonly experimental?: { readonly importDurations?: { limit?: number } };
  };
}

export interface PerfVitest {
  readonly config: { readonly root: string };
  readonly state: { readonly transformTime: number };
  readonly projects?: readonly PerfProject[];
}

function profiling(): boolean {
  const dir = process.env[PERF_PROFILE_ENV];

  return dir !== undefined && dir !== '';
}

interface Bodies {
  readonly count: number;
  readonly cases: readonly PerfCase[];
  readonly flaky: readonly string[];
}

/**
 * The test bodies of one file: how many finished, and the slowest few by name.
 *
 * A test with no diagnostic did not run — collected and skipped, or the file died during collection
 * — and is not counted. That is what makes `testCount` the honest answer to "did this measure
 * anything", which the whole `measuredNothing` guard rests on.
 */
function bodiesOf(module: PerfTestModule, floorMs: number): Bodies {
  const tests = module.children?.allTests?.();

  if (tests === undefined) {
    return { count: 0, cases: [], flaky: [] };
  }

  const cases: PerfCase[] = [];
  const flaky = new Set<string>();
  let count = 0;

  for (const test of tests) {
    const diagnostic = test.diagnostic?.();
    const duration = diagnostic?.duration;

    if (duration === undefined) {
      continue;
    }

    const name = test.fullName ?? test.name ?? '(unnamed test)';

    count += 1;

    if (duration >= floorMs) {
      cases.push({ name, ms: duration });
    }

    if (diagnostic?.flaky === true) {
      flaky.add(name);
    }
  }

  return { count, cases: slowestByName(cases), flaky: [...flaky].sort() };
}

/**
 * The slowest bodies, one per name.
 *
 * A name is not unique in Vitest and is not unusual to repeat: `it.each([...])('renders', …)` with
 * no placeholder in the title gives every case the same `fullName`, and so does a copied title.
 * Anything downstream that finds a body by name then finds the first of them, so a report carrying
 * several would report one problem N times and attach the wrong second measurement to N−1 of them.
 * Collapsing here costs a genuinely slow twin — which shares a name with a slow body and therefore
 * shares its verdict anyway.
 */
function slowestByName(cases: readonly PerfCase[]): PerfCase[] {
  const slowest = new Map<string, PerfCase>();

  for (const entry of cases) {
    const seen = slowest.get(entry.name);

    if (seen === undefined || entry.ms > seen.ms) {
      slowest.set(entry.name, entry);
    }
  }

  return [...slowest.values()].sort((a, b) => b.ms - a.ms || a.name.localeCompare(b.name)).slice(0, CASES_PER_FILE);
}

/** The spec's own imports, heaviest first. A module another file imported first was paid for there. */
function slowestImports(module: PerfTestModule, durations: Readonly<Record<string, PerfImportDuration>> | undefined): PerfImport[] {
  return Object.entries(durations ?? {})
    .filter(([, duration]) => duration.importer === module.moduleId)
    .map(([path, duration]) => ({ module: path, ms: duration.totalTime }))
    .sort((a, b) => b.ms - a.ms || a.module.localeCompare(b.module))
    .slice(0, CASES_PER_FILE);
}

function toPerfFile(module: PerfTestModule): PerfFile {
  const diagnostic = module.diagnostic();
  // A profiled pass is a few suspect files, and the reader wants their slowest bodies whatever they cost.
  const bodies = bodiesOf(module, profiling() ? 0 : CASE_FLOOR_MS);
  const imports = slowestImports(module, diagnostic.importDurations);

  return {
    file: module.moduleId,
    environment: diagnostic.environmentSetupDuration,
    prepare: diagnostic.prepareDuration,
    setup: diagnostic.setupDuration,
    imports: diagnostic.collectDuration,
    tests: diagnostic.duration,
    testCount: bodies.count,
    cases: bodies.cases,
    ...(bodies.flaky.length === 0 ? {} : { flaky: bodies.flaky }),
    ...(diagnostic.heap === undefined ? {} : { heap: diagnostic.heap }),
    ...(imports.length === 0 ? {} : { slowImports: imports }),
  };
}

export default class PerfReporter {
  #vitest: PerfVitest | undefined;

  #start = Date.now();

  onInit(vitest: PerfVitest): void {
    this.#vitest = vitest;
    this.#start = Date.now();

    if (profiling()) {
      const profiler = join(dirname(fileURLToPath(import.meta.url)), 'perf-profiler.js');

      for (const project of vitest.projects ?? []) {
        project.config.setupFiles.push(profiler);

        const importDurations = project.config.experimental?.importDurations;

        if (importDurations !== undefined && (importDurations.limit ?? 0) < IMPORT_LIMIT) {
          importDurations.limit = IMPORT_LIMIT;
        }
      }
    }
  }

  /**
   * Writes the report, or does nothing at all.
   *
   * Nothing at all is the important half: a repository whose runner configuration cannot be
   * rewritten per run — an Angular builder that owns its `reporters`, a config generated by a
   * script — declares this reporter permanently and pays nothing on the runs that are not
   * measuring anything. `perf` is what notices a missing report, and it says exactly why.
   */
  onTestRunEnd(modules: readonly PerfTestModule[]): void {
    const target = process.env[PERF_OUTPUT_ENV];

    if (target === undefined || target === '') {
      return;
    }

    writeTextFile(target, JSON.stringify(this.report(modules), undefined, 2));
  }

  /** Exposed so the report can be asserted without a run; the reporter itself only writes it. */
  report(modules: readonly PerfTestModule[]): PerfRun {
    return {
      version: PERF_FORMAT_VERSION,
      root: this.#vitest?.config.root ?? '',
      transform: this.#vitest?.state.transformTime ?? 0,
      failed: modules.filter((module) => module.ok?.() === false).length,
      wall: Date.now() - this.#start,
      files: modules.map(toPerfFile),
    };
  }
}
