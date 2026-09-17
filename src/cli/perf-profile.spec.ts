/**
 * Reading a CPU profile back into the lines printed under a confirmed gate finding.
 *
 * Three properties are pinned. **Attribution** — a frame belongs to a package, to the spec, to the
 * project or to the runtime, and the runner's own packages all read as `vitest`, because that is the
 * name a reader recognises. **Counting** — idle ticks are nobody's, and a function recursing through
 * one sample is counted once, or an inclusive share climbs past 100 % on its own. **Honesty about the
 * runner** — the hooks line comes from one runner frame, and without it the line is absent rather
 * than a confident 0 %.
 */
import { describe, expect, it } from 'vitest';

import type { CpuCallFrame, CpuNode, CpuProfile, ProfileSummary } from './perf-profile';
import { summariseProfile } from './perf-profile';

const CWD = '/repo';
const SPEC = '/repo/src/thing.spec.ts';

const frame = (functionName: string, url = ''): CpuCallFrame => ({ functionName, url });

interface Sample {
  /** Outermost frame first. */
  readonly stack: readonly CpuCallFrame[];
  readonly ms: number;
}

/** A profile whose tree is the union of the stacks, one sample per entry, each `ms` long. */
const profileOf = (samples: readonly Sample[]): CpuProfile => {
  const nodes: { id: number; callFrame: CpuCallFrame; children: number[] }[] = [{ id: 1, callFrame: frame('(root)'), children: [] }];
  const ids: number[] = [];

  for (const sample of samples) {
    let current = nodes[0];

    for (const step of sample.stack) {
      const existing = current?.children
        .map((id) => nodes.find((node) => node.id === id))
        .find((node) => node?.callFrame.functionName === step.functionName && node.callFrame.url === step.url);

      if (existing !== undefined) {
        current = existing;
        continue;
      }

      const created = { id: nodes.length + 1, callFrame: step, children: [] };

      nodes.push(created);
      current?.children.push(created.id);
      current = created;
    }

    ids.push(current?.id ?? 1);
  }

  const shaped: CpuNode[] = nodes;

  return { nodes: shaped, samples: ids, timeDeltas: samples.map((sample) => sample.ms * 1_000) };
};

const names = (summary: ProfileSummary, key: 'angular' | 'hottest' | 'packages' | 'project' | 'spec'): string[] =>
  summary[key].map((entry) => `${entry.name} ${Math.round(entry.share * 100)}`);

describe('summariseProfile, attribution', () => {
  it('names a package from a file URL or a plain path, a scoped one whole, and the runner as vitest', () => {
    const summary = summariseProfile(
      profileOf([
        { stack: [frame('refreshView', 'file:///repo/node_modules/%40angular/core/fesm2022/core.mjs')], ms: 40 },
        { stack: [frame('dispatch', '/repo/node_modules/jsdom/lib/events.js')], ms: 30 },
        { stack: [frame('run', 'file:///repo/node_modules/vitest/dist/chunk.js')], ms: 10 },
        { stack: [frame('spy', '/repo/node_modules/tinyspy/dist/index.js')], ms: 5 },
        { stack: [frame('pool', '/repo/node_modules/tinypool/dist/index.js')], ms: 5 },
        { stack: [frame('runner', '/repo/node_modules/@vitest/runner/dist/index.js')], ms: 5 },
        { stack: [frame('nested', '/repo/node_modules/a/node_modules/@scope/b/index.js')], ms: 5 },
      ]),
      SPEC,
      CWD,
    );

    expect(names(summary, 'packages')).toEqual(['@angular/core 40', 'jsdom 30', 'vitest 25']);
    expect(names(summary, 'hottest')).toEqual(['refreshView (@angular/core) 40', 'dispatch (jsdom) 30', 'run (vitest) 10']);
  });

  it('reads a node: URL and a frame with no URL as the runtime, and says nothing about either by name', () => {
    const summary = summariseProfile(
      profileOf([
        { stack: [frame('readFileSync', 'node:fs')], ms: 10 },
        { stack: [frame('(garbage collector)')], ms: 30 },
      ]),
      SPEC,
      CWD,
    );

    expect(names(summary, 'packages')).toEqual(['node 100']);
    expect(names(summary, 'hottest')).toEqual(['(garbage collector) 75', 'readFileSync 25']);
    expect(summary.spec).toEqual([]);
    expect(summary.project).toEqual([]);
  });

  it('tells the spec from the project, by its absolute path or by its path under the working directory', () => {
    const summary = summariseProfile(
      profileOf([
        { stack: [frame('setUpWith', SPEC), frame('Template', '/repo/src/thing.component.ts')], ms: 60 },
        { stack: [frame('keydown', 'file:///bundle/src/thing.spec.ts')], ms: 40 },
      ]),
      SPEC,
      CWD,
    );

    expect(names(summary, 'spec')).toEqual(['setUpWith 60', 'keydown 40']);
    expect(names(summary, 'project')).toEqual(['Template 60']);
    expect(names(summary, 'packages')).toEqual(['your code 60', 'the spec 40']);
  });
});

describe('summariseProfile, counting', () => {
  it('leaves idle, program and root ticks out of the total, and a sample of an unknown node too', () => {
    const profile = profileOf([
      { stack: [frame('(idle)')], ms: 500 },
      { stack: [frame('(program)')], ms: 500 },
      { stack: [frame('work', SPEC)], ms: 20 },
    ]);
    const summary = summariseProfile(
      { ...profile, samples: [...profile.samples, 1, 999], timeDeltas: [...profile.timeDeltas, 300_000, 300_000] },
      SPEC,
      CWD,
    );

    expect(summary.sampledMs).toBe(20);
  });

  it('reads a tree whose leaves carry no children list, and a package path that ends at its name', () => {
    const profile: CpuProfile = {
      nodes: [
        { id: 1, callFrame: frame('(root)'), children: [2] },
        { id: 2, callFrame: frame('main', '/repo/node_modules/bare') },
      ],
      samples: [2],
      timeDeltas: [4_000],
    };

    expect(names(summariseProfile(profile, SPEC, CWD), 'packages')).toEqual(['bare 100']);
  });

  it('counts a function recursing through one sample once', () => {
    const summary = summariseProfile(
      profileOf([{ stack: [frame('walk', SPEC), frame('walk', SPEC), frame('walk', SPEC)], ms: 10 }]),
      SPEC,
      CWD,
    );

    expect(summary.spec).toEqual([{ name: 'walk', ms: 10, share: 1 }]);
  });

  it('adds up samples of the same node, and a sample with no time delta costs nothing', () => {
    const profile = profileOf([
      { stack: [frame('work', SPEC)], ms: 10 },
      { stack: [frame('work', SPEC)], ms: 10 },
    ]);
    const summary = summariseProfile({ ...profile, samples: [...profile.samples, profile.samples[0] ?? 0] }, SPEC, CWD);

    expect(summary.sampledMs).toBe(20);
  });

  it('drops anonymous functions from every list, keeps three, and breaks a tie by name', () => {
    const summary = summariseProfile(
      profileOf([
        { stack: [frame('', SPEC)], ms: 90 },
        { stack: [frame('', '/repo/node_modules/jsdom/x.js')], ms: 90 },
        { stack: [frame('delta', SPEC)], ms: 10 },
        { stack: [frame('beta', SPEC)], ms: 10 },
        { stack: [frame('alpha', SPEC)], ms: 10 },
        { stack: [frame('gamma', SPEC)], ms: 5 },
      ]),
      SPEC,
      CWD,
    );

    expect(summary.spec.map((entry) => entry.name)).toEqual(['alpha', 'beta', 'delta']);
    expect(summary.hottest.map((entry) => entry.name)).toEqual(['alpha', 'beta', 'delta']);
  });

  it("leaves out every sample the profiler's own frames are on, the inspector call or the setup file", () => {
    const summary = summariseProfile(
      profileOf([
        {
          stack: [frame('afterAll', '/repo/node_modules/vitest-auto-spy/dist/perf-profiler.js'), frame('post', 'node:inspector')],
          ms: 400,
        },
        { stack: [frame('stop', 'node:inspector_async')], ms: 300 },
        { stack: [frame('work', SPEC)], ms: 20 },
      ]),
      SPEC,
      CWD,
    );

    expect(summary.sampledMs).toBe(20);
    expect(names(summary, 'packages')).toEqual(['the spec 100']);
  });

  it('counts the time of compiler helpers but names none of them, under a package or not', () => {
    const summary = summariseProfile(
      profileOf([
        { stack: [frame('__async', SPEC), frame('fulfilled', SPEC), frame('setUpWith', SPEC)], ms: 30 },
        { stack: [frame('step', '/repo/node_modules/tslib/tslib.js')], ms: 50 },
        { stack: [frame('__awaiter', '/repo/src/thing.component.ts'), frame('render', '/repo/src/thing.component.ts')], ms: 20 },
      ]),
      SPEC,
      CWD,
    );

    expect(summary.sampledMs).toBe(100);
    expect(names(summary, 'spec')).toEqual(['setUpWith 30']);
    expect(names(summary, 'project')).toEqual(['render 20']);
    expect(names(summary, 'hottest')).toEqual(['setUpWith 30', 'render 20']);
    expect(names(summary, 'packages')).toEqual(['tslib 50', 'the spec 30', 'your code 20']);
  });

  it('returns an empty summary for a profile that sampled no work', () => {
    expect(summariseProfile(profileOf([{ stack: [frame('(idle)')], ms: 5 }]), SPEC, CWD)).toEqual({
      sampledMs: 0,
      hooks: undefined,
      spec: [],
      project: [],
      packages: [],
      hottest: [],
      angular: [],
    });
  });
});

describe('summariseProfile, hooks', () => {
  it('takes the share under the runner hook frame', () => {
    const summary = summariseProfile(
      profileOf([
        { stack: [frame('callSuiteHook', '/repo/node_modules/@vitest/runner/dist/index.js'), frame('setUpWith', SPEC)], ms: 75 },
        { stack: [frame('runTest', '/repo/node_modules/@vitest/runner/dist/index.js'), frame('body', SPEC)], ms: 25 },
      ]),
      SPEC,
      CWD,
    );

    expect(summary.hooks).toBe(0.75);
  });

  it('reports no hooks share at all when the runner frame never appeared', () => {
    expect(summariseProfile(profileOf([{ stack: [frame('body', SPEC)], ms: 25 }]), SPEC, CWD).hooks).toBeUndefined();
  });
});

describe('summariseProfile, Angular costs', () => {
  const CORE = '/repo/node_modules/@angular/core/fesm2022/testing.mjs';

  it('names each cost once per sample, by the frame or by the package it came from, largest first', () => {
    const summary = summariseProfile(
      profileOf([
        { stack: [frame('configureTestingModule', CORE), frame('compileComponents', CORE)], ms: 30 },
        { stack: [frame('createComponent', CORE), frame('refreshView', 'file:///bundle/chunk-1.js')], ms: 20 },
        { stack: [frame('detectChangesInternal', CORE), frame('refreshView', CORE)], ms: 10 },
        { stack: [frame('compileComponent', '/repo/node_modules/@angular/compiler/fesm2022/compiler.mjs')], ms: 25 },
        { stack: [frame('getComputedStyle', '/repo/node_modules/jsdom/lib/Window.js')], ms: 15 },
      ]),
      SPEC,
      CWD,
    );

    expect(names(summary, 'angular')).toEqual([
      'change detection 30',
      'TestBed set-up 30',
      'JIT compilation 25',
      'component creation 20',
      'computed styles 15',
    ]);
  });

  it('does not take a function of the same name from anywhere else for an Angular cost', () => {
    const summary = summariseProfile(
      profileOf([
        { stack: [frame('createComponent', SPEC)], ms: 10 },
        { stack: [frame('getComputedStyle', '/repo/node_modules/happy-dom/lib/Window.js')], ms: 10 },
        { stack: [frame('compileComponent', '/repo/src/compiler.ts')], ms: 10 },
      ]),
      SPEC,
      CWD,
    );

    expect(summary.angular).toEqual([]);
  });
});
