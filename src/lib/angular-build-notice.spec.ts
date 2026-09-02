/**
 * The notice is pinned from both sides: the one shape it must speak on — the builder's marker set
 * and a version in the window — and every other shape it must stay quiet on, because a line at the
 * start of every run that does not need it would be a nag nobody can act on.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type ReadFile,
  noticeAngularBuildSplitting,
  readInstalledAngularBuildVersion,
  resetAngularBuildNotice,
  underAngularUnitTestBuilder,
} from './angular-build-notice';

const BUILDER_MARKER = Symbol.for('@angular/cli/vitest-mock-patch');

function manifestOf(version: string): string {
  return JSON.stringify({ name: '@angular/build', version });
}

function readerOver(files: Record<string, string>): ReadFile {
  return (path) => files[path];
}

describe('readInstalledAngularBuildVersion', () => {
  it('reads the version next to the working directory', () => {
    const read = readerOver({ '/repo/node_modules/@angular/build/package.json': manifestOf('22.1.6') });

    expect(readInstalledAngularBuildVersion('/repo', read)).toBe('22.1.6');
  });

  it('walks up to a hoisted install, the way require would', () => {
    const read = readerOver({ '/repo/node_modules/@angular/build/package.json': manifestOf('22.1.5') });

    expect(readInstalledAngularBuildVersion('/repo/packages/app', read)).toBe('22.1.5');
  });

  it('gives up at the root when no directory on the way has the package', () => {
    const visited: string[] = [];
    const read: ReadFile = (path) => {
      visited.push(path);

      return undefined;
    };

    expect(readInstalledAngularBuildVersion('/a/b', read)).toBeUndefined();
    expect(visited).toEqual([
      '/a/b/node_modules/@angular/build/package.json',
      '/a/node_modules/@angular/build/package.json',
      '/node_modules/@angular/build/package.json',
    ]);
  });

  it('treats a manifest that is not JSON, or has no version, as absent', () => {
    expect(
      readInstalledAngularBuildVersion('/repo', readerOver({ '/repo/node_modules/@angular/build/package.json': '{' })),
    ).toBeUndefined();
    expect(
      readInstalledAngularBuildVersion(
        '/repo',
        readerOver({ '/repo/node_modules/@angular/build/package.json': JSON.stringify({ version: 22 }) }),
      ),
    ).toBeUndefined();
    expect(
      readInstalledAngularBuildVersion('/repo', readerOver({ '/repo/node_modules/@angular/build/package.json': 'null' })),
    ).toBeUndefined();
  });

  it('reads the install in this repository through the built-in fs, with no static import of it', () => {
    const cwd = process.cwd();
    const expected: unknown = JSON.parse(readFileSync(`${cwd}/node_modules/@angular/build/package.json`, 'utf8'));

    expect(readInstalledAngularBuildVersion(cwd)).toMatch(/^\d+\.\d+\.\d+/);
    expect(readInstalledAngularBuildVersion(cwd)).toBe((expected as { version: string }).version);
  });

  it('is undefined, not an error, for a directory that does not exist', () => {
    expect(readInstalledAngularBuildVersion('/definitely/not/a/directory')).toBeUndefined();
  });

  it('is undefined on a Node without getBuiltinModule', () => {
    const real = process.getBuiltinModule;

    Reflect.set(process, 'getBuiltinModule', undefined);

    try {
      expect(readInstalledAngularBuildVersion(process.cwd())).toBeUndefined();
    } finally {
      Reflect.set(process, 'getBuiltinModule', real);
    }
  });

  it('is undefined where there is no process at all', () => {
    const real = globalThis.process;

    Reflect.deleteProperty(globalThis, 'process');

    try {
      expect(readInstalledAngularBuildVersion('/repo')).toBeUndefined();
    } finally {
      Reflect.set(globalThis, 'process', real);
    }
  });
});

describe('noticeAngularBuildSplitting', () => {
  const written: string[] = [];
  const write = (message: string): void => {
    written.push(message);
  };

  beforeEach(() => {
    written.length = 0;
    resetAngularBuildNotice();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, BUILDER_MARKER);
    resetAngularBuildNotice();
  });

  function underBuilder(): void {
    Reflect.set(globalThis, BUILDER_MARKER, true);
  }

  it('detects the builder by the marker its own setup file leaves', () => {
    expect(underAngularUnitTestBuilder()).toBe(false);

    underBuilder();

    expect(underAngularUnitTestBuilder()).toBe(true);
  });

  it('says nothing outside the builder, and never reads a version there', () => {
    let reads = 0;

    noticeAngularBuildSplitting(write, () => {
      reads += 1;

      return '22.1.6';
    });

    expect(written).toEqual([]);
    expect(reads).toBe(0);
  });

  it('says nothing when the installed version is outside the window, or unreadable', () => {
    underBuilder();

    for (const version of ['22.1.4', '22.1.7', '21.2.16', 'not a version', undefined]) {
      resetAngularBuildNotice();
      noticeAngularBuildSplitting(write, () => version);
    }

    expect(written).toEqual([]);
  });

  it('says nothing where there is no process to take a working directory from', () => {
    const real = globalThis.process;

    underBuilder();
    Reflect.deleteProperty(globalThis, 'process');

    try {
      noticeAngularBuildSplitting(write);
    } finally {
      Reflect.set(globalThis, 'process', real);
    }

    expect(written).toEqual([]);
  });

  it('speaks once in the window, naming the version, both exits and the opt-out', () => {
    underBuilder();

    noticeAngularBuildSplitting(write, () => '22.1.6');
    noticeAngularBuildSplitting(write, () => '22.1.6');

    expect(written).toHaveLength(1);
    expect(written[0]).toContain('[vitest-auto-spy] @angular/build 22.1.6 builds the unit-test bundle with code splitting off');
    expect(written[0]).toContain('`--coverage` grows by hundreds of megabytes with no plateau');
    expect(written[0]).toContain('Upgrade to 22.1.7 or newer and set `"splitting": true` on the test target');
    expect(written[0]).toContain('reports this as angular-build-splitting-off');
    expect(written[0]).toContain('setupAutoSpy({ angularBuildHint: false })');
    expect(written[0]).toContain('Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular');
  });

  it('reads the version once per process, whatever it finds', () => {
    let reads = 0;

    underBuilder();

    for (let call = 0; call < 3; call += 1) {
      noticeAngularBuildSplitting(write, () => {
        reads += 1;

        return '22.1.7';
      });
    }

    expect(reads).toBe(1);
    expect(written).toEqual([]);
  });

  it('goes to stderr by default, and reads the version installed here', () => {
    const chunks: string[] = [];
    const real = process.stderr.write;

    Reflect.set(process.stderr, 'write', (chunk: unknown) => {
      chunks.push(String(chunk));

      return true;
    });
    underBuilder();

    try {
      noticeAngularBuildSplitting();
    } finally {
      Reflect.set(process.stderr, 'write', real);
    }

    // This repository's own `@angular/build` decides which side of the window the line lands on.
    const installed = readInstalledAngularBuildVersion(process.cwd());
    const affected = installed !== undefined && /^22\.1\.[56]\b/.test(installed);

    expect(chunks).toHaveLength(affected ? 1 : 0);
  });
});
