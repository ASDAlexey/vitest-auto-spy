import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import type { Finding } from '../report';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { checkAngularTestBedSplit } from './angular-testbed-split';
import { buildGraph } from './graph';

afterEach(() => {
  removeTempRepos();
});

const ANALOG_CONFIG = [
  "import angular from '@analogjs/vite-plugin-angular';",
  'export default { plugins: [angular()], test: { environment: "jsdom" } };',
].join('\n');

const SPEC = "import { injectSpy } from 'vitest-auto-spy/angular';";

const findingsIn = (files: Record<string, string>, manifest: object = {}): Finding[] => {
  const profile = readProfile(
    createTempRepo({
      'package.json': JSON.stringify({
        dependencies: { '@angular/core': '^22' },
        devDependencies: { 'vitest-auto-spy': '^5' },
        ...manifest,
      }),
      ...files,
    }),
  );

  return checkAngularTestBedSplit(profile, buildGraph(profile));
};

describe('checkAngularTestBedSplit', () => {
  it('reports an Analog config that leaves the package externalized, counting the files that import it', () => {
    const findings = findingsIn({ 'vite.config.ts': ANALOG_CONFIG, 'src/a.spec.ts': SPEC, 'src/b.spec.ts': SPEC });

    expect(findings).toEqual([expect.objectContaining({ check: 'angular-testbed-split', severity: 'warning', file: 'vite.config.ts' })]);
    expect(findings[0]?.message).toContain('which 2 files import for Angular');
    expect(findings[0]?.fix).toContain("server: { deps: { inline: ['vitest-auto-spy'] } }");
    expect(findingsIn({ 'vite.config.ts': ANALOG_CONFIG, 'src/a.spec.ts': SPEC })[0]?.message).toContain('which 1 file imports');
  });

  it('is satisfied by an inline list naming the package, inline: true, or noExternal naming it', () => {
    for (const setting of [
      "server: { deps: { inline: ['vitest-auto-spy'] } }",
      'deps: { inline: true }',
      'ssr: { noExternal: [/vitest-auto-spy/] }',
    ]) {
      const config = ANALOG_CONFIG.replace('environment: "jsdom"', `environment: "jsdom", ${setting}`);

      expect(findingsIn({ 'vite.config.ts': config, 'src/a.spec.ts': SPEC }), setting).toEqual([]);
    }
  });

  it('does not take a commented-out setting, or one that inlines something else', () => {
    const commented = ANALOG_CONFIG.replace('environment: "jsdom"', 'environment: "jsdom" /* inline: [\'vitest-auto-spy\'] */');
    const other = ANALOG_CONFIG.replace('environment: "jsdom"', "server: { deps: { inline: ['rxjs'] } }");

    expect(findingsIn({ 'vite.config.ts': commented, 'src/a.spec.ts': SPEC })).toHaveLength(1);
    expect(findingsIn({ 'vite.config.ts': other, 'src/a.spec.ts': SPEC })).toHaveLength(1);
  });

  it('stays out of a suite without Analog, without an Angular import of the package, without Angular, or without the package', () => {
    expect(findingsIn({ 'vite.config.ts': 'export default {};', 'src/a.spec.ts': SPEC })).toEqual([]);
    expect(
      findingsIn({ 'vite.config.ts': ANALOG_CONFIG, 'src/a.spec.ts': "import { createSpyFromClass } from 'vitest-auto-spy';" }),
    ).toEqual([]);
    expect(findingsIn({ 'vite.config.ts': ANALOG_CONFIG, 'src/a.spec.ts': SPEC }, { dependencies: {} })).toEqual([]);
    expect(findingsIn({ 'vite.config.ts': ANALOG_CONFIG, 'src/a.spec.ts': SPEC }, { devDependencies: {} })).toEqual([]);
  });
});
