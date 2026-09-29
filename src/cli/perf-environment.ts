/**
 * `perf-environment`: the specs that could leave the DOM environment, what moving them frees, and
 * — when a shared setup file keeps every spec on the DOM — how many would be free once it is split.
 */
import { findDomFreeSpecs } from './checks/dom-free';
import type { SourceGraph } from './checks/graph';
import { DOMINATES } from './perf-config';
import type { PerfFile, Phase } from './perf-data';
import { formatMs, formatShare, shareOf } from './perf-data';
import type { Profile } from './profile';
import type { Finding } from './report';

/** How many files one finding names before it stops and counts the rest. */
export const LIST_LIMIT = 12;

/** Below this, a file's environment time is measurement noise rather than a cost worth moving. */
const FILE_FLOOR_MS = 1;

interface EnvironmentCandidate {
  readonly spec: string;
  readonly ms: number;
}

export function remainder(total: number): string {
  return total > LIST_LIMIT ? ` The ${total - LIST_LIMIT} not listed below are in the same set.` : '';
}

function nodeCandidates(specs: readonly string[], measured: ReadonlyMap<string, PerfFile>): EnvironmentCandidate[] {
  return specs
    .map((spec) => ({ spec, ms: measured.get(spec)?.environment ?? 0 }))
    .filter((entry) => entry.ms > FILE_FLOOR_MS)
    .sort((a, b) => b.ms - a.ms || a.spec.localeCompare(b.spec));
}

/**
 * What moving these specs to `node` would actually free. An environment belongs to a worker, not to
 * a file, so it is only saved when **every** file that worker ran is DOM-free; a single DOM-using
 * file left behind rebuilds it and the move buys nothing. Files of one worker carry the identical
 * `environment` value, and on Vitest 5 the same lane too, which splits two workers that collide.
 * Vitest 5.0's `workerId` cannot group them: measured, it is new for every file, even on a reused worker.
 */
function movableEnvironment(measured: ReadonlyMap<string, PerfFile>, domFree: ReadonlySet<string>): number {
  const workers = new Map<string, { ms: number; files: number; free: number }>();

  for (const [spec, file] of measured) {
    const key = `${String(file.lane)}:${file.environment}`;
    const worker = workers.get(key) ?? { ms: file.environment, files: 0, free: 0 };

    workers.set(key, { ms: worker.ms, files: worker.files + 1, free: worker.free + (domFree.has(spec) ? 1 : 0) });
  }

  return [...workers.values()].reduce((total, worker) => (worker.files === worker.free ? total + worker.ms : total), 0);
}

/** What splitting the setup files would free: the specs the rule proves DOM-free once they are out of every spec's reach. */
interface SetupSplit {
  readonly specs: number;
  readonly movable: number;
}

function setupSplitOf(profile: Profile, graph: SourceGraph, measured: ReadonlyMap<string, PerfFile>): SetupSplit {
  const freed = findDomFreeSpecs({ ...profile, setupFiles: [] }, graph).specs;

  return { specs: freed.length, movable: movableEnvironment(measured, new Set(freed)) };
}

function splitWin(split: SetupSplit): string {
  if (split.specs === 0) {
    return ' With the DOM part moved out, still no spec would be free of the DOM, so the split frees nothing yet.';
  }

  const frees =
    split.movable === 0 ? 'though none of them would yet fill a worker of its own' : `freeing ${formatMs(split.movable)} of environment`;

  return ` With the DOM part moved out, ${split.specs} spec ${split.specs === 1 ? 'file reaches' : 'files reach'} no DOM and could move to \`node\`, ${frees}.`;
}

function environmentFix(movable: number, setupFiles: readonly string[], split: () => SetupSplit): string {
  if (movable > 0) {
    return 'Move the files listed below to the `node` environment.';
  }

  return setupFiles.length === 0
    ? 'Nothing can move until a spec is proved DOM-free; the docs say what the rule reads.'
    : `Nothing can move while every spec loads ${setupFiles.map((file) => `\`${file.replace(/^\.\//, '')}\``).join(', ')}: a setup file that mentions a DOM name keeps every spec on the DOM. Move the DOM part of it into a setup file only the DOM specs load.${splitWin(split())}`;
}

export function environmentFindings(
  phases: readonly Phase[],
  profile: Profile,
  graph: SourceGraph,
  measured: ReadonlyMap<string, PerfFile>,
): Finding[] {
  if (shareOf(phases, 'environment') < DOMINATES) {
    return [];
  }

  const domFree = findDomFreeSpecs(profile, graph);
  const undecided = domFree.undecided;
  const ranked = nodeCandidates(domFree.specs, measured);
  const movable = movableEnvironment(measured, new Set(domFree.specs));
  const saving =
    movable === 0
      ? 'none of them shares a worker only with other DOM-free files, so moving them alone frees no environment'
      : `moving them frees ${formatMs(movable)}`;
  const summary =
    ranked.length === 0
      ? `No spec file could be proved DOM-free, so this names none; ${undecided} were left undecided.`
      : `${ranked.length} spec files reach no DOM, and ${saving}.${remainder(ranked.length)} ${undecided} more were left undecided.`;

  return [
    {
      check: 'perf-environment',
      severity: 'info',
      message: `Environment setup is ${formatShare(shareOf(phases, 'environment'))} of the measured CPU time, against ${formatShare(shareOf(phases, 'tests'))} in the test bodies. ${summary}`,
      fix: environmentFix(ranked.length, profile.setupFiles, () => setupSplitOf(profile, graph, measured)),
    },
    ...ranked.slice(0, LIST_LIMIT).map((entry): Finding => ({
      check: 'perf-environment-node-candidate',
      severity: 'info',
      file: entry.spec,
      message: `Mentions no DOM name and imports no package off the DOM-free list; the worker that ran it spent ${formatMs(entry.ms)} building the environment it shares with the rest of that worker's files.`,
      fix: 'Put `// @vitest-environment node` in a docblock at the top of the file, or group these specs into a project whose `environment` is `node`.',
    })),
  ];
}
