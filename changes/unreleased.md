# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Releases are auto-generated from Conventional Commits on push to
> `master`, so nothing here is pasted anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v3.1.0** (2026-08-28)._

## Added

- **`setupAutoSpy({ strayRejections: true })`** — fails the test a promise rejection zone.js
  swallowed surfaced in. zone.js drains a rejection nobody handled into `console.error` and stops
  there, so it never reaches the channel Vitest listens on and the run still exits 0: an assertion
  that dies inside a `.then()`, an `async` helper called without `await`, a `TypeError` in a
  `.then()` in production code — all green, all only in stderr. Six real defects of that shape were
  hiding in the 1688-spec, 11 587-test suite it came from. Off by default; it needs zone.js loaded
  and throws if it is not, and it installs no `process.on('unhandledRejection')` listener, which
  would silence the native rejections Vitest already reports. `trackStrayRejections()`,
  `countStrayRejections()` and `flushStrayRejections()` are exported for a narrower check.
- **`no-floating-assertion`** — a ninth ESLint rule, `error` in `configs.recommended`: an
  `expect()` in a `.then()` / `.catch()` / `.finally()` callback whose chain nobody awaits,
  returns, assigns or passes on. The test ends first, the assertion never runs, and the test passes
  no matter what it claimed. Only the immediately enclosing callback counts — that is the scope
  awaiting the chain actually repairs.

## Changed

- **The `vitest-auto-spies` alias is published by CI**
  (`.github/workflows/publish-alias.yml`), from both release paths, right after the canonical
  package reaches npm. It re-checks `alias:sync:check`, refuses to go out before the package it
  depends on, and skips a version that is already published — so it is safe to re-run, and it can
  be run on its own (Actions → _Publish alias_) to catch up a version released before it existed.
  Hand-publishing is what let the alias sit at 1.9.3 for two majors.
- **CI runs `test:zone` and `alias:sync:check`.** `vitest-auto-spy/zone` is the only entry that
  touches zone.js and no other suite loads it, so `fakeAsync` / `waitForAsync` were covered locally
  and nowhere else; the alias check keeps the generated package from drifting from `package.json`.

<!-- Add user-facing items here as work lands, mirroring `## [Unreleased]` in the root CHANGELOG. -->
