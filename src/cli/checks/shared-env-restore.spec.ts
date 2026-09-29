import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import type { Finding } from '../report';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { buildGraph } from './graph';
import { checkSharedEnvRestore, setupCalls } from './shared-env-restore';

afterEach(() => {
  removeTempRepos();
});

const manifest = (over: object = {}): string =>
  JSON.stringify({ dependencies: { '@angular/core': '^22' }, devDependencies: { vitest: '^5', 'vitest-auto-spy': '^5' }, ...over });

const findingsIn = (files: Record<string, string>): Finding[] => {
  const profile = readProfile(createTempRepo({ 'package.json': manifest(), ...files }));

  return checkSharedEnvRestore(profile, buildGraph(profile));
};

const SHARED_CONFIG = { 'vitest.config.ts': 'export default { test: { isolate: false } };' };

describe('checkSharedEnvRestore', () => {
  it('reports a shared Angular suite whose setup file restores nothing, naming every option', () => {
    const [finding] = findingsIn({ ...SHARED_CONFIG, 'src/test-setup.ts': "import 'zone.js';" });

    expect(finding).toMatchObject({ check: 'shared-env-without-restore', severity: 'info' });
    expect(finding).not.toHaveProperty('file');
    expect(finding?.message).toContain('(vitest.config.ts sets `isolate: false`), and no setup file calls `setupAutoSpy()`');
    expect(finding?.fix).toBe(
      'Call `setupAutoSpy({ restoreMocks: true, strayTimers: true, strayListeners: true, restoreGlobals: true })` in the setup file, or turn isolation back on for the files that leak.',
    );
  });

  it('names only the options the call leaves off, and counts the strict preset as stray-timer tracking', () => {
    const [finding] = findingsIn({
      ...SHARED_CONFIG,
      'src/test-setup.ts': "setupAutoSpy({ preset: 'strict', restoreMocks: true, strayListeners: { } });",
    });

    expect(finding?.file).toBe('src/test-setup.ts');
    expect(finding?.message).toContain('`setupAutoSpy()` in src/test-setup.ts leaves `restoreGlobals` off');
    expect(finding?.message).toContain(': a global assigned by hand survives');
  });

  it('is satisfied by every option across the setup calls, and does not take the preset over an explicit false', () => {
    expect(
      findingsIn({
        ...SHARED_CONFIG,
        'src/a.ts': 'setupAutoSpy({ restoreMocks: true, strayTimers: true });',
        'src/b.ts': 'setupAutoSpy({ strayListeners: true, restoreGlobals: true });',
      }),
    ).toEqual([]);
    expect(
      findingsIn({
        ...SHARED_CONFIG,
        'src/a.ts':
          "setupAutoSpy({ preset: 'strict', strayTimers: false, restoreMocks: true, strayListeners: true, restoreGlobals: true });",
      }).map((finding) => finding.fix),
    ).toEqual([expect.stringContaining('setupAutoSpy({ strayTimers: true })')]);
  });

  it('finds the shared environment in a script, and in the Angular builder default', () => {
    const script = readProfile(
      createTempRepo({ 'package.json': manifest({ scripts: { test: 'vitest run --no-isolate' } }), 'src/a.ts': '' }),
    );

    expect(checkSharedEnvRestore(script, buildGraph(script))[0]?.message).toContain('the `test` script turns isolation off');

    const builder = findingsIn({
      'angular.json': JSON.stringify({ projects: { app: { root: '', architect: { test: { builder: '@angular/build:unit-test' } } } } }),
      'node_modules/@angular/build/package.json': JSON.stringify({ version: '22.2.0' }),
    });

    expect(builder[0]?.message).toContain('already runs without per-file isolation');
  });

  it('stays out of an isolated suite, a suite without Angular, and one that does not use the library', () => {
    expect(findingsIn({ 'vitest.config.ts': 'export default { test: { isolate: true } };' })).toEqual([]);

    for (const over of [{ dependencies: {} }, { devDependencies: { vitest: '^5' } }]) {
      const profile = readProfile(createTempRepo({ 'package.json': manifest(over), ...SHARED_CONFIG }));

      expect(checkSharedEnvRestore(profile, buildGraph(profile))).toEqual([]);
    }
  });

  it('reads each call up to its closing parenthesis, strings and all', () => {
    expect(setupCalls("setupAutoSpy({ a: ')' }); setupAutoSpy();")).toEqual(["{ a: ')' }", '']);
    expect(setupCalls('setupAutoSpy({ a: 1')).toEqual(['{ a: 1']);
  });
});
