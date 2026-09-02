/**
 * The jasmine transforms, on a string.
 *
 * Two cases carry this file. `.and` is one namespace over two unrelated APIs, so every assertion
 * about it is written as a pair — the helper that keeps its name next to the strategy that does
 * not — because a transform that handled only one of them would still look right on its own test.
 * And `spyOn` is asserted in full rather than "it changed": jasmine stubs where `vi.spyOn` calls
 * through, so the appended `mockImplementation` is the entire content of that rewrite, and a test
 * that only checked for `vi.spyOn` would pass on the silent behaviour inversion.
 */
import { describe, expect, it } from 'vitest';

import { runTransforms, transformsFor } from './codemod';
import type { EntryMap } from './entry-map';
import { maskCode } from './mask';
import type { TransformContext, TransformSpec } from './transform-context';
import { jasmineAndHelpers, jasmineSpyOn, jasmineStrategies } from './transforms-jasmine';
import { jasmineGlobals, jasmineMatchers, jasmineTypes } from './transforms-jasmine-globals';

const ENTRIES: EntryMap = {
  source: 'test',
  byName: new Map([
    ['Spy', ['vitest-auto-spy']],
    ['createSpyObj', ['vitest-auto-spy/jasmine']],
  ]),
};

function contextFor(source: string, entries: EntryMap | undefined = ENTRIES): TransformContext {
  return { file: 'a.spec.ts', source, masked: maskCode(source), entries, preferredEntry: 'vitest-auto-spy/angular' };
}

/** The transforms, applied through the runner so the import plan is part of what is asserted. */
function applyAll(source: string, selected: readonly TransformSpec[], entries: EntryMap | undefined): string {
  return runTransforms({ file: 'a.spec.ts', source, entries, preferredEntry: 'vitest-auto-spy/angular', selected }).after;
}

function apply(source: string, transform: TransformSpec): string {
  return applyAll(source, [transform], ENTRIES);
}

function notesOf(source: string, transform: TransformSpec): string[] {
  return transform.run(contextFor(source)).notes.map((note) => `${note.check} ${note.message}`);
}

/** The same, with no installed copy of the package to read an export map from. */
function notesWithoutTable(source: string, transform: TransformSpec): string[] {
  return transform.run({ ...contextFor(source), entries: undefined }).notes.map((note) => `${note.check} ${note.message}`);
}

describe('jasmine-and-helpers — the half of `.and` that keeps its name', () => {
  it('drops the namespace in front of every auto-spies helper, and only those', () => {
    const source = [
      'spy.load.and.nextWith(1);',
      'spy.load.and.nextOneTimeWith(1);',
      'spy.load.and.nextWithValues([]);',
      'spy.load.and.nextWithPerCall([]);',
      'spy.load.and.returnSubject();',
      'spy.save.and.resolveWith(1);',
      'spy.save.and.resolveWithPerCall([]);',
      'spy.save.and.rejectWith(1);',
      'spy.load.and.throwWith(1);',
      'spy.load.and.complete();',
    ].join('\n');

    expect(apply(source, jasmineAndHelpers)).toBe(source.replace(/\.and\./g, '.'));
  });

  it('leaves jasmine’s own strategies to the transform that maps them', () => {
    expect(apply('spy.load.and.returnValue(1);', jasmineAndHelpers)).toBe('spy.load.and.returnValue(1);');
  });

  it('never mistakes a longer helper name for a shorter one', () => {
    expect(apply('spy.load.and.nextWithValues([1]);', jasmineAndHelpers)).toBe('spy.load.nextWithValues([1]);');
  });
});

describe('jasmine-strategies — the half that does not', () => {
  it('maps the three renames that carry their arguments across', () => {
    expect(apply('s.and.returnValue(1); s.and.callFake(f); s.and.resolveTo(2);', jasmineStrategies)).toBe(
      's.mockReturnValue(1); s.mockImplementation(f); s.mockResolvedValue(2);',
    );
  });

  it('installs the no-op for `stub` and expands `returnValues` into one Once per value', () => {
    expect(apply('s.and.stub();', jasmineStrategies)).toBe('s.mockImplementation(() => undefined);');
    expect(apply('s.and.returnValues(1, 2);', jasmineStrategies)).toBe('s.mockReturnValueOnce(1).mockReturnValueOnce(2);');
  });

  it('builds an Error around the message form of throwError, and throws the other two as written', () => {
    expect(apply("s.and.throwError('boom');", jasmineStrategies)).toBe("s.mockImplementation(() => { throw new Error('boom'); });");
    expect(apply('s.and.throwError(err);', jasmineStrategies)).toBe('s.mockImplementation(() => { throw err; });');
    expect(apply("s.and.throwError(HttpError, 'boom');", jasmineStrategies)).toBe(
      "s.mockImplementation(() => { throw new HttpError('boom'); });",
    );
  });

  it('reports rather than invents, for the forms it has no rewrite for', () => {
    expect(notesOf('s.and.throwError();', jasmineStrategies)).toEqual(['unknown-jasmine-strategy `.and.throwError(…)` was left alone.']);
    expect(notesOf("s.and.throwError(A, 'b', 'c');", jasmineStrategies)[0]).toContain('unknown-jasmine-strategy');
    expect(notesOf('s.and.returnValues();', jasmineStrategies)[0]).toContain('unknown-jasmine-strategy');
    expect(notesOf('s.and.frobnicate(1);', jasmineStrategies)[0]).toContain('unknown-jasmine-strategy');
  });

  it('leaves callThrough exactly as it was, and says why there is nothing to rewrite it into', () => {
    expect(apply('s.and.callThrough();', jasmineStrategies)).toBe('s.and.callThrough();');
    expect(notesOf('s.and.callThrough();', jasmineStrategies)).toEqual([
      'jasmine-call-through `.and.callThrough()` was left exactly as it was.',
    ]);
  });

  it('leaves a call whose brackets do not balance, with nothing to say about it', () => {
    expect(apply('s.and.returnValues(1, 2;', jasmineStrategies)).toBe('s.and.returnValues(1, 2;');
    expect(notesOf('s.and.returnValues(1, 2;', jasmineStrategies)).toEqual([]);
  });

  it('turns the argument matcher into the one this package spells', () => {
    expect(apply('spy.m.withArgs(1).and.returnValue(2);', jasmineStrategies)).toBe('spy.m.calledWith(1).mockReturnValue(2);');
  });
});

describe('jasmine-spy-on — the rewrite that is not a rename', () => {
  it('installs the stub jasmine installed for free', () => {
    expect(apply("spyOn(service, 'load');", jasmineSpyOn)).toBe("vi.spyOn(service, 'load').mockImplementation(() => undefined);");
  });

  it('does not add one where a strategy already replaces the implementation', () => {
    expect(applyAll("spyOn(service, 'load').and.returnValue(1);", [jasmineSpyOn, jasmineStrategies], ENTRIES)).toBe(
      "vi.spyOn(service, 'load').mockReturnValue(1);",
    );
    expect(apply("spyOn(service, 'load').mockReturnValue(1);", jasmineSpyOn)).toBe("vi.spyOn(service, 'load').mockReturnValue(1);");
  });

  it('leaves callThrough to mean what it says, since vi.spyOn already does', () => {
    expect(applyAll("spyOn(service, 'load').and.callThrough();", [jasmineSpyOn, jasmineStrategies], ENTRIES)).toBe(
      "vi.spyOn(service, 'load').and.callThrough();",
    );
  });

  it('takes the accessor form the same way', () => {
    expect(apply("spyOnProperty(service, 'ready', 'get');", jasmineSpyOn)).toBe(
      "vi.spyOn(service, 'ready', 'get').mockImplementation(() => undefined);",
    );
  });

  it('leaves an already-namespaced call, and one whose brackets do not balance', () => {
    expect(apply("vi.spyOn(service, 'load');", jasmineSpyOn)).toBe("vi.spyOn(service, 'load');");
    expect(apply("jest.spyOn(service, 'load');", jasmineSpyOn)).toBe("jest.spyOn(service, 'load');");
    expect(apply("spyOn(service, 'load';", jasmineSpyOn)).toBe("spyOn(service, 'load';");
  });
});

describe('jasmine-globals', () => {
  it('rewrites the asymmetric matchers onto expect', () => {
    const source = 'f(jasmine.any(String), jasmine.anything(), jasmine.objectContaining({}), jasmine.arrayContaining([]));';

    expect(apply(source, jasmineGlobals)).toBe(
      'f(expect.any(String), expect.anything(), expect.objectContaining({}), expect.arrayContaining([]));',
    );
    expect(apply("f(jasmine.stringMatching(/a/), jasmine.stringContaining('a'));", jasmineGlobals)).toBe(
      "f(expect.stringMatching(/a/), expect.stringContaining('a'));",
    );
  });

  it('maps the four clock members and reports the rest of the clock', () => {
    const source = 'jasmine.clock().install();\njasmine.clock().tick(100);\njasmine.clock().mockDate(d);\njasmine.clock().uninstall();';

    expect(apply(source, jasmineGlobals)).toBe(
      'vi.useFakeTimers();\nvi.advanceTimersByTime(100);\nvi.setSystemTime(d);\nvi.useRealTimers();',
    );
    expect(notesOf('jasmine.clock().withMock(f);', jasmineGlobals)[0]).toContain('`jasmine.clock().withMock` was left alone.');
    expect(notesOf('const c = jasmine.clock;', jasmineGlobals)[0]).toContain('`jasmine.clock` was left alone.');
  });

  it('drops the name from createSpy and keeps the original implementation when there is one', () => {
    expect(apply('const a = jasmine.createSpy();', jasmineGlobals)).toBe('const a = vi.fn();');
    expect(apply("const a = jasmine.createSpy('load');", jasmineGlobals)).toBe('const a = vi.fn();');
    expect(apply("const a = jasmine.createSpy('load', impl);", jasmineGlobals)).toBe('const a = vi.fn(impl);');
  });

  it('moves createSpyObj onto the entry the installed package exports it from', () => {
    expect(apply("const s = jasmine.createSpyObj('S', ['load']);", jasmineGlobals)).toBe(
      "import { createSpyObj } from 'vitest-auto-spy/jasmine';\nconst s = createSpyObj('S', ['load']);",
    );
    expect(notesWithoutTable("jasmine.createSpyObj('S', []);", jasmineGlobals)[0]).toContain('no-entry-table');
  });

  it('rewrites the two matcher registries', () => {
    expect(apply('jasmine.addMatchers(matchers);', jasmineGlobals)).toBe('expect.extend(matchers);');
    expect(apply('jasmine.addCustomEqualityTester(sameId);', jasmineGlobals)).toBe('expect.addEqualityTesters([sameId]);');
  });

  it('reports the setting that is not a statement, and the member it does not know', () => {
    expect(notesOf('jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;', jasmineGlobals)).toEqual([
      'no-jasmine-twin `jasmine.DEFAULT_TIMEOUT_INTERVAL` was left alone.',
    ]);
    expect(apply('jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;', jasmineGlobals)).toBe('jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;');
    expect(notesOf('jasmine.frobnicate(1);', jasmineGlobals)).toEqual(['unknown-jasmine-member `jasmine.frobnicate` was left alone.']);
    expect(notesOf('jasmine.createSpy(', jasmineGlobals)[0]).toContain('unknown-jasmine-member');
  });

  it('never touches a mention inside a comment or a string, and leaves the types alone', () => {
    const source = ['// jasmine.any(String)', 'const a = "jasmine.clock()";', 'let s: jasmine.Spy;'].join('\n');

    expect(apply(source, jasmineGlobals)).toBe(source);
  });
});

describe('jasmine-types', () => {
  it('separates the bare mock from the whole double', () => {
    expect(apply('let a: jasmine.Spy;', jasmineTypes)).toBe("import type { Mock } from 'vitest';\nlet a: Mock;");
    expect(apply('let b: jasmine.SpyObj<Service>;', jasmineTypes)).toBe(
      "import type { Spy } from 'vitest-auto-spy';\nlet b: Spy<Service>;",
    );
  });

  it('says why it cannot place `Spy` when there is no entry table', () => {
    expect(notesWithoutTable('let b: jasmine.SpyObj<Service>;', jasmineTypes)[0]).toContain('no-entry-table');
    expect(applyAll('let b: jasmine.SpyObj<Service>;', [jasmineTypes], undefined)).toBe('let b: jasmine.SpyObj<Service>;');
    expect(notesWithoutTable('let a: jasmine.Spy;', jasmineTypes)).toEqual([]);
  });
});

describe('jasmine-matchers', () => {
  it('rewrites the four matchers Vitest spells differently', () => {
    expect(apply('expect(a).toBeTrue();\nexpect(a).not.toBeFalse();', jasmineMatchers)).toBe(
      'expect(a).toBe(true);\nexpect(a).not.toBe(false);',
    );
    expect(apply('expect(s).toHaveBeenCalledOnceWith(1);\nexpect(l).toHaveSize(2);', jasmineMatchers)).toBe(
      'expect(s).toHaveBeenCalledExactlyOnceWith(1);\nexpect(l).toHaveLength(2);',
    );
  });

  it('moves withContext into the second expect argument, which is where Vitest reads the message', () => {
    expect(apply("expect(a).withContext('after reload').toBe(1);", jasmineMatchers)).toBe("expect(a, 'after reload').toBe(1);");
  });

  it('leaves an expect with no context, and one whose brackets do not balance', () => {
    expect(apply('expect(a).toBe(1);', jasmineMatchers)).toBe('expect(a).toBe(1);');
    expect(apply("expect(a.withContext('m').toBe(1);", jasmineMatchers)).toBe("expect(a.withContext('m').toBe(1);");
    expect(apply("expect(a).withContext('m';", jasmineMatchers)).toBe("expect(a).withContext('m';");
  });

  it('routes the bare fail through expect, and not a method of the same name', () => {
    expect(apply("fail('unreachable');", jasmineMatchers)).toBe("expect.fail('unreachable');");
    expect(apply("runner.fail('x');", jasmineMatchers)).toBe("runner.fail('x');");
  });
});

describe('transformsFor', () => {
  const ids = (mode: 'auto' | 'jasmine' | 'jest', source: string): string[] =>
    transformsFor(mode, [jasmineGlobals, jasmineAndHelpers], source).map((transform) => transform.id);

  it('runs the jasmine set only where the file says it is one, under auto', () => {
    expect(ids('auto', 'jasmine.clock().install();')).toEqual(['jasmine-globals', 'jasmine-and-helpers']);
    expect(ids('auto', 'spy.load.and.nextWith(1);')).toEqual(['jasmine-globals', 'jasmine-and-helpers']);
    expect(ids('auto', "import { Spy } from 'jasmine-auto-spies';")).toEqual(['jasmine-globals', 'jasmine-and-helpers']);
    expect(ids('auto', "import { Spy } from 'vitest-auto-spy/jasmine';")).toEqual(['jasmine-globals', 'jasmine-and-helpers']);
  });

  it('does not read a bare spyOn as a marker — that is the guess the whole transform exists to refuse', () => {
    expect(ids('auto', "spyOn(service, 'load');")).toEqual([]);
    expect(ids('auto', '// jasmine.clock()')).toEqual([]);
  });

  it('honours a dialect that was named out loud, in both directions', () => {
    expect(ids('jasmine', "spyOn(service, 'load');")).toEqual(['jasmine-globals', 'jasmine-and-helpers']);
    expect(ids('jest', 'jasmine.clock().install();')).toEqual([]);
  });
});
