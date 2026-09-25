/**
 * `@angular/build` in the window where the unit-test build has code splitting off.
 *
 * The window and the wording live in `lib/angular-build-notice`, shared with the notice
 * `setupAutoSpy()` prints from inside the run; this is the half a person runs by hand, against the
 * repository rather than the process.
 */
import { join } from 'node:path';

import { describeSplittingOff, isAffectedRelease } from '../../lib/angular-build-notice';
import { parseJsonc, readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import { isRecord } from '../profile';
import type { Finding } from '../report';
import { unitTestTargets } from './unit-test-targets';

export { compareVersions, isAffectedVersion, parseVersion } from '../../lib/angular-build-notice';

function installedVersion(cwd: string): string | undefined {
  const text = readTextFile(join(cwd, 'node_modules', '@angular', 'build', 'package.json'));
  const parsed = text === undefined ? undefined : parseJsonc(text);

  if (!isRecord(parsed) || typeof parsed['version'] !== 'string') {
    return undefined;
  }

  return parsed['version'];
}

const NAMED_TARGETS = 3;

function fixFor(profile: Profile): string {
  const targets = unitTestTargets(profile);
  const named = targets.slice(0, NAMED_TARGETS).map((target) => `\`${target.project}:${target.name}\` in ${target.file}`);
  const rest = targets.length - named.length;
  const where = named.length === 0 ? 'the unit-test target' : `${named.join(', ')}${rest === 0 ? '' : ` and ${rest} more targets`}`;

  return `Upgrade @angular/build to 22.1.7 or newer, and set \`"splitting": true\` on ${where}.`;
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
      fix: fixFor(profile),
    },
  ];
}
