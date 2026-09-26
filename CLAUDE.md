# vitest-auto-spy — instructions for AI coding agents

This file exists only because Claude Code discovers repository instructions from `CLAUDE.md`. It is a
pointer and nothing else, so it cannot disagree with the files it points at.

- **Working on this repository** — the library's source, its tests, its docs? Read
  [`CONTRIBUTING.md`](./CONTRIBUTING.md): the commands, the gate, every surface a change has to
  reach, and the release flow.
- **Writing tests with the library** in some other project? Read [`AGENTS.md`](./AGENTS.md), the
  reference that ships in the npm package: a short map, with one file per topic in
  [`agent-docs/`](./agent-docs).

Three things worth knowing before you start, because they are the ones that cost time:

- **Never commit, push or tag.** The maintainer does that by hand.
- `npm run check` is the gate, and the `check` script in `package.json` is the one list of what it
  runs; `CONTRIBUTING.md` explains each step. A change is not finished until it passes.
- **The landing cards in `docs-site/index.md` are prose inside YAML.** A `: ` in an unquoted
  `details:` or `title:` value ends the value and starts a new key, and the only thing that reads
  that frontmatter is `vitepress build` — in the pages workflow, after the gate, so it fails on
  `master` with the deploy already red. Write a semicolon or a dash instead, and run
  `npm run docs:check` after touching any frontmatter under `docs-site/`.
