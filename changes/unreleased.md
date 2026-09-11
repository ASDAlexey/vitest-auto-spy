# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Release notes are taken from the root `CHANGELOG.md` (and from
> Conventional Commits only when a version has no section there yet), so nothing here is pasted
> anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v5.5.0** — the git tag, `package.json` and `CHANGELOG.md` agree._

## Staged for the next release

<!-- Add user-facing items here as work lands, mirroring `## [Unreleased]` in the root CHANGELOG. -->

### Added

- `setupAutoSpy({ strayConsole })` and `guardStrayConsole`: console output nothing absorbed fails the test
  that wrote it, and output outside any test fails the file.
- `setupAutoSpy({ preset: 'strict' })`: every guard at its failing grade.
- `setupAutoSpy({ misconfiguration: 'throw' })`: the library's own misuse reports throw at the call site.
- `no-passthrough-console-spy`, `no-console-in-spec`, `no-import-time-console-spies` (all `error`).
- `withoutStrayTimerTracking`; the Web Storage probe runs inside it.
- `onStrayTimers` receives `timers` (kind, scheduling file, frames); `describeStrayTimers()`.
- `createAutoMock(…, { name })`; `provideAutoSpyForToken` names the token in strict reports.

### Changed

- Under `strayConsole` the `/console` import installs nothing; `restoreConsole()` keeps the spies.
- `injectSpy`'s not-a-spy warning de-duplicated per spec file; `createAutoMock().constructor` is `Object`.
- `provideHttpTesting()` verifies only the modules built from its providers.
- The strict report prints instances by class, data capped at 200 characters; the teardown net explains
  itself once per file.

### Fixed

- Strict doubles no longer throw from Angular's lifecycle hooks (`ngOnDestroy` at teardown).
- Suite-wide `strict` / `onUnstubbedCall` / `setSpyEngine` reach doubles built by every bundle.
- `overrides` on a spied getter seeds the getter spy.
- `enableAngularDiagnostics()` and `provideHttpTesting({ verifyOnTeardown })` check every spec file of a
  worker, and work under `sequence: { hooks: 'list' }`; `shadowedProviders` false reports and `NG0201`.
