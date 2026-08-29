/**
 * `init` writes into files a repository already owns, so the specs that matter are the ones about
 * restraint: what it refuses to create, what it refuses to touch twice, and what `--uninstall`
 * puts back. The happy path is one assertion; the rest of this file is the restraint.
 */
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { pathExists, readTextFile } from './fs-scan';
import { runInit, skillPlan } from './init';
import type { InitOptions, Plan } from './init';
import { hasManaged } from './init-block';
import { LEGACY_FILES, TIER_TWO, ownedContent, skillStub } from './init-targets';
import { readProfile } from './profile';
import { ownFile, ownPackageRoot, ownVersion, skillFrontmatter, versionFrom } from './self';
import { createTempRepo, linkInRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  removeTempRepos();
});

const OPTIONS: InitOptions = { check: false, dryRun: false, uninstall: false };

const install = (root: string, over: Partial<InitOptions> = {}): ReturnType<typeof runInit> =>
  runInit(readProfile(root), '1.2.3', { ...OPTIONS, ...over });

const statusOf = (result: ReturnType<typeof runInit>, path: string): string | undefined =>
  result.actions.find((action) => action.path === path)?.status;

const MANIFEST = JSON.stringify({ scripts: { test: 'vitest run' }, devDependencies: { '@angular/core': '^21', rxjs: '^7' } });

describe('runInit', () => {
  it('writes the three root instruction files and the skill stub', () => {
    const root = createTempRepo({ 'package.json': MANIFEST });
    const result = install(root);

    for (const path of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.claude/skills/vitest-auto-spy/SKILL.md']) {
      expect(statusOf(result, path)).toBe('created');
      expect(hasManaged(readTextFile(join(root, path)) ?? '')).toBe(true);
    }

    expect(readTextFile(join(root, 'AGENTS.md'))).toContain('vitest-auto-spy/angular');
    expect(result.ok).toBe(true);
  });

  it('is a no-op the second time', () => {
    const root = createTempRepo({ 'package.json': MANIFEST });

    install(root);

    const again = install(root);

    expect(again.actions.filter((action) => action.status === 'updated')).toEqual([]);
    expect(statusOf(again, 'AGENTS.md')).toBe('unchanged');
  });

  it('writes a tool-specific rule file only when that tool is already set up here', () => {
    const without = install(createTempRepo({ 'package.json': MANIFEST }));
    const root = createTempRepo({ 'package.json': MANIFEST, '.cursor/': '' });
    const withCursor = install(root);

    expect(without.actions.map((action) => action.path)).not.toContain('.cursor/rules/vitest-auto-spy.mdc');
    expect(statusOf(withCursor, '.cursor/rules/vitest-auto-spy.mdc')).toBe('created');
    expect(readTextFile(join(root, '.cursor/rules/vitest-auto-spy.mdc'))).toContain('alwaysApply: false');
  });

  it('never creates a legacy dot-file, and appends to one that already exists', () => {
    const empty = createTempRepo({ 'package.json': MANIFEST });
    const legacy = createTempRepo({ 'package.json': MANIFEST, '.cursorrules': 'my rules\n' });

    expect(statusOf(install(empty), '.cursorrules')).toBe('skipped');
    expect(pathExists(join(empty, '.cursorrules'))).toBe(false);
    expect(statusOf(install(legacy), '.cursorrules')).toBe('updated');
    expect(readTextFile(join(legacy, '.cursorrules'))).toContain('my rules');
  });

  it('leaves a CLAUDE.md that already imports AGENTS.md alone', () => {
    const root = createTempRepo({ 'package.json': MANIFEST, 'CLAUDE.md': '@AGENTS.md\n' });
    const result = install(root);

    expect(statusOf(result, 'CLAUDE.md')).toBe('skipped');
    expect(readTextFile(join(root, 'CLAUDE.md'))).toBe('@AGENTS.md\n');
  });

  it('does not write through a symlinked instruction file', () => {
    const root = createTempRepo({ 'package.json': MANIFEST, 'AGENTS.md': 'shared\n' });

    linkInRepo(root, 'CLAUDE.md', 'AGENTS.md');

    const result = install(root);

    expect(statusOf(result, 'CLAUDE.md')).toBe('skipped');
    expect(readTextFile(join(root, 'AGENTS.md'))?.match(/vitest-auto-spy:begin/g)).toHaveLength(1);
  });

  it('warns about nothing when AGENTS.md itself is the symlink', () => {
    const root = createTempRepo({ 'package.json': MANIFEST, 'docs/rules.md': 'x'.repeat(33_000) });

    linkInRepo(root, 'AGENTS.md', 'docs/rules.md');

    const result = install(root);

    expect(statusOf(result, 'AGENTS.md')).toBe('skipped');
    expect(result.warnings).toEqual([]);
  });

  it('warns when the file it appended to has grown past what Codex reads', () => {
    const root = createTempRepo({ 'package.json': MANIFEST, 'AGENTS.md': 'x'.repeat(33_000) });

    expect(install(root).warnings[0]).toContain('project_doc_max_bytes');
  });
});

describe('runInit --check and --dry-run', () => {
  it('fails when the block is missing or stale, and passes once it is current', () => {
    const root = createTempRepo({ 'package.json': MANIFEST });

    expect(install(root, { check: true }).ok).toBe(false);
    expect(pathExists(join(root, 'AGENTS.md'))).toBe(false);

    install(root);

    expect(install(root, { check: true }).ok).toBe(true);
    expect(runInit(readProfile(root), '9.9.9', { ...OPTIONS, check: true }).ok).toBe(false);
  });

  it('reports what it would do without touching the disk', () => {
    const root = createTempRepo({ 'package.json': MANIFEST });
    const result = install(root, { dryRun: true });

    expect(statusOf(result, 'AGENTS.md')).toBe('created');
    expect(pathExists(join(root, 'AGENTS.md'))).toBe(false);
    expect(result.ok).toBe(true);
  });
});

describe('runInit --uninstall', () => {
  it('removes its own block, deletes the files it created, and leaves everything else', () => {
    const root = createTempRepo({ 'package.json': MANIFEST, 'AGENTS.md': 'mine\n', '.cursor/': '', '.rules': 'untouched\n' });

    install(root);

    const removal = install(root, { uninstall: true });

    expect(readTextFile(join(root, 'AGENTS.md'))).toBe('mine\n');
    expect(statusOf(removal, 'AGENTS.md')).toBe('updated');
    expect(statusOf(removal, 'GEMINI.md')).toBe('removed');
    expect(pathExists(join(root, 'GEMINI.md'))).toBe(false);
    expect(pathExists(join(root, '.cursor/rules/vitest-auto-spy.mdc'))).toBe(false);
    expect(readTextFile(join(root, '.rules'))).toBe('untouched\n');
    expect(removal.warnings).toEqual([]);
  });

  it('is a no-op on a repository init never touched', () => {
    const root = createTempRepo({ 'package.json': MANIFEST, 'AGENTS.md': 'mine\n' });
    const removal = install(root, { uninstall: true });

    expect(removal.actions.every((action) => action.status === 'skipped')).toBe(true);
    expect(readTextFile(join(root, 'AGENTS.md'))).toBe('mine\n');
  });
});

describe('skillPlan', () => {
  const plan: Plan = {
    target: { path: '.claude/skills/vitest-auto-spy/SKILL.md', kind: 'owned', note: 'stub' },
    desired: undefined,
    existing: undefined,
    note: 'stub',
  };

  it('copies the shipped frontmatter, and skips the target when there is none to copy', () => {
    expect(skillPlan(plan, '1.0.0', 'name: vitest-auto-spy').desired).toContain('name: vitest-auto-spy');
    expect(skillPlan(plan, '1.0.0', undefined).desired).toBeUndefined();
    expect(skillPlan(plan, '1.0.0', undefined).note).toContain('could not be read');
  });
});

describe('the target table', () => {
  it('gives every tier-2 file the frontmatter its tool needs, and Roo none at all', () => {
    const profile = readProfile(createTempRepo({ 'package.json': MANIFEST }));

    for (const target of TIER_TWO) {
      const content = ownedContent(target, profile, '1.0.0');

      expect(hasManaged(content)).toBe(true);
      expect(content.startsWith('---')).toBe(target.path !== '.roo/rules/vitest-auto-spy.md');
    }

    expect(LEGACY_FILES.every((target) => target.kind === 'managed-if-exists')).toBe(true);
  });

  it('points the skill stub at the tarball rather than copying it', () => {
    const stub = skillStub('name: vitest-auto-spy', '1.0.0');

    expect(stub).toContain('cat node_modules/vitest-auto-spy/AGENTS.md');
    expect(stub).toContain('doctor');
  });
});

describe('locating this package', () => {
  it('finds its own root, version and shipped files', () => {
    const root = ownPackageRoot();

    expect(root).toBeDefined();
    expect(ownVersion()).toMatch(/^\d+\.\d+\.\d+/);
    expect(ownFile('package.json', root)).toContain('"name": "vitest-auto-spy"');
    expect(skillFrontmatter()).toContain('name: vitest-auto-spy');
  });

  it('gives up rather than claiming a foreign package.json', () => {
    const foreign = createTempRepo({ 'package.json': JSON.stringify({ name: 'someone-else' }), 'a/b/c/d/e/f/g/h/i/': '' });

    const arrayManifest = createTempRepo({ 'package.json': '[]' });

    expect(ownPackageRoot(join(foreign, 'a/b/c/d/e/f/g/h/i'))).toBeUndefined();
    expect(ownPackageRoot(foreign)).toBeUndefined();
    expect(ownPackageRoot(arrayManifest)).toBeUndefined();
    expect(ownPackageRoot('/')).toBeUndefined();
    expect(versionFrom(undefined)).toBe('0.0.0');
    expect(versionFrom(foreign)).toBe('0.0.0');
    expect(versionFrom(join(foreign, 'a'))).toBe('0.0.0');
    expect(ownFile('package.json', undefined)).toBeUndefined();
    expect(skillFrontmatter(foreign)).toBeUndefined();
  });

  it('returns nothing when the shipped skill has no frontmatter', () => {
    const fake = createTempRepo({
      'package.json': JSON.stringify({ name: 'vitest-auto-spy' }),
      'skills/vitest-auto-spy/SKILL.md': '# no frontmatter\n',
    });

    expect(skillFrontmatter(fake)).toBeUndefined();
  });
});
