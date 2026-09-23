/**
 * `strict: 'survey'`: every call and read strict mode would refuse is counted instead, and the file's
 * list is printed once it is over — the whole migration list from one run, where `strict: true`
 * stops each test at its first unconfigured call.
 */
import { DOCS_LINKS, withDocs } from './docs-links';
import type { UnstubbedCall, UnstubbedCallHandler, UnstubbedRead, UnstubbedReadHandler } from './types';

export interface StrictSurvey {
  readonly onCall: UnstubbedCallHandler;
  readonly onRead: UnstubbedReadHandler;
  /** The report for everything counted since the last one, or `undefined` when there was nothing. */
  readonly flush: (file: string | undefined) => string | undefined;
}

function memberOf(className: string | undefined, member: string): string {
  return className === undefined || className === '' ? member : `${className}.${member}`;
}

export function createStrictSurvey(): StrictSurvey {
  const calls = new Map<string, number>();
  const reads = new Map<string, number>();
  const count = (tally: Map<string, number>, key: string, by: number): void => {
    tally.set(key, (tally.get(key) ?? 0) + by);
  };

  return {
    onCall: ({ className, method }: UnstubbedCall): undefined => {
      count(calls, memberOf(className, method), 1);

      return undefined;
    },
    onRead: ({ className, member, count: times }: UnstubbedRead): void => {
      count(reads, memberOf(className, member), times);
    },
    flush: (file): string | undefined => {
      if (calls.size === 0 && reads.size === 0) {
        return undefined;
      }

      const lines = (heading: string, tally: Map<string, number>): string[] =>
        tally.size === 0
          ? []
          : [heading, ...[...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, times]) => `  ${key} ×${times}`)];
      const report = [
        `[vitest-auto-spy] strict survey — ${file ?? 'this file'}: what strict mode would have refused.`,
        ...lines('Calls nobody configured (seed them in `returns`, or `registerAutoSpyDefaults` in the setup file):', calls),
        ...lines('Getters read and streams subscribed with nothing configured:', reads),
      ].join('\n');

      calls.clear();
      reads.clear();

      return withDocs(report, DOCS_LINKS.strictMode);
    },
  };
}
