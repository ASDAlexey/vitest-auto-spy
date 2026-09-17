/**
 * `dist/perf-profiler.js`: the setup file the perf reporter adds for a confirmation pass. Wiring
 * only — the logic is `cli/perf-profiler.ts`, where it can be tested without a worker.
 */
import { Session } from 'node:inspector';
import { afterAll, beforeAll, expect } from 'vitest';

import { PERF_PROFILE_ENV } from './cli/perf-data';
import { profileEachFile } from './cli/perf-profiler';

const dir = process.env[PERF_PROFILE_ENV];

if (dir !== undefined && dir !== '') {
  profileEachFile(
    { beforeAll: (fn) => beforeAll(fn), afterAll: (fn) => afterAll(fn) },
    new Session(),
    dir,
    () => expect.getState().testPath,
  );
}
