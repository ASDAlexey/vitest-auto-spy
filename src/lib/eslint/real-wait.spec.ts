import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-real-wait-in-test';

function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

function lint(code: string): string[] {
  return verify(code).map((message) => message.ruleId ?? 'parse-error');
}

describe('no-real-wait-in-test', () => {
  it('flags a promise that a real timer resolves', () => {
    const [message] = verify("it('x', async () => { await new Promise((r) => setTimeout(r, 100)); });");

    expect(message?.ruleId).toBe('vitest-auto-spy/no-real-wait-in-test');
    expect(message?.message).toContain('waits `100` ms');
    expect(message?.message).toContain('advanceTimers(100)');
  });

  it('flags the other spellings of the same sleep', () => {
    expect(lint('await new Promise((resolve) => { window.setTimeout(() => resolve(undefined), 50); });')).toHaveLength(1);
    expect(lint('const sleep = (ms) => new Promise(function (done) { globalThis.setTimeout(done, ms); });')).toHaveLength(1);
    expect(lint("import { setTimeout as delay } from 'node:timers/promises';\nawait delay(200);")).toHaveLength(1);
    expect(lint("import { setTimeout } from 'timers/promises';\nawait setTimeout(20);")).toHaveLength(1);
  });

  it('leaves a macrotask flush alone', () => {
    expect(lint('await new Promise((r) => setTimeout(r));')).toEqual([]);
    expect(lint('await new Promise((r) => setTimeout(r, 0));')).toEqual([]);
    expect(lint("import { setTimeout as delay } from 'node:timers/promises';\nawait delay(0);\nawait delay();")).toEqual([]);
  });

  it('leaves promises and timers that are not a sleep alone', () => {
    expect(lint('await new Promise((r) => api.load(r));')).toEqual([]);
    expect(lint('await new Promise(executor);')).toEqual([]);
    expect(lint('await new Promise();')).toEqual([]);
    expect(lint('await new Promise(({ ok }) => setTimeout(ok, 10));')).toEqual([]);
    expect(lint('await new Promise(() => setTimeout(done, 10));')).toEqual([]);
    expect(lint('await new Promise((r) => { setTimeout(tick, 10); r(); });')).toEqual([]);
    expect(lint('await new Promise((r) => { setTimeout(); r(); });')).toEqual([]);
    expect(lint('await new Promise((r) => { timers.setTimeout(r, 10); scheduler.run(r); });')).toEqual([]);
    expect(lint('await new Promise((r) => { const later = () => setTimeout(r, 10); later(); });')).toEqual([]);
    expect(lint("import { setInterval } from 'node:timers/promises';\nawait setInterval(10);")).toEqual([]);
    expect(lint("import { setTimeout } from './clock';\nawait setTimeout(10);")).toEqual([]);
    expect(lint('const setTimeout = make();\nawait setTimeout(10);\nawait delay(10);\nawait obj.delay(10);')).toEqual([]);
  });
});
