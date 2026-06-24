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
| `npm run build` | Build the ESM + CJS bundles and type declarations |

## Guidelines

- **Keep coverage at 100%.** New code needs tests; the coverage thresholds will fail CI otherwise.
- **Match the existing style** — the codebase mirrors the `jest-auto-spies` API surface.
- **One logical change per PR.** Small, focused PRs get reviewed faster.
- **Every user-facing change updates [`CHANGELOG.md`](./CHANGELOG.md) in the same PR** under
  the `## [Unreleased]` heading (`Added` / `Changed` / `Fixed` / `Removed`). The release
  automation bumps the version and publishes, but it does **not** write the changelog — so if
  you skip this, the changelog silently falls behind npm. See [Releasing](#releasing).

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
publishes to npm (with provenance) and opens a GitHub Release with generated
notes. **You never bump the version or tag by hand** — just land good commits.

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
3. Run `npm run typecheck && npm run test:coverage && npm run build` locally.
4. Open a pull request describing the change and the motivation.

By contributing you agree that your contributions are licensed under the project's
[MIT license](./LICENSE).
