import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { buildGraph } from './graph';
import { checkModuleMockLeak, mockCalls } from './module-mock-leak';

afterEach(() => {
  removeTempRepos();
});

const shared = 'export default { test: { isolate: false } };';

const findings = (files: Record<string, string>): ReturnType<typeof checkModuleMockLeak> => {
  const profile = readProfile(createTempRepo({ 'package.json': '{}', ...files }));

  return checkModuleMockLeak(profile, buildGraph(profile));
};

describe('mockCalls', () => {
  it('tells a factory from an automock and a spy mock, and skips a call inside a string', () => {
    expect(
      mockCalls(
        [
          "vi.mock('@app/a', () => ({ a: 1 }));",
          "vi.mock('@app/b');",
          "vi.doMock('./c', { spy: true });",
          'vi.mock(`d`, async (original) => original());',
          'const text = "vi.mock(\'@app/e\')";',
        ].join('\n'),
      ),
    ).toEqual([
      { specifier: '@app/a', kind: 'factory' },
      { specifier: '@app/b', kind: 'automock' },
      { specifier: './c', kind: 'automock' },
      { specifier: 'd', kind: 'factory' },
    ]);
  });
});

describe('checkModuleMockLeak', () => {
  it('reports the automocking file when another spec mocks the same module with a factory', () => {
    const [finding, ...rest] = findings({
      'vitest.config.ts': shared,
      'src/util.ts': 'export const util = 1;',
      'src/a.spec.ts': "vi.mock('./util', () => ({ util: 2 }));",
      'src/b.spec.ts': "vi.mock('./util', { spy: true });",
      'src/c.spec.ts': "vi.mock('./util', () => ({ util: 3 }));",
      'src/other.spec.ts': "vi.mock('@app/other');",
    });

    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ check: 'module-mock-leak', severity: 'warning', file: 'src/b.spec.ts' });
    expect(finding?.message).toBe(
      '`src/util.ts` is automocked here and mocked with a factory in src/a.spec.ts, src/c.spec.ts. With `isolate: false` in vitest.config.ts, a later automock of the module gets that factory, so this file fails with `No "…" export is defined on the "./util" mock` whenever the two share a worker.',
    );
    expect(finding?.fix).toBe("Give `vi.mock('./util')` in this file a factory too, as src/a.spec.ts does.");
  });

  it('lists up to six factory files, and counts the rest past that', () => {
    const factories = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [`src/f${index}.spec.ts`, "vi.mock('@app/x', () => ({}));"]),
    );
    const [finding] = findings({ 'vitest.config.ts': shared, 'src/b.spec.ts': "vi.mock('@app/x');", ...factories });

    expect(finding?.message).toContain('in src/f0.spec.ts, src/f1.spec.ts, src/f2.spec.ts, src/f3.spec.ts, src/f4.spec.ts and 3 more.');
  });

  it('reads a shared environment from a config, from the builder default, or not at all', () => {
    const pair = { 'src/a.spec.ts': "vi.mock('@app/x', () => ({}));", 'src/b.spec.ts': "vi.mock('@app/x');" };
    const builder = JSON.stringify({ projects: { app: { architect: { test: { builder: '@angular/build:unit-test' } } } } });

    expect(findings({ 'vitest.shared.ts': shared, ...pair })).toHaveLength(1);
    expect(findings({ 'angular.json': builder, ...pair })[0]?.message).toContain(
      'With the `isolate: false` default of @angular/build:unit-test,',
    );
    expect(findings({ 'vitest.config.ts': 'export default {};', ...pair })).toEqual([]);
    expect(
      findings({
        'angular.json': JSON.stringify({
          projects: {
            app: { architect: { test: { builder: '@angular/build:unit-test', options: { runnerConfig: 'vitest-runner.config.ts' } } } },
          },
        }),
        'vitest-runner.config.ts': 'export default { test: { isolate: true } };',
        ...pair,
      }),
    ).toEqual([]);
    expect(findings({ 'vitest.config.ts': shared, 'src/a.spec.ts': "vi.mock('@app/x', () => ({}));" })).toEqual([]);
  });
});
