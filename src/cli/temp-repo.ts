/**
 * A throwaway repository on disk, for the specs of a tool whose whole job is reading one.
 *
 * The CLI is deliberately layered so that most of it is pure string work, but the parts that walk
 * a tree, resolve a symlink or refuse to overwrite a file only mean anything against real inodes.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeTextFile } from './fs-scan';

const created: string[] = [];

/** Writes a repository. A key ending in `/` creates an empty directory. */
export function createTempRepo(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'vitest-auto-spy-cli-'));

  created.push(root);

  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith('/')) {
      mkdirSync(join(root, path), { recursive: true });

      continue;
    }

    writeTextFile(join(root, path), content);
  }

  return root;
}

export function linkInRepo(root: string, from: string, to: string): void {
  symlinkSync(join(root, to), join(root, from));
}

export function removeTempRepos(): void {
  for (const directory of created.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
}
