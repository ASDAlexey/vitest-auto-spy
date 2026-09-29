import type { PerfOptions } from './perf';
import { file, run } from './perf-fixtures';
import { GATE_DEFAULTS } from './perf-gate';
import type { CpuProfile } from './perf-profile';
import { summariseProfile } from './perf-profile';
import type { PerfSource, Remeasure } from './perf-run';

export const SLOW_FILE_SHAPE = { tests: 9_000, testCount: 30 };

/** Two samples of 3 ms: one inside a hook through `setUp` in the spec, one in a package. */
export function profileOf(specPath: string): CpuProfile {
  return {
    nodes: [
      { id: 1, callFrame: { functionName: '(root)', url: '' }, children: [2, 5] },
      { id: 2, callFrame: { functionName: 'callSuiteHook', url: '/repo/node_modules/@vitest/runner/dist/index.js' }, children: [3] },
      { id: 3, callFrame: { functionName: 'setUp', url: specPath }, children: [4] },
      { id: 4, callFrame: { functionName: 'refreshView', url: '/repo/node_modules/@angular/core/fesm2022/core.mjs' } },
      { id: 5, callFrame: { functionName: 'render', url: specPath } },
    ],
    samples: [4, 5],
    timeDeltas: [3_000, 3_000],
  };
}

export function createHooksRemeasureSource(specPath: string, root: string): PerfSource {
  return {
    ok: true,
    runFailed: false,
    run: run({
      root,
      files: [
        file(specPath, {
          tests: 8_000,
          testCount: 30,
          cases: [
            { name: 'renders', ms: 40 },
            { name: 'opens the menu', ms: 90 },
            { name: 'closes it', ms: 60 },
            { name: 'focuses', ms: 10 },
            { name: 'blurs', ms: 10 },
          ],
        }),
      ],
    }),
    profiles: new Map([[specPath, summariseProfile(profileOf(specPath), specPath, root)]]),
  };
}

export function gateOptions(remeasure: Remeasure): PerfOptions {
  return { gate: { options: GATE_DEFAULTS, remeasure, trustSingle: false } };
}
