/** An assertion in a `.then()` nobody awaits, checked from both sides. */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-floating-assertion';

/** Lint one snippet with only this rule enabled. */
function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

/** The rule ids reported for a snippet. */
function lint(code: string): string[] {
  return verify(code).map((message) => message.ruleId ?? 'parse-error');
}

describe('no-floating-assertion', () => {
  it('flags an assertion in a .then() nobody awaits', () => {
    expect(lint('testBed.compileComponents().then(() => { expect(spy).toHaveBeenCalled(); });')).toEqual([
      'vitest-auto-spy/no-floating-assertion',
    ]);
    expect(lint('firstValueFrom(value$).then((value) => expect(value).toBeFalsy());')).toHaveLength(1);
    expect(lint('load().finally(() => { expect(spy).toHaveBeenCalled(); });')).toHaveLength(1);
  });

  it('flags both callbacks of a .then().catch() chain — the first one’s parent is only a member expression', () => {
    expect(lint('load().then(() => { expect(1).toBe(1); }).catch(() => { expect(2).toBe(2); });')).toHaveLength(2);
  });

  it('leaves a chain somebody consumes alone', () => {
    expect(lint("it('a', async () => { await load().then(() => { expect(1).toBe(1); }); });")).toEqual([]);
    expect(lint('const run = () => load().then(() => { expect(1).toBe(1); });')).toEqual([]);
    expect(lint('const settled = load().then(() => { expect(1).toBe(1); });')).toEqual([]);
    expect(lint("it('a', async () => { await Promise.all([load().then(() => { expect(1).toBe(1); })]); });")).toEqual([]);
    expect(lint('track(load().then(() => { expect(1).toBe(1); }));')).toEqual([]);
  });

  it('leaves a floating chain that asserts nothing alone', () => {
    expect(lint('load().catch(() => {});')).toEqual([]);
  });

  it('stops at the immediately enclosing callback — awaiting the chain would not revive a deeper one', () => {
    expect(lint('load().then(() => { [1].forEach(() => { expect(1).toBe(1); }); });')).toEqual([]);
    expect(lint('load().then(() => source$.subscribe((v) => expect(v).toBe(1)));')).toEqual([]);
  });

  it('leaves an assertion outside a promise callback alone', () => {
    expect(lint('expect(await load()).toBe(1);')).toEqual([]);
    expect(lint("it('works', () => { expect(1).toBe(1); });")).toEqual([]);
    expect(lint('const check = () => { expect(1).toBe(1); };')).toEqual([]);
    expect(lint('value$.subscribe(() => { expect(1).toBe(1); });')).toEqual([]);
    expect(lint('load()[settle](() => { expect(1).toBe(1); });')).toEqual([]);
  });
});
