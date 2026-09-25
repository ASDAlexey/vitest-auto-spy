/**
 * One module mocked with a factory in one spec and automocked in another, in a shared environment.
 *
 * Under `isolate: false` Vitest keeps a factory mock on the real module's node (`meta.mockedModule`)
 * after its file ends, and a later file's `vi.mock(x)` or `vi.mock(x, { spy: true })` of the same
 * specifier is handed that factory: it fails with `No "X" export is defined on the "x" mock` in a
 * spec that has no factory at all, and only when the two files share a worker. Factory to factory and
 * mock to no mock do not leak, so the pair is the whole finding.
 */
import { posix } from 'node:path';

import { readTextFile } from '../fs-scan';
import type { Profile } from '../profile';
import type { Finding } from '../report';
import { type SourceGraph, isSpecFile, resolveRelative } from './graph';
import { isInsideLiteral, literalSpans } from './literals';
import { isolationFromAngularBuilder } from './runner-isolation';
import { unitTestTargets } from './unit-test-targets';

type MockKind = 'automock' | 'factory';

const MOCK_CALL = /\bvi\.(?:mock|doMock)\(\s*(["'`])([^"'`]+)\1\s*([),])/g;

const SPY_OPTION = /^\s*{\s*spy\s*:\s*true\s*}\s*\)/;

const RUNNER_CONFIG = /(^|\/)[\w.-]*vite[\w.-]*\.[cm]?[jt]s$/;

export function mockCalls(source: string): { specifier: string; kind: MockKind }[] {
  const spans = literalSpans(source);

  return [...source.matchAll(MOCK_CALL)]
    .filter((match) => !isInsideLiteral(spans, match.index))
    .map((match) => {
      const rest = source.slice(match.index + match[0].length);
      const automock = match[3] === ')' || SPY_OPTION.test(rest);

      return { specifier: String(match[2]), kind: automock ? 'automock' : 'factory' };
    });
}

/** Where the shared environment comes from, or `undefined` when every file gets its own. */
function sharedEnvironmentSource(profile: Profile): string | undefined {
  const declared = profile.files
    .filter((file) => RUNNER_CONFIG.test(file))
    .find((file) => /\bisolate\s*:\s*false\b/.test(String(readTextFile(posix.join(profile.cwd, file)))));

  if (declared !== undefined) {
    return `\`isolate: false\` in ${declared}`;
  }

  const [target] = unitTestTargets(profile);

  return target !== undefined && isolationFromAngularBuilder(profile)?.isolated === false
    ? `the \`isolate: false\` default of ${target.builder}`
    : undefined;
}

const LISTED_FILES = 6;

function listFiles(files: readonly string[]): string {
  const shown = files.length <= LISTED_FILES ? files : files.slice(0, LISTED_FILES - 1);
  const rest = files.length - shown.length;

  return `${shown.join(', ')}${rest === 0 ? '' : ` and ${rest} more`}`;
}

export function checkModuleMockLeak(profile: Profile, graph: SourceGraph): Finding[] {
  const source = sharedEnvironmentSource(profile);

  if (source === undefined) {
    return [];
  }

  const known = new Set(profile.files);
  const byModule = new Map<string, Map<MockKind, { file: string; specifier: string }[]>>();

  for (const [file, text] of graph.texts) {
    if (!isSpecFile(file)) {
      continue;
    }

    for (const { specifier, kind } of mockCalls(text)) {
      const key = resolveRelative(file, specifier, known) ?? specifier;
      const kinds = byModule.get(key) ?? new Map<MockKind, { file: string; specifier: string }[]>();

      kinds.set(kind, [...(kinds.get(kind) ?? []), { file, specifier }]);
      byModule.set(key, kinds);
    }
  }

  return [...byModule].flatMap(([module, kinds]) => {
    const factories = (kinds.get('factory') ?? []).map((entry) => entry.file);

    return factories.length === 0
      ? []
      : (kinds.get('automock') ?? []).map(({ file, specifier }) => ({
          check: 'module-mock-leak',
          severity: 'warning' as const,
          file,
          message: `\`${module}\` is automocked here and mocked with a factory in ${listFiles(factories)}. With ${source}, a later automock of the module gets that factory, so this file fails with \`No "…" export is defined on the "${specifier}" mock\` whenever the two share a worker.`,
          fix: `Give \`vi.mock('${specifier}')\` in this file a factory too, as ${String(factories[0])} does.`,
        }));
  });
}
