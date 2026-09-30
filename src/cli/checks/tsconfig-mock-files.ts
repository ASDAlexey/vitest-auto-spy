/**
 * A build tsconfig that compiles the test data next to the specs into the package.
 *
 * `no-inline-test-data` sends long and repeated literals to a `*.mock.ts` beside the spec, under
 * `src/`. A library config generated to leave the tests out excludes `*.spec.ts` and nothing else,
 * so `tsc` (or a declaration plugin) emits every mock file into the published output.
 *
 * A config counts as a build config when its `exclude` names spec files: it was written to ship the
 * code without the tests. A `tsconfig.lib.json` or `tsconfig.build.json` with no `exclude` at all is
 * one too, and ships the specs as well. An app config is left alone, because a bundler ships only what the entry
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
const SPEC_FILE = /(?:^|\/)__tests__\/|\.(?:spec|test)\.[cm]?[jt]sx?$/;
const BUILD_NAME = /(?:^|[.-])(?:lib|build)(?=[.-])/;
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

/** The literal directories a pattern starts with, relative to the config: `src/` for `src/**` + `/*.spec.ts`. */
function literalPrefix(pattern: string, directory: string): string {
  const segments = pattern.split('/').filter((segment) => segment !== '');
  const wildcard = segments.findIndex((segment) => /[*?]/.test(segment));
  const literal =
    wildcard === -1
      ? segments.filter((segment, index) => index < segments.length - 1 || !segment.includes('.'))
      : segments.slice(0, wildcard);
  const joined = literal.map((segment) => `${segment}/`).join('');

  return joined.startsWith(directory) ? joined.slice(directory.length) : '';
}

/** The glob that leaves one kind of file out, under `prefix`: `**` + `/*.mock.ts`, or a whole `__mocks__` directory. */
function excludeGlob(file: string, prefix: string): string {
  const suffix = /\.(?:fixtures?|mocks?|spec|test)\.[cm]?[jt]sx?$/.exec(file)?.[0];
  const directory = /(?:^|\/)(__mocks__|__tests__)\//.exec(file)?.[1];

  return `${prefix}**/${directory === undefined ? `*${String(suffix)}` : `${directory}/**`}`;
}

function checkConfig(
  profile: Profile,
  path: string,
  own: Record<string, unknown> | undefined,
  mocks: readonly string[],
  specs: readonly string[],
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

  const { include, exclude } = patternsOf(profile, path, own);
  const specGlob = exclude?.find((pattern) => SPEC_GLOB.test(pattern));

  if (exclude === undefined ? !BUILD_NAME.test(posix.basename(path)) : specGlob === undefined) {
    return undefined;
  }

  const prefix = directory === '.' ? '' : `${directory}/`;
  const included = matcher(include ?? [`${prefix}**/*`], expandInclude);
  const excluded = matcher(exclude ?? [], (pattern) => [pattern, `${pattern}/**/*`]);
  const shipped = [...(exclude === undefined ? specs : []), ...mocks].filter(
    (file) => file.startsWith(prefix) && included(file) && !excluded(file),
  );

  if (shipped.length === 0) {
    return undefined;
  }

  const globPrefix = literalPrefix(specGlob ?? include?.[0] ?? '', prefix);
  const globs = [...new Set(shipped.map((file) => excludeGlob(file, globPrefix)))];
  const more = shipped.length > LISTED ? ` and ${shipped.length - LISTED} more` : '';
  const listed = `${shipped.slice(0, LISTED).join(', ')}${more} ${shipped.length === 1 ? 'ships' : 'ship'} with the package`;
  const exclusion = `\`"exclude": [${globs.map((glob) => JSON.stringify(glob)).join(', ')}]\``;

  return {
    check: 'tsconfig-ships-mock-file',
    severity: 'warning',
    file: path,
    ...(exclude === undefined
      ? {
          message: `This build config has no \`exclude\`, so it compiles the specs and their test data into the output: ${listed}.`,
          fix: `Leave the tests out of the build: ${exclusion}.`,
        }
      : {
          message: `This build config leaves the specs out but compiles their test data into the output: ${listed}.`,
          fix: `Exclude the test data beside the specs: ${exclusion}, next to the spec patterns already there.`,
        }),
  };
}

export function checkTsconfigMockFiles(profile: Profile): Finding[] {
  const mocks = profile.files.filter((file) => MOCK_FILE.test(file));
  const specs = profile.files.filter((file) => SPEC_FILE.test(file) && !MOCK_FILE.test(file));

  if (mocks.length === 0 && specs.length === 0) {
    return [];
  }

  const configs = profile.files.filter((file) => TSCONFIG_NAME.test(file)).map((path) => [path, readConfig(profile, path)] as const);
  // A config another one extends is a base to build on, not a build of its own.
  const extended = new Set(configs.flatMap(([path, config]) => parentsOf(path, config)));

  return configs.flatMap(([path, config]) => (extended.has(path) ? [] : (checkConfig(profile, path, config, mocks, specs) ?? [])));
}
