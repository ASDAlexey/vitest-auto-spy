/**
 * `init` — write the pointer every agent in this repository will actually read.
 *
 * The block is regenerated between markers, so running it again after an upgrade is a no-op or a
 * one-hunk diff. `--check` is the CI form: it writes nothing and exits non-zero when the block on
 * disk is not the block this version would write.
 */
import { join } from 'node:path';

import { isDirectory, isSymlink, pathExists, readTextFile, removeFile, writeTextFile } from './fs-scan';
import { type BlockFacts, applyManaged, hasManaged, removeManaged, withoutVersion } from './init-block';
import { blockFacts } from './init-facts';
import { LEGACY_FILES, TIER_ONE_MARKDOWN, TIER_TWO, managedBlock, ownedContent, skillStub } from './init-targets';
import type { Target } from './init-targets';
import type { Profile } from './profile';
import { skillFrontmatter } from './self';
import { nearest } from './suggest';

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
  /** `--only`: the target paths, or directories holding them, init may touch. Every target when absent. */
  readonly only?: readonly string[] | undefined;
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

function planFor(target: Target, content: string | undefined, profile: Profile, version: string, facts: BlockFacts): Plan {
  const existing = content;
  const note = target.note;

  if (target.kind === 'owned') {
    // A file that exists without the managed markers was written by hand, not by init — these
    // paths (`.cursor/rules/…`, `.claude/skills/…`) are exactly the ones a team plausibly authored
    // before discovering the CLI. Rewriting it destroyed the content and `--uninstall` then
    // deleted the replacement.
    if (existing !== undefined && !hasManaged(existing)) {
      return { target, existing, desired: undefined, note: 'exists and was not written by init — left alone' };
    }

    return { target, existing, desired: ownedContent(target, profile, version), note };
  }

  if (target.kind === 'managed-if-exists' && existing === undefined) {
    return { target, existing, desired: undefined, note: 'not present — never created, it would shadow AGENTS.md' };
  }

  if (target.path === 'CLAUDE.md' && existing !== undefined && existing.includes('@AGENTS.md') && !hasManaged(existing)) {
    return { target, existing, desired: undefined, note: 'already imports @AGENTS.md — nothing to add' };
  }

  return { target, existing, desired: applyManaged(existing ?? '', managedBlock(profile, version, facts)), note };
}

/**
 * `--check` judges the block, not the version stamp in its marker: a bump with an identical body is
 * not work for the consumer's CI to fail over. A plain run still refreshes the stamp.
 */
function isStampOnly(plan: Plan): boolean {
  return (
    plan.existing !== undefined &&
    plan.desired !== undefined &&
    plan.existing !== plan.desired &&
    withoutVersion(plan.existing) === withoutVersion(plan.desired)
  );
}

/** `--check` and `--dry-run` must not seem to disagree over a marker whose only change is the stamp. */
const STAMP_ONLY_NOTE = 'only the version stamp differs, which `--check` does not count; a plain `init` refreshes it';

function statusOf(plan: Plan, check: boolean): ActionStatus {
  if (plan.desired === undefined) {
    return 'skipped';
  }

  if (plan.existing === undefined) {
    return 'created';
  }

  if (plan.existing === plan.desired) {
    return 'unchanged';
  }

  return check && isStampOnly(plan) ? 'unchanged' : 'updated';
}

/** `.claude` selects `.claude/skills/…`; a trailing slash or `./` is spelling, not meaning. */
function isSelected(path: string, only: readonly string[] | undefined): boolean {
  return (
    only === undefined ||
    only.some((entry) => {
      const prefix = entry.replace(/^\.\//, '').replace(/\/+$/, '');

      return path === prefix || path.startsWith(`${prefix}/`);
    })
  );
}

function collectTargets(profile: Profile, only: readonly string[] | undefined): Target[] {
  const tierTwo = TIER_TWO.filter((target) => isDirectory(join(profile.cwd, target.requiresDirectory)));
  const skill: Target = { path: SKILL_PATH, kind: 'owned', note: 'Claude Code skill stub — frontmatter copied from the shipped skill' };

  return [...TIER_ONE_MARKDOWN, skill, ...tierTwo, ...LEGACY_FILES].filter((target) => isSelected(target.path, only));
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
  // A file that exists without the markers was hand-authored; `planFor` left it alone, and the
  // stub must not undo that by writing over it.
  if (plan.desired === undefined && plan.existing !== undefined) {
    return plan;
  }

  if (frontmatter === undefined) {
    return { ...plan, desired: undefined, note: 'the shipped skill could not be read — skipped' };
  }

  return { ...plan, desired: skillStub(frontmatter, version) };
}

function symlinkPlan(plan: Plan): Plan {
  return { ...plan, desired: undefined, note: 'a symlink — its target already carries the block' };
}

function buildPlans(profile: Profile, version: string, only: readonly string[] | undefined): Plan[] {
  const facts = blockFacts(profile);

  return collectTargets(profile, only).map((target) => {
    const existing = readTarget(profile.cwd, target);
    const plan = planFor(target, existing, profile, version, facts);

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
  const status = options.uninstall ? uninstallStatus(plan) : statusOf(plan, options.check);
  const path = plan.target.path;
  const note = !options.uninstall && isStampOnly(plan) ? `${plan.note} — ${STAMP_ONLY_NOTE}` : plan.note;

  if (options.check || options.dryRun || plan.desired === undefined || status === 'unchanged') {
    return { path, status, note };
  }

  if (plan.desired === '') {
    removeFile(join(cwd, path));
  } else {
    writeTextFile(join(cwd, path), plan.desired);
  }

  return { path, status, note };
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

    return [
      `AGENTS.md would be ${size} bytes, past the ${CODEX_DOC_BUDGET} bytes Codex reads (project_doc_max_bytes), and Codex drops the rest without a word. Move long sections of AGENTS.md into files it links to.`,
    ];
  });
}

/** An owned target that exists without the markers was hand-written; say so rather than "skipped". */
function untouchedWarnings(plans: readonly Plan[]): string[] {
  return plans
    .filter((plan) => plan.desired === undefined && plan.existing !== undefined && plan.target.kind === 'owned')
    .map(
      (plan) =>
        `${plan.target.path} exists and was not written by init — left untouched; fold it into the managed block by hand if you want init to own it.`,
    );
}

/** An `--only` entry that selects no target is a typo, and a silent one would read as "nothing to do". */
function unmatchedWarnings(only: readonly string[] | undefined): string[] {
  const known = [...TIER_ONE_MARKDOWN, ...TIER_TWO, ...LEGACY_FILES].map((target) => target.path).concat(SKILL_PATH);

  return (only ?? [])
    .filter((entry) => !known.some((path) => isSelected(path, [entry])))
    .map((entry) => {
      const guess = nearest(entry, known);

      return guess === undefined
        ? `--only ${entry} selects no file init writes. Known targets: ${known.join(', ')}.`
        : `--only ${entry} selects no file init writes. Did you mean ${guess}?`;
    });
}

export function runInit(profile: Profile, version: string, options: InitOptions): InitResult {
  const plans = buildPlans(profile, version, options.only).map((plan) => (options.uninstall ? uninstallPlan(plan) : plan));
  const actions = plans.map((plan) => applyPlan(profile.cwd, plan, options));
  const pending = actions.some((action) => action.status === 'created' || action.status === 'updated');

  return {
    actions,
    warnings: [...unmatchedWarnings(options.only), ...(options.uninstall ? [] : [...untouchedWarnings(plans), ...budgetWarnings(plans)])],
    ok: !options.check || !pending,
  };
}
