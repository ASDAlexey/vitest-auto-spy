/**
 * A build tsconfig that compiles the test data next to the specs into the package.
 *
 * `no-inline-test-data` sends long and repeated literals to a `*.mock.ts` beside the spec, under
 * `src/`. A library config generated to leave the tests out excludes `*.spec.ts` and nothing else,
 * so `tsc` (or a declaration plugin) emits every mock file into the published output.
 *
 * A config counts as a build config when its `exclude` names spec files: it was written to ship the
 * code without the tests. An app config is left alone, because a bundler ships only what the entry
 * imports, and so is a config beside `ng-package.json`: ng-packagr builds from the entry file.
 */
import { join, posix } from 'node:path';

import { parseJsonc, pathExists, readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import { isRecord } from '../profile';
import type { Finding } from '../report';
import { expandInclude, globToRegExp } from './tsconfig-globs';

/** The files `no-inline-test-data` treats as test data, the same expression the rule uses. */
const MOCK_FILE = /(?:^|\/)__mocks__\/|\.(?:fixtures?|mocks?)\.[cm]?[jt]sx?$/;
const TSCONFIG_NAME = /(?:^|\/)tsconfig[^/]*\.json$/;
const NOT_A_BUILD = /(?:^|[.-])(?:app|spec|test|tests|e2e|cypress|playwright|storybook)(?=[.-])/;
/** A glob for spec files, not one named file: `src/type-tests/x.test-d.ts` is excluded for other reasons. */
const SPEC_GLOB = /\*.*\.(?:spec|test)\.(?:[cm]?[jt]sx?|\*)$|(?:^|\/)__tests__(?:\/|$)/;
const MAX_EXTENDS = 5;
const LISTED = 3;

interface Patterns {
  readonly include: readonly string[] | undefined;
  readonly exclude: readonly string[] | undefined;
}

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : undefined;
}

function readConfig(profile: Profile, path: string): Record<string, unknown> | undefined {
  const parsed = parseJsonc(readTextFile(join(profile.cwd, path)) ?? '');

  return isRecord(parsed) ? parsed : undefined;
}

/** The configs a config extends by a relative path, repository-relative. */
function parentsOf(path: string, config: Record<string, unknown> | undefined): string[] {
  return [config?.['extends']]
    .flat()
    .filter((entry): entry is string => typeof entry === 'string' && entry.startsWith('.'))
    .map((parent) => posix.normalize(posix.join(posix.dirname(path), parent.endsWith('.json') ? parent : `${parent}.json`)));
}

/** `include` and `exclude` resolved against the config that wrote them, inherited through relative `extends`. */
function patternsOf(profile: Profile, path: string, config: Record<string, unknown> | undefined, depth = 0): Patterns {
  const resolve = (entries: string[] | undefined): string[] | undefined =>
    entries?.map((entry) => posix.normalize(posix.join(posix.dirname(path), entry)).replace(/^\.\//, ''));
  const own: Patterns = {
    include: resolve(stringList(config?.['include']) ?? (Array.isArray(config?.['files']) ? [] : undefined)),
    exclude: resolve(stringList(config?.['exclude'])),
  };

  return parentsOf(path, config).reduce<Patterns>((patterns, parent) => {
    if (depth >= MAX_EXTENDS || !pathExists(join(profile.cwd, parent))) {
      return patterns;
    }

    const inherited = patternsOf(profile, parent, readConfig(profile, parent), depth + 1);

    return { include: patterns.include ?? inherited.include, exclude: patterns.exclude ?? inherited.exclude };
  }, own);
}

function matcher(patterns: readonly string[], expand: (pattern: string) => string[]): (file: string) => boolean {
  const expressions = patterns.flatMap(expand).map(globToRegExp);

  return (file) => expressions.some((expression) => expression.test(file));
}

/** The glob that leaves one kind of test data out: `**` + `/*.mock.ts`, or a whole `__mocks__` directory. */
function excludeGlob(file: string): string {
  const suffix = /\.(?:fixtures?|mocks?)\.[cm]?[jt]sx?$/.exec(file)?.[0];

  return suffix === undefined ? '**/__mocks__/**' : `**/*${suffix}`;
}

function checkConfig(
  profile: Profile,
  path: string,
  own: Record<string, unknown> | undefined,
  mocks: readonly string[],
): Finding | undefined {
  const directory = posix.dirname(path);
  const compilerOptions: unknown = own?.['compilerOptions'];

  if (
    NOT_A_BUILD.test(posix.basename(path)) ||
    (isRecord(compilerOptions) && compilerOptions['noEmit'] === true) ||
    pathExists(join(profile.cwd, directory, 'ng-package.json'))
  ) {
    return undefined;
  }

  const { include, exclude = [] } = patternsOf(profile, path, own);

  if (!exclude.some((pattern) => SPEC_GLOB.test(pattern))) {
    return undefined;
  }

  const prefix = directory === '.' ? '' : `${directory}/`;
  const included = matcher(include ?? [`${prefix}**/*`], expandInclude);
  const excluded = matcher(exclude, (pattern) => [pattern, `${pattern}/**/*`]);
  const shipped = mocks.filter((file) => file.startsWith(prefix) && included(file) && !excluded(file));

  if (shipped.length === 0) {
    return undefined;
  }

  const globs = [...new Set(shipped.map(excludeGlob))];
  const more = shipped.length > LISTED ? ` and ${shipped.length - LISTED} more` : '';

  return {
    check: 'tsconfig-ships-mock-file',
    severity: 'warning',
    file: path,
    message: `This build config leaves the specs out but compiles their test data into the output: ${shipped.slice(0, LISTED).join(', ')}${more} ${shipped.length === 1 ? 'ships' : 'ship'} with the package.`,
    fix: `Exclude the test data beside the specs: \`"exclude": [${globs.map((glob) => JSON.stringify(glob)).join(', ')}]\`, next to the spec patterns already there.`,
  };
}

export function checkTsconfigMockFiles(profile: Profile): Finding[] {
  const mocks = profile.files.filter((file) => MOCK_FILE.test(file));

  if (mocks.length === 0) {
    return [];
  }

  const configs = profile.files.filter((file) => TSCONFIG_NAME.test(file)).map((path) => [path, readConfig(profile, path)] as const);
  // A config another one extends is a base to build on, not a build of its own.
  const extended = new Set(configs.flatMap(([path, config]) => parentsOf(path, config)));

  return configs.flatMap(([path, config]) => (extended.has(path) ? [] : (checkConfig(profile, path, config, mocks) ?? [])));
}
