/**
 * The hint is a sentence appended to somebody else's error, so every test here builds the error and
 * the runner's budgets by hand. Making a hook actually time out inside this suite would cost the
 * `hookTimeout` it is measuring, once per case, and would fail the test doing the asserting.
 *
 * The one thing that cannot be faked is that the error is reachable and mutable at all — that was
 * established against the real runner with a `beforeEach(fn, 300)` probe (`× first test 303ms`,
 * `Hook timed out in 300ms.`, the appended line present in the reporter's output) and is what the
 * `afterEach` seam in `setupAutoSpy` relies on.
 */
import { describe, expect, it } from 'vitest';

import { annotateHookTimeout, describeHookTimeout, readRunnerTimeouts } from './hook-timeout';

/** The runner's wording, reproduced exactly — the regexp keys on it. */
function hookTimeoutError(limit: number): Error {
  return new Error(
    `Hook timed out in ${limit}ms.\nIf this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".`,
  );
}

describe('readRunnerTimeouts', () => {
  it('reads the pair off the worker the runner installed', () => {
    const host = { __vitest_worker__: { config: { testTimeout: 30_000, hookTimeout: 10_000 } } };

    expect(readRunnerTimeouts(host)).toEqual({ testTimeout: 30_000, hookTimeout: 10_000 });
  });

  it('gives up on a host with no worker at all, rather than throwing', () => {
    expect(readRunnerTimeouts({})).toBeUndefined();
  });

  it('gives up when either budget is not a number', () => {
    expect(readRunnerTimeouts({ __vitest_worker__: { config: { testTimeout: 30_000 } } })).toBeUndefined();
    expect(readRunnerTimeouts({ __vitest_worker__: { config: { testTimeout: '30s', hookTimeout: 10_000 } } })).toBeUndefined();
  });

  it('finds the real budgets under the real runner, which is the only source there is', () => {
    const timeouts = readRunnerTimeouts();

    expect(typeof timeouts?.testTimeout).toBe('number');
    expect(typeof timeouts?.hookTimeout).toBe('number');
  });
});

describe('describeHookTimeout', () => {
  it('names both budgets and the field to set', () => {
    const message = describeHookTimeout({ testTimeout: 30_000, hookTimeout: 10_000 });

    expect(message).toContain('hookTimeout is 10000ms while testTimeout is 30000ms');
    expect(message).toContain('Jest applied one `testTimeout` to both');
    expect(message).toContain('Docs: ');
  });
});

describe('annotateHookTimeout', () => {
  const asymmetric = { testTimeout: 30_000, hookTimeout: 10_000 };

  it('appends the reason to a hook that ran out of the run-wide budget', () => {
    const error = hookTimeoutError(10_000);

    annotateHookTimeout([error], asymmetric);

    expect(error.message).toContain('Hook timed out in 10000ms.');
    expect(error.message).toContain('[vitest-auto-spy] hookTimeout is 10000ms while testTimeout is 30000ms');
  });

  it('appends once, however often the teardown runs', () => {
    const error = hookTimeoutError(10_000);

    annotateHookTimeout([error], asymmetric);
    annotateHookTimeout([error], asymmetric);

    expect(error.message.match(/\[vitest-auto-spy] hookTimeout/g)).toHaveLength(1);
  });

  it('leaves a hook that named its own timeout alone — the config is not to blame for that one', () => {
    const error = hookTimeoutError(300);

    annotateHookTimeout([error], asymmetric);

    expect(error.message).not.toContain('[vitest-auto-spy]');
  });

  it('leaves every failure that is not a hook timeout alone', () => {
    const assertion = new Error('expected 404 to be 401');
    const testTimeout = new Error('Test timed out in 30000ms.');

    annotateHookTimeout([assertion, testTimeout], asymmetric);

    expect(assertion.message).toBe('expected 404 to be 401');
    expect(testTimeout.message).toBe('Test timed out in 30000ms.');
  });

  it('says nothing when the budgets agree, since then the hook really is slow', () => {
    const error = hookTimeoutError(30_000);

    annotateHookTimeout([error], { testTimeout: 30_000, hookTimeout: 30_000 });

    expect(error.message).not.toContain('[vitest-auto-spy]');
  });

  it('says nothing when the budgets could not be read', () => {
    const error = hookTimeoutError(10_000);

    annotateHookTimeout([error], undefined);

    expect(error.message).not.toContain('[vitest-auto-spy]');
  });

  it('survives an entry the runner serialised into something without a string message', () => {
    const entries = [null, 'a bare string', { message: 42 }];

    expect(() => annotateHookTimeout(entries, asymmetric)).not.toThrow();
  });
});
