/**
 * The Vitest reporter behind `vitest-auto-spy perf`, shipped as `dist/perf-reporter.js`.
 *
 * It reads the per-file phase timings through `TestModule.diagnostic()` — Vitest's own public
 * accessor for them — and writes one JSON file. The shapes below are structural rather than
 * `import type … from 'vitest/node'` on purpose: the Vitest that loads this file is the consumer's,
 * and a type-level dependency on ours would be a compile-time claim about a version we do not ship.
 */
import { writeTextFile } from './fs-scan';
import type { PerfFile, PerfRun } from './perf-data';
import { PERF_FORMAT_VERSION, PERF_OUTPUT_ENV } from './perf-data';

export interface PerfDiagnostic {
  readonly environmentSetupDuration: number;
  readonly prepareDuration: number;
  readonly collectDuration: number;
  readonly setupDuration: number;
  readonly duration: number;
}

export interface PerfTestModule {
  readonly moduleId: string;
  diagnostic(): PerfDiagnostic;
}

export interface PerfVitest {
  readonly config: { readonly root: string };
  readonly state: { readonly transformTime: number };
}

function toPerfFile(module: PerfTestModule): PerfFile {
  const diagnostic = module.diagnostic();

  return {
    file: module.moduleId,
    environment: diagnostic.environmentSetupDuration,
    prepare: diagnostic.prepareDuration,
    setup: diagnostic.setupDuration,
    imports: diagnostic.collectDuration,
    tests: diagnostic.duration,
  };
}

export default class PerfReporter {
  #vitest: PerfVitest | undefined;

  #start = Date.now();

  onInit(vitest: PerfVitest): void {
    this.#vitest = vitest;
    this.#start = Date.now();
  }

  onTestRunEnd(modules: readonly PerfTestModule[]): void {
    const target = process.env[PERF_OUTPUT_ENV];

    if (target === undefined || target === '') {
      throw new Error(`${PERF_OUTPUT_ENV} is not set, so the vitest-auto-spy perf reporter has nowhere to write its report.`);
    }

    writeTextFile(target, JSON.stringify(this.report(modules), undefined, 2));
  }

  /** Exposed so the report can be asserted without a run; the reporter itself only writes it. */
  report(modules: readonly PerfTestModule[]): PerfRun {
    return {
      version: PERF_FORMAT_VERSION,
      root: this.#vitest?.config.root ?? '',
      transform: this.#vitest?.state.transformTime ?? 0,
      wall: Date.now() - this.#start,
      files: modules.map(toPerfFile),
    };
  }
}
