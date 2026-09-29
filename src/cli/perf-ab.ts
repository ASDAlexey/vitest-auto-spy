/**
 * `--ab-isolate`: `isolate` measured both ways instead of predicted. The phase shares said a suite
 * would gain from `isolate: false`, and on the one it was tried on it gained nothing, so the command
 * runs the suite a second time with the switch flipped and reports what the clock said.
 */
import type { CliIo } from './main';
import type { PerfRun } from './perf-data';
import { formatMs, measuredNothing, phasesOf, totalOf } from './perf-data';
import type { PerfMeasured, PerfSource } from './perf-run';
import type { Finding } from './report';

/** Runs the same suite again with every project's `isolate` set to this. */
export type IsolateRun = (isolate: boolean) => PerfSource;

/** Under this, one reading each cannot tell the two apart. */
const NOISE = 0.05;

const VM_POOLS: ReadonlySet<string> = new Set(['vmForks', 'vmThreads']);

function cpuOf(run: PerfRun): number {
  return totalOf(phasesOf(run));
}

function reading(isolate: boolean, run: PerfRun): string {
  return `\`isolate: ${String(isolate)}\` ${formatMs(run.wall)} wall clock (${formatMs(cpuOf(run))} of CPU)`;
}

function verdict(first: boolean, a: PerfRun, b: PerfRun): Pick<Finding, 'fix' | 'message'> {
  const change = a.wall === 0 ? 0 : (b.wall - a.wall) / a.wall;
  const both = `Measured both ways, one run each: ${reading(first, a)}, ${reading(!first, b)}`;

  if (Math.abs(change) < NOISE) {
    return {
      message: `${both}. The difference is within what one run of each can tell apart.`,
      fix: `Keep \`isolate: ${String(first)}\`: flipping it bought nothing measurable on this machine.`,
    };
  }

  const faster = change < 0 ? !first : first;
  const action = faster === first ? `Keep \`isolate: ${String(faster)}\`` : `Set \`isolate: ${String(faster)}\``;
  const trade = faster
    ? ''
    : ' and keep it only if peak memory stays acceptable: without isolation, every double a file creates lives until its worker ends';

  return {
    message: `${both}: \`isolate: ${String(faster)}\` is ${(Math.abs(change) * 100).toFixed(1)}% faster on the wall clock.`,
    fix: `${action}${trade}. One reading each is not a trend: run \`--ab-isolate\` once more before a config change rests on it.`,
  };
}

/**
 * The measured comparison, or a line saying why there is none. The first run is the one already
 * measured; only the flipped one is run here.
 */
export function abIsolateFindings(first: PerfMeasured, rerun: IsolateRun | undefined, io: CliIo): Finding[] {
  if (rerun === undefined) {
    io.err(
      '\nwarning  --ab-isolate needs a suite to run again, and --json alone is a past run. Add --command with the line that runs the suite.',
    );

    return [];
  }

  const pool = first.run.config?.pool;

  if (pool !== undefined && VM_POOLS.has(pool)) {
    io.err(
      `\nwarning  --ab-isolate has nothing to compare: under \`pool: '${pool}'\` every file gets a fresh context whatever \`isolate\` says.`,
    );

    return [];
  }

  const isolate = first.run.config?.isolate ?? true;

  io.out(`\nperf ab: running the suite again with \`isolate: ${String(!isolate)}\`.`);

  const second = rerun(!isolate);

  if (!second.ok) {
    io.err(`\nwarning  The \`isolate: ${String(!isolate)}\` run could not be measured, so nothing was compared.\n${second.error}`);

    return [];
  }

  if (second.runFailed || measuredNothing(second.run)) {
    return [
      {
        check: 'perf-isolation-ab',
        severity: 'warning',
        message: `With \`isolate: ${String(!isolate)}\` the suite did not pass, so there is no timing to compare: some file depends on ${isolate ? 'a fresh module graph and environment of its own' : 'state another file leaves behind'}.`,
        fix: isolate
          ? 'Keep isolation, or find the files that fail only without it: they share module state, a patched global or a DOM that nothing cleans up.'
          : 'Keep `isolate: false` only after finding the file that passes only after another one ran.',
      },
    ];
  }

  return [{ check: 'perf-isolation-ab', severity: 'info', ...verdict(isolate, first.run, second.run) }];
}
