# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Release notes are taken from the root `CHANGELOG.md` (and from
> Conventional Commits only when a version has no section there yet), so nothing here is pasted
> anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v5.9.0** — the git tag, `package.json` and `CHANGELOG.md` agree._

## Staged for the next release

<!-- Add user-facing items here as work lands, mirroring `## [Unreleased]` in the root CHANGELOG. -->

### Added

- **The `Router` double answers `currentNavigation()` and `getCurrentNavigation()`.** `null` while the router
  stands at its URL, which is what the real one answers between navigations;
  `setCurrentNavigation({ extras: { state } })` and `provideRouterDouble({ currentNavigation })` put one in
  flight, and a `NavigationStart` through `emitNavigation()` starts one while the terminal events end it.
  Measured on an 11 000-file monorepo: 9 spec files stub one of the two, 20 production call sites read them.

- **`no-redundant-smoke-test`.** The generated `it('should create', () => expect(pipe).toBeTruthy())`, reported
  wherever the block it sits in already has tests that run the same `beforeEach` — nested `describe`s counted. A
  suggestion deletes it. Silent where it is the block's only running test.

- **`perf --top` says why there is no table.** The hotspot tables keep their one-second floor, but the
  floor was invisible: `--top 15` on a fast suite printed nothing at all. Asked for explicitly, it now
  answers with the number that suppressed it.

### Changed

- **The `perf` hotspot tables name the file before its bodies.** A body's label was one `file › name`
  column, and a long path ate it from the left: `…ponent.spec.ts › MediaPremiumBenefitsComponent › …`
  answered neither which file nor which test. The bodies table prints the file once, whole, with its
  bodies indented under it — a name that still does not fit loses its head, where the suites around
  the test are, and keeps the test. A path too wide for its column is cut in the middle on segment
  boundaries, so the first segment (the project) and the last (the file name) always survive. Times
  at or over the per-body budget are red and the header row is dim; `NO_COLOR`, `FORCE_COLOR=0` and
  `TERM=dumb` turn all of it off.

### Fixed

- **A getter in `overrides` ran while the double was being built.** `createAutoMock` and `mockDeep`
  read every seeded key with `Reflect.get` and stored the result, so an accessor in the seed was
  flattened at construction: a getter written to throw — the way a spec says "this global is missing
  on this platform" — failed the provider literal during `TestBed.configureTestingModule` instead of
  at the branch under test, and a `{ set }` seed was dropped entirely. Seeds now keep their
  descriptor, so an accessor is installed as one and answers reads and writes exactly like a patch
  from `mockAccessorsProp`. Reading the key's descriptor, `Object.keys` and `in` still do not run it.

- **`perf` counts a computed `maxWorkers`.** A config passing a value it derived as a shorthand property was
  told it had declared no worker cap.

- **A transform input was typed as the signal itself**, so `renderShallow({ inputs })` and `setInputs` rejected
  every value a spec could pass an `input(x, { transform: booleanAttribute })`. It now takes what the transform
  takes and rejects what it returns.

- **A `Router` member the double lacks throws even when it is a field.** The guard read
  `Router.prototype`, and `currentNavigation`, `config`, `navigated`, `routeReuseStrategy`,
  `onSameUrlNavigation` and `componentInputBindingEnabled` are declared on the instance — so they read
  `undefined` instead of throwing, and a component calling the signal died as "is not a function".

- **`no-sync-testbed-await` names what the call it reported answers.** The message said "answers the
  TestBed" for `createComponent` / `getLastFixture` too, contradicting its own next sentence.
