import { afterEach, describe, expect, it } from 'vitest';

import { blockFacts } from './init-facts';
import { readProfile } from './profile';
import { createTempRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  removeTempRepos();
});

const angular = JSON.stringify({ dependencies: { '@angular/core': '^22.0.0' } });

describe('blockFacts', () => {
  it('reads the companions a repository imports, directly or through a name still taken from `/angular`', () => {
    const root = createTempRepo({
      'package.json': angular,
      'src/test-setup.ts': "import { registerSignalMatchers } from 'vitest-auto-spy/angular/matchers';\n",
      'src/app.spec.ts':
        "import { enableAngularDiagnostics, provideAutoSpy } from 'vitest-auto-spy/angular';\nimport { expectEmission } from 'vitest-auto-spy';\n",
    });

    expect(blockFacts(readProfile(root)).companions).toEqual(['vitest-auto-spy/angular/diagnostics', 'vitest-auto-spy/angular/matchers']);
  });

  it('looks for companions only in an Angular repository', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'src/test-setup.ts': "import { registerSignalMatchers } from 'vitest-auto-spy/angular/matchers';\n",
    });

    expect(blockFacts(readProfile(root))).toEqual({ setupFile: undefined, companions: [] });
  });

  it('takes the first setup file a unit-test target names', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'nx.json': JSON.stringify({
        targetDefaults: { '@nx/angular:unit-test': { options: { setupFiles: ['./tools/test-setup.builder.ts'] } } },
      }),
      'libs/ui/project.json': JSON.stringify({ targets: { test: { executor: '@nx/angular:unit-test', options: { setupFiles: 'nope' } } } }),
      'libs/api/project.json': JSON.stringify({ targets: { test: { executor: '@nx/angular:unit-test', options: { setupFiles: [3] } } } }),
    });

    expect(blockFacts(readProfile(root)).setupFile).toBe('tools/test-setup.builder.ts');
  });

  it('skips a `setupFiles` that is not a list of paths', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'libs/api/project.json': JSON.stringify({ targets: { test: { executor: '@nx/angular:unit-test', options: { setupFiles: [3] } } } }),
      'libs/ui/project.json': JSON.stringify({ targets: { test: { executor: '@nx/angular:unit-test', options: { setupFiles: 'nope' } } } }),
    });

    expect(blockFacts(readProfile(root)).setupFile).toBeUndefined();
  });
});
