/**
 * A test setup file the Angular unit-test builder never runs.
 *
 * The builder reads neither `vitest.config.ts` nor `src/test-setup.ts` on its own: it runs the files
 * its target names in `setupFiles`, or a runner config its target names in `runnerConfig`, and
 * nothing else. A project that keeps a `setupFiles` list in its Vitest config — often because the
 * same project also runs under plain `vitest` — therefore gets two different suites from one
 * repository: under the builder `setupAutoSpy()`, its `strict` flag, the registered matchers and the
 * mock adapter the setup file imports are all missing, and each shows up as a different symptom.
 */
import { posix } from 'node:path';

import { readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import { extractSetupFiles } from '../profile';
import type { Finding } from '../report';
import { type UnitTestTarget, unitTestTargets } from './unit-test-targets';

const CONFIGS = [
  'vitest.config.ts',
  'vitest.config.mts',
  'vitest.config.js',
  'vitest.config.mjs',
  'vite.config.ts',
  'vite.config.mts',
  // What `ng generate config vitest` writes; the builder reads it only under `runnerConfig: true`.
  ...['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((extension) => `vitest-base.config.${extension}`),
];

const CONVENTIONAL_SETUP = ['src/test-setup.ts', 'src/setup-tests.ts', 'src/vitest.setup.ts'];

function declaresSetup(target: UnitTestTarget): boolean {
  return target.optionBlocks.some((block) => {
    const setupFiles = block['setupFiles'];
    const runnerConfig = block['runnerConfig'];

    return (Array.isArray(setupFiles) && setupFiles.length > 0) || (runnerConfig !== undefined && runnerConfig !== false);
  });
}

/** The setup files this project evidently means to run, repository-relative, with where that was read. */
function intendedSetup(profile: Profile, root: string): { files: string[]; source: string } | undefined {
  const inProject = (file: string): string => posix.join(root, file.replace(/^\.\//, ''));

  for (const config of CONFIGS) {
    const text = readTextFile(posix.join(profile.cwd, inProject(config)));
    const files = text === undefined ? [] : extractSetupFiles(text);

    if (files.length > 0) {
      return { files: files.map(inProject), source: `listed in the \`setupFiles\` of ${inProject(config)}` };
    }
  }

  const present = new Set(profile.files);
  const conventional = CONVENTIONAL_SETUP.map(inProject).filter((file) => present.has(file));

  return conventional.length > 0 ? { files: conventional, source: 'found at the conventional path' } : undefined;
}

export function checkBuilderSetup(profile: Profile): Finding[] {
  return unitTestTargets(profile).flatMap((target) => {
    const setup = declaresSetup(target) ? undefined : intendedSetup(profile, target.root);

    if (setup === undefined) {
      return [];
    }

    const names = setup.files.map((file) => `\`${file}\``).join(', ');
    const list = setup.files.map((file) => `"${file}"`).join(', ');

    return [
      {
        check: 'builder-setup-unreached',
        severity: 'warning',
        file: target.file,
        message: `\`${target.project}:${target.name}\` runs through \`${target.builder}\`, which runs only the setup files its target names, so ${names}, ${setup.source}, never runs there. \`setupAutoSpy()\`, registered matchers and the mock adapter are missing under that target.`,
        fix: `Add \`"setupFiles": [${list}]\` to the options of \`${target.project}:${target.name}\` in ${target.file}.`,
      },
    ];
  });
}
