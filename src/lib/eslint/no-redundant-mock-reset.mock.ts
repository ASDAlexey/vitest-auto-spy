import { Linter } from 'eslint';

export function createFlatLinter(cwd: string): Linter {
  return new Linter({ configType: 'flat', cwd });
}

export const CLEANUP_OPTIONS = { force: true, recursive: true };
