import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-reset-all-mocks';
const RULE_ID = `vitest-auto-spy/${RULE}`;

function lint(code: string): string[] {
  return runRule(RULE, code, { options: { isolate: false } }).map((message) => message.ruleId ?? 'parse-error');
}

describe('no-reset-all-mocks', () => {
  it.each([
    ['vi.resetAllMocks();'],
    ['beforeEach(() => { vi.resetAllMocks(); });'],
    ['afterEach(() => vi.resetAllMocks());'],
    ["it('a', () => { vi.resetAllMocks(); });"],
    ['jest.resetAllMocks();'],
  ])('reports %s', (code) => {
    expect(lint(code)).toEqual([RULE_ID]);
  });

  it('names the call it found', () => {
    expect(runRule(RULE, 'vi.resetAllMocks();', { options: { isolate: false } })[0]?.message).toMatch(
      /^`vi\.resetAllMocks\(\)` resets every live mock of the worker/,
    );
    expect(runRule(RULE, 'vi.resetAllMocks();', { options: { isolate: false } })[0]?.message).toContain('resetAutoSpy(double)');
  });

  it.each([
    ['vi.clearAllMocks();'],
    ['vi.restoreAllMocks();'],
    ['spy.mockReset();'],
    ['resetAutoSpy(double);'],
    ['other.resetAllMocks();'],
    ['resetAllMocks();'],
    ['vi.resetModules();'],
  ])('leaves %s alone', (code) => {
    expect(lint(code)).toEqual([]);
  });

  it('stays silent until the project says isolate is false', () => {
    expect(runRule(RULE, 'vi.resetAllMocks();')).toEqual([]);
  });
});
