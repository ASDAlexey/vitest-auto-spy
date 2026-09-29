/**
 * A suite's own capture of Vitest's mock registry, the `Set.prototype.forEach` trick behind
 * `pruneMockRegistry`, written by hand.
 *
 * The library registers one `vi.fn()` of its own whose `mockClear` sweeps every auto-spy, and marks it
 * with `Symbol.for('vitest-auto-spy.sweepSentinel')`. A pruner that drops it from the registry leaves
 * `vi.clearAllMocks()` and `clearMocks: true` clearing every `vi.fn()` and no auto-spy — silently,
 * until call counts start leaking from one test into the next.
 */
import type { Profile } from '../profile';
import type { Finding } from '../report';
import { type SourceGraph, type TextPass, inOnePass } from './graph';
import { codeOnly } from './literals';
import { declaredUpTree } from './vitest-5-facts';

const PATCHES_FOR_EACH = /\bSet\.prototype\.forEach\s*=|\bSet\.prototype\s*,\s*["']forEach["']/;
const SENTINEL = 'vitest-auto-spy.sweepSentinel';

export function checkMockRegistryCapture(profile: Profile, graph: SourceGraph): Finding[] {
  return inOnePass(graph, [mockRegistryCapturePass(profile)]);
}

export function mockRegistryCapturePass(profile: Profile): TextPass | undefined {
  if (!declaredUpTree(profile, 'vitest-auto-spy')) {
    return undefined;
  }

  const findings: Finding[] = [];

  return {
    visit: (file, text): void => {
      if (PATCHES_FOR_EACH.test(text) && /\bclearAllMocks\b/.test(codeOnly(text)) && !text.includes(SENTINEL)) {
        findings.push(finding(file));
      }
    },
    finish: (): Finding[] => findings,
  };
}

function finding(file: string): Finding {
  return {
    check: 'mock-registry-capture-drops-sentinel',
    severity: 'warning',
    file,
    message: `Captures Vitest's mock registry by hand and never mentions \`Symbol.for('${SENTINEL}')\`: a prune that drops that entry turns \`vi.clearAllMocks()\` and \`clearMocks: true\` into a no-op for every auto-spy.`,
    fix: `Skip the entry that carries it — \`if (Symbol.for('${SENTINEL}') in mock) continue;\` — or replace the capture with \`setupAutoSpy({ pruneMockRegistry: true })\`, which keeps it. On Vitest 5 there is no growing registry to prune, and the capture can go.`,
  };
}
