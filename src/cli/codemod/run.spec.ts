/**
 * The command: file selection, the read-only default, `--write`, and the verify pass.
 *
 * The exit codes are the contract with CI, and they are the reason the default is a dry run: a
 * repository's first contact with this tool is a proposal it can reject, exactly as `doctor` is
 * read-only by policy. `--verify` is the other half — it transforms nothing and matches the files
 * against the patterns the transforms remove, which is the check that still works on a file
 * somebody migrated by hand.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { readTextFile } from '../fs-scan';
import { runCli } from '../main';
import type { CliIo } from '../main';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { TRANSFORMS, residueOf, selectTransforms } from './codemod';
import { listing, readAll, selectFiles } from './run';

afterEach(() => {
  removeTempRepos();
});

interface Recorder extends CliIo {
  readonly stdout: string[];
  readonly stderr: string[];
}

function recorder(): Recorder {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return { stdout, stderr, out: (line) => stdout.push(line), err: (line) => stderr.push(line) };
}

const LEGACY = [
  "import { createSpyFromClass, provideAutoSpy, Spy } from 'jest-auto-spies';",
  '',
  "import { Service } from './service';",
  '',
  'describe("Service", () => {',
  '  let service: Spy<Service>;',
  '  let hook: jest.Mock<void, [Service]>;',
  '',
  '  beforeEach(() => {',
  '    service = TestBed.inject(Service) as Spy<Service>;',
  '    jest.spyOn(service, "load").mockImplementation();',
  '    hook = jest.fn();',
  '  });',
  '});',
  '',
].join('\n');

const REPO = {
  'package.json': JSON.stringify({ scripts: { test: 'vitest run' }, devDependencies: { vitest: '^4', '@angular/core': '^20' } }),
  'src/app/service.spec.ts': LEGACY,
  'src/app/service.ts': 'export class Service {}\n',
};

describe('selectFiles', () => {
  const files = ['src/a.spec.ts', 'src/a.ts', 'src/b.test.tsx', 'src/types.d.ts', 'tools/c.spec.ts'];

  it('visits only the specs when no path is given', () => {
    expect(selectFiles(files, [])).toEqual(['src/a.spec.ts', 'src/b.test.tsx', 'tools/c.spec.ts']);
  });

  it('visits every TypeScript file under a path that was given, minus the declarations', () => {
    expect(selectFiles(files, ['./src/'])).toEqual(['src/a.spec.ts', 'src/a.ts', 'src/b.test.tsx']);
    expect(selectFiles(files, ['src/a.ts'])).toEqual(['src/a.ts']);
  });
});

describe('readAll', () => {
  it('skips a path that cannot be read rather than treating it as an empty file', () => {
    const root = createTempRepo({ 'a.ts': 'x' });

    expect(readAll(root, ['a.ts', 'gone.ts'])).toEqual([['a.ts', 'x']]);
  });
});

describe('selectTransforms', () => {
  it('runs everything by default, and honours --only and --skip', () => {
    expect(selectTransforms(undefined, undefined)).toHaveLength(TRANSFORMS.length);
    expect(selectTransforms('jest-types', undefined)).toHaveLength(1);
    expect(selectTransforms(undefined, 'jest-types,inject-cast')).toHaveLength(TRANSFORMS.length - 2);
  });

  it('reports an unknown id instead of silently running everything', () => {
    expect(selectTransforms('jest-typo', undefined)).toContain('Unknown transform: jest-typo');
  });
});

describe('residueOf', () => {
  it('matches the result rather than the diff, and sees into a template literal', () => {
    const findings = residueOf('a.spec.ts', 'const a = `jest.fn()`;', TRANSFORMS);

    expect(findings.map((finding) => finding.check)).toEqual(['residue/jest-namespace']);
    expect(findings[0]?.file).toBe('a.spec.ts:1');
  });
});

describe('codemod', () => {
  it('writes nothing by default, prints the diff, and prints the resulting imports in full', () => {
    const root = createTempRepo(REPO);
    const io = recorder();
    const code = runCli(['codemod', '--cwd', root], io);
    const output = io.stdout.join('\n');

    expect(code).toBe(0);
    expect(output).toContain('Dry run — nothing is written');
    expect(output).toContain("import { createSpyFromClass, Spy, asSpy } from 'vitest-auto-spy';");
    expect(output).toContain("import { provideAutoSpy } from 'vitest-auto-spy/angular';");
    expect(output).toContain('+    service = asSpy<Service>(TestBed.inject(Service));');
    expect(output).toContain('+  let hook: Mock<(arg0: Service) => void>;');
    expect(output).toContain('.mockImplementation(() => undefined)');
    expect(output).toContain('jest-namespace            2 edits');
    expect(readTextFile(`${root}/src/app/service.spec.ts`)).toBe(LEGACY);
  });

  it('applies the edits under --write, and then has nothing left to verify', () => {
    const root = createTempRepo(REPO);

    expect(runCli(['codemod', '--cwd', root, '--write'], recorder())).toBe(0);

    const written = readTextFile(`${root}/src/app/service.spec.ts`) ?? '';
    const verify = recorder();

    expect(written).toContain("import type { Mock } from 'vitest';");
    expect(written).not.toContain('jest-auto-spies');
    expect(runCli(['codemod', '--cwd', root, '--verify'], verify)).toBe(0);
    expect(verify.stdout.join('\n')).toContain('Nothing left to migrate.');
  });

  it('exits 1 from --verify on a suite that has not been migrated, naming each leftover', () => {
    const root = createTempRepo(REPO);
    const io = recorder();

    expect(runCli(['codemod', '--cwd', root, '--verify'], io)).toBe(1);
    expect(io.stdout.join('\n')).toContain('residue/auto-spies-import');
    expect(io.stdout.join('\n')).toContain('residue/inject-cast');
  });

  it('exits 1 when something was left alone, and names it', () => {
    const root = createTempRepo({ ...REPO, 'src/app/service.spec.ts': 'jest.requireMock("x");\n' });
    const io = recorder();

    expect(runCli(['codemod', '--cwd', root], io)).toBe(1);
    expect(io.stdout.join('\n')).toContain('no-vi-twin');
  });

  it('restricts itself to the transforms asked for, and to the paths asked for', () => {
    const root = createTempRepo(REPO);
    const io = recorder();

    expect(runCli(['codemod', 'src/app/service.spec.ts', '--cwd', root, '--only', 'mock-implementation-arity'], io)).toBe(0);

    const output = io.stdout.join('\n');

    expect(output).toContain('mock-implementation-arity');
    expect(output).not.toContain('auto-spies-import         1 edit');
  });

  it('rejects an unknown transform id with exit code 2', () => {
    const io = recorder();

    expect(runCli(['codemod', '--cwd', createTempRepo(REPO), '--only', 'nope'], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('Unknown transform');
  });

  it('prints the transform table and the generated entry map under --list', () => {
    const io = recorder();

    expect(runCli(['codemod', '--cwd', createTempRepo(REPO), '--list', '--skip', 'jest-types'], io)).toBe(0);

    const output = io.stdout.join('\n');

    expect(output).toContain('Entry-point table');
    expect(output).toContain('provideAutoSpy');
    expect(output).toContain('- jest-types');
  });

  it('says so when there is no installed copy to read an export map from', () => {
    expect(listing(undefined, TRANSFORMS)).toContain('no installed vitest-auto-spy found');
    expect(listing(undefined, TRANSFORMS)).toContain('(unavailable)');
  });

  it('reports a leftover it made no edit and no note about', () => {
    const root = createTempRepo({ ...REPO, 'src/app/service.spec.ts': 'const help = `run xit(name) under jest`;\n' });
    const io = recorder();

    expect(runCli(['codemod', '--cwd', root], io)).toBe(1);
    expect(io.stdout.join('\n')).toContain('residue/jasmine-aliases');
  });

  it('reports a clean repository without a diff', () => {
    const root = createTempRepo({ ...REPO, 'src/app/service.spec.ts': 'describe("a", () => {});\n' });
    const io = recorder();

    expect(runCli(['codemod', '--cwd', root], io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('0 files would change, 0 edits');
  });

  it('is listed on the help screen', () => {
    const io = recorder();

    runCli(['help'], io);

    expect(io.stdout.join('\n')).toContain('codemod   Migrate a suite off jest-auto-spies');
  });
});
