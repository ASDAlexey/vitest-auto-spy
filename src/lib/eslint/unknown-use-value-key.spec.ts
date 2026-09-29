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

import { runRule } from './run-rule';
import { FIXTURES } from './unknown-use-value-key.mock';

const RULE = 'no-unknown-use-value-key';

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
  return runRule(RULE, FIXTURES[fixture] ?? '', { filename: fixture, languageOptions, linter });
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
      /^`queryParams\$` does not exist on `ActivatedRoute`, which `ActivatedRoute` provides; Angular types `useValue` as `any`/,
    );
    expect(message?.message).toContain('/utilities/eslint-rules#no-unknown-use-value-key');
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
