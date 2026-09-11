/**
 * Type-aware, so every fixture is written to disk before the first lint and one real program covers
 * them all — the same arrangement as `private-access.spec.ts`, for the same reasons.
 */
import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TypeChecker } from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';

const RULE = 'vitest-auto-spy/no-mistyped-use-value';

const TOKENS = `
export declare class InjectionToken<T> {
  constructor(description: string);
  protected readonly marker?: T;
}
export enum Mode { Light, Dark }
export class Service {
  load(): void {}
}
export const IS_BROWSER = new InjectionToken<boolean>('IS_BROWSER');
export const THEME = new InjectionToken<'a' | 'b'>('THEME');
export const API_URL = new InjectionToken<string>('API_URL');
export const MODE = new InjectionToken<Mode>('MODE');
export const ORIGIN = new InjectionToken<string | null>('ORIGIN');
export const CONFIG = new InjectionToken<{ apiUrl: string; retries: number }>('CONFIG');
`;

const provider = (imported: string, provide: string, value: string, before = ''): string =>
  `import { ${imported} } from './tokens';\n${before}export const providers = [{ provide: ${provide}, useValue: ${value} }];\n`;

const FIXTURES: Record<string, string> = {
  'tokens.ts': TOKENS,
  'boolean-object.spec.ts': provider('IS_BROWSER', 'IS_BROWSER', '{}'),
  'boolean-true.spec.ts': provider('IS_BROWSER', 'IS_BROWSER', 'true'),
  'boolean-variable.spec.ts': provider('IS_BROWSER', 'IS_BROWSER', 'flag', 'declare const flag: boolean;\n'),
  'literal-union.spec.ts': provider('THEME', 'THEME', "'c'"),
  'string-number.spec.ts': provider('API_URL', 'API_URL', '42'),
  'enum-string.spec.ts': provider('MODE', 'MODE', "'Dark'"),
  'enum-member.spec.ts': provider('Mode, MODE', 'MODE', 'Mode.Dark'),
  'nullable.spec.ts': provider('ORIGIN', 'ORIGIN', 'null'),
  'object-partial.spec.ts': provider('CONFIG', 'CONFIG', "{ apiUrl: '/api' }"),
  'class-token.spec.ts': provider('Service', 'Service', '{}'),
  'token-class.spec.ts': provider('InjectionToken', 'InjectionToken', '1'),
  'other-shapes.spec.ts':
    "import { IS_BROWSER } from './tokens';\n" +
    'export const factory = { provide: IS_BROWSER, useFactory: () => ({}) };\n' +
    'export const bare = { useValue: {} };\n',
};

let root: string;
let linter: Linter;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'vas-use-value-'));
  linter = new Linter({ configType: 'flat', cwd: root });

  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true },
      include: ['*.ts'],
    }),
  );

  Object.entries(FIXTURES).forEach(([name, code]) => writeFileSync(join(root, name), code));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const typed = (): object => ({ disallowAutomaticSingleRunInference: true, project: ['./tsconfig.json'], tsconfigRootDir: root });

function lintWith(fixture: string, languageOptions: object): LintMessage[] {
  return linter.verify(
    FIXTURES[fixture] ?? '',
    [{ files: ['**/*.ts'], languageOptions, plugins: { 'vitest-auto-spy': plugin }, rules: { [RULE]: 'error' } }],
    fixture,
  );
}

const lintTyped = (fixture: string): LintMessage[] => lintWith(fixture, { parser: tsParser, parserOptions: typed() });

/** `@typescript-eslint/parser` with a real program, whose checker is handed through `reshape` first. */
function parserWithChecker(reshape: (checker: TypeChecker) => object): object {
  return {
    parseForESLint: (code: string, options?: tsParser.ParserOptions) => {
      const parsed = tsParser.parseForESLint(code, options);
      const { program } = parsed.services;

      return {
        ...parsed,
        services: { ...parsed.services, program: program && { getTypeChecker: () => reshape(program.getTypeChecker()) } },
      };
    },
  };
}

describe('no-mistyped-use-value — what it reports', () => {
  it('reports an object handed to a boolean token, naming the token, both types and the any', () => {
    const [message, ...rest] = lintTyped('boolean-object.spec.ts');

    expect(rest).toEqual([]);
    expect(message?.message).toMatch(/^`IS_BROWSER` expects `boolean`, but `useValue` is `\{\}` — Angular types `useValue` as `any`/);
    expect(message?.message).toContain('truthy');
    expect(message?.message).toContain('#how-to-mock-a-service-behind-angular-di');
  });

  it.each([
    ['literal-union.spec.ts', '`THEME` expects `"a" | "b"`, but `useValue` is `"c"`'],
    ['string-number.spec.ts', '`API_URL` expects `string`, but `useValue` is `42`'],
    ['enum-string.spec.ts', '`MODE` expects `Mode`, but `useValue` is `"Dark"`'],
  ])('reports %s', (fixture, opening) => {
    expect(lintTyped(fixture).map((message) => message.message.slice(0, opening.length))).toEqual([opening]);
  });
});

describe('no-mistyped-use-value — what it leaves alone', () => {
  it.each([
    ['boolean-true.spec.ts'],
    ['boolean-variable.spec.ts'],
    ['enum-member.spec.ts'],
    ['nullable.spec.ts'],
    ['object-partial.spec.ts'],
    ['class-token.spec.ts'],
    ['token-class.spec.ts'],
    ['other-shapes.spec.ts'],
  ])('says nothing about %s', (fixture) => {
    expect(lintTyped(fixture)).toEqual([]);
  });

  it('says nothing without type information', () => {
    expect(lintWith('boolean-object.spec.ts', { parser: tsParser })).toEqual([]);
  });

  it('says nothing when the checker cannot compare types', () => {
    const parser = parserWithChecker(({ isTypeAssignableTo: _absent, ...rest }) => rest);

    expect(lintWith('boolean-object.spec.ts', { parser, parserOptions: typed() })).toEqual([]);
  });

  it('says nothing when the checker throws instead of answering', () => {
    const parser = parserWithChecker((checker) => ({
      ...checker,
      getTypeAtLocation: () => {
        throw new TypeError("Cannot read properties of undefined (reading 'includes')");
      },
    }));

    expect(lintWith('boolean-object.spec.ts', { parser, parserOptions: typed() })).toEqual([]);
  });
});
