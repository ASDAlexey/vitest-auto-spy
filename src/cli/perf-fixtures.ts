/**
 * The builders every perf spec assembles its reports from, in one place. They used to be copied
 * file by file and quietly disagreed — the same `file()` with two `testCount` defaults describes
 * two different runs — so the defaults now live exactly here and nowhere else. Specs whose runs
 * need a different shape say so at the call site instead of growing a second builder.
 */
import { join } from 'node:path';

import type { CliIo } from './main';
import type { PerfFile, PerfRun } from './perf-data';
import { createTempRepo } from './temp-repo';

const CLEAN_SPEC = `import { expect, it } from 'vitest';\nimport { add } from './add';\n\nit('adds', () => {\n  expect(add(1, 2)).toBe(3);\n});\n`;

const CLEAN_SOURCE = `export function add(a: number, b: number): number {\n  return a + b;\n}\n`;

export const file = (path: string, over: Partial<PerfFile> = {}): PerfFile => ({
  file: path,
  environment: 0,
  prepare: 0,
  setup: 0,
  imports: 0,
  tests: 0,
  testCount: 1,
  cases: [],
  ...over,
});

export const run = (over: Partial<PerfRun> = {}): PerfRun => ({
  version: 2,
  root: '/repo',
  transform: 0,
  wall: 0,
  failed: 0,
  files: [],
  ...over,
});

export interface Recorder extends CliIo {
  readonly stdout: string[];
  readonly stderr: string[];
}

export function recorder(): Recorder {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return { stdout, stderr, out: (line) => stdout.push(line), err: (line) => stderr.push(line) };
}

/** Nine ordinary files of forty 2.5 ms tests, so a median in their company is a median of something. */
export const ordinary = (root: string): PerfFile[] =>
  Array.from({ length: 9 }, (_unused, index) => file(join(root, `src/ordinary-${index}.spec.ts`), { tests: 100, testCount: 40 }));

/** A repository whose specs are all provably DOM-free, plus whatever a test adds on top. */
export function cleanRepo(specCount: number, over: Readonly<Record<string, string>> = {}): string {
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ devDependencies: { vitest: '^4' } }),
    'src/add.ts': CLEAN_SOURCE,
  };

  for (let index = 0; index < specCount; index += 1) {
    files[`src/case-${index}.spec.ts`] = CLEAN_SPEC;
  }

  return createTempRepo({ ...files, ...over });
}
