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
import type { PerfCase, PerfConfig, PerfFile, PerfImport, PerfRun } from './perf-data';
import { CASES_PER_FILE, CASE_FLOOR_MS, PERF_FORMAT_VERSION, PERF_OUTPUT_ENV, PERF_PROFILE_ENV } from './perf-data';

/** Vitest keeps the slowest modules of the whole worker; this many leaves room for the spec's own imports among them. */
const IMPORT_LIMIT = 200;

/**
 * What a measured run collects when the config collects nothing: the same top 10 Vitest keeps under
 * `print`. Measured on 208 files, it keeps the heaviest own import of 142 of 162 files that have one,
 * as 200 does, for 2.5 KB a file held by the main process instead of 16 KB; CPU stayed within noise.
 */
const MEASURED_IMPORT_LIMIT = 10;

/** How often a finished file rewrites the partial report: a killed run loses at most this much. */
export const PARTIAL_WRITE_MS = 2_000;

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
  /** Vitest 5+, 1-based; 0 while the file has not run. */
  readonly concurrencyId?: number;
  readonly workerId?: number;
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
  readonly retryCount?: number;
  /** Epoch milliseconds. */
  readonly startTime?: number;
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
  /** The runner's file task — what `experimental_getRunnerTask(testModule)` returns. */
  readonly task?: PerfRunnerFile;
}

/** Vitest 5+ measures the transform wait inside collect and setup on the runner's file task. */
export interface PerfRunnerFile {
  readonly collectFetchDuration?: number;
  readonly setupFetchDuration?: number;
  readonly result?: { readonly startTime?: number };
}

/** The resolved options `perf` advice depends on. Every member is optional: each major moved some of them. */
export interface PerfResolvedConfig {
  readonly isolate?: boolean;
  readonly pool?: string;
  readonly maxWorkers?: number;
  readonly environment?: string;
  /** Vitest 5+; Vitest 4 keeps it under `experimental`. */
  readonly fsModuleCache?: boolean;
  /** Vitest 5+: which of pool, isolate, environment, fsModuleCache, silent the user set explicitly. */
  readonly providedOptions?: Readonly<Record<string, unknown>>;
  readonly coverage?: { readonly enabled?: boolean; readonly provider?: string };
  readonly experimental?: { readonly importDurations?: { limit?: number }; readonly fsModuleCache?: boolean };
}

/** A project whose `setupFiles` the profiler is added to. The array is Vitest's own, read when a worker starts. */
export interface PerfProject {
  readonly config: PerfResolvedConfig & { readonly setupFiles: string[] };
}

export interface PerfVitest {
  readonly version?: string;
  readonly config: PerfResolvedConfig & { readonly root: string };
  readonly state: {
    /** Vitest 4 and older; Vitest 5 has no whole-run transform time. */
    readonly transformTime?: number;
    /** Vitest 5+: summed worker spawn, bundle load and environment setup. */
    readonly startupTime?: number;
    readonly workersSpawned?: number;
  };
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
  readonly retries: number;
  readonly start: number | undefined;
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
    return { count: 0, cases: [], flaky: [], retries: 0, start: undefined };
  }

  const cases: PerfCase[] = [];
  const flaky = new Set<string>();
  let count = 0;
  let retries = 0;
  let start: number | undefined;

  for (const test of tests) {
    const diagnostic = test.diagnostic?.();

    if (diagnostic?.duration === undefined) {
      continue;
    }

    const duration = diagnostic.duration;

    const name = test.fullName ?? test.name ?? '(unnamed test)';

    count += 1;

    if (duration >= floorMs) {
      cases.push({ name, ms: duration });
    }

    if (diagnostic.flaky === true) {
      flaky.add(name);
      retries += diagnostic.retryCount ?? 0;
    }

    if (diagnostic.startTime !== undefined && (start === undefined || diagnostic.startTime < start)) {
      start = diagnostic.startTime;
    }
  }

  return { count, cases: slowestByName(cases), flaky: [...flaky].sort(), retries, start };
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

/** A worker or lane id of 0 means the file never reached a worker, which is no id at all. */
function idOf(value: number | undefined): number | undefined {
  return value === undefined || value === 0 ? undefined : value;
}

function runnerFields(module: PerfTestModule, bodies: Bodies): Partial<PerfFile> {
  const diagnostic = module.diagnostic();
  const workerId = idOf(diagnostic.workerId);
  const lane = idOf(diagnostic.concurrencyId);
  const task = module.task;
  const start = task?.result?.startTime ?? bodies.start;
  const collectFetch = task?.collectFetchDuration;
  const setupFetch = task?.setupFetchDuration;
  const fetch = collectFetch === undefined && setupFetch === undefined ? undefined : (collectFetch ?? 0) + (setupFetch ?? 0);

  return {
    ...(workerId === undefined ? {} : { workerId }),
    ...(lane === undefined ? {} : { lane }),
    ...(start === undefined ? {} : { start }),
    ...(fetch === undefined ? {} : { fetch, setupFetch: setupFetch ?? 0 }),
    ...(bodies.retries === 0 ? {} : { retries: bodies.retries }),
  };
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
    ...runnerFields(module, bodies),
  };
}

/** The resolved options of the first project, which is the root config when there are no projects. */
function configOf(vitest: PerfVitest): PerfConfig {
  const config = vitest.projects?.[0]?.config ?? vitest.config;
  const fsModuleCache = config.fsModuleCache ?? config.experimental?.fsModuleCache;
  const coverage = vitest.config.coverage;
  const provided = config.providedOptions;

  return {
    ...(typeof config.isolate === 'boolean' ? { isolate: config.isolate } : {}),
    ...(typeof config.pool === 'string' ? { pool: config.pool } : {}),
    ...(typeof config.maxWorkers === 'number' ? { maxWorkers: config.maxWorkers } : {}),
    ...(typeof config.environment === 'string' ? { environment: config.environment } : {}),
    ...(typeof fsModuleCache === 'boolean' ? { fsModuleCache } : {}),
    ...(coverage?.enabled === true && typeof coverage.provider === 'string' ? { coverage: coverage.provider } : {}),
    ...(provided === undefined ? {} : { provided: Object.keys(provided).filter((key) => provided[key] === true) }),
  };
}

function startupOf(vitest: PerfVitest): PerfRun['startup'] {
  const { startupTime, workersSpawned } = vitest.state;

  return startupTime === undefined || workersSpawned === undefined ? undefined : { ms: startupTime, workers: workersSpawned };
}

function target(): string | undefined {
  const path = process.env[PERF_OUTPUT_ENV];

  return path === undefined || path === '' ? undefined : path;
}

export default class PerfReporter {
  #vitest: PerfVitest | undefined;

  #start = Date.now();

  readonly #finished = new Map<string, PerfTestModule>();

  #lastWrite = 0;

  #pending: ReturnType<typeof setTimeout> | undefined;

  onInit(vitest: PerfVitest): void {
    this.#vitest = vitest;
    this.#start = Date.now();

    if (target() === undefined && !profiling()) {
      return;
    }

    const profiler = profiling() ? join(dirname(fileURLToPath(import.meta.url)), 'perf-profiler.js') : undefined;
    const limit = profiler === undefined ? MEASURED_IMPORT_LIMIT : IMPORT_LIMIT;

    for (const project of vitest.projects ?? []) {
      if (profiler !== undefined) {
        project.config.setupFiles.push(profiler);
      }

      // Vitest 4.1+ resolves this object. An ordinary run only fills an unset limit; a profiled pass
      // raises any limit below its own.
      const importDurations = project.config.experimental?.importDurations;
      const current = importDurations?.limit ?? 0;

      if (importDurations !== undefined && current < limit && (profiler !== undefined || current === 0)) {
        importDurations.limit = limit;
      }
    }
  }

  /**
   * Rewrites the report as files finish, marked `partial`, so a run killed by CI's timeout or an
   * out-of-memory worker still leaves the files it finished. Throttled: a 12 000-file suite would
   * otherwise serialise the whole report 12 000 times. A file finishing inside the interval is
   * written when it ends, so a run that then hangs on one file still keeps it.
   */
  onTestModuleEnd(module: PerfTestModule): void {
    const path = target();

    if (path === undefined) {
      return;
    }

    this.#finished.set(module.moduleId, module);

    const wait = this.#lastWrite + PARTIAL_WRITE_MS - Date.now();

    if (wait <= 0) {
      this.#writePartial(path);
    } else {
      this.#pending ??= setTimeout(() => this.#writePartial(path), wait);
    }
  }

  #writePartial(path: string): void {
    clearTimeout(this.#pending);
    this.#pending = undefined;
    this.#lastWrite = Date.now();
    writeTextFile(path, JSON.stringify(this.report([...this.#finished.values()], true), undefined, 2));
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
    clearTimeout(this.#pending);

    const path = target();

    if (path === undefined) {
      return;
    }

    writeTextFile(path, JSON.stringify(this.report(modules), undefined, 2));
  }

  /** Exposed so the report can be asserted without a run; the reporter itself only writes it. */
  report(modules: readonly PerfTestModule[], partial = false): PerfRun {
    const vitest = this.#vitest;
    const startup = vitest === undefined ? undefined : startupOf(vitest);

    return {
      version: PERF_FORMAT_VERSION,
      root: vitest?.config.root ?? '',
      transform: vitest?.state.transformTime ?? 0,
      failed: modules.filter((module) => module.ok?.() === false).length,
      wall: Date.now() - this.#start,
      files: modules.map(toPerfFile),
      ...(vitest?.version === undefined ? {} : { vitest: vitest.version }),
      ...(vitest === undefined ? {} : { config: configOf(vitest) }),
      ...(startup === undefined ? {} : { startup }),
      ...(partial ? { partial: true } : {}),
    };
  }
}
