/**
 * The installed `@angular/build` against what the unit-test run needs from it: the window where the
 * build has code splitting off, and an Analog plugin too old for the builder beside it.
 *
 * The splitting window and its wording live in `lib/angular-build-notice`, shared with the notice
 * `setupAutoSpy()` prints from inside the run; this is the half a person runs by hand, against the
 * repository rather than the process.
 */
import { compareVersions, describeSplittingOff, isAffectedRelease, parseVersion } from '../../lib/angular-build-notice';
import type { Profile } from '../profile';
import type { Finding } from '../report';
import { unitTestTargets } from './unit-test-targets';
import { installedVersionOf } from './vitest-5-facts';

export { compareVersions, isAffectedVersion, parseVersion } from '../../lib/angular-build-notice';

const NAMED_TARGETS = 3;

function fixFor(profile: Profile): string {
  const targets = unitTestTargets(profile);
  const named = targets.slice(0, NAMED_TARGETS).map((target) => `\`${target.project}:${target.name}\` in ${target.file}`);
  const rest = targets.length - named.length;
  const where = named.length === 0 ? 'the unit-test target' : `${named.join(', ')}${rest === 0 ? '' : ` and ${rest} more targets`}`;

  return `Upgrade @angular/build to 22.1.7 or newer, where splitting is on by default, and remove any \`"splitting": false\` from ${where}.`;
}

function splittingOff(profile: Profile, version: string | undefined): Finding[] {
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

const ANALOG_PLUGIN = '@analogjs/vite-plugin-angular';

/** 22.2's `SourceFileCache` no longer extends `Map`, and the Analog host calls `cache.has` on it. */
const CACHE_NOT_A_MAP_FROM = [22, 2, 0];
const ANALOG_FIXED_IN = [2, 7, 5];

const compared = (raw: string, floor: readonly number[]): number => {
  const version = parseVersion(raw);

  return version === undefined ? Number.NaN : compareVersions(version, floor);
};

function analogBehind(cwd: string, builderVersion: string | undefined): Finding[] {
  const analogVersion = installedVersionOf(cwd, ANALOG_PLUGIN);

  if (builderVersion === undefined || analogVersion === undefined) {
    return [];
  }

  // NaN for an unreadable version fails both comparisons, so either one keeps the check quiet.
  if (!(compared(builderVersion, CACHE_NOT_A_MAP_FROM) >= 0 && compared(analogVersion, ANALOG_FIXED_IN) < 0)) {
    return [];
  }

  return [
    {
      check: 'analog-behind-angular-build',
      severity: 'error',
      file: `node_modules/${ANALOG_PLUGIN}/package.json`,
      message: `${ANALOG_PLUGIN} ${analogVersion} is too old for @angular/build ${builderVersion}: the run dies at startup with \`TypeError: cache.has is not a function\`, because from 22.2.0 the builder's \`SourceFileCache\` no longer extends \`Map\`.`,
      fix: 'Upgrade `@analogjs/vite-plugin-angular` and `@analogjs/vitest-angular` to 2.7.5 or newer.',
    },
  ];
}

export function checkAngularBuild(profile: Profile): Finding[] {
  const version = installedVersionOf(profile.cwd, '@angular/build');

  return [...splittingOff(profile, version), ...analogBehind(profile.cwd, version)];
}
