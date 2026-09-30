import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import type { Finding } from '../report';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { checkAngularCacheInCi } from './angular-cache-ci';

afterEach(() => {
  removeTempRepos();
});

const workflow = (extra = ''): Record<string, string> => ({
  '.github/workflows/ci.yml': `jobs:\n  test:\n    steps:\n      - run: npx ng test\n${extra}`,
});

const workspace = (cli?: object): string =>
  JSON.stringify({
    ...(cli === undefined ? {} : { cli }),
    projects: { app: { root: '', architect: { test: { builder: '@angular/build:unit-test' } } } },
  });

const findingsIn = (files: Record<string, string>): Finding[] =>
  checkAngularCacheInCi(readProfile(createTempRepo({ 'package.json': '{}', ...files })));

describe('checkAngularCacheInCi', () => {
  it('reports the default local-only cache in a workspace whose tests run in CI', () => {
    const [finding] = findingsIn({ 'angular.json': workspace(), ...workflow() });

    expect(finding).toMatchObject({ check: 'angular-cache-off-in-ci', severity: 'info', file: 'angular.json' });
    expect(finding?.message).toContain('`cli.cache.environment` is `local` (the default)');
    expect(finding?.message).toContain('+2.91 s (+33 %)');
    expect(finding?.fix).toContain('persist `.angular/cache`');
  });

  it('says local without "the default" when angular.json spells it out, and names a custom cache path', () => {
    const [finding] = findingsIn({ 'angular.json': workspace({ cache: { environment: 'local', path: './.cache/ng/' } }), ...workflow() });

    expect(finding?.message).toContain('is `local`, so');
    expect(finding?.fix).toContain('persist `.cache/ng`');
  });

  it('reports a cache on in CI that no CI config keeps, and not one that is kept', () => {
    const on = workspace({ cache: { environment: 'all' } });
    const [lost] = findingsIn({ 'angular.json': on, ...workflow() });

    expect(lost?.message).toContain('`cli.cache.environment: all`');
    expect(lost?.message).toContain('.github/workflows/ci.yml');
    expect(
      findingsIn({ 'angular.json': on, ...workflow('      - uses: actions/cache@v4\n        with:\n          path: .angular/cache\n') }),
    ).toEqual([]);
  });

  it('does not judge persistence when every CI job is included from outside the repository', () => {
    const on = workspace({ cache: { environment: 'all' } });
    const gitlab = (text: string): Record<string, string> => ({ 'angular.json': on, '.gitlab-ci.yml': text });

    expect(findingsIn(gitlab("include:\n  - project: 'group/pipelines'\n    file: '/angular.yml'\n"))).toEqual([]);
    expect(findingsIn(gitlab("variables:\n  NODE: '24'\ninclude:\n  - remote: 'https://example.com/ci.yml'\n"))).toEqual([]);
    expect(findingsIn(gitlab('include:\n  - component: $CI_SERVER_FQDN/group/angular@1\n'))).toEqual([]);
    expect(findingsIn(gitlab("include:\n  - local: '/ci/test.yml'\n"))).toHaveLength(1);
    expect(findingsIn(gitlab("include:\n  - project: 'group/pipelines'\ntest:\n  script: npx ng test\n"))).toHaveLength(1);
    expect(findingsIn({ 'angular.json': workspace(), '.gitlab-ci.yml': "include:\n  - project: 'group/pipelines'\n" })).toHaveLength(1);
  });

  it('stays out of a workspace that turned the cache off, has no CI, or does not test through the builder', () => {
    expect(findingsIn({ 'angular.json': workspace({ cache: { enabled: false } }), ...workflow() })).toEqual([]);
    expect(findingsIn({ 'angular.json': workspace({ cache: { environment: 'none' } }), ...workflow() })).toEqual([]);
    expect(findingsIn({ 'angular.json': workspace() })).toEqual([]);
    expect(findingsIn({ 'angular.json': JSON.stringify({ cli: 'x', projects: {} }), ...workflow() })).toEqual([]);
    expect(findingsIn({ 'angular.json': '[]', ...workflow() })).toEqual([]);
    expect(findingsIn(workflow())).toEqual([]);
    expect(findingsIn({ 'angular.json': JSON.stringify({ cli: { cache: 'x' }, projects: {} }), ...workflow() })).toEqual([]);
  });
});
