import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { removeFile, writeTextFile } from '../fs-scan';
import { readProfile } from '../profile';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { buildGraph, codeOnly, extractSpecifiers } from './graph';
import { aliasCandidates, readCompilerPaths } from './graph-paths';
import { checkSpecImports } from './spec-imports';

afterEach(() => {
  removeTempRepos();
});

describe('codeOnly', () => {
  it('blanks comments, string bodies, template text and regex bodies without moving offsets', () => {
    const source = "const a = 'x'; // note\n/* block */ const re = /['\"]/g; const t = `t${b}t`;";
    const code = codeOnly(source);

    expect(code).toHaveLength(source.length);
    expect(code).toBe("const a = ' ';        \n            const re = /    /g; const t = ` ${b} `;");
  });

  it('keeps a division a division', () => {
    expect(codeOnly("const x = a / b; const s = 'k' / 2;")).toBe("const x = a / b; const s = ' ' / 2;");
    expect(codeOnly('return /a/.test(s)')).toBe('return / /.test(s)');
    expect(codeOnly('const r = x < /a[/]b/')).toBe('const r = x < /     /');
    expect(codeOnly('const y = a[0] /\n2')).toBe('const y = a[0] /\n2');
    expect(codeOnly('x = /a\\/b/; y = /open\nz')).toBe('x = /    /; y = /open\nz');
    expect(codeOnly('x = /open')).toBe('x = /open');
  });

  it('ends a quoted string at its line, so an apostrophe in JSX text swallows nothing', () => {
    expect(codeOnly("<p>Don't</p>\nimport('./a');")).toBe("<p>Don'     \nimport('   ');");
  });

  it('survives unterminated comments and templates, and nested braces in a template expression', () => {
    expect(codeOnly('a /* open')).toBe('a        ');
    expect(codeOnly('a // open')).toBe('a        ');
    expect(codeOnly('`x ${ {a: `y`} } z` + "q\\"r"')).toBe('`  ${ {a: ` `} }  ` + "    "');
    expect(codeOnly('`open \\` still')).toBe('`             ');
  });
});

describe('extractSpecifiers', () => {
  it('finds every specifier form in code', () => {
    const specifiers = extractSpecifiers(
      `import a from './a';\nexport * from './b';\nimport './c';\nconst d = await import('./d');\nconst e = require('./e');\nimport type { F } from './f';`,
    );

    expect(specifiers.sort()).toEqual(['./a', './b', './c', './d', './e', './f']);
  });

  it('ignores specifiers inside comments and strings', () => {
    const source = [
      "// import { Old } from './old.spec';",
      "/* import './block'; */",
      'const doc = "import x from \'./in-string\'";',
      "const tpl = `require('./in-template')`;",
      "Array.from('abc'); obj.import('./method');",
      "import real from './real';",
    ].join('\n');

    expect(extractSpecifiers(source)).toEqual(['./real']);
  });

  it('drops a specifier that is not a plain one-line string', () => {
    expect(extractSpecifiers("import x from '';\nimport y from 'unterminated\n")).toEqual([]);
  });
});

describe('readCompilerPaths', () => {
  it('follows extends, resolving each option against the config that declared it', () => {
    const root = createTempRepo({
      'tsconfig.json': JSON.stringify({ extends: './configs/base', compilerOptions: { strict: true } }),
      'configs/base.json':
        '{ // a comment\n "compilerOptions": { "baseUrl": "..", "paths": { "@app/*": ["src/app/*", "src/legacy/*"], "env": ["src/env.ts"] } } }',
    });
    const paths = readCompilerPaths(root);

    expect(paths.baseUrl).toBe('');
    expect(aliasCandidates('@app/user/api', paths)).toEqual(['src/app/user/api', 'src/legacy/user/api', '@app/user/api']);
    expect(aliasCandidates('env', paths)).toEqual(['src/env.ts', 'env']);
  });

  it('resolves paths against the declaring config when there is no baseUrl, and reads a package config', () => {
    const root = createTempRepo({
      'tsconfig.json': JSON.stringify({ extends: ['@org/tsconfig', './tsconfig.paths.json'] }),
      'tsconfig.paths.json': JSON.stringify({ compilerOptions: { paths: { '~/*': ['./src/*'], 'bad/*': 'src/*', 'empty/*': [] } } }),
      'node_modules/@org/tsconfig/tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.' } }),
    });
    const paths = readCompilerPaths(root);

    expect(paths.baseUrl).toBe('node_modules/@org/tsconfig');
    expect(paths.aliases.map((alias) => alias.pattern)).toEqual(['~/*']);
    expect(aliasCandidates('~/x', paths)).toEqual(['node_modules/@org/tsconfig/src/x', 'node_modules/@org/tsconfig/~/x']);
  });

  it('prefers the longest prefix, and lets tsconfig.json hide a pattern the base also declares', () => {
    const root = createTempRepo({
      'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@lib/*': ['libs/*'], '@lib/ui/*': ['ui/*'] } } }),
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { paths: { '@lib/*': ['other/*'], '@base': ['base/index.ts'] } } }),
    });
    const paths = readCompilerPaths(root);

    expect(aliasCandidates('@lib/ui/button', paths)).toEqual(['ui/button']);
    expect(aliasCandidates('@lib/core', paths)).toEqual(['libs/core']);
    expect(aliasCandidates('@base', paths)).toEqual(['base/index.ts']);
    expect(aliasCandidates('rxjs', paths)).toEqual([]);
  });

  it('stops on an extends cycle and ignores what it cannot read', () => {
    const root = createTempRepo({
      'tsconfig.json': JSON.stringify({ extends: './a.json', compilerOptions: { paths: { 'x/*': ['x/*'] } } }),
      'a.json': JSON.stringify({ extends: ['./tsconfig.json', './missing', 42] }),
      'tsconfig.base.json': '[1, 2]',
    });

    expect(readCompilerPaths(root).aliases.map((alias) => alias.pattern)).toEqual(['x/*']);
    expect(readCompilerPaths(createTempRepo({})).aliases).toEqual([]);
  });
});

describe('buildGraph', () => {
  it('resolves tsconfig paths into repository files, and not a package import', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@app/*': ['src/app/*'] } } }),
      'src/main.ts': "import { a } from '@app/a';\nimport { b } from 'src/b';\nimport { of } from 'rxjs';",
      'src/app/a.ts': 'export const a = 1;',
      'src/b.ts': 'export const b = 1;',
    });
    const graph = buildGraph(readProfile(root));

    expect(graph.imports.get('src/main.ts')).toEqual(['src/app/a.ts', 'src/b.ts']);
    expect(graph.importedBy.get('src/app/a.ts')).toEqual(['src/main.ts']);
  });

  it('does not report a spec imported only in a comment', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@specs/*': ['src/*'] } } }),
      'src/helper.ts': "// import { user } from './fixtures.spec';\nexport const x = 1;",
      'src/other.ts': "import { user } from '@specs/fixtures.spec';",
      'src/fixtures.spec.ts': 'export const user = {};',
    });

    expect(checkSpecImports(buildGraph(readProfile(root))).map((finding) => finding.file)).toEqual(['src/other.ts']);
  });

  it('keeps texts within its budget and reads the rest from disk on each access', () => {
    const root = createTempRepo({ 'package.json': '{}', 'src/a.ts': 'const a = 1;', 'src/b.ts': 'const b = 22;' });
    const graph = buildGraph(readProfile(root), 'const a = 1;'.length);

    writeTextFile(join(root, 'src/a.ts'), 'changed a');
    writeTextFile(join(root, 'src/b.ts'), 'changed b');

    expect(graph.texts.get('src/a.ts')).toBe('const a = 1;');
    expect(graph.texts.get('src/b.ts')).toBe('changed b');
    expect(graph.texts.get('package.json')).toBeUndefined();
    expect(graph.texts.has('src/b.ts')).toBe(true);
    expect(graph.texts.size).toBe(2);
    expect([...graph.texts.keys()]).toEqual(['src/a.ts', 'src/b.ts']);
    expect([...graph.texts.values()]).toEqual(['const a = 1;', 'changed b']);

    const seen: string[] = [];

    graph.texts.forEach((text, file, map) => seen.push(`${file}=${text}=${map.size}`));

    expect(seen).toEqual(['src/a.ts=const a = 1;=2', 'src/b.ts=changed b=2']);
  });

  it('skips a text that vanished after the build while iterating', () => {
    const root = createTempRepo({ 'package.json': '{}', 'src/a.ts': 'const a = 1;' });
    const graph = buildGraph(readProfile(root), 0);

    removeFile(join(root, 'src/a.ts'));

    expect([...graph.texts]).toEqual([]);
  });
});
