import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import type { Finding } from '../report';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { checkTsconfigGlobs } from './tsconfig-globs';

afterEach(() => {
  removeTempRepos();
});

const findingsIn = (files: Record<string, string>): Finding[] =>
  checkTsconfigGlobs(readProfile(createTempRepo({ 'package.json': '{}', ...files })));

describe('checkTsconfigGlobs, the patterns a scan of this tree cannot judge', () => {
  it('leaves an "include" entry that climbs above the scanned root alone', () => {
    expect(
      findingsIn({
        'src/main.ts': '',
        'tsconfig.json': JSON.stringify({ include: ['src/**/*.ts', '../shared/**/*.ts', '..'] }),
      }),
    ).toEqual([]);
  });

  it('reads a "files" entry above the root off the disk, present or missing', () => {
    const root = createTempRepo({
      'shared.ts': '',
      'repo/package.json': '{}',
      'repo/tsconfig.json': JSON.stringify({ include: [], files: ['../shared.ts', '../missing.ts'] }),
    });
    const findings = checkTsconfigGlobs(readProfile(join(root, 'repo')));

    expect(findings.map((finding) => finding.message)).toEqual(['The "files" entry "../missing.ts" does not exist.']);
  });

  it('exempts a declaration file in "files", as it does in "include": generated ones are often not there yet', () => {
    expect(findingsIn({ 'tsconfig.json': JSON.stringify({ include: [], files: ['auto-imports.d.ts', 'src/env.d.mts'] }) })).toEqual([]);
  });

  it('counts .vue and .svelte files under a directory entry', () => {
    expect(
      findingsIn({
        'src/App.vue': '',
        'lib/Button.svelte': '',
        'tsconfig.json': JSON.stringify({ include: ['src', 'lib/**/*'] }),
      }),
    ).toEqual([]);
  });

  it('says nothing about an "include" that matches nothing when the scan stopped at its cap', () => {
    const root = createTempRepo({ 'package.json': '{}', 'tsconfig.json': JSON.stringify({ include: ['src/polyfills.ts'] }) });

    expect(checkTsconfigGlobs({ ...readProfile(root), filesTruncated: true })).toEqual([]);
  });

  it('reads a "files" entry off the disk, so a capped scan does not make it missing', () => {
    const root = createTempRepo({
      'package.json': '{}',
      'src/main.ts': '',
      'tsconfig.json': JSON.stringify({ include: [], files: ['src/main.ts'] }),
    });
    const profile = readProfile(root);

    expect(checkTsconfigGlobs({ ...profile, files: profile.files.filter((file) => file !== 'src/main.ts'), filesTruncated: true })).toEqual(
      [],
    );
  });
});
