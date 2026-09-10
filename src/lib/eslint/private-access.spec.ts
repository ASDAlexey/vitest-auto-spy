/**
 * The one rule here that needs a type checker, so the one spec that has to build a real program.
 *
 * The other rules are linted from a string; this one cannot be. `parserOptions.project` resolves
 * against files on disk, so every fixture is written into a throwaway directory with its own
 * `tsconfig.json` **before** the first parse — one program, built once, covering all of them. A
 * fixture written afterwards would be linted against a program that predates it, and the rule would
 * report nothing for reasons that have nothing to do with the rule.
 *
 * The false-positive cases carry the weight here. A syntactic version of this rule reports
 * `process.env['X']`, `params['id']` and an indexed access type, which in a real suite is hundreds of
 * reports on correct code — so those shapes are pinned as *silent*, next to the ones that must speak.
 */
import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';
import { hiddenMemberOf } from './private-access';
import type { EsMemberExpression, ParserServices, RuleContext } from './rule-types';

/** Built in `beforeAll`: a flat config matches `files` against the linter's own cwd, and the
 * fixtures live in a throwaway directory rather than under the repository. */
let linter: Linter;

/**
 * Single-run inference off, because this suite lints one fixture more than once.
 *
 * `@typescript-eslint/parser` infers a "single run" from `CI=true` or an `eslint` binary in `argv`,
 * and in that mode the **second** parse of a file falls back to an isolated one-file program — no
 * `./card`, no `paths`, no `baseUrl`. Left inferred, this file passes on a laptop and fails on a
 * runner. The option is the parser's own opt-out, and it is what makes the program the same one in
 * both places.
 */
const TYPED = { disallowAutomaticSingleRunInference: true } as const;

/** The class every fixture reads, with one member of each shape a modifier can be spelled on. */
const CARD = `
export class Card {
  private secret = 1;
  protected shielded = 2;
  public open = 3;

  private hide(): void {}

  constructor(private readonly http: string) {}
}
`;

/** The fixtures, by file name — all written before the first lint, so one program covers them. */
const FIXTURES: Record<string, string> = {
  'card.ts': CARD,
  'private-field.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid card['secret'];\n",
  'protected-field.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid card['shielded'];\n",
  'private-method.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid card['hide']();\n",
  'parameter-property.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid card['http'];\n",
  'const-key.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nconst KEY = 'secret';\nvoid card[KEY];\n",
  'public-member.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid card['open'];\n",
  'dynamic-key.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\ndeclare const key: string;\nvoid card[key];\n",
  'index-signatures.spec.ts':
    'declare const env: Record<string, string>;\n' +
    'declare const params: { [key: string]: unknown };\n' +
    "void env['APP_KM_ENABLED'];\n" +
    "void params['isShowPurchaseModal'];\n",
  'indexed-access-type.spec.ts': "import { Card } from './card';\ntype Open = Card['open'];\ndeclare const open: Open;\nvoid open;\n",
  'library-declaration.spec.ts': "declare const when: Date;\nvoid when['getTime']();\n",
  'cast-any.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid (card as any).secret;\n",
  'cast-double.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid (card as unknown as { hide(): void }).hide();\n",
  'cast-decoy.spec.ts':
    "import { Card } from './card';\n" +
    'interface OpenCard {\n  shielded: number;\n}\n' +
    'declare const card: Card;\n' +
    'void (card as unknown as OpenCard).shielded;\n',
  'cast-angle.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid (<any>card).secret;\n",
  'cast-bracket.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid (card as any)['secret'];\n",
  'cast-public.spec.ts':
    "import { Card } from './card';\ndeclare const card: Card;\nvoid (card as any).open;\nvoid (card as any).nothingLikeThat;\n",
  'dotted-no-cast.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid card.open;\n",
  'prototype-spy.spec.ts':
    "import { Card } from './card';\n" +
    'declare const vi: { spyOn(target: object, key: string): void };\n' +
    'declare const card: Card;\n' +
    "vi.spyOn(Object.getPrototypeOf(card), 'hide');\n",
  'single-run.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid card['secret'];\n",
  'ordinary-spy.spec.ts':
    "import { Card } from './card';\n" +
    'declare const vi: { spyOn(target: object, key: string): void };\n' +
    'declare const card: Card;\n' +
    'declare function makeCard(): Card;\n' +
    "vi.spyOn(card, 'open');\n" +
    "vi.spyOn(makeCard(), 'open');\n" +
    'Object.getPrototypeOf(card);\n' +
    'vi.spyOn();\n',
};

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'vas-private-access-'));
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

/** Lint one fixture with the rule on and a real program behind it. */
function lintTyped(fixture: string): LintMessage[] {
  return linter.verify(
    FIXTURES[fixture] ?? '',
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser, parserOptions: { ...TYPED, project: ['./tsconfig.json'], tsconfigRootDir: root } },
        plugins: { 'vitest-auto-spy': plugin },
        rules: { 'vitest-auto-spy/no-private-member-access': 'error' },
      },
    ],
    fixture,
  );
}

/** The same lint with the inference left alone, which is what a runner gets. */
function lintInferred(fixture: string): LintMessage[] {
  return linter.verify(
    FIXTURES[fixture] ?? '',
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser, parserOptions: { project: ['./tsconfig.json'], tsconfigRootDir: root } },
        plugins: { 'vitest-auto-spy': plugin },
        rules: { 'vitest-auto-spy/no-private-member-access': 'error' },
      },
    ],
    fixture,
  );
}

/** The same fixture with no project behind it — the configuration most suites start from. */
function lintUntyped(fixture: string): LintMessage[] {
  return linter.verify(
    FIXTURES[fixture] ?? '',
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'vitest-auto-spy': plugin },
        rules: { 'vitest-auto-spy/no-private-member-access': 'error' },
      },
    ],
    fixture,
  );
}

describe('no-private-member-access — the shapes it must report', () => {
  it.each([
    ['private-field.spec.ts', 'secret', 'private'],
    ['protected-field.spec.ts', 'shielded', 'protected'],
    ['private-method.spec.ts', 'hide', 'private'],
    ['parameter-property.spec.ts', 'http', 'private'],
  ])('reports %s', (fixture, name, accessibility) => {
    const [message, ...rest] = lintTyped(fixture);

    expect(rest).toEqual([]);
    expect(message?.message).toContain(`\`${name}\` is declared \`${accessibility}\``);
  });

  it('resolves a key parked in a const, because the name comes from the type and not the source', () => {
    expect(lintTyped('const-key.spec.ts').map((message) => message.message.slice(0, 24))).toEqual(['`secret` is declared `pr']);
  });

  it('names the public surface and the template, rather than only saying no', () => {
    const [message] = lintTyped('private-field.spec.ts');

    expect(message?.message).toContain('renderShallow');
    expect(message?.message).toContain('a fact about the design');
  });

  /**
   * The third escape, and the one that needs the checker most: the access itself is dotted, so the
   * compiler *did* check visibility — against a type the spec substituted a line earlier. Reported
   * from a suite where five of them sat in one file.
   */
  it.each([
    ['cast-any.spec.ts', 'secret', 'private'],
    ['cast-double.spec.ts', 'hide', 'private'],
    ['cast-decoy.spec.ts', 'shielded', 'protected'],
    ['cast-angle.spec.ts', 'secret', 'private'],
  ])('reports %s', (fixture, name, accessibility) => {
    const [message, ...rest] = lintTyped(fixture);

    expect(rest).toEqual([]);
    expect(message?.message).toContain(`\`${name}\` is declared \`${accessibility}\``);
    expect(message?.message).toContain('the cast in front of it is what makes this line compile');
  });

  it('unwraps the cast for a bracket read too, where the cast would otherwise hide the type', () => {
    // `(card as any)['secret']` resolves the key fine and then asks `any` for the member, which
    // answers nothing — so the computed branch has to look underneath the cast as well.
    expect(lintTyped('cast-bracket.spec.ts')).toHaveLength(1);
  });

  it('reports a spy taken through Object.getPrototypeOf, which needs no types at all', () => {
    const [message, ...rest] = lintTyped('prototype-spy.spec.ts');

    expect(rest).toEqual([]);
    expect(message?.message).toContain('patches the **prototype**');
  });
});

/**
 * Why this half is longer than the half above: bracket access is ordinary TypeScript, and the rule
 * is only worth having if it stays quiet on all of it. Each of these was counted in a real suite
 * before the rule existed — index signatures on `process.env`, on a route's `queryParams`, on a
 * `dataset`, and an indexed access type in a type position.
 */
describe('no-private-member-access — the shapes it must not report', () => {
  it.each([
    ['public-member.spec.ts'],
    ['dynamic-key.spec.ts'],
    ['index-signatures.spec.ts'],
    ['indexed-access-type.spec.ts'],
    ['library-declaration.spec.ts'],
    ['ordinary-spy.spec.ts'],
    ['cast-public.spec.ts'],
    ['dotted-no-cast.spec.ts'],
  ])('says nothing about %s', (fixture) => {
    expect(lintTyped(fixture)).toEqual([]);
  });

  it('says nothing at all without a project, rather than falling back to the syntax', () => {
    // A type-aware rule that degrades into a syntactic one is the noisy rule wearing a hat: every
    // `env['KEY']` in the suite would be reported by a rule the reader believes checks types.
    expect(lintUntyped('private-field.spec.ts')).toEqual([]);
    // The prototype escape needs no checker, so that half keeps working either way.
    expect(lintUntyped('prototype-spy.spec.ts').map((message) => message.message.slice(0, 30))).toEqual(['`Object.getPrototypeOf(...)` i']);
  });
});

/**
 * The two halves of "no type information" that a linted file cannot tell apart.
 *
 * ESLint hands a rule `{}` for a parser that publishes nothing, and `@typescript-eslint/parser`
 * publishes the two node maps but no `program` when it was given no project. Both mean the same
 * thing here — say nothing — and only a direct call can put the second one in front of the rule.
 */
describe('hiddenMemberOf without a full set of services', () => {
  const node = { type: 'MemberExpression' } as unknown as EsMemberExpression;

  const contextWith = (parserServices: ParserServices): RuleContext =>
    ({ sourceCode: { parserServices }, options: [], report: () => undefined }) as unknown as RuleContext;

  it.each([
    ['nothing published at all', {}],
    ['maps but no program', { esTreeNodeToTSNodeMap: { get: () => ({}) }, tsNodeToESTreeNodeMap: { get: () => undefined } }],
    ['a program but no maps', { program: { getTypeChecker: () => ({ getTypeAtLocation: () => ({ getProperty: () => undefined }) }) } }],
  ])('answers nothing given %s', (_case, services: ParserServices) => {
    expect(hiddenMemberOf(contextWith(services), node)).toBeUndefined();
  });

  it('answers nothing when the checker throws instead of answering', () => {
    const throwing = {
      program: {
        getTypeChecker: () => ({
          getTypeAtLocation: () => {
            throw new TypeError("Cannot read properties of undefined (reading 'includes')");
          },
        }),
      },
      esTreeNodeToTSNodeMap: { get: () => ({}) },
      tsNodeToESTreeNodeMap: { get: () => undefined },
    } as unknown as ParserServices;
    const computed = { type: 'MemberExpression', computed: true, object: {}, property: {} } as unknown as EsMemberExpression;

    expect(hiddenMemberOf(contextWith(throwing), computed)).toBeUndefined();
  });
});

/**
 * The failure that got past every local run and took a release build down.
 *
 * `@typescript-eslint/parser` infers a single run from `CI=true`, and in that mode the second parse
 * of one file falls back to an isolated one-file program. TypeScript 6.0.3 then throws while
 * building an error message for it — `getLocalModuleSpecifier` on a program with neither `paths` nor
 * `baseUrl` — and the throw came back out of the rule and ended the whole lint run. The isolated
 * program cannot see `./card`, so nothing to report is the right answer; the crash was not.
 */
describe('a second parse of one file in single-run mode', () => {
  it('reports on the first parse and stays silent on the second, rather than throwing', () => {
    process.env['TSESTREE_SINGLE_RUN'] = 'true';

    try {
      expect(lintInferred('single-run.spec.ts')).toHaveLength(1);
      expect(lintInferred('single-run.spec.ts')).toEqual([]);
    } finally {
      delete process.env['TSESTREE_SINGLE_RUN'];
    }
  });
});
