/**
 * A rollback that fails too: the one outcome a temporary directory cannot stage on demand.
 */
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import * as fsScan from './fs-scan';
import { runInit } from './init';
import { readProfile } from './profile';
import { createTempRepo, removeTempRepos } from './temp-repo';

// Under isolate: false the modules that import the mocked ones may already be evaluated against the real
// ones; a fresh graph is what lets the mock reach them, and dropping it after keeps it out of the next file.
vi.hoisted(() => vi.resetModules());
afterAll(() => vi.resetModules());

const writes = vi.hoisted(() => ({ armed: false, count: 0, afterWrite: undefined as (() => void) | undefined }));

vi.mock('./fs-scan', async (importOriginal) => {
  const original = await importOriginal<typeof fsScan>();

  return {
    ...original,
    writeTextFile: (path: string, content: string): void => {
      writes.count += writes.armed ? 1 : 0;

      if (writes.count === 2) {
        throw 'disk full';
      }

      if (writes.count === 3) {
        throw new Error('read-only file system');
      }

      original.writeTextFile(path, content);
      writes.afterWrite?.();
    },
  };
});

afterEach(() => {
  writes.armed = false;
  writes.count = 0;
  writes.afterWrite = undefined;
  removeTempRepos();
});

describe('runInit when the rollback fails too', () => {
  it('rechecks for a symlink introduced after planning before writing a target', () => {
    const root = createTempRepo({ 'package.json': '{}' });
    const external = createTempRepo({});
    writes.afterWrite = () => {
      symlinkSync(external, join(root, '.claude'));
      writes.afterWrite = undefined;
    };

    const result = runInit(readProfile(root), '1.2.3', { check: false, dryRun: false, uninstall: false, only: ['AGENTS.md', '.claude'] });

    expect(result.ok).toBe(false);
    expect(result.actions).toEqual([
      { path: 'AGENTS.md', status: 'skipped', note: 'rolled back — .claude/skills/vitest-auto-spy/SKILL.md could not be written' },
      { path: '.claude/skills/vitest-auto-spy/SKILL.md', status: 'failed', note: 'symbolic link at .claude' },
    ]);
    expect(fsScan.pathExists(join(root, 'AGENTS.md'))).toBe(false);
    expect(fsScan.pathExists(join(external, 'skills'))).toBe(false);
  });

  it('names the file left written and the reason for both failures', () => {
    const root = createTempRepo({ 'package.json': '{}', 'AGENTS.md': 'mine\n' });

    writes.armed = true;

    const result = runInit(readProfile(root), '1.2.3', { check: false, dryRun: false, uninstall: false });

    expect(result.actions.slice(0, 2)).toEqual([
      { path: 'AGENTS.md', status: 'failed', note: 'written, and could not be rolled back: read-only file system' },
      { path: 'CLAUDE.md', status: 'failed', note: 'disk full' },
    ]);
    expect(result.warnings.slice(0, 2)).toEqual([
      'CLAUDE.md could not be written (disk full).',
      'AGENTS.md was written but could not be put back (read-only file system).',
    ]);
    expect(fsScan.readTextFile(join(root, 'AGENTS.md'))).toContain('vitest-auto-spy:begin');
    expect(result.ok).toBe(false);
  });
});
