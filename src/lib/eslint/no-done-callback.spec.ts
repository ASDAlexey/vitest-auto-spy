/**
 * The Jest-era done callback, and `done.fail` on top of it — the two fail differently, so both
 * reports are asserted.
 */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-done-callback';

/** Lint one snippet with only this rule enabled. */
function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

/** The rule ids reported for a snippet. */
function lint(code: string): string[] {
  return verify(code).map((message) => message.ruleId ?? 'parse-error');
}

describe('no-done-callback', () => {
  it('flags a done parameter on a test and on a hook', () => {
    expect(lint("it('emits', (done) => source$.subscribe(() => done()));")).toEqual(['vitest-auto-spy/no-done-callback']);
    expect(lint('beforeEach((done) => setup(done));')).toHaveLength(1);
    expect(lint("test('emits', function (done) { done(); });")).toHaveLength(1);
  });

  it('leaves a context destructuring and a plain callback alone', () => {
    expect(lint("it('skips', ({ task }) => task.skip());")).toEqual([]);
    expect(lint("it('works', () => expect(1).toBe(1));")).toEqual([]);
    expect(lint("it('works', async () => expect(1).toBe(1));")).toEqual([]);
  });

  // Vitest passes the context whether or not it is destructured, and `(ctx) => ctx.skip()` is its
  // own documentation's example — a name read through a member is the context being used, not a
  // callback carried over from Jest.
  it.each([
    ['ctx.skip()', "it('skips', (ctx) => ctx.skip());"],
    ['a member read of the context', "it('names', (ctx) => { expect(ctx.task.name).toBe('names'); });"],
    ['a hook taking the context whole', 'beforeEach((ctx) => { ctx.onTestFinished(reset); });'],
  ])('leaves an undestructured TestContext used through %s alone', (_label, code) => {
    expect(lint(code)).toEqual([]);
  });

  it.each([
    ['a parameter that is called', "it('emits', (done) => { done(); });"],
    ['a parameter handed to something that calls it', "it('emits', (done) => source$.subscribe(done));"],
    ['a parameter nothing in the body uses', "it('emits', (done) => { expect(1).toBe(1); });"],
    ['a parameter whose only member is jasmine’s fail', "it('emits', (done) => { source$.subscribe({ error: () => done.fail() }); });"],
  ])('still reports %s', (_label, code) => {
    expect(lint(code)).toContain('vitest-auto-spy/no-done-callback');
  });
});

describe('no-done-callback — done.fail', () => {
  it('reports done.fail on top of the parameter, because the two fail differently', () => {
    const code = "it('emits', (done) => source$.subscribe({ error: (e) => done.fail(e) }));";

    expect(lint(code)).toHaveLength(2);
    // The parameter report explains the missing callback; this one explains the green run.
    expect(verify(code)[1]?.message).toContain('done.fail is not a function');
    expect(verify(code)[1]?.message).toContain('rejects.toMatchObject');
  });

  it.each([
    ['a `fail` on something that is not a test parameter', 'const logger = {};\nlogger.fail("boom");'],
    ['a `fail` on a parameter of an ordinary function', 'const run = (task) => task.fail();'],
    ['a `fail` on a name nothing in this file binds', 'reporter.fail("boom");'],
    ['a `fail` read off `this`', 'this.done.fail("boom");'],
    ['a `fail` that is passed rather than called', "it('emits', (done) => register(done.fail));"],
  ])('leaves %s alone', (_label, code) => {
    expect(lint(code).filter((id) => id === `vitest-auto-spy/${RULE}`)).toHaveLength(code.includes('(done)') ? 1 : 0);
  });
});
