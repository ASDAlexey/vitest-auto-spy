# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Releases are auto-generated from Conventional Commits on push to
> `master`, so nothing here is pasted anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v3.16.0** — the git tag and `package.json` agree._

> ⚠️ **`CHANGELOG.md` is seven releases behind the tags.** Its newest released heading is
> `## [3.9.0]`, while the latest tag and `package.json` are both `3.15.0` — so whatever shipped as
> 3.10.0 through 3.15.0 is still sitting under `## [Unreleased]` there, mixed in with work that has not
> shipped at all. This is the one manual step the automation does not do (`CONTRIBUTING.md` →
> "Releasing", step 2): split that section into one heading per tag, `## [3.10.0]` … `## [3.16.0]`, by reading the
> Conventional Commits between the tags, fix the compare links, and commit it as `docs(changelog):`
> — a `docs` commit does not trigger a release.

## Staged for the next release

- **`npx vitest-auto-spy perf`** — where a suite's CPU time actually goes, and which spec files to
  act on. Runs Vitest once with a reporter this package ships, reads the per-file phase timings
  through `TestModule.diagnostic()` (Vitest's own public accessor — nothing parses terminal
  output), and reports each phase's share of the total. When a phase dominates it names files: the
  ones that reach no DOM and could run under the `node` environment (a rule that reports
  **undecided** rather than guessing whenever it cannot resolve an import), and the ones that
  import a barrel. Always exits 0 — a slow suite is not a failing one. `--json <path>` re-analyses
  a report from an earlier `--out <path>` run instead of running Vitest again.

- **`lazySpies: 'proxy'`** — the same laziness with one trap object instead of one
  `Object.defineProperty` placeholder per method. 101 584 B → 11 813 B retained on a 400-method class
  (253 B per method against 25 B), and 5.67× faster to build and touch there. Opt-in: a `Proxy`
  cannot remove itself, so it costs +30 ns per read and +43 ns per call forever, and it loses below
  ~20 methods. For generated API clients and ngrx facades under `isolate: false`. Costs +0.38–0.40 kB
  min+gzip on every entry carrying the core; the default path is unchanged in time and in heap.

- **`doctor` check `coverage-include-recompiles-globs`** (`info`) — a coverage scope large enough
  that `picomatch` recompiling it per file costs more than collecting the coverage: 114.1 s of a
  224.2 s `Generate coverage` on one real shard, against 0.35 s for the untested-files pass usually
  blamed for it. Points at the provider-wrapper recipe now on the Angular page — 229.59 s → 22.88 s
  with a byte-identical report.

- **Control helpers shared across spies** — one set of `this`-based functions for the run instead
  of eight to twenty closures per materialised method; reset and clear hooks moved onto the spy's
  state under its mark. Heap per spied method −17 % on `node:test`, −33 % with rxjs, −39 % on Bun
  with rxjs; first call −10 % to −28 % by runtime. A helper destructured off its spy now throws with
  a named message instead of working by accident. Spy creation unchanged; the layouts that were
  tried and rejected are recorded in `core/performance.md`.

- **`failWith(error)`** on the sync bundle and on a `calledWith` chain — the cross-runtime answer to
  Vitest 4.1's `mockThrow`, and the only way any runtime offers to make _one_ argument set throw.
  Not named `throwWith`: that is the observable helper, and every spy carries every bundle.

- **`extendWithAutoSpies(test, spec)`** (`/angular`) — a map of dependencies as typed `TestBed`
  fixtures in one `configureTestingModule`. Vitest 4.1+, and it throws a named error on anything
  older instead of letting the object-form `extend` hand every test `undefined`.

- **`onStrayTimers(({ cancelled }) => …)`**, and a stderr warning when `strayTimers` and Vitest 4.1's
  `detectAsyncLeaks` are both on — the sweep used to empty that report silently.

- **ESLint `no-bare-called-with`** — `spy.m.calledWith(1);` as a statement asserts nothing, and 4.1's
  chai-style `expect(fn).to.have.been.calledWith(x)` made the confusion likely.

- **Fixed:** a stray-timer leak was framed inside `node_modules/vitest-auto-spy`; the scheduler
  wrappers now go through `vi.defineHelper`, so the code frame is the spec line again.

- **`subscribeSpyTo` / `ObserverSpy` / `SubscriberSpy`** (`/observer-spy`) — the `@hirez_io/observer-spy`
  surface, with its live-array, `any[]`, read-past-the-end and rxjs-7 rethrow defects fixed.

- **`codemod --from jasmine`** (13 transforms) and a `doctor` check that recognises a jasmine-era
  repository. `spyOn` is rewritten with an explicit stub, because jasmine's stubs and Vitest's calls
  through.

- **Fixed:** the codemod declined to place 23 multi-entry exports (`provideAutoSpy`, `injectSpy`, …)
  and reported "no entry point exports it", which was false. It now resolves from evidence in the
  file and warns with the alternatives when there is none.

- **ESLint:** `jasmine-namespace-without-entry`, `no-jasmine-globals`, `no-save-arguments-by-value`
  and `prefer-native-spy-api` (off by default), plus `no-done-callback` now catching `done.fail(…)`.

- **`vitest-auto-spy/jasmine`** — the drop-in surface for a suite coming from `jasmine-auto-spies`:
  `.and` / `.calls` / `.withArgs` on every spy, `createSpyObj`, an importable `jasmine` namespace,
  and the eight asymmetric matchers Vitest lacks. `enableJasmineCompat()` from `/jasmine-compat`
  gives the same surface without pulling Vitest in. Bridge, not destination — the codemod
  (`--from jasmine`) rewrites the suite off it.

- **Fixed:** a write-only prototype setter was classified as a method and its function spy overwrote
  the setter spy, so `settersToSpyOn` recorded nothing. Discovery now excludes both halves of an
  accessor.

- **`createFixture<T>(defaults, overrides?)` / `createFixtureFactory<T>(defaults)`** (core) — the
  model a whole suite shares, written out and checked once instead of copied into eight specs.
  `defaults` is a complete `T`, so a removed field is one compile error rather than eight silent
  lies; overrides are deep-partial-checked and merge leaf by leaf, an overridden array replaces.
  Every call hands back a fresh object, which retires the shared `const FIXTURE` whose mutation in
  one test decides another's outcome.
- **`assertComponentDefIntact(...components)`** (`/angular`) — fails before rendering when a
  half-loaded barrel chunk left `undefined` in a component's own `providers`, `viewProviders` or
  compiled scope, naming the list and the index. Angular otherwise reports it half an hour later as
  `Cannot read properties of undefined (reading 'provide')` from inside its own provider resolution.
  Also answers the related `… (reading 'ɵcmp')` from `imports: [Cmp]`.
- **Fixed — `using` on Node 22.** Node 22 has no `Symbol.dispose` in V8; it patches one in itself
  (`Symbol.for('nodejs.dispose')`) on the main realm only, so under Vitest's `jsdom` environment the
  global is absent, the downlevelled `using` throws `TypeError: Symbol.dispose is not defined.` out
  of `tslib`, and `spy[Symbol.dispose]` becomes a property named `"undefined"`. The package now
  installs the symbol where it is missing, with the same registry key, and compares against the
  resolved key internally (`src/lib/dispose-symbol.ts`). This is what failed the Node 22 leg of CI.
- **README: an "Error → cure" table**, keyed by what the compiler prints rather than by helper name —
  `asSpy` and `asInstance` are unfindable from the messages that call for them.
- **Internal:** the reading shared by the two `prefer-*` provider lint rules moved to
  `src/lib/eslint/hand-rolled-doubles.ts`; `rules.ts` had grown past the 500-line ceiling its own
  config sets and was failing `npm run lint` on 3.11.0. No rule behaviour changed.
- **Fixed — a spied method accepted arguments the real one rejects.** The mock surface came in as
  `Mock` (i.e. `Mock<Procedure>`, `(...args: any[]) => any`), and an intersection accepts a call
  matching either member: `read(1)`, `read('ok', 'extra')` and `read()` all compiled on a double of
  `read(key: string)`. Now `MockInstance`, which carries the same helpers without a call signature.
  Tightens existing suites; `expectTypeOf(spy.m).parameters` resolves as a bonus.
- **Fixed — a `calledWith` config with an asymmetric matcher could not be overridden** (issue #6).
  A second `calledWith(12, expect.anything())` was appended behind the first, which still matched,
  so the earlier value kept being returned; a `beforeEach` reconfiguring the same spy also grew the
  matcher list once per test. An equivalent argument list now replaces the config in place, keeping
  the order that decides between overlapping configs. Matchers count as equivalent when they accept
  the same values (same class, same own state, runner-branded); hand-rolled `{ asymmetricMatch }`
  objects stay reference-compared.
- **Fixed — a `RegExp` argument serialized as `{}`**, so `calledWith(/a/)` answered a call made with
  `/b/`. It renders as its literal now.
- **Fixed — `nextWithValues` dropped a falsy value.** `{ value: false }`, `{ value: 0 }`, `{ value: '' }`
  and a falsy `{ errorValue }` emitted nothing: a truthiness check sat on top of a presence guard.
- **Fixed — `createWithAutoSpies(...).spies.get(token)` minted a spy for a token nobody injected**,
  so stubbing the wrong token succeeded and configured an object the instance never sees. It now
  throws, naming the token and the ones that were auto-spied.
- **Fixed — `assertMocked(ns, { exports: [] })` could only pass.** An empty list is now an error.
- **Fixed — a `vi.resetAllMocks()` in one file killed a shared double in another.** Registered means
  reachable by `resetAllMocks` too, and `mockReset` drops an implementation that came from a chained
  `.mockReturnValue(…)`; under `isolate: false` a _later_ file then dies inside application code on
  a double it never touched. The implementation each long-lived mock carried when classified is
  remembered and put back, in `beforeEach`, only when missing. Exports
  **`restoreLongLivedImplementations()`** for the repair on its own.
- **`copyWindowGlobals` names a forced global the host refused**, with the error underneath, instead
  of failing later as `document is not defined` — which named neither the helper nor the property.

- **Docs — "Why this is not written in Rust"** (`core/performance.md`), because the question is a fair
  one at ten or twenty thousand tests and deserved a measured answer rather than an opinion. A
  minimal napi-rs addon doing a spy's exact job was benchmarked against the JavaScript it would
  replace: crossing the boundary and doing nothing costs 9.0 ns against 3.7 ns, and retaining two
  object arguments — the one thing a spy must do, and it must retain them by identity for
  `toHaveBeenCalledWith` — costs 35.9 ns against 9.3 ns. Native is 2.4× and 3.8× slower at the work,
  and the work is ~0.1 % of a CI job. A new bench case, **`spy invocation`**, backs the per-call
  figure the section argues from (~117 ns, `mockClear` charged in).

- **`provideHttpTesting()` + `expectRequest(url)`** (`/angular-http`) — the six-step `httpResource()`
  dance (tick → inject controller → `expectOne` → flush → microtask → tick) as
  `await expectRequest('/api/products').flush([product])`, with the value readable on the next line.
  Nothing in the field has an answer for `httpResource()`: the string does not appear in the tarballs
  of ng-mocks 14.17.3, `@ngneat/spectator` 22.1.0 or `@testing-library/angular` 19.4.2. Its own
  2.2 kB subpath because it is the only part of the package importing `@angular/common`, which is an
  **optional** peer — `/angular` still loads without it.

- **`createNestUnit(Target, { expose, providers })`** (`/nestjs`) — the unit built from the metadata
  Nest already emits, every unprovided collaborator spied, `expose` for the sociable case. The answer
  to `@suites/unit`'s model, with `createSpyFromClass` behind each token instead of a Proxy, so a
  typo still fails. +1.45 kB on that entry.

- **`setupAutoSpy({ angularBuildHint })`** — one stderr line per worker when `@angular/build` is in
  `[22.1.5, 22.1.7)`, where the unit-test bundle is built unsplit and `--coverage` grows without
  plateau. The builder says nothing, and the `doctor` check that reports it has to be sought out.
  +0.66 kB on `/setup`.

- **A type-instantiation budget in `npm run check`** — `npm run types:budget` measures what `Spy<T>`
  costs `tsc` on a generated fixture (delta 9 126 against a budget of 11 000) so it cannot quietly
  become a deep proxy. Plus `@remarks` on the six declarations people get wrong, so the correction
  arrives in `dist/*.d.ts`, and a page for what Angular's own `refactor-jasmine-vitest` schematic
  leaves behind.

- **`trackNodeMocks()`** (`/node`) — `node:test` keeps every `mock.fn()` in one process-wide
  `MockTracker` and offers no way to drop a single entry, so a long suite retains every spy it ever
  made. The library now creates its spies on a tracker it owns and replaces it after each test:
  **124.5 MB → 5.9 MB** retained on 20 000 spies of a 10-method class (Node v24.19.0, 5.4 MB
  baseline), 21×. It never calls `mock.reset()`, so a `mock.fn()` the spec made by hand is
  untouched. Opt-in, idempotent, reversible, and a silent no-op on any runtime that will not give up
  the class. +327 B on `/node`. This supersedes the previously documented conclusion that no
  library-side fix existed.

- **Two migration pages, every claim checked against the published tarballs.** _Migrating from
  `@ngneat/spectator`_ for the 739 852 downloads a month sitting on a package whose repository is a
  404 and which does not resolve on a clean Angular 22 install — and which corrects three widely
  repeated claims that do not hold, including that the `@openng/spectator` fork fixes Angular 22
  (it does not; it carries the same undeclared import). _Migrating from `@suites/unit`_ for the
  Nest audience the NestJS docs send there, now that `createNestUnit` answers its solitary and
  sociable model directly.

- **Corrections to claims this project was publishing.** The comparison table offered Jest an
  adapter API that is not exported from any entry point; it now says so. The README and
  `core/performance.md` quoted different `renderShallow` numbers without acknowledging each other;
  both now carry the per-render range and the per-file figure, and explain why they differ.

- **Internal — head-to-head and suite-scale benchmarking against the field**
  (`npm run bench:vs`, `npm run bench:suite`). A micro-benchmark against `@bugsplat/vitest-auto-spies`
  (the `jest-auto-spies` core on Vitest), `vitest-mock-extended` and `@golevelup/ts-vitest`, plus a
  hand-written `vi.fn()` control; and a suite-scale harness that generates synthetic suites at
  realistic sizes and measures wall-clock and peak RSS per library. The competitors are pinned in
  `bench/package.json`, installed separately from the root (`npm ci --prefix bench`) so they add
  nothing to what ships or to the root install; `.github/workflows/bench.yml` re-runs the comparison
  monthly and on changes under `bench/**` or `src/lib/**`, and Dependabot watches the competitor
  versions so a competitor's release re-triggers it. Tooling and CI only — no change to the published
  package. The numbers this unlocked are on `core/performance.md`.

<!-- Add user-facing items here as work lands, mirroring `## [Unreleased]` in the root CHANGELOG. -->
