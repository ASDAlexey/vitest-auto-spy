/**
 * An entry that loads `vitest`, imported where `vitest` is not installed.
 *
 * The entries link `vitest` statically, so the ES module graph fails to link before a line of the
 * library runs and no runtime message can name the cause: the reader gets "Cannot find package
 * 'vitest'" from inside `node_modules/vitest-auto-spy`. It happens to a bun:test, node:test or Rstest
 * suite that reached for the Vitest entry out of habit.
 */
import type { Profile } from '../profile';
import type { Finding } from '../report';
import { type SourceGraph, type TextPass, inOnePass } from './graph';
import { isInsideLiteral, literalSpans } from './literals';
import { installedVersionOf } from './vitest-5-facts';

/** The entries whose module graph imports `vitest`; `vitest-less-entry.spec.ts` derives the same list from `src/`. */
export const VITEST_ENTRIES: ReadonlySet<string> = new Set([
  '',
  '/angular',
  '/angular/diagnostics',
  '/angular/doubles',
  '/angular/matchers',
  '/angular-http',
  '/dom-stubs',
  '/jasmine',
  '/react',
  '/setup',
  '/signal-forms',
  '/svelte',
  '/vue',
]);

const RUNNER_ENTRIES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  bun: { '': '/bun', '/angular': '/bun-angular' },
  node: { '': '/node' },
  rstest: { '': '/rstest' },
};

const RUNNER_NAMES: Readonly<Record<string, string>> = { bun: 'bun:test', node: 'node:test', rstest: 'Rstest', vitest: 'Vitest' };

const IMPORT = /\b(?:from|import|require)\s*\(?\s*["']vitest-auto-spy((?:\/[\w-]+)*)["']/g;

function importedEntries(text: string): string[] {
  const spans = literalSpans(text);

  return [...text.matchAll(IMPORT)]
    .filter((match) => !isInsideLiteral(spans, match.index) && VITEST_ENTRIES.has(String(match[1])))
    .map((match) => String(match[1]));
}

const name = (entry: string): string => `\`vitest-auto-spy${entry}\``;

function fixFor(runner: Profile['runner'], entries: readonly string[]): string {
  if (runner === 'vitest') {
    return 'Install `vitest` as a devDependency: the runner this repository is set up for is missing.';
  }

  const swaps = entries.flatMap((entry) => {
    const replacement = RUNNER_ENTRIES[runner]?.[entry];

    return replacement === undefined ? [] : [`${name(entry)} with ${name(replacement)}`];
  });
  const kept = entries.filter((entry) => RUNNER_ENTRIES[runner]?.[entry] === undefined);

  return [
    ...(swaps.length === 0 ? [] : [`Under ${String(RUNNER_NAMES[runner])}, replace ${swaps.join(', and ')}.`]),
    ...(kept.length === 0
      ? []
      : [
          `${kept.map(name).join(', ')} ${kept.length === 1 ? 'has' : 'have'} no ${String(RUNNER_NAMES[runner])} counterpart: drop the import, or install \`vitest\` for it.`,
        ]),
  ].join(' ');
}

export function checkVitestLessEntry(profile: Profile, graph: SourceGraph): Finding[] {
  return inOnePass(graph, [vitestLessEntryPass(profile)]);
}

export function vitestLessEntryPass(profile: Profile): TextPass | undefined {
  if (installedVersionOf(profile.cwd, 'vitest-auto-spy') === undefined || installedVersionOf(profile.cwd, 'vitest') !== undefined) {
    return undefined;
  }

  const findings: Finding[] = [];

  return {
    visit: (file, text): void => {
      const entries = [...new Set(importedEntries(text))].sort();

      if (entries.length > 0) {
        findings.push({
          check: 'vitest-entry-without-vitest',
          severity: 'error',
          file,
          message: `Imports ${entries.map(name).join(', ')}, which ${entries.length === 1 ? 'loads' : 'load'} \`vitest\`, and \`vitest\` is not installed: the file fails to load with "Cannot find package 'vitest'" before any test runs.`,
          fix: fixFor(profile.runner, entries),
        });
      }
    },
    finish: (): Finding[] => findings,
  };
}
