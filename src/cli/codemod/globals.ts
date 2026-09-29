import { join } from 'node:path';

import { readTextFile } from '../fs-scan';
import type { Profile } from '../profile';

const CONFIG_FILE = /(?:^|\/)(?:vitest\.config|vite\.config|vitest\.workspace)\.[cm]?[jt]s$/;
const GLOBALS_ON = /\bglobals\s*:\s*true\b/;
const ANGULAR_UNIT_TEST = '@angular/build:unit-test';

/**
 * Whether the specs run with Vitest's `globals` on. `undefined` for another runner, where `vi` is
 * not the question. The Angular builder turns it on itself; a plain Vitest config has to say so.
 */
export function vitestGlobals(profile: Pick<Profile, 'cwd' | 'files' | 'runner'>): boolean | undefined {
  if (profile.runner !== 'vitest') {
    return undefined;
  }

  if (readTextFile(join(profile.cwd, 'angular.json'))?.includes(ANGULAR_UNIT_TEST) === true) {
    return true;
  }

  return profile.files.some((file) => CONFIG_FILE.test(file) && GLOBALS_ON.test(readTextFile(join(profile.cwd, file)) ?? ''));
}
