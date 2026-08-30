---
title: For AI agents
description: llms.txt, llms-full.txt, a bundled AGENTS.md and a Claude Code skill — how to point Claude Code, Codex, Cursor or any other agent at this library.
---

# For AI agents

Most tests are now written with an assistant in the loop. Documentation an agent has to _infer_ the
API from costs tokens on every task and produces the same handful of mistakes each time, so this
package ships a second, compressed form of its documentation written for a machine reader: the
decision tree, the configuration semantics, an error→fix table and the anti-patterns.

## The five entry points

| What                                                                              | Where                                                                     | Best for                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`llms.txt`](/llms.txt)                                                           | the site root                                                             | a crawler choosing the one page it needs                   |
| [`llms-full.txt`](/llms-full.txt)                                                 | the site root                                                             | reading the entire documentation in a single fetch         |
| [`AGENTS.md`](https://github.com/ASDAlexey/vitest-auto-spy/blob/master/AGENTS.md) | `node_modules/vitest-auto-spy/AGENTS.md`                                  | any agent, **with no network** — it ships in the tarball   |
| [Spec patterns](/recipes)                                                         | the docs site                                                             | the shapes a real suite converged on, with the frequencies |
| A Claude Code skill                                                               | the [plugin](#claude-code-plugin), or `.claude/skills/` written by `init` | Claude Code, loaded only when a spec mentions the library  |

[`llms.txt`](https://llmstxt.org) is the convention an LLM-facing crawler looks for at a docs site
root: a link-only map, so an agent fetches one page instead of scraping the rendered HTML of ten.
Both files are generated from this site's sidebar and checked in CI, so they cannot drift.

## What reaches an agent with no setup

Two channels reach an agent the moment `npm install` finishes, with nothing written into your
repository:

- **Errors that name their own fix.** Every throw and warning this package emits ends with a
  `Docs:` line pointing at the page that explains it. An agent reads a stack trace far more often
  than it reads a README, so this is the channel that actually lands —
  [examples below](#errors-that-name-their-own-fix).
- **TSDoc in `dist/*.d.ts`.** Every export is documented where the editor, the language server and
  the agent's "go to definition" already look, and the types are the authority when any document
  and the code disagree.

Everything else needs one line written somewhere, and it is worth being plain about why.

::: warning A skill shipped in a tarball is not auto-discovered
`skills/vitest-auto-spy/SKILL.md` ships inside the npm package, and Claude Code never finds it
there: `node_modules/**/skills/` is not one of the locations it scans for skills (they are
`~/.claude/skills/`, a project's own `.claude/skills/`, and the `skills/` of an installed plugin). No packaging
trick changes that, and the same holds for every other tool's rule directory — **a dependency has
no zero-setup path into an agent's instruction context.** So the skill arrives one of two ways:
through [the plugin](#claude-code-plugin), or through the stub `npx vitest-auto-spy init` writes to
`.claude/skills/vitest-auto-spy/SKILL.md` — the shipped skill's frontmatter (the part that decides
whether it loads) over a body that only points at the tarball, so the copy cannot go stale.
:::

`AGENTS.md` is the cheapest of the rest: it ships in the tarball too, so
`node_modules/vitest-auto-spy/AGENTS.md` is on disk with no network and at the version actually
installed. But something still has to tell the agent to read it. That one line is what `init`
writes.

## One command

```bash
npx vitest-auto-spy init
```

It writes the pointer below into the files the agents in _this_ repository actually read, and
specialises it: which subpath matches this runner, which adapter matches the framework, the real
path of the setup file that needs `import 'vitest-auto-spy/rxjs'` — and it omits the rxjs line
entirely when rxjs is not installed. Everything it writes sits between markers and is regenerated
on the next run, so an upgrade is a one-hunk diff and `init --uninstall` puts the file back.

`npx vitest-auto-spy init --check` is the CI form: it fails when the block on disk is not the
block the installed version would write. The whole command is documented on
[The CLI](/utilities/cli); the rest of this page is what it writes, and how to do it by hand.

## Point your agent at it once

The single highest-leverage line, in the instruction file your agent actually reads — a root
`AGENTS.md` for Codex, Cursor, Copilot and most of the field, `CLAUDE.md` for Claude Code and for
GLM or Kimi running inside it, `GEMINI.md` for the Gemini CLI:

```md
When writing or fixing tests that use `vitest-auto-spy`, first read
`node_modules/vitest-auto-spy/AGENTS.md`. It is the authoritative reference for the API,
the configuration semantics and the common mistakes.
```

That file is already on disk in every project that installs the package, so the agent pays no
network round-trip and gets the version it actually has installed rather than whatever the web
returned.

## Which file your agent reads

The snippet above is the same for every tool; only the filename changes. **Three root files cover
the whole field, and only one of them holds anything: `AGENTS.md` is the source, `CLAUDE.md` and
`GEMINI.md` are pointers at it.** `AGENTS.md` won the format war — Codex, Cursor, Copilot, Cline,
Windsurf/Cascade, Zed, OpenCode, Qwen, Junie, Roo and Aider all read it. The two holdouts each
insist on their own filename: Claude Code reads `CLAUDE.md` and not `AGENTS.md`, and the Gemini CLI
reads `GEMINI.md` unless `context.fileName` names the other. Write the block once, point twice, and
every agent in this table is served — including the ones your teammates use and you do not.

| Agent                                                               | Instruction file it reads                                                                                                                                                                 | Reads `AGENTS.md`?                                                |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Claude Code**                                                     | `CLAUDE.md` — project, `.claude/CLAUDE.md` and `~/.claude/CLAUDE.md`, all concatenated                                                                                                    | **No.** Bridge with an `@AGENTS.md` import line, or a symlink     |
| **OpenAI Codex** — the `codex` CLI, the IDE extension, Codex cloud  | `AGENTS.md`, one per directory from the git root down to the cwd ([below](#openai-codex))                                                                                                 | native                                                            |
| **GLM (z.ai coding plan)**, **Kimi K2**                             | whatever their client reads — inside Claude Code that is `CLAUDE.md` ([below](#glm-z-ai-kimi-k2-and-other-claude-compatible-models))                                                      | through the client                                                |
| **Cursor**                                                          | root `AGENTS.md`; `.cursor/rules/*.mdc` for glob-scoped rules                                                                                                                             | native — and it applies a root `CLAUDE.md` the same always-on way |
| **GitHub Copilot**                                                  | root `AGENTS.md`; `.github/copilot-instructions.md`                                                                                                                                       | native, coding agent included                                     |
| **OpenCode**                                                        | `AGENTS.md`, then `CLAUDE.md`, per directory upwards                                                                                                                                      | native                                                            |
| **Cline**                                                           | root `AGENTS.md`; the `.clinerules/` directory                                                                                                                                            | native                                                            |
| **Windsurf / Cascade**                                              | root `AGENTS.md`; `.windsurf/rules/*.md` (`.devin/rules/*.md` when present)                                                                                                               | yes                                                               |
| **Zed**                                                             | **first match wins, no merging**: `.rules` → `.cursorrules` → `.windsurfrules` → `.clinerules` → `.github/copilot-instructions.md` → `AGENT.md` → `AGENTS.md` → `CLAUDE.md` → `GEMINI.md` | yes — only if nothing earlier in that list exists                 |
| **Gemini CLI**                                                      | `GEMINI.md` ([below](#gemini-cli))                                                                                                                                                        | **not by default**                                                |
| **Qwen Code**                                                       | `QWEN.md`                                                                                                                                                                                 | native fallback                                                   |
| **Roo Code**                                                        | root `AGENTS.md`; `.roo/rules/`                                                                                                                                                           | yes                                                               |
| **Junie**                                                           | root `AGENTS.md` — note that `.junie/AGENTS.md` replaces it outright                                                                                                                      | yes                                                               |
| **Aider**                                                           | nothing implicitly — list the file: `read: [AGENTS.md]` in `.aider.conf.yml`                                                                                                              | on request                                                        |
| **Jules, Factory, goose, Amp, Warp, Devin, Kilo, Augment, VS Code** | root `AGENTS.md`                                                                                                                                                                          | native                                                            |

::: warning Never create a legacy rules file just to hold the snippet
Zed resolves `.rules` → `.cursorrules` → `.windsurfrules` → `.clinerules` → … **first-match-wins,
with no merging**, so a newly created legacy file silently shadows the `AGENTS.md` the rest of the
project relies on. Append to one only if it already exists.
:::

## Install it in your agent

`npx vitest-auto-spy init` writes all of this. By hand, three files at the repository root cover
every tool in that table:

```bash
# 1 — AGENTS.md: the source. Codex, Cursor, Copilot, Cline, Windsurf, Zed, OpenCode, Qwen, Roo, Junie, Aider…
cat >> AGENTS.md <<'MD'

## Tests that use `vitest-auto-spy`

When writing or fixing tests that use `vitest-auto-spy`, first read
`node_modules/vitest-auto-spy/AGENTS.md`. It is the authoritative reference for the API,
the configuration semantics and the common mistakes.
MD

# 2 — CLAUDE.md: Claude Code, and GLM / Kimi running inside it. One line, no second copy to maintain
printf '\n@AGENTS.md\n' >> CLAUDE.md

# 3 — GEMINI.md: the Gemini CLI, which does not read AGENTS.md by default
printf '\nRead `AGENTS.md` in this directory — it is the single source.\n' >> GEMINI.md
```

`@AGENTS.md` is Claude Code's own import syntax, so the instructions live in exactly one file. A
symlink (`ln -s AGENTS.md CLAUDE.md`) does the same job if you would rather not have the second file
at all. Gemini CLI has no import syntax, so `GEMINI.md` either carries the pointer sentence above or
is replaced by the `.gemini/settings.json` patch [below](#gemini-cli). Whichever form you pick, keep
the content in one place: two copies of an API reference disagree within a release.

Then, per tool — everything in the right-hand column is optional on top of those two files:

| Agent                                       | Install                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Claude Code**                             | `/plugin marketplace add ASDAlexey/vitest-auto-spy`, then `/plugin install vitest-auto-spy@vitest-auto-spy` — [the skill](#claude-code-plugin), no project files touched |
| **OpenAI Codex**                            | nothing more; optionally `~/.codex/config.toml` from [below](#openai-codex)                                                                                              |
| **GLM (z.ai)**, **Kimi K2**                 | identical to Claude Code — same client, same plugin command                                                                                                              |
| **Cursor**                                  | `.cursor/rules/vitest-auto-spy.mdc` to load it only for spec files (see below)                                                                                           |
| **GitHub Copilot**                          | `.github/instructions/vitest-auto-spy.instructions.md` (see below)                                                                                                       |
| **Cline**                                   | `.clinerules/vitest-auto-spy.md` — the same three lines, plus `paths: ["**/*.spec.ts","**/*.test.ts"]`                                                                   |
| **Windsurf / Cascade**                      | `.windsurf/rules/vitest-auto-spy.md` with `trigger: glob` (see below)                                                                                                    |
| **Roo Code**                                | `.roo/rules/vitest-auto-spy.md` — always on, so keep it to the three-line pointer                                                                                        |
| **Gemini CLI**                              | `GEMINI.md`, or the `.gemini/settings.json` patch from [below](#gemini-cli)                                                                                              |
| **Aider**                                   | `.aider.conf.yml`: `read: [AGENTS.md]`                                                                                                                                   |
| **Zed, OpenCode, Qwen Code, Junie, Jules…** | nothing — the root `AGENTS.md` is the whole install                                                                                                                      |

The glob-scoped variants, for the three tools whose format is not plain Markdown. Each body is the
same pointer; only the frontmatter differs:

```md
## <!-- .cursor/rules/vitest-auto-spy.mdc -->

description: How to write tests with vitest-auto-spy
globs: **/\*.spec.ts, **/_.spec.tsx, \*\*/_.test.ts, \*_/_.test.tsx
alwaysApply: false

---

Read `node_modules/vitest-auto-spy/AGENTS.md` before writing or fixing a spec that uses
`vitest-auto-spy` — the API, the configuration semantics and the common mistakes.
```

```md
## <!-- .github/instructions/vitest-auto-spy.instructions.md -->

## applyTo: '**/\*.spec.ts,**/_.spec.tsx,\*\*/_.test.ts,\*_/_.test.tsx'

Read `node_modules/vitest-auto-spy/AGENTS.md` before writing or fixing a spec that uses
`vitest-auto-spy`.
```

```md
## <!-- .windsurf/rules/vitest-auto-spy.md — .devin/rules/ when that directory exists -->

trigger: glob
globs: **/\*.spec.ts, **/\*.test.ts

---

Read `node_modules/vitest-auto-spy/AGENTS.md` before writing or fixing a spec that uses
`vitest-auto-spy`.
```

Cursor's `globs` is a **comma-separated string, not a YAML array**, and a Windsurf rule file is
capped at 12 000 characters — both are reasons the rule points at the reference instead of copying
it.

## OpenAI Codex

Codex — the `codex` CLI, the IDE extension and Codex cloud — reads the open `AGENTS.md` convention,
so a root `AGENTS.md` is the whole integration. Two details decide whether it reaches the model at
all:

- **The chain is git-root→cwd, at most one file per directory** (`AGENTS.override.md` wins over
  `AGENTS.md`), concatenated. In a monorepo, put the block in the package's own `AGENTS.md` as well
  when that package runs a different runner — it is the only way to say "this one is `bun test`, the
  one next door is Vitest", which is exactly the distinction that decides
  [which entry point](#point-it-at-the-subpath-not-only-at-the-package) the agent imports.
- **The whole chain is capped** by `project_doc_max_bytes`, **32 768 bytes by default**; anything
  over budget is truncated with a warning. If your `AGENTS.md` is already long, keep the pointer near
  the top of it.

For a repo that keeps its instructions in `CLAUDE.md`, teach Codex to fall back. This is global
config on your own machine, so there is nothing to commit:

```toml
# ~/.codex/config.toml
project_doc_fallback_filenames = ["CLAUDE.md"]   # per directory, when no AGENTS.md is there
project_doc_max_bytes = 65536                    # raise the 32 KB budget for a monorepo chain
```

Codex cloud reads the same root `AGENTS.md`, and its agent has **no internet access by default** —
which is precisely why the reference ships inside the tarball rather than only on this site.
`node_modules/vitest-auto-spy/AGENTS.md` is on disk the moment the setup script has installed
dependencies, so nothing has to be fetched.

## GLM (z.ai), Kimi K2 and other Claude-compatible models

GLM is a **model**, not an agent — the thing that reads files is the client you run it in.

The z.ai coding plan runs GLM **inside Claude Code**, by pointing `ANTHROPIC_BASE_URL` (with
`ANTHROPIC_AUTH_TOKEN`) at z.ai's Anthropic-compatible endpoint. File discovery is untouched by
that: `CLAUDE.md`, `.claude/skills/` and the [plugin](#claude-code-plugin) below behave exactly as
they do on Claude, because it is the same client. Kimi K2 driven through Claude Code is the same
story — and there the skill and the plugin are worth more than a pasted snippet, because they load
only when a spec actually mentions the library and cost no context the rest of the time.

Run GLM through a different client and that client decides: OpenCode, Cline, Roo Code and Kilo Code
all read the root `AGENTS.md`. Moonshot's own `kimi-cli` reads its own `AGENTS.md` chain, including
`.kimi/AGENTS.md`.

## Gemini CLI

Gemini CLI reads `GEMINI.md` and does **not** read `AGENTS.md` by default. Either paste the snippet
into `GEMINI.md`, or name both files once:

```json
// .gemini/settings.json
{ "context": { "fileName": ["GEMINI.md", "AGENTS.md"] } }
```

Qwen Code is derived from Gemini CLI and takes the same `context.fileName` setting, but already
falls back to `AGENTS.md` on its own.

## Claude Code plugin

The repository doubles as a Claude Code plugin marketplace. This is the route that needs no files in
your project at all — and, together with the `.claude/skills/` stub `init` writes, one of only two
ways the skill is ever discovered, since [the copy in the tarball is not](#what-reaches-an-agent-with-no-setup):

```
/plugin marketplace add ASDAlexey/vitest-auto-spy
/plugin install vitest-auto-spy@vitest-auto-spy
```

The skill's description lists the library's exports and its four most common error messages, so it
loads when a task is actually about this package and stays out of the way otherwise. Its body is a
short decision tree plus a "reach for this before hand-rolling" table keyed by the _symptom_ — the
error text or the failing shape — because that is what an agent has in hand when it starts.

## Point it at the subpath, not only at the package

Each entry registers its own mock adapter on import, and three of them are opt-in on purpose. An
agent that knows only the bare specifier writes a spec that throws at the first helper:

| Subpath                                   | Needed for                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `vitest-auto-spy/rxjs`                    | `nextWith`, `observablePropsToSpyOn`, `throwWith` — imported once, in setup     |
| `vitest-auto-spy/bun`                     | any spec run by `bun test` (`/bun-angular` for Angular's TestBed there)         |
| `vitest-auto-spy/node`                    | a `node --test` suite, ESM or CJS                                               |
| `vitest-auto-spy/angular`                 | `provideAutoSpy`, `injectSpy`, `renderShallow`, the override helpers            |
| `vitest-auto-spy/setup`                   | `setupAutoSpy`, the clock helpers, `installPerTest`, focus matchers             |
| [`vitest-auto-spy/zone`](/utilities/zone) | `fakeAsync` / `waitForAsync` on Vitest — zone.js stays out of every other entry |

## Errors that name their own fix

An agent reads a stack trace far more often than it reads a README, so every error and warning this
package throws ends with a link to the page that explains it:

```
Observable spies require rxjs. Import 'vitest-auto-spy/rxjs' once (e.g. in your test setup)
to enable observablePropsToSpyOn / nextWith / nextWithValues / throwWith / complete / returnSubject.
Docs: https://asdalexey.github.io/vitest-auto-spy/runtimes/rxjs
```

The same applies to a missing mock adapter, a method that is not on the prototype, `advanceTimers()`
without fake timers, a `bun-angular` preload with no DOM package, an unresolvable `templateUrl`, a
`mustBeCalledWith` violation and the duplicate-install report.

## What agents get wrong most often

These account for the large majority of broken specs, and every one of them is covered in
`AGENTS.md`:

1. **`let s: MyService = createSpyFromClass(MyService)`.** `Spy<T>` is a mapped type and drops
   private members. Declare it as `Spy<T>`, or bridge with [`asInstance` / `asSpy`](/core/spy-typing) —
   never with `as unknown as T`.
2. **Reaching for `methodsToSpyOn` to restrict.** It **adds** to the discovered methods, matching
   `jest-auto-spies`. The exhaustive whitelist is
   [`onlyMethodsToSpyOn`](/core/create-spy-from-class), and it skips prototype discovery entirely.
3. **Calling `nextWith` without `import 'vitest-auto-spy/rxjs'`.** The observable layer is opt-in.
4. **Importing `vitest-auto-spy` inside a `bun test` file.** Each entry registers its own mock
   adapter on import; use [`vitest-auto-spy/bun`](/runtimes/bun).
5. **`expect()` inside a `subscribe()` callback.** A silent stream makes it a green test that
   asserted nothing — use [`expectEmission`](/core/observable-assertions), where the assertion is
   the `await`.
6. **`vi.fn().mockImplementation(() => instance)` for something the code calls with `new`.** The
   Jest idiom does not port: Vitest only forwards `new` to a constructible implementation, so an
   arrow records the call, skips the body and hands back an empty object — or throws
   `X is not a constructor` from inside production code. Use
   [`mockConstructor` / `stubConstructor`](/utilities/constructor-doubles).
7. **An exported `const` holding `vi.fn()`s, shared between spec files.** Under `isolate: false` a
   module is evaluated once per worker, so that is one set of spies for every file that imports it.
   A fixture is a factory; a spec file exports nothing at all.
8. **`it('x', (done) => …)`.** Vitest passes a `TestContext`, so `done()` throws inside a promise
   nobody awaits and the test **passes** having run almost none of its body. The lint rule
   `no-done-callback` catches it; the fix is `await`.
9. **`await Promise.resolve()` to wait out a dynamic `import()` under fake timers.** It never
   advances one, and `setTimeout` is the fake one — use
   [`settleDynamicImport` / `flushEventLoop`](/utilities/event-loop).
10. **Assuming a setup file's hooks reach every spec file.** They belong to the file whose
    collection imported the module, and a runner that keeps that module cached across files —
    `@angular/build:unit-test` under `--coverage` is the case seen in the wild — gives them to the
    first file of each worker and to no other. Nothing reports it; the symptom is a leaked global or
    real timers in a spec that passes on its own. Run coverage with `--isolate`, or call
    [`setupAutoSpy()`](/utilities/setup) from something evaluated per file.
