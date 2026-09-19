/** An exported mock every test file in a suite shares, checked from both sides. */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-shared-module-level-mock';

/** Lint one snippet with only this rule enabled. */
function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

/** The rule ids reported for a snippet. */
function lint(code: string): string[] {
  return verify(code).map((message) => message.ruleId ?? 'parse-error');
}

describe('no-shared-module-level-mock', () => {
  it('flags an exported object holding a vi.fn()', () => {
    expect(lint('export const ctx = { actions: { navigate: vi.fn() } };')).toEqual(['vitest-auto-spy/no-shared-module-level-mock']);
  });

  it('flags an exported provider whose useValue holds spies', () => {
    expect(lint('export const provider = { provide: Cart, useValue: { total: vi.fn() } };')).toHaveLength(1);
  });

  it('leaves the factory form alone — that is the fix', () => {
    expect(lint('export const createCtx = () => ({ actions: { navigate: vi.fn() } });')).toEqual([]);
    expect(lint('export function createCtx() { return { navigate: vi.fn() }; }')).toEqual([]);
  });

  it('leaves a spy that stays inside the file alone', () => {
    expect(lint('const ctx = { navigate: vi.fn() };')).toEqual([]);
  });

  it('leaves an exported value that builds no spies alone', () => {
    expect(lint("export const routes = [{ path: '', component: Home }];")).toEqual([]);
    expect(lint('export const empty = undefined;')).toEqual([]);
    expect(lint('export let pending;')).toEqual([]);
  });
});
