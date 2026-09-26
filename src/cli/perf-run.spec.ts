/**
 * The flags a bare run adds by the installed Vitest's major. Vitest rejects an option it does not
 * know, so a flag of a newer major must never reach an older one.
 */
import { afterEach, describe, expect, it } from 'vitest';

import type { SpawnRequest } from './perf-run';
import { readPerfRun } from './perf-run';
import { readProfile } from './profile';
import { createTempRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  removeTempRepos();
});

function argsWith(manifest: string | undefined): readonly string[] {
  const root = createTempRepo({
    'package.json': '{}',
    'vitest.config.ts': 'export default {};\n',
    'node_modules/vitest/vitest.mjs': '',
    'dist/perf-reporter.js': '',
    ...(manifest === undefined ? {} : { 'node_modules/vitest/package.json': manifest }),
  });
  let seen: SpawnRequest | undefined;

  readPerfRun(
    { cwd: root, profile: readProfile(root), json: undefined, out: undefined, command: undefined, paths: ['a.spec.ts'] },
    (request) => {
      seen = request;

      return { status: 0 };
    },
    root,
  );

  return seen?.args ?? [];
}

describe('readPerfRun, a bare run', () => {
  it("turns Vitest 5's own performance hints off, so its advice is not printed twice", () => {
    expect(argsWith('{"version": "5.0.0"}').slice(-2)).toEqual(['--experimental.diagnostics=false', 'a.spec.ts']);
    expect(argsWith('{"version": "6.1.0-beta.1"}')).toContain('--experimental.diagnostics=false');
  });

  it('adds nothing for Vitest 4, or when the installed version cannot be read', () => {
    for (const manifest of ['{"version": "4.1.11"}', '{"version": 5}', '{}', 'not json', undefined]) {
      expect(argsWith(manifest)).not.toContain('--experimental.diagnostics=false');
    }
  });
});
