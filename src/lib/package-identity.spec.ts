import { afterEach, describe, expect, it } from 'vitest';

// Importing the core entry is what registers this install — the very thing under test.
import '../index';
import {
  describeDuplicateCopies,
  getPackageCopies,
  registerPackageCopy,
  resetPackageCopies,
  toModuleFormat,
  toPackageRoot,
} from './package-identity';

/** Put the genuine registration back, so a later spec in the same environment still sees one copy. */
const restoreRealCopy = (): void => {
  resetPackageCopies();
  registerPackageCopy();
};

afterEach(restoreRealCopy);

describe('toPackageRoot', () => {
  it('strips the build layout off a published and a source module URL', () => {
    expect(toPackageRoot('file:///app/node_modules/vitest-auto-spy/dist/angular.js')).toBe('file:///app/node_modules/vitest-auto-spy');
    expect(toPackageRoot('file:///repo/vitest-auto-spy/src/lib/package-identity.ts')).toBe('file:///repo/vitest-auto-spy');
  });

  it('keeps a URL that carries neither layout', () => {
    expect(toPackageRoot('file:///somewhere/bundled.js')).toBe('file:///somewhere/bundled.js');
  });
});

describe('toModuleFormat', () => {
  it('recognises the CommonJS build by its extension', () => {
    expect(toModuleFormat('file:///app/node_modules/vitest-auto-spy/dist/index.cjs')).toBe('cjs');
    expect(toModuleFormat('file:///app/node_modules/vitest-auto-spy/dist/index.js')).toBe('esm');
  });
});

describe('describeDuplicateCopies', () => {
  it('stays quiet while a single install is registered', () => {
    expect(getPackageCopies()).toHaveLength(1);
    expect(describeDuplicateCopies()).toBeUndefined();
  });

  it('ignores a second registration of the same install', () => {
    resetPackageCopies();
    registerPackageCopy('file:///app/node_modules/vitest-auto-spy/dist/index.js');
    registerPackageCopy('file:///app/node_modules/vitest-auto-spy/dist/console.js');

    expect(describeDuplicateCopies()).toBeUndefined();
  });

  it('reports two installs and how to collapse the tree', () => {
    resetPackageCopies();
    registerPackageCopy('file:///app/node_modules/vitest-auto-spy/dist/index.js');
    registerPackageCopy('file:///app/node_modules/other/node_modules/vitest-auto-spy/dist/index.js');

    const report = describeDuplicateCopies();

    expect(report).toContain('vitest-auto-spy is loaded 2 times from different installs');
    expect(report).toContain('file:///app/node_modules/other/node_modules/vitest-auto-spy (esm)');
    expect(report).toContain('npm ls vitest-auto-spy');
  });

  it('reports one install loaded in both module formats, and what to do instead', () => {
    resetPackageCopies();
    registerPackageCopy('file:///app/node_modules/vitest-auto-spy/dist/index.js');
    registerPackageCopy('file:///app/node_modules/vitest-auto-spy/dist/index.cjs');

    const report = describeDuplicateCopies();

    expect(report).toContain('from one install, in both module formats');
    expect(report).toContain('server.deps.inline');
  });
});
