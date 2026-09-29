import { getTestBed } from '@angular/core/testing';

import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';

const NEVER_INITIALIZED = 'Need to call TestBed.initTestEnvironment() first';

interface TestBedsSeen {
  readonly seen: WeakSet<object>;
  count: number;
}

declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyTestBeds__: TestBedsSeen | undefined;
}

/**
 * Count the distinct TestBeds this package has met in the worker. A second one means
 * `@angular/core/testing` was evaluated again, which `vi.resetModules()` does. Exported for its spec.
 */
export function noteTestBed(testBed: object): number {
  const record = (globalThis.__vitestAutoSpyTestBeds__ ??= { seen: new WeakSet(), count: 0 });

  if (!record.seen.has(testBed)) {
    record.seen.add(testBed);
    record.count += 1;
  }

  return record.count;
}

noteTestBed(getTestBed());

// Both symptoms arrive when the package reaches a TestBed nobody initialized: a second copy Node loaded
// because Vitest externalized the package, or a fresh one a module reset evaluated after the setup file ran.
function splitSymptom(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  if (error.message.includes(NEVER_INITIALIZED)) {
    return `"${NEVER_INITIALIZED}"`;
  }

  return error instanceof TypeError && error.message.includes("reading 'ngModule'") ? `"${error.message}"` : undefined;
}

const TWO_COPIES =
  'the run holds two copies of @angular/core/testing: Vitest externalized vitest-auto-spy, so Node loaded its own Angular next to ' +
  'the one the specs use, and this package talks to the copy nobody initialized.\n' +
  "Inline the package so both share one copy: test: { server: { deps: { inline: ['vitest-auto-spy'] } } } in the Vitest config.";

const MODULE_RESET =
  '@angular/core/testing was evaluated again in this worker after the setup file initialized it, and nobody initialized the new ' +
  'copy. vi.resetModules() does that, and under isolate: false it reaches every later file of the worker; a setup that remembers ' +
  'on globalThis that it already ran, as setupTestBed() of @analogjs/vitest-angular does, then skips the new copy.\n' +
  'In the setup file, initialize the TestBed again when getTestBed().platform is null, or take the vi.resetModules() call out.';

// Worded as a condition, not a verdict: a setup file that never calls `initTestEnvironment` produces
// the first symptom too, and nothing at runtime tells the two apart.
export function explainTestBedSplit(error: unknown, call: string, testBed: object = getTestBed()): Error | undefined {
  const symptom = splitSymptom(error);

  if (symptom === undefined) {
    return undefined;
  }

  const reset = noteTestBed(testBed) > 1;

  return new Error(
    withDocs(
      `[vitest-auto-spy] ${call}: Angular answered ${symptom}.\n` +
        'If the setup file does initialize the TestBed (setupTestBed(), getTestBed().initTestEnvironment(…)), ' +
        (reset ? MODULE_RESET : TWO_COPIES),
      reset ? DOCS_LINKS.angularTestBedCopies : DOCS_LINKS.installationVitest,
    ),
    { cause: error },
  );
}

export function withTestBedSplitExplained<Result>(call: () => string, step: () => Result): Result {
  try {
    return step();
  } catch (error) {
    throw explainTestBedSplit(error, call()) ?? error;
  }
}
