// The diagnostic guards of `setupAutoSpy`: each one adds its steps to the registry and, where it needs
// the file boundary, registers the `beforeAll` for it. Kept out of the orchestrator for `max-lines`.
import { afterAll, beforeAll, expect } from 'vitest';

import * as DOCS_LINKS from './docs-links';
import { annotateFrozenClockTimeout, readFrozenClock } from './frozen-clock';
import { takeStrictViolations } from './function-spy';
import { type GlobalPatchReaction, openGlobalPatchWatch } from './global-patch-guard';
import { type GuardReaction, reactToFindings } from './guard-reaction';
import type { GuardRegistry } from './guard-registry';
import { annotateHookTimeout, readRunnerTimeouts } from './hook-timeout';
import { withDocs } from './message-link';
import { count, displayPath } from './message-text';
import { type PrototypePollutionReaction, type PrototypeSnapshot, checkPrototypePollution, snapshotPrototypes } from './prototype-guard';
import { currentSpecFile } from './spec-file';
import { type StrayRejection, flushStrayRejections, trackStrayRejections } from './stray-rejections';
import { describeSwallowedStrictCalls } from './swallowed-strict';
import { openReadWindow, reportUnconfiguredReads } from './unconfigured-reads';
import { writeWarning } from './write-warning';

/** The options the guards here read; `SetupAutoSpyOptions` documents each of them. */
export interface DiagnosticOptions {
  hookTimeoutHint?: boolean;
  frozenClockHint?: boolean;
  guardGlobals?: GlobalPatchReaction;
  prototypePollution?: PrototypePollutionReaction;
  swallowedStrictCalls?: GuardReaction;
  strict?: boolean;
  unconfiguredReads?: GuardReaction;
  strayRejections?: boolean;
}

const LATE_ASSERTION_ADVICE =
  'An assertion that settles after its test has ended cannot fail it, so that test passed without it. Return or await the ' +
  'promise — `.then(() => expect(…))` or an async helper called without await is the usual cause.';

const UNHANDLED_ERROR_ADVICE =
  'Under zone.js a rejection nothing handled fails no test. Await the promise, or assert on it with ' +
  '`await expect(promise).rejects.toThrow(…)`.';

function describeReason(reason: unknown): string {
  return reason instanceof Error ? `${reason.name}: ${String(reason.message.split('\n')[0])}` : `rejected with ${String(reason)}`;
}

function surfacedIn(testName: string): string {
  return testName === '' ? 'outside any test' : `in "${testName}"`;
}

/**
 * Turn what was captured into the failure message. "Attributed to" names the test the runner was in
 * when zone.js gave up, which is not always the test that created the promise. Exported for its spec.
 */
export function describeStrayRejections(rejections: readonly StrayRejection[]): string {
  const tests = new Set(rejections.map((rejection) => rejection.testName));
  const [only] = tests;
  const shared = tests.size === 1 && only !== undefined ? ` ${surfacedIn(only)}` : '';
  const lines = rejections.map(
    (rejection) => `  - ${describeReason(rejection.reason)}${shared === '' ? ` — surfaced ${surfacedIn(rejection.testName)}` : ''}`,
  );
  const advice = rejections.some((rejection) => rejection.assertion) ? LATE_ASSERTION_ADVICE : UNHANDLED_ERROR_ADVICE;
  const one = rejections.length === 1;

  return withDocs(
    `[vitest-auto-spy] ${count(rejections.length, 'promise rejection')} went unhandled${shared}, and zone.js swallowed ` +
      `${one ? 'it' : 'them'} into console.error:\n${lines.join('\n')}\n${advice}`,
    DOCS_LINKS.setupRejections,
  );
}

/**
 * What the runner has already blamed the test that just ran for. Reached through `Object(...)` at
 * every step: the shape is the runner's, and a missing link means an empty list. Exported for its spec.
 */
export function reportedErrors(context: unknown): readonly unknown[] {
  const result: unknown = Reflect.get(Object(Reflect.get(Object(context), 'task')), 'result');
  const errors: unknown = Reflect.get(Object(result), 'errors');

  return Array.isArray(errors) ? errors : [];
}

/** Identity first, then message and stack: the runner does not promise to hand back the object that was thrown. */
function alreadyReported(reason: unknown, reported: readonly unknown[]): boolean {
  return reported.some((error) => error === reason || sameFailure(error, reason));
}

function sameFailure(reported: unknown, reason: unknown): boolean {
  const message: unknown = Reflect.get(Object(reason), 'message');

  return (
    typeof message === 'string' &&
    Reflect.get(Object(reported), 'message') === message &&
    Reflect.get(Object(reported), 'stack') === Reflect.get(Object(reason), 'stack')
  );
}

/**
 * Fail the test whatever was captured is attributed to, minus what the runner has already said: an
 * async test's own failed assertion also arrives here as a rejection. Exported for its spec.
 */
export function reportStrayRejections(context?: unknown): void {
  const reported = reportedErrors(context);
  const stray = flushStrayRejections().filter((rejection) => !alreadyReported(rejection.reason, reported));

  if (stray.length > 0) {
    throw new Error(describeStrayRejections(stray));
  }
}

/** Fail the test whose strict throws something swallowed, minus the ones the runner already reported. Exported for its spec. */
export function reportSwallowedStrictCalls(context: unknown, reaction: GuardReaction): void {
  const reported = reportedErrors(context);
  const swallowed = takeStrictViolations().filter((error) => !alreadyReported(error, reported));
  const findings = swallowed.length > 0 ? [describeSwallowedStrictCalls(swallowed, expect.getState().currentTestName)] : [];

  reactToFindings(findings, reaction);
}

/**
 * Extend a hook timeout the runner already blamed this test for with its reason. The budgets are read
 * per test, since `vi.setConfig` in a spec runs after the setup file. Exported for its spec.
 */
export function annotateTimedOutHooks(context?: unknown): void {
  annotateHookTimeout(reportedErrors(context), readRunnerTimeouts());
}

/** Explain a timeout the frozen clock accounts for; runs after {@link annotateTimedOutHooks}. Exported for its spec. */
export function annotateFrozenClockTimeouts(context?: unknown): void {
  annotateFrozenClockTimeout(reportedErrors(context), readFrozenClock());
}

declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyPrototypeBaseline__: PrototypeSnapshot[] | undefined;
  var __vitestAutoSpyPreviousSpecFile__: string | undefined;
}

/**
 * Take off a key an earlier spec file left on a built-in prototype while it was imported, collected
 * or torn down — writes no hook can see, which stop the next file collecting. A setup file runs
 * before each file is collected, so the report names the file that ran last. Never a throw, and never
 * `console.warn`: there is no task yet.
 */
export function reportPrototypeLeftovers(write: (message: string) => void = writeWarning): void {
  const baseline = (globalThis.__vitestAutoSpyPrototypeBaseline__ ??= snapshotPrototypes());
  const previous = globalThis.__vitestAutoSpyPreviousSpecFile__;
  const starting = currentSpecFile();

  // Recorded as each file starts: the next file's setup reads it, before that file is collected.
  globalThis.__vitestAutoSpyPreviousSpecFile__ = typeof starting === 'string' ? starting : undefined;
  const findings = baseline.flatMap((snapshot) => {
    const added = Object.keys(snapshot.object).filter((key) => !snapshot.keys.has(key));

    added.forEach((key) => {
      // A key that will not delete is adopted into the baseline, so the next file is not told again.
      if (!Reflect.deleteProperty(snapshot.object, key)) {
        snapshot.keys.add(key);
      }
    });

    return added.length > 0 ? [describePrototypeLeftover(snapshot.name, added, previous)] : [];
  });

  if (findings.length > 0) {
    write(findings.join('\n'));
  }
}

/** Exported for its spec. */
export function describePrototypeLeftover(name: string, added: readonly string[], previous: string | undefined): string {
  const keys = added.map((key) => `"${key}"`).join(', ');
  const culprit =
    previous === undefined
      ? 'a spec file that ran earlier in this worker'
      : `the previous spec file of this worker, ${displayPath(previous)}`;

  return withDocs(
    `[vitest-auto-spy] ${keys} was left on ${name} by ${culprit} — while it was imported, collected or in an afterAll — ` +
      'and has been taken off.\n' +
      "Left on, the key stops every later spec file in the worker from collecting: Vitest walks a file's hooks with for…in. " +
      'In that file, patch the prototype of the class an object came from, never Object.getPrototypeOf(someObjectLiteral).',
    DOCS_LINKS.setupPrototypeEarlierFile,
  );
}

function watchGlobalPatches(registry: GuardRegistry, reaction: GlobalPatchReaction): void {
  const watch = openGlobalPatchWatch(reaction);

  if (watch !== undefined) {
    registry.teardown.push(() => watch.checkTest());
  }
}

function watchPrototypePollution(registry: GuardRegistry, reaction: PrototypePollutionReaction): void {
  if (reaction === 'off') {
    return;
  }

  reportPrototypeLeftovers();

  let before: PrototypeSnapshot[] = [];

  // From `beforeAll` for the same reason; the per-test step advances the snapshot and keeps naming the test.
  beforeAll(() => {
    before = snapshotPrototypes();

    return (): void => {
      checkPrototypePollution(before, reaction);
    };
  });
  registry.teardown.push(() => checkPrototypePollution(before, reaction));
}

function watchSwallowedStrictCalls(registry: GuardRegistry, reaction: GuardReaction): void {
  if (reaction === 'off') {
    return;
  }

  // Drained per test, so a throw from an earlier test's teardown is not charged to this one.
  registry.open.push(() => {
    takeStrictViolations();
  });
  registry.teardown.push((context) => reportSwallowedStrictCalls(context, reaction));
}

/** Whatever the grade: a double's own `onUnstubbedRead` is judged by the same step, and has no other way to learn where a test starts. */
function watchUnconfiguredReads(registry: GuardRegistry, reaction: GuardReaction): void {
  registry.open.push((context) => openReadWindow(context));
  registry.teardown.push((context) => reportUnconfiguredReads(reaction, context));
}

function watchStrayRejections(registry: GuardRegistry, enabled: boolean): void {
  if (!enabled) {
    return;
  }

  // The claim happens now, once per worker, exactly as `strayTimers` does.
  afterAll(trackStrayRejections());
  registry.teardown.push(reportStrayRejections);
}

/**
 * The teardown steps that report rather than restore, in their order: the annotations first (they only
 * add a sentence and never throw), the rejection read last, as late as it can be without a restore first.
 */
export function armDiagnostics(registry: GuardRegistry, options: DiagnosticOptions): void {
  if (options.hookTimeoutHint ?? true) {
    registry.teardown.push(annotateTimedOutHooks);
  }

  if (options.frozenClockHint ?? true) {
    registry.teardown.push(annotateFrozenClockTimeouts);
  }

  watchGlobalPatches(registry, options.guardGlobals ?? 'off');
  watchPrototypePollution(registry, options.prototypePollution ?? 'throw');
  watchSwallowedStrictCalls(registry, options.swallowedStrictCalls ?? (options.strict === true ? 'throw' : 'off'));
  watchUnconfiguredReads(registry, options.unconfiguredReads ?? 'off');
  watchStrayRejections(registry, options.strayRejections ?? false);
}
