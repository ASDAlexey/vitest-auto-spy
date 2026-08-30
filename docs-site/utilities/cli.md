---
title: The CLI — doctor and init
description: npx vitest-auto-spy doctor finds suite-level defects that never fail a run — a tsconfig include pattern matching no file, a spec another file imports, a foreign runner's pragma, config for a runner that is gone. npx vitest-auto-spy init writes the pointer every AI coding agent in the repository actually reads.
---

# The CLI

Three commands, no dependencies, nothing to configure:

```bash
npx vitest-auto-spy doctor   # read-only. Exits 1 when it finds something
npx vitest-auto-spy init     # writes the agent instructions pointer
npx vitest-auto-spy codemod  # dry run by default. Exits 1 when it left something alone
```

They are one binary because they answer one question from three directions — _is anything in this
test suite quietly not doing what it looks like it is doing?_ `doctor` asks it of the repository,
`init` asks it of the agent about to write the next spec, and
[`codemod`](/utilities/codemod) asks it of every span a migration off `jest-auto-spies` would
otherwise rename into the reverse meaning. This page covers the first two; the codemod
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

| Check                           | What it finds                                                      | Why nothing catches it                                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsconfig-glob-matches-nothing` | An `include` pattern that matches no file                          | A glob that matches nothing type-checks nothing, and `tsc` reports success                                                                                                                                                                                                |
| `tsconfig-file-missing`         | A `files` entry naming a file that is gone                         | Same — the config is only read by editors once the runner stopped using it                                                                                                                                                                                                |
| `spec-imported-by-non-spec`     | A production module importing a `*.spec.ts`                        | Under a shared environment the import is a cycle, and the spec loses its own suite                                                                                                                                                                                        |
| `spec-exports-fixture`          | A spec importing another spec                                      | The imported file's suites are collected twice and its hooks run in a foreign file's context                                                                                                                                                                              |
| `foreign-runner-pragma`         | `@jest-environment` and friends left in a spec                     | Vitest never reads them; the environment comes from the config, so the comment looks operative                                                                                                                                                                            |
| `dead-runner-config`            | `jest.config.*`, `karma.conf.*` for a runner that is not installed | It is the first file a newcomer — or an agent — reads to learn how tests run                                                                                                                                                                                              |
| `orphan-runner-file`            | A setup file only that dead config referenced                      | One found this way had been empty since before the migration: a year as a setting that configured nothing                                                                                                                                                                 |
| `angular-build-splitting-off`   | `@angular/build` in `[22.1.5, 22.1.7)`                             | The unit-test bundle is built with code splitting off. `--coverage` then grows by hundreds of megabytes with no plateau, and the builder emits no warning — see [what it trades, and the escape hatch](/adapters/angular#when-the-unit-test-build-has-code-splitting-off) |
| `no-agent-instructions`         | No `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` names the package       | A note, not an error. It is the one moment where saying so costs nothing                                                                                                                                                                                                  |

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

| Flag              | Command   | Effect                                                                    |
| ----------------- | --------- | ------------------------------------------------------------------------- |
| `--cwd <dir>`     | all three | Run against another directory                                             |
| `--check`         | `init`    | Write nothing; exit 1 if the block is missing or out of date. The CI form |
| `--dry-run`       | `init`    | Print what would change and write nothing                                 |
| `--uninstall`     | `init`    | Remove the managed blocks and delete the files `init` created             |
| `-h`, `--help`    | all three | The usage screen                                                          |
| `-v`, `--version` | all three | The installed version                                                     |

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
```

Neither needs a network, a config file, or a token. The CLI ships with the package, has no runtime
dependencies of its own, and is the only part of it allowed to touch `node:fs` — an invariant this
repository checks on every build.
