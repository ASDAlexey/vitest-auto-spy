import { mkdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

let counter = 0;

const OWNER_WRITE = 0o200;

function existing(path: string): { target: string; mode: number | undefined } {
  try {
    const target = realpathSync(path);

    return { target, mode: statSync(target).mode & 0o7777 };
  } catch {
    return { target: path, mode: undefined };
  }
}

/**
 * Writes through a temporary file in the same directory and a rename, so a crash or a full disk
 * leaves the old file or the new one, never half of either. A symlink is written through, and an
 * existing file keeps its mode. A read-only file is refused, as a plain write would refuse it: the
 * rename replaces it whatever its mode. No fsync: at ~5 ms a file it would dominate a codemod run.
 */
export function writeFileAtomic(path: string, text: string): void {
  const { target, mode } = existing(path);

  if (mode !== undefined && (mode & OWNER_WRITE) === 0) {
    throw Object.assign(new Error(`EACCES: ${target} is read-only, so it was left as it is`), { code: 'EACCES' });
  }

  const temporary = join(dirname(target), `.${basename(target)}.${process.pid}.${(counter += 1)}.tmp`);

  mkdirSync(dirname(target), { recursive: true });

  try {
    writeFileSync(temporary, text, mode === undefined ? 'utf8' : { encoding: 'utf8', mode });
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { force: true });

    throw error;
  }
}
