# Contributing

Thanks for taking the time to contribute! 🎉

## Getting started

```bash
git clone https://github.com/ASDAlexey/vitest-auto-spy.git
cd vitest-auto-spy
npm ci
```

## Development workflow

| Command | What it does |
| --- | --- |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage (100% thresholds enforced) |
| `npm run typecheck` | Type-check the project with `tsc --noEmit` |
| `npm run test:types` | Assert what callers **infer** — `expectTypeOf` cases under `src/type-tests` |
| `npm run build` | Build the ESM + CJS bundles and type declarations |

## Guidelines

- **Keep coverage at 100%.** New code needs tests; the coverage thresholds will fail CI otherwise.
- **A helper whose value is its type needs a type test.** `npm run typecheck` proves the sources
  compile; it says nothing about what a call site infers, and the two have already diverged here:
  `expectEmission` shipped for several versions inferring `Promise<unknown>`, every runtime test
  green, until a consumer's build failed on `TS2339`/`TS2488`. Add the `expectTypeOf` case next to
  the runtime one in `src/type-tests/`.
- **Match the existing style** — the codebase mirrors the `jest-auto-spies` API surface.
- **One logical change per PR.** Small, focused PRs get reviewed faster.
- **Every user-facing change updates [`CHANGELOG.md`](./CHANGELOG.md) in the same PR** under
  the `## [Unreleased]` heading (`Added` / `Changed` / `Fixed` / `Removed`). The release
  automation bumps the version and publishes, but it does **not** write the changelog — so if
  you skip this, the changelog silently falls behind npm. See [Releasing](#releasing).

## Every surface a feature has to reach

A feature is not shipped when its code is merged; it is shipped when somebody can find it. This
package has more surfaces than most, because half of its audience is a coding agent that will
never open the README. **Walk this table on every user-facing change** — the ones with a command
are checked in CI, the rest are not, and the ones that are not are the ones that rot.

| Surface | Where | Checked by |
| --- | --- | --- |
| Changelog | `CHANGELOG.md`, under `## [Unreleased]` | — |
| README bullet | the feature list at the top | — |
| README section | a `##` section, and its line in the table of contents | — |
| Docs page | `docs-site/<area>/<page>.md` | — |
| Docs sidebar | `docs-site/.vitepress/config.mts` — a page missing here is also missing from `llms.txt` | `npm run llms:check` |
| Landing | the `features:` cards in `docs-site/index.md` | — |
| Agent reference | `AGENTS.md` — the file an agent reads instead of the README | — |
| Claude Code skill | `skills/vitest-auto-spy/SKILL.md` | — |
| Agent guide | `docs-site/agents.md`, when the change is about how an agent uses the package | — |
| LLM files | `docs-site/public/llms.txt`, `llms-full.txt` — regenerate with `npm run llms` | `npm run llms:check` |
| Plugin manifest | `.claude-plugin/` | `npm run plugin:sync:check` |
| Alias package | `alias/` — a new **entry point** must appear there | `npm run alias:sync:check` |
| Size badge | the `minzip` badge, when the main entry grew | `npm run size:badge:check` |
| TODO | `TODO.md` — mark what shipped, and record what it deliberately did **not** ship | — |

Two habits that keep this cheap:

- **Write the docs page before the last commit, not after the release.** A page written later
  documents what you remember, which is never the same as what you built.
- **Say what was left out.** A `TODO.md` entry that records the three things a feature does not do
  is worth more than one that says it is done — the next person reads it before re-deriving the
  same three trade-offs.

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add nextWithError helper
fix: handle empty calledWith args
docs: clarify zoneless setup
test: cover createObservableWithValues edge cases
chore: bump dev dependencies
```

The commit type also drives the **automatic version bump** on release (see below),
so choose it accordingly.

## Releasing

Releases are **fully automated**. When a PR is merged into `master`, the
[`Auto Release`](./.github/workflows/auto-release.yml) workflow inspects the
Conventional Commits since the last tag and, if there is anything releasable:

| Commit(s) since last tag | Version bump |
| --- | --- |
| `BREAKING CHANGE:` in body, or `type!:` in the header | major |
| `feat:` | minor |
| `fix:` | patch |
| only `chore` / `docs` / `refactor` / `test` / `ci` / … | no release |

The workflow then bumps `package.json`, creates the `vX.Y.Z` commit and tag,
publishes to npm (with provenance), publishes the `vitest-auto-spies` alias
(see [below](#the-vitest-auto-spies-alias)) and opens a GitHub Release with
generated notes. **You never bump the version or tag by hand** — just land good
commits.

> Maintainers: this requires an `NPM_TOKEN` repo secret. Pushing a `v*` tag
> manually still triggers the standalone [`Release`](./.github/workflows/release.yml)
> workflow as a fallback.

### Keeping the changelog in sync with npm

The automation owns the **version number**; humans own the **changelog**. The two only stay
aligned if we follow one rule:

1. **Choose the commit type deliberately** — it decides the bump (table above). A `feat:` for a
   non-feature (or a `fix:` for a refactor) produces a misleading release. When in doubt about
   whether something should release at all, use `chore`/`refactor`/`docs` (no release).
2. **Update `## [Unreleased]` in the same PR** as any user-facing change. This is the entire
   defence against drift — the workflow will not do it for you.
3. **Right after an auto-release lands** (you'll see the `chore(release): x.y.z` commit and a new
   `vX.Y.Z` tag), open a tiny follow-up PR that:
   - renames `## [Unreleased]` → `## [x.y.z] - YYYY-MM-DD` (date = the npm publish date),
   - adds a fresh empty `## [Unreleased]` on top,
   - adds the `[x.y.z]` compare link at the bottom and repoints `[Unreleased]` to `vX.Y.Z...HEAD`.

   Type this commit `docs(changelog): ...` so it does **not** trigger another release.

### The `vitest-auto-spies` alias

[`vitest-auto-spies`](https://www.npmjs.com/package/vitest-auto-spies) (plural) is a **separate npm
package** whose entire content is one re-export stub per entry point. It is generated, never edited
by hand:

```bash
npm run alias:sync         # regenerate alias/ from package.json
npm run alias:sync:check   # part of `npm run check` — fails when the two drift
```

The generator reads the canonical `exports` map, so a new subpath reaches the alias automatically,
with the same conditions (only `/node` and `/eslint-plugin` ship CJS) and the same peer ranges. The
`version` lifecycle script runs it and stages `alias/`, so an auto-release carries the bump.

**Publishing is automatic too.** `.github/workflows/publish-alias.yml` runs after the canonical
package reaches npm — from both release paths, with the same `NPM_TOKEN` and the same provenance —
so there is nothing to do by hand. It re-checks `alias:sync:check`, skips a version that is already
published, and refuses to publish before the canonical package is on npm (the alias depends on it by
an exact caret range, so an alias published first would be uninstallable).

Two cases still need a human:

- **Catching up a version released before that workflow existed** — Actions → *Publish alias* →
  *Run workflow* on `master`. It publishes whatever version `alias/package.json` carries, and is a
  no-op if that one is already on npm.
- **npm is down or the token is rejected** — the fallback is `cd alias && npm publish`, which needs
  a local login (`npm login`; a stale `~/.npmrc` token fails as a **404 on PUT**, not as a 401,
  because npm hides unauthorised writes behind "not found").

### Release checklist — these four must always match

Before and after every release, verify the single source of truth lines up:

```bash
npm view vitest-auto-spy version          # npm latest
node -p "require('./package.json').version"  # package.json
git describe --tags --abbrev=0            # latest git tag (drop the leading v)
grep -m1 '## \[' CHANGELOG.md             # top versioned changelog heading
```

All four must be the **same version**. If they drift (as happened once between 1.1.0 and 1.3.0),
fix the changelog with a `docs(changelog):` commit — never re-tag or re-publish a version that
npm already has.

### Why no `changes/unreleased.md` hand-off?

GitHub Releases are generated automatically (`gh release create --generate-notes`), so there is
nothing to paste by hand. `CHANGELOG.md` is the single, canonical history; `changes/` is only an
optional local staging mirror and is not required by the release flow.

## Submitting a PR

1. Fork the repo and create a branch from `master`.
2. Make your change with tests.
3. Run `npm run typecheck && npm run test:coverage && npm run test:types && npm run build` locally.
4. Open a pull request describing the change and the motivation.

By contributing you agree that your contributions are licensed under the project's
[MIT license](./LICENSE).
