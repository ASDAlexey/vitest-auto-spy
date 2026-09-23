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
    expect(finding?.message).toContain('`src/util.ts` is automocked here and mocked with a factory in src/a.spec.ts and 1 more');
  });

  it('reads a shared environment from a config, from the builder default, or not at all', () => {
    const pair = { 'src/a.spec.ts': "vi.mock('@app/x', () => ({}));", 'src/b.spec.ts': "vi.mock('@app/x');" };
    const builder = JSON.stringify({ projects: { app: { architect: { test: { builder: '@angular/build:unit-test' } } } } });

    expect(findings({ 'vitest.shared.ts': shared, ...pair })).toHaveLength(1);
    expect(findings({ 'angular.json': builder, ...pair })).toHaveLength(1);
    expect(findings({ 'vitest.config.ts': 'export default {};', ...pair })).toEqual([]);
    expect(findings({ 'vitest.config.ts': shared, 'src/a.spec.ts': "vi.mock('@app/x', () => ({}));" })).toEqual([]);
  });
});
