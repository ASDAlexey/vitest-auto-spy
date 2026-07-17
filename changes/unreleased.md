# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Releases are auto-generated from Conventional Commits on push to
> `master`, so nothing here is pasted anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v1.7.0** (2026-07-04)._

Staged for the next release (mirrors the `## [Unreleased]` section of the root `CHANGELOG.md`):

- **Added** — `returnValue()` alias on the `calledWith` / `mustBeCalledWith` chain, so migrating
  from `jest-auto-spies` / `@bugsplat/vitest-auto-spies` is a pure import swap.
- **Changed** — performance: `createSpyFromClass` caches each class's prototype method names in a
  `WeakMap`, so spying the same class per `beforeEach` no longer re-walks the prototype chain.
