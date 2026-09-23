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
 * dependency is present in every Angular workspace while the runner is not. The Nx executor
 * delegates to the same builder and inherits the same default.
 */
import type { Profile } from '../profile';
import { unitTestTargets } from './unit-test-targets';

export interface IsolationVerdict {
  /** `true` when the workspace asked for per-file isolation, `false` when it takes the builder default. */
  readonly isolated: boolean;
  /** What decided it, for the message that suppresses the finding. */
  readonly why: string;
}

/**
 * The verdict, or `undefined` when this workspace does not run its suite through that builder and
 * the question is therefore none of this check's business.
 *
 * A workspace with several such targets answers `isolated: true` if **any** of them asked for
 * isolation: the finding is a suggestion to a reader, and a reader who has written the key once has
 * had the thought.
 */
export function isolationFromAngularBuilder(profile: Profile): IsolationVerdict | undefined {
  const targets = unitTestTargets(profile);
  const asked = targets.find((target) => target.optionBlocks.some((block) => block['isolate'] === true));

  if (asked !== undefined) {
    return { isolated: true, why: `${asked.builder} runs with \`isolate: true\`, declared on its target` };
  }

  const [first] = targets;

  return first === undefined
    ? undefined
    : { isolated: false, why: `${first.builder} already runs without per-file isolation — that is its default` };
}
