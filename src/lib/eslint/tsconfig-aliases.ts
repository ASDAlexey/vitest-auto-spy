/**
 * The `compilerOptions.paths` a spec file is compiled with: those of the nearest directory above it
 * whose `tsconfig.json` / `tsconfig.base.json` declares any, the way a workspace keeps them at its root.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { parseJsonc } from '../jsonc';
import { type PathAlias, matchingAlias, readCompilerPaths } from '../tsconfig-paths';

/** One answer per directory for the length of the lint run. */
const aliasesCache = new Map<string, readonly PathAlias[]>();

function readConfig(directory: string, path: string): unknown {
  try {
    return parseJsonc(readFileSync(join(directory, path), 'utf8'));
  } catch {
    return undefined;
  }
}

function aliasesAt(directory: string): readonly PathAlias[] {
  const cached = aliasesCache.get(directory);

  if (cached !== undefined) {
    return cached;
  }

  const own = readCompilerPaths((path) => readConfig(directory, path)).aliases;
  const parent = dirname(directory);
  const aliases = own.length > 0 || parent === directory ? own : aliasesAt(parent);

  aliasesCache.set(directory, aliases);

  return aliases;
}

/** The tsconfig alias a bare specifier resolves through from this file, when it names a file of the workspace. */
export function localAliasOf(filename: string, specifier: string): PathAlias | undefined {
  const alias = matchingAlias(specifier, aliasesAt(resolve(dirname(filename))))?.alias;

  return alias?.targets.some((target) => !target.startsWith('node_modules/')) === true ? alias : undefined;
}
