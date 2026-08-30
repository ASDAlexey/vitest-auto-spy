#!/usr/bin/env node
/**
 * Guard the skill's frontmatter, which nothing else reads.
 *
 * `claude plugin validate --strict .` never opens `SKILL.md` — fed deliberately broken frontmatter
 * it still passes — so the one field that decides whether the skill is ever invoked is unchecked by
 * every gate this repository has. It has already regressed once: the `description` grew to 1 763
 * characters in a single pass, past the 1 536-character listing budget, and the tail that was silently
 * dropped was the list of error strings — the strongest triggers in the whole file. Nothing failed.
 *
 * Two assertions, both cheap:
 *   - the frontmatter parses, and carries a non-empty `name` and `description`;
 *   - the `description` fits the budget, so no trigger is truncated away.
 *
 * Usage:
 *   node scripts/check-skill.mjs
 */
import { readFileSync } from 'node:fs';

/** What a skill listing keeps. Past this the description is truncated, not rejected — which is why it needs a check. */
const DESCRIPTION_BUDGET = 1536;
const SKILL = 'skills/vitest-auto-spy/SKILL.md';

/**
 * The frontmatter block, as raw YAML.
 *
 * Deliberately not a YAML parse of the whole file: the body is Markdown that happens to contain
 * `---` rules, so the block is the first one and it must start at byte zero.
 */
function frontmatter(source) {
  if (!source.startsWith('---\n')) {
    return undefined;
  }

  const end = source.indexOf('\n---', 4);

  return end === -1 ? undefined : source.slice(4, end + 1);
}

/**
 * One top-level scalar, quoted or bare.
 *
 * A hand-rolled read rather than a dependency: this repository declares no `dependencies` and the
 * check has to run before anything is installed for it.
 */
function field(block, key) {
  const match = new RegExp(`^${key}:[^\\S\\n]*(.*)$`, 'm').exec(block);

  if (match === null) {
    return undefined;
  }

  const raw = match[1].trim();
  const quoted = /^(['"])([\s\S]*)\1$/.exec(raw);

  return quoted === null ? raw : quoted[2];
}

function main() {
  const source = readFileSync(SKILL, 'utf8');
  const block = frontmatter(source);
  const problems = [];

  if (block === undefined) {
    problems.push(`${SKILL} has no frontmatter block — it must open with '---' on the first line.`);
  } else {
    const name = field(block, 'name');
    const description = field(block, 'description');

    if (name === undefined || name === '') {
      problems.push(`${SKILL}: frontmatter has no 'name'.`);
    }

    if (description === undefined || description === '') {
      problems.push(`${SKILL}: frontmatter has no 'description' — without it the skill is never matched.`);
    } else if (description.length > DESCRIPTION_BUDGET) {
      problems.push(
        `${SKILL}: description is ${description.length} characters, over the ${DESCRIPTION_BUDGET} budget. ` +
          `It is truncated rather than rejected, so the last ${description.length - DESCRIPTION_BUDGET} characters — ` +
          'usually the error strings, which are the strongest triggers — never reach the listing.',
      );
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`check-skill: ${problem}`);
    }
    process.exit(1);
  }

  console.log(`check-skill: ${SKILL} frontmatter is valid and within budget.`);
}

main();
