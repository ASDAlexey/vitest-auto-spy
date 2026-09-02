/**
 * A repository still living in the jasmine era, and the two-step way out of it.
 *
 * Like every other check here, nothing consumes this: `jasmine-core` in `devDependencies`,
 * `karma.conf.js` on disk and `"types": ["jasmine"]` in a tsconfig are all silently valid, and a
 * suite half-way off Karma runs green while carrying both worlds. What makes it worth a line is
 * that the way out is not obvious in the right order — the shim first, the codemod second — and
 * doing it the other way round means rewriting a suite that was never green to begin with.
 *
 * The finding is `info`: a repository is free to still be a jasmine repository, and this must not
 * be the reason `doctor` exits 1 in its CI.
 */
import { join } from 'node:path';

import { parseJsonc, readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import { isRecord } from '../profile';
import type { Finding } from '../report';

/** Packages only a jasmine-era suite installs. `karma*` is matched separately — there are dozens. */
const JASMINE_PACKAGES = ['@hirez_io/observer-spy', '@types/jasmine', 'jasmine-auto-spies', 'jasmine-core'];

const KARMA_PACKAGE = /^karma/;
const KARMA_CONFIG = /(^|\/)karma\.conf\.[cm]?[jt]s$/;
const TSCONFIG_NAME = /(^|\/)tsconfig[^/]*\.json$/;

function packageEvidence(profile: Profile): string[] {
  return Object.keys(profile.dependencies)
    .filter((name) => JASMINE_PACKAGES.includes(name) || KARMA_PACKAGE.test(name))
    .sort((a, b) => a.localeCompare(b));
}

/** `"types": ["jasmine"]` is the one that outlives the packages: nothing fails when it is wrong. */
function declaresJasmineTypes(path: string): boolean {
  const text = readTextFile(path);
  const parsed = text === undefined ? undefined : parseJsonc(text);
  const options = isRecord(parsed) ? parsed['compilerOptions'] : undefined;
  const types = isRecord(options) ? options['types'] : undefined;

  return Array.isArray(types) && types.includes('jasmine');
}

function evidenceOf(profile: Profile): string[] {
  return [
    ...packageEvidence(profile),
    ...profile.files.filter((file) => KARMA_CONFIG.test(file)),
    ...profile.files.filter((file) => TSCONFIG_NAME.test(file) && declaresJasmineTypes(join(profile.cwd, file))),
  ];
}

export function checkJasmineEra(profile: Profile): Finding[] {
  const evidence = evidenceOf(profile);

  if (evidence.length === 0) {
    return [];
  }

  return [
    {
      check: 'jasmine-era-project',
      severity: 'info',
      message: `This repository still carries the jasmine era: ${evidence.join(', ')}.`,
      fix: 'Two steps, in this order. Point the specs at `vitest-auto-spy/jasmine`, which keeps `.and`, `.calls` and `.withArgs` working, and land the suite green. Then run `npx vitest-auto-spy codemod --from jasmine` and drop that import — it rewrites the compatibility layer away, `spyOn` included.',
    },
  ];
}
