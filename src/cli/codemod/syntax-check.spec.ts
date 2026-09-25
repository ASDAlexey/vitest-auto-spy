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
import { brokeSyntax, brokeSyntaxNote, loadParser } from './syntax-check';
import { jestTypes } from './transforms-jest';

const CODES: Readonly<Record<string, number[]>> = {
  broken: [1005],
  fine: [],
};

const FAKE: SyntaxParser = {
  diagnosticsOf: (_file, text) => (CODES[text.trim()] ?? []).map((code) => ({ code, start: 0, message: "',' expected." })),
};

const codesOf = (parser: SyntaxParser | undefined, text: string): number[] | undefined =>
  parser?.diagnosticsOf('a.spec.ts', text).map((diagnostic) => diagnostic.code);

describe('brokeSyntax', () => {
  it('answers only for a diagnostic the rewrite added', () => {
    expect(brokeSyntax(FAKE, 'a.spec.ts', 'fine', 'broken')?.code).toBe(1005);
    expect(brokeSyntax(FAKE, 'a.spec.ts', 'broken', 'fine')).toBeUndefined();
    expect(brokeSyntax(FAKE, 'a.spec.ts', 'broken', 'broken')).toBeUndefined();
  });
});

describe('brokeSyntaxNote', () => {
  it('points at the line of the rewritten text the parser stopped on', () => {
    const finding = brokeSyntaxNote('a.spec.ts', 'const a = 1;\nconst b = ;\n', { code: 1109, start: 23, message: 'Expression expected.' });

    expect(finding.file).toBe('a.spec.ts:2');
    expect(finding.message).toBe('The rewritten file would not parse at line 2 (Expression expected.), so the file was left as it was.');
    expect(finding.fix).toBe('Migrate this file by hand, and report the construct on that line as a codemod defect.');
  });
});

describe('loadParser', () => {
  it('parses through the repository’s own typescript, and reports what the compiler reports', () => {
    const parser = loadParser(process.cwd());

    expect(codesOf(parser, 'const a = 1;\n')).toEqual([]);
    expect(codesOf(parser, 'const a = ;\n')).not.toEqual([]);
    expect(parser?.diagnosticsOf('a.spec.tsx', 'const a = <div />;\n')).toEqual([]);
    expect(parser?.diagnosticsOf('a.spec.ts', 'const a = 1;\nconst b = ;\n')[0]).toMatchObject({
      start: 23,
      message: 'Expression expected.',
    });
  });

  it('is skipped where typescript cannot be resolved, and where the module is not one', () => {
    expect(
      loadParser(process.cwd(), () => {
        throw new Error('Cannot find module');
      }),
    ).toBeUndefined();
    expect(loadParser(process.cwd(), () => ({ notATranspiler: true }))).toBeUndefined();
    expect(
      codesOf(
        loadParser(process.cwd(), () => ({ transpileModule: () => ({}) })),
        'const a = 1;',
      ),
    ).toEqual([]);
  });

  it('reads a chained message and a diagnostic with no text', () => {
    const parser = loadParser(process.cwd(), () => ({
      transpileModule: () => ({ diagnostics: [{ code: 1, messageText: { messageText: 'chained' } }, { code: 2 }] }),
    }));

    expect(parser?.diagnosticsOf('a.spec.ts', '')).toEqual([
      { code: 1, start: undefined, message: 'chained' },
      { code: 2, start: undefined, message: 'TS2' },
    ]);
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
    const broken = verified(
      { diagnosticsOf: (_file, text) => (text === result.after ? [{ code: 1005, start: undefined, message: "',' expected." }] : []) },
      result,
    );

    expect(broken.after).toBe(broken.before);
    expect(broken.fired.size).toBe(0);
    expect(broken.importLines).toEqual([]);
    expect(broken.notes.map((note) => note.check)).toContain('codemod-broke-syntax');
    expect(broken.notes.at(-1)?.message).toBe(
      "The rewritten file would not parse at line 1 (',' expected.), so the file was left as it was.",
    );
  });
});
