/**
 * `init` — write the pointer every agent in this repository will actually read.
 *
 * The block is regenerated between markers, so running it again after an upgrade is a no-op or a
 * one-hunk diff. `--check` is the CI form: it writes nothing and exits non-zero when the block on
 * disk is not the block this version would write.
 */
import { join } from 'node:path';

import { isDirectory, isSymlink, pathExists, readTextFile, removeFile, writeTextFile } from './fs-scan';
import { ignoredByGit } from './git-ignored';
import { type BlockFacts, applyManaged, hasHandEditedBlock, hasManaged, managedSpans, removeManaged, withoutVersion } from './init-block';
import { blockFacts } from './init-facts';
import { LEGACY_FILES, TIER_ONE_MARKDOWN, TIER_TWO, managedBlock, ownedContent, skillStub } from './init-targets';
import type { Target } from './init-targets';
import type { Profile } from './profile';
import { skillFrontmatter } from './self';
import { nearest } from './suggest';

export type ActionStatus = 'created' | 'edited' | 'failed' | 'removed' | 'skipped' | 'stale' | 'unchanged' | 'updated';

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
  /** A copy of the shipped skill init never wrote: it cannot be refreshed, and `--check` fails on it. */
  readonly staleCopy?: true;
  /** A managed block whose body no longer matches its `sha=`: somebody edited it, so init leaves it. */
  readonly handEdited?: true;
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

  const duplicates = managedSpans(existing ?? '').length - 1;
  const duplicateNote = duplicates > 0 ? `${note} — duplicate managed blocks removed: ${duplicates}` : note;

  return { target, existing, desired: applyManaged(existing ?? '', managedBlock(profile, version, facts)), note: duplicateNote };
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
  if (plan.staleCopy === true) {
    return 'stale';
  }

  if (plan.handEdited === true) {
    return 'edited';
  }

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

/** Only the shipped skill carries this name, so a file with it and no markers was copied out of the package. */
function isShippedSkillCopy(content: string): boolean {
  const frontmatter = /^---\r?\n([\S\s]*?)\r?\n---/.exec(content)?.[1] ?? '';

  return /^name:\s*(["']?)vitest-auto-spy\1\s*$/m.test(frontmatter);
}

const STALE_COPY_NOTE = 'a copy of the shipped skill that init did not write — frozen at the version it was copied from';

/**
 * The stub is the shipped skill's frontmatter over a body that only points at the tarball, so it
 * cannot go stale. With no frontmatter to copy there is nothing honest to write, and the target is
 * skipped rather than invented.
 */
export function skillPlan(plan: Plan, version: string, frontmatter: string | undefined): Plan {
  // A file that exists without the markers was hand-authored; `planFor` left it alone, and the
  // stub must not undo that by writing over it.
  if (plan.desired === undefined && plan.existing !== undefined) {
    return isShippedSkillCopy(plan.existing) ? { ...plan, staleCopy: true, note: STALE_COPY_NOTE } : plan;
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

const HAND_EDITED_NOTE = 'the managed block was edited by hand — left untouched';

/** Overwriting a block somebody changed would drop their edit without a word, so it is reported instead. */
function guardHandEdited(plan: Plan): Plan {
  if (plan.existing === undefined || plan.desired === undefined || plan.existing === plan.desired || !hasHandEditedBlock(plan.existing)) {
    return plan;
  }

  return { ...plan, desired: undefined, handEdited: true, note: HAND_EDITED_NOTE };
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

function describeAction(plan: Plan, options: InitOptions): InitAction {
  const status = options.uninstall ? uninstallStatus(plan) : statusOf(plan, options.check);
  const note = !options.uninstall && isStampOnly(plan) ? `${plan.note} — ${STAMP_ONLY_NOTE}` : plan.note;

  return { path: plan.target.path, status, note };
}

function writes(action: InitAction, plan: Plan, options: InitOptions): boolean {
  return !options.check && !options.dryRun && plan.desired !== undefined && action.status !== 'unchanged' && action.status !== 'skipped';
}

/** `undefined` means the file should not exist. */
function put(cwd: string, path: string, content: string | undefined): void {
  if (content === undefined) {
    removeFile(join(cwd, path));
  } else {
    writeTextFile(join(cwd, path), content);
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface Step {
  readonly plan: Plan;
  action: InitAction;
}

interface Applied {
  readonly actions: InitAction[];
  readonly failures: string[];
}

/**
 * All or nothing: every write goes through a temporary file and a rename, and when one fails the
 * files already written are put back, so a failed run leaves the repository as it found it.
 */
function applyPlans(cwd: string, plans: readonly Plan[], options: InitOptions): Applied {
  const steps: Step[] = plans.map((plan) => ({ plan, action: describeAction(plan, options) }));
  const done: Step[] = [];
  const failures: string[] = [];

  for (const step of steps) {
    const { plan, action } = step;

    if (failures.length > 0 || !writes(action, plan, options)) {
      continue;
    }

    try {
      put(cwd, action.path, plan.desired === '' ? undefined : plan.desired);
      done.push(step);
    } catch (error) {
      step.action = { ...action, status: 'failed', note: reasonOf(error) };
      failures.push(`${action.path} could not be written (${reasonOf(error)}).`, ...rollBack(cwd, done, action.path));
    }
  }

  return { actions: steps.map((step) => step.action), failures };
}

function rollBack(cwd: string, done: readonly Step[], failed: string): string[] {
  return done.flatMap((step) => {
    const path = step.plan.target.path;

    try {
      put(cwd, path, step.plan.existing);
      step.action = { path, status: 'skipped', note: `rolled back — ${failed} could not be written` };

      return [];
    } catch (error) {
      step.action = { path, status: 'failed', note: `written, and could not be rolled back: ${reasonOf(error)}` };

      return [`${path} was written but could not be put back (${reasonOf(error)}).`];
    }
  });
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
    .map((plan) =>
      plan.staleCopy === true
        ? `${plan.target.path} is a copy of the shipped vitest-auto-spy skill, not written by init, so no upgrade refreshes it — left untouched. Delete it and re-run \`npx vitest-auto-spy init\` to replace it with the managed pointer.`
        : `${plan.target.path} exists and was not written by init — left untouched; fold it into the managed block by hand if you want init to own it.`,
    );
}

function editedWarnings(plans: readonly Plan[]): string[] {
  return plans
    .filter((plan) => plan.handEdited === true)
    .map(
      (plan) =>
        `${plan.target.path}: the block between the vitest-auto-spy markers was edited by hand, so init left it as it is. Move your text outside the markers, then delete the block and re-run \`npx vitest-auto-spy init\`.`,
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

const UNTRACKED_NOTE = 'not tracked by git, so `git diff` will not show this change';

/** A refreshed file git ignores leaves `git diff` empty, which reads as "init changed nothing". */
function markUntracked(cwd: string, actions: readonly InitAction[]): InitAction[] {
  const ignored = ignoredByGit(
    cwd,
    actions.filter((action) => action.status === 'created' || action.status === 'updated').map((action) => action.path),
  );

  return actions.map((action) => (ignored.has(action.path) ? { ...action, note: `${action.note} — ${UNTRACKED_NOTE}` } : action));
}

const PENDING: ReadonlySet<ActionStatus> = new Set(['created', 'edited', 'stale', 'updated']);

export function runInit(profile: Profile, version: string, options: InitOptions): InitResult {
  const plans = buildPlans(profile, version, options.only).map((plan) => (options.uninstall ? uninstallPlan(plan) : guardHandEdited(plan)));
  const applied = applyPlans(profile.cwd, plans, options);
  const actions = markUntracked(profile.cwd, applied.actions);
  const { failures } = applied;
  const pending = options.check && actions.some((action) => PENDING.has(action.status));

  return {
    actions,
    warnings: [
      ...failures,
      ...unmatchedWarnings(options.only),
      ...(options.uninstall ? [] : [...untouchedWarnings(plans), ...editedWarnings(plans), ...budgetWarnings(plans)]),
    ],
    ok: failures.length === 0 && !pending,
  };
}
