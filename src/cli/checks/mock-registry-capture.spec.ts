import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import type { Finding } from '../report';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { buildGraph } from './graph';
import { checkMockRegistryCapture } from './mock-registry-capture';

afterEach(() => {
  removeTempRepos();
});

const CAPTURE = [
  'const original = Set.prototype.forEach;',
  'Set.prototype.forEach = function (callback) { registry = this; return original.call(this, callback); };',
  'vi.clearAllMocks();',
  'Set.prototype.forEach = original;',
].join('\n');

const findingsIn = (files: Record<string, string>, dependencies: object = { 'vitest-auto-spy': '^5' }): Finding[] => {
  const profile = readProfile(createTempRepo({ 'package.json': JSON.stringify({ devDependencies: dependencies }), ...files }));

  return checkMockRegistryCapture(profile, buildGraph(profile));
};

describe('checkMockRegistryCapture', () => {
  it('reports a hand-rolled registry capture that never names the sweep sentinel', () => {
    const findings = findingsIn({ 'src/prune-mocks.ts': CAPTURE });

    expect(findings).toEqual([
      expect.objectContaining({ check: 'mock-registry-capture-drops-sentinel', severity: 'warning', file: 'src/prune-mocks.ts' }),
    ]);
    expect(findings[0]?.fix).toContain("if (Symbol.for('vitest-auto-spy.sweepSentinel') in mock) continue;");
  });

  it('reads the defineProperty form too', () => {
    const text = "Object.defineProperty(Set.prototype, 'forEach', { value: capture });\nvi.clearAllMocks();";

    expect(findingsIn({ 'src/a.ts': text })).toHaveLength(1);
  });

  it('stays quiet when the capture keeps the sentinel, never clears, or the library is not in use', () => {
    expect(findingsIn({ 'src/a.ts': `${CAPTURE}\nconst keep = Symbol.for('vitest-auto-spy.sweepSentinel');` })).toEqual([]);
    expect(findingsIn({ 'src/a.ts': 'Set.prototype.forEach = patched;\n// vi.clearAllMocks()' })).toEqual([]);
    expect(findingsIn({ 'src/a.ts': CAPTURE }, { vitest: '^4' })).toEqual([]);
  });
});
