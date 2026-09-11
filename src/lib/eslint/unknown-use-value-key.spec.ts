/**
 * Type-aware, so every fixture is written to disk before the first lint and one real program covers
 * them all — the same arrangement as `mistyped-use-value.spec.ts`, for the same reasons.
 */
import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TypeChecker } from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';

const RULE = 'vitest-auto-spy/no-unknown-use-value-key';

const TYPES = `
export declare class InjectionToken<T> {
  constructor(description: string);
  protected readonly marker?: T;
}
export class ActivatedRoute {
  queryParams: unknown;
  snapshot: { params: Record<string, string> } = { params: {} };
  #secret = 1;
  private hidden = 2;
  navigate(): void {}
}
export abstract class Storage {
  abstract read(key: string): string | null;
}
export class Box<T> {
  value?: T;
}
export interface Config { apiUrl: string; retries: number }
export interface Legacy { legacyUrl: string }
export const CONFIG = new InjectionToken<Config>('CONFIG');
export const MAYBE = new InjectionToken<Config | null>('MAYBE');
export const EITHER = new InjectionToken<Config | Legacy>('EITHER');
export const BOTH = new InjectionToken<Config & Legacy>('BOTH');
export const FLAG = new InjectionToken<boolean>('FLAG');
export const LOOSE = new InjectionToken<any>('LOOSE');
export const OPAQUE = new InjectionToken<unknown>('OPAQUE');
export const EMPTY = new InjectionToken<object>('EMPTY');
export const MAP = new InjectionToken<Record<string, number>>('MAP');
export const PATTERN = new InjectionToken<{ [key: \`data-\${string}\`]: string; id: string }>('PATTERN');
export const LIST = new InjectionToken<Config[]>('LIST');
export const NAMED = 'NAMED';
`;

const provider = (imported: string, provide: string, value: string, extra = '', before = ''): string =>
  `import { ${imported} } from './types';\n${before}export const providers = [{ provide: ${provide}, useValue: ${value}${extra} }];\n`;

const FIXTURES: Record<string, string> = {
  'types.ts': TYPES,
  'class-unknown.spec.ts': provider('ActivatedRoute', 'ActivatedRoute', "{ queryParams$: {}, snapshot: { params: { id: '1' } } }"),
  'class-known.spec.ts': provider(
    'ActivatedRoute',
    'ActivatedRoute',
    "{ queryParams: {}, hidden: 3, navigate() {}, 'snapshot': { params: {} } }",
  ),
  'abstract-class.spec.ts': provider('Storage', 'Storage', '{ read: () => null, write: () => undefined }'),
  'generic-class.spec.ts': provider('Box', 'Box', '{ value: 1, size: 2 }'),
  'token-unknown.spec.ts': provider('CONFIG', 'CONFIG', "{ apiUrl: '/api', retry: 3 }"),
  'token-partial.spec.ts': provider('CONFIG', 'CONFIG', "{ apiUrl: '/api' }"),
  'token-wrong-value.spec.ts': provider('CONFIG', 'CONFIG', "{ apiUrl: 42, retries: 'many' }"),
  'nullable.spec.ts': provider('MAYBE', 'MAYBE', "{ apiUrl: '/api', timeout: 1 }"),
  'union.spec.ts': provider('EITHER', 'EITHER', "{ legacyUrl: '/old', apiUrl: '/new', other: 1 }"),
  'intersection.spec.ts': provider('BOTH', 'BOTH', "{ legacyUrl: '/old', apiUrl: '/new', other: 1 }"),
  'spread.spec.ts': provider(
    'CONFIG',
    'CONFIG',
    "{ ...base, ['computed']: 1, bogus: 2 }",
    '',
    'declare const base: Record<string, unknown>;\n',
  ),
  'spread-only.spec.ts': provider('CONFIG', 'CONFIG', '{ ...base }', '', 'declare const base: Record<string, unknown>;\n'),
  'primitive.spec.ts': provider('FLAG', 'FLAG', '{ on: true }'),
  'any.spec.ts': provider('LOOSE', 'LOOSE', '{ anything: 1 }'),
  'unknown.spec.ts': provider('OPAQUE', 'OPAQUE', '{ anything: 1 }'),
  'object.spec.ts': provider('EMPTY', 'EMPTY', '{ anything: 1 }'),
  'index-signature.spec.ts': provider('MAP', 'MAP', '{ anything: 1 }'),
  'pattern-index.spec.ts': provider('PATTERN', 'PATTERN', "{ id: 'a', 'data-x': 'b', other: 'c' }"),
  'array.spec.ts': provider('LIST', 'LIST', '{ anything: 1 }'),
  'string-token.spec.ts': provider('NAMED', 'NAMED', '{ anything: 1 }'),
  'token-class.spec.ts': provider('InjectionToken', 'InjectionToken', '{ anything: 1 }'),
  'not-a-literal.spec.ts': provider('CONFIG', 'CONFIG', 'value', '', 'declare const value: { bogus: number };\n'),
  'multi.spec.ts': provider('CONFIG', 'CONFIG', "{ apiUrl: '/a', bogus: 1 }", ', multi: true'),
  'multi-variable.spec.ts': provider('CONFIG', 'CONFIG', "{ apiUrl: '/a', bogus: 1 }", ', multi: flag', 'declare const flag: boolean;\n'),
  'multi-false.spec.ts': provider('CONFIG', 'CONFIG', "{ apiUrl: '/a', bogus: 1 }", ', multi: false'),
  'other-shapes.spec.ts':
    "import { CONFIG } from './types';\n" +
    'export const factory = { provide: CONFIG, useFactory: () => ({ bogus: 1 }) };\n' +
    'export const bare = { useValue: { bogus: 1 } };\n',
};

let root: string;
let linter: Linter;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'vas-use-value-key-'));
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

/** The reported keys, in source order — the one fact every case below is about. */
const reportedKeys = (fixture: string): string[] =>
  lintTyped(fixture).map((message) => /^`([^`]+)` does not exist/.exec(message.message)?.[1] ?? message.message);

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

describe('no-unknown-use-value-key — what it reports', () => {
  it('reports a key the class does not have, on the key, naming the type and the token', () => {
    const [message, ...rest] = lintTyped('class-unknown.spec.ts');

    expect(rest).toEqual([]);
    expect(message?.message).toMatch(
      /^`queryParams\$` does not exist on `ActivatedRoute`, which `ActivatedRoute` provides — Angular types `useValue` as `any`/,
    );
    expect(message?.message).toContain('#how-to-mock-a-service-behind-angular-di');
    expect(message).toMatchObject({ line: 2, column: 66 });
  });

  it.each([
    ['token-unknown.spec.ts', ['retry']],
    ['abstract-class.spec.ts', ['write']],
    ['generic-class.spec.ts', ['size']],
    ['nullable.spec.ts', ['timeout']],
    ['union.spec.ts', ['other']],
    ['intersection.spec.ts', ['other']],
    ['spread.spec.ts', ['bogus']],
    ['multi-false.spec.ts', ['bogus']],
  ])('reports %s', (fixture, keys) => {
    expect(reportedKeys(fixture)).toEqual(keys);
  });

  it('quotes the token type, not the member of the union the key happened to miss', () => {
    expect(lintTyped('nullable.spec.ts')[0]?.message).toContain('does not exist on `Config | null`, which `MAYBE` provides');
  });
});

describe('no-unknown-use-value-key — what it leaves alone', () => {
  it.each([
    ['class-known.spec.ts', 'every key is a member, a private one and a quoted one included'],
    ['token-partial.spec.ts', 'a partial fixture'],
    ['token-wrong-value.spec.ts', 'values of the wrong type — keys only, never assignability'],
    ['spread-only.spec.ts', 'a spread, which has no keys of its own'],
    ['primitive.spec.ts', 'a primitive token, which is no-mistyped-use-value’s'],
    ['any.spec.ts', 'an any token'],
    ['unknown.spec.ts', 'an unknown token'],
    ['object.spec.ts', 'an object token, which declares no members'],
    ['index-signature.spec.ts', 'an index signature'],
    ['pattern-index.spec.ts', 'a template-literal index signature'],
    ['array.spec.ts', 'an array token'],
    ['string-token.spec.ts', 'a string token'],
    ['token-class.spec.ts', 'the InjectionToken class itself'],
    ['not-a-literal.spec.ts', 'a value that is not an object literal'],
    ['multi.spec.ts', 'a multi provider'],
    ['multi-variable.spec.ts', 'a multi provider decided at run time'],
    ['other-shapes.spec.ts', 'useFactory, and a useValue without provide'],
  ])('says nothing about %s (%s)', (fixture) => {
    expect(lintTyped(fixture)).toEqual([]);
  });

  it('says nothing without type information', () => {
    expect(lintWith('class-unknown.spec.ts', { parser: tsParser })).toEqual([]);
  });

  it('says nothing when the checker cannot look properties up', () => {
    const parser = parserWithChecker(({ getIndexInfosOfType: _absent, ...rest }) => rest);

    expect(lintWith('class-unknown.spec.ts', { parser, parserOptions: typed() })).toEqual([]);
  });

  it('says nothing when the checker throws instead of answering', () => {
    const parser = parserWithChecker((checker) => ({
      ...checker,
      getTypeAtLocation: () => {
        throw new TypeError("Cannot read properties of undefined (reading 'includes')");
      },
    }));

    expect(lintWith('class-unknown.spec.ts', { parser, parserOptions: typed() })).toEqual([]);
  });
});
