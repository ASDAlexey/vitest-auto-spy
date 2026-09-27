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

/** One answer per directory for the length of the lint run. */
const runsCache = new Map<string, BuilderConfigs>();

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

/** The runner config of the target's options, and of each configuration that overrides it. */
function targetConfigs(target: Json, name: string, defaults: Json | undefined, projectRoot: string, workspaceRoot: string): BuilderConfigs {
  const byName = recordAt(defaults, name);
  const builder = target['builder'] ?? target['executor'] ?? byName?.['executor'];

  if (typeof builder !== 'string' || !UNIT_TEST_BUILDERS.has(builder)) {
    return [];
  }

  const blocks = [recordAt(recordAt(defaults, builder), 'options'), recordAt(byName, 'options'), recordAt(target, 'options')];
  const base = blocks.reduce<unknown>(
    (value, block) => (block !== undefined && 'runnerConfig' in block ? block['runnerConfig'] : value),
    false,
  );
  const overrides = Object.values(recordAt(target, 'configurations') ?? {})
    .filter(isJson)
    .filter((configuration) => 'runnerConfig' in configuration)
    .map((configuration) => configuration['runnerConfig']);

  return [base, ...overrides].map((value) => configOf(value, projectRoot, workspaceRoot));
}

function projectConfigs(project: Json, defaults: Json | undefined, projectRoot: string, workspaceRoot: string): BuilderConfigs {
  const targets = recordAt(project, 'architect') ?? recordAt(project, 'targets') ?? {};

  return Object.entries(targets).flatMap(([name, target]) =>
    isJson(target) ? targetConfigs(target, name, defaults, projectRoot, workspaceRoot) : [],
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

function runsFor(directory: string): BuilderConfigs {
  const { projectDir, workspaceRoot = projectDir } = locate(directory);

  if (workspaceRoot === undefined) {
    return [];
  }

  const defaults = recordAt(readJson(join(workspaceRoot, 'nx.json')), 'targetDefaults');
  const projects = WORKSPACE_FILES.map((name) => recordAt(readJson(join(workspaceRoot, name)), 'projects')).find(
    (found) => found !== undefined,
  );
  const fromWorkspace = Object.values(projects ?? {})
    .filter(isJson)
    .flatMap((project) => {
      const root = resolve(workspaceRoot, typeof project['root'] === 'string' ? project['root'] : '');

      return contains(root, directory) ? projectConfigs(project, defaults, root, workspaceRoot) : [];
    });
  const fromProject =
    projectDir === undefined ? [] : projectConfigs(readJson(join(projectDir, 'project.json')) ?? {}, defaults, projectDir, workspaceRoot);

  return [...fromWorkspace, ...fromProject];
}

/** The runner config every unit-test builder run serving this file reads; empty where no such target serves it. */
export function builderConfigs(filename: string): BuilderConfigs {
  const directory = resolve(dirname(filename));
  const cached = runsCache.get(directory);

  if (cached !== undefined) {
    return cached;
  }

  const runs = runsFor(directory);

  runsCache.set(directory, runs);

  return runs;
}
