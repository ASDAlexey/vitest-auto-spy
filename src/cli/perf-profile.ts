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

function originOf(frame: CpuCallFrame, specPath: string, specTail: string): Origin {
  const path = pathOf(frame.url);
  const pkg = packageOf(path);

  if (pkg !== undefined) {
    return { kind: 'package', name: pkg };
  }

  if (path === '' || path.startsWith('node:')) {
    return { kind: 'runtime' };
  }

  if (path === specPath || path.endsWith(specTail)) {
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

/** Self time and sample count per node: `timeDeltas[i]` is the gap before `samples[i]`, in microseconds. */
function selfTimes(profile: CpuProfile): Map<number, Subtree> {
  const self = new Map<number, Subtree>();

  profile.samples.forEach((id, index) => {
    const ms = (profile.timeDeltas[index] ?? 0) / 1_000;
    const seen = self.get(id);

    if (seen === undefined) {
      self.set(id, { ms, hits: 1 });
    } else {
      seen.ms += ms;
      seen.hits += 1;
    }
  });

  return self;
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

const HOOK_KEY = 'hook';

/** The inclusive totals a frame opens: its spec or project function, its Angular cost, the runner's hook. */
function keysOf(frame: CpuCallFrame, origin: Origin): string[] {
  const cost = angularCostOf(frame, origin);

  return [
    ...(origin.kind === 'spec' || origin.kind === 'project' ? [`${origin.kind}:${labelOf(frame)}`] : []),
    ...(cost === undefined ? [] : [`angular:${cost}`]),
    ...(frame.functionName === HOOK_FRAME ? [HOOK_KEY] : []),
  ];
}

interface Subtree {
  ms: number;
  hits: number;
}

interface Totals {
  sampledMs: number;
  /** Self time inside `@angular/compiler`. */
  jit: number;
  readonly self: Map<string, number>;
  readonly packages: Map<string, number>;
  readonly inclusive: Map<string, Subtree>;
}

interface Frame {
  readonly origin: Origin;
  readonly keys: readonly string[];
}

/**
 * One depth-first pass instead of a stack walk per sampled node. A key's inclusive total is the
 * subtree of each node holding it with no ancestor holding it too, so recursion is counted once;
 * a subtree under the profiler's own frames counts nowhere, and idle ticks count only as nothing.
 */
function walk(profile: CpuProfile, specPath: string, cwd: string): Totals {
  const self = selfTimes(profile);
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const children = new Set(profile.nodes.flatMap((node) => node.children ?? []));
  const specTail = `/${relative(cwd, specPath)}`;
  const frames = new Map<string, Frame>();
  const totals: Totals = { sampledMs: 0, jit: 0, self: new Map(), packages: new Map(), inclusive: new Map() };
  const open = new Set<string>();
  const subtrees = new Map<number, Subtree>();
  const pending: { readonly id: number; readonly excluded: boolean; readonly exit?: Exit }[] = profile.nodes
    .filter((node) => !children.has(node.id))
    .map((node) => ({ id: node.id, excluded: false }));

  for (let step = pending.pop(); step !== undefined; step = pending.pop()) {
    const node = byId.get(step.id);

    if (node === undefined) {
      continue;
    }

    if (step.exit !== undefined) {
      close(node, step.exit, subtrees, open, totals);
      continue;
    }

    const excluded = step.excluded || isProfilerOverhead(node.callFrame);
    const frame = frameOf(node.callFrame, frames, specPath, specTail);
    const counted = !excluded && !NOT_WORK.has(node.callFrame.functionName);
    const sampled = counted ? self.get(node.id) : undefined;
    const ms = sampled?.ms ?? 0;
    const subtree = { ms, hits: sampled?.hits ?? 0 };
    const owned = frame.keys.filter((key) => !open.has(key));

    subtrees.set(node.id, subtree);

    if (counted) {
      totals.sampledMs += ms;
      add(totals.packages, packageLabel(frame.origin), ms);
      add(totals.self, `${labelOf(node.callFrame)}${frame.origin.kind === 'package' ? ` (${frame.origin.name})` : ''}`, ms);

      if (frame.origin.kind === 'package' && frame.origin.name === '@angular/compiler') {
        totals.jit += ms;
      }
    }

    owned.forEach((key) => open.add(key));
    pending.push({ id: node.id, excluded, exit: { subtree, owned } });
    node.children?.forEach((child) => pending.push({ id: child, excluded }));
  }

  return totals;
}

/** A node's frame origin and keys, read once per distinct frame rather than once per node. */
function frameOf(callFrame: CpuCallFrame, frames: Map<string, Frame>, specPath: string, specTail: string): Frame {
  const id = `${callFrame.url}\n${callFrame.functionName}`;
  const known = frames.get(id);

  if (known !== undefined) {
    return known;
  }

  const origin = originOf(callFrame, specPath, specTail);
  const frame = { origin, keys: keysOf(callFrame, origin) };

  frames.set(id, frame);

  return frame;
}

/** A node left on the stack to be closed once its children are: its running subtree, and the keys it holds for them. */
interface Exit {
  readonly subtree: Subtree;
  readonly owned: readonly string[];
}

/** Leaving a node: its subtree is complete, and each key it opened takes all of it. */
function close(node: CpuNode, exit: Exit, subtrees: ReadonlyMap<number, Subtree>, open: Set<string>, totals: Totals): void {
  const { subtree, owned } = exit;

  for (const child of node.children ?? []) {
    const below = subtrees.get(child);

    subtree.ms += below?.ms ?? 0;
    subtree.hits += below?.hits ?? 0;
  }

  for (const key of owned) {
    const total = totals.inclusive.get(key) ?? { ms: 0, hits: 0 };

    open.delete(key);
    totals.inclusive.set(key, { ms: total.ms + subtree.ms, hits: total.hits + subtree.hits });
  }
}

function inclusiveOf(totals: Totals, prefix: string): Map<string, number> {
  return new Map(
    [...totals.inclusive].filter(([key]) => key.startsWith(prefix)).map(([key, total]) => [key.slice(prefix.length), total.ms]),
  );
}

export function summariseProfile(profile: CpuProfile, specPath: string, cwd: string): ProfileSummary {
  const totals = walk(profile, specPath, cwd);
  const sampledMs = totals.sampledMs;

  if (sampledMs === 0) {
    return { sampledMs: 0, hooks: undefined, spec: [], project: [], packages: [], hottest: [], angular: [] };
  }

  const angular = inclusiveOf(totals, 'angular:');
  const hook = totals.inclusive.get(HOOK_KEY);

  if (totals.jit > 0) {
    add(angular, 'JIT compilation', totals.jit);
  }

  return {
    sampledMs,
    hooks: hook === undefined || hook.hits === 0 ? undefined : hook.ms / sampledMs,
    spec: topOf(inclusiveOf(totals, 'spec:'), sampledMs),
    project: topOf(inclusiveOf(totals, 'project:'), sampledMs),
    packages: topOf(totals.packages, sampledMs),
    hottest: topOf(totals.self, sampledMs),
    angular: angularShares(angular, sampledMs),
  };
}
