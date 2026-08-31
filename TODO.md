# TODO — refactoring & analysis

Everything still open on `vitest-auto-spy`, ordered by value. Shipped work is not
kept here — it lives in `CHANGELOG.md` and in git history. Status markers: `[ ]`
backlog, `[~]` considered and intentionally not done, with the reason.

## Live defects — measured 2026-08-29

Seven findings from a measured pass (perf/memory, competitor sweep, Angular sweep). Every one is a
defect in shipped behaviour, not a missing feature, and each was reproduced rather than reasoned
about. Ordered by how badly the failure lies about its own cause.

**Status after the 2026-08-29 fix pass: six of seven closed, one disproven.** Two were closed by
verification rather than by code (the `output()` subscription was already fixed in source; the
accessor-cache docs line was simply wrong). Three findings turned out to be inaccurate where they
were checked, and each correction is recorded inline rather than dropped: the `stable` deadlock does
not reproduce under `provideHttpClientTesting`, an `httpResource` needs one settle step fewer than
reported, and `import type` fixes neither half of the rxjs declaration problem. `npm run check`
passes end to end, coverage back at 100%.

- [ ] **The declaration output emits a _value_ import of rxjs.** `dist/types-*.d.ts:1` is
      `import { Observable, Subject } from 'rxjs';`, emitted from `lib/types.ts`'s `import type`.
      That file is what `index.d.ts` → `bun.d.ts` re-export, so a consumer without the optional rxjs
      peer has an unresolvable import inside a shipped declaration file. It also pulls **189 rxjs
      `.d.ts` files / 7 162 lines** into every consumer's TypeScript program — against this
      package's own 1 494 lines, a 4.8× tax paid by every React / Vue / Svelte / Node consumer. The
      invariant "rxjs stays behind `/rxjs`" holds at runtime and is violated at the type level.

      **The proposed fix is disproven — measured 2026-08-29, do not implement it.** A fixture package
      whose only `.d.ts` names `Observable`, compiled by the repo's own tsc against a consumer with
      and without rxjs on disk:

      | emitted form | TS2307 without rxjs (`skipLibCheck: false`) | rxjs files pulled into the program |
      | --- | --- | ---: |
      | `import { Observable } from 'rxjs';` | yes, at col 28 | 191 |
      | `import type { Observable } from 'rxjs';` | **yes, at col 33** | **191** |
      | no rxjs reference at all | no | 2 |

      `import type` is byte-for-byte equivalent to TypeScript on both counts: it resolves the module
      exactly the same way and loads the same 191 files. Neither half of the fix happens. (Under the
      default `skipLibCheck: true` neither form errors, so the correctness half only ever showed up
      in a strict consumer.) Measured in passing and worth recording: the bare `import 'rxjs';`
      side-effect lines in `dist/index.d.ts` and friends are **inert** — TypeScript reports nothing
      for an unresolvable side-effect import in a declaration file and pulls nothing in. They are
      cosmetic, not the defect.

      **Only removing the reference works**, which is the second option in the original finding and
      is a **breaking type change**, not a drive-by: the two dispatch positions
      (`[ReturnType] extends [Observable<infer O>]`, `T[K] extends Observable<infer O>`) and
      `OnlyObservablePropsOf` can go structural at the price of widening what counts as an
      observable — but `AddObservableSpyMethods` genuinely *returns* rxjs values
      (`returnSubject(): Subject<T>`, `nextWithPerCall(): Subject<T>[]`), and no hand-written
      `SubjectLike<T>` is assignable **to** rxjs's `Subject<T>`, so `const s: Subject<number> =
      spy.m.returnSubject()` stops compiling for every consumer that has rxjs. Schedule it with a
      major, or decide the tax is the price of a nominal type.

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

- [x] **A spied method accepts arguments the real one would reject — closed 2026-08-30.** Found while writing the type
      tests above, and it is the opposite of what `Spy<T>` is for. The declared signature survives —
      the member's type reads `AddSpyMethodsByReturnTypes<(key: string) => string | null>` — but the
      call is unchecked: with `read(key: string)` on the class, both of these compile on the double
      under `strict`, and neither compiles on an instance.

      ```ts
      const spy = createSpyFromClass(Storage);

      spy.read(1); // no error
      spy.read('ok', 'extra'); // no error
      ```

      The mock surface presumably contributes a call signature wide enough to swallow anything, and
      an intersection accepts a call that matches *either* member. Two consequences, both quiet: a
      spec can call the double the way production code never could and stay green, and
      `expectTypeOf(spy.method).parameters` resolves to `never`, so the obvious way to pin this in a
      type test does not work either (the tests added in `src/type-tests/spy.test-d.ts` assert
      through calls instead, and say why). Worth deciding deliberately: if the widening is the price
      of the mock surface, `AGENTS.md` should say so next to `Spy<T>`; if it is not, the argument
      tuple is the one thing a typed-double library should never lose.

      **Fixed, and it was not the price of anything.** The widening came from one token:
      `AddSpyMethodsByReturnTypes` intersected in `Mock`, which with no type argument is
      `Mock<Procedure>` — `(...args: any[]) => any`. Swapping it for `MockInstance` keeps the whole
      helper surface and drops only the call and construct signatures, so the single call signature
      left is the method's own (`src/lib/types.ts:205`). Measured rather than reasoned: a probe file
      where `read(1)`, `read('ok', 'extra')` and `read()` all compiled now reports `TS2345` and two
      `TS2554`, and the repository's own suite produced exactly **one** new error —
      `mock-deep.spec.ts:130` was calling `find()` on a `find(id: number)`, which is precisely the
      class of mistake this was hiding. Configuring a double is unchanged: `MockInstance` also
      defaults to `Procedure`, so `mockReturnValue` / `mockImplementation` stay as lenient as they
      were. The second half of the finding resolved itself — with one call signature instead of two,
      `expectTypeOf(spy.method).parameters` and `.returns` now resolve, and
      `src/type-tests/spy.test-d.ts` asserts through them plus four `@ts-expect-error` cases (a
      two-way assertion under `typecheck` mode: an unused directive is itself an error).

      **What to weigh before releasing it.** This tightens type checking in every consumer: a spec
      that passed the wrong arguments to a double used to compile and now does not. That is the
      point, but it is a compile break for suites that have such calls, so it belongs in a minor at
      least, with the line above quoted in the release note.

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
  patterns again for every filename, because `globCache` memoises the *verdict*, keyed by filename,
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
      that this is not *this library's* surface: it is a coverage provider, it has nothing to do
      with spies, it pins `isIncluded` — a method that is not public API — into a package whose
      users mostly do not run coverage over a bundle at all, and it would fail silently the day
      that method is renamed. The shipping vehicles that fit are the recipe in
      `articles/COVERAGE.md` and, if the numbers repeat on a second consumer, a `doctor` note that
      points at it when it sees a large `coverage.include`.

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

- [ ] **Opt-in `lazySpies: 'proxy'` — one `Proxy` instead of N accessor placeholders.** Creation is
      O(1) in class width: 30–43 ns against 504 ns at 5 methods, 1 958 ns at 20, 11 326 ns at 100
      and **48 951 ns at 400**. On the realistic shape (create + touch 2 + call each 5×) that is
      1.11× / 1.41× / 2.69× / **8.71×**. Retained memory is **744 B flat whatever the width**,
      against 238 B per method — **−3.7 kB at 20 methods, −23 kB at 100, −94 kB at 400** per spy,
      which under `isolate: false` is the number that ends CI jobs. Load-bearing detail: 74–97% of
      what an untouched lazy spy retains is the `Object.defineProperty` placeholder itself.
      **Must stay opt-in** — the Proxy cannot remove itself, so it imposes a permanent +25.3 ns per
      read (4.09 → 29.43 ns) and +29.5 ns per call, and at width 5 with methods touched it _loses_
      158 B. Break-even is ~16 calls per spy at width 5, ~64 at width 20. A v2 prototype reached
      full semantic parity with `defineProperty` on every probe (`Object.keys`, `in`,
      `hasOwnProperty`, spread, `Object.entries`, JSON, `defineProperty`, `freeze`, `delete`, key
      order after assignment, identity) and improves on one: materialising in
      `getOwnPropertyDescriptor` removes the documented reason to reach for `lazySpies: false`.
      Target consumers are the wide generated clients — orval / ng-openapi-gen services, ngrx
      facades.

- [ ] **A bundle-size reduction pass.** Asked for as the next piece of work, and it opens partly
      against the de-chunking that just landed, which bought **−0.8 to −1.0 ms per spec file for
      +120 kB of `dist`**. So the first task is not a lever at all: put install weight and per-file
      import cost into comparable terms, because today one is counted in kB and the other in ms and
      nothing in this file converts between them — until it does, any cut risks silently paying back
      the win just bought. The levers already measured, so the pass does not restart from zero.
      `dist` is **569 680 B of deliberately unminified JS**, and `tsup.config.ts` refuses to minify
      for supply-chain transparency, which makes minification a product decision rather than a build
      flag. `README.md` + `AGENTS.md` are **187 847 B raw / 57 908 B gzip = 29.3% of every install**,
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
- [~] **Full de-chunking of all 14 entries.** 569 607 B of standalone ESM against the 140 970 B
  shipped at the time (**+429 kB**), undoing the previous pass, and it breaks the single-registry
  invariant. Only `index` and `angular` are worth the trade — and they have since been taken, so
  the baseline this compares against has moved by +120 kB and the remaining gap is that much
  smaller. Do not re-derive the delta from the two figures above without re-measuring both.
- [~] **Optimising the `ArgsMap` exact map** — already optimal (flat 186–237 ns from 1 to 100
  configs; the `#arities` guard is the best thing in the file).

- [~] **Dropping `AGENTS.md` from `files`.** `README.md` + `AGENTS.md` are 187 847 B raw /
  57 908 B gzip = **29.3% of every install**, and dropping `AGENTS.md` alone is −12.6%. Measured
  and offered, not recommended: it is what an agent in a consumer repo reads with no network,
  and "ship code with all surfaces" makes keeping it a deliberate product decision.

## Release infrastructure — move npm publishing to OIDC (deadline ~Jan 2027)

npm is retiring granular access tokens with **Bypass 2FA**. The scriptable half of
the move is done for *both* packages — `auto-release.yml` and `publish-alias.yml`
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
What is left here is the part that is still undone.

- [x] **Trusted publisher for `vitest-auto-spy`** — registered 2026-08-30:
      `ASDAlexey/vitest-auto-spy`, `auto-release.yml`, environment empty,
      permissions `npm publish`. npm did not demand 2FA to save it.
- [ ] **Publish `vitest-auto-spies` again, then register its publisher.** The
      package was unpublished in full on **2026-08-29T20:35:25Z**, and npm's policy
      is *"If you entirely unpublish all versions of a package, you may not publish
      any new versions of that package until 24 hours have passed"* — so the name is
      blocked until **2026-08-30T20:35:25Z** (23:35 MSK). A trusted publisher is
      configured on a package's settings page, which a non-existent package does not
      have, so the order is: one manual `cd alias && npm publish --access public` (a
      person with `npm login`, not a bypass token), then the publisher row from the
      table in CONTRIBUTING.md. That bootstrap publish is also why the OIDC path
      cannot be proven the same evening: an `Actions → Auto Release → Run workflow`
      with `alias_ref` set to the current tag would find that version already on npm,
      report "nothing to do" and go green without touching the handshake. The first
      real OIDC publish of the alias is the next release. Its old versions 1.6.0 /
      1.9.2 / 1.9.3 can never be reused — *"Once `package@version` has been used, you
      can never use it again."*
- [ ] **Delete the `NPM_TOKEN` repository secret and revoke the token on npm.**
      Nothing reads it any more, but do it only once both packages have gone out
      over OIDC — the "skip if version already exists" guards make a retry safe, a
      missing fallback during a half-finished migration is not.
- [ ] **Tighten *Publishing access* on both packages** — npmjs.com → package →
      Settings → *Publishing access* → *"Require two-factor authentication and
      disallow bypass 2fa tokens"*, then **Update Package Settings**. Both packages
      currently sit on the permissive option. Trusted publishers keep working under
      either, so this changes nothing operationally; it removes the bypass-token
      escape hatch, which is only worth removing once it is no longer the fallback.
      Needs 2FA on the account.

Sources: <https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens/>,
<https://docs.npmjs.com/trusted-publishers>

## Claude Code plugin directory — submission (future)

The repo is already its own marketplace: `.claude-plugin/marketplace.json` +
`.claude-plugin/plugin.json` + `skills/vitest-auto-spy/SKILL.md`, all on `master`,
public, installable by anyone with

```
/plugin marketplace add ASDAlexey/vitest-auto-spy
/plugin install vitest-auto-spy@vitest-auto-spy
```

Getting into the **official directory** (`anthropics/claude-plugins-official`,
installed as `claude-plugin-directory`) is a separate, optional step — it only
buys discoverability via `/plugin > Discover`.

- **Not a PR.** `.github/workflows/close-external-prs.yml` auto-closes any pull
  request from an author without write access and replies with the
  submission link. The only channel is the form:
  <https://clau.de/plugin-directory-submission>.
- **Entry shape.** The directory stores third-party plugins under
  `external_plugins/<name>/` with just `.claude-plugin/plugin.json` (plus
  `.mcp.json` where relevant), and lists them in the root `marketplace.json`
  with `source: "./external_plugins/<name>"`, a `category`, and sometimes a
  `tags: ["community-managed"]` marker. Content is copied in by Anthropic —
  our repo is not referenced as a git source, so a directory entry would
  have to be re-synced on every release.
- **Known risk.** All 13 current external entries are MCP-server wrappers; none
  is a skill-only plugin. A skills-only submission may simply not fit what
  they curate today. Re-check the directory before spending time on the form.
- **Before submitting** — what a reviewer would look at: - `plugin.json` / `marketplace.json` version in lockstep with
  `package.json` (already automated by `scripts/sync-plugin-version.mjs`
  on `npm version`). - `SKILL.md` frontmatter passes their
  `.github/scripts/validate-frontmatter.ts` (`name` + `description`;
  values containing YAML special chars must be quoted). - a `README.md` in the plugin root — their documented plugin layout
  expects one; ours currently lives only at repo root. - LICENSE (MIT) and `SECURITY.md` — both already present.

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

## Angular — the resource era

The one coherent hole in an otherwise broad Angular surface. `httpResource()` is Angular's flagship
data primitive; it appears **zero times in `src/`** (three times in `lib/event-loop.ts`, all prose)
and **zero times in `docs-site/`**. Neither does it appear in ng-mocks, spectator or
`@testing-library/angular` — **no library in the Angular world has an answer**. Meanwhile two of
this package's own headline helpers fail against it (see "Live defects").

Measured against Angular 21.2.17, zoneless TestBed, Vitest 4.1.9. `runInInjectionContext(() =>
httpResource(…))` issues **no request at all** until something ticks; after `TestBed.tick()` there
is exactly one pending request; after `flush(payload)` the resource still reports `loading` with the
default value, and needs **one microtask plus one tick** to reach `resolved`. A plain `resource()`
with an async loader is different again: tick + microtask is not enough, `await
ApplicationRef.whenStable()` is. Two waits for one concept — which is the argument for one name.

- [ ] **`provideHttpTesting()` + `expectRequest(url).flush(body)` — M, and it costs a peer.**
      Collapses the measured six-step dance (tick → inject controller → `expectOne` → flush →
      microtask → tick) into two lines, with `flush` returning a promise so the caller cannot get
      the settle wrong. The objection, stated plainly: it needs `@angular/common/http/testing`,
      which is **not a peer today** — a second optional peer (`@angular/common`). The precedent and
      the lazy-load strategy both exist, but it is a scope decision, which is why it ranked below
      the items that needed nothing new — all of which have since shipped, leaving this one alone
      in the section.

      **The objection has since narrowed to `expectRequest` alone.** Shipping
      `enableAngularDiagnostics({ pendingRequests })` turned out to need **no** new peer: the
      `HttpTestingController` token is read out of the caller's own `configureTestingModule` config,
      so the diagnostic reaches the controller without this package ever importing
      `@angular/common/http/testing`. `expectRequest(url)` cannot use that trick — it has to name the
      controller before the caller has configured anything — so it, and only it, still costs the peer.

Not this library's job, decided after reading the APIs in full: **`RouterTestingHarness`**
(`create(url)` + `navigateByUrl(url, ComponentType)` is already two lines and returns the typed
activated component), **`ActivatedRoute` doubles** (already the motivating example at
`lib/create-mock.ts:5-30`), **`@angular/cdk/testing` harnesses** (a DOM-interaction API,
structurally opposed to `renderShallow`, which blanks the template — adopting it would contradict
"templates are never tested"), **reactive-forms doubles** (a real `FormGroup` is cheap and a fake is
strictly worse), and **`DestroyRef` / `afterNextRender` / `afterRenderEffect` / `PendingTasks`** —
measured: `afterNextRender` runs under `renderShallow` even with a blank template, and
`DestroyRef.onDestroy` fires on `fixture.destroy()`. Nothing to await.

### Angular performance — four candidate optimisations killed by measurement

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
- [~] **What to ship instead — three read-only pieces, no mutation.** (a) and (b) **shipped**; only
  (c) is still open. (a) The `doctor` check `angular-build-splitting-off`
  (`src/cli/checks/angular-build.ts:65`): detect an installed `@angular/build` in
  `[22.1.5, 22.1.7)` and report that the unit-test build has code splitting off, that
  `--coverage` will grow ~400 MB per spec with no plateau, and name both exits. Exactly the
  "a defect nothing consumes" niche the doctor exists for. (b) The
  `docs-site/adapters/angular.md` page — "When the unit-test build has code splitting off",
  carrying the patch script verbatim with its "delete this from 22.1.7" note, and stating the
  trade correctly: **not** "memory against module mocking", since splitting off buys nothing for
  `vi.mock`; what it buys is the live-binding / undefined-export class upstream turned it off
  for, and what it costs is 791 chunks / 596 MB and an OOM-under-coverage that no warning
  announces.
- [ ] **(c) A one-shot runtime notice from `setupAutoSpy` naming the builder's splitting mode**, in
      the same family as the duplicate-install report it already prints: read the mode and say so
      once per run. Read-only, zero risk, and it fires in the session where it matters — which the
      doctor check and the docs page, both of which have to be sought out, do not.

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
- **TSDoc in `dist/*.d.ts`** — agents open declaration files constantly, and `AGENTS.md` even tells
  them to. The six most-repeated mistakes belong in `@remarks` on `createSpyFromClass`,
  `methodsToSpyOn`, `Spy<T>`, `nextWith`, `calledWith` and `injectSpy`. **The highest-leverage
  unexploited channel**, and it reaches the human on editor hover too.

**AGENTS.md won.** Codex, Cursor, Copilot, Cline, Windsurf/Cascade, Zed, OpenCode, Qwen, Junie, Roo
and Aider all read it. The holdouts are **Claude Code** (reads `CLAUDE.md` — its docs say so
verbatim) and **Gemini CLI** (opt-in via `context.fileName`). Minimum coverage is therefore three
root files: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`. `llms.txt` stays — it costs nothing — but it is
a link people paste, not something coding agents fetch: one 90-day crawler sample put it at 0.1% of
AI-bot requests, and Google stated in January 2026 that it does not use it.

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
- [ ] **`node:test` retains every mock forever** — `MockTracker` holds each `mock.fn()` for the life
      of the process: 20 000 spies of a 10-method class held 435.6 MB after being dropped and
      GC'd; `mock.reset()` released all of it. Documented in `docs-site/runtimes/node.md`, but worth
      deciding whether the `/node` entry should do something about it (a `resetAutoSpy` hook cannot
      — the tracker is global, and resetting it would clobber mocks the spec created by hand).

---

# Competitor analysis

The defensible niche: **the only auto-spy library that reads a real _class_ and
returns a _fully-typed_ spy of every method with _return-type-aware_ control
helpers (`resolveWith` / `nextWith` / `calledWith` / `mustBeCalledWith`),
portable across every Vitest-compatible runtime (Vitest / Bun / `node:test`) and
framework (Angular / NestJS / React / Vue / Svelte).**

| Library                                    | Reads a class?          | Return-type-aware helpers? | Runtime     | Typed   | Where we win                                                                                                                                                   |
| ------------------------------------------ | ----------------------- | -------------------------- | ----------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **jest-auto-spies** (`@hirez_io`)          | ✅                      | ✅ (rxjs/promise)          | Jest only   | ✅      | Same API on Vitest/Bun/`node:test`; the maintained successor — direct migration path.                                                                          |
| **vitest-mock-extended**                   | ❌ (type Proxy)         | ❌                         | Vitest      | ✅      | We read a real class **and** add promise/observable ergonomics. Our `createAutoMock<T>()` matches its type-only mode while keeping the helpers. Complementary. |
| **@golevelup/ts-vitest** (`createMock`)    | partial                 | ❌                         | Vitest/Nest | ✅      | Explicit class→spy, typed Promise/Observable helpers, `mustBeCalledWith`.                                                                                      |
| **ts-auto-mock**                           | ❌ (compiler transform) | ❌                         | Jest/ts     | ✅      | No ttsc/transformer build step; runtime-only, zero toolchain coupling.                                                                                         |
| **sinon**                                  | ❌ (manual stubs)       | ❌                         | Any         | ❌      | Auto-generated + fully typed vs. hand-written + loosely typed.                                                                                                 |
| **testdouble.js**                          | partial (`td.object`)   | ❌                         | Any         | weak    | Stronger typing, return-type-aware helpers, framework recipes.                                                                                                 |
| **vitest `vi.fn` / `vi.spyOn`** (built-in) | ❌                      | ❌                         | Vitest      | partial | Zero boilerplate: a whole class → spy in one call, no per-method wiring.                                                                                       |

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
  half the type-checker work of the deep-proxy libraries, while carrying more helpers. Worth a
  `comparison.md` row and a CI budget test, which is the cheapest way to stop `Spy<T>` from
  degenerating into a deep proxy.

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
- [ ] **`createNestUnit(Target, { expose })` — M.** The answer to `@suites/unit`'s solitary/sociable
      model, which is precisely what `/nestjs` lacks: today a Nest spec lists `provideAutoSpy(X)` per
      dependency and is rewritten whenever the constructor changes. Angular already has
      `createWithAutoSpies`; this is the same idea over Nest's `design:paramtypes` and
      `SELF_DECLARED_DEPS_METADATA`, both of which Nest projects already emit — no new runtime
      dependency, `@nestjs/*` stay optional peers read structurally as `NestModuleRef` already is.
      Copy away from Suites' weakness: its Proxy answers every property, so a typo never fails;
      this one still reads the real prototype.
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

Runners-up: `throwWith` on the sync bundle, to match Vitest 4.1's new `mockThrow` / `mockThrowOnce`
on the runtimes that lack it; an `ignoreExtraArgs` option on `calledWith`, since `ArgsMap#argsMatch`
requires exact arity while testdouble and substitute allow partial; and a documentation note that
`bun:test`'s `mock.module` is **not hoisted**, which silently breaks migrated suites.

### A distribution opening, not a feature gap

Angular ships **no** spy helper — the complete `@angular/core/testing` public API at 22.1.4 contains
no `createSpy`, `createSpyObj`, `createMock` or stub factory, and the official v22 answer at
`angular.dev/guide/testing/services` is a hand-written literal:
`const stub: Mocked<TaxCalculator> = { calculate: vi.fn() }`. The official codemod hardens that
habit: `ng generate @schematics/angular:refactor-jasmine-vitest` (21.0.0, stabilised in 22.0.0)
rewrites `jasmine.createSpyObj()` into exactly that literal and emits a **TODO comment it cannot
resolve** for two cases — a single-argument `createSpyObj`, and a method list held in a variable
rather than a literal array. Against `jasmine-core`'s ~23.9M downloads/month, that is a very large
population being handed the boilerplate `createSpyFromClass(Service)` deletes.

- [ ] **A `/migrating` page aimed at `refactor-jasmine-vitest` output.** Still open, and **not**
      closed by `npx vitest-auto-spy codemod` shipping: that codemod converts a Jest suite to this
      library, where this page addresses what Angular's _own_ schematic leaves behind. Different
      input, different deliverable. Show the schematic's
      `{ a: vi.fn(), b: vi.fn() }` expansion beside `createSpyFromClass(Service)`, and address both
      TODO cases explicitly — this library handles them _by construction_, because it reads the
      prototype instead of the call site. Also correct the record while there: Angular has not
      deprecated Karma (Karma's own maintainers added that notice in 2023); Vitest became the
      `ng new` default in 21.0.0, and 22.0.0 deprecated the webpack builder family and removed the
      experimental `:jest` and `:web-test-runner` builders.
