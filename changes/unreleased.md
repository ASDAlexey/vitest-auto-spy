# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Releases are auto-generated from Conventional Commits on push to
> `master`, so nothing here is pasted anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v3.1.0** (2026-08-28)._

## Changed

- **The `vitest-auto-spies` alias is published by CI**
  (`.github/workflows/publish-alias.yml`), from both release paths, right after the canonical
  package reaches npm. It re-checks `alias:sync:check`, refuses to go out before the package it
  depends on, and skips a version that is already published — so it is safe to re-run, and it can
  be run on its own (Actions → *Publish alias*) to catch up a version released before it existed.
  Hand-publishing is what let the alias sit at 1.9.3 for two majors.
- **CI runs `test:zone` and `alias:sync:check`.** `vitest-auto-spy/zone` is the only entry that
  touches zone.js and no other suite loads it, so `fakeAsync` / `waitForAsync` were covered locally
  and nowhere else; the alias check keeps the generated package from drifting from `package.json`.

<!-- Add user-facing items here as work lands, mirroring `## [Unreleased]` in the root CHANGELOG. -->
