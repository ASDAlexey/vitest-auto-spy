/**
 * The two checks that resolve a name against this package's own export map.
 *
 * Both claim zero false positives, so each one is pinned from both sides: the defect it must
 * report, and every neighbouring shape it must stay quiet about — a correct import, an entry this
 * version does not publish, an awaited call, a method that happens to share the name.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { entryExports, findEntryImports, installedVersion, isAwaitableHelper, ownersOf, tableApplies } from './checks/entry-imports';
import { EXPORT_MAP_VERSION } from './checks/export-map.generated';
import { buildGraph } from './checks/graph';
import { checkHelperEntry } from './checks/helper-entry';
import { isInsideLiteral, literalSpans } from './checks/literals';
import { awaitableLocals, checkUnawaitedHelper, findUnawaitedCalls } from './checks/unawaited-helper';
import { readProfile } from './profile';
import { createTempRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  removeTempRepos();
});

const checks = (findings: readonly { check: string }[]): string[] => findings.map((finding) => finding.check);

const run = (files: Readonly<Record<string, string>>): ReturnType<typeof readProfile> => readProfile(createTempRepo(files));

const helperFindings = (files: Readonly<Record<string, string>>): ReturnType<typeof checkHelperEntry> => {
  const profile = run({ 'package.json': '{}', ...files });

  return checkHelperEntry(profile, buildGraph(profile));
};

const unawaitedFindings = (files: Readonly<Record<string, string>>): ReturnType<typeof checkUnawaitedHelper> => {
  const profile = run({ 'package.json': '{}', ...files });

  return checkUnawaitedHelper(profile, buildGraph(profile));
};

describe('literalSpans', () => {
  const spansOf = (source: string): string[] => literalSpans(source).map(({ start, end }) => source.slice(start, end));

  it('reads comments before quotes, so an apostrophe in prose opens nothing', () => {
    expect(spansOf("// the package's entry\nconst a = 1;")).toEqual(["// the package's entry"]);
    expect(spansOf('// no newline after me')).toEqual(['// no newline after me']);
    expect(spansOf("/* it's fine */ const a = 1;")).toEqual(["/* it's fine */"]);
    expect(spansOf('/* never closed')).toEqual(['/* never closed']);
  });

  it('leaves a division alone and takes both quote characters, escapes included', () => {
    expect(spansOf('const a = b / c;')).toEqual([]);
    expect(spansOf('a = "x\\"y"; b = \'z\';')).toEqual(['"x\\"y"', "'z'"]);
  });

  it('takes a template whole, through an interpolation holding a string that holds a backtick', () => {
    expect(spansOf('const a = `x ${ "y`z" } w`;')).toEqual(['`x ${ "y`z" } w`']);
    expect(spansOf('const a = `x ${ `y` } w`;')).toEqual(['`x ${ `y` } w`']);
    expect(spansOf('const a = `x ${ { y: 1 } } w`;')).toEqual(['`x ${ { y: 1 } } w`']);
  });

  it('takes what it can when a template, an interpolation or an escape runs off the end', () => {
    expect(spansOf('const a = `x$y`;')).toEqual(['`x$y`']);
    expect(spansOf('const a = `x\\`y`;')).toEqual(['`x\\`y`']);
    expect(spansOf('const a = `never closed')).toEqual(['`never closed']);
    expect(spansOf('const a = `x ${ never closed')).toEqual(['`x ${ never closed']);
  });
});

describe('isInsideLiteral', () => {
  it('answers for an offset before, inside and after a span', () => {
    const source = 'a = "x"; b = "y";';
    const spans = literalSpans(source);

    expect(isInsideLiteral(spans, 0)).toBe(false);
    expect(isInsideLiteral(spans, 5)).toBe(true);
    expect(isInsideLiteral(spans, 12)).toBe(false);
  });
});

describe('findEntryImports', () => {
  it('reads a multi-line clause, an inline type specifier and a rename', () => {
    const source = ['import {', '  provideAutoSpy,', '  type Spy,', '  injectSpy as spy,', "} from 'vitest-auto-spy/angular';"].join('\n');

    expect(findEntryImports(source)).toEqual([
      { entry: 'vitest-auto-spy/angular', name: 'provideAutoSpy', local: 'provideAutoSpy' },
      { entry: 'vitest-auto-spy/angular', name: 'Spy', local: 'Spy' },
      { entry: 'vitest-auto-spy/angular', name: 'injectSpy', local: 'spy' },
    ]);
  });

  it('reads an `import type` clause and tolerates the trailing comma it leaves behind', () => {
    expect(findEntryImports("import type { Spy, } from 'vitest-auto-spy';")).toEqual([
      { entry: 'vitest-auto-spy', name: 'Spy', local: 'Spy' },
    ]);
  });

  it('ignores a namespace import, a side-effect import and another package', () => {
    const source = [
      "import * as autoSpy from 'vitest-auto-spy';",
      "import 'vitest-auto-spy/setup';",
      "import { provideAutoSpy } from 'some-other-package';",
    ].join('\n');

    expect(findEntryImports(source)).toEqual([]);
  });

  it('ignores an import statement that is quoted or commented out rather than run', () => {
    const quoted = [
      'const fixture = "import { provideAutoSpy } from \'vitest-auto-spy\';";',
      "const template = `import { injectSpy } from 'vitest-auto-spy';`;",
      "// import { stable } from 'vitest-auto-spy';",
      "/* import { expectRequest } from 'vitest-auto-spy'; */",
    ].join('\n');

    expect(findEntryImports(quoted)).toEqual([]);
  });

  it('still reads a real import that follows a comment carrying an apostrophe', () => {
    const source = ["// the package's own entry", "import { provideAutoSpy } from 'vitest-auto-spy/angular';"].join('\n');

    expect(findEntryImports(source)).toEqual([{ entry: 'vitest-auto-spy/angular', name: 'provideAutoSpy', local: 'provideAutoSpy' }]);
  });
});

describe('the generated table', () => {
  it('knows which entry owns a name, and admits when it knows nothing about one', () => {
    expect(ownersOf('provideAutoSpy')).toEqual([
      'vitest-auto-spy/bun-angular',
      'vitest-auto-spy/jasmine',
      'vitest-auto-spy/angular',
      'vitest-auto-spy/nestjs',
      'vitest-auto-spy/vue',
    ]);
    expect(ownersOf('nothingCalledThis')).toEqual([]);
    expect(entryExports('vitest-auto-spy')?.has('createSpyFromClass')).toBe(true);
    expect(entryExports('vitest-auto-spy/nope')).toBeUndefined();
  });

  it('derives the awaitable helpers from the signatures rather than a hand-written list', () => {
    expect(isAwaitableHelper('expectEmission')).toBe(true);
    expect(isAwaitableHelper('stable')).toBe(true);
    expect(isAwaitableHelper('createSpyFromClass')).toBe(false);
  });
});

describe('installedVersion', () => {
  const manifest = (version: string): string => JSON.stringify({ version });

  it('reads the version from the nearest node_modules, walking up to find it', () => {
    const root = createTempRepo({
      'node_modules/vitest-auto-spy/package.json': manifest('9.9.9'),
      'packages/app/src/app.spec.ts': '',
    });

    expect(installedVersion(root)).toBe('9.9.9');
    expect(installedVersion(`${root}/packages/app`)).toBe('9.9.9');
  });

  it('returns undefined when no node_modules copy is reachable', () => {
    expect(installedVersion(createTempRepo({ 'package.json': '{}' }))).toBeUndefined();
  });
});

describe('tableApplies', () => {
  const withVersion = (version: string): string =>
    createTempRepo({ 'package.json': '{}', 'node_modules/vitest-auto-spy/package.json': JSON.stringify({ version }) });

  it('applies to the major it was generated from', () => {
    expect(tableApplies(withVersion(EXPORT_MAP_VERSION))).toBe(true);
  });

  it('does not apply to a different major', () => {
    expect(tableApplies(withVersion('3.9.1'))).toBe(false);
  });

  it('falls back to applying when the installed version cannot be read as one', () => {
    expect(tableApplies(withVersion('next'))).toBe(true);
  });
});

describe('checkHelperEntry', () => {
  it('reports a helper imported from an entry that does not export it', () => {
    const findings = helperFindings({ 'src/a.spec.ts': "import { provideAutoSpy } from 'vitest-auto-spy';" });

    expect(checks(findings)).toEqual(['helper-from-wrong-entry']);
    expect(findings[0]?.message).toContain('`provideAutoSpy` from `vitest-auto-spy`');
    expect(findings[0]?.fix).toContain('`vitest-auto-spy/angular` or `vitest-auto-spy/nestjs`');
  });

  it('names only the repository own entry when that is one of the candidates', () => {
    const profile = run({
      'package.json': JSON.stringify({ devDependencies: { '@nestjs/core': '11.0.0' } }),
      'src/a.spec.ts': "import { provideAutoSpy } from 'vitest-auto-spy';",
    });
    const findings = checkHelperEntry(profile, buildGraph(profile));

    expect(findings[0]?.fix).toContain('Change the specifier to `vitest-auto-spy/nestjs`.');
  });

  it('reports the sibling case: a root-only helper imported from an adapter entry', () => {
    const findings = helperFindings({ 'src/a.spec.ts': "import { flushEventLoop } from 'vitest-auto-spy/angular';" });

    expect(findings[0]?.fix).toContain('Change the specifier to `vitest-auto-spy`.');
  });

  it('stays quiet about a correct import, an unpublished entry, an unknown name and a quoted one', () => {
    const findings = helperFindings({
      'src/correct.spec.ts': "import { provideAutoSpy } from 'vitest-auto-spy/angular';",
      'src/future.spec.ts': "import { provideAutoSpy } from 'vitest-auto-spy/future';",
      'src/unknown.spec.ts': "import { somethingElse } from 'vitest-auto-spy';",
      'src/quoted.spec.ts': 'const fixture = "import { provideAutoSpy } from \'vitest-auto-spy\';";',
    });

    expect(findings).toEqual([]);
  });

  it('stays quiet when the installed copy is a different major from the table', () => {
    const findings = helperFindings({
      'node_modules/vitest-auto-spy/package.json': JSON.stringify({ version: '3.9.1' }),
      'src/a.spec.ts': "import { provideAutoSpy } from 'vitest-auto-spy';",
    });

    expect(findings).toEqual([]);
  });
});

describe('awaitableLocals', () => {
  it('keeps the renamed binding, drops a helper that returns no promise and de-duplicates', () => {
    const source = [
      "import { expectEmission as emits, createSpyFromClass } from 'vitest-auto-spy';",
      "import { stable } from 'vitest-auto-spy/angular';",
      "import { stable as settle } from 'vitest-auto-spy/angular';",
    ].join('\n');

    expect(awaitableLocals(source)).toEqual(['emits', 'stable', 'settle']);
  });
});

describe('findUnawaitedCalls', () => {
  it('has nothing to look for when the file imports no awaitable helper', () => {
    expect(findUnawaitedCalls('stable();', [])).toEqual([]);
  });

  it('flags a call that both begins and ends a statement, wherever the statement starts', () => {
    expect(findUnawaitedCalls('stable();', ['stable'])).toEqual(['stable']);
    expect(findUnawaitedCalls('it("a", async () => {\n  stable();\n});', ['stable'])).toEqual(['stable']);
    expect(findUnawaitedCalls('stable()', ['stable'])).toEqual(['stable']);
    expect(findUnawaitedCalls('stable() ;', ['stable'])).toEqual(['stable']);
  });

  it('reads through a nested call and a string argument carrying an unbalanced parenthesis', () => {
    expect(findUnawaitedCalls('expectError(makeFn(), "x");', ['expectError'])).toEqual(['expectError']);
  });

  it('reads through a string argument that carries an unbalanced parenthesis', () => {
    expect(findUnawaitedCalls('expectError(fn, ")");', ['expectError'])).toEqual(['expectError']);
    expect(findUnawaitedCalls("expectError(fn, '(');", ['expectError'])).toEqual(['expectError']);
    expect(findUnawaitedCalls('expectError(fn, `)`);', ['expectError'])).toEqual(['expectError']);
  });

  it('leaves alone every shape the value can still flow out of', () => {
    expect(findUnawaitedCalls('await stable();', ['stable'])).toEqual([]);
    expect(findUnawaitedCalls('const done = stable();', ['stable'])).toEqual([]);
    expect(findUnawaitedCalls('return stable();', ['stable'])).toEqual([]);
    expect(findUnawaitedCalls('it("a", () => stable());', ['stable'])).toEqual([]);
    expect(findUnawaitedCalls('void stable();', ['stable'])).toEqual([]);
    expect(findUnawaitedCalls('{ stable().catch(noop); }', ['stable'])).toEqual([]);
  });

  it('leaves alone a call that is quoted or commented out rather than run', () => {
    expect(findUnawaitedCalls('const fixture = "{ stable(); }";', ['stable'])).toEqual([]);
    expect(findUnawaitedCalls('const fixture = `{ stable(); }`;', ['stable'])).toEqual([]);
    expect(findUnawaitedCalls('/* { stable(); } */', ['stable'])).toEqual([]);
  });

  it('leaves alone a method of the same name and a call it cannot see the end of', () => {
    expect(findUnawaitedCalls('const helpers = { stable() { return 1; } };', ['stable'])).toEqual([]);
    expect(findUnawaitedCalls('stable(', ['stable'])).toEqual([]);
  });
});

describe('checkUnawaitedHelper', () => {
  it('reports the dropped promise once per helper per file', () => {
    const findings = unawaitedFindings({
      'src/a.spec.ts': ["import { expectEmission } from 'vitest-auto-spy';", 'expectEmission(a, 1);', 'expectEmission(b, 2);'].join('\n'),
    });

    expect(checks(findings)).toEqual(['no-unawaited-helper']);
    expect(findings[0]?.message).toContain('`expectEmission()`');
  });

  it('stays quiet when the call is awaited, and when the installed copy is a different major', () => {
    expect(
      unawaitedFindings({
        'src/a.spec.ts': ["import { expectEmission } from 'vitest-auto-spy';", 'await expectEmission(a, 1);'].join('\n'),
      }),
    ).toEqual([]);

    expect(
      unawaitedFindings({
        'node_modules/vitest-auto-spy/package.json': JSON.stringify({ version: '3.9.1' }),
        'src/a.spec.ts': ["import { expectEmission } from 'vitest-auto-spy';", 'expectEmission(a, 1);'].join('\n'),
      }),
    ).toEqual([]);
  });
});
