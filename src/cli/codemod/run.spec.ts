/**
 * The command: file selection, the read-only default, `--write`, and the verify pass.
 *
 * The exit codes are the contract with CI, and they are the reason the default is a dry run: a
 * repository's first contact with this tool is a proposal it can reject, exactly as `doctor` is
 * read-only by policy. `--verify` is the other half — it transforms nothing and matches the files
 * against the patterns the transforms remove, which is the check that still works on a file
 * somebody migrated by hand.
 */
import { chmodSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { SCAN_CAP_ENV, readTextFile } from '../fs-scan';
import { runCli } from '../main';
import type { CliIo } from '../main';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { TRANSFORMS, residueOf, resolveFrom, runTransforms, selectTransforms } from './codemod';
import { listing, listingDocument, readAll, selectFiles } from './run';
import { JASMINE, LEGACY, REPO } from './run.mock';
import { jestNamespace } from './transforms-jest';

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

const cwdArgs = (root: string, ...flags: string[]): string[] => ['codemod', '--cwd', root, ...flags];

describe('selectFiles', () => {
  const files = ['src/a.spec.ts', 'src/a.ts', 'src/b.test.tsx', 'src/legacy.spec.js', 'src/types.d.ts', 'tools/c.spec.ts'];

  it('visits only the specs when no path is given, JavaScript ones included', () => {
    expect(selectFiles('/repo', files, []).files).toEqual(['src/a.spec.ts', 'src/b.test.tsx', 'src/legacy.spec.js', 'tools/c.spec.ts']);
  });

  it('visits every source file under a path that was given, minus the declarations', () => {
    expect(selectFiles('/repo', files, ['./src/']).files).toEqual(['src/a.spec.ts', 'src/a.ts', 'src/b.test.tsx', 'src/legacy.spec.js']);
    expect(selectFiles('/repo', files, ['src/a.ts']).files).toEqual(['src/a.ts']);
  });

  it('resolves an absolute path and the repository root against the scan', () => {
    expect(selectFiles('/repo', files, ['/repo/src/a.ts']).files).toEqual(['src/a.ts']);
    expect(selectFiles('/repo', files, ['.']).files).toHaveLength(files.length - 1);
  });

  it('reports a path that names no file instead of answering "nothing to do"', () => {
    expect(selectFiles('/repo', files, ['src/nope.spec.ts'])).toEqual({ files: [], missing: ['src/nope.spec.ts'] });
    expect(selectFiles('/repo', files, ['/elsewhere/src']).missing).toEqual(['/elsewhere/src']);
    expect(selectFiles('/repo', files, ['src/a.ts', 'src/nope.ts']).files).toEqual(['src/a.ts']);
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

describe('resolveFrom', () => {
  it('defaults to auto, takes both spellings of jasmine, and answers undefined for anything else', () => {
    expect(resolveFrom(undefined)).toBe('auto');
    expect(resolveFrom('auto')).toBe('auto');
    expect(resolveFrom('jasmine')).toBe('jasmine');
    expect(resolveFrom('jasmine-auto-spies')).toBe('jasmine');
    expect(resolveFrom('jest-auto-spies')).toBe('jest');
    expect(resolveFrom('jest')).toBeUndefined();
  });
});

describe('residueOf', () => {
  it('matches the result rather than the diff, and sees into a template literal', () => {
    const findings = residueOf('a.spec.ts', 'const a = `jest.fn()`;', TRANSFORMS);

    expect(findings.map((finding) => finding.check)).toEqual(['residue/jest-namespace']);
    expect(findings[0]?.file).toBe('a.spec.ts:1');
    expect(findings[0]?.fix).toBe('`jest-namespace` did not rewrite this. Rewrite it by hand.');
  });

  it('quotes what the transform said when it declined the span, and names the reach problem when it said nothing', () => {
    const run = (source: string): string | undefined =>
      runTransforms({ file: 'a.spec.ts', source, entries: undefined, preferredEntry: 'vitest-auto-spy', selected: [jestNamespace] })
        .residue[0]?.fix;
    const declined = runTransforms({
      file: 'a.spec.ts',
      source: 'jest.isolateModules(() => {});\n',
      entries: undefined,
      preferredEntry: 'vitest-auto-spy',
      selected: [jestNamespace],
    });

    expect(run('jest.isolateModules(() => {});\n')).toBe(
      `\`jest-namespace\` declined it: ${String(declined.notes[0]?.message)} Rewrite it by hand.`,
    );
    expect(run('const a = `jest.fn()`;\n')).toBe(
      '`jest-namespace` could not reach this, usually because it sits in a template literal or after an unbalanced bracket. Rewrite it by hand.',
    );
  });
});

describe('codemod', () => {
  it('writes nothing by default, prints the diff, and prints the resulting imports in full', async () => {
    const root = createTempRepo(REPO);
    const io = recorder();
    const code = await runCli(cwdArgs(root), io);
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

  it('says so when the scan stopped at its cap, rather than reporting a clean repository', async () => {
    const root = createTempRepo(REPO);
    const io = recorder();

    process.env[SCAN_CAP_ENV] = '1';

    try {
      await runCli(cwdArgs(root, '--verify'), io);
    } finally {
      delete process.env[SCAN_CAP_ENV];
    }

    expect(io.stderr.join('\n')).toContain('stopped at its safety cap of 1 files');
    expect(io.stderr.join('\n')).toContain(
      `Raise the cap with ${SCAN_CAP_ENV}, or pass the directories to migrate as arguments: \`npx vitest-auto-spy codemod src/app\`.`,
    );
  });

  it('applies the edits under --write, and then has nothing left to verify', async () => {
    const root = createTempRepo(REPO);

    expect(await runCli(cwdArgs(root, '--write'), recorder())).toBe(0);

    const written = readTextFile(`${root}/src/app/service.spec.ts`) ?? '';
    const verify = recorder();

    expect(written).toContain("import type { Mock } from 'vitest';");
    expect(written).not.toContain('jest-auto-spies');
    expect(await runCli(cwdArgs(root, '--verify'), verify)).toBe(0);
    expect(verify.stdout.join('\n')).toContain('Nothing left to migrate.');
  });

  it('exits 1 from --verify on a suite that has not been migrated, naming each leftover', async () => {
    const root = createTempRepo(REPO);
    const io = recorder();

    expect(await runCli(cwdArgs(root, '--verify'), io)).toBe(1);
    expect(io.stdout.join('\n')).toContain('residue/auto-spies-import');
    expect(io.stdout.join('\n')).toContain('residue/inject-cast');
  });

  it('exits 1 when something was left alone, and names it', async () => {
    const root = createTempRepo({ ...REPO, 'src/app/service.spec.ts': 'jest.requireMock("x");\n' });
    const io = recorder();

    expect(await runCli(cwdArgs(root), io)).toBe(1);
    expect(io.stdout.join('\n')).toContain('no-vi-twin');
  });

  it('restricts itself to the transforms asked for, and to the paths asked for', async () => {
    const root = createTempRepo(REPO);
    const io = recorder();

    expect(await runCli(['codemod', 'src/app/service.spec.ts', '--cwd', root, '--only', 'mock-implementation-arity'], io)).toBe(0);

    const output = io.stdout.join('\n');

    expect(output).toContain('mock-implementation-arity');
    expect(output).not.toContain('auto-spies-import         1 edit');
  });

  it('exits 2 on a path that names no file, rather than calling the run clean', async () => {
    const root = createTempRepo(REPO);
    const io = recorder();

    expect(await runCli(['codemod', 'src/nope.spec.ts', '--cwd', root, '--verify'], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('src/nope.spec.ts');
    expect(io.stdout.join('\n')).not.toContain('Nothing left to migrate.');
  });

  it('takes an absolute path for the same files a relative one names', async () => {
    const root = createTempRepo(REPO);
    const io = recorder();

    expect(await runCli(['codemod', `${root}/src/app`, '--cwd', root, '--verify'], io)).toBe(1);
    expect(io.stdout.join('\n')).toContain('residue/auto-spies-import');
  });

  it('rejects an unknown transform id with exit code 2', async () => {
    const io = recorder();

    expect(await runCli(['codemod', '--cwd', createTempRepo(REPO), '--only', 'nope'], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('Unknown transform');
  });

  it('prints the transform table and the generated entry map under --list', async () => {
    const io = recorder();

    expect(await runCli(['codemod', '--cwd', createTempRepo(REPO), '--list', '--skip', 'jest-types'], io)).toBe(0);

    const output = io.stdout.join('\n');

    expect(output).toContain('Entry-point table');
    expect(output).toContain('provideAutoSpy');
    expect(output).toContain('- jest-types');
  });

  it('says so when there is no installed copy to read an export map from', () => {
    expect(listing(undefined, TRANSFORMS)).toContain('no installed vitest-auto-spy found');
    expect(listing(undefined, TRANSFORMS)).toContain('(unavailable)');
  });

  it('reports a leftover it made no edit and no note about', async () => {
    const root = createTempRepo({ ...REPO, 'src/app/service.spec.ts': 'const help = `run xit(name) under jest`;\n' });
    const io = recorder();

    expect(await runCli(cwdArgs(root), io)).toBe(1);
    expect(io.stdout.join('\n')).toContain('residue/jasmine-aliases');
  });

  it('reports a clean repository without a diff', async () => {
    const root = createTempRepo({ ...REPO, 'src/app/service.spec.ts': 'describe("a", () => {});\n' });
    const io = recorder();

    expect(await runCli(cwdArgs(root), io)).toBe(0);
    expect(io.stdout.join('\n')).toContain('0 files would change, 0 edits');
  });

  it('migrates a jasmine suite under --from jasmine, spyOn included', async () => {
    const root = createTempRepo({ ...REPO, 'src/app/service.spec.ts': JASMINE });
    const io = recorder();

    expect(await runCli(['codemod', '--cwd', root, '--from', 'jasmine', '--write'], io)).toBe(0);

    const written = readTextFile(`${root}/src/app/service.spec.ts`) ?? '';

    expect(written).toContain("import { createSpyFromClass, Spy } from 'vitest-auto-spy';");
    expect(written).toContain("import { provideAutoSpy } from 'vitest-auto-spy/angular';");
    expect(written).toContain('vi.useFakeTimers();');
    expect(written).toContain("vi.spyOn(service, 'reset').mockImplementation(() => undefined);");
    expect(written).toContain('service.load.nextWith(1);');
    expect(written).toContain('service.save.mockReturnValue(2);');
    expect(written).toContain('expect(service.ready).toBe(true);');

    const verify = recorder();

    expect(await runCli(['codemod', '--cwd', root, '--from', 'jasmine', '--verify'], verify)).toBe(0);
    expect(verify.stdout.join('\n')).toContain('Nothing left to migrate.');
  });

  it('reaches the same result with no --from at all, because the file says which dialect it is', async () => {
    const root = createTempRepo({ ...REPO, 'src/app/service.spec.ts': JASMINE });

    expect(await runCli(cwdArgs(root, '--write'), recorder())).toBe(0);
    expect(readTextFile(`${root}/src/app/service.spec.ts`) ?? '').toContain('service.load.nextWith(1);');
  });

  it('leaves every jasmine construct alone when the run was told it is a Jest suite', async () => {
    const root = createTempRepo({ ...REPO, 'src/app/service.spec.ts': JASMINE });

    expect(await runCli(['codemod', '--cwd', root, '--from', 'jest-auto-spies', '--write'], recorder())).toBe(0);

    const written = readTextFile(`${root}/src/app/service.spec.ts`) ?? '';

    expect(written).toContain('service.load.and.nextWith(1);');
    expect(written).toContain("spyOn(service, 'reset');");
    expect(written).toContain('jasmine.clock().install();');
    expect(written).toContain("from 'vitest-auto-spy'");
  });

  it('rejects an unknown --from with exit code 2, naming what it accepts', async () => {
    const io = recorder();

    expect(await runCli(['codemod', '--cwd', createTempRepo(REPO), '--from', 'karma'], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('Unknown --from value: karma');
    expect(io.stderr.join('\n')).toContain('jasmine-auto-spies (alias: jasmine)');
  });

  it('narrows the --list table to the dialect that was named', async () => {
    const io = recorder();

    expect(await runCli(['codemod', '--cwd', createTempRepo(REPO), '--list', '--from', 'jasmine'], io)).toBe(0);

    const output = io.stdout.join('\n');

    expect(output).toContain('- jest-namespace');
    expect(output).toContain('  jasmine-spy-on');
    expect(output).toContain('  jasmine-aliases');
  });

  it('is listed on the help screen', () => {
    const io = recorder();

    runCli(['help'], io);

    expect(io.stdout.join('\n')).toContain('codemod   Migrate a suite off jest-auto-spies');
    expect(io.stdout.join('\n')).toContain('--from <pkg>');
  });

  it('prints one JSON document under --format json, and nothing else', async () => {
    const root = createTempRepo(REPO);
    const io = recorder();

    expect(await runCli(['codemod', '--cwd', root, '--format', 'json'], io)).toBe(0);
    expect(io.stdout).toHaveLength(1);

    const document = JSON.parse(io.stdout[0] ?? '') as Record<string, unknown>;
    const [file] = document['files'] as Record<string, unknown>[];

    expect(document).toMatchObject({ command: 'codemod', run: 'dry-run', exitCode: 0, findings: [] });
    expect(file).toMatchObject({ file: 'src/app/service.spec.ts', changed: true, fired: { 'jest-namespace': 2 } });
    expect(file?.['diff']).toContain('+    service = asSpy<Service>(TestBed.inject(Service));');
    expect(file?.['imports']).toContain("import { provideAutoSpy } from 'vitest-auto-spy/angular';");
  });

  it('reports the run mode and the findings in JSON for --write and --verify', async () => {
    const root = createTempRepo({ ...REPO, 'src/app/other.spec.ts': 'jest.requireMock("x");\n' });
    const verify = recorder();

    expect(await runCli(['codemod', '--cwd', root, '--verify', '--format', 'json'], verify)).toBe(1);
    expect(JSON.parse(verify.stdout.join('\n'))).toMatchObject({ run: 'verify', exitCode: 1, files: [] });

    const write = recorder();

    expect(await runCli(['codemod', '--cwd', root, '--write', '--format', 'json'], write)).toBe(1);

    const document = JSON.parse(write.stdout.join('\n')) as { run: string; findings: { check: string }[] };

    expect(document.run).toBe('write');
    expect(document.findings.map((finding) => finding.check)).toContain('no-vi-twin');

    const clean = recorder();

    expect(await runCli(['codemod', '--cwd', root, 'src/app/service.spec.ts', '--verify', '--format', 'json'], clean)).toBe(0);
    expect(JSON.parse(clean.stdout.join('\n'))).toMatchObject({ run: 'verify', exitCode: 0, findings: [] });
  });

  it('prints the transform table as JSON under --list', async () => {
    const io = recorder();

    expect(await runCli(['codemod', '--cwd', createTempRepo(REPO), '--list', '--skip', 'jest-types', '--format', 'json'], io)).toBe(0);

    const document = JSON.parse(io.stdout.join('\n')) as {
      transforms: { id: string; selected: boolean }[];
      entries: { byName: Record<string, string[]> } | null;
    };

    expect(document.transforms.find((transform) => transform.id === 'jest-types')?.selected).toBe(false);
    expect(document.entries?.byName['asSpy']).toContain('vitest-auto-spy');
  });

  it('answers null for the entry table in JSON when there is no installed copy', () => {
    expect(listingDocument(undefined, TRANSFORMS)).toMatchObject({ entries: null });
  });

  it('refuses --format markdown, which only doctor and perf render', async () => {
    const io = recorder();

    expect(await runCli(['codemod', '--cwd', createTempRepo(REPO), '--format', 'markdown'], io)).toBe(2);
    expect(io.stderr.join('\n')).toContain('codemod prints text or json');
  });

  it('warns that vi is not defined where the Vitest config leaves globals off', async () => {
    const root = createTempRepo({ ...REPO, 'vitest.config.ts': 'export default { test: {} };\n' });
    const io = recorder();

    expect(await runCli(cwdArgs(root), io)).toBe(1);
    expect(io.stdout.join('\n')).toContain('vi-without-globals');
  });

  it('keeps going past a file it cannot write, and reports that file unchanged', async () => {
    const root = createTempRepo({ ...REPO, 'src/locked/a.spec.ts': 'jest.fn();\n' });
    const io = recorder();

    chmodSync(join(root, 'src/locked'), 0o555);

    try {
      expect(await runCli(cwdArgs(root, '--write'), io)).toBe(1);
    } finally {
      chmodSync(join(root, 'src/locked'), 0o755);
    }

    expect(io.stdout.join('\n')).toContain('codemod-write-failed');
    expect(readTextFile(join(root, 'src/locked/a.spec.ts'))).toBe('jest.fn();\n');
    expect(readTextFile(join(root, 'src/app/service.spec.ts'))).toContain('vi.fn()');
  });
});
