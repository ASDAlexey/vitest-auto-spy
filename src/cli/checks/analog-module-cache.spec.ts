import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import type { Finding } from '../report';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { checkAnalogModuleCache } from './analog-module-cache';
import { buildGraph } from './graph';

afterEach(() => {
  removeTempRepos();
});

const manifest = (name: string, version: string): Record<string, string> => ({
  [`node_modules/${name}/package.json`]: JSON.stringify({ version }),
});

const analogConfig = (test: string, plugin = "angular({ tsconfig: 'tsconfig.spec.json' })"): string =>
  [
    "import angular from '@analogjs/vite-plugin-angular';",
    "import { defineConfig } from 'vitest/config';",
    `export default defineConfig({ plugins: [${plugin}], test: { ${test} } });`,
  ].join('\n');

const styled = [
  "import { Component } from '@angular/core';",
  "@Component({ selector: 'app-badge', template: '<b>1</b>', styles: [':host { display: block }'] })",
  'export class BadgeComponent {}',
].join('\n');

const plain = [
  "@Component({ selector: 'app-plain', template: '' })",
  'export class PlainComponent {}',
  'const theme = { styles: [] };',
].join('\n');

interface Setup {
  readonly vitest?: string;
  readonly analog?: string;
  readonly files?: Record<string, string>;
  readonly scripts?: Record<string, string>;
}

const run = ({ vitest = '5.0.0', analog = '2.7.5', files = {}, scripts = {} }: Setup): Finding[] => {
  const profile = readProfile(
    createTempRepo({
      'package.json': JSON.stringify({ devDependencies: { vitest: '*' }, scripts }),
      ...manifest('vitest', vitest),
      ...manifest('@analogjs/vite-plugin-angular', analog),
      'src/badge.component.ts': styled,
      ...files,
    }),
  );

  return checkAnalogModuleCache(profile, buildGraph(profile));
};

describe('analog-module-cache-inline-styles', () => {
  it('warns about the warm run that fails on the virtual style module', () => {
    expect(run({ files: { 'vitest.config.mts': analogConfig('fsModuleCache: true') } })).toEqual([
      {
        check: 'analog-module-cache-inline-styles',
        severity: 'warning',
        file: 'vitest.config.mts',
        message:
          "`fsModuleCache` is on for a suite that vitest.config.mts runs through @analogjs/vite-plugin-angular 2.7.5 in JIT mode, and src/badge.component.ts declares inline component `styles`: the first run passes and fills the cache, and every run after it fails the specs that reach such a component with `Cannot find module '/@id/__x00__virtual:angular:jit:style:inline;<hash>'`. Verified on Analog 2.7.5, Angular 22.2 and Vitest 5.0.0.",
        fix: 'Turn `fsModuleCache` off in vitest.config.mts while the suite runs through Analog. `@angular/build:unit-test` has no such break: it bundles the code before Vitest sees it.',
      },
    ]);
  });

  it('reads the Vitest 4 key, the flag and the vitest-angular import', () => {
    const vitestAngular = "import { angular } from '@analogjs/vitest-angular';\nexport default { plugins: [angular()] };";

    expect(run({ vitest: '4.1.11', files: { 'vitest.config.ts': analogConfig('experimental: { fsModuleCache: true }') } })).toHaveLength(1);
    expect(
      run({ files: { 'vite.config.ts': vitestAngular }, scripts: { test: 'vitest run --fsModuleCache' } }).map((finding) => finding.file),
    ).toEqual(['package.json']);
  });

  it('stays quiet without the cache, inline styles, Analog or JIT, and before Vitest 4', () => {
    const on = { 'vitest.config.mts': analogConfig('fsModuleCache: true') };

    expect(run({ files: { 'vitest.config.mts': analogConfig('fsModuleCache: false') } })).toEqual([]);
    expect(run({ files: { ...on, 'src/badge.component.ts': plain } })).toEqual([]);
    expect(run({ files: { 'vitest.config.mts': 'export default { test: { fsModuleCache: true } };' } })).toEqual([]);
    expect(run({ files: { 'vitest.config.mts': analogConfig('fsModuleCache: true', 'angular({ jit: false })') } })).toEqual([]);
    expect(run({ files: { ...on, 'src/setup.ts': "import '@analogjs/vite-plugin-angular';" } })).toHaveLength(1);
    expect(run({ vitest: '3.2.4', files: on })).toEqual([]);
    expect(run({ analog: 'next', files: on })).toEqual([]);
  });

  it('stays quiet when vitest is not a declared dependency', () => {
    const profile = readProfile(
      createTempRepo({
        'package.json': '{}',
        ...manifest('@analogjs/vite-plugin-angular', '2.7.5'),
        'vitest.config.mts': analogConfig('fsModuleCache: true'),
        'src/badge.component.ts': styled,
      }),
    );

    expect(checkAnalogModuleCache(profile, buildGraph(profile))).toEqual([]);
  });
});
