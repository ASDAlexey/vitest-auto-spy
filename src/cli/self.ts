/**
 * This package's own files, located from wherever the CLI happens to be running: `dist/cli.js` in
 * a consumer's `node_modules`, or `src/cli.ts` under Vitest. Walking up to the `package.json` that
 * names us is the only form that survives both.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonc, readTextFile } from './fs-scan';
import { isRecord } from './profile';

const PACKAGE_NAME = 'vitest-auto-spy';

function moduleDirectory(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/** The root of this package — the directory holding the `package.json` that names it. */
export function ownPackageRoot(from: string = moduleDirectory()): string | undefined {
  let current = from;

  for (let depth = 0; depth < 8; depth += 1) {
    const text = readTextFile(join(current, 'package.json'));
    const parsed = text === undefined ? undefined : parseJsonc(text);

    if (isRecord(parsed) && parsed['name'] === PACKAGE_NAME) {
      return current;
    }

    const parent = dirname(current);

    if (parent === current) {
      return undefined;
    }

    current = parent;
  }

  return undefined;
}

/** The version in a package root's manifest, or a placeholder when there is no root to read. */
export function versionFrom(root: string | undefined): string {
  const parsed = root === undefined ? undefined : parseJsonc(readTextFile(join(root, 'package.json')) ?? '');

  return isRecord(parsed) && typeof parsed['version'] === 'string' ? parsed['version'] : '0.0.0';
}

export function ownVersion(): string {
  return versionFrom(ownPackageRoot());
}

/**
 * Reads a file shipped inside this package's tarball, e.g. `skills/vitest-auto-spy/SKILL.md`. The
 * root is passed in rather than defaulted, so a caller cannot silently read from a package that is
 * not this one.
 */
export function ownFile(relativePath: string, root: string | undefined): string | undefined {
  return root === undefined ? undefined : readTextFile(join(root, relativePath));
}

/**
 * The shipped skill's frontmatter, verbatim. The description is what makes a client load the
 * skill, so the stub `init` writes must not paraphrase it — and copying it means the stub cannot
 * drift from the package it came from.
 */
export function skillFrontmatter(root: string | undefined = ownPackageRoot()): string | undefined {
  const text = ownFile('skills/vitest-auto-spy/SKILL.md', root);

  if (text === undefined) {
    return undefined;
  }

  const match = /^---\n([\S\s]*?)\n---/.exec(text);

  return match === null ? undefined : match[1];
}
