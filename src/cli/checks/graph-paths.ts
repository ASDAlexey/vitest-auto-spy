import { join } from 'node:path';

import { type CompilerPaths, readCompilerPaths as readPaths } from '../../lib/tsconfig-paths';
import { parseJsonc, readTextFile } from '../fs-scan';

export { type CompilerPaths, type PathAlias, aliasCandidates } from '../../lib/tsconfig-paths';

export function readCompilerPaths(cwd: string): CompilerPaths {
  return readPaths((path) => parseJsonc(readTextFile(join(cwd, path)) ?? ''));
}
