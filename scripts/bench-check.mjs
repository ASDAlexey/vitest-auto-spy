#!/usr/bin/env node
// Gate the self-benchmark against a committed baseline, in ratios rather than in microseconds.
//
// `npm run bench` measures, prints, and forgets. No number it produces gates anything, so a change
// that doubles the cost of a spy call is caught by whoever happens to re-read a table — which is to
// say, not caught. This closes that hole: the same results file, compared against `bench/baseline.json`.
//
// The baseline stores RATIOS, never absolute microseconds. `ubuntu-latest` is shared hardware and its
// p75 swings tens of percent between runs of identical code, so an absolute threshold has to be set
// wide enough to hide a real 15 % regression and still flaps. Every arm of a case is measured
// back-to-back in one process on one machine, so dividing by a reference arm from the SAME run
// cancels the machine out and leaves the only thing worth gating: how this arm relates to the others.
//
// The reference arm of a case is the name recorded in the baseline if there is one, otherwise the
// fastest arm of that case in this run. Nothing here knows any arm by name.
//
// Tolerance adapts to the noise the run itself reports, instead of being a flat constant:
//
//   fail when   ratio > baselineRatio × (1 + max(0.15, 2 × rme))
//
// where `rme` is that arm's relative margin of error in this run, as a fraction — the results file
// reports it in percent, so it enters as `rme / 100`. The 15 % floor is what binds on a quiet
// machine; the `2 × rme` term takes over on a loud one, where the run is already saying its own
// numbers are not worth failing a build over.
//
// Report-only is the default and always exits 0: for the first weeks this gate is calibrating itself
// rather than catching regressions, and a gate that cries wolf gets switched off. `--strict` is the
// opt-in that can fail a build. A case or arm the baseline knows and this run did not measure is
// reported and never fails — arms get renamed, and a rename is not a regression.
//
// Usage:
//   node scripts/bench-check.mjs [results.json]           compare and print; always exits 0
//   node scripts/bench-check.mjs [results.json] --strict  exit 1 when an arm is over tolerance
//   node scripts/bench-check.mjs [results.json] --update  rewrite the baseline from this run
//   node scripts/bench-check.mjs --baseline <path>        compare against another baseline file
//   node scripts/bench-check.mjs --markdown               markdown output, for a job summary
//
// The results file is what `npm run bench -- --json <path>` writes; the `bench-results.json` that
// `bench:vs` writes has the same shape and works too. Default: bench-results.self.json.

import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit, stdout, version } from 'node:process';
import { fileURLToPath } from 'node:url';

import { paint, renderHeading, renderTable, styleFor } from './bench-table.mjs';

const DEFAULT_RESULTS = 'bench-results.self.json';
const DEFAULT_BASELINE = fileURLToPath(new URL('../bench/baseline.json', import.meta.url));
const FLOOR = 0.15;
const RME_FACTOR = 2;

function usage() {
  // The file's own header, so the help and the comment cannot drift apart.
  stdout.write(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 39).join('\n').replace(/^\/\/ ?/gm, ''));
  stdout.write('\n');
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    stdout.write(`Cannot read ${path}: ${error.message}\n`);
    exit(1);
  }
}

/** Every case in the results file, each with its arms and their p75 in microseconds. */
function readGroups(path) {
  const json = readJson(path);

  return (json.files ?? []).flatMap((file) =>
    (file.groups ?? []).map((group) => ({
      title: group.fullName.replace(/^.*?>\s*/, ''),
      arms: (group.benchmarks ?? []).map((row) => ({
        name: row.name,
        microseconds: row.p75 * 1000,
        rme: row.rme,
      })),
    })),
  );
}

/**
 * The arm every other arm of this case is divided by.
 *
 * A recorded name is honoured even when it is no longer the fastest — that is the point of recording
 * it, since a new arm arriving at the top of a case would otherwise silently rebase every ratio in
 * it. The fallback is the fastest arm, so a case the baseline has never seen still gets compared.
 */
function referenceFor(group, recorded) {
  const named = recorded && group.arms.find((arm) => arm.name === recorded);

  if (named) {
    return { arm: named, resolvedBy: 'baseline' };
  }

  const fastest = group.arms.reduce((best, arm) => (arm.microseconds < best.microseconds ? arm : best));

  return { arm: fastest, resolvedBy: recorded ? 'fallback' : 'fastest' };
}

function compare(groups, baseline) {
  return groups.map((group) => {
    const recorded = baseline.cases?.[group.title];
    const { arm: reference, resolvedBy } = referenceFor(group, recorded?.reference);

    // A fallback reference means this run divided by a different arm than the baseline did, so its
    // ratios are on another scale entirely and comparing the two numbers would be arithmetic, not
    // evidence. Report them, judge none of them.
    const rebased = resolvedBy === 'fallback';

    const arms = group.arms.map((arm) => {
      const ratio = arm.microseconds / reference.microseconds;
      const expected = rebased ? undefined : recorded?.ratios?.[arm.name];
      const tolerance = Math.max(FLOOR, (RME_FACTOR * arm.rme) / 100);
      const limit = expected === undefined ? undefined : expected * (1 + tolerance);

      return {
        name: arm.name,
        isReference: arm === reference,
        rebased,
        ratio,
        rme: arm.rme,
        expected,
        tolerance,
        limit,
        violated: limit !== undefined && ratio > limit,
      };
    });

    const known = new Set(arms.map((arm) => arm.name));

    return {
      title: group.title,
      reference: reference.name,
      resolvedBy,
      arms,
      dropped: Object.keys(recorded?.ratios ?? {}).filter((name) => !known.has(name)),
    };
  });
}

function verdictFor(arm) {
  if (arm.expected === undefined) {
    return { text: arm.rebased ? 'rebased' : 'new', color: 'yellow' };
  }

  if (arm.violated) {
    return { text: 'over', color: 'red' };
  }

  return { text: 'ok', color: 'green' };
}

function renderCase(entry, style) {
  const rows = entry.arms.map((arm) => {
    const verdict = verdictFor(arm);

    return [
      arm.isReference ? `${arm.name} (reference)` : arm.name,
      `${arm.ratio.toFixed(3)}×`,
      arm.expected === undefined ? '—' : `${arm.expected.toFixed(3)}×`,
      arm.limit === undefined ? '—' : `${arm.limit.toFixed(3)}×`,
      arm.expected === undefined ? '—' : `±${(arm.tolerance * 100).toFixed(0)}%`,
      style === 'markdown' ? verdict.text : paint(verdict.text, verdict.color),
    ];
  });

  const failed = entry.arms.some((arm) => arm.violated);
  const notes = [
    entry.resolvedBy === 'fastest' ? 'Reference: fastest arm of this run — the baseline names none.' : '',
    entry.resolvedBy === 'fallback' ? 'Reference: fastest arm of this run — the arm the baseline names was not measured.' : '',
    entry.dropped.length > 0 ? `Not measured in this run: ${entry.dropped.join(', ')}.` : '',
  ].filter(Boolean);

  return [
    ...renderHeading(entry.title, style),
    '',
    ...renderTable(['arm', 'ratio now', 'baseline', 'limit', 'tolerance', 'verdict'], rows, {
      style,
      color: style === 'markdown' ? undefined : failed ? 'red' : 'green',
    }),
    ...(notes.length > 0 ? ['', ...notes] : []),
    '',
  ];
}

/** Alphabetical everywhere, so a re-generated baseline diffs to the lines that actually moved. */
function buildBaseline(groups, previous) {
  const cases = {};

  for (const group of [...groups].sort((a, b) => a.title.localeCompare(b.title))) {
    const { arm: reference } = referenceFor(group, previous.cases?.[group.title]?.reference);
    const ratios = {};

    for (const arm of [...group.arms].sort((a, b) => a.name.localeCompare(b.name))) {
      ratios[arm.name] = Number((arm.microseconds / reference.microseconds).toFixed(4));
    }

    cases[group.title] = { reference: reference.name, ratios };
  }

  return {
    generated: {
      date: new Date().toISOString().slice(0, 10),
      node: version,
      command: `npm run bench -- --json ${DEFAULT_RESULTS} --no-memory && npm run bench:check -- ${DEFAULT_RESULTS} --update`,
    },
    cases,
  };
}

function main() {
  const args = argv.slice(2);

  if (args.includes('-h') || args.includes('--help')) {
    usage();
    exit(0);
  }

  const known = new Set(['--strict', '--update', '--markdown', '--baseline']);
  const baselineIndex = args.indexOf('--baseline');
  const positionals = args.filter((arg, index) => !arg.startsWith('-') && !(baselineIndex !== -1 && index === baselineIndex + 1));
  const stray = args.find((arg) => arg.startsWith('-') && !known.has(arg));

  if (stray) {
    stdout.write(`Unknown argument "${stray}". Known flags: --strict, --update, --baseline <path>, --markdown.\n`);
    exit(1);
  }

  const resultsPath = positionals[0] ?? DEFAULT_RESULTS;
  const baselinePath = baselineIndex === -1 ? DEFAULT_BASELINE : args[baselineIndex + 1];
  const strict = args.includes('--strict');
  const style = styleFor(stdout, args);
  const groups = readGroups(resultsPath);

  if (groups.length === 0) {
    stdout.write(`No benchmark groups in ${resultsPath}.\n`);
    exit(1);
  }

  if (args.includes('--update')) {
    let previous = { cases: {} };

    try {
      previous = JSON.parse(readFileSync(baselinePath, 'utf8'));
    } catch {
      previous = { cases: {} };
    }

    writeFileSync(baselinePath, `${JSON.stringify(buildBaseline(groups, previous), undefined, 2)}\n`);
    stdout.write(`Wrote ${groups.length} cases to ${baselinePath}.\n`);
    exit(0);
  }

  const baseline = readJson(baselinePath);
  const entries = compare(groups, baseline);
  const violations = entries.flatMap((entry) => entry.arms.filter((arm) => arm.violated).map((arm) => `${entry.title} › ${arm.name}`));
  const stale = baseline.generated ? `Baseline measured ${baseline.generated.date} on Node ${baseline.generated.node}.` : 'Baseline carries no provenance.';

  stdout.write(
    [
      '',
      ...renderHeading('Self-benchmark against the baseline', style, 2),
      '',
      `Ratios against each case's reference arm, from ${resultsPath}. ${stale}`,
      `Limit is the baseline ratio plus max(15%, 2 × rme) — over it is a regression.`,
      '',
      ...entries.flatMap((entry) => renderCase(entry, style)),
      violations.length === 0
        ? 'No arm is over its limit.'
        : `${violations.length} arm(s) over the limit: ${violations.join('; ')}.`,
      strict || violations.length === 0 ? '' : 'Report-only mode; run with --strict to fail on this.',
      '',
    ].join('\n'),
  );

  exit(strict && violations.length > 0 ? 1 : 0);
}

main();
