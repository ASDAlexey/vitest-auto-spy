/**
 * The guard that reads the result back through a parser.
 *
 * It exists because every text rewrite in this codemod can produce a file that does not parse while
 * the report stays green, so the cases here are the two that matter: a file that was already broken
 * before the run is not blamed on the run, and a file the run broke is not written.
 */
import { describe, expect, it } from 'vitest';

import { runTransforms } from './codemod';
import { verified } from './run';
import type { SyntaxParser } from './syntax-check';
import { brokeSyntax, loadParser } from './syntax-check';
import { jestTypes } from './transforms-jest';

const CODES: Readonly<Record<string, number[]>> = {
  broken: [1005],
  fine: [],
};

const FAKE: SyntaxParser = { codesOf: (_file, text) => CODES[text.trim()] ?? [] };

describe('brokeSyntax', () => {
  it('answers only for a diagnostic the rewrite added', () => {
    expect(brokeSyntax(FAKE, 'a.spec.ts', 'fine', 'broken')).toBe(true);
    expect(brokeSyntax(FAKE, 'a.spec.ts', 'broken', 'fine')).toBe(false);
    expect(brokeSyntax(FAKE, 'a.spec.ts', 'broken', 'broken')).toBe(false);
  });
});

describe('loadParser', () => {
  it('parses through the repository’s own typescript, and reports what the compiler reports', () => {
    const parser = loadParser(process.cwd());

    expect(parser?.codesOf('a.spec.ts', 'const a = 1;\n')).toEqual([]);
    expect(parser?.codesOf('a.spec.ts', 'const a = ;\n')).not.toEqual([]);
    expect(parser?.codesOf('a.spec.tsx', 'const a = <div />;\n')).toEqual([]);
  });

  it('is skipped where typescript cannot be resolved, and where the module is not one', () => {
    expect(
      loadParser(process.cwd(), () => {
        throw new Error('Cannot find module');
      }),
    ).toBeUndefined();
    expect(loadParser(process.cwd(), () => ({ notATranspiler: true }))).toBeUndefined();
    expect(loadParser(process.cwd(), () => ({ transpileModule: () => ({}) }))?.codesOf('a.spec.ts', 'const a = 1;')).toEqual([]);
  });
});

describe('verified', () => {
  const result = runTransforms({
    file: 'a.spec.ts',
    source: 'const m: jest.Mocked<Foo> = x;\n',
    entries: undefined,
    preferredEntry: 'vitest-auto-spy',
    selected: [jestTypes],
  });

  it('keeps a rewrite the parser accepts, and every rewrite when there is no parser', () => {
    expect(verified(loadParser(process.cwd()), result).after).toBe(result.after);
    expect(verified(undefined, result).after).toBe(result.after);
  });

  it('refuses to write a rewrite that stopped parsing, and says so in the report', () => {
    const broken = verified({ codesOf: (_file, text) => (text === result.after ? [1005] : []) }, result);

    expect(broken.after).toBe(broken.before);
    expect(broken.fired.size).toBe(0);
    expect(broken.importLines).toEqual([]);
    expect(broken.notes.map((note) => note.check)).toContain('codemod-broke-syntax');
  });
});
