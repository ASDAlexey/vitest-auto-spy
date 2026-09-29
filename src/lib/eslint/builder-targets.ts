/**
 * The runner configs the Angular unit-test builder reads for a spec file — the second runner a
 * workspace can put the same specs through, and the one whose configuration the lint config never sees.
 *
 * `@angular/build:unit-test` (and `@nx/angular:unit-test`, which delegates to it) hands Vitest
 * `config: false` unless its target names a `runnerConfig`, so a `vitest.config.ts` beside the specs
 * is not read under `ng test` / `nx test` at all: the run gets Vitest's defaults. A reset that a
 * `restoreMocks: true` in that file makes dead under `npx vitest` is the only reset there is under the
 * builder. `runnerConfig: true` (or `""`) is resolved the way the builder resolves it — the first
 * `vitest-base.config.*` in the project root, then the workspace root — and a string against the
 * workspace root.
 *
 * Every target whose project root contains the file counts, and every configuration of it: the rule
 * may call a reset dead only where each of them makes it so. The workspace files are read as plain
 * JSON; one that does not parse contributes no target, which leaves the rule where it was before.
 *
 * Each run also carries the `externalDependencies` of its `buildTarget` (options merged with the named
 * configurations, as `context.getTargetOptions` does): the builder leaves those specifiers out of the
 * bundle, so Vitest resolves them and a `vi.mock` of one replaces the module.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

/** Keep in step with `UNIT_TEST_BUILDERS` in `src/cli/checks/unit-test-targets.ts`. */
const UNIT_TEST_BUILDERS: ReadonlySet<string> = new Set(['@angular/build:unit-test', '@nx/angular:unit-test']);

const WORKSPACE_FILES = ['angular.json', 'workspace.json'];

const BASE_CONFIGS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((extension) => `vitest-base.config.${extension}`);

type Json = Record<string, unknown>;

/** The runner config each builder run of a file reads: an absolute path, or `undefined` for none. */
export type BuilderConfigs = readonly (string | undefined)[];

/** One unit-test builder run: the runner config it reads and the specifiers its build leaves external. */
export interface BuilderRun {
  readonly config: string | undefined;
  readonly externals: readonly string[];
}

/** One answer per directory for the length of the lint run. */
const runsCache = new Map<string, readonly BuilderRun[]>();

function isJson(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(path: string): Json | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));

    return isJson(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function recordAt(value: Json | undefined, key: string): Json | undefined {
  const found = value?.[key];

  return isJson(found) ? found : undefined;
}

function contains(root: string, directory: string): boolean {
  return directory === root || directory.startsWith(join(root, sep));
}

/** Where the builder's own search for `runnerConfig: true` lands. */
function baseConfig(projectRoot: string, workspaceRoot: string): string | undefined {
  return [...new Set([projectRoot, workspaceRoot])]
    .flatMap((directory) => BASE_CONFIGS.map((name) => join(directory, name)))
    .find((path) => existsSync(path));
}

function configOf(value: unknown, projectRoot: string, workspaceRoot: string): string | undefined {
  if (value === true || value === '') {
    return baseConfig(projectRoot, workspaceRoot);
  }

  return typeof value === 'string' ? resolve(workspaceRoot, value) : undefined;
}

/** The workspace a run is read in: where paths resolve, nx `targetDefaults`, and the projects by name for `buildTarget`. */
interface Workspace {
  readonly root: string;
  readonly defaults: Json | undefined;
  readonly projects: ReadonlyMap<string | undefined, Json>;
}

function targetsOf(project: Json | undefined): Json {
  return recordAt(project, 'architect') ?? recordAt(project, 'targets') ?? {};
}

function stringsAt(value: Json | undefined, key: string): string[] {
  const found = value?.[key];

  return Array.isArray(found) ? found.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** `externalDependencies` of `project:target[:configuration,…]`: the target's options, then each named configuration over them. */
function externalsOf(buildTarget: unknown, workspace: Workspace): readonly string[] {
  if (typeof buildTarget !== 'string') {
    return [];
  }

  const [projectName, targetName = '', configurationNames = ''] = buildTarget.split(':');
  const target = recordAt(targetsOf(workspace.projects.get(projectName)), targetName);
  const configurations = recordAt(target, 'configurations');

  return [recordAt(target, 'options'), ...configurationNames.split(',').map((name) => recordAt(configurations, name.trim()))].reduce<
    readonly string[]
  >(
    (externals, block) => (block !== undefined && 'externalDependencies' in block ? stringsAt(block, 'externalDependencies') : externals),
    [],
  );
}

/** The last block that sets `key`, or `fallback`. */
function lastSet(blocks: readonly (Json | undefined)[], key: string, fallback: unknown): unknown {
  return blocks.reduce<unknown>((value, block) => (block !== undefined && key in block ? block[key] : value), fallback);
}

/** The run of the target's options, and of each configuration that overrides its runner config or build target. */
function targetRuns(target: Json, name: string, projectRoot: string, workspace: Workspace): readonly BuilderRun[] {
  const byName = recordAt(workspace.defaults, name);
  const builder = target['builder'] ?? target['executor'] ?? byName?.['executor'];

  if (typeof builder !== 'string' || !UNIT_TEST_BUILDERS.has(builder)) {
    return [];
  }

  const blocks = [recordAt(recordAt(workspace.defaults, builder), 'options'), recordAt(byName, 'options'), recordAt(target, 'options')];
  const overrides = Object.values(recordAt(target, 'configurations') ?? {})
    .filter(isJson)
    .filter((configuration) => 'runnerConfig' in configuration || 'buildTarget' in configuration);

  return [blocks, ...overrides.map((configuration) => [...blocks, configuration])].map((chain) => ({
    config: configOf(lastSet(chain, 'runnerConfig', false), projectRoot, workspace.root),
    externals: externalsOf(lastSet(chain, 'buildTarget', undefined), workspace),
  }));
}

function projectRuns(project: Json, projectRoot: string, workspace: Workspace): readonly BuilderRun[] {
  return Object.entries(targetsOf(project)).flatMap(([name, target]) =>
    isJson(target) ? targetRuns(target, name, projectRoot, workspace) : [],
  );
}

/** Walk up to the workspace root, noting the nearest `project.json` on the way. */
function locate(directory: string): { projectDir: string | undefined; workspaceRoot: string | undefined } {
  let projectDir: string | undefined;

  for (let current = directory; ; current = dirname(current)) {
    if (projectDir === undefined && existsSync(join(current, 'project.json'))) {
      projectDir = current;
    }

    if ([...WORKSPACE_FILES, 'nx.json'].some((name) => existsSync(join(current, name)))) {
      return { projectDir, workspaceRoot: current };
    }

    if (dirname(current) === current) {
      return { projectDir, workspaceRoot: undefined };
    }
  }
}

function runsFor(directory: string): readonly BuilderRun[] {
  const { projectDir, workspaceRoot = projectDir } = locate(directory);

  if (workspaceRoot === undefined) {
    return [];
  }

  const projects = WORKSPACE_FILES.map((name) => recordAt(readJson(join(workspaceRoot, name)), 'projects')).find(
    (found) => found !== undefined,
  );
  const ownProject = projectDir === undefined ? undefined : (readJson(join(projectDir, 'project.json')) ?? {});
  const byName = new Map(Object.entries(projects ?? {}).filter((entry): entry is [string, Json] => isJson(entry[1])));

  if (ownProject !== undefined && typeof ownProject['name'] === 'string' && !byName.has(ownProject['name'])) {
    byName.set(ownProject['name'], ownProject);
  }

  const workspace: Workspace = {
    root: workspaceRoot,
    defaults: recordAt(readJson(join(workspaceRoot, 'nx.json')), 'targetDefaults'),
    projects: byName,
  };
  const fromWorkspace = Object.values(projects ?? {})
    .filter(isJson)
    .flatMap((project) => {
      const root = resolve(workspaceRoot, typeof project['root'] === 'string' ? project['root'] : '');

      return contains(root, directory) ? projectRuns(project, root, workspace) : [];
    });
  const fromProject = projectDir === undefined || ownProject === undefined ? [] : projectRuns(ownProject, projectDir, workspace);

  return [...fromWorkspace, ...fromProject];
}

/** Every unit-test builder run serving this file; empty where no such target serves it. */
export function builderRuns(filename: string): readonly BuilderRun[] {
  const directory = resolve(dirname(filename));
  const cached = runsCache.get(directory);

  if (cached !== undefined) {
    return cached;
  }

  const runs = runsFor(directory);

  runsCache.set(directory, runs);

  return runs;
}

/** The runner config every unit-test builder run serving this file reads; empty where no such target serves it. */
export function builderConfigs(filename: string): BuilderConfigs {
  return builderRuns(filename).map((run) => run.config);
}
