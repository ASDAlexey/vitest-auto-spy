import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { pathExists } from '../fs-scan';
import type { Profile } from '../profile';
import { readProfile } from '../profile';
import type { Finding } from '../report';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { buildGraph } from './graph';
import { isInsideLiteral, literalSpans } from './literals';
import { VITEST_ENTRIES, checkVitestLessEntry } from './vitest-less-entry';

afterEach(() => {
  removeTempRepos();
});

const SRC = join(__dirname, '..', '..');
const STATIC_IMPORT = /^[ \t]*(?:import|export)\s+(?!type\b)(?:[^'";]*?\bfrom\s*)?["']([^"']+)["']/gm;

/** Whether a module's static, non-type import graph reaches `vitest`. */
function loadsVitest(file: string, seen = new Set<string>()): boolean {
  if (seen.has(file)) {
    return false;
  }

  seen.add(file);
  const text = readFileSync(file, 'utf8');
  const spans = literalSpans(text);

  return [...text.matchAll(STATIC_IMPORT)]
    .filter((match) => !isInsideLiteral(spans, match.index + match[0].indexOf(String(match[0].trim()[0]))))
    .some(([, specifier]) => {
      if (specifier === 'vitest') {
        return true;
      }

      const base = resolve(dirname(file), String(specifier)).replace(/\.js$/, '');
      const target = [`${base}.ts`, join(base, 'index.ts')].find(pathExists);

      return String(specifier).startsWith('.') && target !== undefined && loadsVitest(target, seen);
    });
}

describe('VITEST_ENTRIES', () => {
  it('is exactly the published entries whose module graph imports vitest', () => {
    const manifest = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8')) as { exports: Record<string, unknown> };
    const derived = Object.keys(manifest.exports)
      .filter((key) => key !== './package.json' && key !== './eslint-plugin')
      .map((key) => key.slice(1))
      .filter((entry) => loadsVitest(join(SRC, `${entry === '' ? 'index' : entry.slice(1).replace('/', '-')}.ts`)));

    expect(derived.sort()).toEqual([...VITEST_ENTRIES].sort());
  });
});

const repo = (runner: string | undefined, files: Record<string, string>, installed: readonly string[] = ['vitest-auto-spy']): Profile =>
  readProfile(
    createTempRepo({
      'package.json': JSON.stringify(runner === undefined ? {} : { scripts: { test: runner } }),
      ...Object.fromEntries(installed.map((name) => [`node_modules/${name}/package.json`, JSON.stringify({ version: '1.0.0' })])),
      ...files,
    }),
  );

const findingsIn = (profile: Profile): Finding[] => checkVitestLessEntry(profile, buildGraph(profile));

describe('checkVitestLessEntry', () => {
  it('reports a bun:test suite importing Vitest entries, and names the bun ones', () => {
    const findings = findingsIn(
      repo('bun test', {
        'src/a.spec.ts': "import { createSpyFromClass } from 'vitest-auto-spy';\nimport { injectSpy } from 'vitest-auto-spy/angular';",
        'src/b.spec.ts': "import { createSpyFromClass } from 'vitest-auto-spy/bun';\nconst text = \"from 'vitest-auto-spy/vue'\";",
      }),
    );

    expect(findings).toEqual([expect.objectContaining({ check: 'vitest-entry-without-vitest', severity: 'error', file: 'src/a.spec.ts' })]);
    expect(findings[0]?.message).toContain('Imports `vitest-auto-spy`, `vitest-auto-spy/angular`, which load `vitest`');
    expect(findings[0]?.fix).toBe(
      'Under bun:test, replace `vitest-auto-spy` with `vitest-auto-spy/bun`, and `vitest-auto-spy/angular` with `vitest-auto-spy/bun-angular`.',
    );
  });

  it('says which entries have no counterpart for the runner', () => {
    const [one] = findingsIn(repo('node --test', { 'src/a.test.ts': "import 'vitest-auto-spy/react';" }));
    const [both] = findingsIn(
      repo('rstest run', { 'src/a.test.ts': "import 'vitest-auto-spy';\nimport 'vitest-auto-spy/vue';\nimport 'vitest-auto-spy/setup';" }),
    );

    expect(one?.message).toContain('Imports `vitest-auto-spy/react`, which loads `vitest`');
    expect(one?.fix).toBe('`vitest-auto-spy/react` has no node:test counterpart: drop the import, or install `vitest` for it.');
    expect(both?.fix).toBe(
      'Under Rstest, replace `vitest-auto-spy` with `vitest-auto-spy/rstest`. `vitest-auto-spy/setup`, `vitest-auto-spy/vue` have no Rstest counterpart: drop the import, or install `vitest` for it.',
    );
  });

  it('tells a Vitest repository to install its runner', () => {
    const [finding] = findingsIn(repo(undefined, { 'src/a.spec.ts': "import 'vitest-auto-spy/setup';" }));

    expect(finding?.fix).toBe('Install `vitest` as a devDependency: the runner this repository is set up for is missing.');
  });

  it('stays quiet when vitest is installed, when nothing is installed yet, and for runner-neutral entries', () => {
    const spec = { 'src/a.spec.ts': "import 'vitest-auto-spy/angular';" };

    expect(findingsIn(repo('bun test', spec, ['vitest-auto-spy', 'vitest']))).toEqual([]);
    expect(findingsIn(repo('bun test', spec, []))).toEqual([]);
    expect(findingsIn(repo('bun test', { 'src/a.spec.ts': "import 'vitest-auto-spy/rxjs';\nimport 'vitest-auto-spy/console';" }))).toEqual(
      [],
    );
  });
});
