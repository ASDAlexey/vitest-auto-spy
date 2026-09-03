# vitest-auto-spy — instructions for AI coding agents

**Read [`AGENTS.md`](./AGENTS.md).** It is the single source, and it is written for you.

This file exists only because Claude Code discovers repository instructions from `CLAUDE.md` and
does not read `AGENTS.md`. Duplicating the content here would guarantee the two copies disagree
within a release, so this one is a pointer and nothing else.

Three things worth knowing before you start, because they are the ones that cost time:

- **Never commit, push or tag.** The maintainer does that by hand.
- `npm run check` is the gate — `deps:check`, typecheck, lint, `format:check`, jscpd, `llms:check`,
  `docs:check`, the sync checks, coverage at **100 %** over `src/lib/**` and `src/cli/**`, the type
  tests, the type-instantiation budget (`types:budget`), and the shared-env, zone, Bun and
  Bun-Angular suites. A change is not finished until it passes.
- **The landing cards in `docs-site/index.md` are prose inside YAML.** A `: ` in an unquoted
  `details:` or `title:` value ends the value and starts a new key, and the only thing that reads
  that frontmatter is `vitepress build` — in the pages workflow, after the gate, so it fails on
  `master` with the deploy already red. Write a semicolon or a dash instead, and run
  `npm run docs:check` after touching any frontmatter under `docs-site/`.

Repository conventions, the public API, the error catalogue and the recipes are all in `AGENTS.md`.
