---
title: The CLI — doctor and init
description: npx vitest-auto-spy doctor finds suite-level defects that never fail a run — a tsconfig include pattern matching no file, a spec another file imports, a foreign runner's pragma, config for a runner that is gone. npx vitest-auto-spy init writes the pointer every AI coding agent in the repository actually reads.
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
| `tsconfig-glob-matches-nothing`  | An `include` pattern that matches no file                                                                                                                                  | A glob that matches nothing type-checks nothing, and `tsc` reports success                                                                                                                                                                                                                                                                              |
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

| Phase         | What Vitest measures (its own `ModuleDiagnostic` wording)                                     |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `environment` | The time to import and initiate an environment (`jsdom`, `happy-dom`, `node`) for the file       |
| `prepare`     | The time Vitest spends setting up the test harness — runner, mocks — for the file               |
| `import`      | The time to import the test module: everything it imports, plus running its suite callbacks     |
| `setup`       | The time to import the configured setup file(s) for the file                                    |
| `tests`       | Accumulated duration of the test bodies and hooks themselves                                     |
| `transform`   | Whole-run transform time (esbuild/Vite), not tracked per file so it has no per-file finding      |

A phase only produces findings once it is worth a reader's afternoon: below 30 % of the total, or
below 5 s of total CPU time across the whole run, `perf` says so and stops rather than naming files
over noise.

**`perf-environment`** fires when `environment` dominates. It ranks every spec file that is
*DOM-free* — provably so, not probably — by the environment time it cost, and suggests
`// @vitest-environment node` (or a `node`-environment project) for each. The rule is deliberately
one-sided: a spec is a candidate only when it, the configured setup files, and every repository
module any of them imports were read, none of them mentions a DOM name, and every package they
import is on a short DOM-free allowlist (`vitest`, `rxjs`, `date-fns`, `lodash`, `zod`, …). Anything
the rule cannot resolve — an import it cannot follow, a package off the allowlist — is reported as
**undecided**, never assumed safe: a false positive is somebody's suite failing on `document is not
defined`, and that costs more than a missed optimisation. On this repository the rule names nothing
and calls 109 files undecided, for the reason above.

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

**Exit code.** `perf` always exits `0` on a successful analysis — a slow suite is not a failing one,
so it never fails a CI job on its own. It exits `1` only when it has nothing to read: no Vitest
installed in `--cwd`, the package's own `dist/perf-reporter.js` missing, the Vitest run itself
producing no report, or a `--json` file that does not parse as one. If the suite ran but failed,
`perf` still reports the timings it measured, with a warning that the run itself did not pass.

### Flags

| Flag           | Effect                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------- |
| `--cwd <dir>`  | Run against another directory instead of the current one (shared with the other commands) |
| `--json <path>` | Read a report an earlier `--out` run wrote, instead of running Vitest again              |
| `--out <path>`  | Keep the JSON report at this path. Without it, the report is written under `node_modules/.cache` and deleted once read |

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

`perf`'s own flags — `--json`, `--out` — are on [its section above](#perf-where-the-cpu-time-actually-goes).
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
