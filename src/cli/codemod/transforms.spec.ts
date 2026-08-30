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
    ['provideAutoSpy', ['vitest-auto-spy/angular', 'vitest-auto-spy/nestjs']],
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

describe('jest-types — the argument-order trap', () => {
  it('transposes the return type and the argument tuple into a call signature', () => {
    expect(apply('let f: jest.Mock<void, [AdjustedSubscriptionDetails]>;', jestTypes)).toContain(
      'let f: Mock<(arg0: AdjustedSubscriptionDetails) => void>;',
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

  it('does not choose between two non-root entries', () => {
    expect(notesOf("import { shared } from 'jest-auto-spies';", autoSpiesImport)[0]).toContain('unmapped-legacy-export');
  });

  it('leaves the statement untouched when every name is unresolved', () => {
    const source = "import { createSpyObj } from 'jest-auto-spies';";

    expect(apply(source, autoSpiesImport)).toBe(source);
  });

  it('refuses a namespace import and a run with no entry table, and says which it was', () => {
    expect(notesOf("import * as autoSpies from 'jest-auto-spies';", autoSpiesImport)[0]).toContain('unsplittable-import');
    expect(notesWithoutTable("import { Spy } from 'jest-auto-spies';", autoSpiesImport)[0]).toContain('no-entry-table');
  });

  it('reads a specifier list off the braces', () => {
    expect(parseSpecifiers('{ a, type B as C }', [0, 18])).toEqual([
      { raw: 'a', imported: 'a' },
      { raw: 'type B as C', imported: 'B' },
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
