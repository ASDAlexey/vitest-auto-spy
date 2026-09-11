import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';

const RULE = 'no-ts-expect-error-on-double';

const linter = new Linter({ configType: 'flat' });

function verify(code: string): LintMessage[] {
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'vitest-auto-spy': plugin },
        rules: { [`vitest-auto-spy/${RULE}`]: 'error' },
      },
    ],
    'shelf.component.spec.ts',
  );
}

const lines = (code: string): number[] => verify(code).map((message) => message.line);

describe(RULE, () => {
  it('reports a directive above every configuration helper that checks a stub against the signature', () => {
    const helpers = [
      'calledWith(1)',
      'mustBeCalledWith(1)',
      'mockResolvedValue(page)',
      'mockResolvedValueOnce(page)',
      'mockReturnValue(page)',
      'mockReturnValueOnce(page)',
      'nextOneTimeWith(page)',
      'nextWith(page)',
      'nextWithPerCall([])',
      'nextWithValues([])',
      'resolveWith(page)',
      'resolveWithPerCall([])',
      'returnValue(page)',
    ];

    expect(helpers.flatMap((helper) => verify(`// @ts-expect-error\nshelves.getShelf.${helper};`))).toHaveLength(helpers.length);
  });

  it('reads both directives, in a line comment or a block comment', () => {
    expect(lines('// @ts-ignore\nshelves.getShelf.nextWith(page);')).toEqual([1]);
    expect(lines('/// @ts-expect-error\nshelves.getShelf.nextWith(page);')).toEqual([1]);
    expect(lines('/* @ts-expect-error */\nshelves.getShelf.nextWith(page);')).toEqual([1]);
    expect(lines('/* the page is a partial fixture\n   @ts-expect-error */\nshelves.getShelf.nextWith(page);')).toEqual([1]);
  });

  it('reads a block comment the way the compiler does — off its last line only', () => {
    expect(lines('/**\n * @ts-expect-error\n */\nshelves.getShelf.nextWith(page);')).toEqual([]);
  });

  it('reports a directive whatever reason follows it — the reason is where a wrong diagnosis is written', () => {
    expect(
      lines('// @ts-expect-error content matches the real call site, not the collapsed generic\nmodal.show.mockReturnValue(ref);'),
    ).toEqual([1]);
  });

  it('reports at the directive, so a disable comment above it is the escape', () => {
    const [report] = verify('beforeEach(() => {\n  // @ts-expect-error\n  shelves.getShelf.nextWith(page);\n});');

    expect(report?.line).toBe(2);
    expect(
      verify(
        [
          '// eslint-disable-next-line vitest-auto-spy/no-ts-expect-error-on-double -- an error outside the union reaches the default branch',
          '// @ts-expect-error',
          'reference.load.nextOneTimeWith(new HttpErrorResponse({ status: 500 }));',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('names the directive, the method and both repairs', () => {
    const [report] = verify('// @ts-expect-error\nshelves.getShelf.calledWith(gid).mockReturnValue(of(page));');

    expect(report?.message).toMatch(
      /`@ts-expect-error` above `getShelf\.mockReturnValue\(…\)`[\s\S]*Spy<X, \{ overload: \{ getShelf: 'first' \} \}>[\s\S]*ReturnType<X\['getShelf'\]>[\s\S]*eslint-disable-next-line/,
    );
    expect(report?.message).toContain('#how-to-mock-an-overloaded-method');
    expect(verify('// @ts-ignore\nconfirm.send.mustBeCalledWith(code).resolveWith(ok);')[0]?.message).toMatch(
      /`@ts-ignore` above `send\.resolveWith/,
    );
  });

  it('reports a directive on any line of the call, the fixture included', () => {
    const code = ['modal.show.mockReturnValue({', '  // @ts-expect-error', '  content: fakePin,', '  close: () => undefined,', '});'].join(
      '\n',
    );

    expect(lines(code)).toEqual([2]);
    expect(lines('await injectSpy(ShelvesService)\n  // @ts-expect-error\n  .getShelf.resolveWith(page);')).toEqual([2]);
  });

  it('reports once for a chain, naming the helper that ends it', () => {
    expect(verify('// @ts-expect-error\nshelves.getShelf.calledWith(gid).nextWith(page);').map((report) => report.message)).toEqual([
      expect.stringContaining('`getShelf.nextWith(…)`'),
    ]);
  });

  it('stays silent on a directive inside a callback handed to the call', () => {
    const code = [
      'shelves.getShelf.mockReturnValue(',
      '  pages.map((page) => {',
      '    // @ts-expect-error',
      '    return page.legacy;',
      '  }),',
      ');',
    ].join('\n');

    expect(lines(code)).toEqual([]);
  });

  it('reports a configuration inside that callback on its own', () => {
    const code = ['items.forEach((item) => {', '  // @ts-expect-error', '  shelves.getShelf.nextWith(item);', '});'].join('\n');

    expect(lines(code)).toEqual([2]);
  });

  it('stays silent where the suppressed line configures no double', () => {
    expect(verify('// @ts-expect-error\nconst shelf: Shelf = {};')).toEqual([]);
    expect(verify('// @ts-expect-error\nshelves.getShelf.failWith(new Error());')).toEqual([]);
    expect(verify('// @ts-expect-error\nshelves.getShelf.rejectWith(new Error());')).toEqual([]);
    expect(verify('// a comment\nshelves.getShelf.nextWith(page);')).toEqual([]);
    expect(verify('// @ts-nocheck\nshelves.getShelf.nextWith(page);')).toEqual([]);
    expect(verify('shelves.getShelf.nextWith(page); // @ts-expect-error\nconst next = 1;')).toEqual([]);
  });

  it('stays silent on a directive two lines above the call', () => {
    expect(verify('// @ts-expect-error\nconst unrelated = 1;\nshelves.getShelf.nextWith(page);')).toEqual([]);
  });

  it('stays silent where no spied method is named', () => {
    expect(verify('// @ts-expect-error\nvi.fn().mockReturnValue(page);')).toEqual([]);
    expect(verify('// @ts-expect-error\nloader.mockReturnValue(page);')).toEqual([]);
    expect(verify("// @ts-expect-error\nshelves['getShelf'].nextWith(page);")).toEqual([]);
    expect(verify('// @ts-expect-error\nshelves.getShelf[helper](page);')).toEqual([]);
    expect(verify('// @ts-expect-error\nnextWith(page);')).toEqual([]);
  });
});
