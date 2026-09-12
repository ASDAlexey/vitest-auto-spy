/**
 * Whether this workspace already runs its files in one shared environment, when nothing in a Vitest
 * config says so.
 *
 * `perf-isolation` offers `test.isolate: false` to a suite whose per-file environment, setup and
 * prepare dominate. Under `@angular/build:unit-test` that offer is wrong and cannot be seen to be
 * wrong from any config file: the builder passes `isolate: false` to Vitest itself and only honours
 * the key when the **builder option** declares it ("Defaults to false to align with the
 * Karma/Jasmine experience", its own schema) — a `vitest-runner.config.ts` saying anything about
 * `isolate` is overwritten. So a workspace that has already taken the trade gets told to take it,
 * which is the one thing a findings tool must never do: spend a reader's attention on a decision
 * they made.
 *
 * This reads the builder target rather than guessing from the dependency list, because the
 * dependency is present in every Angular workspace while the runner is not.
 */
import { join } from 'node:path';

import { parseJsonc, readTextFile } from '../fs-scan';
import { isRecord } from '../profile';

/** The builder whose default this is about. Nothing else in the Angular CLI shares it. */
const UNIT_TEST_BUILDER = '@angular/build:unit-test';

/** Both names the Angular CLI has used for the workspace file, newest first. */
const WORKSPACE_FILES = ['angular.json', 'workspace.json'];

export interface IsolationVerdict {
  /** `true` when the workspace asked for per-file isolation, `false` when it takes the builder default. */
  readonly isolated: boolean;
  /** What decided it, for the message that suppresses the finding. */
  readonly why: string;
}

function targetsOf(project: unknown): Record<string, unknown> {
  if (!isRecord(project)) {
    return {};
  }

  const targets = project['architect'] ?? project['targets'];

  return isRecord(targets) ? targets : {};
}

/** Every place an option can be declared on a target: its options, and each named configuration. */
function optionBlocks(target: Record<string, unknown>): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  const options = target['options'];

  if (isRecord(options)) {
    blocks.push(options);
  }

  const configurations = target['configurations'];

  if (isRecord(configurations)) {
    for (const configuration of Object.values(configurations)) {
      if (isRecord(configuration)) {
        blocks.push(configuration);
      }
    }
  }

  return blocks;
}

function readWorkspace(cwd: string): Record<string, unknown> | undefined {
  for (const candidate of WORKSPACE_FILES) {
    const text = readTextFile(join(cwd, candidate));
    const parsed = text === undefined ? undefined : parseJsonc(text);

    if (isRecord(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

/**
 * The verdict, or `undefined` when this workspace does not run its suite through that builder and
 * the question is therefore none of this check's business.
 *
 * A workspace with several such targets answers `isolated: true` if **any** of them asked for
 * isolation: the finding is a suggestion to a reader, and a reader who has written the key once has
 * had the thought.
 */
export function isolationFromAngularBuilder(cwd: string): IsolationVerdict | undefined {
  const workspace = readWorkspace(cwd);
  const projects = workspace === undefined ? undefined : workspace['projects'];

  if (!isRecord(projects)) {
    return undefined;
  }

  let found = false;

  for (const project of Object.values(projects)) {
    for (const target of Object.values(targetsOf(project))) {
      if (!isRecord(target) || target['builder'] !== UNIT_TEST_BUILDER) {
        continue;
      }

      found = true;

      for (const block of optionBlocks(target)) {
        if (block['isolate'] === true) {
          return { isolated: true, why: `${UNIT_TEST_BUILDER} runs with \`isolate: true\`, declared on its target` };
        }
      }
    }
  }

  return found ? { isolated: false, why: `${UNIT_TEST_BUILDER} already runs without per-file isolation — that is its default` } : undefined;
}
