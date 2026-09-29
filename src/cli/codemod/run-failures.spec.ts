import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import type { CliIo } from '../main';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import * as codemod from './codemod';
import { runCodemod } from './run';

// Under isolate: false the modules that import the mocked ones may already be evaluated against the real
// ones; a fresh graph is what lets the mock reach them, and dropping it after keeps it out of the next file.
vi.hoisted(() => vi.resetModules());
afterAll(() => vi.resetModules());

vi.mock('./codemod', async (importOriginal) => {
  const actual = await importOriginal<typeof codemod>();

  return {
    ...actual,
    runTransforms: vi.fn((input: codemod.RunInput) => {
      if (input.file.includes('broken')) {
        throw new Error('unbalanced input');
      }

      return actual.runTransforms(input);
    }),
    residueOf: vi.fn((...args: Parameters<typeof actual.residueOf>) => {
      if (args[0].includes('broken')) {
        throw 'not an error';
      }

      return actual.residueOf(...args);
    }),
  };
});

afterEach(() => {
  removeTempRepos();
});

function recorder(): CliIo & { stdout: string[] } {
  const stdout: string[] = [];

  return { stdout, out: (line) => stdout.push(line), err: () => undefined };
}

const REPO = {
  'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }),
  'vitest.config.ts': 'export default { test: { globals: true } };\n',
  'src/a.spec.ts': 'jest.fn();\n',
  'src/broken.spec.ts': 'jest.fn();\n',
};

const OPTIONS = { write: false, verify: false, list: false, only: undefined, skip: undefined, from: undefined, paths: [] };

describe('a file the codemod fails on', () => {
  it('is reported, and the other files are still migrated', () => {
    const io = recorder();

    expect(runCodemod(createTempRepo(REPO), OPTIONS, io)).toBe(1);

    const output = io.stdout.join('\n');

    expect(output).toContain('codemod-file-failed');
    expect(output).toContain('The codemod stopped on this file: unbalanced input');
    expect(output).toContain('+vi.fn();');
  });

  it('is reported by --verify too, whatever was thrown', () => {
    const io = recorder();

    expect(runCodemod(createTempRepo(REPO), { ...OPTIONS, verify: true }, io)).toBe(1);
    expect(io.stdout.join('\n')).toContain('The codemod stopped on this file: not an error');
    expect(io.stdout.join('\n')).toContain('residue/jest-namespace');
  });
});
