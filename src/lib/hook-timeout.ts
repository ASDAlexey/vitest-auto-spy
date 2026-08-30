/**
 * The hint a suite migrated off Jest needs the first time a `beforeEach` runs out of time.
 *
 * Jest has **one** budget. `jest-circus` reads the same field for a hook and for a test body:
 *
 * ```js
 * const timeout = hook.timeout || getState().testTimeout; // jest-circus/build/index.js
 * const timeout = test.timeout || getState().testTimeout;
 * ```
 *
 * Vitest has two, and resolves them independently — `testTimeout` defaults to 5 000 ms,
 * `hookTimeout` to 10 000 ms. A migration that carries the preset's single `testTimeout: 30000`
 * into the runner config and stops there leaves hooks on the 10 000 ms default, and from then on
 * identical work gets three times the budget in a test body that it gets in `beforeEach`.
 *
 * What makes it expensive is where the failure lands. Vitest attributes a `beforeEach` timeout to
 * the **test**, with the test's duration pinned at the limit, so the report reads as a slow test
 * rather than as a dead hook:
 *
 * ```text
 * × should create 10045ms
 * ```
 *
 * The reader goes looking for ten seconds of work inside a test body that never ran. This module
 * puts the missing sentence where they are already looking: the error is on
 * `context.task.result.errors` by the time `afterEach` runs, and appending to its message shows up
 * in the reporter's output.
 *
 * `beforeAll` is deliberately out of scope. Its timeout is reported as a failed *suite*, every test
 * is marked skipped and no `afterEach` runs at all — there is nothing to annotate from here.
 */
import { DOCS_LINKS, withDocs } from './docs-links';

/** The two budgets the runner resolved for this file. */
export interface RunnerTimeouts {
  /** Milliseconds a test body may take. */
  testTimeout: number;
  /** Milliseconds a hook may take. */
  hookTimeout: number;
}

/**
 * `Hook timed out in <n>ms.` — the runner's own wording, and the only thing that identifies the
 * failure as a timeout rather than a throw from inside the hook.
 */
const HOOK_TIMEOUT_MESSAGE = /^Hook timed out in (\d+)ms\./;

/** Marks a message this module has already extended, so a second pass cannot append twice. */
const HINT_MARKER = '[vitest-auto-spy] hookTimeout';

/**
 * The timeouts Vitest resolved, or `undefined` when they cannot be read.
 *
 * Read off `globalThis.__vitest_worker__` because there is no other way: the `vitest` entry point
 * exports `vi.setConfig` for *writing* `hookTimeout` at runtime but nothing that reads the resolved
 * value back, and neither does any other public export of the package (checked against the exports
 * of the installed version rather than assumed). The read is therefore defensive at every step and
 * silent on any surprise — a shape this does not recognise means "no hint", never a failure, since
 * the whole feature is a sentence appended to somebody else's error.
 *
 * `host` is a parameter so the spec can hand over a stand-in worker; production always passes the
 * real global.
 */
export function readRunnerTimeouts(host: object = globalThis): RunnerTimeouts | undefined {
  const config: unknown = Reflect.get(Object(Reflect.get(host, '__vitest_worker__')), 'config');
  const testTimeout: unknown = Reflect.get(Object(config), 'testTimeout');
  const hookTimeout: unknown = Reflect.get(Object(config), 'hookTimeout');

  if (typeof testTimeout !== 'number' || typeof hookTimeout !== 'number') {
    return undefined;
  }

  return { testTimeout, hookTimeout };
}

/** The sentence appended to a hook timeout that the asymmetry explains. */
export function describeHookTimeout({ testTimeout, hookTimeout }: RunnerTimeouts): string {
  return withDocs(
    `${HINT_MARKER} is ${hookTimeout}ms while testTimeout is ${testTimeout}ms, so this hook ran on a smaller budget than ` +
      'the test body it prepares. Jest applied one `testTimeout` to both; Vitest resolves `hookTimeout` separately and ' +
      'defaults it to 10000ms, so a migration that carried over only `testTimeout` left half the budget behind. Set ' +
      '`hookTimeout` next to `testTimeout` in the runner config.',
    DOCS_LINKS.setup,
  );
}

/**
 * Whether this error is a hook that ran out of the run-wide budget.
 *
 * The limit in the message has to match the configured `hookTimeout` for the hint to be true: a hook
 * written as `beforeEach(fn, 300)` chose its own budget, and telling its author about the config
 * would send them to the wrong file. Only the run-wide limit is the migration's fault.
 */
function isRunWideHookTimeout(message: string, hookTimeout: number): boolean {
  const match = HOOK_TIMEOUT_MESSAGE.exec(message);

  return match !== null && Number(match[1]) === hookTimeout;
}

/**
 * Append the hint to every hook-timeout error the runner has already blamed this test for.
 *
 * Nothing happens unless the budgets actually differ — where `hookTimeout >= testTimeout` the hook
 * had at least as much time as the body, the timeout means the hook is genuinely slow, and the
 * sentence below would be noise on a real defect.
 *
 * `errors` is walked the same defensive way the rest of the teardown reads the runner's task shape:
 * this package does not depend on the runner's types, and a missing link anywhere on the path means
 * the same thing as an empty list.
 */
export function annotateHookTimeout(errors: readonly unknown[], timeouts: RunnerTimeouts | undefined): void {
  if (timeouts === undefined || timeouts.hookTimeout >= timeouts.testTimeout) {
    return;
  }

  for (const error of errors) {
    const message: unknown = Reflect.get(Object(error), 'message');

    if (typeof message === 'string' && !message.includes(HINT_MARKER) && isRunWideHookTimeout(message, timeouts.hookTimeout)) {
      Reflect.set(Object(error), 'message', `${message}\n${describeHookTimeout(timeouts)}`);
    }
  }
}
