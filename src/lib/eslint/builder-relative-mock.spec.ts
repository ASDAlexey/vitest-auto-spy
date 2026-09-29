import { type LintMessage, Linter } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-relative-mock-under-builder';

describe('no-relative-mock-under-builder', () => {
  const root = mkdtempSync(join(tmpdir(), 'auto-spy-relative-mock-'));
  const linter = new Linter({ configType: 'flat', cwd: root });

  function lint(code: string, run: Parameters<typeof runRule>[2] = {}): LintMessage[] {
    return runRule(RULE, code, { linter, ...run });
  }

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  function workspace(name: string, builder: string): string {
    const directory = join(root, name);

    mkdirSync(join(directory, 'src'), { recursive: true });
    writeFileSync(join(directory, 'angular.json'), JSON.stringify({ projects: { app: { root: '', architect: { test: { builder } } } } }));

    return join(directory, 'src', 'page.spec.ts');
  }

  it('flags every relative spelling the builder rejects, where a unit-test target runs the spec', () => {
    const filename = workspace('builder', '@angular/build:unit-test');
    const code = [
      "vi.mock('./api');",
      "vi.doMock('../store', () => ({}));",
      'vi.importMock(`./clock`);',
      "vitest.unmock('/abs/path');",
      "vi.mock(import('./typed'), () => ({}));",
      "vi.doUnmock('./x');",
    ].join('\n');
    const messages = lint(code, { filename });

    expect(messages.map((message) => message.line)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(messages[0]?.message).toContain("`vi.mock('./api')` throws under `@angular/build:unit-test`");
  });

  it('leaves package specifiers, dynamic ones and other runners alone', () => {
    const filename = workspace('builder-clean', '@angular/build:unit-test');
    const code = [
      "vi.mock('@angular/router');",
      'vi.mock(path);',
      'vi.mock(`./${name}`);',
      'vi.mock(import(name));',
      "jest.mock('./api');",
      "vi.fn('./api');",
      'vi.mock();',
    ].join('\n');

    expect(lint(code, { filename })).toEqual([]);
  });

  it('is silent where no builder runs the spec, unless the option says one does', () => {
    const karma = workspace('karma', '@angular/build:karma');

    expect(lint("vi.mock('./api');", { filename: karma })).toEqual([]);
    expect(lint("vi.mock('./api');", { filename: karma, options: { builder: 'unit-test' } })).toHaveLength(1);
  });

  it('flags a mock of a tsconfig path alias for a workspace file, which the builder bundles instead of mocking', () => {
    const filename = workspace('aliases', '@angular/build:unit-test');
    const directory = join(root, 'aliases');

    writeFileSync(
      join(directory, 'tsconfig.base.json'),
      [
        '{',
        '  // comments and trailing commas, as tsconfig files have them',
        '  "compilerOptions": {',
        '    "paths": { "@app/*": ["src/app/*"], "@env": ["src/env.ts"], "@vendor/*": ["node_modules/vendor/*"], },',
        '  },',
        '}',
      ].join('\n'),
    );
    writeFileSync(join(directory, 'tsconfig.json'), JSON.stringify({ extends: './tsconfig.base.json' }));

    const code = [
      "vi.mock('@app/cart.service');",
      "vi.doMock('@env');",
      "vi.mock('@vendor/lib');",
      "vi.mock('@angular/router');",
      "vi.mock('@application');",
    ].join('\n');
    const messages = lint(code, { filename });

    expect(messages.map((message) => message.line)).toEqual([1, 2]);
    expect(messages[0]?.message).toContain(
      "`vi.mock('@app/cart.service')` does nothing under `@angular/build:unit-test`: `@app/cart.service` is the tsconfig path alias `@app/*`",
    );
    expect(lint("vi.mock('@app/cart.service');", { filename: join(directory, 'src', 'other.spec.ts') })).toHaveLength(1);
  });

  function externalsWorkspace(name: string, architect: object): string {
    const directory = join(root, name);

    mkdirSync(join(directory, 'src'), { recursive: true });
    writeFileSync(
      join(directory, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { paths: { '@app/*': ['src/app/*'], '@env': ['src/env.ts'], '@lib/*': ['src/lib/*'] } } }),
    );
    writeFileSync(join(directory, 'angular.json'), JSON.stringify({ projects: { shop: { root: '', architect } } }));

    return join(directory, 'src', 'page.spec.ts');
  }

  it('leaves an alias alone that the buildTarget configuration keeps external', () => {
    const filename = externalsWorkspace('externals', {
      build: {
        options: { externalDependencies: ['@app/order.service'] },
        configurations: { test: { externalDependencies: ['@app/cart.service', '@env', '@lib/*.util'] } },
      },
      test: { builder: '@angular/build:unit-test', options: { buildTarget: 'shop:build:test' } },
    });
    const code = [
      "vi.mock('@app/cart.service');",
      "vi.mock('@env');",
      "vi.mock('@lib/date.util');",
      "vi.mock('@app/order.service');",
      "vi.mock('@lib/date.helper');",
    ].join('\n');

    expect(lint(code, { filename }).map((message) => message.line)).toEqual([4, 5]);
    expect(lint("vi.mock('./cart.service');", { filename })).toHaveLength(1);
  });

  it('reports an external alias when one configuration of the test target builds without it', () => {
    const filename = externalsWorkspace('externals-partial', {
      build: { configurations: { test: { externalDependencies: ['@app'] }, ci: {} } },
      test: {
        builder: '@angular/build:unit-test',
        options: { buildTarget: 'shop:build:test' },
        configurations: { ci: { buildTarget: 'shop:build:ci' } },
      },
    });

    expect(lint("vi.mock('@app/cart.service');", { filename })).toHaveLength(1);
  });

  it('reads externalDependencies only when it is a list, from a buildTarget without a configuration', () => {
    const filename = externalsWorkspace('externals-malformed', {
      build: { options: { externalDependencies: '@app/cart.service' } },
      test: { builder: '@angular/build:unit-test', options: { buildTarget: 'shop:build' } },
    });

    expect(lint("vi.mock('@app/cart.service');", { filename })).toHaveLength(1);

    const bare = externalsWorkspace('externals-bare', {
      test: { builder: '@angular/build:unit-test', options: { buildTarget: 'shop' } },
    });

    expect(lint("vi.mock('@app/cart.service');", { filename: bare })).toHaveLength(1);
  });

  it('reads no alias where no tsconfig above the spec declares paths', () => {
    const filename = workspace('no-paths', '@angular/build:unit-test');

    writeFileSync(join(root, 'no-paths', 'tsconfig.json'), '{ not json');

    expect(lint("vi.mock('@app/cart.service');", { filename })).toEqual([]);
  });
});
