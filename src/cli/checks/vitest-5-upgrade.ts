/**
 * Two things about Vitest 5 that only the repository around the suite can answer: whether the
 * upgrade is open to it, and whether the module cache it turns on survives a CI run.
 */
import { join } from 'node:path';

import { compareVersions } from '../../lib/angular-build-notice';
import { VITEST_5_PERF_DOCS } from '../docs';
import { parseJsonc, readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import { isRecord } from '../profile';
import type { Finding } from '../report';
import type { SourceGraph } from './graph';
import { unitTestTargets } from './unit-test-targets';
import {
  type TextFile,
  ciConfigs,
  declaredVitestMajor,
  installedVersionOf,
  isBelow,
  isKey,
  isTrue,
  passesFlag,
  runnerConfigKeys,
  stringValue,
  vitestScripts,
} from './vitest-5-facts';

/** The first `@angular/build` whose unit-test builder runs Vitest 5. */
const BUILDER_FLOOR = [22, 2, 0];
const ANALOG_FLOOR = [2, 7, 5];
const NODE_FLOOR = [22, 12, 0];
const VITE_FLOOR = [6, 4, 0];

const ANALOG_PACKAGES = ['@analogjs/vite-plugin-angular', '@analogjs/vitest-angular'];

const VERSION_TOKEN = /\bv?(\d+)(?:\.(\d+|x))?(?:\.(\d+|x))?/g;

/** The lowest version a range or a list of versions admits, read as its smallest number. */
export function lowestVersion(text: string): number[] | undefined {
  const versions = [...text.matchAll(VERSION_TOKEN)].map((match) => [1, 2, 3].map((group) => Number(match[group]) || 0));

  return versions.sort(compareVersions)[0];
}

const NODE_IN_CI = /^\s*(?:-\s*)?node-version\s*:\s*([^\n#]+)|\bimage\s*:\s*["']?(?:[\w.-]+\/)*node:([\d.x]+)/gm;

interface NodeFloor {
  readonly file: string;
  readonly version: string;
}

function nodeFloors(profile: Profile, ci: readonly TextFile[]): NodeFloor[] {
  const manifest = parseJsonc(readTextFile(join(profile.cwd, 'package.json')) ?? '');
  // A published package's `engines` speaks for its consumers; only an application's is where its tests run.
  const engines =
    isRecord(manifest) && manifest['private'] === true && isRecord(manifest['engines']) ? manifest['engines']['node'] : undefined;
  const declared: NodeFloor[] = typeof engines === 'string' ? [{ file: 'package.json', version: engines }] : [];

  for (const file of ['.nvmrc', '.node-version']) {
    const text = readTextFile(join(profile.cwd, file));

    if (text !== undefined) {
      declared.push({ file, version: text.trim() });
    }
  }

  for (const { file, text } of ci) {
    for (const match of text.matchAll(NODE_IN_CI)) {
      declared.push({ file, version: String(match[1] ?? match[2]).trim() });
    }
  }

  return declared.filter(({ version }) => {
    const lowest = lowestVersion(version);

    return lowest !== undefined && compareVersions(lowest, NODE_FLOOR) < 0;
  });
}

interface Blocker {
  readonly what: string;
  readonly fix: string;
}

function blockers(profile: Profile, ci: readonly TextFile[]): Blocker[] {
  const found: Blocker[] = [];
  const builder = installedVersionOf(profile.cwd, '@angular/build');

  if (unitTestTargets(profile).length > 0 && isBelow(builder, BUILDER_FLOOR)) {
    found.push({
      what: `@angular/build ${String(builder)}, whose \`@angular/build:unit-test\` does not run Vitest 5`,
      fix: 'Upgrade @angular/build to 22.2.0 or newer, the first release whose unit-test builder runs Vitest 5.',
    });
  }

  for (const name of ANALOG_PACKAGES) {
    const version = installedVersionOf(profile.cwd, name);

    if (isBelow(version, ANALOG_FLOOR)) {
      found.push({ what: `${name} ${String(version)}`, fix: `Upgrade ${name} to 2.7.5 or newer.` });
    }
  }

  const vite = installedVersionOf(profile.cwd, 'vite');

  if (isBelow(vite, VITE_FLOOR)) {
    found.push({ what: `vite ${String(vite)}`, fix: 'Upgrade vite to 6.4 or newer, the floor Vitest 5 requires.' });
  }

  for (const { file, version } of nodeFloors(profile, ci)) {
    found.push({
      what: `Node \`${version}\` in ${file}`,
      fix: `Raise the Node version in ${file} to 22.12 or newer, the floor Vitest 5 requires.`,
    });
  }

  return found;
}

const MEASURED =
  'On an Angular 22.2 suite of 700 spec files with coverage, Vitest 5 took the run from 16.50 s to 8.91 s with v8 (−46 %) and from 37.07 s to 23.92 s with istanbul (−35.5 %); without coverage the two majors are level.';

/** Vitest 4 only: from 2 or 3 the way to 5 goes through Vitest 4's own migration, and the numbers are 4 against 5. */
export function checkVitest5Available(profile: Profile): Finding[] {
  if (declaredVitestMajor(profile) !== 4) {
    return [];
  }

  const version = String(installedVersionOf(profile.cwd, 'vitest'));
  const holding = blockers(profile, ciConfigs(profile));

  if (holding.length === 0) {
    return [
      {
        check: 'vitest-5-available',
        severity: 'info',
        message: `Vitest ${version} is installed, and nothing in this repository holds back Vitest 5. ${MEASURED}`,
        fix: `Upgrade \`vitest\` and every \`@vitest/*\` package to 5 together, then read \`vitest-5-clear-mocks\`: Vitest 5 clears mocks before each test by default. The measurement: ${VITEST_5_PERF_DOCS}`,
      },
    ];
  }

  return [
    {
      check: 'vitest-5-available',
      severity: 'info',
      message: `Vitest 5 is out, and this repository cannot take it yet: ${holding.map((blocker) => blocker.what).join('; ')}.`,
      fix: `${holding.map((blocker) => blocker.fix).join(' ')} ${MEASURED} ${VITEST_5_PERF_DOCS}`,
    },
  ];
}

/** Vitest 4 calls it experimental and keeps it elsewhere; Vitest 5 promoted it and renamed the directory. */
const EXPERIMENTAL_CACHE_PATH = 'node_modules/.experimental-vitest-cache';
const CACHE_PATH = 'node_modules/.vitest-cache';

const escapeRegExp = (text: string): string => text.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');

/** Whether a CI config names the directory, or one above it, as a path token. */
export function cachesPath(text: string, path: string): boolean {
  const segments = path.replace(/^\.\//, '').split('/');
  const covering = segments.map((_, index) => segments.slice(0, index + 1).join('/'));

  return [...covering, `**/${String(segments.at(-1))}`].some((candidate) =>
    new RegExp(`(?:^|[\\s'"[,=])(?:\\./|\\*\\*/)?${escapeRegExp(candidate)}/?(?:\\*\\*)?(?=$|[\\s'",\\]])`, 'm').test(text),
  );
}

interface CacheSetting {
  readonly file: string;
  readonly path: string;
}

function moduleCacheSetting(profile: Profile, graph: SourceGraph, major: number): CacheSetting | undefined {
  const keys = runnerConfigKeys(graph);
  const enabled = keys.find((key) => isKey(key, 'fsModuleCache') && isTrue(key));
  const byScript = vitestScripts(profile).some(
    ([, script]) => passesFlag(script, 'fsModuleCache') || passesFlag(script, 'experimental.fsModuleCache'),
  );

  if (enabled === undefined && !byScript) {
    return undefined;
  }

  const configured = keys.filter((key) => isKey(key, 'fsModuleCachePath')).map(stringValue)[0];
  return { file: enabled?.file ?? 'package.json', path: configured ?? (major >= 5 ? CACHE_PATH : EXPERIMENTAL_CACHE_PATH) };
}

export function checkModuleCachePersisted(profile: Profile, graph: SourceGraph): Finding[] {
  const major = declaredVitestMajor(profile);
  const ci = ciConfigs(profile);

  if (major === undefined || major < 4 || ci.length === 0) {
    return [];
  }

  const setting = moduleCacheSetting(profile, graph, major);

  if (setting === undefined || ci.some(({ text }) => cachesPath(text, setting.path))) {
    return [];
  }

  const files = ci.map(({ file }) => file).join(', ');

  return [
    {
      check: 'fs-module-cache-not-persisted',
      severity: 'warning',
      file: setting.file,
      message: `\`fsModuleCache\` is on, and no CI config caches \`${setting.path}\`: every CI run (${files}) starts with an empty module cache and pays the full transform, so the cache only ever helps locally.`,
      fix: `Persist \`${setting.path}\` between CI runs — for GitHub Actions an \`actions/cache\` step with that path and a key on the lockfile hash (\`cache: npm\` in \`setup-node\` stores only the npm download cache). \`npm ci\` deletes \`node_modules\` before it installs, so with it set \`fsModuleCachePath\` to a directory outside \`node_modules\` and cache that one.`,
    },
  ];
}
