# Release staging — `changes/`

This folder is the hand-off point for cutting a GitHub Release.

- **`unreleased.md`** — the human-readable release notes for the next version. It mirrors the
  `## [Unreleased]` section of the root `CHANGELOG.md`. Edit notes here as work lands, then
  paste the contents straight into the GitHub Release body when you tag.

## Cutting a release

1. Decide the version bump (semver) and update `package.json` `version`.
2. Move the `## [Unreleased]` block in `CHANGELOG.md` into a new `## [x.y.z] - YYYY-MM-DD`
   section; reset `## [Unreleased]` to empty and fix the compare links.
3. Copy `changes/unreleased.md` into the GitHub Release body (the repo already auto-creates a
   Release on tag push — see `.github/workflows/release.yml`).
4. Reset `changes/unreleased.md` back to the empty template for the next cycle.
