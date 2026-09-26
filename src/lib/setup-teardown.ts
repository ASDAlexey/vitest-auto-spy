/**
 * The one `afterEach` this library installs, and the net under it.
 *
 * Kept apart from `setupAutoSpy` itself because the three concerns here are about the *hook*, not
 * about the options: the order the steps run in, which test a step's outcome belongs to, and what
 * happens in the run where the hook never started at all.
 */
import * as vitest from 'vitest';

import * as DOCS_LINKS from './docs-links';
import type { DocumentWatch } from './document-guard';
import { libraryWarn } from './guard-reaction';
import type { GuardRegistry } from './guard-registry';
import { withDocs } from './message-link';
import { count, taskName } from './message-text';
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

/** Vitest's `aroundEach`, as far as the net uses it. */
export type AroundEach = (hook: (runTest: () => Promise<void>, context: unknown) => Promise<void>) => void;

/** `aroundEach` where the runner has it (Vitest 4.1 and later). Read off the namespace so an older runner still links. */
export function runnerAroundEach(runner: object = vitest): AroundEach | undefined {
  const around: unknown = Reflect.get(runner, 'aroundEach');

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the runner's own export, narrowed to a function; its parameter types are the runner's and this package does not depend on them.
  return typeof around === 'function' ? (around as AroundEach) : undefined;
}

/**
 * The teardown hook, and the net that catches the run where it never happened.
 *
 * Vitest runs `afterEach` hooks in reverse registration order, so the setup file's runs last, and a
 * spec's `afterEach` that throws skips it: the patches stay and the next test reads them. The net
 * runs after the whole `afterEach` chain whatever it did — from `aroundEach` where the runner has it,
 * else from a per-test `onTestFinished`, which costs a stack capture per test.
 */
export function installTeardown(registry: GuardRegistry, documents?: DocumentWatch, runner: object = vitest): void {
  const around = runnerAroundEach(runner);
  const ledger = createTeardownLedger();
  // One full explanation per file: a run where every test's hooks throw repeated it hundreds of times.
  let skippedInFile = 0;

  const settle = (context: unknown): void => {
    const entry = ledger.settle(context);

    if (entry === undefined) {
      return;
    }

    if (!entry.ran) {
      const leaked = countMockedProps();

      runTeardown(registry.restores);

      skippedInFile += 1;
      const test = testNameOf(context);

      libraryWarn(skippedInFile === 1 ? describeSkippedTeardown(leaked, test) : describeSkippedAgain(leaked, skippedInFile, test));
    }

    entry.closeDocument?.();
  };

  registry.open.push((context) => {
    ledger.begin(context, documents?.open());
    noticeConcurrentTest(context);

    if (around === undefined) {
      vitest.onTestFinished(() => settle(context));
    }
  });

  around?.(async (runTest, context) => {
    try {
      await runTest();
    } finally {
      settle(context);
    }
  });

  vitest.afterEach((context) => {
    try {
      runTeardown(registry.teardown, context);
    } finally {
      // The restores have run by now even if a check threw; the net is for the hook that never started.
      ledger.done(context);
    }
  });
}

/** The task a hook's context belongs to, or `undefined` where the runner hands one this package cannot read. */
function taskOf(context: unknown): object | undefined {
  const task: unknown = Reflect.get(Object(context), 'task');

  return typeof task === 'object' && task !== null ? task : undefined;
}

/** The running test's full name from a hook's context. Exported for its spec. */
export function testNameOf(context: unknown): string | undefined {
  const task = taskOf(context);

  return task === undefined ? undefined : taskName(task);
}

/** What the net learns about one test: whether the shared `afterEach` ran, and the document check it opened. */
export interface LedgerEntry {
  ran: boolean;
  closeDocument: (() => void) | undefined;
}

/** Exported for its spec: the hooks it serves cannot observe it. */
export interface TeardownLedger {
  begin(context: unknown, closeDocument?: () => void): void;
  done(context: unknown): void;
  /** Hand back the test's entry and forget it; `undefined` for a test whose `beforeEach` step never ran. */
  settle(context: unknown): LedgerEntry | undefined;
}

/**
 * Keyed by the runner's task, so under `test.concurrent` one test's net never reads another's entry.
 * A single slot stays as the fallback for a context that carries no task.
 */
export function createTeardownLedger(): TeardownLedger {
  const byTask = new WeakMap<object, LedgerEntry>();
  let withoutTask: LedgerEntry | undefined;

  const entryOf = (context: unknown): LedgerEntry | undefined => {
    const task = taskOf(context);

    return task === undefined ? withoutTask : byTask.get(task);
  };

  return {
    begin: (context, closeDocument): void => {
      const entry: LedgerEntry = { ran: false, closeDocument };
      const task = taskOf(context);

      if (task === undefined) {
        withoutTask = entry;
      } else {
        byTask.set(task, entry);
      }
    },
    done: (context): void => {
      const entry = entryOf(context);

      if (entry !== undefined) {
        entry.ran = true;
      }
    },
    settle: (context): LedgerEntry | undefined => {
      const entry = entryOf(context);
      const task = taskOf(context);

      if (task === undefined) {
        withoutTask = undefined;
      } else {
        byTask.delete(task);
      }

      return entry;
    },
  };
}

let warnedAboutConcurrency = false;

/** Exported for its spec. */
export function describeConcurrentTest(test: string | undefined): string {
  return withDocs(
    `[vitest-auto-spy] ${test === undefined ? 'A test' : `"${test}"`} runs as test.concurrent, and setupAutoSpy()'s per-test ` +
      'guards judge one test at a time: a console or document finding can land on the other test in flight, ' +
      'or be cleared before it is seen.\n' +
      "Run this file's tests sequentially, or give the files that keep test.concurrent a setup with strayConsole: 'off' " +
      "and documentPollution: 'off'. Said once per worker.",
    DOCS_LINKS.setupConcurrent,
  );
}

/**
 * Say once per worker that a concurrent test was seen. Exported for its spec, which is also where the
 * latch is reset — see {@link resetConcurrencyNotice}.
 */
export function noticeConcurrentTest(context: unknown, write: (message: string) => void = libraryWarn): void {
  if (warnedAboutConcurrency || Reflect.get(Object(taskOf(context)), 'concurrent') !== true) {
    return;
  }

  warnedAboutConcurrency = true;
  write(describeConcurrentTest(testNameOf(context)));
}

/** Reset the warn-once latch. Internal — for the spec that proves it latches. */
export function resetConcurrencyNotice(): void {
  warnedAboutConcurrency = false;
}

function subjectOf(test: string | undefined): string {
  return test === undefined ? 'this test' : `"${test}"`;
}

function leftover(leaked: number): string {
  if (leaked === 0) {
    return 'No mock*Prop patch was left in place.';
  }

  return `${count(leaked, 'mock*Prop patch was', 'mock*Prop patches were')} still in place and ${leaked === 1 ? 'is' : 'are'} put back now.`;
}

/** The short form, for every skipped teardown after the first in a file. Exported for its spec. */
export function describeSkippedAgain(leaked: number, skipped: number, test: string | undefined): string {
  return (
    `[vitest-auto-spy] setupAutoSpy()'s afterEach did not run for ${subjectOf(test)} either (${count(skipped, 'test')} in this ` +
    `file); ${count(leaked, 'mock*Prop patch', 'mock*Prop patches')} put back. The first report in this file says why.`
  );
}

/** What the net says when it finds a teardown that never ran. Exported for its spec. */
export function describeSkippedTeardown(leaked: number, test: string | undefined): string {
  return withDocs(
    `[vitest-auto-spy] setupAutoSpy()'s afterEach did not run for ${subjectOf(test)}: an afterEach the spec registered threw, ` +
      "and Vitest skips the hooks after it — the setup file's runs last. " +
      `${leftover(leaked)}\n` +
      "Fix the hook that threw; its error is in this test's output.",
    DOCS_LINKS.setupRestoreProps,
  );
}
