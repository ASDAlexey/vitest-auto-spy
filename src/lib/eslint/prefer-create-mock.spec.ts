import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'prefer-create-mock';

function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

function count(code: string): number {
  return verify(code).length;
}

function message(code: string): string {
  return verify(code)[0]?.message ?? '';
}

function applied(code: string): string {
  const [report] = verify(code);
  const suggestion = report?.suggestions?.[0];

  if (!suggestion) {
    return '';
  }

  const [start, end] = suggestion.fix.range;

  return `${code.slice(0, start)}${suggestion.fix.text}${code.slice(end)}`;
}

describe('prefer-create-mock', () => {
  it('flags an object literal wearing a named type', () => {
    const code = `const device = { id: '1', isOffline: false } as Device;`;
    const text = message(code);

    expect(count(code)).toBe(1);
    expect(text).toContain('claims to be a whole `Device`');
    expect(text).toContain('excess-property check is skipped for a cast');
    expect(text).toContain('createMock<T>({ … })');
  });

  it('reads the older cast spelling too', () => {
    expect(count(`const device = <Device>{ id: '1' };`)).toBe(1);
  });

  it('reads a generic and a namespaced type, naming the last segment', () => {
    expect(message(`const page = { items: [] } as Page<Item>;`)).toContain('whole `Page`');
    expect(message(`const device = { id: '1' } as models.Device;`)).toContain('whole `Device`');
  });

  it('suggests the helper, and imports it when the name is free', () => {
    const code = `const device = { id: '1' } as Device;`;

    expect(verify(code)[0]?.suggestions?.[0]?.desc).toContain('createMock<Device>()');
    expect(applied(code)).toBe(`import { createMock } from 'vitest-auto-spy';\nconst device = createMock<Device>({ id: '1' });`);
  });

  it('carries the type arguments across, and merges into an import the file already has', () => {
    const code = `import { asSpy } from 'vitest-auto-spy';\nconst page = { items: [] } as Page<Item>;`;
    const fixed = applied(code);

    expect(fixed).toContain(`import { asSpy, createMock } from 'vitest-auto-spy';`);
    expect(fixed).toContain(`createMock<Page<Item>>({ items: [] })`);
  });

  it('writes no import when the file already has the helper', () => {
    const code = `import { createMock } from 'vitest-auto-spy';\nconst device = { id: '1' } as Device;`;

    expect(applied(code)).toBe(`import { createMock } from 'vitest-auto-spy';\nconst device = createMock<Device>({ id: '1' });`);
  });

  it('reports without an edit when the file declares the helper name as something of its own', () => {
    const code = `const createMock = 1;\nconst device = { id: '1' } as Device;`;

    expect(count(code)).toBe(1);
    expect(verify(code)[0]?.suggestions ?? []).toHaveLength(0);
  });

  it('leaves `as const` alone — a narrowing, not a fixture claiming a type', () => {
    expect(count(`const roles = { admin: 'admin' } as const;`)).toBe(0);
  });

  it('leaves the escape hatches alone: `as unknown`, `as any`, and the double cast built from them', () => {
    expect(count(`const device = { id: '1' } as unknown;`)).toBe(0);
    expect(count(`const device = { id: '1' } as any;`)).toBe(0);
    // The hop through `unknown` is there because the compiler refused the single cast, so
    // `createMock<Device>` would not compile either — a different finding with a ban of its own.
    expect(count(`const device = { id: '1' } as unknown as Device;`)).toBe(0);
  });

  it('leaves a cast of something that is not a literal alone', () => {
    expect(count(`const device = raw as Device;`)).toBe(0);
    expect(count(`const devices = [{ id: '1' }] as Device[];`)).toBe(0);
    expect(count(`const device = load() as Device;`)).toBe(0);
    expect(count(`const shape = { id: '1' } as { id: string };`)).toBe(0);
  });

  it('leaves a literal inside one of this library’s own factories alone', () => {
    // The seed is already checked against the type argument at every depth, and the recommended
    // shape must not be a violation of the rule that recommends it.
    expect(count(`const s = createMock<Outer>({ inner: { id: '1' } as Inner });`)).toBe(0);
    expect(count(`provideAutoSpyForToken(TOKEN, { config: { id: '1' } as Config });`)).toBe(0);
    expect(count(`provideRouterDouble({ state: { id: '1' } as State });`)).toBe(0);
  });

  it('leaves the types another rule already owns alone, so no line draws two reports', () => {
    expect(count(`const response = { ok: true } as Response;`)).toBe(0);
    expect(count(`const cart = { total: vi.fn() } as Spy<Cart>;`)).toBe(0);
    expect(count(`const cart = { total: vi.fn() } as Mocked<Cart>;`)).toBe(0);
    expect(count(`const load = { m: vi.fn() } as Mock;`)).toBe(0);
  });
});
