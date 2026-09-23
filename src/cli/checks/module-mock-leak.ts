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

function sharesEnvironment(profile: Profile): boolean {
  const declared = profile.files
    .filter((file) => RUNNER_CONFIG.test(file))
    .some((file) => /\bisolate\s*:\s*false\b/.test(String(readTextFile(posix.join(profile.cwd, file)))));

  return declared || isolationFromAngularBuilder(profile)?.isolated === false;
}

export function checkModuleMockLeak(profile: Profile, graph: SourceGraph): Finding[] {
  if (!sharesEnvironment(profile)) {
    return [];
  }

  const known = new Set(profile.files);
  const byModule = new Map<string, Map<MockKind, string[]>>();

  for (const [file, text] of graph.texts) {
    if (!isSpecFile(file)) {
      continue;
    }

    for (const { specifier, kind } of mockCalls(text)) {
      const key = resolveRelative(file, specifier, known) ?? specifier;
      const kinds = byModule.get(key) ?? new Map<MockKind, string[]>();

      kinds.set(kind, [...(kinds.get(kind) ?? []), file]);
      byModule.set(key, kinds);
    }
  }

  return [...byModule].flatMap(([module, kinds]) => {
    const factories = kinds.get('factory') ?? [];

    return factories.length === 0
      ? []
      : (kinds.get('automock') ?? []).map((file) => ({
          check: 'module-mock-leak',
          severity: 'warning' as const,
          file,
          message: `\`${module}\` is automocked here and mocked with a factory in ${factories.slice(0, 1).join('')}${factories.length > 1 ? ` and ${factories.length - 1} more` : ''}. Under \`isolate: false\` Vitest keeps a factory mock on the module after its file ends and hands it to a later automock of the same module, so this file fails with \`No "…" export is defined on the "…" mock\` — only when the two share a worker.`,
          fix: 'Mock the module the same way in both files — a factory here too, or automock there — or call `vi.resetModules()` in this file before it imports the module.',
        }));
  });
}
