#!/usr/bin/env node
// Write one `vitest bench` run to a JSON file, in the shape this repository's scripts read.
//
// Vitest 5 removed `--outputJson`. Benchmark results now leave the runner only through a reporter:
// `bench.compare()` records a `TestBenchmark` on the test case, and `TestCase.benchmarks()` is where
// a reporter picks it up. This is that reporter, selected with `--reporter` and told where to write
// by `BENCH_OUTPUT_JSON` (reporters take no arguments on the command line).
//
// The row it writes keeps the field names Vitest 4's flag produced — `p75`, `median`, `rme`,
// `sampleCount`, `hz` — so `bench-report.mjs`, `bench-check.mjs`, `bench-self.mjs` and
// `bench-angular/run.mjs` read one shape, and so the results files CI has already uploaded stay
// readable. The statistics themselves come from tinybench's `latency` / `throughput` objects, which
// each row also carries verbatim: the mapping below is the only place that translates between them.

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { cwd, env } from 'node:process';

const require = createRequire(import.meta.url);

const DEFAULT_OUTPUT = 'bench-results.json';

/**
 * One arm of one case.
 *
 * `latency` is in milliseconds and `throughput` in operations per second, exactly as the Vitest 4
 * flat fields were, so nothing downstream has to change its units.
 */
function toRow(task) {
  const { latency, throughput } = task;

  return {
    name: task.name,
    rank: task.rank,
    hz: throughput.mean,
    min: latency.min,
    max: latency.max,
    mean: latency.mean,
    median: latency.p50,
    p75: latency.p75,
    p99: latency.p99,
    p995: latency.p995,
    p999: latency.p999,
    rme: latency.rme,
    sampleCount: latency.samplesCount,
    totalTime: task.totalTime,
    period: task.period,
    sd: latency.sd,
    moe: latency.moe,
    variance: latency.variance,
    latency,
    throughput,
  };
}

// `tinybench` publishes no `./package.json` export, so the manifest is found from the resolved
// entry point rather than required by subpath.
function version(name) {
  try {
    return require(`${name}/package.json`).version;
  } catch {
    // Ignored: fall through to the manifest beside the resolved entry point.
  }

  try {
    let directory = dirname(require.resolve(name));

    for (let depth = 0; depth < 5; depth += 1) {
      try {
        return require(`${directory}/package.json`).version;
      } catch {
        directory = dirname(directory);
      }
    }
  } catch {
    // Ignored: the package is not installed, which is worth recording as such.
  }

  return 'unknown';
}

export default class BenchJsonReporter {
  onTestRunEnd(testModules) {
    const files = [];

    for (const module of testModules) {
      const groups = [];

      for (const test of module.children.allTests()) {
        for (const benchmark of test.benchmarks()) {
          groups.push({ fullName: benchmark.name, benchmarks: benchmark.tasks.map(toRow) });
        }
      }

      if (groups.length > 0) {
        files.push({ filepath: module.moduleId, groups });
      }
    }

    const output = resolve(cwd(), env['BENCH_OUTPUT_JSON'] ?? DEFAULT_OUTPUT);

    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(
      output,
      `${JSON.stringify(
        {
          harness: {
            reporter: 'scripts/bench-json-reporter.mjs',
            statistic: 'latency.p75',
            vitest: version('vitest'),
            tinybench: version('tinybench'),
            generated: new Date().toISOString(),
          },
          files,
        },
        undefined,
        2,
      )}\n`,
    );
  }
}
