/**
 * The managed block. Two properties matter more than its wording: running `init` twice is a no-op,
 * and text the repository wrote itself is never touched — the block is regenerated between its
 * markers and everything outside them survives byte for byte.
 */
import { describe, expect, it } from 'vitest';

import { applyManaged, digest, hasManaged, removeManaged, renderBody, wrapManaged } from './init-block';
import type { Profile } from './profile';

const profileWith = (over: Partial<Profile>): Profile => ({
  cwd: '/repo',
  runner: 'vitest',
  framework: 'none',
  entry: 'vitest-auto-spy',
  hasRxjs: false,
  hasAngular: false,
  setupFiles: [],
  dependencies: {},
  scripts: {},
  files: [],
  ...over,
});

describe('renderBody', () => {
  it('names the entry this repository should import from', () => {
    const body = renderBody(profileWith({ entry: 'vitest-auto-spy/bun-angular' }));

    expect(body).toContain('imports from `vitest-auto-spy/bun-angular`');
  });

  it('carries one adapter bullet per framework', () => {
    expect(renderBody(profileWith({ framework: 'angular' }))).toContain('provideAutoSpy(Class)` in the TestBed providers');
    expect(renderBody(profileWith({ framework: 'nestjs' }))).toContain('testing module providers');
    expect(renderBody(profileWith({ framework: 'react' }))).toContain('hook or context value');
    expect(renderBody(profileWith({ framework: 'vue' }))).toContain('Pinia store');
    expect(renderBody(profileWith({ framework: 'svelte' }))).toContain('writable store');
    expect(renderBody(profileWith({ framework: 'none' }))).toContain('createSpyFromClass(Class)`');
  });

  it('omits the rxjs bullet entirely when rxjs is not installed', () => {
    expect(renderBody(profileWith({ hasRxjs: false }))).not.toContain('vitest-auto-spy/rxjs');
  });

  it('names the real setup file when the config declares one', () => {
    expect(renderBody(profileWith({ hasRxjs: true, setupFiles: ['src/vitest.setup.ts'] }))).toContain('`src/vitest.setup.ts`');
    expect(renderBody(profileWith({ hasRxjs: true }))).toContain('`the test setup file`');
  });

  it('stays inside the budget Codex truncates at', () => {
    const body = renderBody(profileWith({ framework: 'angular', hasRxjs: true, setupFiles: ['src/test-setup.ts'] }));

    expect(Buffer.byteLength(body, 'utf8')).toBeLessThan(1_600);
  });
});

describe('markers', () => {
  it('stamps the version and a digest of the body', () => {
    const managed = wrapManaged('body', '9.9.9');

    expect(managed).toContain(`<!-- vitest-auto-spy:begin v=9.9.9 sha=${digest('body')} -->`);
    expect(hasManaged(managed)).toBe(true);
    expect(hasManaged('no markers here')).toBe(false);
  });
});

describe('applyManaged', () => {
  it('appends to a file that has none, with exactly one blank line', () => {
    expect(applyManaged('', 'BLOCK')).toBe('BLOCK\n');
    expect(applyManaged('text', 'BLOCK')).toBe('text\n\nBLOCK\n');
    expect(applyManaged('text\n', 'BLOCK')).toBe('text\n\nBLOCK\n');
    expect(applyManaged('text\n\n', 'BLOCK')).toBe('text\n\nBLOCK\n');
  });

  it('replaces in place and leaves the surrounding text untouched', () => {
    const first = applyManaged('before\n', wrapManaged('one', '1.0.0'));
    const second = applyManaged(`${first}after\n`, wrapManaged('two', '2.0.0'));

    expect(second).toContain('before');
    expect(second).toContain('after');
    expect(second).toContain('two');
    expect(second).not.toContain('one');
  });
});

describe('removeManaged', () => {
  it('restores the file it was appended to', () => {
    const applied = applyManaged('mine\n', wrapManaged('block', '1.0.0'));

    expect(removeManaged(applied)).toBe('mine\n');
    expect(removeManaged('untouched\n')).toBe('untouched\n');
  });

  it('leaves the text that followed the block', () => {
    const applied = `${applyManaged('', wrapManaged('block', '1.0.0'))}tail\n`;

    expect(removeManaged(applied)).toBe('tail\n');
  });
});
