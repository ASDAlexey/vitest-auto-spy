/**
 * Two halves: the flags handed over as options, which is most of the file, and the search for a
 * runner config on disk, which needs real directories and gets them from `mkdtempSync`.
 */
import { type LintMessage, Linter } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fixRule, runRule } from './run-rule';

const RULE = 'no-redundant-mock-reset';

const CLEARS = { clearMocks: true };
const CLEARS_AND_RESTORES = { clearMocks: true, restoreMocks: true };

function verify(code: string, options: object = CLEARS): LintMessage[] {
  return runRule(RULE, code, { options });
}

function count(code: string, options: object = CLEARS): number {
  return verify(code, options).length;
}

function message(code: string, options: object = CLEARS): string {
  return verify(code, options)[0]?.message ?? '';
}

function fixed(code: string, options: object = CLEARS): string {
  return fixRule(RULE, code, { options }).output;
}

describe('no-redundant-mock-reset', () => {
  it('reports the reset a configured runner has already performed', () => {
    const code = `beforeEach(() => { vi.clearAllMocks(); });`;
    const text = message(code);

    expect(count(code)).toBe(1);
    expect(text).toContain('`clearMocks: true` is on');
    expect(text).toContain('onBeforeTryTask');
  });

  it('deletes the hook the reset was the whole of, where nothing can have run before it', () => {
    expect(fixed(`beforeEach(() => { vi.clearAllMocks(); });\nit('x', () => {});`)).toBe(`\nit('x', () => {});`);
    expect(fixed(`beforeEach(() => vi.clearAllMocks());\nit('x', () => {});`)).toBe(`\nit('x', () => {});`);
  });

  it('deletes the reset alone when the hook holds something else after it', () => {
    const code = `beforeEach(() => {\n  vi.clearAllMocks();\n  build();\n});`;

    expect(fixed(code)).toBe(`beforeEach(() => {\n  \n  build();\n});`);
  });

  it('only suggests where something in the file could have run in between', () => {
    // The statements above it in the hook are the obvious half; the other `beforeEach` is the half a
    // rule reading one hook would miss, because it may sit in an enclosing `describe`.
    const later = `beforeEach(() => {\n  build();\n  vi.clearAllMocks();\n});`;
    const outer = `beforeEach(() => build());\ndescribe('x', () => {\n  beforeEach(() => { vi.clearAllMocks(); });\n});`;

    expect(count(later)).toBe(1);
    expect(fixed(later)).toBe(later);
    expect(verify(later)[0]?.suggestions?.[0]?.desc).toBe('Delete this reset');
    expect(count(outer)).toBe(1);
    expect(fixed(outer)).toBe(outer);
    expect(verify(outer)[0]?.suggestions?.[0]?.desc).toBe('Delete this reset, and the beforeEach it is the whole of');
  });

  it('suggests rather than edits in the hooks the runner’s reset does not immediately precede', () => {
    const code = `afterEach(() => { vi.clearAllMocks(); });`;

    expect(count(code)).toBe(1);
    expect(message(code)).toContain('the next test starts on the same registry');
    expect(fixed(code)).toBe(code);
    expect(fixed(`afterAll(() => { vi.clearAllMocks(); });`)).toBe(`afterAll(() => { vi.clearAllMocks(); });`);
  });

  it('applies the suggestion it offered, hook and all', () => {
    const code = `beforeEach(() => build());\ndescribe('x', () => {\n  beforeEach(() => { vi.clearAllMocks(); });\n});`;
    const fix = verify(code)[0]?.suggestions?.[0]?.fix;

    expect(code.slice(0, fix?.range[0]) + (fix?.text ?? '') + code.slice(fix?.range[1])).toBe(
      `beforeEach(() => build());\ndescribe('x', () => {\n  \n});`,
    );
  });

  it('matches the flag to the call and not to the family', () => {
    // `restoreAllMocks` walks the originals `vi.spyOn` replaced; a plain `vi.fn()` is not one of
    // them, which is why neither of these two is the other's stronger form.
    expect(count(`beforeEach(() => { vi.restoreAllMocks(); });`, CLEARS)).toBe(0);
    expect(count(`beforeEach(() => { vi.clearAllMocks(); });`, { restoreMocks: true })).toBe(0);
    expect(count(`beforeEach(() => { vi.restoreAllMocks(); });`, { restoreMocks: true })).toBe(1);
    expect(count(`beforeEach(() => { vi.resetAllMocks(); });`, CLEARS_AND_RESTORES)).toBe(0);
    expect(count(`beforeEach(() => { vi.resetAllMocks(); });`, { mockReset: true })).toBe(1);
    // The one subsumption: resetting every registered mock includes clearing it.
    expect(count(`beforeEach(() => { vi.clearAllMocks(); });`, { mockReset: true })).toBe(1);
  });

  it('reads a per-mock reset against the population the flag reaches', () => {
    const spy = `const spy = vi.spyOn(api, 'load');\n`;
    const plain = `const mock = vi.fn();\n`;

    expect(count(`${plain}beforeEach(() => { mock.mockClear(); });`, CLEARS)).toBe(1);
    expect(count(`${plain}afterEach(() => { mock.mockRestore(); });`, { restoreMocks: true })).toBe(0);
    expect(count(`${spy}afterEach(() => { spy.mockRestore(); });`, { restoreMocks: true })).toBe(1);
    expect(count(`${spy}afterEach(() => { spy.mockReset(); });`, { restoreMocks: true })).toBe(1);
    expect(count(`afterEach(() => { vi.spyOn(api, 'load').mockReturnValue(1).mockRestore(); });`, { restoreMocks: true })).toBe(1);
    // Two writes: what the name holds in the hook depends on run order, so nothing is decided here.
    expect(
      count(`let spy;\nspy = vi.spyOn(api, 'a');\nspy = vi.fn();\nafterEach(() => { spy.mockRestore(); });`, {
        restoreMocks: true,
      }),
    ).toBe(0);
  });

  it('leaves the reset in the middle of a test body alone, which is the one it must never touch', () => {
    expect(count(`it('x', () => { load(); vi.clearAllMocks(); load(); });`)).toBe(0);
    expect(count(`it.each([1])('x', () => { spy.mockClear(); });`)).toBe(0);
    expect(count(`describe('x', () => { vi.clearAllMocks(); });`)).toBe(0);
    expect(count(`vi.clearAllMocks();`)).toBe(0);
  });

  it('leaves a reset the hook only schedules or delegates', () => {
    expect(count(`beforeEach(() => { onTestFinished(() => vi.clearAllMocks()); });`)).toBe(0);
    expect(count(`beforeEach(() => { if (flaky) { vi.clearAllMocks(); } });`)).toBe(0);
    expect(count(`beforeEach(() => { const reset = () => vi.clearAllMocks(); reset(); });`)).toBe(0);
    // A concise body that is not the call itself: there is no statement to delete, and the
    // expression around it may be what the hook is for.
    expect(count(`afterEach(() => void vi.clearAllMocks());`)).toBe(0);
  });

  it('leaves alone what is not a reset the runner performs', () => {
    expect(count(`beforeEach(() => { build(); });`)).toBe(0);
    expect(count(`beforeEach(() => { registry.clearAllMocks(); });`)).toBe(0);
    expect(count(`beforeEach(() => { mock[name](); });`)).toBe(0);
    expect(count(`beforeEach(() => { vi.unstubAllGlobals(); });`)).toBe(0);
    expect(count(`beforeEach(2, () => { vi.clearAllMocks(); });`)).toBe(0);
  });

  it('reports without an edit where there is no statement to delete', () => {
    const code = `const hooks = [beforeEach(function () { vi.clearAllMocks(); })];`;

    expect(count(code)).toBe(1);
    expect(verify(code)[0]?.suggestions ?? []).toHaveLength(0);
    expect(fixed(code)).toBe(code);
  });

  it('says nothing at all when no option names a flag', () => {
    expect(count(`beforeEach(() => { vi.clearAllMocks(); });`, {})).toBe(0);
    expect(count(`beforeEach(() => { vi.restoreAllMocks(); });`, { clearMocks: false })).toBe(0);
  });
});

describe('no-redundant-mock-reset, finding the runner config itself', () => {
  const root = mkdtempSync(join(tmpdir(), 'auto-spy-mock-reset-'));
  const configured = join(root, 'configured');
  const vite = join(root, 'vite-only');
  const bare = join(root, 'bare');
  const code = `beforeEach(() => { vi.clearAllMocks(); });`;

  beforeAll(() => {
    [configured, vite, bare].forEach((directory) => mkdirSync(join(directory, 'nested'), { recursive: true }));
    writeFileSync(join(configured, 'vitest.config.ts'), `export default { test: { clearMocks: true } };\n`);
    writeFileSync(join(vite, 'vite.config.ts'), `export default { test: { restoreMocks: true } };\n`);
  });

  afterAll(() => rmSync(root, { force: true, recursive: true }));

  function inDirectory(directory: string, source = code, options?: object): number {
    return runRule(RULE, source, {
      filename: join(directory, 'nested', 'thing.spec.ts'),
      linter: new Linter({ configType: 'flat', cwd: directory }),
      ...(options ? { options } : {}),
    }).length;
  }

  it('reads the flags out of the nearest vitest config above the file', () => {
    expect(inDirectory(configured)).toBe(1);
    // Again, to go through the cache the first walk filled rather than the disk.
    expect(inDirectory(configured)).toBe(1);
  });

  it('falls back to a vite config, and reads its flags the same way', () => {
    expect(inDirectory(vite)).toBe(0);
    expect(inDirectory(vite, `afterEach(() => { vi.restoreAllMocks(); });`)).toBe(1);
  });

  it('stays silent where the walk finds no config at all', () => {
    expect(inDirectory(bare)).toBe(0);
  });

  it('prefers the options over anything on disk', () => {
    expect(inDirectory(bare, code, CLEARS)).toBe(1);
    expect(inDirectory(configured, code, {})).toBe(0);
  });
});
