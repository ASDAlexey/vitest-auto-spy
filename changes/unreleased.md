# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Release notes are taken from the root `CHANGELOG.md` (and from
> Conventional Commits only when a version has no section there yet), so nothing here is pasted
> anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v5.4.0** — the git tag, `package.json` and `CHANGELOG.md` agree._

## Staged for the next release

<!-- Add user-facing items here as work lands, mirroring `## [Unreleased]` in the root CHANGELOG. -->

### Added

- `no-stub-class-double` and `no-structural-double` (`warn`): a class of `vi.fn()` fields, and an
  object of `vi.fn()`s bound to a name typed `{ m: Mock }`.
- `prefer-provide-auto-spy` reads `useClass:`, `useExisting:`, `useValue: new StubMock()`,
  `TestBed.overrideProvider` and a `let` a `beforeEach` fills in.
- `no-overridden-provider` reports a registration a `TestBed.overrideProvider` replaces.
- `setupAutoSpy({ prototypePollution })`, `'throw'` by default, and `guardPrototypePollution` on its
  own: names the file that left a key on `Object.prototype`.

### Fixed

- `calledWith` / `mustBeCalledWith` / `resolveWith` missing when the package loads twice (5.4.0).
- `propsOutsideHooks` reporting `blockNetwork`'s own stubs.
- `doctor` reporting a spec-less scaffolded library as a broken tsconfig; now an `info`.
