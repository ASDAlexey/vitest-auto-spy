/**
 * What the consuming repository actually is — the reason a CLI beats the paste-able snippet in the
 * README. The snippet has to state every runner and every adapter, and half of it is false for any
 * given repository; `init` reads `package.json` and the test config and writes only the true half.
 */
import { join } from 'node:path';

import { captures, listRepositoryFiles, parseJsonc, pathExists, readTextFile } from './fs-scan';

export type Framework = 'angular' | 'nestjs' | 'none' | 'react' | 'svelte' | 'vue';
export type Runner = 'bun' | 'node' | 'vitest';

export interface Profile {
  readonly cwd: string;
  readonly runner: Runner;
  readonly framework: Framework;
  /** The import specifier a spec in this repository should use. */
  readonly entry: string;
  readonly hasRxjs: boolean;
  readonly hasAngular: boolean;
  /** Test setup files declared by the runner config, repository-relative. */
  readonly setupFiles: readonly string[];
  readonly dependencies: Readonly<Record<string, string>>;
  readonly scripts: Readonly<Record<string, string>>;
  /** Every file in the repository, POSIX-relative — scanned once and shared by every check. */
  readonly files: readonly string[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  const result: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      result[key] = entry;
    }
  }

  return result;
}

function readPackageJson(cwd: string): Record<string, unknown> {
  const text = readTextFile(join(cwd, 'package.json'));

  if (text === undefined) {
    return {};
  }

  const parsed = parseJsonc(text);

  return isRecord(parsed) ? parsed : {};
}

const BUN_TEST = /\bbun\s+test\b/;
const NODE_TEST = /\bnode\s+(?:--test|--experimental-test-runner)\b/;
const VITEST = /\bvitest\b/;

function runnerFromScript(script: string): Runner | undefined {
  if (BUN_TEST.test(script)) {
    return 'bun';
  }

  if (NODE_TEST.test(script)) {
    return 'node';
  }

  return VITEST.test(script) ? 'vitest' : undefined;
}

/**
 * The `test` script wins, then any other script, then the dependencies. Order matters in a
 * repository that runs more than one runner — this package's own does — and the entry point the
 * block recommends is decided by it.
 */
function detectRunner(dependencies: Record<string, string>, scripts: Record<string, string>): Runner {
  const fromPrimary = runnerFromScript(scripts['test'] ?? '');

  if (fromPrimary !== undefined) {
    return fromPrimary;
  }

  const fromAny = runnerFromScript(Object.values(scripts).join(' '));

  if (fromAny !== undefined) {
    return fromAny;
  }

  if (dependencies['vitest'] !== undefined) {
    return 'vitest';
  }

  return dependencies['@types/bun'] === undefined && dependencies['bun-types'] === undefined ? 'vitest' : 'bun';
}

const FRAMEWORK_BY_PACKAGE: readonly (readonly [string, Framework])[] = [
  ['@angular/core', 'angular'],
  ['@nestjs/core', 'nestjs'],
  ['svelte', 'svelte'],
  ['vue', 'vue'],
  ['react', 'react'],
];

function detectFramework(dependencies: Record<string, string>): Framework {
  for (const [packageName, framework] of FRAMEWORK_BY_PACKAGE) {
    if (dependencies[packageName] !== undefined) {
      return framework;
    }
  }

  return 'none';
}

const ENTRY_BY_FRAMEWORK: Record<Framework, string> = {
  angular: 'vitest-auto-spy/angular',
  nestjs: 'vitest-auto-spy/nestjs',
  react: 'vitest-auto-spy/react',
  svelte: 'vitest-auto-spy/svelte',
  vue: 'vitest-auto-spy/vue',
  none: 'vitest-auto-spy',
};

/**
 * The runner wins over the framework: importing the wrong entry leaves the wrong mock adapter
 * registered, and that is the failure the whole entry-point table exists to prevent.
 */
export function resolveEntry(runner: Runner, framework: Framework): string {
  if (runner === 'bun') {
    return framework === 'angular' ? 'vitest-auto-spy/bun-angular' : 'vitest-auto-spy/bun';
  }

  if (runner === 'node') {
    return 'vitest-auto-spy/node';
  }

  return ENTRY_BY_FRAMEWORK[framework];
}

/** Config files whose `setupFiles` decide where `import 'vitest-auto-spy/rxjs'` has to go. */
const CONFIG_CANDIDATES = [
  'vitest.config.ts',
  'vitest.config.mts',
  'vitest.config.js',
  'vitest.config.mjs',
  'vite.config.ts',
  'vite.config.mts',
  'vite.config.js',
  'vite.config.mjs',
  'bunfig.toml',
];

const SETUP_FILE_FALLBACKS = ['src/test-setup.ts', 'src/vitest.setup.ts', 'src/setup-tests.ts', 'vitest.setup.ts', 'test/setup.ts'];

/**
 * Lexical, on purpose: the config is a TypeScript module that may compute its own value, and
 * evaluating a consumer's config to find a filename is far more than this is worth. A quoted path
 * inside a `setupFiles` array covers every config anybody actually writes.
 */
export function extractSetupFiles(configText: string): string[] {
  const block = /setup[Ff]iles\s*:\s*(\[[^\]]*]|["'`][^"'`]*["'`])/.exec(configText);

  if (block === null) {
    return [];
  }

  return captures(block[0], /["'`]([^"'`]+)["'`]/g);
}

function detectSetupFiles(cwd: string): string[] {
  for (const candidate of CONFIG_CANDIDATES) {
    const text = readTextFile(join(cwd, candidate));

    if (text === undefined) {
      continue;
    }

    const declared = extractSetupFiles(text);

    if (declared.length > 0) {
      return declared.map((entry) => entry.replace(/^\.\//, ''));
    }
  }

  return SETUP_FILE_FALLBACKS.filter((candidate) => pathExists(join(cwd, candidate)));
}

export function readProfile(cwd: string): Profile {
  const packageJson = readPackageJson(cwd);
  const dependencies = {
    ...stringMap(packageJson['peerDependencies']),
    ...stringMap(packageJson['devDependencies']),
    ...stringMap(packageJson['dependencies']),
  };
  const scripts = stringMap(packageJson['scripts']);
  const runner = detectRunner(dependencies, scripts);
  const framework = detectFramework(dependencies);

  return {
    cwd,
    runner,
    framework,
    entry: resolveEntry(runner, framework),
    hasRxjs: dependencies['rxjs'] !== undefined,
    hasAngular: dependencies['@angular/core'] !== undefined,
    setupFiles: detectSetupFiles(cwd),
    dependencies,
    scripts,
    files: listRepositoryFiles(cwd),
  };
}
