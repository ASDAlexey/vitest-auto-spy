import type { BoundaryRepair } from './file-boundary';
import { type GuardReaction, reactToFindings } from './guard-reaction';

/** Where the Angular helpers leave the check, so the core never imports Angular to reach it. */
export const CLEAN_TEST_BED_CHECK = '__vitestAutoSpyCleanTestBed__';

function runCheck(): string | undefined {
  const check: unknown = Reflect.get(globalThis, CLEAN_TEST_BED_CHECK);
  const report: unknown = typeof check === 'function' ? Reflect.apply(check, undefined, []) : undefined;

  return typeof report === 'string' ? report : undefined;
}

/** The file-end sweep for a dirty `TestBed`, or none; a suite that never loads the Angular helpers has no check to run. */
export function cleanTestBedSweeps(reaction: GuardReaction): BoundaryRepair[] {
  if (reaction === 'off') {
    return [];
  }

  return [
    (): (() => void) | undefined => {
      let report: string | undefined;

      try {
        report = runCheck();
      } catch (error) {
        report = `[vitest-auto-spy] Checking the TestBed at the end of the file threw: ${error instanceof Error ? error.message : String(error)}`;
      }

      return report === undefined ? undefined : (): void => reactToFindings([report], reaction);
    },
  ];
}
