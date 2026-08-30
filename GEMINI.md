# vitest-auto-spy — instructions for AI coding agents

**Read [`AGENTS.md`](./AGENTS.md).** It is the single source, and it is written for you.

This file exists only because the Gemini CLI reads `GEMINI.md` by default and treats `AGENTS.md` as
opt-in (`context.fileName` in `settings.json`). Duplicating the content here would guarantee the two
copies disagree within a release, so this one is a pointer and nothing else.

Two things worth knowing before you start, because they are the ones that cost time:

- **Never commit, push or tag.** The maintainer does that by hand.
- `npm run check` is the gate — typecheck, lint, jscpd, `llms:check`, the sync checks, coverage at
  **100 %** over `src/lib/**` and `src/cli/**`, the type tests, and the shared-env, zone, Bun and
  Bun-Angular suites. A change is not finished until it passes.

Repository conventions, the public API, the error catalogue and the recipes are all in `AGENTS.md`.
