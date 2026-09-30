---
title: The CLI — doctor, perf and init
description: npx vitest-auto-spy is a command line tool that ships with the package. doctor finds test-setup mistakes that never fail a run, perf shows where test time goes and can fail CI over a slow test, init points coding agents at the library, and ng-test adds shards and changed-only runs to the Angular builder.
---

# The CLI

The package ships a command line tool, `npx vitest-auto-spy`. It checks your test setup for silent
mistakes, shows where test time goes, and tells coding agents how to use the library. It needs no
config file, no network and no token.

```bash
npx vitest-auto-spy doctor
```

| Command                                                                          | Use it when                                                       | Writes files             |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------ |
| [`doctor`](#doctor-—-defects-that-never-fail)                                    | you want to find setup mistakes that leave the run green          | never                    |
| [`perf`](#perf-—-where-the-cpu-time-actually-goes)                               | the suite is slow and you want to know which files to fix         | never                    |
| [`perf --gate`](#the-gate)                                                       | CI should fail when a test or a file gets slow                    | never                    |
| [`init`](#init-—-the-pointer-an-agent-actually-reads)                            | coding agents in your repository should know about the library    | yes, between its markers |
| [`codemod`](#codemod)                                                            | you migrate a suite off `jest-auto-spies` or `jasmine-auto-spies` | only with `--write`      |
| [`ng-test`](#ng-test-—-sharding-and-changed-only-runs-under-the-angular-builder) | you run tests through the Angular builder and need shards         | never                    |

Ready-made GitLab and GitHub jobs are in [In CI](#in-ci). Every `doctor` and `perf` finding ends in a `Docs:` line that links to its entry on this page.

## Exit codes

Every command uses the same exit codes, so each one fits in a single CI line. The one exception:
when `ng-test` hands the run to `ng`, it exits with `ng`'s code.

| Exit | Meaning                                                                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | The command ran and has nothing to report                                                                                                                                   |
| `1`  | It found something: a `doctor` error or warning (by default), a span `codemod` left for you, an outdated block under `init --check`, a confirmed budget under `perf --gate` |
| `2`  | It could not do the job: an unknown command, flag or flag value, a path that matches no file, nothing for `perf` to judge, or an `ng-test` it cannot set up (list below)    |

Exit 2 means the command had nothing it could judge: the command line or the environment was wrong,
or (under `perf --gate`) the suite itself failed. It never means "too slow" or "a setup mistake". It
covers:

- an unknown command, or a flag the command does not take — the error names the flag and suggests the
  one you most likely meant;
- a flag value the command cannot use: `--min-severity loud`, `--max-test-ms abc` or `-5`, `--cwd`
  with no directory after it, an `--ignore` id that is not a `doctor` check;
- an unknown transform id on `codemod --only` / `--skip`, or a `codemod` path that matches no file;
- a `perf` run with nothing to judge, including a failed suite under `--gate`
  ([details](#when-there-is-nothing-to-read));
- an `ng-test` run with no unit-test target, without `--list-tests` support, without `@angular/cli`,
  with a failed `git diff`, with several targets and no `--target`, or with an `--include` list too
  long for the platform.

The command stops before it reads or writes anything and prints `Nothing ran.`. It never falls back
to a default: a typo such as `perf --gat` would otherwise pass CI with no gate at all.

## `doctor` — defects that never fail

`doctor` finds mistakes in your test setup that leave the suite green. A tsconfig pattern that
matches no file, a config for a runner you removed, a helper promise nobody awaited: tests pass,
`tsc` reports zero errors, and the mistake stays for years. Most of them span several files, so a
linter cannot see them.

```bash
npx vitest-auto-spy doctor
```

`doctor` only reads. It never edits a file and has no `--fix`. It exits 1 when it finds an error or
a warning; by default a note does not fail the run.

### Read the doctor report

```
$ npx vitest-auto-spy doctor
vitest-auto-spy doctor — /work/app
1284 files scanned, 212 of them spec files — runner: vitest, entry: vitest-auto-spy/angular

error  tsconfig-glob-matches-nothing libs/users/tsconfig.spec.json
       The "include" pattern "src*.spec.ts" matches no file.
       → A pattern that matches nothing type-checks nothing, and `tsc --noEmit` still reports
         zero errors. Fix the glob or delete the entry.
       Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/cli#tsconfig-glob-matches-nothing

3 errors, 4 warnings, 1 note
```

Each finding has four parts:

1. **Severity and check id** — `error`, `warn` or `info`, then the id, then the file.
2. **What it found**, in one or two sentences.
3. **The fix**, after `→`.
4. **`Docs:`** — a link to the check's entry in [Doctor checks](#doctor-checks).

When several files have the same problem with the same fix, `doctor` prints them as one block: the
message once, the files under it, then the fix once.

```
info   tsconfig-glob-matches-nothing — 6 files
       The "include" pattern "src/**/*.spec.ts" matches no file, and there is no
       "*.spec.ts" beside this config for it to miss.
         libs/subscription-recovery/data/tsconfig.spec.json
         libs/subscription-recovery/domain/tsconfig.spec.json
         …
       → Nothing is unchecked today: the entry starts matching when the first
         such file is written. Delete it only if none ever will be.
       Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/cli#tsconfig-glob-matches-nothing
```

The report always ends with the tally line, even on a clean run. Text wraps to the terminal width,
or to 80 columns in a pipe or a CI log; set `COLUMNS` to change it. Paths and URLs are never cut.

### Choose what prints and what fails

Three flags shape the report. `perf` takes the first two as well.

| Flag                   | Default   | What it does                                                                                              |
| ---------------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| `--min-severity <lvl>` | `info`    | Hides findings below this level from the printed report. The tally still counts them; exit code unchanged |
| `--fail-on <lvl>`      | `warning` | The lowest level that exits 1                                                                             |
| `--ignore <check,…>`   | —         | Removes these check ids from the report, the tally, the exit code and `--code-quality`                    |

A level is `error`, `warning` or `info`; `--fail-on` also accepts `warn`.

```bash
npx vitest-auto-spy doctor --min-severity warning   # hide notes; the tally still counts them
npx vitest-auto-spy doctor --fail-on error          # warnings print but do not fail the job
npx vitest-auto-spy doctor --fail-on info           # a note fails the job too
npx vitest-auto-spy doctor --ignore angular-build-splitting-off
```

With `--min-severity`, the tally line tells you what was hidden:

```
0 errors, 1 warning, 3 notes (3 not shown: --min-severity warning)
```

Use `--ignore` only for a finding your repository has already answered in a way `doctor` cannot see
— for example `angular-build-splitting-off` on a builder you patched to split code again. It hides the
finding completely. An id that is not a `doctor` check stops the run with exit 2 and suggests the id
you most likely meant.

By default `perf` fails only on its gate. With `--fail-on`, a `perf` finding at or above that level
exits 1 too.

### Output for scripts and merge requests

| Flag                    | Output                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `--format json`         | One JSON document on stdout, with every finding, whatever `--min-severity` says       |
| `--format markdown`     | The same document as markdown tables, for a merge request note or a CI job summary    |
| `--code-quality <path>` | A [GitLab Code Quality](https://docs.gitlab.com/ci/testing/code_quality/) report file |

All three work on `doctor` and `perf`, and keep the exit code of the text run.

**GitLab merge request widget.** Point `artifacts:reports:codequality` at the file. The widget then
lists which findings are new and which were fixed against the target branch. It works on every
GitLab tier, needs no token and no outside service.

```yaml
doctor:
  script: npx vitest-auto-spy doctor --code-quality gl-code-quality.json
  artifacts:
    when: always
    reports:
      codequality: gl-code-quality.json
```

The file carries every finding `--min-severity` prints; `--fail-on` changes only the exit code. So
`doctor --fail-on error --code-quality gl-code-quality.json` fails the job only on errors and still
shows warnings and notes in the widget.

**GitHub job summary.** Append the markdown output to `$GITHUB_STEP_SUMMARY`:

```bash
npx vitest-auto-spy doctor --format markdown >> "$GITHUB_STEP_SUMMARY"
```

Field lists and how the formats behave in detail: [Report formats](#report-formats).

## `perf` — where the CPU time actually goes

`perf` runs your suite once, reads Vitest's own per-file timings, and tells you which phase takes
the time and which files to change. Use it when the suite is slow and you do not know why.

```bash
npx vitest-auto-spy perf                        # run the whole suite and report
npx vitest-auto-spy perf src/cli                # only these files (passed to Vitest as a filter)
npx vitest-auto-spy perf --gate                 # also fail over a slow file or test
npx vitest-auto-spy perf --json out/perf.json   # read a saved report instead of running Vitest
npx vitest-auto-spy perf --out out/perf.json    # keep the report this run writes
```

Without `--gate`, `perf` only gives advice and always exits 0 after a successful analysis: a slow
suite is not a failing one. If your suite is built by the Angular builder, Nx or a script, read
[When a bare run is not your suite](#when-a-bare-run-is-not-your-suite) first.

**For CI, add `perf --gate`.** It fails only over a file or a test body that is slow compared with the
rest of the same run, re-measures it on its own first, and explains the cause from a CPU profile. See
[The gate](#the-gate).

### Read the perf report

```
$ npx vitest-auto-spy perf
vitest-auto-spy perf — /work/jsdom-app
30 test files, 50 tests, 1.36s wall clock, 16.91s of CPU time summed over the workers
median test 2ms, median file 3ms
15 lanes busy 15.2% of the 738ms span; src/calc-16.spec.ts ran alone for the last 3ms

  phase          time  share
  environment  15.23s  90.1%  ██████████████████
  transform     692ms   4.1%  ▉
  setup         445ms   2.6%  ▌
  import        293ms   1.7%  ▍
  tests         152ms   0.9%  ▏
  prepare        99ms   0.6%  ▏

info   perf-environment
       Environment setup is 90.1% of the measured CPU time, against 0.9% in the test bodies. No spec
       file could be proved DOM-free, so this names none; 30 were left undecided.
       → Nothing can move while every spec loads `src/test-setup.ts`: a setup file that mentions a
         DOM name keeps every spec on the DOM. Move the DOM part of it into a setup file only the
         DOM specs load. With the DOM part moved out, 20 spec files reach no DOM and could move to
         `node`, freeing 9.86s of environment.
       Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/cli#perf-environment

info   perf-pool
       No `pool` is set, so Vitest 5.0.2 starts a fresh `forks` process for every file and builds
       `jsdom` in each; per-file environment, setup and prepare are 93.3% of the measured CPU time.
       `pool: 'vmThreads'` keeps the workers and gives each file a new VM context instead: measured
       on 30 jsdom files, 1.4–1.85 s went to 0.83–0.88 s.
       → Try `pool: 'vmThreads'` in vitest.config.ts and keep it only if the suite stays green and
         peak memory stays acceptable: a `vm` pool keeps a worker's native modules between files, so
         cap it with `vmMemoryLimit`.
       Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/cli#perf-pool

budgets: a test body 1.00s (--max-test-ms); a file's bodies the largest of 5.00s (--max-file-ms),
  2000 median tests (--max-file-tests, 3.43s here) and 10× the median test for each of its tests
  (--factor).

Nothing over budget: no file over its budget and no test body over 1.00s. Nothing here would fail
  --gate.

0 errors, 0 warnings, 6 notes
```

Read it top to bottom:

1. **The header**: file and test counts, wall clock, and CPU time summed over all workers. CPU time is
   larger than the wall clock because workers run in parallel.
2. **The phase table**: where the CPU time went. The biggest phase is where to look.
3. **The findings**: advice for the phase that dominates, with the files to change. Each one is
   described in [Perf findings](#perf-findings).
4. **The budgets and the over-budget tables**: what `--gate` would fail. Here nothing is over.

| Phase         | What Vitest measures for each file                                                   |
| ------------- | ------------------------------------------------------------------------------------ |
| `environment` | Importing and starting the environment (`jsdom`, `happy-dom`, `node`)                |
| `prepare`     | Setting up the test harness: runner, mocks                                           |
| `import`      | Importing the test module and everything it imports, and running its suite callbacks |
| `setup`       | Importing the configured setup files                                                 |
| `tests`       | Running the test bodies and hooks                                                    |
| `transform`   | Waiting for Vite to transform modules: whole-run before Vitest 5, per file on 5      |

A phase gets findings only when it is worth your time: at least 30 % of the total and at least 5 s of
CPU time over the whole run. Below that, `perf` says so and names no files.

A few extra lines appear under the header only when they have something to say:

- `` `ng test` took 8.70s end to end, 3.50s of it outside the run Vitest timed `` — when `perf` ran the
  command itself and a second or more went to building, bundling, starting, exiting, coverage
  reports or a hang.
- `setupAutoSpy hooks 14ms, 7.2% of the tests phase` — what the library's own per-test hooks cost.
  They are timed only during a `perf` run.
- A warning when Vitest reports the run as interrupted (Ctrl-C, a signal or `--bail`).

When a file or a body is over budget, two tables list them: **files over budget** and **test bodies
over budget**. The numbers come first and the full path last, so the path stays copyable in an
80-column CI log.

```
files over budget — 2 of 2015; the gate re-measures these and fails on them
   time  budget  over  tests  ms/test  ×median  vs base  file
  1.90s   634ms  3.0×    101     19ms     9.0×     0.8×  apps/web/src/app/catalog/item-card.component.spec.ts
  1.43s   418ms  3.4×      5    285ms     136×      new  apps/web/src/app/checkout/receipt-page.factory.spec.ts
```

| Column    | Meaning                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------- |
| `time`    | The file's test bodies added up                                                                   |
| `budget`  | The file's budget in this run ([how budgets work](#the-gate))                                     |
| `over`    | `time` divided by `budget`                                                                        |
| `tests`   | Tests in the file                                                                                 |
| `ms/test` | Average body time                                                                                 |
| `×median` | Average body time against the run's median test                                                   |
| `vs base` | With `--baseline`: how many times its recorded share the file takes now, or `new` if not recorded |

Each table title counts every row over budget and says when `--top` left some out. `--top <n>` caps
the rows (default 10); `--top 0` turns both tables off. The budget flags draw the tables with or
without `--gate`, so a plain report and a gated run agree about what is over.

### When a bare run is not your suite

A bare `vitest run` reads the config in the current directory. In many repositories there is none:
the Angular builder, an Nx target or a script assembles the suite. A bare run then uses Vitest's
defaults — no `globals`, no path aliases, every `*.spec.*` in the tree — and every file fails to
collect, while the phase table still looks plausible.

`perf` checks this before it runs anything. It runs Vitest itself only when the repository has a root
`vite(st).config.*` or a `test` script that calls `vitest`; otherwise it stops. (On Vitest 2 and 3 a `vitest.workspace.*` or
`vitest.projects.*` also counts as a config; Vitest 4 stopped reading those.) It then prints the
command to use instead. A report in which no test body finished is never shown as a measurement: it
exits 2 and says how many files were collected and how many bodies ran.

**Measure your own command** with `--command`:

```bash
npx vitest-auto-spy perf --command 'npm test'
npx vitest-auto-spy perf --command 'npm test -- {paths:--include=}' --gate
```

`--command` runs the line with two environment variables set: `VITEST_AUTO_SPY_PERF_OUT` and
`VITEST_AUTO_SPY_PERF_REPORTER`. The Vitest config the command reaches must attach the reporter. Add
two lines where its `reporters` are declared:

```ts
const perf = process.env['VITEST_AUTO_SPY_PERF_REPORTER'];

reporters: perf === undefined ? ['default'] : ['default', perf],
```

**Under the Angular unit-test builder** (`@angular/build:unit-test`, or Nx's `@nx/angular:unit-test`,
which delegates to it) you edit no config. The builder takes the reporter and the file filter as
options, so the whole recipe is one command. `perf` prints it with your project and target filled in
when it refuses a bare run:

```bash
npx vitest-auto-spy perf --command 'npx ng run app:test --reporters=default --reporters="$VITEST_AUTO_SPY_PERF_REPORTER" {paths:--include=}'
npx vitest-auto-spy perf --command 'npx nx run ui:test --reporters=default --reporters="$VITEST_AUTO_SPY_PERF_REPORTER" {paths:--include=}'
```

Keep the single quotes: `$VITEST_AUTO_SPY_PERF_REPORTER` must reach the shell `perf` starts, not the
one you type in. The line works as is in a CI `script:` step. The builder watches for changes only in a
terminal, so in CI it runs once; add `--watch=false` if it keeps watching on your machine. The report
names your spec files, not the builder's bundles, so the gate works as under plain Vitest.

**`{paths}` lets the gate re-measure.** The gate puts the files it re-measures where `{paths}` stands.
`{paths:<prefix>}` puts a flag before each one, for a command that takes `--include=<glob>`:
`{paths:--include=}` becomes `--include='src/a.spec.ts' --include='src/b.spec.ts'`. Without the token
the gate cannot narrow the command and says so, instead of re-running the whole suite.

**Alternative: declare the reporter permanently**, if you cannot change the config per run. It writes nothing
unless `VITEST_AUTO_SPY_PERF_OUT` names a file, so ordinary runs pay nothing:

```ts
reporters: ['default', 'vitest-auto-spy/perf-reporter'],
```

On a builder target, pass `--reporters=vitest-auto-spy/perf-reporter`. A CI job then sets
`VITEST_AUTO_SPY_PERF_OUT` on its real test run and reads the file back with `perf --json`.

### When there is nothing to read

`perf` exits 2 when it has nothing to read. Each case prints its own message:

- no Vitest installed in `--cwd`, or the package's reporter file missing from `dist`;
- the Vitest run wrote no report — if the `--command` exited non-zero, the run failed, so make it
  pass first; if it exited 0, the config it reached does not attach the reporter, and the message
  prints [the two lines to add](#when-a-bare-run-is-not-your-suite);
- a `--json` path that does not exist, a file that is not valid JSON, JSON that is not a perf report,
  or a report format this version does not read;
- a report in which no test body ran;
- a report whose files all sit outside `--cwd` — it was measured in another checkout, so pass `--cwd`
  the directory it was measured in;
- under `--gate`, a suite that failed or did not finish.

If the suite ran but failed, a plain `perf` still prints the timings, under a warning that the run did
not pass. `--fail-on-red` turns that warning into exit 1, for a CI job whose only test step is
`perf --command`.

**A run that did not finish still leaves a report.** The reporter rewrites the report as files
finish, at most every two seconds, marked `partial: true`. After a crash, a kill or a timeout, `perf`
prints what the finished files measured, with a warning and the number of files the report holds. The
gate refuses to judge it: files it never reached are missing, so an all-clear would be false. A run
Vitest reports as interrupted (Ctrl-C, a signal or `--bail`) counts as unfinished too.

### The gate

Without flags, `perf` only advises; `--gate` is what makes it fail CI. (`--fail-on`, `--fail-on-red`
and `--fail-on-flaky` can add exit 1 for other reasons.) The gate fails over a test body or a file that is
slow compared with the rest of the same run, and only after re-measuring it on its own.

```bash
npx vitest-auto-spy perf --gate
npx vitest-auto-spy perf --gate --command 'npm test -- {paths:--include=}'   # your own harness
npx vitest-auto-spy perf --gate --gate-only src/app/cart.spec.ts,src/app/user.spec.ts
```

**What is over budget.** The gate judges only test bodies and hooks (the `tests` phase), never the
environment or imports, which depend on the machine.

- A **test body** is over budget above `--max-test-ms` (default 1000 ms).
- A **file** is over budget when its test bodies add up to more than the largest of three numbers:
  - `--max-file-tests` (2000) × the run's median test;
  - `--factor` (10) × the median test × the number of tests in the file;
  - `--max-file-ms` (5000 ms) — so a file under 5 s is never over budget.

The first two are counted in the run's own median test, so a slower CI machine does not change the
verdict. A suite that is slow everywhere has no outlier and no file finding; use `--max-wall-ms` for a
whole-run budget (off by default).

**Nothing fails on one reading.** Every candidate is re-measured on its own, through the same
`--command`. A file that is fast on its own is reported as **not reproduced** — a note, not a failure:
it was slow because it shared a worker. When re-measuring is impossible (a `--command` without
`{paths}`, or `--json` without `--command` on a report that recorded no Vitest config), the gate
reports its candidates as warnings and does not fail on them. `--no-confirm` gates on a single reading
instead.

**`--json` alone re-measures too.** The perf reporter records the Vitest config file the suite ran
with. With `--json` and no `--command`, the gate runs `vitest run --config <that file>` over the
suspects only. Reports from two configs (two suites, each with its own `vitest.config.ts`) get one run
per config, and the results are read as one:

```bash
vitest run --config libs/tooling/vitest.config.ts   # writes reports/perf-tooling.json
vitest run                                          # writes reports/perf-libs.json
npx vitest-auto-spy perf --json 'reports/perf-*.json' --gate
```

The re-measurement runs with coverage off, even when the first reading had it on. The reason:
coverage thresholds fail a run of a few files, and instrumentation is the harness's cost, not the
test's. The price: a body that is over budget only because of instrumentation comes back as not
reproduced.
A report written before the config was recorded (format version 5 or older) cannot be re-measured
this way; pass `--command`, or write the report again with this version.

```
$ npx vitest-auto-spy perf --json out/perf.json --gate --command 'npm test -- {paths:--include=}'

perf gate: re-measuring 1 file on its own before failing anything.

perf gate verdict — 1 judged, 1 fails the run
  kind  first  again  budget  verdict    where
  test  4.31s  4.05s   1.00s  confirmed  libs/a/src/lib/thing.spec.ts › Thing > waits for the retry

error  perf-gate-slow-test libs/a/src/lib/thing.spec.ts
       `Thing > waits for the retry` spent 4.31s in its body, over the 1.00s budget
       (--max-test-ms 1000). Re-measured on its own: 4.05s, still over budget.
       → A test body over a second is usually waiting rather than working: a timer nobody advanced
         (`vi.useFakeTimers()` and `vi.advanceTimersByTime`), a real request or a real animation
         frame, an `await` on something that settles on a schedule, or a fixture rebuilt from
         scratch in every case.

1 error, 0 warnings, 0 notes
```

**The verdict table** has one row per candidate:

| Column    | Meaning                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kind`    | `test`, `file`, `grew` (a baseline regression) or `run` (a whole-run budget)                                                                           |
| `first`   | The first reading                                                                                                                                      |
| `again`   | The reading on its own                                                                                                                                 |
| `budget`  | The candidate's own budget                                                                                                                             |
| `verdict` | `confirmed`, `not reproduced`, `unconfirmed` (nothing could re-measure it), `single reading` (`--no-confirm`), or `over budget` for a whole-run budget |

**A confirmed finding says why.** During the re-measurement `perf` records a CPU profile of each file.
Under the finding it prints a card: the slowest tests, hooks against test bodies, where the time went
by package and in your own code, and a likely cause.

```
error  perf-gate-slow-file libs/player/src/lib/vod/vod.component.spec.ts
       The test bodies in this file add up to 9.20s, over the 5.00s budget (…). Re-measured on its own: 8.70s, still over budget.

       ┌─ measurements ────────────────────────────────────────────────
       │ first run      9.20s   budget 5.00s   1.8× over
       │ on its own     8.70s   still over budget
       │ tests             38   242ms each   20× the median test
       ├─ slowest tests ───────────────────────────────────────────────
       │  527ms  focus > moves through the controls
       │  332ms  chapters > skips the intro
       │  291ms  chapters > hides the controls after six seconds
       ├─ where the time went · CPU profile, 8.41s sampled ────────────
       │ hooks        ███████████░░░░░░░░░ 54%   test bodies 46%
       │ by package   ██████░░░░░░░░░░░░░░  28%  jsdom
       │              █████░░░░░░░░░░░░░░░  25%  @angular/core
       │              ██░░░░░░░░░░░░░░░░░░  10%  zone.js
       │ in the spec  setUpWith 38%  ·  VodComponent_Template 17%  ·  assertFocus 8%
       │ your code    FocusGroupDirective 4%  ·  TimelineComponent_Template 3%  ·  platformFactory 1%
       │ hottest      (garbage collector) 3%  ·  onScheduleTask (zone.js) 2%  ·  refreshView (@angular/core) 2%
       ├─ likely cause ────────────────────────────────────────────────
       │ Most of the time is set-up that every test repeats: 54% is in hooks — setUpWith alone is 38%. Build what does not change once, in a beforeAll, or render less per test.
       │ The largest single cost is jsdom (28%): rendering and change detection, which grow with the size of the tree each test builds.
       └───────────────────────────────────────────────────────────────

       → Every test in this file costs many times an ordinary test of the same run. (…)
```

How to read the card:

- **measurements** — the first reading, the reading on its own, and how far over budget.
- **slowest tests** — start with the top one.
- **where the time went** — shares of the sampled CPU time. A function counts once per sample however
  deep it recurses, so the lines add up to more than 100 %: `setUpWith` includes the change detection
  under it.
- **likely cause** — at most two sentences, each from a stated rule: more than half the time in hooks,
  one test three times the next, a DOM or framework package over 20 %, garbage collection over 10 %.
  It is absent when no rule fires.

**On an Angular spec** the card adds an `angular` row: TestBed set-up (`configureTestingModule`,
`compileComponents`, `resetTestingModule`, the `override*` calls), component creation, change
detection (`refreshView`), JIT compilation (time in `@angular/compiler`) and computed styles
(`getComputedStyle` in jsdom). Four Angular causes come before the generic ones: TestBed set-up and
creation together at 30 % or more, the JIT compiler at 15 %, change detection at 30 %, computed styles
at 15 %.

```
       │ hooks        ███████████░░░░░░░░░ 54%   test bodies 46%
       │ angular      TestBed set-up 31%  ·  change detection 22%  ·  component creation 9%
       ├─ slowest imports · with everything under them ────────────────
       │   1.24s  @angular/material
       │   310ms  src/app/player/player.component.ts
       ├─ likely cause ────────────────────────────────────────────────
       │ TestBed rebuilds the testing module and the component for every test: 40% is TestBed set-up and component creation. (…)
```

**slowest imports** (Vitest 4.1 and newer) lists the spec's heaviest direct imports with everything
they pulled in: a package by name, a module by path. Setup files are marked `· setup file`. An import
whose own evaluation is smaller than the total under it shows `· self 20ms`, so a slow module stands
apart from one that is slow because of what it imports. A module another file imported first is not
listed. No config is needed; an older Vitest, or a harness whose spec is a bundled chunk, leaves the
section out.

`--profile-dir <dir>` keeps each CPU profile as a `.cpuprofile` file for Chrome DevTools or speedscope.

**The gate refuses to judge a failed run.** A failed test runs until its timeout, and 30 s of timeout
looks exactly like 30 s of slow code. A red or unfinished suite under `--gate` exits 2.

**Gate only what a branch changed.** `--gate-only` takes comma-separated paths; the gate judges only
those, and the median is still taken over the whole run.

In a terminal the card and the tables are colored. [Report formats](#report-formats) lists when color
is on. Why the gate is built this way: [Why the gate works like this](#why-the-gate-works-like-this).

### Catch slow growth with a baseline

A gate on today's numbers misses slow growth: a file that took 300 ms last month and takes 900 ms
today, under every budget the whole way. `--baseline` compares the run with a recorded one:

```bash
npx vitest-auto-spy perf --json out/perf.json --update-baseline    # record; commit the file
npx vitest-auto-spy perf --json out/perf.json --gate --baseline perf-baseline.json
```

The baseline stores each file's share of the run's median file, not milliseconds. A slower machine
raises both numbers alike, so a laptop baseline still works on a slower CI runner.

- A file regresses when its share grew at least `--baseline-factor` times (default 2) and its test
  bodies now take at least `--baseline-floor-ms` (default 500 ms). It then goes through the same
  re-measurement as any gate candidate. The message converts the share into milliseconds of this run.
- Files the baseline does not know are new; files it knows but this run did not measure belong to
  another shard. Neither fails; both are reported as drift.
- A run that did not finish is never recorded or compared: `--update-baseline` on it exits 2.

**Use a `.jsonl` history instead of one snapshot** when file shares swing from run to run. With a
`.jsonl` path, `--update-baseline` appends one line per run (the shares, the time, and the commit from
`CI_COMMIT_SHA` or `GITHUB_SHA`) and keeps the last 30. A file then regresses only when its share is
both `--baseline-factor` × its mean and above every share it was ever recorded at. It needs three
recorded runs first. The file can live in the CI cache instead of git: record on the default branch,
judge on merge requests.

```yaml
perf:
  cache:
    key: perf-history
    paths: [perf-history.jsonl]
  script:
    - npx vitest-auto-spy perf --json out/perf.json --gate --baseline perf-history.jsonl
    - if [ "$CI_COMMIT_BRANCH" = "$CI_DEFAULT_BRANCH" ]; then npx vitest-auto-spy perf --json out/perf.json --baseline perf-history.jsonl --update-baseline; fi
```

### Merge sharded reports

A sharded pipeline writes one report per job. Judged alone, each shard sees only part of the suite, so
its median is wrong. Pass `--json` a directory or a pattern to merge them first:

```bash
npx vitest-auto-spy perf --json 'coverage/**/perf-*.json' --gate
```

When merging, CPU time adds up, and the wall clock is the longest shard (they ran at the same time).
A file measured in two shards keeps the slower reading and is named. Every report is re-based onto one
root, because CI jobs often clone into different directories.

### Flags

A positional path (`npx vitest-auto-spy perf src/cli`) is passed to Vitest as a file filter; without
one, `perf` measures the whole suite.

| Flag                  | Default              | What it does                                                                                                                   |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `--cwd <dir>`         | current directory    | Run against another directory                                                                                                  |
| `--command <c>`       | —                    | Measure this shell line instead of running Vitest; `{paths}` / `{paths:<prefix>}` take the files to re-measure                 |
| `--json <path>`       | —                    | Read reports instead of running Vitest: a file, a directory, or a pattern such as `coverage/**/perf-*.json`                    |
| `--out <path>`        | temporary, deleted   | Keep the report at this path (relative to `--cwd`); a directory gets `perf-report.json` inside                                 |
| `--gate`              | off                  | Fail over a confirmed budget, exit 1                                                                                           |
| `--max-test-ms`       | `1000`               | Budget for one test body. Bodies under 100 ms are not recorded, so that is the floor                                           |
| `--max-file-ms`       | `5000`               | A file whose bodies add up to less is never a finding                                                                          |
| `--max-file-tests`    | `2000`               | How many of the run's median tests a file's bodies may add up to                                                               |
| `--factor <n>`        | `10`                 | How many times the median test one test of a file may cost                                                                     |
| `--max-wall-ms`       | off                  | A whole-run budget. Wall clock depends on the runner, so nothing derives it for you                                            |
| `--gate-only`         | —                    | Comma-separated paths the gate may judge; the median still covers the whole run                                                |
| `--no-confirm`        | —                    | Skip the re-measurement and gate on one reading. `--json` alone re-measures under the config the report recorded               |
| `--profile-dir <dir>` | —                    | Keep each re-measured file's CPU profile as `<dir>/<spec path with / as __>.cpuprofile`. Needs `--gate` without `--no-confirm` |
| `--ab-isolate`        | —                    | Run the suite again with `isolate` flipped and report both wall clocks. `--json` alone warns; with `--command` it works        |
| `--baseline <p>`      | —                    | Compare with a recorded baseline and fail on what grew. A `.jsonl` path is a history of runs                                   |
| `--update-baseline`   | `perf-baseline.json` | Record this run into the baseline instead of judging it; a `.jsonl` history keeps 30 runs                                      |
| `--baseline-factor`   | `2`                  | How many times its recorded share a file must take to regress                                                                  |
| `--baseline-floor-ms` | `500`                | A file whose bodies take less is noise, whatever its share did                                                                 |
| `--fail-on-flaky`     | off                  | A test that passed only on a retry fails the run, exit 1                                                                       |
| `--fail-on-red`       | off                  | A failed suite fails `perf` too, exit 1. Without it a red suite is a warning and `perf` exits 0                                |
| `--top <n>`           | `10`                 | Rows in the over-budget tables; `0` turns them off                                                                             |
| `--min-severity`      | `info`               | The lowest level printed. Shared with `doctor`                                                                                 |
| `--fail-on`           | only the gate fails  | The lowest level that exits 1. Shared with `doctor`                                                                            |
| `--format <f>`        | `text`               | `json` or `markdown`; the suite's own output goes to stderr. Shared with `doctor`                                              |
| `--code-quality <p>`  | —                    | Also write a GitLab Code Quality report. Shared with `doctor`                                                                  |

## `init` — the pointer an agent actually reads

`init` writes a short block into the instruction files coding agents read, pointing them at the
library's docs inside `node_modules`. Use it once per repository, and again after an upgrade. Agents
never scan your dependencies, so without this pointer they do not know the library's rules.

```bash
npx vitest-auto-spy init             # write or refresh the blocks
npx vitest-auto-spy init --dry-run   # print what would change
npx vitest-auto-spy init --check     # CI: exit 1 when a block is missing or out of date
```

The block is written for your repository, not copied from a template. `init` reads your
`package.json` and test config and writes only what is true there: the entry point for your runner and
framework, the actual setup file your tests run, and the rxjs line only when rxjs is installed.

### What it writes

**Always**, three root files and one stub:

| File                                      | Read by                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `AGENTS.md`                               | Codex, Cursor, Copilot, Cline, Windsurf, Zed, OpenCode, Qwen, Roo, Junie, Aider              |
| `CLAUDE.md`                               | Claude Code, and GLM / Kimi running inside it                                                |
| `GEMINI.md`                               | Gemini CLI, which does not read `AGENTS.md` by default                                       |
| `.claude/skills/vitest-auto-spy/SKILL.md` | Claude Code. A stub that copies the shipped skill's frontmatter and points at `node_modules` |

**Only when the tool's own directory already exists**, as rules scoped to test files, so they cost
nothing on other tasks: `.cursor/rules/`, `.github/instructions/`, `.windsurf/rules/`,
`.devin/rules/`, `.clinerules/`, `.roo/rules/`.

**Never created**: `.rules`, `.cursorrules`, `.windsurfrules`, or `.clinerules` as a file. Zed reads
the first file it finds from a list that ends in `AGENTS.md`, so creating one of them would hide the
project's whole `AGENTS.md`. If one already exists, `init` appends to it.

A `CLAUDE.md` that is a symlink to `AGENTS.md`, or that already has an `@AGENTS.md` import line, is
left alone: writing through it would duplicate the block.

What the block names comes from a scan. The setup file is the first `setupFiles` entry of an
`@angular/build:unit-test` or `@nx/angular:unit-test` target (including `nx.json` `targetDefaults`),
otherwise the Vitest config's; `sequence.setupFiles: 'list'` is an order, not a file. An Angular
repository that imports from `/angular/diagnostics`, `/angular/doubles` or `/angular/matchers`, or
still imports a name that moved there from `/angular`, gets one more line naming them.

### Run it again after an upgrade

Everything `init` writes sits between two markers:

```md
<!-- vitest-auto-spy:begin v=3.7.0 sha=90452bea -->

…

<!-- vitest-auto-spy:end -->
```

- **Text between the markers** is regenerated in full on every run. After an upgrade, `init` changes
  nothing or one hunk.
- **Text outside the markers** is never read or reformatted.
- **A block you edited by hand** no longer matches its `sha=`. `init` reports it as `edited`, warns,
  and leaves it alone; `init --check` fails on it. Move your text outside the markers, delete the
  block and run `init` again. `--uninstall` still removes an edited block. A marker without `sha=` is
  never flagged.
- **Several blocks in one file**: the first is updated, the others are removed, and the note says how
  many.
- **A file with no markers** at a path `init` owns was written by hand, and `init` never overwrites
  it. One exception is reported: a `.claude/skills/vitest-auto-spy/SKILL.md` with `name:
vitest-auto-spy` in its frontmatter is an old copy of the shipped skill. `init` lists it as `stale`
  and asks you to delete it and run `init` again; `init --check` exits 1 on it.

**`--check` compares the block, not the version stamp.** An upgrade that changes the advice fails
`--check`; an upgrade that changes only the `v=` in the marker does not. `--check` shows such a file
as `unchanged`. `--dry-run` shows it as `updated`, with the note _only the version stamp differs_. A plain `init` refreshes the stamp the next time it has another reason to write.

**Files git ignores.** If a file `init` created or updated is ignored and not tracked (listed in
`.git/info/exclude` or a global excludes file, say), its row ends with _not tracked by git, so
`git diff` will not show this change_. Without that note an empty `git diff` reads as "nothing
changed".

**All or nothing.** Each file is written to a temporary file and renamed into place. If one write
fails, the files already written are put back (or removed, if `init` created them). The failed file is
listed as `failed`, the others as `skipped` (`rolled back — <path> could not be written`), and `init`
exits 1. A file that could not be put back stays `failed` with the warning `<path> was written but
could not be put back`: restore it from git.

**Size.** The block stays under 1.6 kB. Codex reads at most `project_doc_max_bytes` (32 768 bytes by
default) of the whole `AGENTS.md` chain and cuts the rest silently, so `init` warns when the file it
appended to crosses that line.

### Flags

| Flag              | Command       | What it does                                                                                                                      |
| ----------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `--check`         | `init`        | Write nothing; exit 1 if a block is missing or out of date. The CI form                                                           |
| `--dry-run`       | `init`        | Print what would change and write nothing                                                                                         |
| `--uninstall`     | `init`        | Remove the managed blocks and delete the files `init` created                                                                     |
| `--only <paths>`  | `init`        | Touch only these targets, comma-separated; a directory selects what `init` writes under it. `--check` and `--uninstall` honour it |
| `--cwd <dir>`     | every command | Run against another directory                                                                                                     |
| `-h`, `--help`    | every command | The usage screen                                                                                                                  |
| `-v`, `--version` | every command | The installed version                                                                                                             |

`--only CLAUDE.md,.claude` keeps the block out of a tracked `AGENTS.md` and `GEMINI.md` in a
repository that ignores only its Claude files.

Each command takes the flags in its own table plus `--cwd`, `--help` and `--version`. `perf`'s flags
are in [its table](#flags); the codemod's are on [its page](/utilities/codemod#flags).

## `codemod`

`codemod` migrates a suite off `jest-auto-spies` and Jest, or off `jasmine-auto-spies` and jasmine.
It prints a diff by default and writes only with `--write`.

```bash
npx vitest-auto-spy codemod            # preview: print the diff, write nothing
npx vitest-auto-spy codemod --write    # apply it
npx vitest-auto-spy codemod --verify   # CI: fail if leftovers remain
```

It exits 1 while it left something for you to rewrite by hand. The full guide, with every transform
and flag: [The codemod](/utilities/codemod).

## `ng-test` — sharding and changed-only runs under the Angular builder

`ng test` does not pass Vitest's own flags through to the `@angular/build:unit-test` builder. `ng-test`
adds the two you miss most: running one shard of the specs, and running only the specs a change
reaches.

```bash
npx vitest-auto-spy ng-test --shard 2/4 -- --coverage  # one CI job of four
npx vitest-auto-spy ng-test --changed                  # specs your uncommitted and untracked work reaches
npx vitest-auto-spy ng-test --changed origin/main      # specs the branch reaches
npx vitest-auto-spy ng-test --related src/app/cart/cart.service.ts --dry-run
```

It lists the target's specs with `ng run <project>:<target> --list-tests` (`@angular/build` 21 or
newer), picks the ones this run gets, and passes them to the builder as `--include` paths. From
`@angular/build` 22.2 the builder compiles only the included specs, so a shard also compiles less.

| Flag                | What it does                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `--shard <i/n>`     | Run shard `i` of `n`. Split like Vitest's `--shard`: by a hash of the path, so every spec runs in exactly one shard         |
| `--changed [ref]`   | Run the specs whose imports reach a file `git diff` reports changed against `ref` (`HEAD` by default), plus untracked files |
| `--related <files>` | The same, for the comma-separated files given                                                                               |
| `--target <p[:t]>`  | The unit-test target, when the workspace has more than one                                                                  |
| `--dry-run`         | Print the `ng` command instead of running it                                                                                |
| `-- <options>`      | Passed to `ng run <project>:<target>` as typed, after `--watch=false`                                                       |

- **What "reaches" means**: relative imports, `compilerOptions.paths` aliases, and a template or a
  stylesheet through the component that names it.
- **Changes that run everything**: a config, a lockfile, `angular.json`, a `tsconfig`, or a file the
  target's `setupFiles` / `providersFile` reach. A change that reaches no spec runs nothing and exits 0.
- **Several targets**: without `--target`, the choice is ambiguous and `ng-test` exits 2, listing
  them. A lone target is used without it.
- **An `--include` after `--`** narrows what is listed.
- **A very long list** (over 32 767 characters on Windows) is folded: a directory whose specs are all
  selected becomes one `dir/**/*.spec.ts` glob. If it is still too long, `ng-test` exits 2 and asks
  for more shards or a `test.shard` in the runner config.
- **The exit code** is `ng`'s.

**Without `ng-test`**, two Vitest options still reach the builder as plain `test` keys in the runner
config (read from Angular 21). A shard set this way still compiles every spec, so `ng-test --shard` is
faster. `shard` is not in the config's type, hence the cast:

```ts
// vitest-base.config.mts — the target's runnerConfig
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    ...(process.env['VITEST_SHARD'] ? { shard: process.env['VITEST_SHARD'] } : {}),
    repeats: Number(process.env['VITEST_REPEATS'] ?? 0),
  } as never,
});
```

`VITEST_REPEATS=20 ng test --include src/app/cart` hunts a flaky test, and `VITEST_SHARD=1/4 ng test`
runs a quarter of the files. `ng-test` has no `--repeats` flag: `test.repeats` in the runner config
reaches Vitest as it is.

**Measure each shard with `perf`**, then merge the reports:

```bash
npx vitest-auto-spy perf --out perf-2.json \
  --command 'npx vitest-auto-spy ng-test --shard 2/4 -- --reporters=default --reporters="$VITEST_AUTO_SPY_PERF_REPORTER"'
npx vitest-auto-spy perf --json 'perf-*.json' --gate
```

Two Vitest tools do not work with a builder suite at all. `vitest doctor` (Vitest's own command, not
this package's `doctor`) runs Vitest without the builder, so every file fails with `describe is not defined`; use `perf --command` instead. Nested
`projects` are dropped: the builder serves one project from its own bundle, so use a second target.

## In CI

**GitLab CI**, for an Angular CLI project `app` with the test target `test`:

```yaml
doctor:
  script: npx vitest-auto-spy doctor --fail-on error --code-quality gl-code-quality.json
  artifacts:
    when: always
    reports:
      codequality: gl-code-quality.json

perf:
  script:
    - npx vitest-auto-spy perf --gate --command 'npx ng run app:test --reporters=default --reporters="$VITEST_AUTO_SPY_PERF_REPORTER" {paths:--include=}'

agent-instructions:
  script: npx vitest-auto-spy init --check

migration:
  script: npx vitest-auto-spy codemod --verify # on a suite that has been migrated
```

If Vitest runs from a root `vitest.config.*`, the `perf` line is just `npx vitest-auto-spy perf --gate`;
[When a bare run is not your suite](#when-a-bare-run-is-not-your-suite) covers Nx and scripts.

**GitHub Actions**, for a suite with a root Vitest config:

```yaml
- run: npx vitest-auto-spy doctor
- run: npx vitest-auto-spy init --check
- run: npx vitest-auto-spy codemod --verify # on a suite that has been migrated
- run: npx vitest-auto-spy perf --out perf.json # exits 0 without --gate; keep the report as an artifact
- run: npx vitest-auto-spy perf --gate # exit 1 over a confirmed slow file or test, with the reason under it
```

None of them needs a network, a config file or a token. The CLI ships with the package and has no
runtime dependencies of its own.

Every command is safe to pipe. `npx vitest-auto-spy codemod | head` closes the pipe early; the command
stops writing and exits with the code it had already decided on, without an `EPIPE` stack trace.

## Doctor checks

Every `doctor` finding links to its entry here. Each entry says what the check reports, why it
matters, and how to fix it. Checks are grouped by topic:

| Topic                                                           | Checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [TypeScript configs](#typescript-configs)                       | [`tsconfig-glob-matches-nothing`](#tsconfig-glob-matches-nothing), [`tsconfig-file-missing`](#tsconfig-file-missing)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [Spec files and imports](#spec-files-and-imports)               | [`spec-imported-by-non-spec`](#spec-imported-by-non-spec), [`spec-exports-fixture`](#spec-exports-fixture)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [Leftovers from another runner](#leftovers-from-another-runner) | [`foreign-runner-pragma`](#foreign-runner-pragma), [`dead-runner-config`](#dead-runner-config), [`orphan-runner-file`](#orphan-runner-file), [`jasmine-era-project`](#jasmine-era-project)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [Angular builder](#angular-builder)                             | [`angular-build-splitting-off`](#angular-build-splitting-off), [`angular-build-splitting-deprecated`](#angular-build-splitting-deprecated), [`angular-build-istanbul-module-cache`](#angular-build-istanbul-module-cache), [`angular-build-happy-dom`](#angular-build-happy-dom), [`angular-cache-off-in-ci`](#angular-cache-off-in-ci), [`builder-setup-unreached`](#builder-setup-unreached), [`runner-dom-differs-from-builder`](#runner-dom-differs-from-builder)                                                                                                                                                                                                                                                                                                                              |
| [Analog](#analog)                                               | [`analog-behind-angular-build`](#analog-behind-angular-build), [`analog-fast-compile-ctor-injection`](#analog-fast-compile-ctor-injection), [`analog-module-cache-inline-styles`](#analog-module-cache-inline-styles), [`analog-testbed-laxer-than-builder`](#analog-testbed-laxer-than-builder), [`angular-testbed-split`](#angular-testbed-split)                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [Mocks and shared environments](#mocks-and-shared-environments) | [`module-mock-leak`](#module-mock-leak), [`shared-env-without-restore`](#shared-env-without-restore), [`mock-reset-config-unread`](#mock-reset-config-unread), [`mock-registry-capture-drops-sentinel`](#mock-registry-capture-drops-sentinel)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [Coverage](#coverage)                                           | [`coverage-all-removed`](#coverage-all-removed), [`coverage-include-recompiles-globs`](#coverage-include-recompiles-globs), [`coverage-include-misses-bundle`](#coverage-include-misses-bundle)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [Vitest 5 upgrade](#vitest-5-upgrade)                           | [`vitest-5-removed`](#vitest-5-removed), [`vitest-5-deprecated`](#vitest-5-deprecated), [`vitest-5-clear-mocks`](#vitest-5-clear-mocks), [`vitest-5-available`](#vitest-5-available), [`fs-module-cache-not-persisted`](#fs-module-cache-not-persisted), [`vitest-5-bundled-package`](#vitest-5-bundled-package), [`vitest-5-matchers-augmentation`](#vitest-5-matchers-augmentation), [`vitest-5-nested-hoist`](#vitest-5-nested-hoist), [`vitest-5-empty-throw-message`](#vitest-5-empty-throw-message), [`vitest-5-prune-mock-registry`](#vitest-5-prune-mock-registry), [`vitest-5-project-own-server`](#vitest-5-project-own-server), [`vitest-5-extends-restated`](#vitest-5-extends-restated), [`vitest-5-report-path`](#vitest-5-report-path), [`vitest-5-vite-peer`](#vitest-5-vite-peer) |
| [This library](#this-library)                                   | [`vitest-entry-without-vitest`](#vitest-entry-without-vitest), [`helper-from-wrong-entry`](#helper-from-wrong-entry), [`no-unawaited-helper`](#no-unawaited-helper), [`no-agent-instructions`](#no-agent-instructions), [`scan-cap-reached`](#scan-cap-reached)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### TypeScript configs

#### `tsconfig-glob-matches-nothing`

**Reports** an `include` pattern in a tsconfig that matches no file. It is an error when spec files
sit beside the config, and a note for a library that has none yet.

**Why it matters:** a pattern that matches nothing type-checks nothing, and `tsc` still reports
success. The editor shows `Cannot find name 'vi'` in a spec while CI stays green.

**Fix:** correct the glob, or delete the entry.

```diff
- "include": ["src*.spec.ts"]
+ "include": ["src/**/*.spec.ts"]
```

Not reported:

- a declaration-only glob (`src/**/*.d.ts`), often a placeholder for types that do not exist yet;
- a pattern inside a directory the scan skips (`dist`, `out-tsc`, `coverage`, or one git ignores),
  even before the directory exists — a pattern into `src/generated/` is fine before the generator runs;
- an entry above the scanned directory (`../shared/**/*.ts`);
- any pattern when the scan stopped at its cap ([`scan-cap-reached`](#scan-cap-reached)).

A directory entry (`src`, `src/**/*`) counts `.vue` and `.svelte` files as well as TypeScript.

#### `tsconfig-file-missing`

**Reports** a `files` entry in a tsconfig that names a file that no longer exists.

**Why it matters:** once the test runner stops using a config, only editors read it, and nothing
reports the missing file.

**Fix:** remove the entry, or point it at the file's new path.

The file is checked on disk, so a `../` entry, a gitignored file and a capped scan are judged
correctly. Like `include`, a missing `.d.ts` (a generated `auto-imports.d.ts` or `next-env.d.ts`) and
a path inside a skipped or ignored directory are not reported.

### Spec files and imports

#### `spec-imported-by-non-spec`

**Reports** a production module that imports a `*.spec.ts` file.

**Why it matters:** in a shared environment the import is a cycle, and the spec loses its own tests.

**Fix:** move what the module needs out of the spec into an ordinary file, and import that.

#### `spec-exports-fixture`

**Reports** a spec that imports another spec.

**Why it matters:** the imported file's tests are collected twice, and its hooks run in the other
file's context.

**Fix:** move the shared fixture into a file that is not a spec.

```ts
// user.fixture.ts — not a spec, so importing it collects no tests
export const aUser = { id: 1, name: 'Ada' };
```

### Leftovers from another runner

#### `foreign-runner-pragma`

**Reports** Jest docblock pragmas left in a spec, with their line numbers.

**Why it matters:** some are read by nothing, and the rest look like a half-done migration.

**Fix:**

- `@jest-config`, and a `@jest-environment` with no name: no runner here reads them. Warning; delete
  them.
- `@jest-environment <name>` and `@jest-environment-options`: Vitest 5 and Rstest read them like the
  `@vitest-` spelling. Note; rename them.

```diff
- /** @jest-environment jsdom */
+ /** @vitest-environment jsdom */
```

#### `dead-runner-config`

**Reports** `jest.config.*` or `karma.conf.*` for a runner that is not installed. Warning.

**Why it matters:** it is the first file a newcomer, or a coding agent, reads to learn how tests run.

**Fix:** delete it.

#### `orphan-runner-file`

**Reports** a setup file that only a dead runner config referenced.

**Why it matters:** it configures nothing, yet reads like part of the test setup. One such file had
been empty for a year.

**Fix:** delete it together with the dead config.

#### `jasmine-era-project`

**Reports** a repository that still has jasmine: `jasmine-core`, `@types/jasmine`,
`jasmine-auto-spies`, `@hirez_io/observer-spy`, a `karma*` package, a `karma.conf.*` file, or
`"types": ["jasmine"]` in a tsconfig. A note, never an error.

**Why it matters:** the migration order decides whether you rewrite a green suite or a red one.

**Fix:** migrate in this order:

1. Point the specs at [`vitest-auto-spy/jasmine`](/migrating-jasmine) and make the suite green.
2. Run `codemod --from jasmine` and drop that import.

### Angular builder

#### `angular-build-splitting-off`

**Reports** `@angular/build` from 22.1.5 up to, not including, 22.1.7.

**Why it matters:** these versions build the unit-test bundle with code splitting off. With
`--coverage`, memory grows by hundreds of megabytes with no plateau and no warning: the run finishes
slowly or is killed.

**Fix:** upgrade `@angular/build` to 22.1.7 or newer, where splitting is on by default. Then remove
any `"splitting": false` from the targets the finding names (22.2.0 deprecates the option).
`setupAutoSpy()` also warns once per worker inside an affected run. Details and a workaround:
[when the unit-test build has code splitting off](/guides/angular-unit-test-builder#when-the-unit-test-build-has-code-splitting-off).

#### `angular-build-splitting-deprecated`

**Reports** a unit-test target that sets `"splitting"` on `@angular/build` 22.2.0 or newer — in its
`options`, a configuration or an Nx target default.

**Why it matters:** 22.2.0 deprecates the option ("No longer needed with Vitest 5").

- `"splitting": true` is the default and changes nothing. Note.
- `"splitting": false` still builds every spec as a self-contained bundle, with the memory cost
  [`angular-build-splitting-off`](#angular-build-splitting-off) describes. Warning.

**Fix:** remove the key from the target the finding names.

#### `angular-build-istanbul-module-cache`

**Reports** an `@angular/build:unit-test` or `@nx/angular:unit-test` target on `@angular/build` 21 or
newer and Vitest 5 that runs coverage with istanbul, while its runner config does not turn on
`fsModuleCache`. Istanbul counts when the runner config sets `coverage.provider: 'istanbul'`, or when
`@vitest/coverage-istanbul` is installed without `@vitest/coverage-v8`.

**Why it matters:** the builder has already bundled the code, so the one slow step left to cache is
istanbul's instrumentation. A warm cache took 19–46 % off such runs.

**Fix:** add `fsModuleCache: true` to the runner config the finding names. For a target without one,
add `"runnerConfig"` to the target first: the builder has no option of its own for this.

```ts
// vitest-base.config.mts — the target's runnerConfig
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { fsModuleCache: true } });
```

- If your CI does not keep `node_modules/.vitest-cache` between runs, the fix says to cache it too, as
  [`fs-module-cache-not-persisted`](#fs-module-cache-not-persisted) does. Every fresh checkout starts
  cold.
- The alternative is `coverage.provider: 'v8'`, which needs no cache. With v8 the cache gains nothing
  and the check stays quiet.
- A warm cache picked up edits to `.ts` imports and component `.html` with both providers.

Quiet on `@angular/build` 20 (no runner config), on Vitest 4 (not measured), and for a target that
runs in `browsers` unless its runner config names istanbul. Targets that share a runner config are
reported once.

#### `angular-build-happy-dom`

**Reports** a unit-test target on `@angular/build` 21 or newer that runs on jsdom only because
`happy-dom` is not installed: `jsdom` is installed, the target does not run in `browsers`, and its
runner config sets no `environment`. Note.

**Why it matters:** from 21 the builder picks happy-dom whenever it can resolve it. happy-dom is a
little faster and uses less memory.

**Fix:** install it; no config line is needed.

```bash
npm i -D happy-dom
```

happy-dom implements less of the browser platform than jsdom. Run the suite once after installing;
if a spec fails on something happy-dom lacks, uninstall it again.

#### `angular-cache-off-in-ci`

**Reports** an `angular.json` with `@angular/build:unit-test` targets, a CI config, and a build cache
CI never gets to use. Note.

**Why it matters:** `cli.cache.environment` defaults to `local`, so on every CI run the builder
compiles the whole suite from scratch.

**Fix:** turn the cache on for CI, and keep `.angular/cache` (or your `cli.cache.path`) between CI
runs, keyed on the lockfile hash.

```json
{ "cli": { "cache": { "environment": "all" } } }
```

It also fires when `environment` is already `all` or `ci` but no CI config caches the directory: every
run then starts with an empty cache. `environment: none` and `enabled: false` are taken as decisions
and not reported.

#### `builder-setup-unreached`

**Reports** an `@angular/build:unit-test` or `@nx/angular:unit-test` target whose options (including
`nx.json` `targetDefaults`) name neither `setupFiles` nor `runnerConfig`, while the project has a
setup file: its Vitest config (`vitest-base.config.*` included) lists one, or `src/test-setup.ts`
exists.

**Why it matters:** the builder never runs that setup file. Under this target, `setupAutoSpy()`, its
`strict` option, your registered matchers and the mock adapter are all missing.

**Fix:** add the `setupFiles` option to the target.

```json
"test": {
  "builder": "@angular/build:unit-test",
  "options": { "setupFiles": ["src/test-setup.ts"] }
}
```

`nx.json` `targetDefaults` can carry it for every project with the same layout. A `runnerConfig`
pointing at the Vitest config works too.

#### `runner-dom-differs-from-builder`

**Reports** a `vitest.config.*` or `vite.config.*` that sets `environment: 'jsdom'`, in a workspace
with both `jsdom` and `happy-dom` installed and a unit-test target that runs on happy-dom. Warning.

**Why it matters:** `vitest run` and your IDE read that config; the builder does not, and picks
happy-dom. The same specs run on two different DOMs, so a spec can pass under `vitest run` and fail
under `ng test` / `nx test`, or the reverse.

**Fix:** use happy-dom in both places — set `environment: 'happy-dom'` in the runner config. A spec
that needs jsdom keeps it with a comment at its top:

```ts
// @vitest-environment jsdom
```

A config at the repository root covers every target; one in a project directory covers the targets
under it. Quiet for a target that runs in `browsers`, and for the config a target names as its
`runnerConfig`, which the builder does read.

### Analog

#### `analog-behind-angular-build`

**Reports** `@angular/build` 22.2.0 or newer next to `@analogjs/vite-plugin-angular` older than 2.7.5.

**Why it matters:** the run dies at startup, before any spec is collected, with an error that names
neither package:

```
TypeError: cache.has is not a function
```

**Fix:** upgrade `@analogjs/vite-plugin-angular` and `@analogjs/vitest-angular` to 2.7.5 or newer.

The check stays quiet when either package is not installed.

#### `analog-fast-compile-ctor-injection`

**Reports** Analog's `fastCompile` turned on in JIT mode (`jit` not set to `false`, the default under
Vitest), together with an `@Injectable` class that takes a constructor parameter known only by its
type.

**Why it matters:** in that mode Analog emits no parameter metadata for `@Injectable` classes, so
Angular has no token for the parameter. `TestBed.inject`, `Injector.create` and `createWithAutoSpies`
throw NG0202 ("dependency at index N of the parameter list is invalid").

**Fix:** use one of these:

```ts
import { Inject, Injectable, inject } from '@angular/core';

@Injectable()
export class CartService {
  private readonly tax = inject(TaxService); // 1. an inject() field
}

@Injectable()
export class OrderService {
  constructor(@Inject(TaxService) private readonly tax: TaxService) {} // 2. name the token
}
```

`ng generate @angular/core:inject` migrates a whole project to option 1. The third option is to leave
`fastCompile` off until the plugin emits the metadata. Components, directives and pipes are not
affected; a parameter with `@Inject(X)` or a default value is not reported. Checked against
`@analogjs/vite-plugin-angular` 2.7.5.

#### `analog-module-cache-inline-styles`

**Reports** `fsModuleCache` turned on (top-level, under `experimental`, or `--fsModuleCache` in a
script) on Vitest 4 or newer, in a repository whose Vite or Vitest config imports
`@analogjs/vite-plugin-angular` or `@analogjs/vitest-angular` without `jit: false`, and that has a
component with inline `styles`.

**Why it matters:** in JIT mode, the plugin's default for tests, a warm cache cannot load the virtual
module for those styles. The first run passes; from the second run on, every spec that reaches such a
component fails with:

```
Cannot find module '/@id/__x00__virtual:angular:jit:style:inline;<hash>'
```

**Fix:** turn the module cache off while the suite runs through Analog.

Verified on Analog 2.7.5, Angular 22.2 and Vitest 5.0.0; the check covers every Analog version until a
release fixes it. `@angular/build:unit-test` does not have this problem, because it bundles the code
before Vitest sees it.

#### `analog-testbed-laxer-than-builder`

**Reports** a call to `setupTestBed()` from `@analogjs/vitest-angular/setup-testbed` without
`errorOnUnknownElements` or `errorOnUnknownProperties`, in a workspace that also has an
`@angular/build:unit-test` / `@nx/angular:unit-test` target. Warning.

**Why it matters:** Analog leaves both checks off unless asked; the builder turns both on. A misspelt
element or input binding then only logs under `vitest run` and fails the test under `ng test` /
`nx test`.

**Fix:** make the call the builder makes.

```ts
setupTestBed({ errorOnUnknownElements: true, errorOnUnknownProperties: true });
```

A flag written with any value counts as a decision and is not reported. A call whose options are not
an object literal is not read. A renamed import (`setupTestBed as setup`) is followed.

#### `angular-testbed-split`

**Reports** a runner config that names an Analog package, in an Angular repository where some file
imports `vitest-auto-spy/angular` or `/angular-http`, while no runner config inlines this package.
Warning.

**Why it matters:** Analog's Vitest plugin inlines `@angular/core/testing`, while Vitest externalizes
`vitest-auto-spy` (loads it from `node_modules` as is). `/angular` then gets a second `TestBed` nobody
initialised, and `injectSpy` throws even though your setup file initialises one:

```
Need to call TestBed.initTestEnvironment() first
Cannot read properties of null (reading 'ngModule')
```

**Fix:** inline the package in the `test` block.

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { server: { deps: { inline: ['vitest-auto-spy'] } } } });
```

`inline: true`, or a `noExternal` that names the package, counts as done.

### Mocks and shared environments

#### `module-mock-leak`

**Reports** a module mocked with a factory in one spec and as an automock or `{ spy: true }` in
another, when files share an environment. The finding says which setting shares it:

- `isolate: false` in a Vitest config;
- the Angular unit-test builder's default from `@angular/build` 21, unless the target's `isolate`
  option or its runner config sets `isolate: true`. 20.x keeps Vitest's per-file isolation.

**Why it matters:** Vitest hands the factory to the later automock. When the two files share a worker,
the automock fails with `No "X" export is defined on the mock`; otherwise the run passes.

**Fix:** mock the module the same way in both files, or call `vi.resetModules()` before the import.

```ts
vi.mock('./api', () => ({ fetchUser: vi.fn() })); // use this form in every spec that mocks ./api
```

The finding lists the files with a factory and names the module the way the error will.

#### `shared-env-without-restore`

**Reports** an Angular suite that uses this package and shares one environment across files, without
the `setupAutoSpy` options that clean up between files. Note. Shared means `isolate: false` in a
runner config, `--no-isolate` / `--isolate=false` in a script, or the unit-test builder's default from
Angular 21.

**Why it matters:** a `vi.spyOn`, a pending timer, a `window` listener or a hand-assigned global from
one file fails the next file, which never touched it.

**Fix:** turn on the options the finding names (it lists only those still off):

```ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ restoreMocks: true, strayTimers: true, strayListeners: true, restoreGlobals: true });
```

`preset: 'strict'` counts for `strayTimers`. Turning isolation back on for the files that leak also
fixes it.

#### `mock-reset-config-unread`

**Reports** a `no-redundant-mock-reset` lint rule entry whose options name a `configFile` and no flags,
where that file exports something other than `defineConfig(…)` / `defineProject(…)` — a factory of
your own, or `mergeConfig(…)`. Note.

**Why it matters:** the lint rule reads the config file as text, so it cannot see the flags a factory
sets. It then assumes `clearMocks` is off up to Vitest 4 and on from Vitest 5, whatever the factory
does.

**Fix:** write the flags next to `configFile`. An entry with `configFlags` is not reported.

```js
'vitest-auto-spy/no-redundant-mock-reset': ['error', { configFile: 'vitest.config.ts', configFlags: { clearMocks: true } }],
```

Only a literal `configFile` is read, resolved against the repository root.

#### `mock-registry-capture-drops-sentinel`

**Reports** a suite that captures Vitest's mock registry itself — patches `Set.prototype.forEach` (by
assignment, `defineProperty` or `vi.spyOn`) and calls `vi.clearAllMocks()` while the patch is in place
— in a file that never mentions `vitest-auto-spy.sweepSentinel`. Warning.

**Why it matters:** one registry entry is how `vi.clearAllMocks()` and `clearMocks: true` reach this
package's spies. A pruner that drops it silently stops both from clearing any auto-spy.

**Fix:** skip that entry in your pruner:

```ts
if (Symbol.for('vitest-auto-spy.sweepSentinel') in mock) continue;
```

Or replace your capture with `setupAutoSpy({ pruneMockRegistry: true })`, which keeps the entry. On
Vitest 5 the registry holds `WeakRef`s and does not grow, so you can delete the capture.

### Coverage

#### `coverage-all-removed`

**Reports** `coverage.all` in a config on Vitest 4 or newer.

**Why it matters:** Vitest 4 removed the key without a rename. Nothing reads it and nothing warns, so
the report quietly covers only the files the run imported.

**Fix:** delete it, and list the source files the report should cover in `coverage.include`.

#### `coverage-include-recompiles-globs`

**Reports** a coverage scope made of many globs on Vitest 4.

**Why it matters:** Vitest 4 compiles every glob again for every file it checks. Nothing fails; the
coverage step is just slow. Vitest 5 compiles the list once.

**Fix:** upgrade to Vitest 5. Under `@angular/build:unit-test` that needs `@angular/build` 22.2.0 or
newer, and the fix says so. On Vitest 4, use the custom-provider recipe in
[coverage matching costs more than coverage](/guides/angular-unit-test-builder#coverage-matching-costs-more-than-coverage).

#### `coverage-include-misses-bundle`

**Reports** a `coverage.include` that lists only source globs, in the runner config of an
`@angular/build:unit-test` target: the file its `runnerConfig` names, or, for `runnerConfig: true`,
the `vitest-base.config.*` in the project or workspace root.

**Why it matters:** under the builder, coverage is matched twice — first against the bundle chunks
that ran, then against the remapped sources. A list of `.ts` globs drops every counter on the first
pass, and the run stays green with an empty report.

**Fix:** see [coverage under the unit-test builder](/guides/angular-unit-test-builder#coverage-under-the-unit-test-builder).

### Vitest 5 upgrade

These checks find what breaks or changes when you move from Vitest 4 to 5. Unless an entry says
otherwise, a finding is an **error on Vitest 5** (it is broken now) and a **note on Vitest 4** (fix it
before the upgrade; the exit code does not move).

Every check reads the Vitest version from the nearest `node_modules` up the tree. It also counts
Vitest as installed when a workspace root's `package.json` declares it — the walk stops at the first
directory with a `workspaces` field, a `.git` or a `pnpm-workspace.yaml` — so `doctor` works inside a
workspace package.

#### `vitest-5-removed`

**Reports** what Vitest 5 removed:

| Found                                                      | Use instead                           |
| ---------------------------------------------------------- | ------------------------------------- |
| import from `vitest/reporters` or `vitest/coverage`        | `vitest/node`                         |
| import from `vitest/environments` or `vitest/snapshot`     | `vitest/runtime`                      |
| import from `vitest/runners` or `vitest/suite`             | `TestRunner` from `vitest`            |
| import from `vitest/mocker`                                | `@vitest/mocker`                      |
| `.sequential` on `test`, `it`, `describe` or `suite`       | `{ concurrent: false }`               |
| `--outputJson` or `--compare` in a script that runs Vitest | `--reporter=json --outputFile=<path>` |
| `benchmark.outputJson` or `benchmark.compare` in a config  | `writeResult` with `bench.from()`     |

**Why it matters:** on Vitest 5 each one breaks: the import stops resolving, collection throws, the
command stops with `Unknown option`, or the key is silently ignored.

**Fix:** use the replacement. The new imports and `{ concurrent: false }` already work on Vitest 4.1,
so the change can land before the upgrade. Before Vitest 4 the check says nothing: go through Vitest
4's own migration first. The `{ sequential: true }` test option is not read.

**Also reported:** `poolOptions` in a config on Vitest 4 or newer, as a warning. Vitest 4 removed it,
prints one deprecation line, and runs without every option inside it, so a `singleFork` or a thread
cap there does nothing. Move each option to the top-level option the Vitest 4 migration guide names.

**Not reported:**

- `test.workspace` — Vitest 4 and 5 both throw at startup and name `test.projects`, so no green suite
  has it;
- renamed keys Vitest 5 still honours (`experimental.fsModuleCache` and `experimental.fsModuleCachePath`,
  now top-level; `browser.isolate`, `browser.fileParallelism` and `browser.api`, now top-level
  `isolate`, `fileParallelism`, `api`; `deps.optimizer.web`, now `deps.optimizer.client`; `cache.dir`,
  now Vite's `cacheDir`) — Vitest 5 prints a deprecation naming the replacement on every run, and on
  Vitest 4 the new spelling does not exist yet.

#### `vitest-5-deprecated`

**Reports** `experimental_clearCache()` or `experimental_parseSpecifications()` on Vitest 5. Note.

**Why it matters:** Vitest 5 renamed them. The old names still work, but nothing warns at run time;
only the type carries `@deprecated`.

**Fix:** call `clearCache()` and `parseSpecifications()`. Quiet on Vitest 4, which has no other name.

#### `vitest-5-clear-mocks`

**Reports**, depending on the version:

- **on Vitest 5**, an explicit `clearMocks: true` in a config — it restates the default;
- **on Vitest 4**, a repository that never sets `clearMocks` (nor `mockReset: true`, which clears as
  well) in its configs and never passes `--clearMocks` in its Vitest scripts.

**Why it matters:** Vitest 5 turns `clearMocks` on by default. It calls `vi.clearAllMocks()` before
every test, which clears each mock's recorded calls and keeps its implementation. After the upgrade, a
test that counts calls made in `beforeAll` or in an earlier `it` starts failing.

**Fix:** on Vitest 5, delete the redundant line. On Vitest 4, see the cost before you upgrade:

```bash
npx vitest run --clearMocks
```

Under `@angular/build:unit-test`, set `clearMocks: true` in the runner config for that one run.
Writing `clearMocks: false` keeps today's behaviour after the upgrade.

#### `vitest-5-available`

**Reports**, on Vitest 4, whether you can upgrade to Vitest 5. Note.

**Why it matters:** with coverage, Vitest 5 ran a 700-file Angular 22.2 suite 35–46 % faster;
without coverage the two are level. Details:
[Vitest 5 under the Angular unit-test builder](/core/performance#vitest-5-under-the-angular-unit-test-builder).

**Fix:** when nothing holds the upgrade back, upgrade. Otherwise the note names what does, with the fix
for each:

- `@angular/build` older than 22.2.0 next to an `@angular/build:unit-test` target — 22.2.0 is the first
  builder that runs Vitest 5;
- `@analogjs/vite-plugin-angular` or `@analogjs/vitest-angular` older than 2.7.5;
- `vite` older than 6.4;
- Node older than 22.12 in `.nvmrc`, `.node-version`, a CI config (`node-version:` or a `node:` image)
  or the `engines` of a private package. A published package's `engines` is ignored: it describes its
  users, not where its tests run.

Vitest 2 and 3 get no note: the measurement compares Vitest 4 with 5.

#### `fs-module-cache-not-persisted`

**Reports** `fsModuleCache` turned on (top-level, under `experimental`, or `--fsModuleCache` in a
script) on Vitest 4 or newer, while none of your CI configs caches the cache directory. CI configs are
`.github/workflows/*.yml`, `.gitlab-ci.yml`, `.gitlab/**/*.yml`, `.circleci/config.yml`,
`azure-pipelines.yml` and `bitbucket-pipelines.yml`.

**Why it matters:** every CI run starts with an empty cache and pays the full transform, so the setting
only helps locally.

**Fix:** cache the directory in CI, keyed on the lockfile hash (Vitest clears the cache itself when the
lockfile changes). The directory is `fsModuleCachePath`, or by default `node_modules/.vitest-cache` on
Vitest 5 and `node_modules/.experimental-vitest-cache` on Vitest 4.

```yaml
test:
  cache:
    key:
      files: [package-lock.json]
    paths: [node_modules/.vitest-cache]
```

- A CI config counts as caching it when it names that directory, or a parent such as `node_modules`,
  as a path.
- `cache: npm` in `actions/setup-node` does not count: it keeps npm's download cache, not
  `node_modules`.
- `npm ci` deletes `node_modules` before installing. If your CI runs it, point `fsModuleCachePath`
  outside `node_modules` and cache that directory.

#### `vitest-5-bundled-package`

**Reports** an import of `@vitest/expect` or `@vitest/runner`, or a `declare module '@vitest/expect'`.

**Why it matters:** Vitest 5 bundles both packages and no longer depends on them. The import resolves
to a stale separate copy or to nothing: `expect.extend` through it registers nothing on the `expect`
your tests call, and the type augmentation types nothing.

**Fix:** import from `vitest` instead (`expect`, `MatcherState`, `ExpectationResult`,
`getCurrentTest`, `getCurrentSuite`, `createTaskCollector`), write `declare module 'vitest'`, and
remove the packages from `package.json`.

#### `vitest-5-matchers-augmentation`

**Reports** a one-parameter `interface Matchers<T = any>` inside `declare module 'vitest'`, or matchers
declared on the global `jest.Matchers`.

**Why it matters:** Vitest 5 declares `Matchers<R, T>`, so the one-parameter form no longer merges. In a
`.ts` file that is TS2428; in a `.d.ts` under `skipLibCheck` there is no error at all, and your
matchers return the wrong type. The global `jest.Matchers` is gone too, so matchers declared there are
missing at the call (TS2339).

**Fix:** declare both parameters. This form compiles only on Vitest 5, so change it with the upgrade.

```ts
declare module 'vitest' {
  interface Matchers<R, T> {
    toBeFoo(): R;
  }
}
```

#### `vitest-5-nested-hoist`

**Reports** `vi.mock`, `vi.unmock` or `vi.hoisted` inside a block: a `describe`, a hook, a helper
function.

**Why it matters:** Vitest 4 warned about it; Vitest 5 throws while collecting the file ("… defined
outside of the module's top level scope").

**Fix:** move the call to the top level of the file, where Vitest hoists it anyway. If a mock must
differ per test, use `vi.doMock` plus a dynamic `import()` inside that test. A file with in-source
tests (`import.meta.vitest`) is exempt, as it is in Vitest.

#### `vitest-5-empty-throw-message`

**Reports** `.toThrow('')`. Warning.

**Why it matters:** Vitest 4 read an empty string as "an empty message". On Vitest 5 an empty string
is part of every message, so `.toThrow('')` passes for any error and `.not.toThrow('')` fails on any
error.

**Fix:**

```ts
expect(run).not.toThrow(); // "throws nothing"
expect(run).toThrow(/^$/); // "throws with an empty message"
```

#### `vitest-5-prune-mock-registry`

**Reports** `pruneMockRegistry: true` or `trackMockRegistry()` on Vitest 5. Note, Vitest 5 only.

**Why it matters:** it does nothing there. The registry holds `WeakRef`s, and clearing walks only the
mocks called since their last clear, so there is no growing set to prune.

**Fix:** delete it once the upgrade lands. On Vitest 4 with `isolate: false` it still helps.

#### `vitest-5-project-own-server`

**Reports** an inline project that sets a Vite option of its own: `plugins`, `resolve`, any top-level
key besides `test`, `extends` and `define`, or `test.alias`, `test.browser`, `test.css`, `test.mode` or
`test.root`. Note, Vitest 5 only.

**Why it matters:** on Vitest 5 inline projects share the Vite server of the config that declares them
(`sharedViteServer`). A project with its own Vite options starts one more server and fills one more
transform cache on every run.

**Fix:** keep Vite options in the root config, where every inline project inherits them, and delete
the ones that repeat the root's. An empty `plugins: []` does not count, and a config with
`sharedViteServer: false` is not reported.

#### `vitest-5-extends-restated`

**Reports** `extends: true` on an inline project. Note, Vitest 5 only.

**Why it matters:** from Vitest 5 an inline project inherits the declaring config unless it says
`extends: false`, so the line restates the default.

**Fix:** delete it.

#### `vitest-5-report-path`

**Reports** a script or CI line that relies on the old report paths. Warning.

**Why it matters:** on Vitest 5, `--reporter=json` or `junit` without `--outputFile` writes to
`.vitest/json/output.json` or `.vitest/junit/output.xml` instead of stdout, so a redirect or a pipe
gets nothing. Blob reports and `--merge-reports` moved from `.vitest-reports` to `.vitest/blob`.

**Fix:** pass `--outputFile.<reporter>=<path>` and read that file; it works the same on Vitest 4. For
blobs, use `.vitest/blob`, or keep the old directory with `--outputFile.blob` on each shard and
`--merge-reports .vitest-reports` on the merge.

```bash
npx vitest run --reporter=json --outputFile.json=reports/vitest.json
```

The check reads scripts and CI lines, and any mention of `.vitest-reports` unless an `outputFile` still
writes there.

#### `vitest-5-vite-peer`

**Reports** a Yarn repository (`yarn.lock`) that does not declare `vite`.

**Why it matters:** Vitest 5 takes `vite` as a peer dependency, and Yarn does not install peers. The
run gets whatever version another package brought in (warning), or none at all (error).

**Fix:** add `vite` to `devDependencies` in a range Vitest 5 accepts: `^6.4.0`, `^7` or `^8`.

```bash
yarn add -D vite@^7
```

### This library

#### `vitest-entry-without-vitest`

**Reports** a file that imports an entry that loads `vitest` — the root `vitest-auto-spy`, `/angular`,
`/angular/*`, `/angular-http`, `/angular-router`, `/dom-stubs`, `/jasmine`, `/react`, `/setup`,
`/signal-forms`, `/svelte` or `/vue` — in a repository where `vitest` is not installed. Error.

**Why it matters:** the import fails with "Cannot find package 'vitest'" before any library code runs,
so the library itself cannot tell you why. Only `doctor` can.

**Fix:** import your runner's own entry: `/bun` or `/bun-angular` on Bun, `/node` on `node:test`,
`/rstest` on Rstest.

```ts
import { createSpyFromClass } from 'vitest-auto-spy/node';
```

`/rxjs`, `/console`, `/nestjs`, `/zone`, `/observer-spy` and the other runner-neutral entries load
anywhere and are not reported.

#### `helper-from-wrong-entry`

**Reports** a helper imported from an entry point that does not export it — for example
`provideAutoSpy` from the root, or `flushEventLoop` from `/angular`.

**Why it matters:** the import fails where it runs. The files it fires in are usually the ones no `tsc`
program covers, so type-checking never saw it.

**Fix:** import from the entry the finding names.

```ts
import { provideAutoSpy } from 'vitest-auto-spy/angular';
```

`doctor` knows which entry owns each name from the installed package's own export map. See
[The two checks that resolve a name](#the-two-checks-that-resolve-a-name).

#### `no-unawaited-helper`

**Reports** `expectEmission`, `expectError`, `stable`, `flushEventLoop` and similar helpers called as a
statement and dropped, with their line numbers.

**Why it matters:** the returned promise settles after the test has ended, so its assertion reports
into a later test, or nowhere. The run stays green and the spec looks like it asserted something.

**Fix:** `await` it.

```diff
- expectEmission(users.load$, [user]);
+ await expectEmission(users.load$, [user]);
```

Only a call that both starts and ends a statement is reported. See
[The two checks that resolve a name](#the-two-checks-that-resolve-a-name) for what counts.

#### `no-agent-instructions`

**Reports** a repository where no `AGENTS.md`, `CLAUDE.md` or `GEMINI.md` mentions the package. Note.

**Why it matters:** coding agents never read `node_modules`, so they do not know the library's rules.

**Fix:** run [`init`](#init-—-the-pointer-an-agent-actually-reads). The fix reads `.gitignore`:

- if some instruction files are kept out of git, it names the tracked ones for `init --only`;
- if all of them are, it says to run `init` on your own machine.

Under `CI` (set to anything but empty, `false` or `0`) the check stays quiet when `.gitignore` keeps
every instruction file out of git, since CI never has them.

#### `scan-cap-reached`

**Reports** that the file scan stopped at its safety cap of 50 000 files. Warning, exit 1.

**Why it matters:** every other check read only part of the tree, so a clean result would be false.

**Fix:** narrow the tree with `--cwd`, or raise the cap:

```bash
VITEST_AUTO_SPY_SCAN_CAP=200000 npx vitest-auto-spy doctor
```

## Perf findings

Every `perf` finding links to its entry here. Findings under `--gate` (`perf-gate-*`) are described in
[The gate](#the-gate).

**Where a setting goes.** `perf` reads the configuration Vitest actually resolved (on Vitest 5) and
never advises against an option you set yourself. Under `@angular/build:unit-test` the builder reads
no `vitest.config.*`, so a finding names the runner config instead: the file from `--runner-config` in
`--command`, then the target's `runnerConfig` (`true` means `vitest-base.config.*`). A target without
one is told to add `"runnerConfig": "vitest-base.config.mts"` first. `@angular/build` 20.x reads no
runner config, and the finding says the setting is not available there.

### Advice on the phases

#### `perf-environment`

**Reports**, when the `environment` phase dominates, the spec files that provably need no DOM, ranked
by the environment time they cost.

**Why it matters:** building a DOM for a spec that never touches it is pure waste.

**Fix:** move those specs to the `node` environment, one comment each, or through a `node`-environment
project:

```ts
// @vitest-environment node
```

- **Only proven files are named.** A spec is a candidate only when it, the setup files, and every
  repository module they import were read, none mentions a DOM name, and every package they import is
  on a short DOM-free list (`vitest`, `rxjs`, `date-fns`, `lodash`, `zod`, …). Anything it cannot
  resolve is **undecided**, never assumed safe: a wrong guess fails your suite with `document is not
defined`.
- **A setup file can block every spec.** When a setup file mentions a DOM name, every spec reaches the
  DOM. The finding then counts what splitting it would buy: ``With the DOM part moved out, 20 spec
files reach no DOM and could move to `node`, freeing 9.86s of environment.``
- **The saving is priced honestly.** A worker's environment is saved only when every file it ran is
  DOM-free; when a DOM neighbour means the move frees nothing, the finding says so.

A spec that already declares `@vitest-environment <name>` (or the Jest spelling, which Vitest also
reads) is not a candidate.

#### `perf-environment-engine`

**Reports**, when building the DOM dominates, that the run uses `jsdom` and no config mentions
`happy-dom`. It names the config that sets `jsdom`.

**Why it matters:** specs that really need a DOM still pay for it. happy-dom builds it for less CPU;
how much you get back depends on how much of each file is the environment.

**Fix:** try happy-dom, one project at a time, keeping the suite green after each:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'happy-dom' } });
```

happy-dom implements less of the platform than jsdom, so this is a swap to test, not a flag to flip.
Under `@angular/build:unit-test` from 21, the builder picks happy-dom by itself whenever it resolves,
so the finding says to install `happy-dom` and names the runner config only when that config sets
`jsdom`. Quiet on `@angular/build` 20.x.

#### `perf-transform`

**Reports**, on Vitest 5 with the module cache off, that files spent 30 % or more of the CPU time
waiting for Vite to transform modules. It prints the seconds they waited.

**Why it matters:** those modules are transformed again on every run.

**Fix:** turn on the module cache. The next run reads transformed modules from
`node_modules/.vitest-cache`, so the printed wait is the most it can save.

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { fsModuleCache: true } });
```

On CI the cache helps only if the job keeps that directory between pipelines. On Vitest 4 the option
is `experimental.fsModuleCache` and the directory is `node_modules/.experimental-vitest-cache`. The
finding does not fire when you set `fsModuleCache` yourself, to any value.

Under `@analogjs/vite-plugin-angular` with a component that has inline `styles`, the finding is a
warning instead: a warm cache breaks those specs, as
[`analog-module-cache-inline-styles`](#analog-module-cache-inline-styles) describes. Under
`@angular/build:unit-test` the advice stands.

#### `perf-import`

**Reports**, when the `import` phase dominates, every spec that reaches its subject through a barrel:
an `index` or `public-api` module that only re-exports.

**Why it matters:** a spec that imports a barrel loads everything it re-exports to use one export.

**Fix:** import the module directly.

```diff
- import { CartService } from '../shared';
+ import { CartService } from '../shared/cart.service';
```

Not reported when the fix would save nothing: another import of the spec, usually its subject, loads
the same barrel anyway, or the barrel is another package's entry point — the target of a tsconfig
`paths` alias, imported from outside its directory.

On Vitest 5 the transform wait counts as `transform`, so `import` here is only running the modules.
Off under `@angular/build:unit-test`: the builder resolves barrels into its bundle before Vitest
imports anything.

#### `perf-isolation`

**Reports**, when `environment` + `setup` + `prepare` together dominate, that `isolate: false` might
help. On Vitest 5 it also prints how many workers were spawned and their summed start-up time, and the
least wall clock that reusing workers would save.

**Why it matters:** `isolate: false` pays those three phases once per worker instead of once per file.
But one run cannot show the win: on some suites the work moves into the files instead of going away.

**Fix:** measure it first. `--ab-isolate` runs the suite a second time with `isolate` flipped and
reports both wall clocks as `perf-isolation-ab`:

```bash
npx vitest-auto-spy perf --ab-isolate
```

- Keep `isolate: false` only if peak memory stays acceptable: without isolation, every test double a
  file creates lives until its worker ends. See
  [memory under isolate: false](/core/performance#memory-under-isolate-false).
- A difference under 5 % is reported as noise, and each side is one reading.
- If the flipped run fails, that is the finding (a warning): some file depends on a fresh module graph
  or on state another file left behind.

Not suggested when the run already has `isolate: false`, when the pool is `vmThreads` or `vmForks`
(every file gets a fresh context anyway), or when you set `isolate` yourself. `@angular/build:unit-test`
passes `isolate: false` from 21.0, but a `test.isolate: true` in its runner config wins, and from 22.1
the target's own `isolate` option wins over both.

#### `perf-pool`

**Reports**, on Vitest 5, a run with no `pool` set (so `forks`), `isolate` not `false`, a `jsdom` or
`happy-dom` environment, and per-file environment, setup and prepare at 30 % or more of the CPU time.

**Why it matters:** Vitest starts a fresh process for every file and builds the DOM in each.
`pool: 'vmThreads'` keeps the workers and gives each file a new VM context instead.

**Fix:** try it, and keep it only if the suite stays green and peak memory is acceptable:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { pool: 'vmThreads' } });
```

A `vm` pool keeps a worker's native modules between files, so cap it with `vmMemoryLimit`. Confirm it
with `npx vitest doctor` ([`perf-vitest-doctor`](#perf-vitest-doctor)).

#### `perf-workers`

**Reports**, on a run with more than a minute of summed CPU time and no `maxWorkers` set, that the
suite uses one worker per core. It suggests half the cores, in the runner config it found. This is the
one finding about memory rather than time.

**Why it matters:** each worker is a whole runtime with its own memory. Capping at half the cores cost
a few percent of wall clock on measured suites and saved gigabytes of memory.

**Fix:**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { maxWorkers: 4 } }); // half the cores of an 8-core machine
```

The right number depends on the machine, not the suite: compare the wall clock before and after. On
Vitest 5 the count comes from the run (the resolved `maxWorkers`, or the highest lane used), so a run
that never used more than half the cores is not told to cap them.

#### `perf-long-pole`

**Reports**, on Vitest 5, a file that kept running for at least 2 s and at least 30 % of the run after
every other lane was idle. The header carries the lane line either way:

```text
15 lanes busy 40.5% of the 2.58s span; src/cli/report.spec.ts ran alone for the last 10ms
```

**Why it matters:** for that tail, the run's wall clock is one file.

**Fix:** split the file so its tests spread over several lanes, or keep Vitest's results cache between
CI runs: its sequencer starts known slow files first.

A file's time on its lane is `prepare` + `setup` + `import` + `tests`; the environment is left out,
because a reused worker does not pay it per file.

#### `perf-coverage`

**Reports** coverage that took a second or more, and 20 % or more of the wall clock, after the last
test file finished.

**Why it matters:** building the coverage map and writing reports happens after the run, so it is not
in the phase table. A suite can look fast in every phase and still spend most of its CI minutes here.

**Fix:**

- collect coverage only in the job that reads it;
- narrow `coverage.include` to the source the report is about;
- drop `coverage.reporter` formats nobody opens — each is another pass over every covered file.

#### `perf-vitest-doctor`

**Reports**, on Vitest 5, that `npx vitest doctor` can confirm a switch another finding suggests
(`perf-isolation`, `perf-environment-engine`, `perf-transform` or `perf-workers`). One line.

**Why it matters:** `vitest doctor` is **Vitest's** own A/B runner, not this package's `doctor`. It
re-runs the suite once per pool, isolation, DOM engine and module-cache candidate, halves `maxWorkers`
while that keeps helping, and recommends only what it measured faster on your machine.

**Fix:** run it before keeping the change:

```bash
npx vitest doctor
```

Not under `@angular/build:unit-test`: there `vitest doctor` runs without the builder and fails every
file with `describe is not defined`. Instead the finding gives you an A/B of your own — the change in
a copy of the runner config, timed as `ng run <project>:<target> --watch=false
--runner-config=<variant>` against the original, a few rounds each. Quiet on `@angular/build` 20.x.
`perf-environment` does not trigger it.

### Hangs, flaky tests and the heap

These findings appear on every run, however fast.

#### `perf-hung`

**Reports** that Vitest finished, but the process did not exit, so Vitest waited `teardownTimeout` and
then forced it out. Warning.

**Why it matters:** every run of the suite ends with that wait.

**Fix:** find what keeps the process open — a server, a socket, an interval, a worker — and close it in
the `afterAll` of the file or setup file that starts it.

```bash
npx vitest run --reporter=hanging-process
```

#### `perf-flaky`

**Reports** every file with a test that passed only on a retry, and the tests by name. Warning; the run
stays green.

**Why it matters:** a retry that hides a real race is a test that will fail on someone else's merge
request. The failed attempts also count in the file's time, so the gate judges such a file slower than
it is.

**Fix:** fix the race. To make CI fail on it, add `--fail-on-flaky` (exit 1):

```bash
npx vitest-auto-spy perf --fail-on-flaky
```

When the report records retries, the fix says how many attempts failed and what the retried test cost
across all of them. The attempts cannot be subtracted: Vitest times a retried test from its first
attempt to its pass. For the same reason a `perf-gate-slow-test` on a retried test says its time
covers every attempt.

#### `perf-heap`

**Reports** the five files with the most heap in use after them, and the tests that kept heap. Note.

**Why it matters:** a test that keeps memory — an open subscription, a listener on a global, a module
cache it filled — makes every later file in its worker heavier.

**Fix:** start with the first test listed.

- **Per file.** A bare run passes `--logHeapUsage` itself; a `--command` run needs `logHeapUsage: true`
  in the config it reaches. Under `isolate: false` on Vitest 5, `perf` lists what each file **added**
  over the file before it in the same lane. Otherwise it lists the heap after each file.
- **Per test.** A test whose growth (1 MB or more) is still there after the next test is a heap step,
  listed by name, largest first. The first test in a file is not judged: its growth is the file's
  modules loading.
- **First loads are told apart.** A reused worker loads a module once, so the first file in a lane to
  import a heavy package pays for it. A file whose growth comes with a first load of 50 ms or more is
  listed in a second note:

```text
info  perf-heap  Heap growth that comes with modules a worker evaluated for the first time, largest first:
                 libs/utils/capture-exception.util.spec.ts: first load of `@sentry/angular` in this worker (+8 MB),
                 not retained by the spec.
```

More on how growth is split between loads and specs: [How perf counts time](#how-perf-counts-time).

## In depth

### What the scan counts as this repository

Every `doctor` check reads one list of files. The first line of the report is its length. Four rules
build it:

- **Build output and package directories are skipped**: `node_modules`, `dist`, `build`, `coverage`,
  `out-tsc`, `.git`, `.angular`, `.nx`, `.next`, `.nuxt`, `.output`, `.svelte-kit`, `.turbo`,
  `.yarn`, `.cache`, `bower_components`, `out`, `tmp`, `vendor`, and the package-manager stores CI
  keeps inside the checkout: `.bun`, `.npm`, `.pnpm-store`.
- **Directories git ignores are skipped** (`src/generated/`, `/reports`, `tmp-*/`, `**/cache`), with
  `!` re-including a directory as git does. Rules are read from where git reads them, lowest
  precedence first: the per-user excludes (`core.excludesFile` from the global or repository config,
  else `$XDG_CONFIG_HOME/git/ignore`; `GIT_CONFIG_GLOBAL` is honoured, `[include]` is not followed),
  `.git/info/exclude` (through a worktree's `.git` file too), the root `.gitignore`, and every
  `.gitignore` below it, each relative to its own directory. Only directories count: an ignored file is
  still listed. A pattern with a `\` escape or a POSIX class is dropped (the scan just reads more), and a
  `!` rule that cannot be read makes its file ignored whole. A `.gitignore` above the scan root is not
  read, so run from the repository root.
- **A nested repository is not entered**: a git worktree (whose `.git` is a file) or a nested clone.
  Its files belong to another branch; counting them duplicates every import graph. The same rule keeps
  `codemod --write` out of another branch's working copy.
- **The scan stops at 50 000 files.** `doctor` reports [`scan-cap-reached`](#scan-cap-reached);
  `codemod` says so on stderr. `VITEST_AUTO_SPY_SCAN_CAP` raises the cap.

The checks that follow imports (`spec-imported-by-non-spec`, `orphan-runner-file` and others) read one
import graph built over that list. It ignores specifiers inside comments and strings, and follows
`tsconfig` `paths` and `baseUrl` from `tsconfig.json` and `tsconfig.base.json`, through their
`extends` chains.

### The two checks that resolve a name

`helper-from-wrong-entry` and `no-unawaited-helper` answer a question about a name, and neither
guesses. The table of which entry exports which name is **generated from this package's own `exports`
map**: the barrels are compiled, the exported names come from the compiler, and the promise-returning
helpers come from their signatures. A hand-written table would drift the first time a helper moved.
A per-file linter has no such table, which is why these are `doctor` checks and not lint rules.

Both are conservative:

- **One major version.** `doctor` reads the version installed in your repository and stays silent when
  the majors differ. Helpers can move between entries inside a major too — thirty-two left `/angular`
  for three new entries in 5.21.0 — so `helper-from-wrong-entry` also reads the `exports` of the copy
  each file resolves, and names only entries that copy publishes. Running a newer CLI
  (`npx vitest-auto-spy@latest doctor`) against an older install reports nothing for a helper whose
  new entry the install does not have. When the installed manifest cannot be read, the check stays
  silent.
- **One shape.** `no-unawaited-helper` reports only a call that both starts and ends a statement.
  `await`, `return`, an assignment, an argument, a `.then`, a concise arrow body and an explicit
  `void` all leave it alone. So does a method of the same name, and any call whose callee this file
  did not import from this package. `expectEmission` renamed with `as` is still resolved; someone
  else's `stable` never is.
- **Code only.** Strings, template literals and comments are skipped before anything is matched, so a
  codemod fixture, a docs generator, a quoted snippet in a `describe` title or a commented-out line is
  never reported. Comments are skipped first, because an apostrophe in prose would otherwise open a
  string.

**Still read-only.** Both findings name a mechanical edit — change a specifier, add an `await` — and
neither is applied. `doctor` has no `--fix` on purpose: a tool that has just shown you what nothing
else could see has not yet earned write access to your files.

### How perf counts time

**Phase totals are CPU time summed across workers**, not wall clock. A run that took 1.36 s on the
clock can show 16.91 s of CPU, because the work was spread across workers.

**Vitest's numbers, not terminal output.** Vitest prints one summary line per run (`Duration 8.91s
(transform 26.20s, setup 14.70s, import 55.27s, tests 27.24s, environment 155.65s)`). It does not say
which files cause it. `perf` reads the same numbers per file through `TestModule.diagnostic()`,
Vitest's public API, via a reporter this package ships. On Vitest 5 a bare run also passes
`--experimental.diagnostics=false`, so Vitest's own after-run hints do not repeat `perf`'s.

**Resolved config on Vitest 5.** The report records the configuration Vitest resolved — `isolate`,
`pool`, `maxWorkers`, `environment`, `fsModuleCache` — and which of them you set yourself (Vitest's
`providedOptions`). The advice reads those values instead of searching config text, so a setting made
in a builder, a workspace project or on the command line counts. `perf` treats a run as a builder run
when `--command` (or the `npm` script it calls) runs `ng` or `nx`, or when the workspace has a unit-test
target and no root Vitest config. `isolate` and `environment` the builder passes to Vitest are its
decisions, not yours, so they do not silence a finding. Under the builder the modules Vitest reports
are `spec-*.js` and `chunk-*.js` bundles; a confirmed finding's card names a spec's own bundle after
the spec and leaves chunks out.

**An environment is counted once per worker.** Vitest builds the environment once per worker, then
copies that number into the report of every file the worker ran. Summing over files multiplies one
start-up by the number of files. `perf` counts each distinct value once — on Vitest 5, once per lane
(`concurrencyId`), so two lanes with the same number are not merged. Vitest 5 also reports a
`workerId`, but it is new for every file even when the worker is reused, so `perf` does not group by
it.

**Isolation estimate.** On Vitest 5 `perf-isolation` uses the estimate Vitest 5's own isolate hint
makes: `startup ÷ lanes − startup ÷ workers`, with lanes the smaller of the file count and
`maxWorkers` (or the highest lane used). It prints "at least", because module evaluation that reused
workers also save is not in it.

**Transform on Vitest 5.** Each file reports how long collection and setup waited for Vite
(`collectFetchDuration` + `setupFetchDuration`). The phase table counts that wait as `transform`
instead of inside `import` and `setup`, the split Vitest's own summary makes. `isolate: false` does not
change it: the server transforms each module once either way.

**Heap and first loads.** After each file the reporter records the modules the worker evaluated for
the first time, the ones the lane's previous file had not. When the same module was first loaded in
several lanes, each of those files is one reading of what the load costs. A file that grew more than
twice the middle reading stays in the first note, as `+21 MB beyond the first load of
@sentry/angular`; a file that loaded nothing new stays there with its whole growth. With a single
reading the whole growth is put down to the load. A measured run asks Vitest for the thirty heaviest
imports under `isolate: false` (ten otherwise); a first load too light for that list is not recognised,
and its growth is reported as kept.

**Slowest imports.** On Vitest 4.1 and newer a measured run asks for the ten slowest imports of each
file (thirty under `isolate: false`) when the config sets no `experimental.importDurations.limit`. The
re-measurement raises a lower limit for its own run only.

**The CPU profile.** During the gate's re-measurement `perf` sets `VITEST_AUTO_SPY_PERF_PROFILE`; the
reporter adds the package's profiler to every project's `setupFiles` for that pass only, and it records
each file through the worker's own `node:inspector` session, sampling every 500 µs. `--cpu-prof` would
record nothing: a pool worker is terminated rather than allowed to exit, and Node writes that profile
on exit. The same pass records every test body, not only those over 100 ms, so the card can name the
slowest. Shares leave idle ticks out. A profile that cannot be read leaves the finding without those
lines rather than failing anything.

**`setupAutoSpy` hooks.** During a measured run `setupAutoSpy()` times its one `beforeEach` and one
`afterEach` into `task.meta.autoSpyMs`. Outside a `perf` run nothing is timed.

### Why the gate works like this

The advice `perf` prints must never fail a merge request. The gate must, so every finding in it has to
be something the author of the diff did and can undo. Three decisions follow.

- **It judges test bodies, not the machine.** `environment`, `prepare`, `setup` and `transform` grow
  with the file count and the CPU; no spec author makes them smaller. `import` is hard to attribute:
  in a shared worker the first file to reach a module pays for everyone. `tests` is the one phase that
  is somebody's code.
- **Budgets are counted in the run's median test.** A loaded runner slows every test alike, so the
  verdict is the same on a laptop and on a runner nine times slower. The `--max-file-ms` floor can only
  spare a file. An earlier rule — a millisecond floor and a multiple of the median **file** — judged
  file size and runner speed instead: the same report replayed at slower speeds flagged more and more
  files, and splitting a file passed it.
- **Nothing fails on one measurement.** "Your test is slow" and "your test shared a worker with four
  others" are different statements. A gate that cannot tell them apart gets switched off within a week.

The over-budget tables come from the same functions the gate judges with, and `--gate-only` narrows
both the same way, so the table and the verdict cannot disagree. The card compares each candidate with
its own budget, not the file budget.

### Report formats

**`--format json`** prints one document on stdout and nothing else. The suite's own output goes to
stderr, so stdout stays parseable. Fields only ever grow; a field that changes meaning or goes away
raises `schema`.

- **`doctor`**: `schema`, `command`, `version`, `cwd`, `runner`, `entry`, `scanned` (`files`,
  `specFiles`, `truncated`), `exitCode`, `tally` (`errors`, `warnings`, `notes`), and every finding with
  `check`, `severity`, `file`, `message`, `fix` and `details`. `--min-severity` shapes only the text;
  the document always has every finding.
- **`perf`**: `run` (files, tests, wall and CPU milliseconds, the two medians, the phases, and
  `slowestFiles` — the `--top` slowest files, 10 by default, each with its repository-relative path,
  total milliseconds, test count and per-phase milliseconds), `budgets`, `gate` (`status`,
  `confirmation` and the verdict rows), `tally` and every finding. A run with nothing to judge still
  prints a document, with `error` and `run: null`.
- **`perf`, when the report has the data**: `run.vitest` (the Vitest version), `run.partial`,
  `run.config` (the resolved options and `provided`), `run.startup` (`{ ms, workers }`), `run.lanes`
  (`{ lanes, spanMs, busy, longPole?: { file, aloneMs } }`), and on Vitest 5 a `transform` entry in each
  `slowestFiles[].phases`, with `import` and `setup` net of it. When there is something to say: `end`
  (`passed`, `failed` or `interrupted`), `hung: true`, `coverageMs`, `libraryHooksMs` and `endToEndMs`.
  The report format is version 6; versions 1 to 6 are read. Every field version 5 added (the run's
  `end`, `hung` and `coverage`, a file's `heapStep`, `setupImports` and `autoSpy`, an import's `self`)
  and the run's `configFile` from version 6 (the Vitest config file, relative to `root`) are optional.

**`--format markdown`** renders the same document as GitHub/GitLab markdown: a findings table
(severity, check, file, message, fix) and the tally; for `perf` also the phase table, the slowest files
(with a `Transform` column on Vitest 5), the lanes line, the Vitest version and the gate's verdicts.
`|` and line breaks inside a cell are escaped. An unfinished run says "the run did not finish" where a
red one says "the suite did not pass".

**`--code-quality <path>`** writes a GitLab Code Quality report. A finding about a file is filed under
that file; one about the whole repository under `package.json`. The file is written even when empty,
because an empty report is how the widget learns last run's issues are gone. It follows
`--min-severity`. On `perf` it carries the advice, the gate and the flaky tests. The widget tracks a
finding by its fingerprint: digits in a message are blanked, because durations and counts move between
runs, but text inside backticks is kept, because that is where the message names a test, a file or a
flag. So `` `returns 200` `` and `` `returns 404` `` stay two findings, while `3.90s` is still
normalised.

**Color.** In a terminal, `error` is red, `warn` yellow, `info` plain, and the gate's verdict line red
when something fails. In the perf tables, row times are red and headers dim. The card colors
over-budget numbers and bodies past `--max-test-ms` red, other timings yellow, share bars yellow from
20 % and red from 40 %, with the frame dimmed. Color is off in a pipe or a file unless `FORCE_COLOR`
asks for it, or the run is a GitLab CI (`GITLAB_CI`) or GitHub Actions (`GITHUB_ACTIONS`) job, whose
logs render color. `NO_COLOR`, `FORCE_COLOR=0` and `TERM=dumb` turn it off everywhere. JSON, markdown
and Code Quality output never carry an escape. Every line of a finding but the first is indented, so a
harness that collects a finding as its `error` line plus the indented lines under it gets all of it,
the card included.
