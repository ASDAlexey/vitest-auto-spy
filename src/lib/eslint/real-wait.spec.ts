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

  /** The source after accepting the first report's suggestion, or `undefined` without one. */
  function suggested(code: string): string | undefined {
    const fix = verify(code)[0]?.suggestions?.[0]?.fix;

    return fix && `${code.slice(0, fix.range[0])}${fix.text}${code.slice(fix.range[1])}`;
  }

  it('names flushEventLoop for a wait that only lets mocked promises settle', () => {
    expect(verify('await new Promise((r) => setTimeout(r, 50));')[0]?.message).toContain('`await flushEventLoop()`');
  });

  it('suggests flushEventLoop() for an awaited sleep, importing it when the name is free', () => {
    const fixed = suggested("import { setupAutoSpy } from 'vitest-auto-spy';\nawait new Promise((r) => setTimeout(r, 50));");

    expect(fixed).toBe("import { flushEventLoop, setupAutoSpy } from 'vitest-auto-spy';\nawait flushEventLoop();");
    expect(suggested("import { flushEventLoop } from 'vitest-auto-spy';\nawait new Promise((r) => setTimeout(r, 50));")).toBe(
      "import { flushEventLoop } from 'vitest-auto-spy';\nawait flushEventLoop();",
    );
    expect(suggested("import { setTimeout as delay } from 'node:timers/promises';\nawait delay(20);")).toContain('await flushEventLoop();');
  });

  it('offers nothing where the sleep is not awaited on the spot, or the name is taken', () => {
    expect(verify('const sleep = (ms) => new Promise((r) => setTimeout(r, ms));')[0]?.suggestions).toBeUndefined();
    expect(verify('const flushEventLoop = 1;\nawait new Promise((r) => setTimeout(r, 50));')[0]?.suggestions).toBeUndefined();
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
