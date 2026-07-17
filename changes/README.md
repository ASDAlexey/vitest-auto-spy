# Release staging — `changes/`

Optional local mirror of the next release's notes. **The root `CHANGELOG.md` is canonical**, and
GitHub Releases are auto-generated from Conventional Commits — nothing here is pasted anywhere.

- **`unreleased.md`** — a human-readable mirror of the `## [Unreleased]` section of the root
  `CHANGELOG.md`. Keep it roughly in sync as work lands; it is not required to cut a release.

## How releases actually cut

Releases are automated by `.github/workflows/auto-release.yml`: pushing to `master` reads the
Conventional Commits since the last tag and bumps the version (`feat:` → minor, `fix:` → patch,
`BREAKING CHANGE` / `type!:` → major, anything else → no release), tags `vX.Y.Z`, publishes to npm
with provenance, and creates a GitHub Release with auto-generated notes.

The **one manual step**: the automation owns the version number but never writes `CHANGELOG.md`.

1. Update the `## [Unreleased]` section of the root `CHANGELOG.md` as PRs land.
2. Right after each auto-release, rename `## [Unreleased]` → `## [x.y.z] - YYYY-MM-DD` and fix the
   compare links, in a `docs(changelog):` commit (a `docs` commit does **not** trigger a release).
3. Reset this `changes/unreleased.md` for the next cycle and update its _Last released_ line.

Verify the four sources match after a release: `npm view vitest-auto-spy version`,
`package.json`, the latest `v*` git tag, and the top `CHANGELOG.md` heading.
