import * as tsParser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DECLARABLE_FIXTURES } from './declarable-provider.mock';
import { fixRule, runRule } from './run-rule';

let root: string;
let linter: Linter;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'vas-declarable-provider-'));
  linter = new Linter({ configType: 'flat', cwd: root });
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { experimentalDecorators: true }, include: ['*.ts'] }));
  Object.entries(DECLARABLE_FIXTURES).forEach(([name, code]) => writeFileSync(join(root, name), code));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function lint(fixture: string): ReturnType<typeof runRule> {
  return runRule('prefer-provide-auto-spy', DECLARABLE_FIXTURES[fixture] ?? '', {
    filename: fixture,
    linter,
    languageOptions: {
      parser: tsParser,
      parserOptions: { disallowAutomaticSingleRunInference: true, project: ['./tsconfig.json'], tsconfigRootDir: root },
    },
  });
}

describe('explicit DI providers for declarables', () => {
  it('keeps imported Angular-decorated and compiled declarables in their supported explicit provider form', () => {
    expect(lint('imported.spec.ts')).toEqual([]);
  });

  it('still reports services, directive-like names and unrelated decorators', () => {
    expect(lint('services.spec.ts')).toHaveLength(3);
  });

  it('keeps the factory import a declarable still uses when fixing a service beside it', () => {
    const fixed = fixRule('prefer-provide-auto-spy', DECLARABLE_FIXTURES['mixed.spec.ts'] ?? '', {
      filename: 'mixed.spec.ts',
      linter,
      languageOptions: {
        parser: tsParser,
        parserOptions: { disallowAutomaticSingleRunInference: true, project: ['./tsconfig.json'], tsconfigRootDir: root },
      },
    });

    expect(fixed.output).toContain("import { createSpyFromClass } from 'vitest-auto-spy'");
    expect(fixed.output).toContain('useValue: createSpyFromClass(FocusDirective)');
    expect(fixed.output).toContain('provideAutoSpy(CartService)');
    expect(fixed.messages).toEqual([]);
  });
});
