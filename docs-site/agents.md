---
title: For AI agents
description: llms.txt, llms-full.txt, a bundled AGENTS.md and a Claude Code skill — how to point Claude Code, Codex, Cursor or any other agent at this library.
---

# For AI agents

Most tests are now written with an assistant in the loop. Documentation an agent has to *infer* the
API from costs tokens on every task and produces the same handful of mistakes each time, so this
package ships a second, compressed form of its documentation written for a machine reader: the
decision tree, the configuration semantics, an error→fix table and the anti-patterns.

## The four entry points

| What                                                             | Where                                                        | Best for                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| [`llms.txt`](/llms.txt)                                          | the site root                                                | a crawler choosing the one page it needs                  |
| [`llms-full.txt`](/llms-full.txt)                                | the site root                                                | reading the entire documentation in a single fetch        |
| [`AGENTS.md`](https://github.com/ASDAlexey/vitest-auto-spy/blob/master/AGENTS.md) | `node_modules/vitest-auto-spy/AGENTS.md` | any agent, **with no network** — it ships in the tarball  |
| [Spec patterns](/recipes)                                        | the docs site                                                 | the shapes a real suite converged on, with the frequencies |
| A Claude Code skill                                              | `skills/vitest-auto-spy/SKILL.md`, also in the tarball        | Claude Code, loaded only when a spec mentions the library |

[`llms.txt`](https://llmstxt.org) is the convention an LLM-facing crawler looks for at a docs site
root: a link-only map, so an agent fetches one page instead of scraping the rendered HTML of ten.
Both files are generated from this site's sidebar and checked in CI, so they cannot drift.

## Point your agent at it once

The single highest-leverage line, in your project's `CLAUDE.md` / `AGENTS.md` / `.cursorrules`:

```md
When writing or fixing tests that use `vitest-auto-spy`, first read
`node_modules/vitest-auto-spy/AGENTS.md`. It is the authoritative reference for the API,
the configuration semantics and the common mistakes.
```

That file is already on disk in every project that installs the package, so the agent pays no
network round-trip and gets the version it actually has installed rather than whatever the web
returned.

## Claude Code plugin

The repository doubles as a Claude Code plugin marketplace, so the skill installs without touching
your project files:

```
/plugin marketplace add ASDAlexey/vitest-auto-spy
/plugin install vitest-auto-spy@vitest-auto-spy
```

The skill's description lists the library's exports and its four most common error messages, so it
loads when a task is actually about this package and stays out of the way otherwise.

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

These five account for the large majority of broken specs, and all five are covered in `AGENTS.md`:

1. **`let s: MyService = createSpyFromClass(MyService)`.** `Spy<T>` is a mapped type and drops
   private members. Declare it as `Spy<T>`, or bridge with [`asInstance` / `asSpy`](/core/spy-typing) —
   never with `as unknown as T`.
2. **Treating `methodsToSpyOn` as additive.** It is an exhaustive whitelist. For a callable that is
   an instance field, the additive option is
   [`instanceMethodsToSpyOn`](/core/create-spy-from-class#instancemethodstospyon-callables-that-are-not-on-the-prototype).
3. **Calling `nextWith` without `import 'vitest-auto-spy/rxjs'`.** The observable layer is opt-in.
4. **Importing `vitest-auto-spy` inside a `bun test` file.** Each entry registers its own mock
   adapter on import; use [`vitest-auto-spy/bun`](/runtimes/bun).
5. **`expect()` inside a `subscribe()` callback.** A silent stream makes it a green test that
   asserted nothing — use [`expectEmission`](/core/observable-assertions), where the assertion is
   the `await`.
