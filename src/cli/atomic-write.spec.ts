import { chmodSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { writeFileAtomic } from './atomic-write';
import { createTempRepo, linkInRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  removeTempRepos();
});

describe('writeFileAtomic', () => {
  it('creates the parent directories and leaves no temporary file behind', () => {
    const root = createTempRepo({});

    writeFileAtomic(join(root, 'a/b/c.ts'), 'one');

    expect(readFileSync(join(root, 'a/b/c.ts'), 'utf8')).toBe('one');
    expect(readdirSync(join(root, 'a/b'))).toEqual(['c.ts']);
  });

  it('replaces an existing file and keeps its mode', () => {
    const root = createTempRepo({ 'run.sh': 'old' });
    const path = join(root, 'run.sh');

    chmodSync(path, 0o755);
    writeFileAtomic(path, 'new');

    expect(readFileSync(path, 'utf8')).toBe('new');
    expect(statSync(path).mode & 0o777).toBe(0o755);
  });

  it('writes through a symlink rather than replacing it', () => {
    const root = createTempRepo({ 'real.ts': 'old' });

    linkInRepo(root, 'link.ts', 'real.ts');
    writeFileAtomic(join(root, 'link.ts'), 'new');

    expect(readFileSync(join(root, 'real.ts'), 'utf8')).toBe('new');
  });

  it('removes the temporary file and rethrows when the rename fails', () => {
    const root = createTempRepo({ 'dir/inner.ts': 'x' });

    expect(() => writeFileAtomic(join(root, 'dir'), 'text')).toThrow();
    expect(readdirSync(root)).toEqual(['dir']);
  });
});
