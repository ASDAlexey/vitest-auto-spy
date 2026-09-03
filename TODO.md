# TODO — refactoring & analysis

Everything still open on `vitest-auto-spy`, ordered by value. Shipped work is not
kept here — it lives in `CHANGELOG.md` and in git history. Status markers: `[ ]`
backlog, `[~]` considered and intentionally not done, with the reason.

## Field findings — consumer monorepo merge, 2026-08-29

Reported from a consumer, not from this repo: merging four months of `master` into an Angular
monorepo whose suite (1 725 spec files, 12 152 tests) had already moved to Vitest. Thirty-one specs
arrived in Jest style and had to be converted by hand, which is what surfaced these. Each one below
was hit and reproduced there; none is reproduced in this repo's own tests yet, so treat the
file:line references as pointing at _this_ library's code and the error text as evidence from the
consumer. Docs for the migration half of this list have landed in
`docs-site/migrating.md` ("Reading a spy back out of the container", "The type names", and three
new rows in the no-twin table).

- [ ] **The `Cannot redefine property` guard covers this library's own seam only.**
      `lib/mock-adapter.ts:107` catches the `TypeError` out of `spyOnGetter` / `spyOnSetter` and
      re-throws it naming the target, the reason the property is locked and `DOCS_LINKS.realSeam`,
      which is the whole of the fix that shipped. It sits on one path. A consumer's own
      `vi.spyOn(barrel, 'export')` never enters this library and still throws the bare
      `TypeError: Cannot redefine property: injectDomainMetrics`; and `mockReadonlyProp` /
      `mockValueProp` call `Object.defineProperty` directly (`lib/prop-mock.ts:190`, `:238`) with no
      guard of their own, so the library's _own_ prop helpers hand back the unhelpful text the
      adapters no longer do. Wrapping those two is a few lines and closes the inconsistency; the
      hand-written `vi.spyOn` case needs a different channel entirely, since nothing of ours runs.

      **The prop-helper half shipped 2026-08-30.** `CANNOT_REDEFINE`, `describeSpyTarget` and the
      explanation itself moved to `lib/redefine-failure.ts`, and all four `mock*Prop` helpers now go
      through one `applyPatch` that uses it — so the library's own helpers no longer hand back the
      text its adapters stopped handing back. The fix turned out to have a second half nobody had
      noticed: `rememberProp` recorded the patch **before** applying it, so a refused define left an
      entry in the undo journal for a patch that never happened, and the next `restoreMockedProps()`
      reported a teardown failure for it — one confusing message becoming two. The journal is now
      written after the define succeeds. Compensating instead (calling the undo on failure) is the
      shape to avoid: it writes the original descriptor back to the property that has just refused a
      write, so it throws in turn and replaces the diagnosis with its own error.

      **Still open, and unchanged:** a `vi.spyOn(barrel, 'export')` written by hand in a spec never
      enters this library, so nothing here can improve that message.

- [~] **Making the _silent_ `vi.mock` half loud.** Investigated and declined, rather than left
  pending. A `vi.mock` factory is lazy by design, so "the factory has not run" is
  indistinguishable from "the module has not been imported yet" — any check would fire on every
  correct-but-not-yet-exercised mock in the file, which is most of them at the moment a spec
  starts. `assertMocked(ns, …)` already produces better evidence, at the one point where the
  answer is knowable: after the import the caller cares about.
- [~] **A lint rule for `mockImplementation()` with no argument.** Shipped instead as the codemod's
  `mock-implementation-arity` transform (`src/cli/codemod/transforms-jest.ts:222`), which is the
  right shape for it: a rule fires only in suites whose compiler already reports `TS2554` for the
  same call, and is absent from exactly the suites with no type gate, which are the ones that
  need it.
- [~] **`stubConstructor` was not found by the two people who needed it.** Not a defect — the helper
  exists, its docstring covers the `isolate: false` restore that a hand-assigned global gets
  wrong, and `migrating.md` has the row. It was still hand-rolled twice from
  `TypeError: () => { … } is not a constructor`, because that text appears in neither. Cheapest
  close: quote the error verbatim in the constructor-doubles page, and name `Image`, `Worker`
  and `WebSocket` beside the observers in the `stub*` family listing. The same trick would help
  `no-done-callback`, whose first symptom under a type gate is `TS2349: This expression is not
callable. Type 'TestContext' has no call signatures.` — text the rule's own description shares
  no words with.

- [~] **Nothing in this repository tests the types it exports, and that is what shipped the
  `expectEmission` regression.** `npm run typecheck` is `tsc --noEmit` over the sources: it proves
  the library compiles, never what it _infers_ for a caller. The single-signature
  `expectEmission<T>(source$: SubscribableLike<T>)` paired with rxjs 7's trailing positional
  overload and inferred `unknown`; every internal test passed, because `resolves.toBe(1)` passes on
  a `Promise<unknown>` too. The consumer found it — 48 `TS2339`/`TS2488` errors that failed a CI
  job — and the fix (a leading callback-shaped overload) is already in. What is still missing is the
  thing that would have caught it here: `expectTypeOf` / `assertType` cases under Vitest's
  `typecheck` mode. A grep for either across `src/` returns **zero** hits today. The set worth
  pinning is small and mechanical — `expectTypeOf(expectEmission(of(1))).resolves.toBeNumber()`,
  the same for `expectEmissions`, `expectError`, `expectCompletion`, plus `Spy<T>` assignability
  and the `Mock<(a: A) => R>` argument order — and it belongs in `npm run check`, next to the
  coverage gate.

  **Done, partly.** `src/type-tests/{emission,spy}.test-d.ts` now pin the emission helpers (both
  shapes the regression took: reading a field off the awaited value, and destructuring it) and
  `createSpyFromClass` / `asInstance` / `createAutoMock`; `vitest.types.config.mts` and
  `tsconfig.types.json` run them, `npm run test:types` is in `npm run check`, and
  `CONTRIBUTING.md` says a helper whose value is its type needs one. 14 cases, no type errors.
  They live outside `src/lib/**` on purpose — inside it they would land in `coverage.include`
  and fail the 100% threshold with files that are never executed.

  **Still open:** the rest of the surface has none — `mockDeep` / `DeepMockProxy` assignability,
  `provideAutoSpy` and `injectSpy` on the Angular entries, `calledWith`, `Mutable<T>`, and the
  `Spy<T>`-in-argument-position case `no-mocked-for-spy` exists to rescue. Worth adding one case
  per helper as each is touched, rather than in one sweep.

## Timeout budgets — closed 2026-08-30, and the one part that stays out of reach

Reported from the same consumer monorepo. Jest resolves **one** budget for a hook and for a test body
(`hook.timeout || getState().testTimeout` and `test.timeout || getState().testTimeout`, both in
`jest-circus/build/index.js`); Vitest resolves `hookTimeout` separately and defaults it to 10 000 ms.
A migration that carried the preset's single `testTimeout: 30000` into the runner config and stopped
there gave every hook a third of the budget its tests got — and Vitest files a `beforeEach` timeout
against the **test**, with the test's duration pinned at the limit, so the log reads
`× should create 10045ms`: a slow test whose body never ran.

Shipped as `setupAutoSpy({ hookTimeoutHint })` (on by default), plus `frozenClockHint` for the other
half of the same seam. What was established by probe rather than assumed, and is worth not
re-deriving:

- The error is on `context.task.result.errors` by the time `afterEach` runs, and appending to its
  `message` shows up in the reporter's output. A `beforeEach(fn, 300)` probe produced
  `× first test 303ms` and `Hook timed out in 300ms.`
- **`beforeAll` is out of reach and always will be.** Its timeout is reported as a failed _suite_,
  every test is marked skipped, and no `afterEach` runs at all — there is nothing to annotate from
  inside the runner. A reporter could, and the builder overrides `reporters` in the one configuration
  that needs it most.
- There is **no public read** of the resolved config. `vi.setConfig` writes `hookTimeout` at runtime
  and nothing reads it back; the exports of the installed `vitest` were enumerated rather than
  assumed. `globalThis.__vitest_worker__.config` is the only source, so `readRunnerTimeouts` reads it
  defensively and returns `undefined` on any shape it does not recognise.
- A spec whose own `afterEach` calls `vi.useRealTimers()` defeats `frozenClockHint`: hooks run in
  reverse registration order, so the clock is real again by the time the hint reads it.

- [ ] **One more Jest/Vitest budget difference, reporting-only and not acted on.**
      `slowTestThreshold` is `5` in Jest (**seconds**, `jest-config`) and `300` in Vitest
      (**milliseconds**), so a migrated suite starts marking most of its files slow. Nothing fails, so
      there is nothing to annotate; it is documented in `docs-site/migrating.md` and that is probably
      the whole of the answer. `teardownTimeout` has no Jest counterpart at all and is not on the
      serialized worker config, so it cannot be read from a setup file either way.

## Coverage under a bundling builder — closed 2026-08-30, and what stays out of reach

Reported from the same consumer monorepo, where the suite runs over a bundle built by
`@angular/build:unit-test`. Three findings arrived; two became `doctor` checks and the third was
written off as a Vitest internal nobody outside Vitest could fix — which turned out to be false,
and the correction is the largest number in this section.

Shipped: `coverage-all-removed` and `coverage-include-misses-bundle`
(`src/cli/checks/coverage-config.ts`), the `Coverage under the unit-test builder` section on the
Angular page, and one row plus a paragraph on the migration page. What was established by probe or
by reading the installed sources, and is worth not re-deriving:

- **`coverage.all` is gone in Vitest 4.** Not in `coverageConfigDefaults` (enumerated on 4.1.9), and
  the pass over untested files is driven by the presence of `coverage.include`. Probed both ways on
  a three-file fixture: with `all: true` and no `include` the unimported module is absent from the
  report; with `include` and no `all` it is there. No error either way.
- **Coverage is matched twice.** `@vitest/coverage-v8` 4.1.9 calls `isIncluded` on the executed
  script's URL (`dist/provider.js:247`) before any remap, and again on the remapped source path when
  `excludeAfterRemap` is on (`:61`). `@angular/build` 22.1.3 forces that flag on
  (`src/builders/unit-test/runners/vitest/plugins.js:415`) and prepends `spec-*.js`, `chunk-*.js` to
  the target's `coverageInclude` (`:421`) — which is why a list written in the **runner config**
  instead loses every counter on the first pass and reports nothing.
- **Order in the list is irrelevant**, presence is not. `isIncluded` calls
  `pm.isMatch(filename, glob, { contains: true, dot: true, ignore })` with the array, so any pattern
  matching wins. The builder writing its two globs first is a convention, not a requirement.
- **`coverage` inside a `projects[]` entry is ignored silently** — probed on 4.1.9, no warning. It
  is not the mechanism behind the finding above (the builder passes the runner config to Vitest as
  the root config as well), but it is the next place a reader looks.

- **istanbul is incompatible with `coverage.include` under this builder.** The untested-files pass
  resolves through Vite rather than through the aliases the builder supplies, so the first aliased
  import ends the run (`Failed to resolve import "@workspace/…" from "…?vitest-uncovered-coverage=true"`,
  and the package named changes between runs). `v8` drops what it cannot parse with a warning
  instead — 184 files of 4969 — and stays green. Reported with one clean series of four runs:
  istanbul 113 s and `v8` 81 s without `include`, `v8` 250 s with it, istanbul `exit 1` with it.
  The 169 s that `include` adds there is not the untested-files pass, which is what it looks like
  from the outside; see the `isIncluded` bullets below, where the same surcharge is measured
  operation by operation and then removed.
- **Narrowing the scope is not only about speed.** In that series the cobertura report is 10.78 MB
  (istanbul) / 10.79 MB (`v8`) without `include` and 8.89 MB with it, against GitLab's 10 MB parse
  limit — over which the report is dropped silently: green job, percentages in the log, no line
  highlighting in the merge request.

- **`isIncluded` is where a narrowed scope actually spends its time, and it is replaceable from
  outside Vitest.** Profiled with `DEBUG=vitest:coverage` on shard 1/4 of the 1725-file suite, scope
  of 124 include globs plus 304 negations already glued into brace expressions:
  `Generate coverage total time 224.2 s`, split as 2.6 s to read the 432 workers' coverage files,
  54.3 s before the first conversion, 50.5 s to remap the 1958 covered files, **0.35 s** for the
  pass over the 458 untested ones — and **114.1 s in the final `coverageMap.filter`**, a loop whose
  whole body is one `isIncluded` call per file. Timers around the map operations on shard 1/16 name
  the cost directly: 8000 `isIncluded` calls take **167 853 ms** against 1 808 ms with a compiled
  matcher, `coverageMap.filter` 81 393 ms against 713 ms, the untested pass over 1816 files
  69 779 ms against 9 439 ms. None of that is coverage work. It is `picomatch` compiling 428
  patterns again for every filename, because `globCache` memoises the _verdict_, keyed by filename,
  and never the matcher.
- **The fix is a coverage-provider wrapper in the consumer's config — no Vitest patch, no glued
  globs.** `coverage.provider: 'custom'` plus a `customProviderModule` that re-exports
  `@vitest/coverage-v8` and, in `getProvider()`, overwrites the returned provider's `isIncluded`
  with one that builds `pm(include, { contains: true, dot: true, ignore: exclude })` once and
  reuses it. On the same real shard 1/4 with the same reporters the Vitest phase drops
  **229.59 s → 22.88 s**, 432/432 files both ways, cobertura 8.0 MB both ways, and the report does
  not move: `Statements 41.77 %`, 27 292/65 325 before and 27 289/65 325 after — same denominator,
  three statements of the shared environment's ordinary drift. On the same globs over 200 distinct
  paths the stock `pm.isMatch` costs 1.13 ms per file and the compiled matcher 0.018 ms, with
  identical verdicts on every path.
- **The trap that makes a correct wrapper measure as zero.** The first version delegated
  `allowExternal: false` back to the original method "to be safe" — and `@angular/build:unit-test`
  turns that option on, so every call took the slow path and the run came out at 227.6 s against a
  229.6 s baseline, which reads as "the idea does not work" rather than "the fast path was never
  entered". Do the `allowExternal` test inline instead: two `startsWith` against the workspace and
  project roots. Delegate only the two cases the wrapper genuinely cannot answer — a `--changed`
  run, which selects by its own file list, and a config with no `include`, where there is nothing
  to compile. Two more mechanics worth not rediscovering: `getProvider()` runs before Vitest calls
  `initialize()`, so `provider.options` does not exist yet at swap time and the matcher has to be
  built lazily on the first question; and the filename must be normalised exactly as the original
  does it, `slash(cleanUrl(filename))` with both helpers from `@vitest/utils/helpers`, or the
  verdicts diverge on the paths the two forms disagree about. The provider's own `globCache` stays
  a cache and keeps working.

- [~] **A runtime notice from `setupAutoSpy` when coverage is on and the include list cannot
  match** — not implementable, and the reason is worth recording. The serialized worker config
  carries only `{ reportsDirectory, provider, enabled, htmlDir }` under `coverage`; `include`
  and `exclude` are not sent to workers at all (probed on 4.1.9 by dumping
  `globalThis.__vitest_worker__.config.coverage` from a spec). There is no public read either,
  so a setup file cannot see the list, and the report it would be wrong about is assembled in
  the main process after the run. The static check is the only honest place for this.
- [~] **Shipping the cached-matcher wrapper as library surface.** Still not shipped, but for a
  different reason than the one that stood here until 2026-08-30, and the old reason is
  recorded rather than quietly deleted because it is the kind of conclusion a reader
  re-derives: this entry used to say the cost lives inside Vitest, that "glue your globs" was
  the only workaround and a footgun at that, and that the item was worth revisiting only if
  Vitest accepted a cached matcher upstream. That verdict is **wrong**. A cost inside Vitest is
  not the same as a cost out of reach — `coverage.provider: 'custom'` is a supported seam, the
  provider object is an ordinary object, and 20 lines of consumer config bought 229.59 s →
  22.88 s on a real shard with a byte-identical report. Nobody has to wait for upstream and
  nobody has to hand-verify a glued glob list against the unglued one. What is still true is
  that this is not _this library's_ surface: it is a coverage provider, it has nothing to do
  with spies, it pins `isIncluded` — a method that is not public API — into a package whose
  users mostly do not run coverage over a bundle at all, and it would fail silently the day
  that method is renamed.

## Considered & intentionally skipped

- [~] **Merge the three `as any` mock casts** (`asVitestMock` / `asBunMock` /
  `asNodeMock`). Each casts to a _different_ concrete mock type and carries a
  runtime-specific eslint-disable rationale; a shared generic `castMock<T>`
  would erase that locality for one saved line. jscpd reports 0 clones —
  below threshold. Left as-is.
- [~] **Split `lib/types.ts` per `.claude/rules/ts-files.md`** (one
  `.type.ts` / `.interface.ts` per declaration). That rule targets app code;
  `types.ts` is this library's curated public type barrel and re-exported via
  `export type * from './lib/types'`. Fragmenting it would churn the public
  surface for no consumer benefit. Skipped deliberately.

## Performance pass (Unreleased)

- [~] **Micro-optimising `createFunctionSpy`.** Measured before deciding: `vi.fn()` alone is 1.3 µs
  (p75) and the full `createFunctionSpy` is 1.9 µs, so _everything_ this library adds per method
  — two `ArgsMap`s, the promise helpers, three `defineProperty` brands, the `settledResults`
  probe — is ~0.6 µs, and `new ArgsMap()` twice is 0.04 µs of it. Removing the whole bundle
  would save a spec with 20 services × 10 methods about 0.12 ms. Not worth the loss of the
  reset/clear hooks it buys. The levers that do move a suite are per-file environment cost and
  the child subtree in `TestBed.createComponent` — both measured in
  `docs-site/core/performance.md`.
- [~] **Rewriting a hot path in Rust (napi / WASM).** The hot path is not computation: it is minting
  JS closures the runner itself tracks, which no native module can return. The one pure-compute
  piece, `serialize-args`, runs the whole `calledWith` dispatch in 0.5 µs (p75) — less than a
  napi boundary crossing costs — and its input is arbitrary JS values (`Map`, `Set`, `Date`,
  circular refs) that would have to be walked in JS before they could cross at all. Against that,
  prebuilt binaries for six platform/arch pairs would multiply the package weight this pass just
  halved, break Bun / browser / StackBlitz portability, and hand supply-chain scanners an opaque
  artifact in a package that deliberately ships unminified (see `tsup.config.ts`).

### Second pass — measured 2026-08-29

Harness: `src/lib/**` bundled with an adapter identical to `vitest-adapter.ts` except `vi.fn()` is
`@vitest/spy`'s `fn()`, so the core runs under plain `node --expose-gc`; memory-critical claims
re-verified inside real Vitest. Node 24.19.0, Vitest 4.1.9, repo at v3.4.0.

The frame for everything below: on this repo's own 63-file suite, instrumented at build time, both
factories together cost **13.8 ms of a 1.32 s run — 1.0% of wall clock, 0.07% of aggregate work**
(`createSpyFromClass` 4.7 ms / 117 calls, `createFunctionSpy` 9.0 ms / 186 calls). **No item here
may be argued on suite wall time.** The arguments are memory, pathological input, and per-file
import cost.

- [ ] **A bundle-size reduction pass.** Asked for as the next piece of work, and it opens partly
      against the de-chunking that just landed, which bought **−0.8 to −1.0 ms per spec file for
      +120 kB of `dist`**. So the first task is not a lever at all: put install weight and per-file
      import cost into comparable terms, because today one is counted in kB and the other in ms and
      nothing in this file converts between them — until it does, any cut risks silently paying back
      the win just bought.

      **The rate exists now — measured 2026-09-03, and it is nothing like linear.** Same harness as
      the subpath split (one process per sample, `vitest` imported first, medians of interleaved
      pairs), three points on the curve:

      | lever | `dist` JS | per spec file | kB per ms | verdict |
      | --- | ---: | ---: | ---: | --- |
      | de-chunking `index` + `angular` | **+120 kB** | −0.8…−1.0 ms | ~130 | shipped |
      | `/dom-stubs` + `/diagnostics` split | −20.3 kB | −0.159 ms | ~128 | shipped in 4.0.0 |
      | `minifyWhitespace` + `minifySyntax` | −162 kB | −0.059 ms | ~2 750 | **reverted, see below** |
      | `minifyWhitespace` alone | −144 kB | −0.016 ms (27/50 pairs — **noise**) | — | reverted |

      So **which** bytes go matters twenty times more than **how many**. Removing a module the entry
      evaluates is worth ~130 kB/ms; squeezing the bytes of modules it still evaluates is worth
      ~2 750 kB/ms, because V8 compiles function bodies lazily and the cost that is left is module
      resolution and top-level execution, neither of which shrinks with formatting. Profiled on the
      root entry at 67 kB: **0.87 ms compiling, 0.29 ms top-level execution, ~1.1 ms** in Node's own
      resolver (`internalModuleStat`, `package_json_reader`, `resolvePackageTargetString`).

      **Minification is not on the menu at all, and the reason is not the supply-chain posture.**
      Built and measured 2026-09-03, then reverted the same day by `/release-audit`:
      `minifyWhitespace` deletes every `/* @__PURE__ */` annotation — **259 of them across 18
      files** — and those are written for the *consumer's* bundler. esbuild consumes them for its own
      tree-shaking and then drops them as comments; downstream, a module-level `new WeakSet()` or
      `Symbol.for(…)` stops being provably side-effect free and is retained. Cost: `dist` −144 kB on
      disk, `/setup` min+gzip **10 585 → 11 816 B, +11.6 % in every consumer's bundle**.
      `minifySyntax` on top is neutral (11 809 B), so the whitespace flag alone carries it. This is
      the **second** time that same 1.2 kB has appeared on `/setup` — the first is recorded in the
      control-helpers entry of `CHANGELOG.md`, where the marks were added to get it back. A size cut
      is therefore not just an install-weight decision: the bytes that come off `dist` are also the
      bytes that tell a bundler what it may remove. Re-propose only with a `/setup` min+gzip number.

      And the speed side of this pass is close to exhausted: the modules still in the root entry are
      `create-spy-from-class` (13%), `expect-emission` (10%), `function-spy` (9%) and `args-map`
      (9%) — the API itself, not passengers. The levers already measured, so the pass does not restart from zero.
      `dist` is **735 535 B of deliberately unminified JS**, and `tsup.config.ts` refuses to
      minify — including whitespace, for the reason measured below. `README.md` + `AGENTS.md` are **187 847 B raw / 57 908 B gzip = 29.3% of every install**,
      of which `AGENTS.md` alone is **−12.6%** — measured, offered and declined below on "ship code
      with all surfaces" grounds; the number is real, the decision is not reopened by default. The
      four entries `rxjs`, `console`, `nestjs` and `setup` each gained **11–14 kB** from the pinned
      shared chunk, which is the cheapest thing here to re-examine. And splitting the API into
      subpaths is already measured and **rejected**: ESM re-export is eager, so the only way to stop
      evaluating a module is to stop exporting it.

- [~] **De-chunking `index` and `angular` — shipped in `tsup.config.ts`, and both of its numbers
  were wrong.** Recorded rather than dropped, because the estimate is what the bundle pass above
  would otherwise reuse. **Cost:** the item predicted "≈ +70 kB of `dist`"; measured, it is
  **+120 kB of JS**, with the declaration output unchanged and byte-identical. **Benefit:** the
  claimed **5.9 ms/spec-file could not be reproduced** — under Node's native loader the measured
  win is **−0.8 ms/file** for the root entry and **−1.0 ms** for an Angular consumer. That is a
  lower bound rather than a refutation: the original figure was taken through Vitest, where every
  module additionally goes through Vite's transform. The measuring pass declined to claim the
  larger number, and nothing downstream should either. One design change fell out of it: a
  **fourth** stateful module, `expect-emission`, had to join the shared chunk — it holds a
  process-wide `defaultTimeoutMs`, and inlining it twice would have made `setEmissionTimeout()`
  from the root silently miss `expectEmission()` from `/angular`.

- [~] **Micro-optimising `createFunctionSpy`**, re-confirmed with fresh numbers rather than quoted
  from the previous pass. A materialised spy retains 4 794 B, of which **4 117 B is bare
  `vi.fn()`**: the three `spy-mark` brands are 125 B, the five helper methods 208 B, the
  dispatch closure 56 B. Everything this library adds is **677 B, 14%**. The `settledResults`
  polyfill costs **0 B on Vitest** — `NATIVE_RECORDER` is returned and no array is allocated,
  so there is nothing to remove. The lazily-built `calledWith` / `mustBeCalledWith` chains at
  ~1.2 kB and ~0.9 kB are the biggest items the library owns, which is why building them on
  first use was right.
- [~] **`lazySpies: 'proxy'` as the _default_.** Loses 158 B at width 5 with methods touched and
  taxes every read of every consumer 25 ns, to buy nothing on the narrow classes that are the
  majority.
- [~] **Splitting the API into `/dom-stubs` and `/diagnostics` subpaths** so the root entry stops
  evaluating the observer stubs and the run-diagnostics modules. ESM re-export is eager and
  Vitest does not tree-shake, so the only way to stop evaluating them is to stop exporting them
  — a breaking change. And it is the wrong lever: the `fat` variant proves the cost is per-module
  overhead, so subpath splitting buys ~0.1 ms/file where de-chunking buys more. The move is to
  split **less**, not more. (The ~5.8 ms/file this once quoted for de-chunking is the figure the
  correction above retired; the conclusion does not depend on its size, only on its sign.)
- [~] **Full de-chunking of all 14 entries** (20 since 4.0.0 added `/dom-stubs` and `/diagnostics`;
  both are standalone already, so the count below is the only part that moved)**.** 569 607 B of standalone ESM against the 140 970 B
  shipped at the time (**+429 kB**), undoing the previous pass, and it breaks the single-registry
  invariant. Only `index` and `angular` are worth the trade — and they have since been taken, so
  the baseline this compares against has moved by +120 kB and the remaining gap is that much
  smaller. Do not re-derive the delta from the two figures above without re-measuring both: the
  baseline moved twice again on 2026-09-03 (−20.3 kB from the subpath split, −162 kB from
  `minifyWhitespace` + `minifySyntax`), so `dist` is **572 742 B** now and both figures below predate
  all of it.
- [~] **Optimising the `ArgsMap` exact map** — already optimal (flat 186–237 ns from 1 to 100
  configs; the `#arities` guard is the best thing in the file).

- [~] **Dropping `AGENTS.md` from `files`.** `README.md` + `AGENTS.md` are 187 847 B raw /
  57 908 B gzip = **29.3% of every install**, and dropping `AGENTS.md` alone is −12.6%. Measured
  and offered, not recommended: it is what an agent in a consumer repo reads with no network,
  and "ship code with all surfaces" makes keeping it a deliberate product decision.

## Release infrastructure — move npm publishing to OIDC (deadline ~Jan 2027)

npm is retiring granular access tokens with **Bypass 2FA**. The scriptable half of
the move is done for _both_ packages — `auto-release.yml` and `publish-alias.yml`
publish over OIDC with no `NODE_AUTH_TOKEN`, `release.yml` no longer publishes at
all, the npm floor is pinned exactly in both and `--provenance` is gone (the
registry attaches it). No workflow reads `secrets.NPM_TOKEN` any more. What is left
is the part that needs a browser and a person.

- **2026-07-31, already in force** — such a token can no longer perform
  account/governance actions: creating or deleting tokens, changing package
  access or maintainers, editing the trusted-publishing config, managing
  org/team membership. Publishing itself still works.
- **~January 2027, announced** — direct publishing is removed. The token drops
  to reading private packages and _staging_ a publish; the release then waits
  for a human to approve it with 2FA. At that point auto-release stops being
  automatic.

Not affected: `GITHUB_TOKEN`, GitHub PATs, GitHub App tokens.

The fix is **Trusted Publishing (OIDC)** — GitHub Actions exchanges its own
OIDC token for a short-lived publish credential, so no npm token lives in the
repo at all.

The field values, the failure codes and what the January 2027 deadline does (and does
not) mean for this repository are written down for good in
[CONTRIBUTING.md → How the two packages authenticate to npm](./CONTRIBUTING.md#how-the-two-packages-authenticate-to-npm).
The trusted publisher for `vitest-auto-spy` is registered (2026-08-30: `ASDAlexey/vitest-auto-spy`,
`auto-release.yml`, environment empty, permissions `npm publish`; npm did not demand 2FA to save
it). What is left here is the part that is still undone.

- [ ] **Publish `vitest-auto-spies` again, then register its publisher.** The
      package was unpublished in full on **2026-08-29T20:35:25Z**, and npm's policy
      is _"If you entirely unpublish all versions of a package, you may not publish
      any new versions of that package until 24 hours have passed"_ — so the name is
      blocked until **2026-08-30T20:35:25Z** (23:35 MSK). A trusted publisher is
      configured on a package's settings page, which a non-existent package does not
      have, so the order is: one manual `cd alias && npm publish --access public` (a
      person with `npm login`, not a bypass token), then the publisher row from the
      table in CONTRIBUTING.md. That bootstrap publish is also why the OIDC path
      cannot be proven the same evening: an `Actions → Auto Release → Run workflow`
      with `alias_ref` set to the current tag would find that version already on npm,
      report "nothing to do" and go green without touching the handshake. The first
      real OIDC publish of the alias is the next release. Its old versions 1.6.0 /
      1.9.2 / 1.9.3 can never be reused — _"Once `package@version` has been used, you
      can never use it again."_
- [ ] **Delete the `NPM_TOKEN` repository secret and revoke the token on npm.**
      Nothing reads it any more, but do it only once both packages have gone out
      over OIDC — the "skip if version already exists" guards make a retry safe, a
      missing fallback during a half-finished migration is not.
- [ ] **Tighten _Publishing access_ on both packages** — npmjs.com → package →
      Settings → _Publishing access_ → _"Require two-factor authentication and
      disallow bypass 2fa tokens"_, then **Update Package Settings**. Both packages
      currently sit on the permissive option. Trusted publishers keep working under
      either, so this changes nothing operationally; it removes the bypass-token
      escape hatch, which is only worth removing once it is no longer the fallback.
      Needs 2FA on the account.

Sources: <https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens/>,
<https://docs.npmjs.com/trusted-publishers>

## Claude Code plugin directory — submission — DECIDED 2026-09-02: submit

Re-checked against the live catalogues on 2026-09-02. Every assumption the previous note weighed
was out of date, and the cost that made it "future" is gone.

The repo is already its own marketplace: `.claude-plugin/marketplace.json` +
`.claude-plugin/plugin.json` + `skills/vitest-auto-spy/SKILL.md`, all on `master`,
public, installable by anyone with

## Migration wishlist — what remains, and the mechanism that stops it

Everything asked for by the 1688-spec migration is now implemented except the items below. Each one
names the thing that actually prevents it — a version, an API, a check — rather than a judgement.

- [~] **`mockModule('x', factory)` — one call doing `vi.hoisted` + `vi.mock`.** Re-checked against
  Vitest 4.1.9 rather than from memory. The mechanism: `vi.mock` is not a function call at
  runtime, it is a **transform**. `@vitest/mocker`'s `hoistMocks` walks the module's AST and
  moves _literal_ `vi.mock(...)` / `vi.hoisted(...)` calls above every import; the matcher keys
  on the callee being the `vi` (or `vitest`) identifier with the property `mock`. A call to any
  other function — including one this package exports — is not matched, is not hoisted, and runs
  after the imports it was supposed to intercept. There is no runtime API to register a mock
  factory for a specifier, so a wrapper cannot fall back to one either. What _is_ possible, and
  is shipped: `moduleNamespace(exports)` for the factory's return shape, `assertMocked(ns, …)`
  to prove the mock applied, and the `vi.hoisted` recipe in the docs. Revisit if Vitest ever
  exposes `mocker.register(specifier, factory)` at runtime.
- [~] **`prefer-as-instance` as a lint rule with an autofix.** Listed twice before — once as a field
  finding about the `TS2345` message that never says `asInstance`, once here as a mechanism note —
  and merged into one entry, because the deferral is now decided rather than pending. Verified
  against the plugin as it stands: `RuleContext` exposes only `sourceCode`, `options` and
  `report`, there is no `parserServices` and no `program` on it, and no rule file imports from
  `eslint` or from `typescript`. `Spy<T>` in a position that expects `T` is a _type_ relationship
  and cannot be seen in the AST, so the rule would need type-aware linting — which forces every
  consumer of `configs.recommended` to set `parserOptions.project` and pay a full type-check per
  lint run. If it is ever built it belongs in an opt-in `configs.typeChecked`, and it needs its
  own harness: `RuleTester` with a real `tsconfig` and files on disk, because the current tests
  lint strings through `Linter`, which has no program. Until then `asInstance` / `asInstances` is
  the answer to the cost of the repair, if not to finding it.
- [ ] **A `toEqualRecords` matcher on top of `diffByField`.** Unchanged from the previous pass:
      `diffByField` is a plain function because it is reached for _after_ a failure, and a matcher
      would carry its own deep equality and compete with `toEqual` at every call site.

### Two aliases that are deliberately absent

Checked against the request rather than assumed, and both turned out to be the same thing under
another name. Documented as such (docs → "looking for X?") instead of shipped, because a second name
for one wait is a real cost: the reader has to decide between them.

- **`settled(fixture)`** is `stable(fixture)` — flush the effects, then await the fixture. The
  request added "and it should complain if it returned while tasks were pending", which is a
  behaviour change to a released API rather than a new name; if it is wanted, it belongs behind an
  option on `stable`.
- **`ensureModuleInitialized(specifier)`** is `settleDynamicImport(() => import(specifier))`, whose
  documentation already covers the second reason to call it (a barrel symbol reads as `undefined`
  until its chunk has been evaluated).

## Angular performance — four candidate optimisations killed by measurement

Median of 60 reps, component holding a 100-row `@for` of a child component — the shape
`docs-site/core/performance.md` already benchmarks.

| Operation                                                                                     |    ms |
| --------------------------------------------------------------------------------------------- | ----: |
| Full per-test cycle: `resetTestingModule` + `configureTestingModule` + `createComponent` + CD | 1.933 |
| `resetTestingModule()` alone                                                                  | 0.003 |
| `resetTestingModule()` + `configureTestingModule()`                                           | 0.006 |
| `createComponent` + CD on an **already-configured** module                                    | 1.987 |
| `renderShallow`, full cycle                                                                   | 0.469 |
| `renderShallow({ keepTemplate: true })`                                                       | 1.074 |
| `configureTestingModule` + `overrideComponent` + `createComponent` + CD                       | 0.390 |
| `compileComponents()` on a standalone AOT bed                                                 | 0.137 |

- [~] **A `TestBed` configuration cache.** `configureTestingModule` is lazy — it records metadata and
  compiles nothing. Reset + configure together are **0.006 ms, 0.3% of the cycle**.
- [~] **Reusing a compiled TestBed across tests.** Creating the component on an already-configured
  module measured **1.987 ms against 1.933 ms** for the whole reset-and-reconfigure cycle —
  identical within noise. Worth stating publicly, because this is exactly what `ngMocks.faster()`
  sells: it publishes no benchmark numbers, documents that it leaks component state between
  tests by design, and silently disengages when a `beforeEach` creates a spy. On this shape the
  mechanism has nothing to win.
- [~] **Avoiding `resetTestingModule` per test** — 0.003 ms.
- [~] **`renderShallow` avoiding `compileComponents`** — already true (`grep -rn compileComponents
src` never hits `render-shallow.ts`), and on a standalone AOT bed it costs 0.137 ms once.

Where the time actually is: `createComponent` + first change detection, essentially all of it
building the child subtree — already measured in `docs-site/core/performance.md` (0.65 → 8.52 ms as
children go 0 → 400) and already fixed by `renderShallow` (4.1× here, 16.2× at 400 children).

- [~] **Shipping the `disableCodeSplitting` patch itself.** A consumer project solved the OOM by
  patching the installed `@angular/build` (`scripts/patch-angular-build.cjs`, postinstall,
  version-guarded on the schema), and the question is whether this package should ship that.
  **No — ship the diagnosis, not the mutation.** Four reasons. (1) The only way to make it
  automatic is a `postinstall`, which this repo has already rejected on supply-chain grounds —
  and a dev dependency that rewrites another package's files in `node_modules` is the most
  Socket/Snyk-alarming thing a test library could do, undoing the same posture that keeps the
  bundles unminified. (2) It is string surgery against `disableCodeSplitting: true,` at a fixed
  path, so any upstream refactor breaks it silently — the worst failure mode for a package whose
  selling point is that failures name their own cause. (3) Its lifetime is weeks: PR #33961
  lands the `splitting` option with splitting **on** by default, so from 22.1.7 there is nothing
  to patch, while this package would owe the code semver, docs and tests across Angular 21 and
  22 indefinitely. (4) Whether a workspace trades a 596 MB bundle graph for module mocking is
  the app team's call, not a test-double library's.

  **Shipped instead — three read-only pieces, no mutation.** The `doctor` check
  `angular-build-splitting-off` (`src/cli/checks/angular-build.ts:65`); the
  `docs-site/adapters/angular.md` section carrying the patch script verbatim with its
  "delete this from 22.1.7" note; and `angularBuildHint`
  (`src/lib/angular-build-notice.ts`), a one-shot runtime notice that recognises the builder by
  its own `vitest-mock-patch` marker, prints once per worker and is off with
  `{ angularBuildHint: false }`.

## `doctor` — a repository-level check for defects that never fail

`npx vitest-auto-spy doctor` ships. What every check has in common is that **nothing consumes the
result**: the run is green, and the only reader of a `tsconfig.spec.json` after Jest is gone is
somebody's editor. Still open:

- The `ts.parseJsonConfigFileContent` tier. The shipped glob matcher is self-contained and
  zero-dependency; the consumer's own `typescript` via `createRequire` would be the authority on
  `extends` chains and on the extension set an `include` entry expands over. Two patterns are
  exempt today rather than resolved properly: a declaration-only glob and one rooted in a directory
  the scan never enters.
- `helper-from-wrong-entry` and `no-unawaited-helper` — the two named below, both of which need a
  table generated from the installed version's own export map rather than a hand-written one.
- The other 43 checks of the sharpened catalogue.

## Agent adoption — `init`, and what cannot work

Researched 2026-08-29 against current documentation, not memory. The goal: an agent working in a
project that merely _has_ this package installed writes tests with it, correctly, with no human
configuration.

**The honest finding first: there is no zero-setup path into any agent's instruction context.**
Every tool discovers rules from a fixed set of repo-root or dot-directory paths; none scans
dependencies. Specifically, `node_modules/**/skills/` is **not** one of Claude Code's four skill
discovery locations (enterprise, `~/.claude/skills`, `.claude/skills`, plugin), so the skill this
package ships in its tarball is never auto-discovered. Two channels _do_ work with no setup at all,
and both are already partly built:

- **Errors that name their own fix** — every throw ends with a `Docs:` link. An agent reads a stack
  trace far more often than a README, and this fires at the moment of the mistake in every tool.
  Already the best thing here.
- [~] **A postinstall message.** Ineffective and risky, and the trend is one-way: npm hides
  lifecycle output by default since v7, pnpm 10 blocks dependency scripts, Yarn Berry defaults
  `enableScripts: false` for third-party packages, and npm v12 (targeted July 2026) flips
  `allowScripts` off. npm's terms prohibit install-time advertising; `core-js` is the cautionary
  tale; and after the 2025 Shai-Hulud worms an install script in a dev dependency reads as a
  smell to Socket and Snyk — which would undo the same posture `tsup.config.ts` takes when it
  refuses to minify. Instead: first-run detection _inside_ the CLI ("no agent instructions found
  — run `npx vitest-auto-spy init`"), and `init --check` in the consumer's CI.
- [~] **Shipping an MCP server.** Every connected server costs context in **every** session; three
  servers measure ~55 000 tokens before the first user message. A docs MCP is a network
  round-trip and a permanent context tax to deliver a file that is already on disk, and its
  registration is _more_ setup than `init`, not less (Claude Code prompts on first use, and a
  committed `enableAllProjectMcpServers` is ignored until the folder is trusted). The valuable
  ideas behind it — `explain_error`, `review_spec` — are computations, and **a CLI is an MCP
  server that costs zero tokens and needs no registration**: every agent can run
  `npx vitest-auto-spy review <spec>`. Put that one line in the managed block. Revisit only if
  the MCP registry proves to be a real acquisition channel.
- [~] **Give four lint rules a fixer.** Closed, and recorded rather than deleted because its premise
  was false when it was written and would be believed again. "No rule declares `fixable` or
  `hasSuggestions` today" was already wrong: `no-mocked-for-spy` and `prefer-as-spy` declared
  `fixable: 'code'`, and `prefer-inject-spy`, `no-object-define-property` and
  `no-expect-in-subscribe` declared `hasSuggestions`. The fourth entry on its list — a
  wrong-entry-import rule — **cannot exist as a lint rule at all**, and listing it here
  contradicted this file's own two other mentions of it: resolving a helper to the entry that
  exports it needs a table generated from the installed version's own export map, which is
  precisely why `helper-from-wrong-entry` is scoped to the `doctor` CLI in both of the other places
  it appears in this file. What survives is the part that was always true and is now acted on:
  `eslint --fix` is the
  cheapest lever on adoption, because an agent converges on the library's idioms without reading a
  word of documentation — and `no-done-callback` must never carry one, since the rewrite depends
  on the body and a mechanical one turns a loud bug into a green test that runs even less of it.

### `doctor` — the catalogue, sharpened

The section above scopes five repository-level defects. A full pass produced **52 checks** in five
groups: 15 replaceable patterns, 10 silent-pass bugs, the 10 repository-level ones, 18
configuration/perf hints and 5 deprecation checks against this package's own history. Two are worth
naming because they are the ones a per-file linter can never do:

- **`helper-from-wrong-entry`** — `provideAutoSpy` imported from the root instead of `/angular`, and
  its siblings. A table lookup against the installed version's own export map: zero false positives,
  fully autofixable, and in a real suite it fires in hundreds of files.
- **`no-unawaited-helper`** — an unawaited `expectEmission` / `stable` / `flushEventLoop`. The proof
  that a doctor can beat a type-free linter _without_ a type checker: the callee is resolved through
  the file's own import of our export map. Name resolution, not inference.

Architecture notes that keep the zero-dependency invariant: parse with the **consumer's own**
`typescript` via `createRequire` (near-certain to be installed, and `ts.parseJsonConfigFileContent`
is the only trustworthy way to run the tsconfig-glob check), with `@typescript-eslint/parser` used
when present and a lexical tier as fallback — the parser is always the consumer's, never bundled.
Prove it with two `npm run check` invariants mirroring the zone.js one: `package.json` declares no
`dependencies`, and `node:fs` appears in `dist/bin/` and nowhere else. To drive all nine rules from
one walker, six of them need a mechanical refactor off esquery selectors onto bare node-type
visitors plus predicates — the pattern `rules.ts` already uses three times. **v1 ships read-only,
with no `--fix` at all**: trust before edit rights.

## Invariants

- **`zone.js` is a devDependency and only a devDependency.** Never a dependency, never a peer, not
  even an optional one. Everything about zones lives behind `vitest-auto-spy/zone`; no other entry
  reaches that module, even transitively, and the module imports no zone.js of its own — it reads
  `globalThis.Zone`, which the consumer loaded. Verified after each change to the entry list:
  `npm run build` then `grep -rl proxy-zone dist/` must name `dist/zone.js` and **nothing else** —
  not its `.d.ts`. The earlier wording here said "(and its `.d.ts`)"; verified against a pristine
  build, `dist/zone.d.ts` contains **zero** occurrences of `proxy-zone`, so a grep that comes back
  with two files means something has changed, not that the invariant holds.
  `npm run size:badge` must not move for `dist/index.js`, and `package.json` must
  still declare no `dependencies`. A convenient re-export from the root would hand zone.js to every
  zoneless consumer, silently.

## Backlog (not in this pass)

- [ ] **`node:test` adapter ignores the `name` argument** of
      `createMockFn(impl, name)` — `node:test`'s `mock.fn()` has no `mockName`,
      so spy names are absent in `node:test` diagnostics (Vitest/Bun set them).
      Acceptable, but documenting the gap (or attaching a `displayName`) would
      make cross-runtime diagnostics uniform.

## Reads of the field

- **Closest direct competitor: `jest-auto-spies`.** Same author lineage of the
  API. Its weakness is Jest lock-in; our entire reason-to-exist is carrying that
  exact ergonomics to Vitest/Bun/`node:test`. Keep the API a 1:1 drop-in (the
  README already pitches this) — that migration story is the moat.
- **Closest type-only competitor: `vitest-mock-extended`.** It mocks from a
  _type_ via a deep Proxy and is popular, but offers no return-type-aware
  helpers. Our new `createAutoMock<T>()` covers the same "no class at runtime"
  case **while** keeping `resolveWith` / `nextWith` / `calledWith`. Position it
  explicitly as "mock-extended ergonomics + helpers" in `comparison.md`.
- **Differentiators to keep sharp:** (1) one call spies a whole class, (2)
  return-type-driven helper bundles, (3) runtime-agnostic core behind
  `MockAdapter` so the same spies run on 3 runners, (4) framework recipes that
  pull in **zero** framework runtime deps (Angular/Nest/React/Vue/Svelte are
  optional peers), (5) rxjs kept behind an opt-in `/rxjs` entry so non-rxjs
  consumers ship no rxjs.
- **Gaps vs. the field worth closing later:** partial-deep mocking of nested
  objects (mock-extended's `mockDeep`). The other half of this line — a documented
  per-feature comparison table — is closed: `comparison.md` has been rewritten
  from 97 to 316 lines with the per-feature breakdown and the per-competitor links.

## Field re-survey — 2026-08-29

Registry data for the window 2026-07-29 → 2026-08-27, typings read from published tarballs.

**Correction — the "four of the seven rows" line was wrong and is retired.** Checked against the
page's actual seven rows: only `ts-auto-mock` and `testdouble` were ever rows there _and_ stale.
Spectator, moq.ts and `@fluffy-spoon/substitute` were never on that table at all, so the count could
not have been four. `comparison.md` now makes the stronger claim that is also true — **five of the
libraries it surveys last published more than a year ago, and a sixth's repository no longer
exists** — and that, not the feature comparison, is the line worth making. Repeat that wording, not
the old one. The per-library findings below stand on their own and are unaffected:

- **`ts-auto-mock`** is feature-frozen _by its author_ and explicitly does not work with esbuild or
  swc — that is, not with Vitest, Vite, Bun or the Angular builder. `comparison.md` says "no ttsc
  transformer to install"; the true statement is that it cannot run on a modern toolchain at all.
- **`@ngneat/spectator`** — 22.1.0, 2025-11-02, no release in ~10 months, and
  `github.com/ngneat/spectator` is **HTTP 404**: the org was wiped around 2026-06-05 with all issues
  and PRs, archived copy at `ngneat-archive/spectator`. Still 771 498 downloads/month. Three runtime
  dependencies, one of them **jQuery**. Its `lib/matchers-types.d.ts` declares `namespace jasmine`,
  so it drags the Jasmine global types into a Vitest project. Open and unmerged since 2026-07-16: it
  imports `BrowserDynamicTestingModule` from a package Angular 20 deprecated and no longer installs,
  so it errors on a fresh Angular 22 workspace. The `@openng/spectator` fork (1.0.1, 2026-07-10) is
  byte-identical plus an Angular 22 build, at 2.3% of the downloads.
- **`@fluffy-spoon/substitute`** last published 2021; **`moq.ts`** dormant since 2023.
- **`@golevelup/nestjs-testing`** is dead (0.1.2, 2019) — do not cite it as current.

Live pressure: `vitest-mock-extended` (5.44M/mo), `jest-mock-extended` (9.40M/mo),
`@golevelup/ts-vitest`, `ng-mocks` (2.50M/mo, healthy — 14.17.3 on 2026-08-24), sinon, and
increasingly Vitest 4 itself. **`@suites/unit` is missing from `comparison.md` entirely** and is the
most serious live competitor for the NestJS recipe (473k/mo, recommended by the NestJS docs). Its
limits are the contrast to draw: backend-only by its own description, `reflect-metadata` +
`emitDecoratorMetadata` mandatory, no Bun adapter, v4 in beta unreleased since 2025-11-04, and its
Proxy answers every property so a typo never fails. Note for the record: issue #931 is **not** an
Angular request — it is the maintainer's own injection-js item — and there is no open Angular
request. Suites structurally cannot do Angular: it discovers collaborators from constructor
`design:paramtypes`, and `readonly #x = inject(X)` is invisible to that.

Two Angular competitors are absent from `comparison.md` and belong there — see the Angular section
for the feature-by-feature tables. In short, **ng-mocks** wins on what this package does not attempt
(mocking a whole declaration graph via `MockBuilder`, `MockInstance` reaching a dependency read in a
field initializer of a nested child, `ngMocks.findInstance`) and loses on typing (`MockService<T>`
returns `T`, not a spy type — their own e2e specs launder it with `vi.mocked(...)`), on
type-only mocking, on **AOT** (it requires `aot: false`), on resources and on zoneless, where it has
nothing. **`@testing-library/angular`** turns out to be a direct competitor rather than a
complementary one — `/vitest-utils` exports `createMock` / `provideMock` with the same eager
prototype walk — and it is _worse_ in two ways (no getter handling at all, and the recursion has no
`Object.prototype` guard, so `hasOwnProperty` and `toString` get mocked). It is the only third party
with zoneless support: a `./zoneless` entry added in 19.2.0 on 2026-03-17.

### Undersold moats

- **Accessor spies on Bun.** `bun:test`'s `spyOn(obj, 'prop', 'get')` throws _"does not support
  accessor properties yet"_; `lib/redefine-accessor-spy.ts` never calls it. Nobody else can do this
  on any runtime **and** none of ng-mocks, spectator, `@testing-library/angular`,
  `vitest-mock-extended`, `jest-mock-extended`, `@golevelup` or Suites has getter/setter spies at
  all.
- **`injectSpy` warns when the injector returned the real thing** (`warnWhenNotASpy`,
  `lib/angular.ts`). Spectator types _every_ token as a spy, mocked or not.
- **Type-check cost.** Measured on one fixture (80-member class, 30 mock declarations, 600 member
  touches, `tsc --extendedDiagnostics`, identical across three runs): `Spy<T>` **2 656
  instantiations** against `@golevelup/ts-vitest` 5 092 and `vitest-mock-extended` 5 614 — roughly
  half the type-checker work of the deep-proxy libraries, while carrying more helpers. Shipped
  2026-09-02: the row was already in `comparison.md`; the CI budget is `npm run types:budget`
  (`scripts/check-type-budget.mjs`, delta 9 126 against a budget of 11 000 on a generated fixture of
  the same shape, part of `npm run check`).

### Tried and rejected — do not re-open

- **Cheaper lazy-spy creation by sharing the accessor descriptors across spies.** Building a
  100-method double is ~15 µs on V8 / ~7 µs on JSC, almost all of it one `defineProperty` per lazy
  accessor; sharing the getter/setter pair per class (via `this`) measured ~30 % faster to build and
  then up to **10× slower to materialise** — V8 keeps an object whose accessors all came from the same
  descriptors on a shared fast-mode map, and reconfiguring accessor → data there rewrites the map
  (`materializeMethodSpy` went from 2.5 % to 25 % of the first-call profile). With fresh closures the
  object drops into dictionary mode and the same step is a hash update. `Object.create(proto,
descriptors)` behaves the same way. Forcing dictionary mode with a probe property + `delete`
  fixes V8 and doubles creation and materialisation on JSC (Bun 1.4: 8.2 → 16.7 µs). Keyed-store
  placeholders before the accessors are deterministic on both engines and land exactly at the
  baseline. The only real cut is accessors on a shared prototype, which changes what `Object.keys`
  and `{ ...spy }` report — observable, so no. Measured 2026-09-02, Node 24.19 / Bun 1.4.0.

- **`aroundEach` / `aroundAll` do not replace the proxy-zone patch.** Vitest 4.1 added hooks that
  wrap a test (`aroundEach((runTest) => …)`) and a suite, and on paper they are exactly what
  `lib/proxy-zone.ts` hand-rolls: run every callback inside a forked `ProxyZoneSpec`, without
  replacing the runner globals and therefore without the `globals: true` requirement, the
  `fn.toString()` fixture parsing, the preserved `fn.length` or the `it.each` receiver Proxy.
  **Measured: it does not work.** With `aroundEach((runTest) => proxyZone.run(runTest))` registered
  from a setup file, `Zone.current.name` is `<root>` in `beforeAll`, in `beforeEach` and in the test
  body, and `fakeAsync` fails with `Expected to be running in 'ProxyZone', but it was not found`. The
  hooks fire — that was verified separately — but `zone.run()` only holds for the synchronous part of
  the call, and the runner reaches the test body through native `await`, which zone.js does not
  patch. Angular's own jasmine patch wraps the _test function itself_ for this reason, and so must
  this one. What `aroundEach` does get right, and what is worth knowing if it is ever useful for
  something else: it is collected from parent suites, so a file-level registration covers nested
  `describe`s, and it wraps `beforeEach` + body + `afterEach` together.

### Worth stealing — ranked

- [ ] **`vi.defineHelper` on the three `expectEmission` helpers — the part that did not work.** The
      wrap shipped where it measurably helps (`error-handler`, `narrow`, `module-mocks`); wrapping
      the emission helpers was tried and **reverted**, because it is a net regression there. Their
      errors are constructed inside a subscribe or timer callback, so the `__VITEST_HELPER__` frame
      is the _last_ frame in the stack rather than an early one — `slice(helperIndex + 1)` returns
      nothing, and the reporter loses its code frame entirely. Worse than the `node_modules` frame it
      was meant to replace. The real fix is to anchor the error to a stack captured at **helper
      entry**, before the subscription is made, and to brand it so the rewrite only ever touches
      errors this module created — `expectError` hands the user's own error straight back, and
      rewriting that one would be a lie.
- [ ] **`createSpyFromInstance(instance, config)` — M.** The one structural capability three live
      competitors have and this package does not: `vi.mockObject(obj)`, `sinon.createStubInstance`,
      `td.replace(obj, 'method')`. Every factory here _constructs_ the double; there is no way to
      take an object the test already holds — a real service from a factory, a third-party client, a
      half-real `TestBed.inject(X)` — and spy it in place with the return-type helpers attached.
      `vi.mockObject` is Vitest-only and Bun and `node:test` have nothing, which puts a
      cross-runtime version in this library's niche rather than duplicating the runner.
- [ ] **`explainSpy(spy, method?)` — M. The S half of this shipped; what is left is the helper.**
      `mustBeCalledWith` now prints wanted next to actual (`lib/error-handler.ts:37-50`,
      `Wanted:` for one config, an indented `Wanted (N configured):` list for several), which is the
      half that fires on a failure. The half still missing is a helper the reader can call **at
      will**, before anything has failed: read the spy's `calledWith` configs, pair each against
      `mock.calls`, and say which config each invocation did or did not hit, plus which default
      fired instead. `ArgsMap.configured()` (`lib/args-map.ts:126`) is the renderer it needs and is
      already public. Two things are missing. **Per-config identity** — `configured()` returns
      strings, not handles, so there is no way to say "call 3 matched the second config" rather than
      re-rendering the text and comparing it. And the **narrative for the empty cases**: "nothing
      configured", and "N calls, none matched", which are the two states a reader most often arrives
      in and which a bare list of configs answers badly.

- [~] **`strict: true` / `onUnstubbedCall`.** Shipped, including the suite-wide form. Two decisions
  taken along the way, recorded so they are not re-litigated. (1) A `calledWith` chain configured
  only for _other_ arguments deliberately **does not** trip strict mode: the member was stubbed,
  just not for this call, and failing there is `mustBeCalledWith`'s job — conflating the two would
  make strict mode fire on the ordinary "configure one case, assert the default" shape. (2)
  `mockDeep` nodes are deliberately **not** strict: the guard fires on a _call_, but every hop of
  a deep chain except the last is a property _read_, so it could not repair the "a typo never
  fails" weakness it would be added for — while a suite-wide `strict: true` would then throw on
  every existing deep tree, including the `selfReturning` shape.

Runners-up: an `ignoreExtraArgs` option on `calledWith`, since `ArgsMap#argsMatch` requires exact
arity while testdouble and substitute allow partial; and a documentation note that `bun:test`'s
`mock.module` is **not hoisted**, which silently breaks migrated suites.

### A distribution opening, not a feature gap

Angular ships **no** spy helper — the complete `@angular/core/testing` public API at 22.1.4 contains
no `createSpy`, `createSpyObj`, `createMock` or stub factory, and the official v22 answer at
`angular.dev/guide/testing/services` is a hand-written literal:
`const stub: Mocked<TaxCalculator> = { calculate: vi.fn() }`. The official codemod hardens that
habit: `ng generate @schematics/angular:refactor-jasmine-vitest` (21.0.0, stabilised in 22.0.0)
rewrites `jasmine.createSpyObj()` into exactly that literal and emits a **TODO comment it cannot
resolve** for three cases — a single-argument `createSpyObj`, a method list held in a variable, and a
property map held in a variable. Against `jasmine-core`'s ~23.9M downloads/month, that is a very large
population being handed the boilerplate `createSpyFromClass(Service)` deletes.

- [ ] **A `renderShallow` bench, so the per-render table is reproducible.** The 1.2× / 1.8× / 5.7× /
      16.2× table in `docs-site/core/performance.md` and the 1.933 ms → 1.074 ms `keepTemplate` rung
      are not produced by anything in the repo — `bench/` holds only `auto-spy.bench.ts` and
      `vitest.bench.config.mts` scopes benchmarks to the plain core, deliberately, to keep the spy
      numbers free of the Angular transform. The Angular figures are therefore unreproducible by a
      reader or by CI, and were re-dated rather than re-measured on 2026-09-02. An Angular bench
      project (`bench-angular/`, its own config with the Angular plugin) would let `npm run bench`
      regenerate them and would catch a regression the type budget cannot see.
- [ ] **A `@testing-library/angular` migration note.** It is the only competitor with zoneless
      support and its `/vitest-utils` overlap is now documented; a short "coming from
      `createMock` / `provideMock`" page would convert the traffic the comparison section attracts.
      No page exists yet, same gap as the `@suites/unit` page already on this list.

## Funding — a way to support the project, and the two traps in it

Nothing in the repository asks for support today: no `funding` field in `package.json`, no
`.github/FUNDING.yml`, no section in the README or on the docs site. The mechanics are a couple of
hours' work; the reason this is a TODO rather than a done thing is that two decisions have to be
made first, and both are the maintainer's, not a coding task.

- [ ] **Wire the standard funding surfaces, once payment links exist.** `funding` in `package.json`
      so `npm fund` surfaces the project to everyone who installed it; `.github/FUNDING.yml` for the
      Sponsor button; a short section in `README.md`, the docs site and the landing page; SVG QR
      codes generated offline into `assets/` from the payment URLs. One sentence, stated once, and
      linked from the other surfaces rather than repeated — the same rule the benchmark numbers
      follow, and for the same reason.
- [ ] **Choose the channels.** Recurring payments with a reader-chosen amount are supported
      everywhere, so the choice is not about features. It is about who can actually pay: GitHub
      Sponsors and Ko-fi reach an international audience and integrate with `npm fund`; Boosty and
      CloudTips reach Russian cards. Two blocks may be needed, and that is fine — it is what the
      audience split already looks like.

Two traps, recorded because they are easy to get wrong and expensive to undo:

- [~] **Never publish card numbers.** A PAN in a public repository is indexed and scraped within
  hours, is usable for card-not-present payments, and cannot be revoked without reissuing the
  card; GitHub's secret scanning flags it as well. Payment _links_ are revocable, replaceable and
  measurable. This is settled — do not revisit it, and do not accept a "just for now" version.
- [~] **The wording on the button does not decide the tax treatment.** Labelling support as a gift
  changes nothing by itself: in most jurisdictions recurring payments received in connection with
  one's own work are income whatever the button says, and regularity is precisely the signal that
  gets looked at. What does matter — the recipient's status, the platform's role as payer,
  residency — is a question for an accountant, to be settled _before_ a channel is switched on
  rather than after. Not a coding decision and not to be designed around in the repository.
