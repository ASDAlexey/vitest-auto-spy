# vitest-auto-spy — Before you report success

Part of the agent reference [`AGENTS.md`](../AGENTS.md), which maps every section to its file. Section numbers are shared with it.

## 19. Before you report success

Run what the project actually has — check its `package.json` first.

```bash
npx vitest run path/to/file.spec.ts   # or: bun test path/to/file.test.ts
npx tsc --noEmit                      # Spy<T> mistakes are compile errors, not runtime ones
npx vitest-auto-spy doctor            # suite-level defects that never fail a run
```

**If you are an agent, add `--reporter=agent`** (Vitest 4.1). It is Vitest's own reporter, added for
exactly this: the same failures, without the passing-test roll call and the repeated banners that
make a run's output expensive to read and expensive to carry.

```bash
npx vitest run --reporter=agent path/to/file.spec.ts
```

Type errors matter here more than usual: most of this library's guarantees are type-level, so a
suite that runs green but does not type-check is not done.

`doctor` is read-only and finds what a green run cannot: a `tsconfig` `include` pattern that
matches no file (so it type-checks nothing while `tsc --noEmit` still reports success), a
production module importing a `*.spec.ts`, a spec importing another spec, a `@jest-environment`
pragma the runner never reads, configuration left behind for a runner that is gone, and a setup
file an Angular or Nx unit-test target never runs because the target does not name it. Three of
its checks are about coverage, where the run is green and the report is simply not the one the
config describes — `coverage.all` on a Vitest that stopped reading the key, a source-only
`coverage.include` in a runner config over a bundle, and a scope so large that `picomatch`
recompiling it per file costs more than collecting the coverage does. Two are about the Angular
builder's version: `@angular/build` in `[22.1.5, 22.1.7)` (`angular-build-splitting-off`), and an
`@analogjs/vite-plugin-angular` below 2.7.5 next to `@angular/build` 22.2 or newer
(`analog-behind-angular-build`), which dies at startup with `TypeError: cache.has is not a function`.
Five are about Vitest 5. On Vitest 5, `vitest-5-removed` reports what it took away and the run now
trips over — an import from `vitest/reporters`, `vitest/coverage`, `vitest/environments`,
`vitest/snapshot`, `vitest/runners`, `vitest/suite` or `vitest/mocker`, a `.sequential` chain,
`--outputJson`/`--compare` in a script — as errors; on Vitest 4 the same lines are upgrade notes.
`poolOptions` on Vitest 4 or newer is a warning, because Vitest runs without every option inside it.
`vitest-5-deprecated` names the two renamed programmatic calls nothing warns about. `vitest-5-clear-mocks`
says `clearMocks: true` restates the Vitest 5 default, and tells a Vitest 4 suite that never set it
to price the change with `npx vitest run --clearMocks` first. `vitest-5-available` tells a Vitest 4
repository what the upgrade buys — or names what holds it back: `@angular/build` below 22.2.0 beside
a unit-test target, Analog below 2.7.5, `vite` below 6.4, or Node below 22.12 in `.nvmrc`,
`.node-version`, CI or a private package's `engines`. `fs-module-cache-not-persisted` warns when
`fsModuleCache` is on and no CI config caches its directory. Renamed config keys Vitest 5 still
honours (`experimental.fsModuleCache`, `browser.isolate`, `cache.dir`, …) are left to Vitest's own
deprecation line. `mock-reset-config-unread` notes a `no-redundant-mock-reset` whose `configFile` names
a config built by a factory or `mergeConfig`, with no flag beside it: the rule cannot see the flags
that call sets.
It is worth one run after any large edit to a test suite — especially after a codemod, which is where
the eaten glob below came from.

Two of its checks are about this package's own names. `helper-from-wrong-entry` catches a named
import taken from an entry that does not export it — `provideAutoSpy` from the root rather than
`/angular` or `/nestjs`, `expectRequest` from anywhere but `/angular-http`. It reads both directions
of the 5.21.0 Angular split — one of the thirty-two moved names still taken from `/angular`, and a
core name taken from `/angular/diagnostics`, `/angular/doubles` or `/angular/matchers`, which export
none of them — which makes it what fails that upgrade rather than a compiler: a repository green on
5.20.0 exits 1 here with no test run, and the fix line names the companion to move to.
It names only entries the install resolved from the file publishes, so a newer CLI run against an
older install of the same major stays silent instead of pointing at an entry that is not there.
`no-unawaited-helper`
catches an `expectEmission` / `expectError` / `stable` / `flushEventLoop` called as a bare statement
and dropped, so the promise settles after the test ended and its assertion reports into a later test
or nowhere. Both resolve the name against a table **generated from this package's own `exports`
map**, which is why they are `doctor` checks and not lint rules: a per-file linter has none. Both
are conservative — the callee must have been imported from this package in that same file (a rename
with `as` still counts), the call must both begin and end a statement, and the pair goes quiet when
the installed major differs from the table's. Neither has a fixer; `doctor` still never writes.
Full reference: <https://asdalexey.github.io/vitest-auto-spy/utilities/cli>.

**Three things about the CLI that decide whether its answer means anything:**

- **An unknown flag is refused, exit 2, nothing runs.** `init --dryrun` used to write the files and
  `perf --gat` used to pass with no gate at all — a typo in CI that read as a clean result. The two
  stderr lines name the flag and list what the command accepts; `--cwd`, `--help` and `--version`
  work everywhere.
- **The scan does not descend into a nested repository or a git worktree.** A tree carrying
  worktrees under it listed every file twice, so `doctor` reported each import graph in duplicate and
  `codemod --write` would have rewritten specs on another branch. A `.git` entry is a stop, whether
  it is a directory (a nested clone) or a file (a worktree). Directories git ignores are skipped too
  — every `.gitignore` from the scan root down, `.git/info/exclude` and the per-user
  `core.excludesFile`, directories only, so an ignored file is still listed. Past 50 000 files the scan still
  truncates, and `doctor` reports that as a `scan-cap-reached` warning (exit 1) rather than a clean
  result; `VITEST_AUTO_SPY_SCAN_CAP` raises the cap.
- **A path that matches no file is an error, exit 2.** _Nothing left to migrate_ off a path nobody
  read is not a clean result. Absolute paths and `./`-style ones resolve against `--cwd`.

Exit codes, as the commands implement them: **0** is "ran, nothing to report"; **1** is "ran, and
here is the finding" — `doctor` with an error, `init --check` with a stale block, `codemod` with any
note, `perf --gate` over budget; **2** is "there was nothing to judge" — no command, an unknown
command, an unknown flag, a flag value it cannot use (an `--min-severity` word it does not know, a
number flag given a word or a negative number, a value flag with nothing after it, an `--ignore` id
`doctor` has no check for), an unreadable `--only` / `--from` value, a path matching no file, and a
`perf` run that measured nothing (including a red suite, which the gate will not judge at all). An
invalid flag value stops the command before it does anything: the message says so (`Nothing ran.`),
and a typo in a command, a flag, `--only` or `--ignore` gets a `Did you mean`.

**Reading the output from a script: `--format json`**, on `doctor` and on `perf`. One JSON document
on stdout — `schema`, `exitCode`, `tally` (`errors`, `warnings`, `notes`), every finding with
`check`, `severity`, `file`, `message`, `fix`; `perf` adds `run` (with `slowestFiles`, the `--top` slowest files per phase), `budgets` and `gate.verdicts` (one row
per candidate, `outcome` one of `confirmed`, `not reproduced`, `unconfirmed`, `single reading`,
`over budget`). Parse that rather than the text: the text is wrapped to the terminal (80 columns in a
pipe), groups one cause found in many files into one block, and ends in a tally line that starts
with `N errors, N warnings, N notes`. In the text, every finding ends in a `Docs:` line — its own
section of the CLI page (`utilities/cli#<check-id>`), or of the codemod page for a codemod note. `--format markdown` renders the same document as tables — for a
merge request note or a job summary, not for parsing.

**`doctor --ignore <check,…>`** leaves the named checks out of the report, the tally, the exit code
and the `--code-quality` file. Use it only for a finding the repository has answered in a way
`doctor` cannot see — `no-agent-instructions` in CI where the instruction files are kept out of git,
`angular-build-splitting-off` under a patched builder. An id `doctor` has no check for is exit 2,
with the closest id suggested. `--min-severity` hides findings from the text
only; `--ignore` removes them.

### If you were asked why a suite is slow

```bash
npx vitest-auto-spy perf              # runs the suite once and reports; exits 0 without --gate
npx vitest-auto-spy perf src/some/dir # a path is passed through to Vitest as a file filter
```

It reads Vitest's own per-file phase timings through `TestModule.diagnostic()` — nothing here
parses terminal output — and reports six phases: `environment`, `import`, `tests`, `setup`,
`prepare` (all measured per file) and `transform` (measured once for the whole run before Vitest 5,
per file on 5, where it is the wait for Vite's transforms and `import`/`setup` are net of it). **The phase
totals are CPU time summed across every worker, not wall clock** — a report showing `20.29s of CPU
time` under `986ms wall clock` is not a bug, it is the work spread over workers.

When `environment` dominates, the `perf-environment` finding names spec files that could run under
the `node` environment instead — but only the ones it could _prove_ reach no DOM: the spec, its
configured setup files, and every repository module any of them imports were all read, none
mentions a DOM name, and every package they import is on a short allowlist (`vitest`, `rxjs`,
`date-fns`, `lodash`, `zod`, …). Anything it could not resolve is reported **undecided**, never
assumed safe — do not treat an undecided file as a candidate, and do not add packages to that list
yourself; a false positive breaks someone's suite on `document is not defined`. When `import`
dominates, `perf-import` names specs that reach their subject through a barrel (`index`/`public-api`
re-exporting a whole directory). When `environment` + `setup` + `prepare` together dominate,
`perf-isolation` suggests `isolate: false` in the config it names, kept only if peak memory stays
acceptable; its `Docs:` line leads to the check's section of the CLI page, which links this
package's own memory measurements of that trade — read them before recommending the flag, since it
raises peak memory.

Two more findings are about settings rather than files. `perf-environment-engine` fires when
`environment` dominates and a `vite(st).config.*` names `jsdom` while nothing in those configs
mentions `happy-dom`: measured on this package's own 117-file Angular suite, `happy-dom` is 23.2 s of
user CPU against jsdom's 26.5 s, and on a spec that builds a DOM and does nothing else the gap is
253 ms against 119 ms per file. It is a swap, not a flag — `happy-dom` implements less of the
platform — so take one project at a time; the finding names the config that sets `jsdom`, and the
numbers stay in the docs section. `perf-workers` fires on a run over a minute of summed CPU
that declares no `maxWorkers`, and it is the one finding here about **memory**: one worker per core
is the default, resident memory measured at 1.42 GB plus ~155 MB per worker, and a cap of four costs
about 2.8 % of wall clock. The finding itself counts this machine's cores
(`os.availableParallelism()`) and suggests half of them as `maxWorkers` in the config it names; the
figures above are in the docs section, not in the message. Do not quote a worker count as
universally right — it is a property of the machine.

**On Vitest 5, `perf` reads what Vitest 5 reports; an older Vitest prints exactly what it did before.**
The advice reads the configuration Vitest resolved (`isolate`, `pool`, `maxWorkers`, `environment`,
`fsModuleCache`) rather than the config text, and never advises against an option you set
explicitly. `perf-transform` fires when the wait for Vite's transforms is 30 % or more of the CPU time
with the module cache off, and advises `fsModuleCache: true` — kept between CI pipelines, or it only
helps locally. `perf-long-pole` names the file still running alone after every other lane went idle,
when that tail is at least 2 s and 30 % of the span. `perf-isolation` adds the workers spawned and
their summed start-up, with an "at least" wall-clock saving; `perf-workers` counts the lanes the run
used rather than the machine's cores; under `isolate: false`, `perf-heap` lists what each file added
to its lane's heap. Environment time is counted once per lane (`concurrencyId`) and value — not per
`workerId`, which Vitest 5 renews for every file even in a reused worker. A finding about a switch
also prints `perf-vitest-doctor`: confirm it with `npx vitest doctor`, Vitest's own A/B runner, not
this package's `doctor`. A bare run on Vitest 5 passes `--experimental.diagnostics=false` so Vitest's
own hints do not repeat these. The reporter rewrites a `partial: true` report every ~2 s while the run
goes, so a killed or timed-out run still leaves one: `perf` prints it under a warning and the gate
refuses it like a red run.

**A bare `vitest run` is not every repository's suite, and `perf` refuses to pretend otherwise.**
Where the suite is assembled by something else — an Angular builder, an Nx target, a script that
generates a config per project — there is no root `vite(st).config.*`, the Vitest defaults sweep up
every `*.spec.*` in the tree with no globals and no aliases, and every file fails to collect. The
phase table that comes out of that is real seconds spent on nothing: measured on one such workspace,
1 830 files, 29 s of wall clock and **zero** test bodies executed. `perf` checks for that shape
before it runs anything, and refuses any report in which no body finished (exit 2). Measure the
repository's own command instead:

```bash
npx vitest-auto-spy perf --command 'npm test'                          # measure that command
npx vitest-auto-spy perf --command 'npm test -- {paths:--include=}' --gate
```

`--command` puts `VITEST_AUTO_SPY_PERF_OUT` and `VITEST_AUTO_SPY_PERF_REPORTER` in that command's
environment; the configuration it reaches attaches the reporter itself (`reporters: perf ===
undefined ? ['default'] : ['default', perf]`), and the reporter writes nothing at all when the first
variable is unset, so it can be declared permanently — by name, `vitest-auto-spy/perf-reporter`. `{paths}` / `{paths:<prefix>}` is where the
files of a confirmation pass go.

**`--gate` is the only part of this command that fails anything**, and three rules keep it honest.
It judges the `tests` phase alone, because the other five are the harness and the machine rather than
anybody's code. A file budget is counted in the median test **of the same run** — the largest of
`--max-file-tests` (2 000) median tests, `--factor` (10) × the median test for each test in the file,
and a `--max-file-ms` (5 000) floor that can only spare a file — which is what makes the verdict the
same on a loaded CI runner and on an idle laptop, and what keeps a large file of ordinary tests out of
it: the rule it replaced, `--factor` × the median **file**, flagged 0 files of a 2 023-file consumer
suite at ×1 slowdown and 19 at ×9, a 209-test service spec at 5 ms a test among them. A confirmed finding
also says why: the confirmation pass records a CPU profile of each suspect file and every one of its
test bodies, and the gate prints the slowest tests, the share in hooks against bodies, and where the
time went in the spec, in your code and by package. The report ends in two tables of what is over
budget and nothing else. And every candidate is re-measured on its own before it may fail anything: a
file that is fast when it has the machine to itself is reported as _not reproduced_, an `info` rather
than a finding. Without a way to re-measure, findings are warnings that fail nothing unless
`--no-confirm` says one reading is enough. Exit `1` is "over budget", exit `2` is "there was nothing
to judge" — including a red or unfinished (`partial`) suite, which the gate will not judge at all, since a failed test is
measured until its timeout and 30 s of timeout looks exactly like 30 s of slow code.

`--json <path>` re-analyses a report an earlier `--out <path>` run wrote, instead of running Vitest
again. Full reference: <https://asdalexey.github.io/vitest-auto-spy/utilities/cli>.

### Migrating a suite off `jest-auto-spies` — run the codemod, then verify it

```bash
npx vitest-auto-spy codemod            # dry run: prints the diff, writes nothing
npx vitest-auto-spy codemod --write    # apply
npx vitest-auto-spy codemod --verify   # exits 1 on anything the transforms should have removed
```

Do not hand-edit a suite of migrated imports; the codemod knows which entry point exports each name
(it reads the installed package's export map) and it transposes `jest.Mock<R, [A]>` into the single
call signature Vitest takes — a plain rename compiles into the **reverse** meaning and nothing fails
until a call site disagrees. It leaves a `jest.*` member with no `vi` twin (`requireMock`,
`replaceProperty`, `createMockFromModule`, `jest.setTimeout`, `requireActual`) exactly as it was and
reports what to do instead, rather than guessing.

`--verify` matches the **result** against the patterns the codemod removes, so it also catches what
the transforms declined to enter (a template literal, an unbalanced bracket) and a file somebody
migrated by hand. Run it after `--write`, and again after any manual clean-up. `--only` / `--skip`
select transforms by id, `--list` prints them. Full reference:
<https://asdalexey.github.io/vitest-auto-spy/utilities/codemod>.

**Every rewrite is parsed before it is written.** The result goes through the project's own
`typescript` and its diagnostics are compared with the original's; a file the run would have broken
is reported as `codemod-broke-syntax` and **left exactly as it was**, so the run exits 1 with one
file named rather than a tree that no longer compiles. Where `typescript` is not installed the check
is skipped silently — it is a safety net, not an install instruction.

It visits JavaScript specs too — `*.spec.js`, `*.test.jsx`, the `.cjs` / `.mjs` forms — because a
Jest suite that was never TypeScript is the suite with the most `jest.` in it. Two things it now
reports instead of rewriting into something wrong: `jest.fn<R, [A]>()` / `jest.spyOn<…>()` in a file
that imports from `@jest/globals` (`jest-mock-type-arguments` — `jest-mock` 29 already takes the
whole function type, so transposing a second time produces a return type of a return type), and
`.withArgs(…)` on a `vi.spyOn` chain (`jasmine-with-args-on-spy-on` — `vi.spyOn` has no
`calledWith`, and renaming it onto one produces a method that does not exist).

Past 50 000 files the repository scan truncates and the run says so — _Nothing left to migrate_ off a
truncated list is a claim about a tree the tool never looked at. `VITEST_AUTO_SPY_SCAN_CAP` raises
the cap.

### If you are writing a codemod over specs

Two traps, both found the hard way on rxjs-heavy code.

**`String.prototype.replace` interprets `$` in the replacement.** `$&`, `` $` ``, `$'` and `$n` are
substitution patterns, and `$'` — "everything after the match" — is one character away from every
observable name in the codebase. A replacement containing `reloadAndSeekTo$'`
inserted the entire remainder of the file into itself and left an unterminated string; the only
thing that caught it was ESLint's `Parsing error`. Pass a function, which is never interpreted:

```ts
source.replace(from, () => to); // not source.replace(from, to)
```

**`node.getStart()` excludes leading comments.** A codemod that replaces a range starting there
silently eats the `// eslint-disable-next-line` above the node. Use `node.getFullStart()`, or count
the comments before and after and compare against `HEAD`.
