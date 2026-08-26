# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Releases are auto-generated from Conventional Commits on push to
> `master`, so nothing here is pasted anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v1.10.0** (2026-08-18)._

Staged for the next release (see the root `CHANGELOG.md` for the canonical text):

- **Added** `renderShallow()` — the shallow-`TestBed` copy-paste as one call, measured on
  `the reference suite`: three converted component specs went 291 ms → 174 ms (1.7×), with the honest
  caveat that a leaf component gets slightly slower.
- **Added** `createWithAutoSpies()` — build a class through Angular DI with every unprovided token
  auto-spied.
- **Added** `stable()` / `flushEffects()` — zoneless waiting instead of `detectChanges()`.
- **Added** `expectEmission()` / `expectEmissions()` / `expectNoEmission()` — Observable assertions
  that fail when the stream stays silent.
- **Added** `vitest-auto-spy/setup` with `setupAutoSpy()` — property restore, duplicate-copy
  detection and mock-registry hygiene in one call.
- **Added** `enableTestBedDiagnostics()` — per-file report of where a spec's time goes.
- **Added** `vitest-auto-spy/eslint-plugin` — five rules, each linking to its README recipe.
- **Added** `registerSignalMatchers()`, `asInstance()` / `asSpy()`, `createSpyClass()`,
  `countMockedProps()`; the `mock*Prop` helpers are exported from the core entry too.
- **Added** README section "How to mock" — one recipe per thing a spec stands in for.
- **Added** docs-site pages for every new helper (Observable assertions, Spy/T bridging, test-run
  hygiene, the ESLint plugin) and an Angular page rewritten around them.
- **Fixed** three bugs the helpers found in themselves while being pointed at a real suite: the
  diagnostics measured on a faked clock, their report was swallowed by the library's own console
  spies, and `renderShallow` rejected `EnvironmentProviders`.
- **Fixed** the two specs that only passed with per-file isolation; the suite now runs green with
  `isolate: false` in a single worker (`npm run test:shared-env`, wired into CI).
- **Fixed** an unformatted source file, and wired `lint` + `format:check` into CI so the next one
  is caught there rather than noticed by hand.
