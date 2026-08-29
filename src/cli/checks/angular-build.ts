/**
 * `@angular/build` in the window where the unit-test build has code splitting off.
 *
 * From 22.1.5 the builder disabled splitting for the unit-test bundle to dodge a live-binding /
 * undefined-export class of failures. The cost is invisible until it is fatal: every spec becomes
 * a self-contained bundle, a mid-size suite emits hundreds of chunks, and `--coverage` grows by
 * hundreds of megabytes with no plateau until the run is killed. The builder emits no warning.
 *
 * PR #33961 restores the option with splitting on by default, so 22.1.7 closes the window.
 */
import { join } from 'node:path';

import { parseJsonc, readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import { isRecord } from '../profile';
import type { Finding } from '../report';

const FIRST_AFFECTED = [22, 1, 5];
const FIRST_FIXED = [22, 1, 7];

/** Parses `major.minor.patch`, ignoring any prerelease or build suffix. */
export function parseVersion(raw: string): number[] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(raw.trim());

  return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

export function isAffectedVersion(version: readonly number[]): boolean {
  return compareVersions(version, FIRST_AFFECTED) >= 0 && compareVersions(version, FIRST_FIXED) < 0;
}

function installedVersion(cwd: string): string | undefined {
  const text = readTextFile(join(cwd, 'node_modules', '@angular', 'build', 'package.json'));
  const parsed = text === undefined ? undefined : parseJsonc(text);

  if (!isRecord(parsed) || typeof parsed['version'] !== 'string') {
    return undefined;
  }

  return parsed['version'];
}

export function checkAngularBuild(profile: Profile): Finding[] {
  const raw = installedVersion(profile.cwd);
  const version = raw === undefined ? undefined : parseVersion(raw);

  if (version === undefined || !isAffectedVersion(version)) {
    return [];
  }

  return [
    {
      check: 'angular-build-splitting-off',
      severity: 'warning',
      file: 'node_modules/@angular/build/package.json',
      message: `@angular/build ${raw} builds the unit-test bundle with code splitting off: one self-contained bundle per spec, and \`--coverage\` grows by hundreds of megabytes with no plateau.`,
      fix: 'Upgrade to 22.1.7 or newer and set `"splitting": true` on the test target. Nothing warns about this — the run either finishes slowly or is killed by the OOM killer.',
    },
  ];
}
