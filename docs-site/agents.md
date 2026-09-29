---
title: For AI agents
description: llms.txt, llms-full.txt, a bundled AGENTS.md and a Claude Code skill — how to point Claude Code, Codex, Cursor or any other agent at this library.
---

# For AI agents

This page makes your coding agent (Claude Code, Codex, Cursor, Copilot and others) write correct
specs with this library. Run one command in your project:

```bash
npx vitest-auto-spy init
```

It adds a short pointer to the instruction files your agents read (`AGENTS.md`, `CLAUDE.md`,
`GEMINI.md` and a few tool-specific files; [full list](#one-command)). The pointer sends the agent to `node_modules/vitest-auto-spy/AGENTS.md`, a reference
that ships in the package and matches the installed version. On Claude Code you can install the
plugin instead; see [Claude Code plugin](#claude-code-plugin).

The package ships a compressed form of its documentation for agents: a decision tree, what each
option means, an error → fix table and the common mistakes.

## One command

```bash
npx vitest-auto-spy init
```

It writes [the pointer below](#point-your-agent-at-it-once) into the instruction files of _this_
repository and fills in the details for your project:

- which entry point matches your test runner;
- which adapter matches your framework;
- the real path of the setup file that needs `import 'vitest-auto-spy/rxjs'` (the line is left out
  when rxjs is not installed).

Everything it writes sits between markers and is regenerated on the next run. An upgrade is a
one-hunk diff, and `init --uninstall` restores the file.

| Command                                | What it does                                                      |
| -------------------------------------- | ----------------------------------------------------------------- |
| `npx vitest-auto-spy init`             | write or refresh the block                                        |
| `npx vitest-auto-spy init --check`     | for CI: fail when the block differs from what this version writes |
| `npx vitest-auto-spy init --uninstall` | remove the block                                                  |

What it writes:

| File                                                          | For                                      | When                                             |
| ------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------ |
| `AGENTS.md`                                                   | Codex, Cursor, Copilot and most others   | always (created if missing)                      |
| `CLAUDE.md`                                                   | Claude Code                              | always (created if missing)                      |
| `GEMINI.md`                                                   | Gemini CLI                               | always (created if missing)                      |
| `.claude/skills/vitest-auto-spy/SKILL.md`                     | Claude Code skill stub                   | always                                           |
| `.cursor/rules/vitest-auto-spy.mdc`                           | Cursor, spec files only                  | only if `.cursor/` exists                        |
| `.github/instructions/vitest-auto-spy.instructions.md`        | GitHub Copilot, spec files only          | only if `.github/` exists                        |
| `.windsurf/rules/…`, `.devin/rules/…`, `.clinerules/…`, `.roo/rules/…` | Windsurf, Devin, Cline, Roo      | only if that directory exists                    |
| `.rules`, `.cursorrules`, `.windsurfrules`                    | legacy files                             | appended to only if the file already exists      |

The three root files each get the same block between markers. Cursor's rule file is written only when
`.cursor/` already exists, so create that directory first if you want it. After you upgrade the package, run
`init` again: `init --check` fails in CI until the block matches the installed version.

The full command is on [The CLI](/utilities/cli). The rest of this page is what it writes, and how to
do it by hand.

## The five entry points

Here "entry point" means a form of the documentation, not an import path. The same documentation
reaches an agent in five forms:

| What                                                                              | Where                                                                     | Best for                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`llms.txt`](/llms.txt)                                                           | the site root                                                             | a crawler choosing the one page it needs                   |
| [`llms-full.txt`](/llms-full.txt)                                                 | the site root                                                             | reading the entire documentation in a single fetch         |
| [`AGENTS.md`](https://github.com/ASDAlexey/vitest-auto-spy/blob/master/AGENTS.md) | `node_modules/vitest-auto-spy/AGENTS.md`                                  | any agent, **with no network** — it ships in the tarball   |
| [Spec patterns](/recipes)                                                         | the docs site                                                             | the shapes a real suite converged on, with the frequencies |
| A Claude Code skill                                                               | the [plugin](#claude-code-plugin), or `.claude/skills/` written by `init` | Claude Code, loaded only when a spec mentions the library  |

[`llms.txt`](https://llmstxt.org) is a convention: a link-only map at the site root, so an agent
fetches one page instead of scraping ten. Both `llms` files are generated from this site's sidebar
and checked in CI, so they stay in sync.

## What reaches an agent with no setup

Two things reach an agent as soon as `npm install` finishes, with nothing written into your
repository:

- **Errors that name their own fix.** Every error and warning ends with a `Docs:` line that links
  the page explaining it. Agents read stack traces far more often than READMEs, so this channel
  works best. See [examples below](#errors-that-name-their-own-fix).
- **TSDoc in `dist/*.d.ts`.** Every export is documented where the editor and "go to definition"
  already look. When a document and the code disagree, the types win.

Everything else needs one line written somewhere. Here is why.

::: warning A skill shipped in a tarball is not auto-discovered
`skills/vitest-auto-spy/SKILL.md` ships inside the npm package, but Claude Code never finds it
there. It looks for skills only in `~/.claude/skills/`, the project's `.claude/skills/`, and the
`skills/` of an installed plugin. Other tools' rule directories work the same way: **a dependency
cannot reach an agent's instructions without setup.** So the skill arrives in one of two ways:

- through [the plugin](#claude-code-plugin);
- through the stub `npx vitest-auto-spy init` writes to `.claude/skills/vitest-auto-spy/SKILL.md`.
  It copies the shipped skill's frontmatter (which decides when it loads), and its body only points
  at the package, so it cannot go stale.
:::

`AGENTS.md` also ships in the package, so `node_modules/vitest-auto-spy/AGENTS.md` is on disk,
offline, at the installed version. Something still has to tell the agent to read it; that one line
is what `init` writes.

The reference covers every export, option and error, so it is split in two levels:

- `AGENTS.md` is a map of about 30 kB, under Codex's 32 KB budget and small enough to read whole. It
  has the entry points, the common recipe, `Spy<T>` against `T`, resetting and `fakeAsync`, and a
  stub for every other section saying when to open it.
- `node_modules/vitest-auto-spy/agent-docs/` holds the rest, one file per section with the same
  numbers: factories, configuration, return-type helpers, the setup file, Angular, the ESLint plugin,
  Error → fix (a table to search by message), the checklist before reporting success, and others.

The shipped skill and the `init` stub send the agent to the map first.

## Point your agent at it once

Add this to the instruction file your agent reads:

- a root `AGENTS.md` for Codex, Cursor, Copilot and most other tools;
- `CLAUDE.md` for Claude Code, and for GLM or Kimi running inside it;
- `GEMINI.md` for the Gemini CLI.

```md
When writing or fixing tests that use `vitest-auto-spy`, first read
`node_modules/vitest-auto-spy/AGENTS.md` whole — a short map — then only the topic files in
`agent-docs/` it names for the task.
```

That file is on disk in every project that installs the package. The agent needs no network and
reads the version you actually have installed.

## Which file your agent reads

The snippet is the same for every tool; only the file name changes. **Three root files cover every
tool.** `init` writes its block into all three. By hand, keep the text in `AGENTS.md` and make
`CLAUDE.md` and `GEMINI.md` point at it.

- Most tools read `AGENTS.md`: Codex, Cursor, Copilot, Cline, Windsurf/Cascade, Zed, OpenCode, Qwen,
  Junie, Roo and Aider.
- Claude Code reads `CLAUDE.md`, not `AGENTS.md`.
- The Gemini CLI reads `GEMINI.md` unless `context.fileName` names another file.

Write the block once and point to it twice. Every agent in the table is then covered, including the
ones your teammates use.

| Agent                                                               | Instruction file it reads                                                                                                                                                                 | Reads `AGENTS.md`?                                                |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Claude Code**                                                     | `CLAUDE.md` — project, `.claude/CLAUDE.md` and `~/.claude/CLAUDE.md`, all concatenated                                                                                                    | **No.** Bridge with an `@AGENTS.md` import line, or a symlink     |
| **OpenAI Codex** — the `codex` CLI, the IDE extension, Codex cloud  | `AGENTS.md`, one per directory from the git root down to the cwd ([below](#openai-codex))                                                                                                 | native                                                            |
| **GLM (z.ai coding plan)**, **Kimi K3**                             | whatever their client reads — inside Claude Code that is `CLAUDE.md` ([below](#glm-z-ai-kimi-k3-and-other-claude-compatible-models))                                                      | through the client                                                |
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
Zed reads `.rules` → `.cursorrules` → `.windsurfrules` → `.clinerules` → … and **the first match
wins, with no merging**. A new legacy file would silently hide the `AGENTS.md` the rest of the
project relies on. Append to such a file only if it already exists.
:::

## Install it in your agent

`npx vitest-auto-spy init` writes all of this. By hand, three files at the repository root cover every
tool in the table above:

```bash
# 1 — AGENTS.md: the source. Codex, Cursor, Copilot, Cline, Windsurf, Zed, OpenCode, Qwen, Roo, Junie, Aider…
cat >> AGENTS.md <<'MD'

## Tests that use `vitest-auto-spy`

When writing or fixing tests that use `vitest-auto-spy`, first read
`node_modules/vitest-auto-spy/AGENTS.md` whole — a short map — then only the topic files in
`agent-docs/` it names for the task.
MD

# 2 — CLAUDE.md: Claude Code, and GLM / Kimi running inside it. One line, no second copy to maintain
printf '\n@AGENTS.md\n' >> CLAUDE.md

# 3 — GEMINI.md: the Gemini CLI, which does not read AGENTS.md by default
printf '\nRead `AGENTS.md` in this directory — it is the single source.\n' >> GEMINI.md
```

`@AGENTS.md` is Claude Code's import syntax, so the instructions live in one file. A symlink
(`ln -s AGENTS.md CLAUDE.md`) works too, if you prefer no second file. Gemini CLI has no import
syntax: `GEMINI.md` carries the pointer sentence above, or you use the `.gemini/settings.json` patch
[below](#gemini-cli). Either way, keep the content in one place: two copies of an API reference
drift apart within a release.

Then, per tool. Everything in the "Install" column is optional on top of the three root files:

| Agent                                       | Install                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Claude Code**                             | `/plugin marketplace add ASDAlexey/vitest-auto-spy`, then `/plugin install vitest-auto-spy@vitest-auto-spy` — [the skill](#claude-code-plugin), no project files touched |
| **OpenAI Codex**                            | nothing more; optionally `~/.codex/config.toml` from [below](#openai-codex)                                                                                              |
| **GLM (z.ai)**, **Kimi K3**                 | identical to Claude Code — same client, same plugin command                                                                                                              |
| **Cursor**                                  | `.cursor/rules/vitest-auto-spy.mdc` to load it only for spec files (see below)                                                                                           |
| **GitHub Copilot**                          | `.github/instructions/vitest-auto-spy.instructions.md` (see below)                                                                                                       |
| **Cline**                                   | `.clinerules/vitest-auto-spy.md` — the same three lines, plus `paths: ["**/*.spec.ts", "**/*.test.ts"]`                                                                   |
| **Windsurf / Cascade**                      | `.windsurf/rules/vitest-auto-spy.md` with `trigger: glob` (see below)                                                                                                    |
| **Roo Code**                                | `.roo/rules/vitest-auto-spy.md` — always on, so keep it to the three-line pointer                                                                                        |
| **Gemini CLI**                              | `GEMINI.md`, or the `.gemini/settings.json` patch from [below](#gemini-cli)                                                                                              |
| **Aider**                                   | `.aider.conf.yml`: `read: [AGENTS.md]`                                                                                                                                   |
| **Zed, OpenCode, Qwen Code, Junie, Jules…** | nothing — the root `AGENTS.md` is the whole install                                                                                                                      |

Three tools can load the rule only for spec files. Each body is the same pointer; only the
frontmatter differs:

<!-- prettier-ignore-start -->

**`.cursor/rules/vitest-auto-spy.mdc`**

```md
---
description: How to write tests with vitest-auto-spy
globs: **/*.spec.ts, **/*.spec.tsx, **/*.test.ts, **/*.test.tsx
alwaysApply: false
---

Read `node_modules/vitest-auto-spy/AGENTS.md` before writing or fixing a spec that uses
`vitest-auto-spy` — the API, the configuration semantics and the common mistakes.
```

**`.github/instructions/vitest-auto-spy.instructions.md`**

```md
---
applyTo: '**/*.spec.ts,**/*.spec.tsx,**/*.test.ts,**/*.test.tsx'
---

Read `node_modules/vitest-auto-spy/AGENTS.md` before writing or fixing a spec that uses
`vitest-auto-spy` — the API, the configuration semantics and the common mistakes.
```

**`.windsurf/rules/vitest-auto-spy.md`** (or `.devin/rules/vitest-auto-spy.md` when that directory exists)

```md
---
trigger: glob
globs: **/*.spec.ts, **/*.spec.tsx, **/*.test.ts, **/*.test.tsx
---

Read `node_modules/vitest-auto-spy/AGENTS.md` before writing or fixing a spec that uses
`vitest-auto-spy` — the API, the configuration semantics and the common mistakes.
```

<!-- prettier-ignore-end -->

Cursor's `globs` is a **comma-separated string, not a YAML array**. A Windsurf rule file is limited to
12 000 characters. Both are reasons the rule points at the reference instead of copying it.

## OpenAI Codex

Codex (the `codex` CLI, the IDE extension and Codex cloud) reads `AGENTS.md`, so a root `AGENTS.md`
is all you need. Two details decide whether it reaches the model:

- **It reads one file per directory, from the git root down to the current directory**, and joins
  them. `AGENTS.override.md` wins over `AGENTS.md`. In a monorepo, if a package uses a different test
  runner, put the block in that package's `AGENTS.md` too. That is the only way to tell the agent
  "this package uses `bun test`, the next one uses Vitest", which decides
  [which entry point](#point-it-at-the-subpath-not-only-at-the-package) it imports.
- **The whole chain is capped** by `project_doc_max_bytes`, **32 768 bytes by default**. Anything
  over the limit is cut with a warning. If your `AGENTS.md` is already long, put the pointer near the
  top.

If a repository keeps its instructions in `CLAUDE.md`, tell Codex to fall back to it. This is global
config on your machine, so there is nothing to commit:

```toml
# ~/.codex/config.toml
project_doc_fallback_filenames = ["CLAUDE.md"]   # per directory, when no AGENTS.md is there
project_doc_max_bytes = 65536                    # raise the 32 KB budget for a monorepo chain
```

Codex cloud reads the same root `AGENTS.md`, and has **no internet access by default**. That is why
the reference ships inside the package and not only on this site: once dependencies are installed,
`node_modules/vitest-auto-spy/AGENTS.md` is on disk.

## GLM (z.ai), Kimi K3 and other Claude-compatible models

GLM is a **model**, not an agent. The client you run it in decides which files it reads.

The z.ai coding plan runs GLM **inside Claude Code**: `ANTHROPIC_BASE_URL` (with
`ANTHROPIC_AUTH_TOKEN`) points at z.ai's Anthropic-compatible endpoint. File discovery does not
change: `CLAUDE.md`, `.claude/skills/` and the [plugin](#claude-code-plugin) work exactly as on
Claude, because it is the same client. The same holds for Kimi K3 inside Claude Code. There the skill
and the plugin are better than a pasted snippet: they load only when a spec mentions the library.

In another client, that client decides. OpenCode, Cline, Roo Code and Kilo Code read the root
`AGENTS.md`. Moonshot's `kimi-cli` reads its own `AGENTS.md` chain, including `.kimi/AGENTS.md`.

## Gemini CLI

Gemini CLI reads `GEMINI.md` and does **not** read `AGENTS.md` by default. Either paste the snippet
into `GEMINI.md`, or name both files once:

```json
// .gemini/settings.json
{ "context": { "fileName": ["GEMINI.md", "AGENTS.md"] } }
```

Qwen Code is based on Gemini CLI and accepts the same `context.fileName` setting, but it already
falls back to `AGENTS.md` by itself.

## Claude Code plugin

The repository is also a Claude Code plugin marketplace. This route needs no files in your project.
It is one of the two ways Claude Code finds the skill; the other is the `.claude/skills/` stub from
`init`. [The copy inside the package is not found](#what-reaches-an-agent-with-no-setup).

```
/plugin marketplace add ASDAlexey/vitest-auto-spy
/plugin install vitest-auto-spy@vitest-auto-spy
```

The skill's description lists the library's exports and its four most common error messages, so it
loads only when a task is about this package. Its body is a short decision tree and a table of "use
this instead of writing it by hand", indexed by the _symptom_: the error text or the failing code.
That is what an agent has when it starts.

## Point it at the subpath, not only at the package

Each import path connects the library to its test runner or framework when imported, and several,
such as `/rxjs` and `/zone`, are opt-in on purpose. `init` names the right one for your project in
the block it writes. An agent that knows only `vitest-auto-spy` writes a spec that throws at the first helper:

| Subpath                                   | Needed for                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `vitest-auto-spy/rxjs`                    | `nextWith`, `observablePropsToSpyOn`, `throwWith` — imported once, in setup                                   |
| `vitest-auto-spy/bun`                     | any spec run by `bun test` (`/bun-angular` for Angular's TestBed there)                                       |
| `vitest-auto-spy/node`                    | a `node --test` suite, ESM or CJS                                                                             |
| `vitest-auto-spy/rstest`                  | any spec run by [Rstest](/runtimes/rstest) — `npx rstest run`                                                 |
| `vitest-auto-spy/angular`                 | `provideAutoSpy`, `injectSpy`, `renderShallow`, the override helpers                                          |
| `vitest-auto-spy/setup`                   | `setupAutoSpy` (with `strayConsole`, `preset: 'strict'`), the clock helpers, `installPerTest`, focus matchers |
| [`vitest-auto-spy/zone`](/utilities/zone) | `fakeAsync` / `waitForAsync` on Vitest — zone.js stays out of every other entry                               |

## Errors that name their own fix

Agents read stack traces far more often than READMEs. So every error and warning from this package
says what went wrong, gives the fix, and ends with a link to the section that explains it:

```
[vitest-auto-spy] Observable spies require rxjs, and 'vitest-auto-spy/rxjs' was not imported in this run. Add `import 'vitest-auto-spy/rxjs';` once to the setup file.
Docs: https://asdalexey.github.io/vitest-auto-spy/runtimes/rxjs
```

The same holds for:

- a missing mock adapter;
- a method that is not on the class;
- `advanceTimers()` without fake timers;
- a `bun-angular` preload with no DOM package;
- a `templateUrl` that cannot be resolved;
- a `mustBeCalledWith` violation;
- a duplicate install of the package.

Under [`setupAutoSpy({ strayConsole: 'throw' })`](/utilities/setup), console output that no spy
caught fails the test. The error names the console method, the first lines written and the code that
wrote them. When a spec the agent did not touch turns red after this guard is enabled, look there
first.

## Cheaper run output — `--reporter=agent`

Vitest 4.1 has a reporter made for agents. It prints the same failures without the list of passing
tests and the repeated banners, so the output costs the agent less to read and keep in context.

```bash
npx vitest run --reporter=agent src/app/cart.component.spec.ts
```

It is part of Vitest, not of this package, so there is nothing to configure. Add a path filter too:
an agent rarely needs the whole test run, only the file it just edited.

## What agents get wrong most often

These cause most broken specs. `AGENTS.md` covers every one:

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
   `no-done-callback` catches it; the fix is `await`. Taking that context under a plain name and
   only reading it — `it('x', (ctx) => ctx.skip())` — is legal and is not what the rule reports.
9. **`await Promise.resolve()` to wait out a dynamic `import()` under fake timers.** It never
   advances one, and `setTimeout` is the fake one — use
   [`settleDynamicImport` / `flushEventLoop`](/utilities/event-loop).
10. **Assuming a setup file's hooks reach every spec file.** They belong to the file whose
    collection imported the module, and a runner that keeps that module cached across files —
    `@angular/build:unit-test` before 22.2.0 under `--coverage` is the case seen in the wild — gives
    them to the first file of each worker and to no other. Nothing reports it; the symptom is a
    leaked global or real timers in a spec that passes on its own. `@angular/build` 22.2.0 fixes it;
    on an older builder run coverage with `--isolate`, or call [`setupAutoSpy()`](/utilities/setup)
    from something evaluated per file. Either way keep the call at the top level of the setup file,
    not in a module it imports.
11. **`vi.spyOn(console, 'error')` to keep a spec quiet.** With no implementation it calls through,
    so the line still prints — and under `strayConsole` the test fails on it. Install the silent
    spies with `installConsoleSpies()` from [`vitest-auto-spy/console`](/utilities/console) in a
    `beforeEach` and assert on `consoleErrorSpy`; the `no-passthrough-console-spy` rule reports the
    bare form.

12. **Advice carried over from Jest-era tutorials and cheat sheets** — each item below is wrong under
    Vitest, checked on Vitest 5.0.0:
    - **A `vi.mock` factory that reads a variable declared above it.** `vi.mock` is hoisted above
      the imports, so the factory runs before the `const` exists and the file fails with
      `[vitest] There was an error when mocking a module…` caused by
      `ReferenceError: Cannot access 'load' before initialization`. Jest's exemption for names
      starting with `mock` does not exist here — `mockLoad` fails the same way. Declare what the
      factory needs with `const mocks = vi.hoisted(() => ({ load: vi.fn() }))`.
    - **`vi.requireActual` / `jest.requireActual` to keep the rest of a module.** Neither exists;
      the factory receives `importOriginal`:
      `vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), load: vi.fn() }))`.
      `vi.importActual` is the async standalone form.
    - **`import { jest } from 'vitest'`.** `vitest` exports no `jest`; the namespace is `vi`.
    - **`import { userEvent } from '@testing-library/user-event'`.** That named export exists only
      from 14.5.0; the default export works on every 14.x. The 14.x API is async:
      `const user = userEvent.setup(); await user.click(button)`.
    - **`vi.restoreAllMocks()` to undo `vi.useFakeTimers()`.** Restoring, resetting or clearing
      mocks leaves the fake clock installed; `vi.useRealTimers()` in an `afterEach` puts the real
      one back.
    - **`globalThis.fetch = vi.fn()`.** Neither `vi.restoreAllMocks()` nor `vi.unstubAllGlobals()`
      reaches a bare assignment, so the fake answers every later test of the file. Use
      `vi.stubGlobal('fetch', …)` with `unstubGlobals: true`, or `mockValueProp(globalThis, 'fetch', …)`,
      which [`setupAutoSpy()`](/utilities/setup) restores; `blockNetwork()` for a spec that only
      has to stay offline, and [`stubResponse({ body })`](/utilities/setup#answering-a-stubbed-fetch-—-stubresponse)
      for the `Response` itself. The [`no-hand-assigned-global`](/utilities/eslint-rules#no-hand-assigned-global)
      rule reports the bare form, and [`prefer-stub-response`](/utilities/eslint-rules#prefer-stub-response)
      the `{ ok: true, json } as Response` handed back from it.
    - **`await import('./thing')` to settle a module the code under test lazy-loads.** It waits for
      the module and not for the continuation of the handler that was loading it, so the assertion
      runs a turn early. Use
      [`settleDynamicImport(() => import('./thing'))`](/utilities/event-loop#settledynamicimport-load-turns),
      which adds the `flushEventLoop(1)` that continuation needs;
      [`prefer-settle-dynamic-import`](/utilities/eslint-rules#prefer-settle-dynamic-import) reports
      the bare form.
    - **A test whose every assertion holds on the stream having stayed silent.** A `let` only the
      `subscribe` callback writes, asserted with `toEqual([])` against its own initialiser or with
      `toBeUndefined` / `not.toHaveBeenCalled`, cannot tell an empty result from no result at all.
      Say which one you mean — [`expectNoEmission(source$)`](/core/observable-assertions) for the
      silence, `expect(await expectEmission(source$))` for the value; the
      [`no-vacuous-absence-assertion`](/utilities/eslint-rules#no-vacuous-absence-assertion) rule
      reports the hand-written form.
    - **`{ id: '1', isOffline: false } as SomeType` for a fixture.** A cast asks whether the two types
      overlap, not whether the value is one of them, so it passes a key the type does not declare —
      the excess-property check is skipped — and a required field the fixture never sets. Both type
      gates stay silent and the fixture then pins a key the contract does not have. Use
      `createMock<SomeType>({ … })`, which takes a `DeepPartial<SomeType>` and answers a `SomeType`,
      or simply delete the cast where the literal already sits in a typed slot;
      [`prefer-create-mock`](/utilities/eslint-rules#prefer-create-mock) reports it.
    - **`(TestBed.inject(S).m as Mock).mockReturnValue(…)`.** `Mock` with no parameters is
      `Mock<any>`, so the cast removes the signature rather than adding the spy surface:
      `toHaveBeenCalledWith` stops comparing arguments. The member already is a spy — read it with
      `injectSpy(S).m`; [`no-mock-cast`](/utilities/eslint-rules#no-mock-cast) reports the cast.
    - **`Reflect.get(component, 'privateField')` to read past a modifier.** The key is an ordinary
      string argument, so nothing checks it — not the compiler, not a template gate, not a strict
      `tsc` pass — and `Reflect.set` writes an **own** property over the prototype, so a rename in
      production leaves the spec writing a dead property while the assertions under it pass forever.
      Drive the member through the public API and assert the effect, or the rendered template on a
      component; `mockValueProp` is the write that records its undo when a value really has to be
      forced onto a double. [`no-reflect-member-access`](/utilities/eslint-rules#no-reflect-member-access)
      reports it, and leaves `window` / `globalThis` alone, which is what the idiom is for.
    - **A test that calls the spied method itself and then asserts it was called.**
      `vi.spyOn(component.output, 'emit')`, then `component.output.emit(payload)`, then
      `expect(spy).toHaveBeenCalledWith(payload)` proves that `emit` calls `emit` — delete the
      template binding the title names and it stays green. Drive the real trigger instead;
      [`no-self-called-spy`](/utilities/eslint-rules#no-self-called-spy) reports the order that gives
      it away.
    - **A mock reset in a hook that the runner already performs.** With `clearMocks`, `mockReset`
      or `restoreMocks` on, Vitest resets before every test — ahead of the `beforeEach` chain and
      behind the previous `afterEach` — so the same call written in a hook does the work twice and
      reads as the line keeping the suite honest. Delete it;
      [`no-redundant-mock-reset`](/utilities/eslint-rules#no-redundant-mock-reset) reports it once
      it is told which flags are on, and leaves a reset inside a test body alone, because that one
      separates two arrangements inside one test.
    - **`expect(spy).toHaveBeenCalled()` where the arguments are what the test is about.** The bare
      matcher passes on any arguments at all, so a test titled "…with the host element" that
      asserts nothing else is green when the wrong node is passed. Name them —
      `toHaveBeenCalledWith(…)`, or [`mustBeCalledWith(…)`](/core/control-helpers) where the
      double is configured; [`no-unasserted-argument`](/utilities/eslint-rules#no-unasserted-argument)
      reports the two shapes where the file itself says the arguments matter.
