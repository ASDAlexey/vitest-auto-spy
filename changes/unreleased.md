# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Release notes are taken from the root `CHANGELOG.md` (and from
> Conventional Commits only when a version has no section there yet), so nothing here is pasted
> anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v5.17.1** — the git tag, `package.json` and `CHANGELOG.md` agree._

## Staged for the next release

<!-- Add user-facing items here as work lands, mirroring `## [Unreleased]` in the root CHANGELOG. -->

### Added

- **A confirmed perf gate finding says why the file is slow.** The confirmation pass already runs each
  suspect file on its own, so that is where the reason is measured: `perf` sets
  `VITEST_AUTO_SPY_PERF_PROFILE`, the reporter adds `dist/perf-profiler.js` to every project's
  `setupFiles` for that pass only, and the profiler records a CPU profile per file through the worker's
  own `node:inspector` session at a 500 µs sampling interval — `--cpu-prof` records nothing, because a
  pool worker is terminated rather than allowed to exit. The pass also records every test body of those
  files instead of the ones over 100 ms. Under a confirmed finding the gate prints the file's slowest
  tests, the share spent in hooks against test bodies, and where the time went: in the spec, in your
  code, by package, and the hottest functions. An ordinary run never loads the profiler.
  They come as a card under the finding, one row per number in a fixed order — the two readings against
  the budget, the test count and its multiple of the median test, the slowest bodies, a bar per share —
  and a **likely cause** of at most two sentences, each fired by a rule it names (over half the time in
  hooks, one test three times the next, a DOM or framework package over 20 %, garbage collection over
  10 %). Colored in a terminal, plain under `NO_COLOR`; the finding keeps its `error` first line and
  every card line is indented, so a harness relaying findings by that shape carries the whole card.
- **`--max-file-tests <n>`** (default 2000): how many of the run's median tests a file's bodies have to
  add up to before the file is judged. See the gate fix below.

### Changed

- **`perf` ends in what would fail `--gate`, and nothing else.** The "slowest files" and "slowest test
  bodies" top-ten tables are replaced by **files over budget** (`time`, `budget`, `ms/test`,
  `vs median test`) and **test bodies over budget** (at or over `--max-test-ms`), printed after the
  findings and built from the gate's own budget functions, `--gate-only` included. On a 2 023-file
  consumer suite the old top of the list was a 234-test component spec at 8.6 ms a test and a 209-test
  service spec at 5 ms — the largest files, which nobody should open. Nothing over budget prints one
  line, left to the gate's all-clear under `--gate`. `--top` still caps the rows and `--top 0` turns
  the tables off.

### Fixed

- **`perf` counted one worker's environment once per file, and the phase was inflated by the file
  count.** Vitest measures the environment once: `_environmentTime` is a module-scope variable set
  inside `setupBaseEnvironment`, which runs per worker, and `runBaseTests` then copies it into
  `state.durations.environment` for **every** file that worker runs. `phasesOf` summed those per-file
  numbers, so one start-up was multiplied by the files behind it — on a 672-file shard across 13
  workers, **126.4 s reported against the 2.44 s actually spent, inflated 51.7×**. That share fed
  `perf-environment`, so the rule fired on arithmetic and named spec files to move to the `node`
  environment for a saving that was not there; it also distorted every other phase's share, since it
  was part of the total. Environments are now counted once per distinct value — files of one worker
  carry the identical float — and `perf-environment` reports what moving its candidates would really
  free: an environment is only saved when **every** file its worker ran is DOM-free, and the finding
  says so outright when a DOM-using neighbour means the move frees nothing.
- **The quiet verdict claimed more than the analysis checked.** With no findings `perf` ended `No
phase is over 30.0% of the total…`, but only `environment`, `import` and the three phases isolation
  pays per file have a dominance rule — `setup` and `transform` have none, and a run printing
  `setup 35.0%` got that line anyway. It now names the phases it has advice for.
- **The perf gate's file rule judged file size and runner speed instead of slowness.** A file was over
  budget when it was over `--max-file-ms` and `--factor` × the median **file**. On a 2 023-file consumer
  suite the median file is 8.9 ms and five tests, so ten times it never came near the 5 s floor and the
  floor decided alone: the same report replayed at ×1, ×3, ×6 and ×9 slowdown flagged 0, 4, 8 and 19
  files — a 209-test service spec at 5 ms a test among them — and one component spec measured 0.96 s on
  its own on a laptop and 5.62 s on its own on CI, green on one and red on the other. Splitting a file
  passed the gate. A file budget is now counted in the run's median test — the median over files of
  bodies divided by test count — as the largest of `--max-file-tests` (2000) median tests, `--factor`
  (10) × the median test for each test in the file, and `--max-file-ms` (5000), which is now only a
  floor that can spare a file and never condemn one. The same report flags nothing at any slowdown; its
  heaviest file adds up to 742 median tests against the 2000 it would take. `--factor` means per test
  now, not per file.
- **A hotspot row with a cut path sat eight columns left of its neighbours.** Padding counted the
  escape sequence around the dimmed ellipsis as visible width; widths are now counted on what the
  terminal shows.
