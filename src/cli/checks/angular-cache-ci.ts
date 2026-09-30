/**
 * The Angular CLI's persistent build cache, which a CI run of `@angular/build:unit-test` never gets.
 *
 * `cli.cache.environment` defaults to `local`: the cache is on at a desk and off wherever `CI` is set.
 * Measured on a 700-file suite, the cold compile costs +2.91 s (+33 %) per CI run. Turning the cache
 * on only pays when CI also keeps its directory between runs, so both halves are checked — the second
 * only when the jobs are in the repository, not included from a shared pipelines project.
 */
import { join } from 'node:path';

import { parseJsonc, readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import { isRecord } from '../profile';
import type { Finding } from '../report';
import { unitTestTargets } from './unit-test-targets';
import { ciConfigs } from './vitest-5-facts';
import { ciJobsElsewhere, persistedInCi } from './vitest-5-upgrade';

const DEFAULT_CACHE_PATH = '.angular/cache';
const MEASURED = 'On a 700-file suite a cold cache cost +2.91 s (+33 %) per run.';

interface CacheSettings {
  readonly enabled: boolean;
  /** `undefined` when angular.json leaves it to the default, `local`. */
  readonly environment: string | undefined;
  readonly path: string;
}

function cacheSettings(profile: Profile): CacheSettings | undefined {
  const workspace = parseJsonc(readTextFile(join(profile.cwd, 'angular.json')) ?? '');

  if (!isRecord(workspace)) {
    return undefined;
  }

  const cli = isRecord(workspace['cli']) ? workspace['cli'] : {};
  const cache = isRecord(cli['cache']) ? cli['cache'] : {};

  return {
    enabled: cache['enabled'] !== false,
    environment: typeof cache['environment'] === 'string' ? cache['environment'] : undefined,
    path: typeof cache['path'] === 'string' ? cache['path'].replace(/^\.\//, '').replace(/\/$/, '') : DEFAULT_CACHE_PATH,
  };
}

export function checkAngularCacheInCi(profile: Profile): Finding[] {
  const settings = cacheSettings(profile);
  const ci = ciConfigs(profile);

  if (settings?.enabled !== true || ci.length === 0 || !unitTestTargets(profile).some((target) => target.file === 'angular.json')) {
    return [];
  }

  if (settings.environment === undefined || settings.environment === 'local') {
    return [
      {
        check: 'angular-cache-off-in-ci',
        severity: 'info',
        file: 'angular.json',
        message: `The Angular build cache is off in CI: \`cli.cache.environment\` is \`local\`${settings.environment === undefined ? ' (the default)' : ''}, so every CI run of the unit-test builder compiles the whole suite cold. ${MEASURED}`,
        fix: `Set \`"cli": { "cache": { "environment": "all" } }\` in angular.json, and persist \`${settings.path}\` between CI runs with a key on the lockfile hash.`,
      },
    ];
  }

  if (settings.environment === 'none' || persistedInCi(ci, settings.path) || ciJobsElsewhere(ci)) {
    return [];
  }

  return [
    {
      check: 'angular-cache-off-in-ci',
      severity: 'info',
      file: 'angular.json',
      message: `The Angular build cache is on in CI (\`cli.cache.environment: ${settings.environment}\`), and no CI config (${ci.map(({ file }) => file).join(', ')}) keeps \`${settings.path}\`: every run starts it empty, so CI pays the cold compile anyway. ${MEASURED}`,
      fix: `Persist \`${settings.path}\` between CI runs — for GitHub Actions an \`actions/cache\` step with that path and a key on the lockfile hash.`,
    },
  ];
}
