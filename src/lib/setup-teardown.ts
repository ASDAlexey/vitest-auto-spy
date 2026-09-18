/**
 * The one `afterEach` this library installs, and the net under it.
 *
 * Kept apart from `setupAutoSpy` itself because the three concerns here are about the *hook*, not
 * about the options: the order the steps run in, which test a step's outcome belongs to, and what
 * happens in the run where the hook never started at all.
 */
import { afterEach, beforeEach, onTestFinished } from 'vitest';

import { DOCS_LINKS, withDocs } from './docs-links';
import type { DocumentWatch } from './document-guard';
import { libraryWarn } from './guard-reaction';
import { countMockedProps } from './prop-mock';

/**
 * One step of the single `afterEach` {@link setupAutoSpy} installs.
 *
 * The runner's test context is handed along, because one of the steps needs to know how the test it
 * runs after ended; the rest ignore it.
 */
export type TeardownStep = (context?: unknown) => void;

/**
 * Run every teardown step, then re-throw whatever the first failing one threw.
 *
 * Two of the steps throw on purpose — `strayRejections` and `guardGlobals: 'throw'` fail the test
 * their finding belongs to — and a throw out of a hook cancels every hook the runner has not called
 * yet. So the steps share one hook and this loop: the restores run whether or not a diagnostic
 * found something, and the diagnostic's message still fails the test.
 *
 * The first failure wins rather than the last, because the diagnostics run first and their message
 * is the one that names a defect in the suite; a `try`/`finally` would give the opposite priority,
 * since a `finally` block's throw replaces the pending one.
 *
 * Exported for this module's own spec: every step of a real run either throws through the hook —
 * failing the test that is doing the asserting — or is invisible from inside a test.
 */
export function runTeardown(steps: readonly TeardownStep[], context?: unknown): void {
  const failures: unknown[] = [];

  for (const step of steps) {
    try {
      step(context);
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw failures[0];
  }
}

/**
 * The teardown hook, and the net that catches the run where it never happened.
 *
 * Vitest runs `afterEach` hooks in **reverse** registration order, so the hook a setup file
 * registers is the *last* to run — and a hook the spec file registered, which therefore runs first,
 * takes the whole chain down with it when it throws. Nothing here runs, the patches stay in place,
 * and the next test reads values somebody else installed.
 *
 * That is neither hypothetical nor loud. One spec kept a long-standing
 * `afterEach(() => vi.restoreAllMocks())`; migrating it to
 * `provideAutoSpy(LayoutStateService, { gettersToSpyOn: [...] })` made the restored getter return
 * `undefined`, `ngOnDestroy` called it as a signal, the `TypeError` aborted the hook — and the
 * failure surfaced in a different `describe` as a template error about a null profile. With the
 * hand-rolled `vi.fn()` it replaced, the restored getter was still callable, so the mine had been
 * sitting there invisible.
 *
 * `onTestFinished` is the answer because Vitest runs it after the `afterEach` chain and runs it
 * whatever that chain did — measured in both orderings rather than assumed. It is registered per
 * test from a `beforeEach`, and does nothing at all unless the hook was skipped, so the ordinary
 * path costs one boolean.
 */
export function installTeardown(steps: readonly TeardownStep[], restores: readonly TeardownStep[], documents?: DocumentWatch): void {
  const ledger = createTeardownLedger();
  // One full explanation per file: a run where every test's hooks throw repeated it hundreds of times.
  let skippedInFile = 0;

  beforeEach((context) => {
    ledger.begin(context);
    noticeConcurrentTest(context);

    const closeDocument = documents?.open();

    // One registration, not two: the runner takes a stack for every `onTestFinished` it is handed
    // (`withTimeout(handler, …, new Error(…))`), which is about 7 µs a test — the largest single
    // item in what `setupAutoSpy()` costs by default.
    onTestFinished(() => {
      if (!ledger.ran(context)) {
        const leaked = countMockedProps();

        runTeardown(restores);

        skippedInFile += 1;
        libraryWarn(skippedInFile === 1 ? describeSkippedTeardown(leaked) : describeSkippedAgain(leaked, skippedInFile));
      }

      closeDocument?.();
    });
  });

  afterEach((context) => {
    try {
      runTeardown(steps, context);
    } finally {
      // In a `finally`, because `runTeardown` rethrows what a step threw and the restores have run
      // by then regardless — the net's job is the hook that never started, not the one that failed.
      ledger.done(context);
    }
  });
}

/** The task a hook's context belongs to, or `undefined` where the runner hands one this package cannot read. */
function taskOf(context: unknown): object | undefined {
  const task: unknown = Reflect.get(Object(context), 'task');

  return typeof task === 'object' && task !== null ? task : undefined;
}

/** Whether the shared `afterEach` has run for a given test. Exported for its spec: the hooks it serves cannot observe it. */
export interface TeardownLedger {
  begin(context: unknown): void;
  done(context: unknown): void;
  ran(context: unknown): boolean;
}

/**
 * Remember per test, not per file, whether the teardown ran.
 *
 * A single flag is right for a suite that runs one test at a time and wrong for `test.concurrent`:
 * the flag a second test clears in its `beforeEach` is the one the first test's net reads, so the
 * net either fires for a test whose teardown did run or stays quiet for one whose teardown did not.
 * The task object the runner hands every hook is the key that cannot be confused; the flag stays as
 * the fallback for a context that carries none.
 */
export function createTeardownLedger(): TeardownLedger {
  const ranFor = new WeakSet<object>();
  let ranWithoutTask = false;

  return {
    begin: (context): void => {
      if (taskOf(context) === undefined) {
        ranWithoutTask = false;
      }
    },
    done: (context): void => {
      const task = taskOf(context);

      if (task === undefined) {
        ranWithoutTask = true;

        return;
      }

      ranFor.add(task);
    },
    ran: (context): boolean => {
      const task = taskOf(context);

      return task === undefined ? ranWithoutTask : ranFor.has(task);
    },
  };
}

let warnedAboutConcurrency = false;

const CONCURRENT_REPORT =
  '[vitest-auto-spy] a `test.concurrent` test ran with setupAutoSpy() installed. Its per-test guards assume one test at a ' +
  'time: the document snapshot, the console window and the unconfigured-read counter are opened and judged per test, so with ' +
  'two tests in flight a finding can be reported against the other one — or cleared before it is seen. The restores still run ' +
  'for every test. Run the files that need a guard sequentially, or keep `test.concurrent` for files whose setup passes ' +
  '`strayConsole: "off"`, `documentPollution: "off"` and `unconfiguredReads: "off"`.';

/**
 * Say once per worker that a concurrent test was seen. Exported for its spec, which is also where the
 * latch is reset — see {@link resetConcurrencyNotice}.
 */
export function noticeConcurrentTest(context: unknown, write: (message: string) => void = libraryWarn): void {
  if (warnedAboutConcurrency || Reflect.get(Object(taskOf(context)), 'concurrent') !== true) {
    return;
  }

  warnedAboutConcurrency = true;
  write(withDocs(CONCURRENT_REPORT, DOCS_LINKS.setup));
}

/** Reset the warn-once latch. Internal — for the spec that proves it latches. */
export function resetConcurrencyNotice(): void {
  warnedAboutConcurrency = false;
}

/** The short form, for every skipped teardown after the first in a file. */
function describeSkippedAgain(leaked: number, count: number): string {
  return `[vitest-auto-spy] setupAutoSpy()'s afterEach did not run for this test either (${count} in this file); ${leaked} mock*Prop patch(es) put back — see the first report in this file for why.`;
}

/** What the net says when it finds a teardown that never ran. */
function describeSkippedTeardown(leaked: number): string {
  return withDocs(
    `[vitest-auto-spy] setupAutoSpy()'s afterEach did not run for this test, so ${leaked} mock*Prop patch(es) were still in ` +
      'place; they have been put back now. Vitest runs `afterEach` hooks in reverse registration order, which makes the one a ' +
      'setup file registers the last to run — so any hook the spec file registered that throws takes this one with it. Look for ' +
      "the hook that threw in this test's output; without this net the patches would have travelled into the next test, and the " +
      'failure would have surfaced in some later test that never touched them.',
    DOCS_LINKS.setup,
  );
}
