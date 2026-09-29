import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-disabled-testbed-teardown';

function lint(code: string): string[] {
  return runRule(RULE, code).map((message) => message.ruleId ?? 'parse-error');
}

describe('no-disabled-testbed-teardown', () => {
  it('flags the opt-out in the environment and on one testing module', () => {
    expect(
      lint('getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), { teardown: { destroyAfterEach: false } });'),
    ).toEqual(['vitest-auto-spy/no-disabled-testbed-teardown']);
    expect(lint("TestBed.configureTestingModule({ teardown: { 'destroyAfterEach': false } });")).toHaveLength(1);
    expect(lint('TestBed.configureTestingModule({ teardown: { destroyAfterEach: false, rethrowErrors: true } });')).toHaveLength(1);
  });

  it('leaves teardown that stays on alone', () => {
    expect(lint('TestBed.configureTestingModule({ teardown: { destroyAfterEach: true } });')).toEqual([]);
    expect(lint('TestBed.configureTestingModule({ teardown: { destroyAfterEach: flag } });')).toEqual([]);
    expect(lint('const destroyAfterEach = false;')).toEqual([]);
    expect(lint('const flags = { rethrowErrors: false };')).toEqual([]);
  });
});
