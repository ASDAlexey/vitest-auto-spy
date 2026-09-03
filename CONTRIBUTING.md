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
| `npm run types:budget` | Count the type instantiations `Spy<T>` costs `tsc` on a generated fixture; fails past the budget in `scripts/check-type-budget.mjs` (`--measure` prints the numbers, `--print` the fixture) |
| `npm run build` | Build the ESM + CJS bundles and type declarations |
| `npm run bench` | Micro-benchmark this package only (`bench/auto-spy.bench.ts`) — runs in any checkout, no extra install |
| `npm run bench:vs` | Head-to-head micro-benchmark against `@bugsplat/vitest-auto-spies`, `vitest-mock-extended`, `@golevelup/ts-vitest` and a hand-written `vi.fn()` control (`bench/vs-libraries.bench.ts`) — needs `npm ci --prefix bench` first |
| `npm run bench:suite` | Suite-scale harness: generates synthetic suites (1 000 / 3 000 / 10 000 tests) and measures wall-clock and peak RSS per arm. `npm run bench:suite --help` prints every option; a full run at 10 000 tests takes tens of minutes, so start with `--sizes 100 --repeats 1` to smoke-test |

### Benchmarking against other libraries

The competitor packages live in `bench/package.json`, installed separately with
`npm ci --prefix bench` so the root `package.json` carries nothing it does not ship or test with —
the same pattern `docs-site/` already uses for its own dependencies.

**`bench/.npmrc` sets `legacy-peer-deps=true` deliberately — do not remove it.** The competitors
declare `vitest` as a peer. Without that setting, `npm ci --prefix bench` installs a second copy of
`vitest`/`@vitest/spy` next to the root one, which means two mock registries; the bench's prune then
reaches only one and the run dies out of memory. This has happened and cost a debugging cycle —
peers must resolve upward to the root install.

Two methodology rules behind every number in `bench/vs-libraries.bench.ts` and
`scripts/bench-suite.mjs`, both learned the hard way and not up for re-litigation:

- **Measure the built `dist/`, not `src/`.** `@vitest/coverage-v8` drops any `/node_modules/` URL
  before user config is consulted, so importing this package from `src/` instruments our sources on
  every run while a competitor's prebuilt package goes uninstrumented — plus a per-worker esbuild
  transform we would pay and they would not. `scripts/bench-suite.mjs --ours-source` defaults to
  `dist` for this reason; changing that default silently reintroduces the skew.
- **Interleave arms round-robin, never run them in blocks.** All repeats of one arm followed by all
  repeats of the next lets machine drift during the run land on whichever arm ran later and reads as
  a library difference. Both benchmarks interleave.

`.github/workflows/bench.yml` runs every arm in one job on one machine — splitting arms across
matrix jobs would compare two runners and report it as a library difference. `.github/dependabot.yml`
watches `bench/package.json`, so a competitor's release opens a PR that re-runs the head-to-head
against the new version; keep the two files in step if either changes.

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
| Landing | the `features:` cards in `docs-site/index.md` — prose inside YAML, so no `: ` in an unquoted value | `npm run docs:check` |
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

> Maintainers: no npm token is involved — both packages publish over npm Trusted
> Publishing (OIDC), and both trusted publishers name `auto-release.yml`. Pushing a
> `v*` tag manually still triggers the standalone
> [`Release`](./.github/workflows/release.yml) workflow, but that one only creates the
> GitHub Release; it does not publish.

### How the two packages authenticate to npm

Neither workflow holds an npm token. Both publish over **Trusted Publishing (OIDC)**: GitHub Actions
mints a short-lived OIDC token from `id-token: write`, npm checks the claims in it against a
publisher registered on the package, and hands back a credential that expires with the job. Nothing
in the repository can publish on its own, and there is no secret to leak or rotate.

Each package carries its own publisher, and both name the **same** workflow file:

| npm package | Publisher | Organization or user | Repository | Workflow filename | Environment | Allowed actions |
| --- | --- | --- | --- | --- | --- | --- |
| `vitest-auto-spy` | GitHub Actions | `ASDAlexey` | `vitest-auto-spy` | `auto-release.yml` | *(empty)* | `npm publish` |
| `vitest-auto-spies` | GitHub Actions | `ASDAlexey` | `vitest-auto-spy` | `auto-release.yml` | *(empty)* | `npm publish` |

Registered at npmjs.com → the package → **Settings** → *Trusted Publisher*. Changing it is an
account-level action, so it needs 2FA on the npm account; it cannot be scripted.

Four things this table is easy to get wrong:

- **`Repository` is the GitHub repo, not the npm package.** The alias lives in this repository, so
  it is `vitest-auto-spy` for both rows.
- **`Workflow filename` is a filename, not a path** — `auto-release.yml`, never
  `.github/workflows/auto-release.yml`.
- **`Environment` must stay empty.** Fill it in and npm starts demanding that the publishing job
  declare a matching `environment:`, which neither job does.
- **The alias's row also says `auto-release.yml`, not `publish-alias.yml`.** npm validates the
  workflow that *entered* the run, and `publish-alias.yml` is reached through `workflow_call`. That
  is why it has no `workflow_dispatch` of its own — see [the alias](#the-vitest-auto-spies-alias).

Reading a failure: **`ENEEDAUTH`** ("need auth … you need to authorize this machine") means npm found
no publisher matching the run — the row is missing, or the workflow that entered the run is not the
one it names. **`E403`** means it found one that disagrees about owner, repo or allowed action. In
neither case is the token expired, because there is no token.

Two ways to break this by accident:

- Passing `registry-url` to `actions/setup-node` (v4–v6). It writes
  `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` into `~/.npmrc`, npm reads that as "auth is
  already configured", skips the OIDC exchange entirely and dies with `ENEEDAUTH`. Fixed in v7.
- Letting the npm pin float below 11.5.1, or Node below 22.14 — the floors for trusted publishing.
  Both workflows pin an exact npm for this reason.

#### The January 2027 deadline

npm is retiring granular access tokens that bypass 2FA, in two steps:

- **2026-07-31, in force** — such a token can no longer perform account, org or package management
  actions.
- **~2027-01, announced** — it loses direct publish too: *"Their publishing surface will reduce to
  reading private packages and staging a publish, which a maintainer approves with 2FA."*

**This repository is not affected, and there is nothing to do in January.** Trusted publishing is
the recommended replacement, not a thing being retired, and both packages already use it. The
alternative npm offers — *staged publishing*, where CI prepares a release and a human approves it
with 2FA — would turn an automatic release into a manual one, which is why the trusted publishers
above allow `npm publish` and deliberately do **not** allow `npm stage publish`.

What would put us back in scope is reintroducing a token: an `NPM_TOKEN` secret, a `NODE_AUTH_TOKEN`
in a workflow, or a publish from a laptop as the normal path. A one-off manual publish to recover
from an outage is fine — it is a person with 2FA, not a bypass token.

Not affected by any of this: `GITHUB_TOKEN`, GitHub PATs, GitHub App tokens.

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

**Publishing is automatic too** — `.github/workflows/publish-alias.yml` runs after the canonical
package reaches npm, over the same Trusted Publishing (OIDC) handshake and with the same provenance.
It re-checks `alias:sync:check`, skips a version that is already published, and refuses to publish
before the canonical package is on npm (the alias depends on it by an exact caret range, so an alias
published first would be uninstallable).

> **Switched off since 2026-09-03.** The npm name `vitest-auto-spies` is still held by a tombstone
> from the earlier unpublish, so no trusted publisher can be registered for it and every run ends in
> `ENEEDAUTH` — a red job on an otherwise green release, for a package that cannot go out anyway.
> The automatic call is disabled in `auto-release.yml`; the alias now publishes only on a manual
> *Run workflow* with `alias_ref`, which is also how to check whether npm has freed the name. To
> restore it, put the second clause of the `publish-alias` job's `if` back — the note above the job
> spells it out.

It is `workflow_call`-only on purpose. npm validates the workflow that **entered** the run, and for
a reusable workflow that is the caller — so the trusted publisher registered on `vitest-auto-spies`
names `auto-release.yml`, and a run started directly on *Publish alias* would present a workflow ref
npm does not trust.

Two cases still need a human:

- **Catching up a version that was released without the alias** — Actions → *Auto Release* → *Run
  workflow*, with `alias_ref` set to the tag (e.g. `v3.9.0`). That skips the whole canonical release
  and only republishes the alias; it is a no-op if that version is already on npm.
- **npm is down or the OIDC exchange is rejected** — the fallback is `cd alias && npm publish`, which
  needs a local login (`npm login`; a stale `~/.npmrc` token fails as a **404 on PUT**, not as a 401,
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
