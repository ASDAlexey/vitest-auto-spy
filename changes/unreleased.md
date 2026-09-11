# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Release notes are taken from the root `CHANGELOG.md` (and from
> Conventional Commits only when a version has no section there yet), so nothing here is pasted
> anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v5.7.0** — the git tag, `package.json` and `CHANGELOG.md` agree._

## Staged for the next release

<!-- Add user-facing items here as work lands, mirroring `## [Unreleased]` in the root CHANGELOG. -->

### Added

- `registerAutoSpyDefaults(TOKEN, config)` from `vitest-auto-spy/angular`: an `InjectionToken` registers over the
  class registry, and `provideAutoSpyForToken(TOKEN)` merges its arguments over it; `AutoSpyTokenDefaults<T>`,
  token rows in the table form, `clearAutoSpyDefaults(TOKEN)`.
- `selfReturning: ['m']` on every factory's configuration and in a registration: the named methods answer the
  double itself, a default like `returns` that counts as configured under `strict`.
- `no-unknown-use-value-key` (`error`, type-aware): a key of an object `useValue` literal the provided type does
  not have — keys only, never the values.
- `vitest-auto-spy/angular-router`: `provideActivatedRoute`, `injectActivatedRoute`, `createActivatedRoute` —
  Angular's own `ActivatedRoute` over one record, streams and snapshot moved together; `@angular/router`
  is a new optional peer.
- `no-ts-expect-error-on-double` and `no-constant-expect` (both `error`); `no-compile-components`
  (`error`, silent until `{ builder: 'inline-resources' }`, suggestion removes the call). Thirty-four rules.
- `setupAutoSpy({ unconfiguredReads })`: a strict double's getter read, or stream subscribed to, that nothing
  configured is reported after the test; `onUnstubbedRead` (suite-wide or per double) takes the findings instead.
- `createComponentStub(Real, overrides?, { template }?)` (`/angular`): a standalone stand-in for a child component,
  directive or pipe, its selector, inputs, outputs and `exportAs` read from the compiled definition.
- `stubWebStorage(key?, { items, view }?)` (`/dom-stubs`): an in-memory `localStorage` / `sessionStorage` with a
  `snapshot()` handle, undone by `restoreMockedProps()`.

### Changed

- `prefer-provide-auto-spy`'s token message recommends `{ selfReturning: ["channel"] }` for a chained call
  instead of a `vi.fn().mockReturnThis()` seed.

### Fixed

- `provideAutoSpy` / `overrideAutoSpy` / `overrideComponentProvider` keep a generic class's default next to an
  accessor list (or `overrides`) and `returns`; the core `createSpyFromClass` still needs the type argument there.
- The `restoreWebStorage()` stand-in coerces keys and `key()` indexes as the platform does.
