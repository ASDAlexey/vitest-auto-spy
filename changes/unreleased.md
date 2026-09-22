# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Release notes are taken from the root `CHANGELOG.md` (and from
> Conventional Commits only when a version has no section there yet), so nothing here is pasted
> anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v5.23.0** — the git tag, `package.json` and `CHANGELOG.md` agree._

## Staged for the next release

<!-- Add user-facing items here as work lands, mirroring `## [Unreleased]` in the root CHANGELOG. -->

### Added

- `no-redundant-mock-reset` takes `{ configFile }` — the runner config to read the flags from, for one the
  search cannot find.
- `enableAngularDiagnostics({ pendingRequests: { ignoreCancelled: true } })` — a cancelled request
  is taken but no longer fails the test; `assertNoPendingRequests({ ignoreCancelled })` overrides it
  for one call. `PendingRequestsOptions` is exported.

### Changed

- The `Location` double's `path()` keeps the query of `go(path, query)` / `replaceState(path, query)`,
  as the real `Location.path()` does; Angular's `SpyLocation` drops it.

### Fixed

- `no-redundant-mock-reset`: no report for a restore or reset in `afterEach` / `afterAll`, for a reset
  anything ran before (an enclosing or earlier `beforeEach`, earlier statements), or in `beforeAll`; the
  fix takes the whole line.
- `no-unasserted-argument`: a name holding `vi.spyOn(obj, 'm')` is that member, a `vi.fn()` only itself.
- `no-vacuous-absence-assertion`: `expectEmission` / `expectEmissions` / `expectCompletion` / `expectError`
  count as a positive assertion.
- `prefer-settle-dynamic-import`: a namespace bound as the first statement of a test or hook is left alone.
- `no-reflect-member-access`: a binding declared as `Window` / `typeof globalThis` is the environment; a
  write onto a fixture literal gets its own message.
- `no-mock-cast`: the message on a cast of `mockReturnValue` names the `overload` option.
- Every fix and suggestion that adds an import writes it beside the file's imports of the same
  package instead of above its first line.
- `createMock<T>` takes a partial of an `Error`-shaped `T` (`HttpErrorResponse`, a class extending
  `Error`).
