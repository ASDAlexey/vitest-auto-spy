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
    expect(text).toMatch(/^`vi\.clearAllMocks\(\)` repeats the reset `clearMocks: true` already ran just before this `beforeEach`/);
  });

  it('deletes the hook the reset was the whole of, where nothing can have run before it', () => {
    expect(fixed(`beforeEach(() => { vi.clearAllMocks(); });\nit('x', () => {});`)).toBe(`it('x', () => {});`);
    expect(fixed(`beforeEach(() => vi.clearAllMocks());\nit('x', () => {});`)).toBe(`it('x', () => {});`);
  });

  it('deletes the reset alone when the hook holds something else after it', () => {
    const code = `beforeEach(() => {\n  vi.clearAllMocks();\n  build();\n});`;

    expect(fixed(code)).toBe(`beforeEach(() => {\n  build();\n});`);
  });

  it('stays silent where something the file wrote ran after the runner’s reset and before this one', () => {
    // The runner resets before the whole `beforeEach` chain, so whatever ran first — the statements
    // above it in the hook, an earlier `beforeEach` beside it, any `beforeEach` of an enclosing scope
    // wherever it is written — is exactly what this reset undoes.
    expect(count(`beforeEach(() => {\n  build();\n  vi.clearAllMocks();\n});`)).toBe(0);
    expect(count(`beforeEach(() => build());\nbeforeEach(() => { vi.clearAllMocks(); });`)).toBe(0);
    expect(count(`beforeEach(() => build());\ndescribe('x', () => {\n  beforeEach(() => { vi.clearAllMocks(); });\n});`)).toBe(0);
    expect(
      count(
        `describe('x', () => {\n  describe('y', () => { beforeEach(() => { vi.clearAllMocks(); }); });\n  beforeEach(() => build());\n});`,
      ),
    ).toBe(0);
    // A spy an enclosing `beforeEach` installed is still there, and taking it off is the point.
    const outerSpy = [
      'let spy;',
      "beforeEach(() => { spy = vi.spyOn(component, 'updateChannels'); });",
      "describe('updateChannels', () => { beforeEach(() => { spy.mockRestore(); }); });",
    ].join('\n');

    expect(count(outerSpy, CLEARS_AND_RESTORES)).toBe(0);
  });

  it('reads a beforeEach of a sibling describe as not running first, and only suggests', () => {
    const code = `describe('a', () => { beforeEach(() => build()); });\ndescribe('x', () => {\n  beforeEach(() => { vi.clearAllMocks(); });\n});`;
    const fix = verify(code)[0]?.suggestions?.[0]?.fix;

    expect(count(code)).toBe(1);
    expect(fixed(code)).toBe(code);
    expect(verify(code)[0]?.suggestions?.[0]?.desc).toBe('Delete this reset, and the beforeEach it is the whole of');
    expect(code.slice(0, fix?.range[0]) + (fix?.text ?? '') + code.slice(fix?.range[1])).toBe(
      `describe('a', () => { beforeEach(() => build()); });\ndescribe('x', () => {\n});`,
    );
  });

  it('reports only a clear in an afterEach, and only as its last statement', () => {
    const code = `afterEach(() => { vi.clearAllMocks(); });`;

    expect(count(code)).toBe(1);
    expect(message(code)).toContain('the next test starts on the same state with or without it');
    expect(fixed(code)).toBe(code);
    expect(count(`afterEach(() => { vi.clearAllMocks(); cleanup(); });`)).toBe(0);
    // Nothing resets after a file's last test: this is what takes a spy off `window` before the next file.
    expect(count(`afterEach(() => { fixture.destroy(); vi.restoreAllMocks(); });`, { restoreMocks: true })).toBe(0);
    expect(count(`afterEach(() => { vi.resetAllMocks(); });`, { mockReset: true })).toBe(0);
    expect(count(`afterAll(() => { vi.clearAllMocks(); });`)).toBe(0);
    expect(count(`beforeAll(() => { vi.clearAllMocks(); });`)).toBe(0);
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
    expect(count(`${plain}beforeEach(() => { mock.mockRestore(); });`, { restoreMocks: true })).toBe(0);
    expect(count(`${spy}beforeEach(() => { spy.mockRestore(); });`, { restoreMocks: true })).toBe(1);
    expect(count(`${spy}beforeEach(() => { spy.mockReset(); });`, { restoreMocks: true })).toBe(1);
    expect(count(`beforeEach(() => { vi.spyOn(api, 'load').mockReturnValue(1).mockRestore(); });`, { restoreMocks: true })).toBe(1);
    // Two writes: what the name holds in the hook depends on run order, so nothing is decided here.
    expect(
      count(`let spy;\nspy = vi.spyOn(api, 'a');\nspy = vi.fn();\nbeforeEach(() => { spy.mockRestore(); });`, {
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
  const angular = join(root, 'angular-cli');
  const code = `beforeEach(() => { vi.clearAllMocks(); });`;

  beforeAll(() => {
    [configured, vite, bare, angular].forEach((directory) => mkdirSync(join(directory, 'nested'), { recursive: true }));
    writeFileSync(join(angular, 'vitest-base.config.mts'), `export default { test: { clearMocks: true } };\n`);
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
    expect(inDirectory(vite, `beforeEach(() => { vi.restoreAllMocks(); });`)).toBe(1);
  });

  it('finds the vitest-base config that the Angular unit-test builder resolves for runnerConfig: true', () => {
    expect(inDirectory(angular)).toBe(1);
  });

  it('stays silent where the walk finds no config at all', () => {
    expect(inDirectory(bare)).toBe(0);
  });

  it('prefers the options over anything on disk', () => {
    expect(inDirectory(bare, code, CLEARS)).toBe(1);
    expect(inDirectory(configured, code, {})).toBe(0);
  });

  it('reads the runner config the configFile option names, where no search would find it', () => {
    // A builder's runner config at a path nothing standard names — the search above finds nothing.
    mkdirSync(join(bare, 'tools'), { recursive: true });
    writeFileSync(join(bare, 'tools', 'vitest-runner.config.ts'), `export default { test: { clearMocks: true } };\n`);

    expect(inDirectory(bare, code, { configFile: 'tools/vitest-runner.config.ts' })).toBe(1);
    expect(inDirectory(configured, code, { configFile: join(bare, 'tools', 'vitest-runner.config.ts') })).toBe(1);
    // A flag written beside it still has the last word.
    expect(inDirectory(bare, code, { configFile: 'tools/vitest-runner.config.ts', clearMocks: false })).toBe(0);
  });

  it('fails loudly on a configFile that is not there, rather than going quiet', () => {
    expect(() => inDirectory(bare, code, { configFile: 'tools/missing.config.ts' })).toThrow(
      /the configFile option names .*missing\.config\.ts, which does not exist/,
    );
  });
});

describe('no-redundant-mock-reset, the clearMocks default of the installed Vitest', () => {
  const root = mkdtempSync(join(tmpdir(), 'auto-spy-mock-reset-version-'));
  const code = `beforeEach(() => { vi.clearAllMocks(); });`;

  function project(name: string, version: object, config?: string): string {
    const directory = join(root, name);

    mkdirSync(join(directory, 'node_modules', 'vitest'), { recursive: true });
    mkdirSync(join(directory, 'nested'), { recursive: true });
    writeFileSync(join(directory, 'node_modules', 'vitest', 'package.json'), JSON.stringify(version));

    if (config !== undefined) {
      writeFileSync(join(directory, 'vitest.config.ts'), `export default { test: { ${config} } };\n`);
    }

    return directory;
  }

  function lint(directory: string, source = code, options?: object): LintMessage[] {
    return runRule(RULE, source, {
      filename: join(directory, 'nested', 'thing.spec.ts'),
      linter: new Linter({ configType: 'flat', cwd: directory }),
      ...(options ? { options } : {}),
    });
  }

  afterAll(() => rmSync(root, { force: true, recursive: true }));

  it('counts clearMocks on under Vitest 5 when the config leaves it out, and says it is the default', () => {
    const v5 = project('v5-unset', { version: '5.0.2' }, 'restoreMocks: true');
    const [report] = lint(v5);

    expect(report?.message).toMatch(/^`vi\.clearAllMocks\(\)` repeats the reset `clearMocks` \(on by default from Vitest 5\) already ran/);
    // Again, through the version the first walk cached.
    expect(lint(v5, `beforeEach(() => { vi.fn().mockClear(); });`)).toHaveLength(1);
    expect(lint(v5, `beforeEach(() => { vi.resetAllMocks(); });`)).toHaveLength(0);
  });

  it('names the flag as written where the Vitest 5 config sets clearMocks: true itself', () => {
    const [report] = lint(project('v5-explicit', { version: '5.1.0' }, 'clearMocks: true'));

    expect(report?.message).toMatch(/repeats the reset `clearMocks: true` already ran/);
  });

  it('reads a clearMocks the Vitest 5 config names as anything but a literal true as off', () => {
    expect(lint(project('v5-off', { version: '5.0.2' }, 'clearMocks: false'))).toHaveLength(0);
    expect(lint(project('v5-expression', { version: '5.0.2' }, 'clearMocks: !!process.env.CI'))).toHaveLength(0);
  });

  it('keeps clearMocks off where the config leaves it out under Vitest 4, or an unreadable version', () => {
    expect(lint(project('v4-unset', { version: '4.1.11' }, 'restoreMocks: true'))).toHaveLength(0);
    expect(lint(project('no-version', {}, 'restoreMocks: true'))).toHaveLength(0);
    expect(lint(project('odd-version', { version: 'latest' }, 'restoreMocks: true'))).toHaveLength(0);
  });

  it('applies the default to a configFile, and lets a flag beside it or the inline flags decide', () => {
    const v5 = project('v5-named', { version: '5.0.2' });

    mkdirSync(join(v5, 'tools'), { recursive: true });
    writeFileSync(join(v5, 'tools', 'runner.config.ts'), `export default { test: { restoreMocks: true } };\n`);

    expect(lint(v5, code, { configFile: 'tools/runner.config.ts' })[0]?.message).toMatch(/on by default from Vitest 5/);
    expect(lint(v5, code, { configFile: 'tools/runner.config.ts', clearMocks: true })[0]?.message).toMatch(/`clearMocks: true`/);
    expect(lint(v5, code, { configFile: 'tools/runner.config.ts', clearMocks: false })).toHaveLength(0);
    // Inline flags are the whole answer: what they leave out is off, whatever Vitest is installed.
    expect(lint(v5, code, { restoreMocks: true })).toHaveLength(0);
  });
});
