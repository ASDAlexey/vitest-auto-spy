# Decisions — considered, measured, and deliberately not done

The record `TODO.md` used to carry alongside its backlog, split out on 2026-09-10 so the backlog is
only what is still open. Nothing here is work waiting to be picked up: every entry is a question that
was asked, answered and closed, kept because the answer cost a measurement, a probe or a rebuild to
get and would otherwise be re-derived. `[~]` means considered and intentionally not done, with the
reason.

Shipped work is not here either — it is in `CHANGELOG.md` and in git history.

## Field findings — repository reconnaissance, 2026-09-10

A static pass over the same consumer's 1759 spec files, asking "what is written here and does
nothing" rather than chasing a failure. Numbers are that pass's; the rules reproduced them
independently, which is the check worth having. What shipped is in `CHANGELOG.md`; what was
deliberately left out is here.

- [~] **An autofix for `no-dead-schemas`, and per-call reporting.** Neither, on purpose. The repair
      is "delete the line and the import", and dropping an import is the one edit that turns a lint
      pass into a compile error when something else still uses the name. Not per-call either —
      Angular merges successive `configureTestingModule` calls, so the file decides. The rule found
      230 entries in 204 files.

- [~] **A lint rule for shadowed providers**, pairing `x.component.spec.ts` with `x.component.ts` and
      reading the decorator statically. Not shipped beside
      `enableAngularDiagnostics({ shadowedProviders })` / `assertNoShadowedProviders`: it would have
      to resolve an import to a sibling file, which no rule in this plugin does — and the runtime
      check answers the same question from evidence rather than from a naming convention. Worth
      revisiting only if a project reports the diagnostic being too late to be useful.

- [~] **Inheritance and merging for `registerAutoSpyDefaults`.** Not shipped: a subclass inheriting
      its base's registration, because it would let one setup line change doubles in files nobody was
      looking at. Not shipped: merging two registrations of the same class — the second replaces, so
      the drift the API removes cannot reappear inside it.

- [~] **Warning when a registration names a member no prototype carries.** Nothing does, for the same
      reason the call-site lists do not: the option exists to name instance fields, and telling a typo
      from one is not decidable.

- [~] **A provider that replaced nothing** (`{ provide: 'LOCALE_ID', useValue: 'ru-RU' }` against the
      real `LOCALE_ID` from `@angular/core`). Checked and **not folded** into `shadowedProviders`:
      that check compares a registered *double* with what the component resolved, and this provider
      is not a double, so there is nothing to compare. The general form — "declared, and nothing ever
      asked for it" — needs to know whether a token was injected, which Angular does not report. No
      dedicated rule either: one occurrence in the repository, already removed, and a rule on one
      finding is a rule that gets switched off. Revisit if a second shape of it turns up.

## Field findings — consumer suite hardening, 2026-09-09

Reported from the same consumer while a batch of specs was being moved onto `provideAutoSpy` /
`injectSpy` and its type suppressions removed. Everything was reproduced in this repository before
it was changed; what shipped out of it is in `CHANGELOG.md`, what was deliberately left out is here.

- [~] **Re-applying a `mock*Prop` patch on every test.** It is the fix that "a patch made outside a
      per-test hook expired after one test" looks like it wants, and it would defeat what
      `restoreMockedProps()` exists for — a patch that puts itself back per test outlives its file
      under `isolate: false`, and "the file this patch belongs to" is not something the journal can
      see. The report graded by `propsOutsideHooks` is what shipped instead.

- [~] **Detecting that same shape without `setupAutoSpy`.** Nothing does: without its `beforeEach`
      there is no epoch to compare against — and without the sweep the patch stays put, so there is
      nothing to report either.

- [~] **A diagnostic that recognises `restoreMocks: true`** and fails with a message. It was the
      other candidate against accessor spies not surviving that flag, and it is the wrong one: it
      would report a breakage where there is no longer one to report, now that the Vitest and Rstest
      adapters install accessor spies by redefining the property instead of through the runner's
      `spyOn`. The diagnostic that stays is the one for the failure nothing can repair — a
      non-configurable property.

- [~] **`no-inject-before-override` following a helper of the consumer's own** that wraps
      `TestBed.inject`. Not shipped: that needs cross-file resolution, and the rule's whole guarantee
      is that it decides from one file. `injectSpy()`, `renderShallow()` and
      `TestBed.runInInjectionContext` it does read.

- [~] **A paired helper for reaching a private member.** Not shipped beside
      `no-private-member-access`: it would legitimise exactly what the rule reports, and the repair
      is a design question rather than a mechanical one. Also not shipped: a syntactic fallback when
      no program is configured — measured at 37 % false positives on the consumer's corpus, which is
      the level at which a rule gets switched off and takes the real findings with it. And
      deliberately not relying on the neighbouring props that happen to exist in that consumer
      (`as any` banned by its lint config, `as unknown as` being weeded out separately): the next
      repository has neither and the escape survives.

      three literals in one `providers` array give three reports, twenty give twenty, and the
      before/after of converting one differs by exactly the one converted. What is real is the
      opposite shape — four forms the rule is silent on *by construction* (a double a helper call
      built, one imported from another file, `vi.fn()`s behind a function boundary, `multi: true`),
      so a zero is a statement about forms rather than about the repository. **Measured** on the
      consumer's 1759 spec files: the rule reports 0, and behind that zero sit **56 providers in 40
      files** it cannot classify — 27 whose `useValue` comes from an unknown call, 29 from an import.
      A further 94 come from one of this library's own factories, which is the shape the rule asks
      for. The other two blind forms do not occur there at all: `vi.fn()` behind a function boundary
      and `multi: true` are both **0**. Worth an option that reports an unresolvable `useValue`
      identifier as "cannot see this one"? Probably not: it would fire on every
      `useValue: someImportedConstant`, and the sample shows most of those are data fixtures
      (`ENVIRONMENT_MOCK`, `MockAccount`) rather than service doubles.

- [~] **"`provideAutoSpyForToken`'s second argument silently yields a non-spy."** Checked and **not
      reproduced** as a silent failure. A data value where the type declares a method does not
      compile — `DeepPartial<T>` narrows a function member to `T[K] | ((...args) => ReturnType<T[K]>)`
      — and a plain arrow seeded there fails loudly at the assertion with the runner's own "received
      value must be a mock or spy function". No change made; a warning on a seeded non-mock function
      was considered and rejected as noise on a legitimate use.

## Field findings — consumer monorepo merge, 2026-08-29

Reported from a consumer, not from this repo: merging four months of `master` into an Angular
monorepo whose suite (1 725 spec files, 12 152 tests) had already moved to Vitest. Thirty-one specs
arrived in Jest style and had to be converted by hand, which is what surfaced these. Each one below
was hit and reproduced there; none is reproduced in this repo's own tests yet, so treat the
file:line references as pointing at _this_ library's code and the error text as evidence from the
consumer. Docs for the migration half of this list have landed in
`docs-site/migrating.md` ("Reading a spy back out of the container", "The type names", and three
new rows in the no-twin table).

- [~] **The `Cannot redefine property` guard covers this library's own seam only.**
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

## Field findings — 122 specs off `jest-auto-spies`, 2026-09-09

Eight items reported from a consumer, by eight agents converting 122 Angular specs off
`jest-auto-spies` against 5.0.1. Every one was reproduced **here** before anything was changed, with
this repository's own fixtures, and three of the eight did not survive that — recorded because a
finding that evaporates is worth as much as one that lands, and the same three will otherwise be
reported again.

Did **not** reproduce, and why:

- **"`provideAutoSpy` cannot seed a data property."** `ClassSpyConfiguration.overrides` has taken
  property seeds since 3.5.0 and `provideAutoSpy` forwards the whole configuration. Proved with a
  runtime test. What was true is that nothing said so where a reader would look: the parameter is
  named `methodsToSpyOnOrConfig`, its JSDoc example showed only `methodsToSpyOn`, and the lint rule
  that reports the `useValue` literal described the class factory as spying methods and stopped.
  All three now name `overrides`.
- **"`prefer-create-spy-from-class` recommends the one constructor that cannot work on a
  declaration-only abstract class."** `createSpyFromClass(LocalStorage)` on
  `abstract class LocalStorage extends AbstractStorage {}` produces a working double — the
  empty-prototype fallback covers exactly that shape. The **partially** abstract class is the real
  case, it is documented, and `fillMissing` is the answer. Both probed.
- **"`provideAutoSpy` / `injectSpy` are not on the root entry"** as a gap. They are not, deliberately,
  and the split is the first diff on `docs-site/migrating.md`; `doctor`'s `helper-from-wrong-entry`
  finds every miss in a suite at once. The migration page now says so where the diff is.

- **`invocationCallOrder` across the two spy families gives a wrong verdict** — reproduced, pinned,
  **not** made comparable. `lib/fast-spy.ts` keeps `invocationCallCounter`; `@vitest/spy` keeps its
  own at `dist/index.js:311`, a module-private `let` that is neither exported nor advanced by
  anything outside it. So `toHaveBeenCalledBefore` across one of each answers from two sequences that
  never met — and answers, rather than failing. Under `jest-auto-spies` the question did not arise:
  both halves were `jest.fn()`. Measured in the converted suite as `[164, 165, 167, 168, 169]` beside
  `[28]` for a call in the same test; reproduced here with three warm-up calls, which is all it takes
  to invert the verdict.

  Four ways to make them comparable were considered and all four are worse than the switch that
  already exists:

  - **Read the runner's counter.** It is not reachable. Nothing in `@vitest/spy`'s export list
    touches it.
  - **Sample it by calling a throwaway `vi.fn()` on every auto-spy call.** That is a runner-mock
    invocation per call on the hot path the fast spy exists to avoid, plus an unbounded `calls` array
    on the sampler. It is `setSpyEngine('runner')` with extra steps and worse memory.
  - **Anchor the two scales once, at startup.** They diverge again on the next call of either family;
    an anchored pair produces ties, not orderings.
  - **Wrap `vi.fn` so both families feed one counter.** Patching a runner global for every consumer,
    to change the meaning of a field two matchers read. Not this library's business.

  What is left is where it was made loud: `AGENTS.md` now says "wrong" rather than "meaningless" and
  carries the measured numbers, `docs-site/migrating.md` has a row and a section (it had nothing, and
  it is the page a reader is on when the assertion silently changes meaning), and two tests pin the
  divergence. A fifth option — overriding `toHaveBeenCalledBefore` / `toHaveBeenCalledAfter` through
  `expect.extend` so a cross-family comparison **throws** — is the only one that would catch it
  without a doc, and it is a real option: the library already installs matchers from five modules. It
  is not taken here because it replaces a runner built-in for every consumer of `setupAutoSpy`, which
  is the maintainer's call and not a doc-shaped one. Recorded so the trade is not re-derived.

- [~] **`injectSpy(Service)` inferring `Service<{}>` instead of the generic's declared default.** Not
      this library's to fix, and measured rather than argued: TypeScript instantiates a generic
      class's own type parameters to their **constraints**, not their **defaults**, in every
      inference position. On tsc 5.9 both `f<T>(token: new (…) => T): T` and
      `g<C extends abstract new (…) => unknown>(token: C): InstanceType<C>` yield `Service<{}>` for a
      class declared `Service<T = Defaults>`. No signature this package could write changes that; an
      explicit type argument is the only fix, which is what `injectSpy`'s docstring already says.

Left as proposals, deliberately:

- [~] **Narrowing `prefer-provide-auto-spy` to skip a literal whose `vi.fn()`s all sit below the
      first level** (`{ headers: { get: vi.fn() } }` behind a request token). The premise checks out
      — `createAutoMock<T>()` makes every accessed key a function spy, so `req.headers` is a spy and
      `req.headers.get(…)` reads a property off one — but the conclusion does not follow: the second
      argument expresses it exactly (`provideAutoSpyForToken(REQUEST, { headers: { get: vi.fn() } })`,
      seeded verbatim), and `mockDeep` is the other answer. So the message gained the nested case
      instead. Weakening a rule on one report, when the recommendation it makes is reachable, buys a
      false negative for every genuinely nested service double.
- [~] **A lint rule for `helper-from-wrong-entry`.** Still the `doctor` check only. The reason on
      record — resolving a name to an entry needs the installed version's own export map, which a
      per-file linter has none of — is unchanged by this report, and the table is generated
      (`src/cli/checks/export-map.generated.ts`), so a rule *could* carry it. What would decide it is
      evidence that the miss survives a type gate; every instance in this report was found by `tsc`.
- [~] **A `writableProps` option on `createAutoMock`.** The narrower form of the `readonly` fix — keep
      the modifier, drop it for the seeded keys — cannot be written in TypeScript for the call shape
      that needs it. It would take inferring the seed's type into a second type parameter, and
      supplying **any** explicit type argument turns inference off for all of them: the ubiquitous
      call is `createAutoMock<AuthorizationService>({ … })`, which would fall back to the default and
      seed nothing. That fact is measured and still holds. What no longer follows from it is the
      wholesale form: stripping `readonly` from `Spy<T>` and `DeepMockProxy<T>` shipped briefly and
      was reverted, because an assignment to a *spied accessor* is silently inert — the write lands
      on the setter spy while the getter keeps answering `undefined`, so a loud `TS2540` fixable in
      one line became a green test asserting nothing. `mockValueProp` is the answer instead, and it
      needs no new option and no new type: `readonly` does not take a key out of `keyof T`, so the
      checked overload already accepts the member, and `defineProperty` makes the value readable
      where `[[Set]]` — plain assignment, `Reflect.set` and `Mutable<T>` alike — does not.

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

- [~] **One more Jest/Vitest budget difference, reporting-only and not acted on.**
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

## `prefer-render-shallow` — shipped (Unreleased)

The twentieth lint rule: `TestBed.createComponent` in a file that never reads the template →
`renderShallow(X)`. Numbers from `bench-angular/baseline.json`, not hand-run.

Two defects the first consumer suite found, both fixed (Unreleased), both worth keeping in mind
before the whole-file heuristic is widened again:

- **A `DOCUMENT` stand-in read as a template read.** `{ querySelector: document.querySelector.bind(document), … }`
  put four of the fourteen `TEMPLATE_READS` words into the source, and the one spec in that repo
  rendering a template nobody reads was the one spec the rule never reported. Subtracted shape is
  `name: document.name` with the two names matching — a delegation and nothing else. Deliberately
  **not** an AST pass: property keys and `ObjectPattern` keys are the same node shape, so skipping
  keys would drop `const { nativeElement } = fixture` and turn an under-reporting rule into a
  wrong one.
- **`'never'` reported the `'as-needed'` wording.** A policy that does not ask about reads printed
  "nothing in this file reads either", on a spec with thirty-five `querySelector` calls. Third
  message id, not a data placeholder in the first: the two findings share a rewrite, not a claim.

What it deliberately does **not** do, so the next person does not re-derive it:

- **A suggestion, never a `--fix`.** `renderShallow` calls `configureTestingModule` itself, adds
  `NO_ERRORS_SCHEMA` and runs the first change detection. Applied unattended across a repository that
  changes what the module holds, and throws outright on a spec that had already instantiated it.
- **No second rule for the strict reading.** `no-template-rendering` was built and then folded into
  `{ templates: 'never' }`: the plugin's contract is that every rule ships in `recommended` switched
  on, and a policy nobody in the project agreed to cannot be one — the cost finding itself only earns
  a place there as a `warn`, and `'never'` would aim that warning at every component spec. As an
  option it is a project's choice, which is what it always was.
- **Nothing can hide the coverage it costs.** With `templateUrl` the compiled template already maps
  back to the `.html` and never entered a `*.ts` coverage glob. What `'never'` stops executing is the
  component's own TypeScript — a method whose entry condition is a `viewChild` the template supplies.
  There is no coverage setting that excludes that, and the docs say so rather than implying a knob.
- **It cannot see the component.** `viewChild`, `contentChild`, content projection and a `@defer`
  block all need the template, and the rule reads the spec. The answer is `{ keepTemplate: true }`,
  which still drops the children — 3.8× dearer than a blank template, but well under a full render.

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
- [~] **What `restoreWebStorage()` deliberately leaves out.** No `StorageEvent`: the stand-in is a
  `Map`, and firing events from it would be a behaviour the environment it stands in for does not
  offer in the same way. No per-test reset — the repair runs once, so a broken runtime and a working
  one leak between tests identically, which is the point; a suite that wants a clean storage per
  test clears it in a hook of its own. No quota, no `key()` ordering guarantees beyond insertion
  order. And no repair at all in a `node` environment: inventing a Web Storage there would hand the
  code under test an API the real runtime lacks.

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

- [~] **A bundle-size reduction pass — the named lever was taken 2026-09-04; what is left is
  recorded below so it is not re-proposed.** The pass opened against the de-chunking that had just
  landed, which bought **−0.8 to −1.0 ms per spec file for +120 kB of `dist`**, so the first task
  was not a lever at all: put install weight and per-file import cost into comparable terms.

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

      **What shipped: pin the state, not the code.** `expect-emission.ts` was never the stateful
      module — one `let defaultTimeoutMs = 1000` inside it was, and pinning the file dragged 10 002 B
      of pure helper into every entry that imports the shared chunk. Splitting the cell out
      (`src/lib/emission-timeout.ts`, which is now the `SHARED_STATE_MODULES` member) took
      `dist/shared-state.js` from **17 467 → 7 465 B** and **−10.0 kB off the module graph** of
      `/rxjs` (−33.8 %), `/jasmine-compat` (−44.5 %), `/dom-stubs` (−24.3 %), `/console` (−16.9 %),
      `/nestjs` (−11.3 %), `/jasmine` (−10.6 %) and `/setup` (−10.3 %) — none of which export an
      emission helper at all — plus −2.5 kB off each of the eight entries that do, because inlined
      into the entry it tree-shakes better than it did behind a barrel re-export. **No entry gains a
      module.** `dist` on disk +12.6 kB (+1.2 %), a dev-only duplication that never reaches a
      production bundle. `/setup` min+gzip moves 12 092 → 12 072 B — the number the minification
      lesson demands before any byte is touched, and it moves the right way.

      Two things measured and worth not re-deriving. **The ms side is at the harness's noise floor:**
      predicted 0.077 ms from the 130 kB/ms rate, measured medians −0.04…−0.13 ms against an A/A
      control that itself reaches ±0.156 ms. Quote the bytes, which are exact and deterministic; quote
      the time as "≈0.08 ms, at the resolution limit". And **the obvious version of this lever is the
      wrong one**: giving `expect-emission` its own pinned chunk buys the same 10 kB on the seven
      leaf entries but adds **+1 module to the root and to `/angular`**, the two entries every spec
      file loads — exactly the cost the de-chunking pass paid 120 kB to remove. Built, measured, and
      rejected. `serialize-args` (7 104 B, stateless) is now free to code-split as well.

- [~] **The rest of the pinned shared chunk stays as it is.** After the split
  `dist/shared-state.js` is 7 465 B holding `mock-adapter`, `package-identity`, `redefine-failure`,
  `observable-support`, `jasmine-support`, `docs-links` and the 0.3 kB timeout cell. The only
  partly-dead member left is `jasmine-support` — ~1.5 kB emitted, dead for `/rxjs`, `/dom-stubs` and
  `/angular-http`, reachable from every other entry. Pinning it separately would cost +1 module on
  the twelve entries that need it, including the root and `/angular`, for ~1.5 kB off three leaves.
  Re-open only with a lever that removes bytes **without** adding a module.

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
- [~] **A `toEqualRecords` matcher on top of `diffByField`.** Decided rather than pending, on the
  reason that stood here unchanged for two passes: `diffByField` is a plain function because it is
  reached for _after_ a failure, and a matcher would carry its own deep equality and compete with
  `toEqual` at every call site. Re-open only with a call site `toEqual` reads worse on.

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
somebody's editor. The long tail of the catalogue is in `TODO.md`; the tier below is the part that
was looked at and left alone.

- [~] **The `ts.parseJsonConfigFileContent` tier.** The shipped glob matcher is self-contained and
  zero-dependency; the consumer's own `typescript` via `createRequire` would be the authority on
  `extends` chains and on the extension set an `include` entry expands over. Two patterns are
  exempt today rather than resolved properly: a declaration-only glob and one rooted in a directory
  the scan never enters. Looked at again 2026-09-04 and left alone deliberately: keeping per-pattern
  attribution — the entire value of `tsconfig-glob-matches-nothing` — means invoking the consumer's
  compiler once per `include` entry on repositories with 150+ spec tsconfigs, and both tiers would
  have to be held at 100 % branch coverage with `typescript` unresolvable from a temp fixture. That
  is a redesign of a shipped, gate-covered check, not an addition.

`helper-from-wrong-entry` and `no-unawaited-helper` **shipped 2026-09-04**, and the table they
needed exists: `scripts/generate-export-map.mjs` compiles the barrels with the consumer's own
`typescript` and reads `checker.getExportsOfModule`, which is the only way to see through the
`export *` chains — 311 names over 20 entries, regenerated by `npm run export-map` and gated by
`export-map:check`, the same shape as `llms:check`. `AWAITABLE_HELPERS` comes out of the same
program: exports whose _every_ call signature returns a `Promise`. Version drift is handled at check
time rather than generation time — both checks go quiet when the installed major differs from the
table's, because a helper only moves between entries in a major. Over this repository's own 755
source files the pair reports exactly four findings, all of them fixture strings inside their own
spec. Neither has a fixer; `doctor` still never writes.

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

## The `node:test` adapter and the name it prints

- [~] **`node:test` adapter ignores the `name` argument** — closed 2026-09-04, and the shape of the
  fix is worth keeping. `mock.fn()` takes no name argument at all (passing one throws
  `ERR_INVALID_ARG_TYPE`) and has no `mockName`; the returned proxy inherits the _implementation's_
  name, so every spy printed as `[Function: dispatch]`, this library's own dispatcher. The adapter
  now defines the method name on the mock as both `name` and `displayName` — own, configurable,
  non-enumerable properties, which survive `mock.reset()` / `restore()` / `resetCalls()` because all
  three only swap the implementation. That is what `node:assert` diffs, `util.inspect()` and
  `serialize-args` read. Still absent, and documented as such on the node runtime page:
  `getMockName()` does not exist there (read `spy.method.name`), and `node:test`'s own reporter
  never labels a mock.

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

- [~] **Anchoring the emission helpers' failures — closed 2026-09-04, and the mechanism is the
  record.** `vi.defineHelper` stays off these three: their errors are built inside a subscribe or
  timer callback, so the `__VITEST_HELPER__` frame lands _last_, `slice(helperIndex + 1)` returns
  nothing and the reporter loses its code frame entirely — worse than the `node_modules` frame it
  replaces. Shipped instead: `lib/error-anchor.ts` captures the caller's stack at helper entry,
  before anything subscribes, brands the errors this module builds, and re-anchors only those. A
  failing `expectEmission` now opens the spec line that called it (`expect-emission.spec.ts:545:41`)
  where it used to open `expect-emission.ts:349:10`. `expectError` hands back the caller's own error
  with its own stack, untouched — rewriting that one would be a lie, and it is a test.

- [~] **`createSpyFromInstance(instance, config)` — shipped 2026-09-04.** The structural gap against
  `vi.mockObject` / `sinon.createStubInstance` / `td.replace` is closed: an object the test already
  holds is patched in place, same identity, so whatever captured it first sees the doubles. Two
  design decisions worth not re-deriving. Discovery is own function-valued fields **plus** the
  prototype chain up to but not including `Object.prototype` — the first half is why an arrow
  property needs no `instanceMethodsToSpyOn` here, the second is the guard `@testing-library/angular`
  is missing (its recursion mocks `hasOwnProperty` and `toString`). And `lazySpies` / `fillMissing`
  are deliberately ignored rather than honoured: the members already exist, and an instance is not
  an erased `abstract` declaration. Restoration reuses the `mock*Prop` journal, so
  `restoreSpiedInstance`, `restoreMockedProps()` and `using` all compose — and `using` **restores**
  rather than resets, the only sense disposal can have for an object the consumer owns.

- [~] **`explainSpy(spy, method?)` — shipped 2026-09-04.** Both gaps the entry named are closed.
  Per-config identity is derived from position rather than stored: `ArgsMap.configuredEntries()`
  reads `Object.keys(#map)` insertion order (every serialized key starts with `[`, so none is
  integer-like and the order is stable) followed by `#matcherConfigs`, which is exactly the
  precedence `get()` applies — so "the first entry whose `matches` holds" _is_ the config `get()`
  would have answered from, at zero cost on the hot match path, which was the constraint. The two
  empty narratives are printed outright: `nothing configured`, and `N calls, …, none matched`. The
  return is a `string` on purpose — a diagnostic to print, not something to assert on — which also
  keeps the type budget flat. **It ships from `/diagnostics`, not the root, and the number is the
  reason:** measured 2026-09-04 by A/B builds of `dist/index.js`, `explainSpy` on the root costs
  **1 226 B min+gzip** against a 14.3 kB entry, where `createSpyFromInstance` costs 322 B and the two
  together 1 149 B — they share the member walk, so adding the second on top of the first is free.
  That is the same argument `/diagnostics` was created for in 4.0.0, and a brand-new export is the
  one moment moving it costs nothing. One structural seam left: `explain-spy.ts` reads the two chains off
  `AUTO_SPY_MARK` duck-typed, guarded by `map instanceof ArgsMap`; a `readSpyChains(mock)` export
  from `lib/function-spy.ts` would make it explicit.

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

- [~] **A `renderShallow` bench — shipped 2026-09-04 as `bench-angular/`, and it retired four of
  the numbers it was built to reproduce.** `npm run bench:angular -- --repeat 5`; its own config
  carries the Angular plugin and stays out of `vitest.bench.config.mts`, so the core spy numbers
  remain free of the Angular transform. Two runs of five passes each, median of 60 reps, Node
  24.19.0, Angular 21. What it found:

  | figure | published | measured | verdict |
  | --- | ---: | ---: | --- |
  | `renderShallow` at 0 children | 1.2× | **0.95×** | **sign is wrong** — it is _slower_ on a childless component (0.447 vs 0.471 ms), which is what the prose always said and the number contradicted |
  | at 25 children | 1.8× | 1.73× | reproduces |
  | at 100 children | 5.7× | 4.50× | same order, ~21 % low |
  | at 400 children | 16.2× | **20.8×** | measures _higher_ |
  | full per-test cycle | 1.933 ms | **1.215 ms** | ~30 % low |
  | `createComponent` on an already-configured module | 1.987 ms | **1.049 ms** | absolutes do not reproduce; the _conclusion_ hardens — bed reuse buys ~14 %, not the 1.03× the published pair implied |
  | `keepTemplate: true` | 1.074 ms | 0.862 ms | closest of the lot; as a ratio the rung is 1.41–1.60×, not 1.80× |
  | `compileComponents()` on a standalone AOT bed | 0.137 ms | **0.005 ms** | 27× low — it is a no-op there; the conclusion is unaffected |

  The absolutes almost certainly differ because the original used a heavier child than this bench's
  one-element/one-binding one. Making the child heavier would move them toward the published
  figures, which is exactly the wrong move; the child stayed minimal and is documented as such.

- [~] **The Angular plugin does not process `input()` initializers in a `.bench.ts` file.** One of
      the two traps the Angular bench cost a rebuild to find, and the one that stays: `setInput`
      fails with `NG0303`, and the first draft silently reported the JIT warm-up order as a per-size
      curve. Adding `include: ['**/bench-angular/**/*.bench.ts']` to the plugin options does not
      help, so the bench uses four host classes with literal row counts instead — a workaround in
      this repository for a limitation that is not in it. The other trap — `--update` stamping the
      self-benchmark's command over `bench-angular/baseline.json` — is fixed: `--update` now carries
      `generated.command` and `generated.note` forward and `--command "<text>"` sets the line when
      the recipe changes.

- [~] **A `@testing-library/angular` migration note — shipped 2026-09-04** as
  `docs-site/migrating-testing-library-angular.md`, with every claim re-verified by running the
  published module rather than restated. Both defects hold in 19.4.2 at the same two lines: a
  3-method class yields **13 own keys**, `hasOwnProperty` and `toString` come back as spies,
  `String(mock)` is `"undefined"`, and a getter reads `undefined`. Three things the survey did not
  have: `@testing-library/angular/jest-utils` is the same file with `jest.fn()`, so the defects are
  runner-independent; the `./zoneless` entry in 19.2.0 is confirmed by diffing the export maps of
  19.1.1 and 19.2.0; and zoneless `render` is a **reduced** API — no `rerender`, `detectChanges`,
  `navigate`, `autoDetectChanges`, `routes`, `componentProperties`, or the change-detecting
  `fireEvent` wrapper.

  **Correction to the entry above, which was wrong: `@suites/unit` was never "missing from
  `comparison.md` entirely".** It is in the live-field table, in both feature-by-feature tables, has
  its own `## NestJS` section and an entry in the "where another library is better" list; so do
  ng-mocks and `@testing-library/angular`. Do not re-open on that premise. What the page really
  needed, and got: links to the new page, a corrected `vitest-when` row (0.10.2, 2026-09-03,
  repoints its `exports` map at the files it ships — the standing "pin 0.10.0" advice is now wrong;
  take 0.10.2, skip 0.10.1), and a broken markdown table repaired. `format:check` covers only
  `src/**/*.ts`, so a broken table in a docs page is caught by nothing in the gate.

  The "five over a year, and a sixth's repository is gone" line re-verified against the registry on
  2026-09-04 — ts-auto-mock 740 days, testdouble 896, moq.ts 1220, `@fluffy-spoon/substitute` 1945,
  `@golevelup/nestjs-testing` 2486, plus `@ngneat/spectator` at 306 days with the 404 repo. Note for
  the next pass: **`jest-auto-spies` is at 346 days and crosses the year mark in September 2026.**

