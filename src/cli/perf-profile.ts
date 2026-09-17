/**
 * Where a slow file's time went, read out of the CPU profile its confirmation pass recorded.
 *
 * A gate finding used to end at "this file is over budget", and the one thing a reader then needs —
 * what in it is slow — took a profiler, a scratch spec and an afternoon. The confirmation pass
 * already runs the file on its own, so that is where the profile is taken (`perf-profiler.ts`), and
 * this module turns it into four lines a reader can act on: the hooks against the bodies, the spec's
 * own functions, the project code under them, and the packages underneath that.
 *
 * Every share is of the time the profile **sampled**, minus the idle and program ticks, and a
 * function is counted once per sample however deep it recurses. Inclusive shares therefore add up to
 * more than 100 % across lines — `setUpWith` contains `detectChanges` — which is what a reader asking
 * "where does it spend it" expects.
 */
import { relative } from 'node:path';

export interface CpuCallFrame {
  readonly functionName: string;
  readonly url: string;
  readonly lineNumber?: number;
}

export interface CpuNode {
  readonly id: number;
  readonly callFrame: CpuCallFrame;
  readonly children?: readonly number[];
}

/** The shape `Profiler.stop` returns and `.cpuprofile` files carry — only the fields read here. */
export interface CpuProfile {
  readonly nodes: readonly CpuNode[];
  readonly samples: readonly number[];
  readonly timeDeltas: readonly number[];
}

export interface Share {
  readonly name: string;
  readonly ms: number;
  readonly share: number;
}

export interface ProfileSummary {
  /** Sampled time, idle and program ticks left out. */
  readonly sampledMs: number;
  /** Share spent inside a `beforeAll`/`beforeEach`/`afterEach`/`afterAll`, or `undefined` when the runner's frames were not recognised. */
  readonly hooks: number | undefined;
  readonly spec: readonly Share[];
  readonly project: readonly Share[];
  readonly packages: readonly Share[];
  readonly hottest: readonly Share[];
  /** Angular's own costs by kind, largest first; empty when no Angular frame was sampled. */
  readonly angular: readonly Share[];
}

/** Ticks that are not anybody's code. Garbage collection stays: an allocation-heavy fixture pays it. */
const NOT_WORK = new Set(['(idle)', '(program)', '(root)']);

/** The function Vitest's runner calls every suite hook through. Its absence turns the hooks line off, not into a zero. */
const HOOK_FRAME = 'callSuiteHook';

const TOP = 3;

/**
 * Functions a compiler emits around the code a reader wrote. Under a bundler every `async` spec body
 * runs through `__async` and `fulfilled`, so they top every inclusive list and name nothing anyone
 * can change. Their time still counts; only the names are left out of the lists.
 */
const COMPILER_HELPERS = new Set([
  '__async',
  'fulfilled',
  'rejected',
  'step',
  '__awaiter',
  '__generator',
  'asyncGeneratorStep',
  '_asyncToGenerator',
  '_next',
  '_throw',
  '__spreadValues',
  '__spreadProps',
  '__decorateClass',
  '__decorate',
  '__esm',
  '__commonJS',
]);

/** The profiler's own frames: the inspector call that stops it, and the setup file that makes that call. */
function isProfilerOverhead(frame: CpuCallFrame): boolean {
  return frame.url.startsWith('node:inspector') || frame.url.endsWith('perf-profiler.js');
}

const RUNNER_PACKAGES = new Set(['vitest', 'tinypool', 'tinyspy']);

export type AngularCost = 'change detection' | 'component creation' | 'computed styles' | 'JIT compilation' | 'TestBed set-up';

/** Names unique to Angular count wherever the frame comes from — the unit-test builder bundles packages into chunks. */
const ANGULAR_FRAMES: ReadonlyMap<string, AngularCost> = new Map([
  ['configureTestingModule', 'TestBed set-up'],
  ['compileComponents', 'TestBed set-up'],
  ['resetTestingModule', 'TestBed set-up'],
  ['initTestEnvironment', 'TestBed set-up'],
  ['overrideComponent', 'TestBed set-up'],
  ['overrideModule', 'TestBed set-up'],
  ['overrideTemplateUsingTestingModule', 'TestBed set-up'],
  ['detectChangesInternal', 'change detection'],
  ['detectChangesInViewWhileDirty', 'change detection'],
  ['refreshView', 'change detection'],
]);

function pathOf(url: string): string {
  return url.startsWith('file://') ? decodeURIComponent(url.slice('file://'.length)) : url;
}

/** `@scope/name` or `name` of the last `node_modules` segment, and `vitest` for the runner's own packages. */
export function packageOf(path: string): string | undefined {
  const at = path.lastIndexOf('/node_modules/');

  if (at === -1) {
    return undefined;
  }

  const segments = path.slice(at + '/node_modules/'.length).split('/');
  const name = segments.slice(0, segments[0]?.startsWith('@') === true ? 2 : 1).join('/');

  return RUNNER_PACKAGES.has(name) || name.startsWith('@vitest/') ? 'vitest' : name;
}

type Origin = { readonly kind: 'package'; readonly name: string } | { readonly kind: 'project' | 'runtime' | 'spec' };

function originOf(frame: CpuCallFrame, specPath: string, cwd: string): Origin {
  const path = pathOf(frame.url);
  const pkg = packageOf(path);

  if (pkg !== undefined) {
    return { kind: 'package', name: pkg };
  }

  if (path === '' || path.startsWith('node:')) {
    return { kind: 'runtime' };
  }

  if (path === specPath || path.endsWith(`/${relative(cwd, specPath)}`)) {
    return { kind: 'spec' };
  }

  return { kind: 'project' };
}

function labelOf(frame: CpuCallFrame): string {
  return frame.functionName === '' ? '(anonymous)' : frame.functionName;
}

function add(totals: Map<string, number>, key: string, ms: number): void {
  totals.set(key, (totals.get(key) ?? 0) + ms);
}

function topOf(totals: ReadonlyMap<string, number>, sampledMs: number): Share[] {
  return [...totals]
    .filter(([name]) => !name.startsWith('(anonymous)') && !COMPILER_HELPERS.has(name.replace(/ \(.*$/, '')))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP)
    .map(([name, ms]) => ({ name, ms, share: ms / sampledMs }));
}

function angularShares(totals: ReadonlyMap<string, number>, sampledMs: number): Share[] {
  return [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, ms]) => ({ name, ms, share: ms / sampledMs }));
}

/** Self time per sample node: `timeDeltas[i]` is the gap before `samples[i]`, in microseconds. */
function selfTimes(profile: CpuProfile): Map<number, number> {
  const self = new Map<number, number>();

  profile.samples.forEach((id, index) => {
    self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0) / 1_000);
  });

  return self;
}

/** Every node's ancestors, leaf first, by the id of the leaf. */
function stacksOf(profile: CpuProfile): (id: number) => CpuNode[] {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map<number, number>();

  for (const node of profile.nodes) {
    for (const child of node.children ?? []) {
      parent.set(child, node.id);
    }
  }

  return (id) => {
    const stack: CpuNode[] = [];

    for (let current = byId.get(id); current !== undefined; current = byId.get(parent.get(current.id) ?? -1)) {
      stack.push(current);
    }

    return stack;
  };
}

function packageLabel(origin: Origin): string {
  if (origin.kind === 'package') {
    return origin.name;
  }

  return origin.kind === 'spec' ? 'the spec' : origin.kind === 'project' ? 'your code' : 'node';
}

function angularCostOf(frame: CpuCallFrame, origin: Origin): AngularCost | undefined {
  const named = ANGULAR_FRAMES.get(frame.functionName);

  if (named !== undefined) {
    return named;
  }

  if (origin.kind !== 'package') {
    return undefined;
  }

  if (origin.name === '@angular/core' && frame.functionName === 'createComponent') {
    return 'component creation';
  }

  return origin.name === 'jsdom' && frame.functionName === 'getComputedStyle' ? 'computed styles' : undefined;
}

interface Inclusive {
  readonly spec: Map<string, number>;
  readonly project: Map<string, number>;
  readonly angular: Map<string, number>;
}

/** Adds one sample to every spec, project and Angular cost on its stack, once each; answers whether a hook was on it. */
function addInclusive(stack: readonly CpuNode[], ms: number, totals: Inclusive, specPath: string, cwd: string): boolean {
  const seen = new Set<string>();
  let inHook = false;

  for (const { callFrame: frame } of stack) {
    const origin = originOf(frame, specPath, cwd);
    const key = `${origin.kind}:${labelOf(frame)}`;
    const cost = angularCostOf(frame, origin);

    inHook = inHook || frame.functionName === HOOK_FRAME;

    if (!seen.has(key) && (origin.kind === 'spec' || origin.kind === 'project')) {
      add(totals[origin.kind], labelOf(frame), ms);
    }

    if (cost !== undefined && !seen.has(`angular:${cost}`)) {
      add(totals.angular, cost, ms);
      seen.add(`angular:${cost}`);
    }

    seen.add(key);
  }

  return inHook;
}

export function summariseProfile(profile: CpuProfile, specPath: string, cwd: string): ProfileSummary {
  const stackOf = stacksOf(profile);

  const spec = new Map<string, number>();
  const project = new Map<string, number>();
  const packages = new Map<string, number>();
  const hottest = new Map<string, number>();
  const angular = new Map<string, number>();
  let sampledMs = 0;
  let hookMs = 0;
  let sawRunner = false;

  for (const [id, ms] of selfTimes(profile)) {
    const stack = stackOf(id);
    const [leaf] = stack;

    if (leaf === undefined || NOT_WORK.has(leaf.callFrame.functionName) || stack.some((node) => isProfilerOverhead(node.callFrame))) {
      continue;
    }

    sampledMs += ms;

    const leafOrigin = originOf(leaf.callFrame, specPath, cwd);
    const inHook = addInclusive(stack, ms, { spec, project, angular }, specPath, cwd);

    if (leafOrigin.kind === 'package' && leafOrigin.name === '@angular/compiler') {
      add(angular, 'JIT compilation', ms);
    }

    add(packages, packageLabel(leafOrigin), ms);
    add(hottest, `${labelOf(leaf.callFrame)}${leafOrigin.kind === 'package' ? ` (${leafOrigin.name})` : ''}`, ms);
    sawRunner = sawRunner || inHook;
    hookMs += inHook ? ms : 0;
  }

  return sampledMs === 0
    ? { sampledMs: 0, hooks: undefined, spec: [], project: [], packages: [], hottest: [], angular: [] }
    : {
        sampledMs,
        hooks: sawRunner ? hookMs / sampledMs : undefined,
        spec: topOf(spec, sampledMs),
        project: topOf(project, sampledMs),
        packages: topOf(packages, sampledMs),
        hottest: topOf(hottest, sampledMs),
        angular: angularShares(angular, sampledMs),
      };
}
