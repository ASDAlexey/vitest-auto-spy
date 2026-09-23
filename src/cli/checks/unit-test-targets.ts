/**
 * Every target of the workspace that runs its tests through the Angular unit-test builder — the
 * Angular CLI's own, or the Nx executor that delegates to it — with the option blocks that reach it.
 *
 * Nx keeps a target's options in three places: `targetDefaults` in `nx.json` (keyed by executor or by
 * target name), the target's `options`, and its `configurations`. A check that read only the second
 * missed every option a workspace declares once for all its projects.
 */
import { dirname, join, posix } from 'node:path';

import { parseJsonc, readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import { isRecord } from '../profile';

export const UNIT_TEST_BUILDERS: ReadonlySet<string> = new Set(['@angular/build:unit-test', '@nx/angular:unit-test']);

const WORKSPACE_FILES = ['angular.json', 'workspace.json'];

export interface UnitTestTarget {
  /** The file the target is declared in, repository-relative. */
  readonly file: string;
  readonly project: string;
  /** The project's root, repository-relative; `''` for a project at the repository root. */
  readonly root: string;
  readonly name: string;
  readonly builder: string;
  /** Workspace defaults first, then the target's `options`, then each of its `configurations`. */
  readonly optionBlocks: readonly Record<string, unknown>[];
}

type Defaults = (key: string) => Record<string, unknown> | undefined;

function readJson(profile: Profile, file: string): Record<string, unknown> | undefined {
  const parsed = parseJsonc(readTextFile(join(profile.cwd, file)) ?? '');

  return isRecord(parsed) ? parsed : undefined;
}

function recordAt(value: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const found = value?.[key];

  return isRecord(found) ? found : undefined;
}

function nxDefaults(profile: Profile): Defaults {
  const defaults = recordAt(readJson(profile, 'nx.json'), 'targetDefaults');

  return (key) => recordAt(defaults, key);
}

function builderOf(target: Record<string, unknown>, byName: Record<string, unknown> | undefined): unknown {
  return target['builder'] ?? target['executor'] ?? byName?.['executor'];
}

function optionBlocks(
  target: Record<string, unknown>,
  defaults: readonly (Record<string, unknown> | undefined)[],
): Record<string, unknown>[] {
  const configurations = recordAt(target, 'configurations');

  return [
    ...defaults.map((entry) => recordAt(entry, 'options')),
    recordAt(target, 'options'),
    ...Object.values(configurations ?? {}).map((entry) => (isRecord(entry) ? entry : undefined)),
  ].filter((block): block is Record<string, unknown> => block !== undefined);
}

function targetsOf(
  file: string,
  project: string,
  root: string,
  targets: Record<string, unknown> | undefined,
  defaults: Defaults,
): UnitTestTarget[] {
  return Object.entries(targets ?? {}).flatMap(([name, target]) => {
    if (!isRecord(target)) {
      return [];
    }

    const byName = defaults(name);
    const builder = builderOf(target, byName);

    if (typeof builder !== 'string' || !UNIT_TEST_BUILDERS.has(builder)) {
      return [];
    }

    return [{ file, project, root, name, builder, optionBlocks: optionBlocks(target, [defaults(builder), byName]) }];
  });
}

function fromWorkspaceFile(profile: Profile, defaults: Defaults): UnitTestTarget[] {
  for (const file of WORKSPACE_FILES) {
    const projects = recordAt(readJson(profile, file), 'projects');

    if (projects !== undefined) {
      return Object.entries(projects).flatMap(([project, value]) => {
        const definition = isRecord(value) ? value : {};
        const root = typeof definition['root'] === 'string' ? definition['root'].replace(/\/$/, '') : '';

        return targetsOf(file, project, root, recordAt(definition, 'architect') ?? recordAt(definition, 'targets'), defaults);
      });
    }
  }

  return [];
}

function fromProjectFiles(profile: Profile, defaults: Defaults): UnitTestTarget[] {
  return profile.files
    .filter((file) => posix.basename(file) === 'project.json')
    .flatMap((file) => {
      const definition = readJson(profile, file) ?? {};
      const root = dirname(file) === '.' ? '' : dirname(file);
      const project = typeof definition['name'] === 'string' ? definition['name'] : root;

      return targetsOf(file, project, root, recordAt(definition, 'targets'), defaults);
    });
}

export function unitTestTargets(profile: Profile): UnitTestTarget[] {
  const defaults = nxDefaults(profile);

  return [...fromWorkspaceFile(profile, defaults), ...fromProjectFiles(profile, defaults)];
}
