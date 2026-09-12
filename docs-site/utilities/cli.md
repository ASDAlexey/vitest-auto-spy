---
title: The CLI — doctor and init
description: npx vitest-auto-spy doctor finds suite-level defects that never fail a run — a tsconfig include pattern matching no file, a spec another file imports, a foreign runner's pragma, config for a runner that is gone, a helper imported from the wrong entry point, an expectEmission nobody awaited. npx vitest-auto-spy init writes the pointer every AI coding agent in the repository actually reads.
---

# The CLI

Four commands, no dependencies, nothing to configure:

```bash
npx vitest-auto-spy doctor   # read-only. Exits 1 when it finds something
npx vitest-auto-spy perf     # where the suite's CPU time goes. Always exits 0
npx vitest-auto-spy init     # writes the agent instructions pointer
npx vitest-auto-spy codemod  # dry run by default. Exits 1 when it left something alone
```

They are one binary because they answer one question from four directions — _is anything in this
test suite quietly not doing what it looks like it is doing?_ `doctor` asks it of the repository,
`perf` asks it of the suite's own clock, `init` asks it of the agent about to write the next spec,
and [`codemod`](/utilities/codemod) asks it of every span a migration off `jest-auto-spies` would
otherwise rename into the reverse meaning. This page covers the first three; the codemod
[has its own](/utilities/codemod), because most of what it does is refuse.

## `doctor` — defects that never fail

Every check here shares one property: **nothing consumes the result**. The suite is green,
`tsc --noEmit` reports zero errors, and the only reader of the stale thing is a person who happens
to open the file. That is what makes them survive for years, and it is also why a linter cannot
find most of them — the evidence is spread across files.

```
$ npx vitest-auto-spy doctor
vitest-auto-spy doctor — /work/app
1 284 files, runner: vitest, entry: vitest-auto-spy/angular

error  tsconfig-glob-matches-nothing libs/users/tsconfig.spec.json
       The "include" pattern "src*.spec.ts" matches no file.
       → A pattern that matches nothing type-checks nothing, and `tsc --noEmit` still reports
         zero errors. Fix the glob or delete the entry.

3 errors, 4 warnings, 1 note
```

| Check                            | What it finds                                                                                                                                                              | Why nothing catches it                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsconfig-glob-matches-nothing`  | An `include` pattern that matches no file — an error when files it was meant for sit beside the config, `info` for a library that has none yet                             | A glob that matches nothing type-checks nothing, and `tsc` reports success                                                                                                                                                                                                                                                                              |
| `tsconfig-file-missing`          | A `files` entry naming a file that is gone                                                                                                                                 | Same — the config is only read by editors once the runner stopped using it                                                                                                                                                                                                                                                                              |
| `spec-imported-by-non-spec`      | A production module importing a `*.spec.ts`                                                                                                                                | Under a shared environment the import is a cycle, and the spec loses its own suite                                                                                                                                                                                                                                                                      |
| `spec-exports-fixture`           | A spec importing another spec                                                                                                                                              | The imported file's suites are collected twice and its hooks run in a foreign file's context                                                                                                                                                                                                                                                            |
| `foreign-runner-pragma`          | `@jest-environment` and friends left in a spec                                                                                                                             | Vitest never reads them; the environment comes from the config, so the comment looks operative                                                                                                                                                                                                                                                          |
| `dead-runner-config`             | `jest.config.*`, `karma.conf.*` for a runner that is not installed                                                                                                         | It is the first file a newcomer — or an agent — reads to learn how tests run                                                                                                                                                                                                                                                                            |
| `orphan-runner-file`             | A setup file only that dead config referenced                                                                                                                              | One found this way had been empty since before the migration: a year as a setting that configured nothing                                                                                                                                                                                                                                               |
| `angular-build-splitting-off`    | `@angular/build` in `[22.1.5, 22.1.7)`                                                                                                                                     | The unit-test bundle is built with code splitting off. `--coverage` then grows by hundreds of megabytes with no plateau, and the builder emits no warning — see [what it trades, and the escape hatch](/adapters/angular#when-the-unit-test-build-has-code-splitting-off); `setupAutoSpy()` also says this once per worker from inside the affected run |
| `coverage-all-removed`           | `coverage.all` on Vitest 4 or newer                                                                                                                                        | The key was removed, not renamed: nothing reads it and nothing warns, so the report quietly covers only what the run imported                                                                                                                                                                                                                           |
| `coverage-include-misses-bundle` | A source-only `coverage.include` in the runner config of an `@angular/build:unit-test` target                                                                              | Coverage is matched twice — first against the executed bundle chunks, then against the remapped sources. A list of `.ts` globs loses every counter on the first pass, and the run stays green — see [coverage under the unit-test builder](/adapters/angular#coverage-under-the-unit-test-builder)                                                      |
| `jasmine-era-project`            | `jasmine-core`, `@types/jasmine`, `jasmine-auto-spies`, `@hirez_io/observer-spy`, a `karma*` package or a `karma.conf.*` on disk — or `"types": ["jasmine"]` in a tsconfig | **Info**, never an error: a repository is free to still be a jasmine repository. The fix names the order that works — point the specs at [`vitest-auto-spy/jasmine`](/migrating-jasmine) and land the suite green, _then_ `codemod --from jasmine` and drop the import. Doing it the other way round means rewriting a suite that was never green       |
| `no-agent-instructions`          | No `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` names the package                                                                                                               | A note, not an error. It is the one moment where saying so costs nothing                                                                                                                                                                                                                                                                                |
| `helper-from-wrong-entry`        | A helper imported from an entry that does not export it — `provideAutoSpy` from the root, `flushEventLoop` from `/angular`                                                 | Resolving a name to the entry that owns it needs a table generated from the installed version's own export map, which no per-file linter has. And the files it fires in are usually the ones no `tsc` program covers — the check above says which                                                                                                       |
| `no-unawaited-helper`            | `expectEmission`, `expectError`, `stable`, `flushEventLoop` and their siblings called as a statement and dropped                                                           | The promise settles after the test has already ended, so the assertion inside it reports into a later test, or nowhere. The run stays green and the spec looks like it asserted something                                                                                                                                                               |

The check that motivated the tool: a spec showing `Cannot find name 'vi'` in the editor while
`tsc --noEmit` reported zero errors. A migration codemod editing `include` had eaten a `/**`,
turning `src/**/*.spec.ts` into `src*.spec.ts` — a syntactically valid glob that matches nothing.
Nine of 152 spec tsconfigs still covered their specs.

**It never writes.** `doctor` reads the repository and prints; there is no `--fix`. Exit code 1
when anything above a note was found, 0 otherwise, so it drops into CI as one line.

Two shapes of pattern are deliberately exempt, because for them "matches nothing" is not evidence
of anything: a declaration-only glob (`src/**/*.d.ts`, routinely a placeholder for ambient types
that do not exist yet) and a pattern rooted in a directory the scan never enters (`dist`,
`out-tsc`, `coverage`).

### The two checks that resolve a name

`helper-from-wrong-entry` and `no-unawaited-helper` both answer a question about a name, and
neither guesses. The entry-point table they read is **generated from this package's own `exports`
map** — the barrels are compiled, the exported symbols are taken from the compiler, and the
promise-returning set is taken from the signatures rather than listed by hand. A hand-written copy
would drift the first time a helper moved between entries, and it would drift silently.

That is also why they are `doctor` checks and not lint rules: a per-file linter has no such table.

Both are conservative on purpose.

- The table describes one major version. `doctor` reads the version actually installed in the
  repository and stays silent when the majors differ, because a helper moves between entries only
  in a major.
- `no-unawaited-helper` reports one shape and one only — a call that both begins a statement and
  ends one. Anything the promise could still flow out of is left alone: `await`, `return`, an
  assignment, an argument, a `.then`, a concise arrow body, an explicit `void`. So is a method of
  the same name, and so is any call whose callee this file did not import from us. `expectEmission`
  renamed with `as` is still resolved; somebody else's `stable` never is.
- Neither reads text that is not code. Strings, template literals and comments are skipped before
  anything is matched, so a codemod fixture, a docs generator, a quoted snippet in a `describe`
  title or a commented-out line is never reported. Comments are skipped first, because an
  apostrophe in prose would otherwise open a string. This is the case that decided the design: this
  package's own specs quote import statements, and a check that reported them would be red on the
  repository that ships it.

Run against this repository's own 758 source files, the two of them report nothing at all.

**Still read-only.** Both findings name a mechanical edit — change a specifier, add an `await` —
and neither is applied. There is no `--fix` in `doctor` at all, and that is a decision rather than
a gap: a tool that has just told you it found four things nothing else could see has not yet earned
write access to the files it read.

## `perf` — where the CPU time actually goes

Vitest prints one summary line per run — `Duration 8.91s (transform 26.20s, setup 14.70s, import
55.27s, tests 27.24s, environment 155.65s)` — and that line is the only place the six numbers ever
surface. It says environment setup is 56 % of the CPU time; it does not say which of a suite's 1 400
spec files never needed a DOM. `perf` reads the same numbers per file, through `TestModule.diagnostic()`
— Vitest's own public accessor, via a reporter this package ships — and turns the phase that
dominates into a list of files and the rule that put them there. Nothing here parses terminal
output.

```bash
npx vitest-auto-spy perf              # run the whole suite once and report
npx vitest-auto-spy perf src/cli      # path passed through to Vitest as a file filter
npx vitest-auto-spy perf --json out/perf.json   # re-analyse a report instead of running Vitest
npx vitest-auto-spy perf --out out/perf.json    # keep the JSON this run writes
```

```
$ npx vitest-auto-spy perf src/cli
vitest-auto-spy perf — /Users/alexeypopov/Desktop/projects/vitest-auto-spy
16 test files, 860ms wall clock, 17.30s of CPU time summed over the workers

  phase               time    share
  prepare            6.34s    36.7%
  environment        5.46s    31.6%
  setup              3.01s    17.4%
  transform          1.19s     6.9%
  import             879ms     5.1%
  tests              411ms     2.4%

info   perf-environment
       Environment setup is 31.6% of the measured CPU time, against 2.4% in the test bodies. No
       spec file could be proved DOM-free, so this names none; 109 were left undecided.
       → Move what does not need a DOM to the `node` environment. Rule used — a spec is listed
         only when it, the configured setup files and every repository module any of them imports
         were read and none of them mentions a DOM name (document, window, HTML*, *Event, TestBed,
         …), and every package they import is one of: vitest, rxjs, vitest-auto-spy,
         vitest-auto-spies, date-fns, dayjs, luxon, lodash, lodash-es, ramda, immer, uuid, nanoid,
         zod, decimal.js, big.js, reflect-metadata. Background:
         https://asdalexey.github.io/vitest-auto-spy/core/performance#what-actually-makes-a-suite-slow

info   perf-isolation
       Per-file environment, setup and prepare together are 85.6% of the measured CPU time. Those
       three are what `test.isolate: false` pays once per worker instead of once per file.
       → It is a trade, not a win — without isolation every double a file created stays alive for
         the whole worker, so peak memory grows with the suite. This package's own measurements of
         that are at
         https://asdalexey.github.io/vitest-auto-spy/core/performance#memory-under-isolate-false;
         take yours before switching.

0 errors, 0 warnings, 2 notes
```

That is this repository's own suite. It names zero DOM-free candidates and leaves 109 files
undecided, because `src/test-setup.ts` builds an Angular `TestBed` before every spec — the rule
below is why a real repository can get an honest "cannot tell" instead of a guess.

**The phase totals are CPU time summed across workers**, not wall clock — the run above took 860ms
on the clock and 17.30s of CPU because the work was spread across several workers. A phase total
larger than the wall clock is not a bug.

| Phase         | What Vitest measures (its own `ModuleDiagnostic` wording)                                   |
| ------------- | ------------------------------------------------------------------------------------------- |
| `environment` | The time to import and initiate an environment (`jsdom`, `happy-dom`, `node`) for the file  |
| `prepare`     | The time Vitest spends setting up the test harness — runner, mocks — for the file           |
| `import`      | The time to import the test module: everything it imports, plus running its suite callbacks |
| `setup`       | The time to import the configured setup file(s) for the file                                |
| `tests`       | Accumulated duration of the test bodies and hooks themselves                                |
| `transform`   | Whole-run transform time (esbuild/Vite), not tracked per file so it has no per-file finding |

A phase only produces findings once it is worth a reader's afternoon: below 30 % of the total, or
below 5 s of total CPU time across the whole run, `perf` says so and stops rather than naming files
over noise.

**`perf-environment`** fires when `environment` dominates. It ranks every spec file that is
_DOM-free_ — provably so, not probably — by the environment time it cost, and suggests
`// @vitest-environment node` (or a `node`-environment project) for each. The rule is deliberately
one-sided: a spec is a candidate only when it, the configured setup files, and every repository
module any of them imports were read, none of them mentions a DOM name, and every package they
import is on a short DOM-free allowlist (`vitest`, `rxjs`, `date-fns`, `lodash`, `zod`, …). Anything
the rule cannot resolve — an import it cannot follow, a package off the allowlist — is reported as
**undecided**, never assumed safe: a false positive is somebody's suite failing on `document is not
defined`, and that costs more than a missed optimisation. On this repository the rule names nothing
and calls 109 files undecided, for the reason above.

**`perf-environment-engine`** is the other half of the same advice, for the files `perf-environment`
cannot move: a spec that genuinely needs a DOM still has to build one, and `happy-dom` builds it for
less. Measured on this package's own Angular suite, the same 117 files and the same assertions:
**26.5 s of user CPU against 23.2 s**, or 12 % less. On a spec that builds a DOM and does nothing
else the gap is far wider — 253 ms against 119 ms of environment time per file — so how much of it a
suite gets back depends on how much of a file the environment is. It fires only when a `vite(st).config.*` names `jsdom` and
nothing in those configs mentions `happy-dom` — a suite that has already made the choice does not
get asked again. It is a swap, not a flag: `happy-dom` implements less of the platform, so change
one project at a time and keep the suite green after each.

**`perf-import`** fires when `import` dominates, and names every spec that reaches its subject
through a barrel — an `index`/`public-api` module with no declaration of its own, only re-exports —
because a spec importing one loads everything the barrel re-exports to use one export from it. It
does not fire in the run above, because `import` is only 5.1 % of this repository's total.

**`perf-isolation`** fires when `environment` + `setup` + `prepare` together dominate, and points at
`test.isolate: false` — the setting that pays those three once per worker instead of once per file.
It is framed as a trade, not a win, and links to this package's own memory measurements
([`core/performance#memory-under-isolate-false`](/core/performance#memory-under-isolate-false))
rather than repeating the numbers here: without isolation, every double a file created stays alive
for the rest of the worker, so peak memory grows with the suite. `perf` does not suggest the flag
when a `vite(st).config.*` already sets `isolate: false` — reporting a setting a reader already
made is not a finding.

**`perf-workers`** is the one finding here that is about memory rather than time. Vitest takes one
worker per core, and a worker is a whole runtime: measured on this package's own Angular suite,
resident memory came to **1.42 GB plus ~155 MB per worker**, so on a 16-core machine the eight
workers past a cap of four are about 1.9 GB on their own. The wall clock that cap costs is small —
on a field deployment of this package, **13.50 s against 13.13 s** at the eight-worker optimum, or
2.8 %, for 3.7 GB of resident memory instead of 5.8 GB. It fires only on a run whose summed CPU time
is over a minute, and only when no `maxWorkers` is declared: below that the setting is a detail, and
a suite that has set it has already had this thought. The number itself is a property of the
machine, not of the suite — take your own reading before fixing it.

**Exit code.** `perf` always exits `0` on a successful analysis — a slow suite is not a failing one,
so it never fails a CI job on its own. It exits `1` only when it has nothing to read: no Vitest
installed in `--cwd`, the package's own `dist/perf-reporter.js` missing, the Vitest run itself
producing no report, or a `--json` file that does not parse as one. If the suite ran but failed,
`perf` still reports the timings it measured, with a warning that the run itself did not pass.

### When a bare run is not your suite

`vitest run` with no path reads the configuration in the directory it was started in, and in plenty
of repositories that configuration does not exist: the suite is assembled by an Angular builder, an
Nx target, or a script that generates a config per project. There, a bare run takes the Vitest
defaults — no `globals`, no path aliases, an `include` that sweeps up every `*.spec.*` in the tree
including build output — and every file fails to collect. Measured on one such workspace: **1 830
files, 29 s of wall clock, 0 test bodies executed**, and a phase table that looked entirely
plausible because transform and environment are real seconds however the files ended.

`perf` refuses both halves of that. Before running anything it checks whether a bare run would be
this repository's suite at all — no root `vite(st).config.*`, and a `test` script that does not
invoke `vitest` itself — and stops with the two ways out instead of spending the half-minute. And
whatever the source, a report in which **no test body finished** is not printed as a measurement:
it exits 2 and says how many files were collected against how many bodies ran.

```bash
npx vitest-auto-spy perf --command 'npm test'                    # measure your own command
npx vitest-auto-spy perf --command 'npm test -- {paths:--include=}' --gate
```

`--command` runs that shell line with `VITEST_AUTO_SPY_PERF_OUT` and `VITEST_AUTO_SPY_PERF_REPORTER`
in its environment. The configuration the command reaches attaches the reporter itself, which is two
lines wherever its `reporters` are declared:

```ts
const perf = process.env['VITEST_AUTO_SPY_PERF_REPORTER'];

reporters: perf === undefined ? ['default'] : ['default', perf],
```

The reporter writes nothing at all unless `VITEST_AUTO_SPY_PERF_OUT` names a file, so a repository
whose runner config cannot be rewritten per run can declare it permanently and pay nothing on the
runs that are not measuring anything.

`{paths}` in the command is where the files of a confirmation pass go; `{paths:<prefix>}` puts a flag
in front of each one, which is what a harness taking `--include=<glob>` needs. Without the token the
command cannot be narrowed, and the gate says so rather than re-running the whole suite to confirm
one file.

### The gate

`--gate` is the only part of `perf` that fails anything. Everything else it prints is advice, and
advice must never redden a merge request; a gate has the opposite obligation, so every finding in it
has to be something the author of the diff did and can undo. Three decisions follow, and they are the
whole design.

**It judges test bodies, not the machine.** Of the six phases, `environment`, `prepare`, `setup` and
`transform` are the harness: they scale with the file count and the CPU, and no spec author makes one
of them smaller by writing better code. `import` is worse to attribute — under a shared worker the
first file to reach a module pays for all of them, so the bill lands on whichever file the scheduler
started. `tests` is the one phase that is somebody's code, so `tests` is what the budgets are over.

**A budget is relative first and absolute second.** A file is over budget when it is over
`--max-file-ms` **and** over `--factor` × the median file of the same run. The median moves with the
machine, so the verdict survives a change of hardware; the absolute floor stops a fast suite from
reporting its own fastest outlier as a defect. A suite that is uniformly slow produces no file
finding at all — there is no outlier in it — which is what `--max-wall-ms` is for, and that one is
off unless you ask, because wall clock is a property of the runner.

**Nothing fails on one measurement.** Every candidate is re-measured on its own before it is allowed
to fail anything, through the same `--command` the first reading came from. A file that is not slow
when it has the machine to itself is reported as **not reproduced** — an `info`, not a finding —
because "your test is slow" and "your test shared a worker with four others" are different
statements, and a gate that cannot tell them apart is switched off within a week. Where no
confirmation is possible the findings are warnings that fail nothing, unless `--no-confirm` says one
reading is enough.

```
$ npx vitest-auto-spy perf --json out/perf.json --gate --command 'npm test -- {paths:--include=}'

perf gate: re-measuring 1 file on their own before failing anything.

error  perf-gate-slow-test libs/a/src/lib/thing.spec.ts
       `Thing > waits for the retry` spent 4.31s in its body, over the 1.00s budget
       (--max-test-ms 1000). Re-measured on its own: 4.05s, still over budget.
       → A test body over a second is usually waiting rather than working: a timer nobody advanced
         (`vi.useFakeTimers()` and `vi.advanceTimersByTime`), a real request or a real animation
         frame, an `await` on something that settles on a schedule, or a fixture rebuilt from
         scratch in every case.

1 error, 0 warnings, 0 notes
```

The gate refuses to judge a run that did not pass: a failed test is measured until its timeout, and
30 s of timeout looks exactly like 30 s of slow code. It also never gates a file outside
`--gate-only` when that is given — CI can pass the spec files the branch touched, and the median is
still taken over the whole run.

**Exit codes.** `0` — the report was read and nothing failed. `1` — the gate failed, and that is the
only thing that means "your suite is over budget". `2` — there was nothing to judge: no Vitest, no
report, a `--json` file that does not parse, a run in which no test body executed, or a red suite
under `--gate`.

### The two tables, and the shards they were merged from

Under the phase table `perf` prints the two lists a reader actually opens the report for — **the
slowest files** and **the slowest test bodies** — because the phase table is a total and the rules
above it only fire on specific fixable shapes. The file table carries `ms/test` next to `time`, and
that column is the one that decides whether to open the file: 400 tests sharing 6 s is a large file,
3 tests sharing 6 s is a slow one. `--top 0` turns both off; a run whose slowest file is under a
second prints neither.

A sharded pipeline writes one report per job, and a rule that compares a file against **the median
of its own run** then compares it against a quarter of the evidence. `--json` takes a directory or a
pattern and merges them:

```bash
npx vitest-auto-spy perf --json 'coverage/**/perf-*.json' --gate
```

Transform time adds, wall clock does **not** (the shards ran at the same time, so the merged wall
clock is the longest of them), the version is the poorest of the inputs, and a file measured in two
shards keeps the slower measurement and is named. The merge also re-bases every report onto one
root, and that is load-bearing rather than tidy: GitLab clones each job into its own build
directory, so four reports do not agree on where the repository is, and a merge that kept the
absolute paths would silently drop three shards' files.

### The baseline — catching what a single run cannot see

A gate on today's numbers is blind to the regression that actually accumulates: a file that took
300 ms last month and takes 900 ms today, under every budget the whole way, one `beforeEach` at a
time. `--baseline` closes that against a committed record:

```bash
npx vitest-auto-spy perf --json out/perf.json --update-baseline    # record; commit the file
npx vitest-auto-spy perf --json out/perf.json --gate --baseline perf-baseline.json
```

**It is recorded as a ratio, not in milliseconds**, and that is the whole reason it works. The
baseline is written on somebody's laptop and compared on a runner two to five times slower sharing a
host with three other jobs; in milliseconds every file would be "1.8× worse" and the ratchet would
report the hardware. What is stored is each file's share of the median file of its own run, which a
slower machine raises in the numerator and the denominator alike. A file that went from 3× the
median to 9× did so because of something in the repository.

A regression becomes an ordinary gate candidate — the same confirmation pass re-measures it on its
own, and the message states the milliseconds that share is worth in **this** run, so the number on
the screen can be checked against a clock. Files the baseline does not know are new, files it knows
that this run did not measure were somebody else's shard, and neither is a finding: both are
reported as drift. `--baseline-factor` (2) and `--baseline-floor-ms` (500) are the two thresholds.

### Flags

| Flag                  | Effect                                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--cwd <dir>`         | Run against another directory instead of the current one (shared with the other commands)                                                                         |
| `--json <path>`       | Read reports instead of running Vitest: one file, a directory, or a pattern such as `coverage/**/perf-*.json`, which merges every report a sharded pipeline wrote |
| `--out <path>`        | Keep the JSON report at this path. Without it, the report is written under `node_modules/.cache` and deleted once read                                            |
| `--command <c>`       | Measure this shell line instead of running Vitest directly; `{paths}` / `{paths:<prefix>}` take the files of a confirmation pass                                  |
| `--gate`              | Fail the run over a confirmed budget. Exit 1                                                                                                                      |
| `--max-test-ms`       | Budget for one test body. Default 1000; nothing under 100 ms is recorded, so that is the floor                                                                    |
| `--max-file-ms`       | Budget for a file's bodies added up. Default 5000, and the file must also be over `--factor` × the run's median                                                   |
| `--factor <n>`        | How many times the median file a file has to be. Default 10 — this is what makes the verdict machine-independent                                                  |
| `--max-wall-ms`       | A whole-run budget. Off by default: wall clock is a property of the runner, so nothing derives it for you                                                         |
| `--gate-only`         | Comma-separated paths the gate may judge; the median is still taken over the whole run                                                                            |
| `--no-confirm`        | Skip the confirmation pass and gate on a single reading                                                                                                           |
| `--baseline <p>`      | Compare against a committed baseline and fail on what grew; recorded as a ratio to the run's median file, so a slower machine is not a regression                 |
| `--update-baseline`   | Record this run into the baseline instead of judging it. Defaults to `perf-baseline.json`                                                                         |
| `--baseline-factor`   | How many times its recorded share a file has to take before it is a regression. Default 2                                                                         |
| `--baseline-floor-ms` | The absolute floor under which a grown file is still noise. Default 500                                                                                           |
| `--top <n>`           | Rows in the "slowest files" and "slowest bodies" tables; `0` turns them off. Default 10                                                                           |

A positional path (`npx vitest-auto-spy perf src/cli`) is passed through to Vitest as its file
filter; with none, `perf` measures the whole suite.

## `init` — the pointer an agent actually reads

There is no zero-setup path into any coding agent's instruction context. Every tool discovers rules
from a fixed set of repository-root or dot-directory paths, and **none of them scans dependencies**
— the skill and the `AGENTS.md` shipped inside this package's tarball are never auto-discovered.
Something in the repository has to point at them, once.

```bash
npx vitest-auto-spy init
```

**Tier 1, always written** — three root files cover the whole field:

| File                                      | Read by                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                               | Codex, Cursor, Copilot, Cline, Windsurf, Zed, OpenCode, Qwen, Roo, Junie, Aider                                                                         |
| `CLAUDE.md`                               | Claude Code, and GLM / Kimi running inside it                                                                                                           |
| `GEMINI.md`                               | Gemini CLI, which does not read `AGENTS.md` by default                                                                                                  |
| `.claude/skills/vitest-auto-spy/SKILL.md` | Claude Code — a stub whose frontmatter is copied verbatim from the shipped skill, over a body that only points at `node_modules`, so it cannot go stale |

**Tier 2, only when the tool's own directory already exists**, and glob-scoped so it costs no
context on a task that is not about tests: `.cursor/rules/`, `.github/instructions/`,
`.windsurf/rules/`, `.devin/rules/`, `.clinerules/`, `.roo/rules/`.

**Never created:** `.rules`, `.cursorrules`, `.windsurfrules`, or `.clinerules` as a _file_. Zed
resolves instructions first-match-wins over an ordered list that ends in `AGENTS.md`, so creating
any of them silently shadows the entire project's instructions. If one already exists, `init`
appends to it rather than leaving it stale.

### Why a command rather than the snippet

The [paste-able snippet](/agents) has to state every runner and every adapter, and half of it is
false for any given repository. `init` reads the consuming `package.json` and the test config and
writes only the true half — which subpath matches this runner, which adapter matches the framework,
the actual path of the setup file that needs `import 'vitest-auto-spy/rxjs'`, and it omits the rxjs
bullet entirely when rxjs is not installed.

### Idempotent by construction

Everything is written between markers:

```md
<!-- vitest-auto-spy:begin v=3.7.0 sha=90452bea -->

…

<!-- vitest-auto-spy:end -->
```

The text between them is regenerated in full on every run; text outside them is never read and
never reformatted. Running `init` after an upgrade is a no-op or a one-hunk diff. A `CLAUDE.md`
that is a symlink to `AGENTS.md`, or that already carries an `@AGENTS.md` import line, is left
alone — both are ways of keeping one instruction file, and writing through either would duplicate
the block.

The block is kept under 1.6 kB on purpose. Codex caps the whole root→cwd `AGENTS.md` chain at
`project_doc_max_bytes` (32 768 bytes by default) and silently truncates past it, so `init` warns
when the file it appended to crosses that line.

### Flags

| Flag              | Command  | Effect                                                                    |
| ----------------- | -------- | ------------------------------------------------------------------------- |
| `--cwd <dir>`     | all four | Run against another directory                                             |
| `--check`         | `init`   | Write nothing; exit 1 if the block is missing or out of date. The CI form |
| `--dry-run`       | `init`   | Print what would change and write nothing                                 |
| `--uninstall`     | `init`   | Remove the managed blocks and delete the files `init` created             |
| `-h`, `--help`    | all four | The usage screen                                                          |
| `-v`, `--version` | all four | The installed version                                                     |

`perf`'s own flags — `--json`, `--out` — are on [its section above](#perf-—-where-the-cpu-time-actually-goes).
The codemod's own flags — `--write`, `--verify`, `--only`, `--skip`, `--list` — are on
[its page](/utilities/codemod#flags).

`init --check` in CI is the same shape as `llms:check` in this repository: it fails when the block
on disk is not the block the installed version would write, which is exactly when an upgrade
changed the advice.

## In CI

```yaml
- run: npx vitest-auto-spy doctor
- run: npx vitest-auto-spy init --check
- run: npx vitest-auto-spy codemod --verify # on a suite that has been migrated
- run: npx vitest-auto-spy perf --out perf.json # always exits 0 — not a gate, an artifact to keep
```

None of them need a network, a config file, or a token. The CLI ships with the package, has no
runtime dependencies of its own, and is the only part of it allowed to touch `node:fs` — an
invariant this repository checks on every build.
