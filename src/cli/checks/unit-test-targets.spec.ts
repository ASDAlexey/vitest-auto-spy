import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { unitTestTargets } from './unit-test-targets';

afterEach(removeTempRepos);

describe('unitTestTargets local builders', () => {
  it('recognises a workspace-local wrapper through its manifest and actual Angular delegation', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'angular.json': JSON.stringify({
        projects: {
          bench: {
            root: 'tools/bench',
            architect: {
              test: {
                builder: './tools/bench:test',
                options: { runnerConfig: 'runner.ts' },
              },
            },
          },
        },
      }),
      'tools/bench/package.json': JSON.stringify({ builders: './builders.json' }),
      'tools/bench/builders.json': JSON.stringify({ builders: { test: { implementation: './test.mjs' } } }),
      'tools/bench/test.mjs':
        "const { executeUnitTestBuilder } = await import('@angular/build'); yield* executeUnitTestBuilder(options, context);",
    });

    expect(unitTestTargets(readProfile(root))).toEqual([
      {
        file: 'angular.json',
        project: 'bench',
        root: 'tools/bench',
        name: 'test',
        builder: './tools/bench:test',
        optionBlocks: [{ runnerConfig: 'runner.ts' }],
      },
    ]);
  });
});
