/**
 * `@angular/build` in the window where the unit-test build has code splitting off.
 *
 * The window and the wording live in `lib/angular-build-notice`, shared with the notice
 * `setupAutoSpy()` prints from inside the run; this is the half a person runs by hand, against the
 * repository rather than the process.
 */
import { join } from 'node:path';

import { SPLITTING_OFF_FIX, describeSplittingOff, isAffectedRelease } from '../../lib/angular-build-notice';
import { parseJsonc, readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import { isRecord } from '../profile';
import type { Finding } from '../report';

export { compareVersions, isAffectedVersion, parseVersion } from '../../lib/angular-build-notice';

function installedVersion(cwd: string): string | undefined {
  const text = readTextFile(join(cwd, 'node_modules', '@angular', 'build', 'package.json'));
  const parsed = text === undefined ? undefined : parseJsonc(text);

  if (!isRecord(parsed) || typeof parsed['version'] !== 'string') {
    return undefined;
  }

  return parsed['version'];
}

export function checkAngularBuild(profile: Profile): Finding[] {
  const version = installedVersion(profile.cwd);

  if (version === undefined || !isAffectedRelease(version)) {
    return [];
  }

  return [
    {
      check: 'angular-build-splitting-off',
      severity: 'warning',
      file: 'node_modules/@angular/build/package.json',
      message: describeSplittingOff(version),
      fix: `${SPLITTING_OFF_FIX} The builder emits no warning — the run either finishes slowly or is killed by the OOM killer.`,
    },
  ];
}
