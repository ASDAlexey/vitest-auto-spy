/**
 * Every transform, on a string.
 *
 * The `jest.Mock` cases carry the most weight in this file. Jest writes the return type first and
 * the argument tuple second; Vitest takes a single call signature, so a rename that leaves the type
 * arguments where they were compiles cleanly into the reverse meaning and nothing fails until a
 * call site disagrees. The assertions below therefore read the transposed text in full rather than
 * checking that something changed.
 */
import { describe, expect, it } from 'vitest';

import { runTransforms } from './codemod';
import { hintFor } from './entry-hint';
import type { EntryMap } from './entry-map';
import { maskCode } from './mask';
import type { TransformContext, TransformSpec } from './transform-context';
import { group, scan, textOf } from './transform-context';
import { jasmineAliases, jestGlobalsImport, jestNamespace, jestTypes, mockImplementationArity, signature } from './transforms-jest';
import { autoSpiesImport, castAt, injectCast, parseSpecifiers } from './transforms-spies';

const ENTRIES: EntryMap = {
  source: 'test',
  byName: new Map([
    ['Spy', ['vitest-auto-spy']],
    ['asSpy', ['vitest-auto-spy']],
    ['createSpyFromClass', ['vitest-auto-spy']],
    ['provideAutoSpy', ['vitest-auto-spy/bun-angular', 'vitest-auto-spy/angular', 'vitest-auto-spy/nestjs']],
    ['nextWith', ['vitest-auto-spy/rxjs']],
    ['shared', ['vitest-auto-spy/vue', 'vitest-auto-spy/svelte']],
  ]),
};

function contextFor(source: string, entries: EntryMap | undefined = ENTRIES): TransformContext {
  return { file: 'a.spec.ts', source, masked: maskCode(source), entries, preferredEntry: 'vitest-auto-spy/angular' };
}

/** One transform, applied. The runner is used so the import plan is part of what is asserted. */
function apply(source: string, transform: TransformSpec, entries: EntryMap | undefined = ENTRIES): string {
  return runTransforms({ file: 'a.spec.ts', source, entries, preferredEntry: 'vitest-auto-spy/angular', selected: [transform] }).after;
}

function notesOf(source: string, transform: TransformSpec): string[] {
  return transform.run(contextFor(source)).notes.map((note) => `${note.check} ${note.message}`);
}

/** The same, with no installed copy of the package to read an export map from. */
function notesWithoutTable(source: string, transform: TransformSpec): string[] {
  return transform.run({ ...contextFor(source), entries: undefined }).notes.map((note) => `${note.check} ${note.message}`);
}

/**
 * The same, in a repository whose `package.json` names no framework — which is where the
 * multi-entry names have nothing but the file itself to go on.
 */
function applyPlain(source: string, transform: TransformSpec): string {
  return runTransforms({ file: 'a.spec.ts', source, entries: ENTRIES, preferredEntry: 'vitest-auto-spy', selected: [transform] }).after;
}

function notesPlain(source: string, transform: TransformSpec): string[] {
  return transform.run({ ...contextFor(source), preferredEntry: 'vitest-auto-spy' }).notes.map((note) => `${note.check} ${note.message}`);
}

describe('jest-types — the argument-order trap', () => {
  it('transposes the return type and the argument tuple into a call signature', () => {
    expect(apply('let f: jest.Mock<void, [AdjustedPlanDetails]>;', jestTypes)).toContain(
      'let f: Mock<(arg0: AdjustedPlanDetails) => void>;',
    );
  });

  it('keeps a labelled tuple element, its optionality and its rest', () => {
    const source = 'let f: jest.Mock<Promise<string[]>, [id: number, force?: boolean, ...rest: string[]]>;';

    expect(apply(source, jestTypes)).toContain('Mock<(id: number, force?: boolean, ...rest: string[]) => Promise<string[]>>');
  });

  it('numbers an unlabelled element and keeps an unlabelled optional', () => {
    expect(apply('let f: jest.Mock<void, [string, number?]>;', jestTypes)).toContain('Mock<(arg0: string, arg1?: number) => void>');
  });

  it('spreads a tuple it cannot expand rather than inventing one', () => {
    expect(apply('let f: jest.Mock<any, any>;', jestTypes)).toContain('Mock<(...args: any) => any>');
    expect(apply('let f: jest.Mock<void, Args>;', jestTypes)).toContain('Mock<(...args: Args) => void>');
    expect(apply('let f: jest.Mock<void, [A, ]>;', jestTypes)).toContain('Mock<(...args: [A, ]) => void>');
  });

  it('reads a single type argument as the return type, and an empty tuple as no parameters', () => {
    expect(apply('let f: jest.Mock<string>;', jestTypes)).toContain('Mock<() => string>');
    expect(apply('let f: jest.Mock<void, []>;', jestTypes)).toContain('Mock<() => void>');
  });

  it('leaves the bare name alone, because on its own it already means the same thing', () => {
    expect(apply('let f: jest.Mock;', jestTypes)).toBe("import type { Mock } from 'vitest';\nlet f: Mock;");
  });

  it('renames the three plain ones and moves SpyInstance to MockInstance', () => {
    expect(
      apply('let a: jest.Mocked<S>; let b: jest.MockedFunction<F>; let c: jest.MockedClass<C>; let d: jest.MockedObject<O>;', jestTypes),
    ).toContain('let a: Mocked<S>; let b: MockedFunction<F>; let c: MockedClass<C>; let d: MockedObject<O>;');
    expect(apply('let w: jest.SpyInstance<void, [Event]>;', jestTypes)).toContain('MockInstance<(arg0: Event) => void>');
  });

  it('imports exactly the Vitest names it used, as one type import', () => {
    expect(apply('let a: jest.Mocked<S>;\nlet b: jest.Mock;\n', jestTypes).split('\n')[0]).toBe(
      "import type { Mock, Mocked } from 'vitest';",
    );
  });

  it('refuses, with an error, a type argument list it cannot split', () => {
    expect(notesOf('let f: jest.Mock<void, [A], extra>;', jestTypes)).toEqual([
      'jest-mock-type-arguments `jest.Mock` here has a type argument list this codemod will not transpose.',
    ]);
    expect(apply('let f: jest.Mock<void, [A], extra>;', jestTypes)).toBe('let f: jest.Mock<void, [A], extra>;');
  });

  it('leaves an unbalanced type argument list exactly as it was', () => {
    expect(apply('let f: jest.Mock<void, [A];', jestTypes)).toContain('let f: Mock<void, [A];');
  });

  it('answers undefined for an empty argument list', () => {
    expect(signature(contextFor('x'), 'Mock', [])).toBeUndefined();
  });

  it('renames without transposing where the jest is the one from @jest/globals, which already takes the function type', () => {
    const source = "import { jest } from '@jest/globals';\nlet m: jest.Mock<() => string>;\n";

    expect(apply(source, jestTypes)).toContain('let m: Mock<() => string>;');
    expect(notesOf(source, jestTypes)).toEqual([]);
  });

  it('reports the type arguments of a generic jest.fn or jest.spyOn, which the rename carries across unchanged', () => {
    expect(notesOf('const a = jest.fn<string, [number]>();', jestTypes)).toEqual([
      'jest-mock-type-arguments `jest.fn` here has a type argument list this codemod will not transpose.',
    ]);
    expect(notesOf("jest.spyOn<Api, 'load'>(api, 'load');", jestTypes)[0]).toContain('`jest.spyOn`');
    expect(notesOf('const a = jest.fn();', jestTypes)).toEqual([]);
  });
});

describe('jest-namespace', () => {
  it('renames the members that have a vi twin, including the one that changed name', () => {
    const source = 'jest.fn(); jest.spyOn(a, "b"); jest.useFakeTimers(); jest.dontMock("pkg");';

    expect(apply(source, jestNamespace)).toBe('vi.fn(); vi.spyOn(a, "b"); vi.useFakeTimers(); vi.doUnmock("pkg");');
  });

  it('leaves a member with no vi twin alone and says what to do instead', () => {
    expect(apply('jest.requireMock("x");', jestNamespace)).toBe('jest.requireMock("x");');
    expect(notesOf('jest.replaceProperty(o, "k", 1);', jestNamespace)).toEqual(['no-vi-twin `jest.replaceProperty` was left alone.']);
  });

  it('leaves a member it does not know rather than guessing', () => {
    expect(notesOf('jest.frobnicate();', jestNamespace)).toEqual(['unknown-jest-member `jest.frobnicate` was left alone.']);
  });

  it('renames a module mock of a relative path but warns that the boundary is gone', () => {
    const notes = notesOf('jest.mock("./service");', jestNamespace);

    expect(apply('jest.mock("./service");', jestNamespace)).toBe('vi.mock("./service");');
    expect(notes[0]).toContain('module-mock-of-a-relative-path');
    expect(notesOf('jest.mock("some-package");', jestNamespace)).toEqual([]);
    expect(notesOf('jest.unmock(name);', jestNamespace)).toEqual([]);
  });

  it('never touches a mention inside a comment or a string', () => {
    const source = ['// jest.fn()', 'const a = "jest.fn()";'].join('\n');

    expect(apply(source, jestNamespace)).toBe(source);
  });

  it('reports each Jest-only fake-timer option, which Vitest would ignore in silence', () => {
    const source = 'jest.useFakeTimers({ doNotFake: ["nextTick"], legacyFakeTimers: false, timerLimit: 10, advanceTimers: true, now: 0 });';
    const notes = notesOf(source, jestNamespace);

    expect(apply(source, jestNamespace)).toBe(source.replace('jest.', 'vi.'));
    expect(notes).toEqual([
      'fake-timers-option `advanceTimers` is a Jest option; `vi.useFakeTimers` ignores it without an error.',
      'fake-timers-option `doNotFake` is a Jest option; `vi.useFakeTimers` ignores it without an error.',
      'fake-timers-option `legacyFakeTimers` is a Jest option; `vi.useFakeTimers` ignores it without an error.',
      'fake-timers-option `timerLimit` is a Jest option; `vi.useFakeTimers` ignores it without an error.',
    ]);
    expect(notesOf('jest.useFakeTimers({ now: 0, toFake: ["Date"] });', jestNamespace)).toEqual([]);
    expect(notesOf('const f = jest.useFakeTimers;', jestNamespace)).toEqual([]);
    expect(notesOf('jest.useFakeTimers(options.timerLimit);', jestNamespace)).toEqual([]);
    expect(notesOf('jest.fn({ timerLimit: 1 });', jestNamespace)).toEqual([]);
    expect(notesOf('jest.useFakeTimers({ timerLimit: 1 ', jestNamespace)).toEqual([]);
  });

  it('leaves a jest call inside a template nested in a substitution, and the residue names it', () => {
    const source = 'const a = `${`jest.fn()`}`;\n';
    const result = runTransforms({
      file: 'a.spec.ts',
      source,
      entries: ENTRIES,
      preferredEntry: 'vitest-auto-spy',
      selected: [jestNamespace],
    });

    expect(result.after).toBe(source);
    expect(result.residue.map((finding) => finding.check)).toEqual(['residue/jest-namespace']);
  });

  it('leaves the type members to the transform that owns them', () => {
    expect(apply('let a: jest.Mocked<S>;', jestNamespace)).toBe('let a: jest.Mocked<S>;');
  });
});

describe('mock-implementation-arity and the jasmine aliases', () => {
  it('installs the no-op Jest installed for you', () => {
    expect(apply('spy.mockImplementation();\nspy.mockImplementationOnce( );', mockImplementationArity)).toBe(
      'spy.mockImplementation(() => undefined);\nspy.mockImplementationOnce(() => undefined);',
    );
  });

  it('leaves a call that already has its function', () => {
    expect(apply('spy.mockImplementation(() => 1);', mockImplementationArity)).toBe('spy.mockImplementation(() => 1);');
  });

  it('rewrites the globals Vitest does not have, and not a method of the same name', () => {
    expect(apply('xit("a", f);\nfdescribe("b", f);\nxdescribe("c", f);\nfit("d", f);\nxtest("e", f);', jasmineAliases)).toBe(
      'it.skip("a", f);\ndescribe.only("b", f);\ndescribe.skip("c", f);\nit.only("d", f);\ntest.skip("e", f);',
    );
    expect(apply('shape.fit(box);', jasmineAliases)).toBe('shape.fit(box);');
  });

  it('leaves a declaration of the same name alone, where a rename would be a syntax error', () => {
    const method = 'class Helper {\n  fit(size: number) { return size; }\n}';

    expect(apply(method, jasmineAliases)).toBe(method);
    expect(apply('function xit(name: string): void {}', jasmineAliases)).toBe('function xit(name: string): void {}');
  });
});

describe('jest-globals-import', () => {
  it('moves the import to vitest and renames the jest binding', () => {
    expect(apply("import { describe, it, jest } from '@jest/globals';", jestGlobalsImport)).toBe(
      "import { describe, it, vi } from 'vitest';",
    );
  });

  it('handles a side-effect import of the same package', () => {
    expect(apply("import '@jest/globals';", jestGlobalsImport)).toBe("import 'vitest';");
  });
});

describe('auto-spies-import — the split', () => {
  it('splits the legacy import across the entries the installed export map names', () => {
    const source = "import { createSpyFromClass, provideAutoSpy, Spy } from 'jest-auto-spies';\n";

    expect(apply(source, autoSpiesImport)).toBe(
      "import { createSpyFromClass, Spy } from 'vitest-auto-spy';\nimport { provideAutoSpy } from 'vitest-auto-spy/angular';\n",
    );
  });

  it('keeps a line comment on its specifier without commenting out the clause', () => {
    // The one-line rejoin used to put the closing `}` and the whole `from '…'` inside the comment,
    // emitting a statement that no longer parses while the residue check — which now also lives in
    // the comment — reported the file as fully migrated.
    const source = [
      'import {',
      '  createSpyFromClass,',
      '  provideAutoSpy, // eslint-disable-line no-restricted-imports',
      "} from 'jest-auto-spies';",
    ].join('\n');

    const result = apply(source, autoSpiesImport);

    expect(result).toBe(
      [
        "import { createSpyFromClass } from 'vitest-auto-spy';",
        'import {',
        '  provideAutoSpy, // eslint-disable-line no-restricted-imports',
        "} from 'vitest-auto-spy/angular';",
      ].join('\n'),
    );
  });

  it('puts one specifier per line once any of them carries a comment, commented or not', () => {
    const source = ['import {', '  createSpyFromClass,', '  Spy, // the type, not the factory', "} from 'jest-auto-spies';"].join('\n');

    expect(apply(source, autoSpiesImport)).toBe(
      ['import {', '  createSpyFromClass,', '  Spy, // the type, not the factory', "} from 'vitest-auto-spy';"].join('\n'),
    );
  });

  it('ignores the empty range a trailing comma leaves behind', () => {
    const source = "import { createSpyFromClass, Spy, } from 'jest-auto-spies';";

    expect(apply(source, autoSpiesImport)).toBe("import { createSpyFromClass, Spy } from 'vitest-auto-spy';");
  });

  it('does not split a specifier list on a comma inside a comment', () => {
    const source = "import { createSpyFromClass, Spy } from 'jest-auto-spies'; // keep both, always";

    const result = apply(source, autoSpiesImport);

    expect(result).toBe("import { createSpyFromClass, Spy } from 'vitest-auto-spy'; // keep both, always");
  });

  it('puts the root entry first however the clause ordered the names, then the subpaths in order', () => {
    expect(apply("import { provideAutoSpy, Spy } from 'jest-auto-spies';", autoSpiesImport)).toBe(
      "import { Spy } from 'vitest-auto-spy';\nimport { provideAutoSpy } from 'vitest-auto-spy/angular';",
    );
    expect(apply("import { nextWith, provideAutoSpy } from 'jest-auto-spies';", autoSpiesImport)).toBe(
      "import { provideAutoSpy } from 'vitest-auto-spy/angular';\nimport { nextWith } from 'vitest-auto-spy/rxjs';",
    );
  });

  it('carries an alias and an inline type modifier across untouched, and covers the bugsplat fork', () => {
    const source = "import { createSpyFromClass as make, type Spy } from '@bugsplat/vitest-auto-spies';";

    expect(apply(source, autoSpiesImport)).toBe("import { createSpyFromClass as make, type Spy } from 'vitest-auto-spy';");
  });

  it('keeps `import type` as `import type`', () => {
    expect(apply("import type { Spy } from 'jest-auto-spies';", autoSpiesImport)).toBe("import type { Spy } from 'vitest-auto-spy';");
  });

  it('leaves a name no entry exports where it was, and reports it', () => {
    const source = "import { createSpyFromClass, createSpyObj } from 'jest-auto-spies';";

    expect(apply(source, autoSpiesImport)).toBe(
      "import { createSpyFromClass } from 'vitest-auto-spy';\nimport { createSpyObj } from 'jest-auto-spies';",
    );
    expect(notesOf(source, autoSpiesImport)[0]).toContain('unmapped-legacy-export');
  });

  it('places a name several entries export, instead of reporting that none of them does', () => {
    const source = "import { provideAutoSpy } from 'jest-auto-spies';";

    expect(applyPlain(source, autoSpiesImport)).toBe("import { provideAutoSpy } from 'vitest-auto-spy/angular';");
    expect(notesPlain(source, autoSpiesImport)[0]).toContain('ambiguous-entry-point');
    expect(notesPlain(source, autoSpiesImport)[0]).toContain('3 entry points');
  });

  it('names the alternatives it did not take, and never calls the name unexported', () => {
    const note = autoSpiesImport.run({ ...contextFor("import { shared } from 'jest-auto-spies';"), preferredEntry: 'vitest-auto-spy' })
      .notes[0];

    expect(note?.severity).toBe('warning');
    expect(note?.message).not.toContain('No entry point');
    expect(note?.fix).toContain("Placed on 'vitest-auto-spy/vue'");
    expect(note?.fix).toContain("'vitest-auto-spy/svelte'");
  });

  it('lets the file decide it silently — the framework it is written against, or the entry it already uses', () => {
    const angular = ["import { provideAutoSpy } from 'jest-auto-spies';", 'TestBed.configureTestingModule({});'].join('\n');
    const nest = ["import { provideAutoSpy } from 'jest-auto-spies';", "import { Test } from '@nestjs/testing';"].join('\n');
    const already = ["import { provideAutoSpy } from 'jest-auto-spies';", "import { injectSpy } from 'vitest-auto-spy/nestjs';"].join('\n');

    expect(applyPlain(angular, autoSpiesImport)).toContain("import { provideAutoSpy } from 'vitest-auto-spy/angular';");
    expect(notesPlain(angular, autoSpiesImport)).toEqual([]);
    expect(applyPlain(nest, autoSpiesImport)).toContain("import { provideAutoSpy } from 'vitest-auto-spy/nestjs';");
    expect(notesPlain(nest, autoSpiesImport)).toEqual([]);
    expect(applyPlain(already, autoSpiesImport)).toContain("import { provideAutoSpy } from 'vitest-auto-spy/nestjs';");
  });

  it('still reports, as an error, a name no entry point exports at all', () => {
    expect(notesOf("import { createSpyObj } from 'jest-auto-spies';", autoSpiesImport)[0]).toContain('unmapped-legacy-export');
  });

  it('leaves the statement untouched when every name is unresolved', () => {
    const source = "import { createSpyObj } from 'jest-auto-spies';";

    expect(apply(source, autoSpiesImport)).toBe(source);
  });

  it('refuses a namespace import and a run with no entry table, and says which it was', () => {
    expect(notesOf("import * as autoSpies from 'jest-auto-spies';", autoSpiesImport)[0]).toContain('unsplittable-import');
    expect(notesWithoutTable("import { Spy } from 'jest-auto-spies';", autoSpiesImport)[0]).toContain('no-entry-table');
  });

  it('keeps a comment above the first specifier on its own line, where the clause still parses', () => {
    const source = ['import {', '  // helpers', '  createSpyFromClass,', '  Spy,', "} from 'jest-auto-spies';"].join('\n');

    expect(apply(source, autoSpiesImport)).toBe(
      ['import {', '  // helpers', '  createSpyFromClass,', '  Spy,', "} from 'vitest-auto-spy';"].join('\n'),
    );
  });

  it('keeps a comment after a comma on the specifier before it, and a comment above one on its own line', () => {
    const source = ['import {', '  createSpyFromClass, // factory', '  /* the type */', '  Spy,', "} from 'jest-auto-spies';"].join('\n');

    expect(apply(source, autoSpiesImport)).toBe(
      ['import {', '  createSpyFromClass, // factory', '  /* the type */', '  Spy,', "} from 'vitest-auto-spy';"].join('\n'),
    );
  });

  it('reads a specifier list off the braces', () => {
    expect(parseSpecifiers('{ a, type B as C }', [0, 18])).toEqual([
      { raw: 'a', imported: 'a', lead: '' },
      { raw: 'type B as C', imported: 'B', lead: '' },
    ]);
  });
});

describe('inject-cast', () => {
  it('rewrites the cast as the call and carries the type arguments across', () => {
    const source = "import { Spy } from 'vitest-auto-spy';\nconst s: Spy<S> = TestBed.inject(S) as Spy<S>;\n";

    expect(apply(source, injectCast)).toBe(
      "import { Spy, asSpy } from 'vitest-auto-spy';\nconst s: Spy<S> = asSpy<S>(TestBed.inject(S));\n",
    );
  });

  it('handles the double cast the compiler error used to be silenced with, and drops the orphaned Spy', () => {
    const source = "import { Spy } from 'vitest-auto-spy';\nconst s = TestBed.inject(S) as unknown as Spy<S>;\n";

    expect(apply(source, injectCast)).toBe("import { asSpy } from 'vitest-auto-spy';\nconst s = asSpy<S>(TestBed.inject(S));\n");
  });

  it('reports a cast over anything else rather than wrapping it', () => {
    expect(notesOf('const s = {} as Spy<S>;', injectCast)[0]).toContain('spy-cast-not-on-inject');
    expect(apply('const s = {} as Spy<S>;', injectCast)).toBe('const s = {} as Spy<S>;');
  });

  it('leaves an inject with no cast, and one whose brackets do not balance', () => {
    expect(apply('const s = TestBed.inject(S);', injectCast)).toBe('const s = TestBed.inject(S);');
    expect(castAt(contextFor('TestBed.inject(S as Spy<S>;'), 0, 15)).toBeUndefined();
    expect(castAt(contextFor('TestBed.inject(S) as Spy<S;'), 0, 15)).toBeUndefined();
  });

  it('says why it cannot add the import when there is no entry table', () => {
    expect(notesWithoutTable('const s = TestBed.inject(S) as Spy<S>;', injectCast)[0]).toContain('no-entry-table');
    expect(notesWithoutTable('const s = TestBed.inject(S);', injectCast)).toEqual([]);
  });
});

describe('hintFor', () => {
  it('collects the entries of this package the file already imports from, and nothing else', () => {
    const source = [
      "import { injectSpy } from 'vitest-auto-spy/angular';",
      "import { Spy } from 'vitest-auto-spy';",
      "import { Service } from './service';",
    ].join('\n');

    // `vitest-auto-spy/angular` is an *entry*, not a framework marker: an import of this package
    // says which adapter the spec uses and nothing about what the spec is written against. The
    // root is left out because it is never a candidate — it wins before the file is ever asked.
    expect(hintFor(contextFor(source))).toEqual({ imported: ['vitest-auto-spy/angular'], framework: undefined });
  });

  it('recognises each framework by the marker only that framework has', () => {
    expect(hintFor(contextFor('TestBed.inject(S);')).framework).toBe('angular');
    expect(hintFor(contextFor('provideAutoSpyForToken(TOKEN);')).framework).toBe('angular');
    expect(hintFor(contextFor('Test.createTestingModule({});')).framework).toBe('nestjs');
    expect(hintFor(contextFor("import { Test } from '@nestjs/testing';")).framework).toBe('nestjs');
    expect(hintFor(contextFor("import { mount } from '@vue/test-utils';")).framework).toBe('vue');
    expect(hintFor(contextFor('defineComponent({});')).framework).toBe('vue');
  });

  it('answers nothing for a file that says nothing, and is not fooled by a comment or a string', () => {
    expect(hintFor(contextFor('const a = 1;'))).toEqual({ imported: [], framework: undefined });
    expect(hintFor(contextFor('// TestBed.inject(S)\nconst help = "@nestjs/testing";')).framework).toBeUndefined();
  });
});

describe('the scan helpers', () => {
  it('answers the empty string for a group that did not take part', () => {
    const matches = scan('ab', /(a)|(b)/g);

    expect(group(matches[0]?.groups ?? [], 2)).toBe('');
    expect(group([], 9)).toBe('');
  });

  it('slices the source through the mask', () => {
    expect(textOf(contextFor('  ab  '), [0, 6])).toBe('ab');
  });
});

describe('runTransforms — the report tells what was applied', () => {
  const first: TransformSpec = {
    id: 'first',
    family: 'shared',
    summary: '',
    residue: /never-matches/,
    run: () => ({
      edits: [{ start: 0, end: 5, text: 'Alpha' }],
      needs: [{ specifier: 'x', name: 'Alpha', typeOnly: false }],
      dropIfUnused: [],
      notes: [],
    }),
  };
  const second: TransformSpec = {
    id: 'second',
    family: 'shared',
    summary: '',
    residue: /never-matches/,
    run: () => ({
      edits: [
        { start: 3, end: 8, text: 'Beta' },
        { start: 9, end: 10, text: 'Gamma' },
      ],
      needs: [
        { specifier: 'y', name: 'Beta', typeOnly: false },
        { specifier: 'y', name: 'Gamma', typeOnly: false },
      ],
      dropIfUnused: [],
      notes: [],
    }),
  };

  it('reports an overlapping edit instead of counting it, and imports only what the result still uses', () => {
    const result = runTransforms({
      file: 'a.spec.ts',
      source: 'aaaaaaaa b\n',
      entries: ENTRIES,
      preferredEntry: 'vitest-auto-spy',
      selected: [first, second],
    });

    expect(result.after).toBe("import { Beta, Gamma } from 'y';\naaaBeta Gamma\n");
    expect([...result.fired]).toEqual([['second', 2]]);
    expect(result.notes.map((finding) => `${finding.check} ${finding.file} ${finding.message}`)).toEqual([
      'overlapping-edit a.spec.ts:1 `first` wanted to rewrite "aaaaa", but another edit had already rewritten part of that span, so this one was not applied.',
    ]);
  });

  it('keeps every need of a transform that lost nothing', () => {
    const result = runTransforms({
      file: 'a.spec.ts',
      source: 'aaaaaaaa b\n',
      entries: ENTRIES,
      preferredEntry: 'vitest-auto-spy',
      selected: [first],
    });

    expect(result.after).toBe("import { Alpha } from 'x';\nAlphaaaa b\n");
    expect(result.notes).toEqual([]);
  });

  it('says so when the file declares the name a rewrite needs, rather than importing it twice', () => {
    const source = 'const asSpy = (value: unknown) => value;\nconst s = TestBed.inject(S) as Spy<S>;\n';
    const result = runTransforms({
      file: 'a.spec.ts',
      source,
      entries: ENTRIES,
      preferredEntry: 'vitest-auto-spy',
      selected: [injectCast],
    });

    expect(result.after).toBe('const asSpy = (value: unknown) => value;\nconst s = asSpy<S>(TestBed.inject(S));\n');
    expect(result.notes.map((finding) => `${finding.check} ${finding.file}`)).toEqual(['name-declared-locally a.spec.ts:1']);
  });

  it('warns about a bare vi only when the config leaves globals off and nothing imports it', () => {
    const run = (source: string, globals: boolean | undefined): string[] =>
      runTransforms({
        file: 'a.spec.ts',
        source,
        entries: ENTRIES,
        preferredEntry: 'vitest-auto-spy',
        selected: [jestNamespace],
        globals,
      }).notes.map((finding) => `${finding.check} ${finding.file}`);

    expect(run('describe("a", () => {});\njest.fn();\n', false)).toEqual(['vi-without-globals a.spec.ts:2']);
    expect(run('jest.fn();\n', true)).toEqual([]);
    expect(run('jest.fn();\n', undefined)).toEqual([]);
    expect(run("import { vi } from 'vitest';\njest.fn();\n", false)).toEqual([]);
    expect(run("import { it } from 'vitest';\nimport def from 'x';\njest.fn();\n", false)).toEqual(['vi-without-globals a.spec.ts:3']);
    expect(run('ctx.vi.fn();\n', false)).toEqual([]);
  });
});
