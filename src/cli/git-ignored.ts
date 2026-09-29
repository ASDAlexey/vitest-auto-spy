import { spawnSync } from 'node:child_process';

/**
 * The paths `git diff` will never show: ignored and not in the index. Empty outside a repository or
 * without git, where there is nothing to warn about.
 */
export function ignoredByGit(cwd: string, paths: readonly string[]): ReadonlySet<string> {
  if (paths.length === 0) {
    return new Set();
  }

  const result = spawnSync('git', ['check-ignore', '--', ...paths], { cwd, encoding: 'utf8' });

  return new Set(result.status === 0 ? result.stdout.split('\n').filter((line) => line !== '') : []);
}
