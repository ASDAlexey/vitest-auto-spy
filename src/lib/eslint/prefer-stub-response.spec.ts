import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'prefer-stub-response';

function verify(code: string, globals?: Record<string, 'readonly'>): LintMessage[] {
  return runRule(RULE, code, globals ? { globals } : {});
}

function count(code: string, globals?: Record<string, 'readonly'>): number {
  return verify(code, globals).length;
}

function message(code: string): string {
  return verify(code)[0]?.message ?? '';
}

describe('prefer-stub-response', () => {
  it('flags the object literal every fetch tutorial casts to Response', () => {
    const code = `
      it('loads the user', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => user } as Response);
      });
    `;
    const text = message(code);

    expect(count(code)).toBe(1);
    expect(text).toContain('stubResponse({ body })');
    expect(text).toContain('vitest-auto-spy/setup');
    expect(text).toContain('`undefined` for every other one');
  });

  it('sees the literal through the double cast written when the single one stops compiling', () => {
    expect(count(`const r = { ok: true, json: async () => user } as unknown as Response;`)).toBe(1);
  });

  it('reads the angle-bracket spelling of the same cast', () => {
    expect(count(`const r = <Response>{ ok: true, status: 200 };`)).toBe(1);
  });

  it('flags the partial fixture helpers handed the platform type', () => {
    const code = `const r = createMock<Response>({ ok: true, json: async () => user });`;
    const text = message(code);

    expect(count(code)).toBe(1);
    expect(text).toContain('`createMock<Response>(…)` builds a partial fixture');
    expect(count(`const r = createAutoMock<Response>();`)).toBe(1);
  });

  it('names the helper it saw, so the two reports do not read alike', () => {
    expect(message(`const r = createAutoMock<Response>();`)).toContain('`createAutoMock<Response>(…)`');
  });

  it('fires where the environment declares Response as a global, which is most projects', () => {
    // A `globals` entry puts a variable with no definitions in scope. That is still the platform's
    // Response, and the rule would be silent in every project that declares its environment if the
    // presence of a binding were the test.
    expect(count(`const r = { ok: true } as Response;`, { Response: 'readonly' })).toBe(1);
  });

  it('leaves a Response that is not the platform’s alone', () => {
    // The whole reason the rule reads the binding: for an Express handler or a generated client's
    // envelope `stubResponse` builds the wrong object, and the repair named would be wrong advice.
    expect(count(`import { type Response } from 'express';\nconst res = { status: vi.fn() } as Response;`)).toBe(0);
    expect(count(`interface Response { data: number }\nconst r = { data: 1 } as Response;`)).toBe(0);
    expect(count(`interface Response { data: number }\nconst r = createMock<Response>({ data: 1 });`)).toBe(0);
  });

  it('leaves alone what is not an object literal wearing the type', () => {
    expect(count(`const r = stubResponse({ body: { id: 1 } });`)).toBe(0);
    expect(count(`const r = new Response('{}') as Response;`)).toBe(0);
    expect(count(`const r = received as Response;`)).toBe(0);
    expect(count(`const r = createMock<Request>({ url: '/x' });`)).toBe(0);
    expect(count(`const r = createMock({ ok: true });`)).toBe(0);
    expect(count(`const r = build<Response>({ ok: true });`)).toBe(0);
    expect(count(`const r = wrap.createMock<Response>({ ok: true });`)).toBe(0);
    expect(count(`const r = { ok: true } as ResponseLike;`)).toBe(0);
  });
});
