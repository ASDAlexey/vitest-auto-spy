/**
 * The worker half of the confirmation pass's CPU profile: one profile per spec file, written where
 * `PERF_PROFILE_ENV` points.
 *
 * It runs inside the test worker because that is the only place the time is. `--cpu-prof` was the
 * obvious alternative and it records nothing here: a pool worker is terminated rather than allowed
 * to exit, and Node writes the profile on exit. The inspector session is the worker's own, so this
 * needs no flag, no port and nothing from the harness — the reporter adds this file to
 * `setupFiles` only for the pass that asked for a profile, and an ordinary run never loads it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { threadId } from 'node:worker_threads';

import { removeFile, writeTextFile } from './fs-scan';
import type { CpuProfile } from './perf-profile';
import { isRecord } from './profile';

/** The subset of `node:inspector`'s `Session` this uses, callback form, so a test can hand in its own. */
export interface InspectorSession {
  connect(): void;
  disconnect(): void;
  post(method: string, params: object, callback: (error: Error | null, result?: object) => void): void;
}

export interface FileHooks {
  beforeAll(fn: () => Promise<void>): void;
  afterAll(fn: () => Promise<void>): void;
}

/** Half a millisecond: fine enough for a body of a few milliseconds, coarse enough to cost ~1 % of the run. */
const SAMPLING_MICROSECONDS = 500;

function send(session: InspectorSession, method: string, params: object = {}): Promise<object | undefined> {
  return new Promise((resolve, reject) => {
    session.post(method, params, (error, result) => (error === null ? resolve(result) : reject(error)));
  });
}

let written = 0;

export function profileEachFile(hooks: FileHooks, session: InspectorSession, dir: string, testPath: () => string | undefined): void {
  hooks.beforeAll(async () => {
    session.connect();
    await send(session, 'Profiler.enable');
    await send(session, 'Profiler.setSamplingInterval', { interval: SAMPLING_MICROSECONDS });
    await send(session, 'Profiler.start');
  });

  hooks.afterAll(async () => {
    const result = await send(session, 'Profiler.stop');

    session.disconnect();
    written += 1;
    writeTextFile(
      join(dir, `${process.pid}-${threadId}-${written}.json`),
      JSON.stringify({ file: testPath() ?? '', profile: isRecord(result) ? result['profile'] : undefined }),
    );
  });
}

function isProfile(value: unknown): value is CpuProfile {
  return isRecord(value) && Array.isArray(value['nodes']) && Array.isArray(value['samples']) && Array.isArray(value['timeDeltas']);
}

/** Every profile the pass left, by the absolute path of its spec file, and the directory emptied behind it. */
export function takeProfiles(dir: string): Map<string, CpuProfile> {
  const found = new Map<string, CpuProfile>();
  let names: string[];

  try {
    names = readdirSync(dir);
  } catch {
    return found;
  }

  for (const name of names) {
    const path = join(dir, name);

    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));

      if (isRecord(parsed) && typeof parsed['file'] === 'string' && parsed['file'] !== '' && isProfile(parsed['profile'])) {
        found.set(parsed['file'], parsed['profile']);
      }
    } catch {
      // A profile cut off by a crashed worker explains nothing; the finding is printed without it.
    }

    removeFile(path);
  }

  return found;
}
