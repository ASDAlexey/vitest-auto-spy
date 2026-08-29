/**
 * One worker, two Angular testing platforms: zone and zoneless in the same run.
 *
 * `TestBed.initTestEnvironment` may be called once per platform, and under `isolate: false` the
 * platform lives for the whole worker. A repository migrating to zoneless gradually — a few
 * libraries switched, the rest still on zone.js — therefore cannot express itself in setup files at
 * all: the second file the worker picks up in the other mode fails with `Cannot set base providers
 * because it has already been called`, and the message names neither file.
 *
 * Vitest's own answer, `test.projects`, does not solve it. Nothing promises that a worker serves
 * files of one project, and a worker handed a file of the other mode fails exactly the same way.
 *
 * What does work is small and unobvious: decide the mode from the file about to run, and when it
 * differs from the one installed, tear the environment down (`resetTestEnvironment()`) before
 * initialising the other. This helper is that, with the mode remembered per worker so the common
 * case — a run of files in the same mode — pays for one initialisation and no resets.
 *
 * ```ts
 * // vitest-setup.ts
 * import { setupAngularTestEnv } from 'vitest-auto-spy/angular';
 * import { setupZoneTestEnv, setupZonelessTestEnv } from 'jest-preset-angular/setup-env';
 *
 * setupAngularTestEnv({
 *   zoneless: (testPath) => testPath.includes('/libs/music/') || testPath.includes('/apps/kion-top/'),
 *   initZone: setupZoneTestEnv,
 *   initZoneless: setupZonelessTestEnv,
 * });
 * ```
 *
 * The initialisers stay the caller's: which platform, which providers and which `teardown` policy a
 * project wants is not something this library should decide, and the packages that supply them
 * (`@analogjs/vitest-angular`, `jest-preset-angular`, a hand-written `initTestEnvironment`) are not
 * dependencies of it.
 */
import { getTestBed } from '@angular/core/testing';
import { beforeAll, expect } from 'vitest';

/** Which change-detection mode a spec file expects. */
export type AngularTestEnvMode = 'zone' | 'zoneless';

/** What {@link setupAngularTestEnv} needs to know. */
export interface AngularTestEnvOptions {
  /**
   * Whether the file at `testPath` runs zoneless. Called once per spec file — the path is the file,
   * and a file does not change its mind halfway through — so a `startsWith` / `includes` over the
   * path is all it should ever need to be.
   */
  zoneless: (testPath: string) => boolean;
  /** Initialise the zone environment — `setupZoneTestEnv()`, or your own `initTestEnvironment` call. */
  initZone: () => void;
  /** Initialise the zoneless environment. */
  initZoneless: () => void;
}

/**
 * Install what the file about to run needs, tearing the other platform down when the mode changes.
 *
 * Exported, and told what is installed rather than reading it from a closure, so a platform switch
 * can be exercised in a single spec file: the hook decides once per file, and one file cannot be
 * two files.
 *
 * @returns The mode that is now installed — what the next file compares itself against.
 */
export function installAngularTestEnv(options: AngularTestEnvOptions, installed: AngularTestEnvMode | undefined): AngularTestEnvMode {
  const testPath = expect.getState().testPath ?? '';
  const wanted: AngularTestEnvMode = options.zoneless(testPath) ? 'zoneless' : 'zone';

  if (installed === wanted) {
    return installed;
  }

  // Also on the first install, and deliberately: the setup file may not be the only thing that
  // initialised a platform (a preset, an imported setup module), and `resetTestEnvironment()` on
  // an environment nobody initialised is a no-op — while skipping it when one exists is the
  // "already been called" failure this helper is here to remove.
  getTestBed().resetTestEnvironment();

  if (wanted === 'zoneless') {
    options.initZoneless();
  } else {
    options.initZone();
  }

  return wanted;
}

/**
 * Install the Angular testing environment each spec file needs, switching platforms when it changes.
 *
 * Call it from the project's setup file, in place of the single `setupZoneTestEnv()` /
 * `setupZonelessTestEnv()` that a one-mode repository has.
 */
export function setupAngularTestEnv(options: AngularTestEnvOptions): void {
  let installed: AngularTestEnvMode | undefined;

  // `beforeAll`, not `beforeEach`: the decision is made from `expect.getState().testPath`, which is
  // the file — it cannot change between two tests of that file, so asking again before every one of
  // them re-ran the caller's predicate for an answer that was already known.
  beforeAll(() => {
    installed = installAngularTestEnv(options, installed);
  });
}
