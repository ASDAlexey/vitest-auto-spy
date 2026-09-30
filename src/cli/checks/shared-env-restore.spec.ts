import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import type { Finding } from '../report';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { buildGraph } from './graph';
import { checkSharedEnvRestore } from './shared-env-restore';

afterEach(() => {
  removeTempRepos();
});

const manifest = (over: object = {}): string =>
  JSON.stringify({ dependencies: { '@angular/core': '^22' }, devDependencies: { vitest: '^5', 'vitest-auto-spy': '^5' }, ...over });

const findingsIn = (files: Record<string, string>): Finding[] => {
  const profile = readProfile(createTempRepo({ 'package.json': manifest(), ...files }));

  return checkSharedEnvRestore(profile, buildGraph(profile));
};

const ALL_ON = '{ restoreMocks: true, strayTimers: true, strayListeners: true, restoreGlobals: true }';

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

  it('adds up the calls of the setup files the runner config lists, and does not take the preset over an explicit false', () => {
    expect(
      findingsIn({
        'vitest.config.ts': "export default { test: { isolate: false, setupFiles: ['src/a.ts', './src/b.ts'] } };",
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

  it('judges a setup file the config does not list on its own calls, and names that file', () => {
    const findings = findingsIn({
      'vitest.config.ts': "export default { test: { isolate: false, setupFiles: ['src/test-setup.ts'] } };",
      'src/test-setup.ts': `setupAutoSpy(${ALL_ON});`,
      'libs/ui/src/test-setup.ts': 'setupAutoSpy({ restoreMocks: true, strayTimers: { }, strayListeners: true });',
      'libs/ui/src/button.spec.ts': 'setupAutoSpy({});',
    });

    expect(findings.map(({ file, message }) => [file, message.slice(message.indexOf('`setupAutoSpy()`'))])).toEqual([
      [
        'libs/ui/src/test-setup.ts',
        expect.stringMatching(/^`setupAutoSpy\(\)` in libs\/ui\/src\/test-setup\.ts leaves `restoreGlobals` off:/),
      ],
    ]);
  });

  it('reads options a setup file declares, imports or spreads, a later key overriding an earlier one', () => {
    expect(
      findingsIn({
        ...SHARED_CONFIG,
        'src/options.ts': `export const OPTIONS = ${ALL_ON};`,
        'src/test-setup.ts': "import { OPTIONS } from './options';\nsetupAutoSpy({ ...OPTIONS, blockNetwork: false });",
        'src/other-setup.ts': `const LOCAL = ${ALL_ON};\nsetupAutoSpy(LOCAL);`,
      }),
    ).toEqual([]);
    expect(
      findingsIn({
        ...SHARED_CONFIG,
        'src/options.ts': `export const OPTIONS = ${ALL_ON};`,
        'src/test-setup.ts': "import { OPTIONS } from './options';\nsetupAutoSpy({ ...OPTIONS, restoreGlobals: false });",
      }).map(({ file, fix }) => [file, fix]),
    ).toEqual([['src/test-setup.ts', expect.stringContaining('setupAutoSpy({ restoreGlobals: true })')]]);
  });

  it('reads options frozen, asserted or wrapped in parentheses, as the runtime passes them', () => {
    const frozen = (value: string): Finding[] =>
      findingsIn({
        ...SHARED_CONFIG,
        'src/options.ts': `export const OPTS = Object.freeze(${value}) as const;`,
        'src/test-setup.ts': "import { OPTS } from './options';\nsetupAutoSpy({ ...(OPTS satisfies object) });",
      });

    expect(frozen(ALL_ON)).toEqual([]);
    expect(frozen('{ restoreMocks: false, strayTimers: true, strayListeners: true, restoreGlobals: true }')).toEqual([
      expect.objectContaining({ file: 'src/test-setup.ts', fix: expect.stringContaining('setupAutoSpy({ restoreMocks: true })') }),
    ]);
  });

  it('notes options it cannot read, naming the file and the switches, and still reports the ones it can', () => {
    const [imported] = findingsIn({
      ...SHARED_CONFIG,
      'src/test-setup.ts': "import { OPTIONS } from '@company/test-config';\nsetupAutoSpy(OPTIONS);",
    });

    expect(imported).toMatchObject({ check: 'shared-env-without-restore', severity: 'info', file: 'src/test-setup.ts' });
    expect(imported?.message).toContain(
      'the options `setupAutoSpy()` gets in src/test-setup.ts are not statically readable, so `doctor` cannot tell whether `restoreMocks`, `strayTimers`, `strayListeners`, `restoreGlobals` are on: if off, a `vi.spyOn` on a shared object,',
    );
    expect(imported?.fix).toContain('so `restoreMocks`, `strayTimers`, `strayListeners`, `restoreGlobals` can be read');
    expect(
      findingsIn({
        ...SHARED_CONFIG,
        'src/test-setup.ts': [
          "setupAutoSpy({ restoreMocks: isCi, preset: PRESET, strayListeners: 'yes' });",
          'setupAutoSpy({ ...base(), restoreGlobals: true });',
          'setupAutoSpy({ preset });',
        ].join('\n'),
      }).map(({ message }) => message.slice(message.indexOf('whether'))),
    ).toEqual([expect.stringMatching(/^whether `restoreMocks`, `strayTimers`, `strayListeners` are on:/)]);
    expect(
      findingsIn({
        ...SHARED_CONFIG,
        'src/test-setup.ts': [
          "setupAutoSpy({ restoreMocks: isCi, strayListeners: true, restoreGlobals: true, preset: 'relaxed' });",
          'setupAutoSpy({ restoreMocks: false });',
        ].join('\n'),
      }).map(({ message, fix }) => (message.includes('statically') ? message.slice(message.indexOf('whether')) : fix)),
    ).toEqual([
      expect.stringContaining('setupAutoSpy({ strayTimers: true })'),
      expect.stringMatching(/^whether `restoreMocks` is on: if off, a `vi\.spyOn` on a shared object survives/),
    ]);
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

  it('does not count a call in a comment or a string, or a spec calling it for itself', () => {
    const [finding] = findingsIn({
      ...SHARED_CONFIG,
      'src/test-setup.ts': `// setupAutoSpy(${ALL_ON});\nconst doc = 'setupAutoSpy(${ALL_ON})';`,
      'src/a.spec.ts': `setupAutoSpy(${ALL_ON});`,
    });

    expect(finding?.message).toContain('no setup file calls `setupAutoSpy()`');
  });
});
