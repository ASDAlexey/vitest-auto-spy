# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Releases are auto-generated from Conventional Commits on push to
> `master`, so nothing here is pasted anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v1.9.3** (2026-08-01)._

Staged for the next release (see the root `CHANGELOG.md` for the canonical text):

- **Added** `instanceMethodsToSpyOn` — spy instance-assigned callables (`signal()` fields, arrow
  props, `signalStore()` methods) on top of prototype discovery, without the typo warning.
- **Added** `mockValueProp` + `restoreMockedProps()`, a per-patch undo returned by every
  `mock*Prop` helper, implementations for `mockAccessorsProp`, and a `PropertyKey` overload
  everywhere.
- **Fixed** lazy method spy placeholders are assignable again (`spy.method = vi.fn()`).
