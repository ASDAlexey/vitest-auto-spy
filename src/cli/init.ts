/**
 * `init` — write the pointer every agent in this repository will actually read.
 *
 * The block is regenerated between markers, so running it again after an upgrade is a no-op or a
 * one-hunk diff. `--check` is the CI form: it writes nothing and exits non-zero when the block on
 * disk is not the block this version would write.
 */
import { join } from 'node:path';

import { isDirectory, isSymlink, pathExists, readTextFile, removeFile, writeTextFile } from './fs-scan';
import { applyManaged, hasManaged, removeManaged } from './init-block';
import { LEGACY_FILES, TIER_ONE_MARKDOWN, TIER_TWO, managedBlock, ownedContent, skillStub } from './init-targets';
import type { Target } from './init-targets';
import type { Profile } from './profile';
import { skillFrontmatter } from './self';

export type ActionStatus = 'created' | 'removed' | 'skipped' | 'unchanged' | 'updated';

export interface InitAction {
  readonly path: string;
  readonly status: ActionStatus;
  readonly note: string;
}

export interface InitOptions {
  readonly check: boolean;
  readonly dryRun: boolean;
  readonly uninstall: boolean;
}

export interface InitResult {
  readonly actions: readonly InitAction[];
  readonly warnings: readonly string[];
  /** `false` when `--check` found work to do. */
  readonly ok: boolean;
}

/** Codex caps the whole root→cwd `AGENTS.md` chain and truncates past it without a word. */
const CODEX_DOC_BUDGET = 32_768;

const SKILL_PATH = '.claude/skills/vitest-auto-spy/SKILL.md';

export interface Plan {
  readonly target: Target;
  readonly desired: string | undefined;
  readonly existing: string | undefined;
  readonly note: string;
}

function planFor(target: Target, content: string | undefined, profile: Profile, version: string): Plan {
  const existing = content;
  const note = target.note;

  if (target.kind === 'owned') {
    return { target, existing, desired: ownedContent(target, profile, version), note };
  }

  if (target.kind === 'managed-if-exists' && existing === undefined) {
    return { target, existing, desired: undefined, note: 'not present — never created, it would shadow AGENTS.md' };
  }

  if (target.path === 'CLAUDE.md' && existing !== undefined && existing.includes('@AGENTS.md') && !hasManaged(existing)) {
    return { target, existing, desired: undefined, note: 'already imports @AGENTS.md — nothing to add' };
  }

  return { target, existing, desired: applyManaged(existing ?? '', managedBlock(profile, version)), note };
}

function statusOf(plan: Plan): ActionStatus {
  if (plan.desired === undefined) {
    return 'skipped';
  }

  if (plan.existing === undefined) {
    return 'created';
  }

  return plan.existing === plan.desired ? 'unchanged' : 'updated';
}

function collectTargets(profile: Profile): Target[] {
  const tierTwo = TIER_TWO.filter((target) => isDirectory(join(profile.cwd, target.requiresDirectory)));
  const skill: Target = { path: SKILL_PATH, kind: 'owned', note: 'Claude Code skill stub — frontmatter copied from the shipped skill' };

  return [...TIER_ONE_MARKDOWN, skill, ...tierTwo, ...LEGACY_FILES];
}

/** A file that exists but cannot be read is treated as absent — there is nothing to preserve. */
function readTarget(cwd: string, target: Target): string | undefined {
  return pathExists(join(cwd, target.path)) ? readTextFile(join(cwd, target.path)) : undefined;
}

/**
 * The stub is the shipped skill's frontmatter over a body that only points at the tarball, so it
 * cannot go stale. With no frontmatter to copy there is nothing honest to write, and the target is
 * skipped rather than invented.
 */
export function skillPlan(plan: Plan, version: string, frontmatter: string | undefined): Plan {
  if (frontmatter === undefined) {
    return { ...plan, desired: undefined, note: 'the shipped skill could not be read — skipped' };
  }

  return { ...plan, desired: skillStub(frontmatter, version) };
}

function symlinkPlan(plan: Plan): Plan {
  return { ...plan, desired: undefined, note: 'a symlink — its target already carries the block' };
}

function buildPlans(profile: Profile, version: string): Plan[] {
  return collectTargets(profile).map((target) => {
    const existing = readTarget(profile.cwd, target);
    const plan = planFor(target, existing, profile, version);

    if (isSymlink(join(profile.cwd, target.path))) {
      return symlinkPlan(plan);
    }

    return target.path === SKILL_PATH ? skillPlan(plan, version, skillFrontmatter()) : plan;
  });
}

function uninstallPlan(plan: Plan): Plan {
  const { existing, target } = plan;

  if (existing === undefined || !hasManaged(existing)) {
    return { ...plan, desired: undefined, note: 'no managed block — left alone' };
  }

  if (target.kind === 'owned') {
    return { ...plan, desired: '', note: 'written by init — removed' };
  }

  return { ...plan, desired: removeManaged(existing), note: 'managed block removed' };
}

function applyPlan(cwd: string, plan: Plan, options: InitOptions): InitAction {
  const status = options.uninstall ? uninstallStatus(plan) : statusOf(plan);
  const path = plan.target.path;

  if (options.check || options.dryRun || plan.desired === undefined || status === 'unchanged') {
    return { path, status, note: plan.note };
  }

  if (plan.desired === '') {
    removeFile(join(cwd, path));
  } else {
    writeTextFile(join(cwd, path), plan.desired);
  }

  return { path, status, note: plan.note };
}

function uninstallStatus(plan: Plan): ActionStatus {
  if (plan.desired === undefined || plan.desired === plan.existing) {
    return 'skipped';
  }

  return plan.desired === '' ? 'removed' : 'updated';
}

function budgetWarnings(plans: readonly Plan[]): string[] {
  return plans.flatMap((plan) => {
    if (plan.target.path !== 'AGENTS.md' || plan.desired === undefined) {
      return [];
    }

    const size = Buffer.byteLength(plan.desired, 'utf8');

    if (size <= CODEX_DOC_BUDGET) {
      return [];
    }

    return [`AGENTS.md is ${size} bytes, past Codex's ${CODEX_DOC_BUDGET}-byte project_doc_max_bytes — it truncates the rest silently.`];
  });
}

export function runInit(profile: Profile, version: string, options: InitOptions): InitResult {
  const plans = buildPlans(profile, version).map((plan) => (options.uninstall ? uninstallPlan(plan) : plan));
  const actions = plans.map((plan) => applyPlan(profile.cwd, plan, options));
  const pending = actions.some((action) => action.status === 'created' || action.status === 'updated');

  return { actions, warnings: options.uninstall ? [] : budgetWarnings(plans), ok: !options.check || !pending };
}
