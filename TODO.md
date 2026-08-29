# TODO — refactoring & analysis

Audit of `vitest-auto-spy` (v1.3.0). The core is already cleanly layered (IoC
`MockAdapter` / `ObservableSupport` registries, one factory reused by the
class-based and type-based paths). Items below are ordered by value. Status
markers: `[x]` done in this pass, `[ ]` backlog, `[~]` considered & intentionally
skipped.

## Correctness / quality gate

- [x] **Restore 100% coverage** — `auto-mock.ts` Proxy traps `has` / `ownKeys` /
      `getOwnPropertyDescriptor` (lines 71–83) had no tests, so `npm run
test:coverage` (and therefore CI's `Test + coverage` step) was **red**
      at 98.34% on this branch. Added trap-exercising specs. The `set` trap was
      already covered by the "assign a plain property" test.
- [x] **`npm run check` now enforces the coverage gate** — it ran `npm test`
      (no coverage), so the 100% threshold was silently bypassed locally while
      CI ran `test:coverage`. Switched `check` to `test:coverage` so a local
      `check` matches CI. (Re-verified 2026-08-29: `check` had drifted back to
      `npm run test` at some point and was silently bypassing the gate again.
      Switched back, and this time the gate caught two real uncovered branches
      the same session.)

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

- [x] **`expectEmission` cannot subscribe to an Angular `output()`.** Fixed and verified in source:
      `CallbackSubscribable<T>` is the first overload of all three entry points, and
      `subscribeToSource` branches on `typeof source.pipe === 'function'` — an rxjs source gets the
      observer object (so `error` / `complete` still report), everything else gets a hybrid
      observer that is also a bare callback. No rxjs import was added.
      Original finding: `SubscribableLike`
      (`lib/expect-emission.ts:23-25`) requires an _observer object_, and the helper passes one at
      `:92`. Angular's `OutputRef.subscribe` takes a **callback**, so Angular stores the object and
      later invokes it: `TypeError: listenerFn is not a function`, thrown internally and swallowed.
      The watchdog at `:85-90` then rejects with `… did not emit within 200 ms (0 emission(s)
received). Either the stream never fired — check the trigger and any provider spy feeding it`
      — **blaming the component for a defect in the helper**, which is the exact failure this
      module's docstring (`:2-9`) exists to abolish. Fix, no new dependency: an rxjs `Observable`
      has `pipe` and an `OutputEmitterRef` does not, so branch on `typeof source.pipe === 'function'`
      in `subscribeAndCollect` (`:64-92`) and send an observer or a bare callback accordingly;
      widen the three entry points (`:148`, `:166`, `:186`) to `OutputRefLike<T> |
SubscribableLike<T>`. `error` / `complete` are unreachable for an `OutputRef`, so nothing is
      lost. Not `outputToObservable` — that would pull rxjs into a module deliberately kept
      duck-typed and rxjs-free.
- [x] **`stable(fixture)` deadlocks on a pending `HttpClient` request.** Shipped: `stable` now takes
      `{ timeout = 2000, label }` and races `fixture.whenStable()` against a real timer captured at
      import (so fake timers cannot stop the watchdog — the same reason `expect-emission.ts` captures
      its own). On expiry it throws the cause, naming the fixture and both things that produce it (an
      unflushed request, a real timer), instead of letting the runner report a file-level timeout.
      `{ timeout: 0 }` restores the unbounded wait.

      **Correction to the finding, measured on the same Angular 21.2.17 zoneless TestBed:** the
      deadlock does **not** reproduce under `provideHttpClientTesting`. With one `HttpClient.get` in
      flight both `fixture.whenStable()` and `ApplicationRef.whenStable()` resolve immediately — the
      testing backend registers no pending task. Whatever produced the original 800 ms / 600 ms
      measurement, it was not the testing backend on this version. The timeout is worth having on its
      own merits (a real backend, a `PendingTasks` entry nothing completes, a `setInterval` under
      real timers all still hang), but the headline claim was not reproducible and should not be
      repeated in the docs.

- [x] **The `httpResource` example in `lib/event-loop.ts:91-95` does not work.** Fixed from both
      ends. `settleResource` shipped (see below), and `event-loop.ts` no longer claims the use case:
      the example is now an SDK handshake, and both places that named `httpResource` say plainly that
      this helper never ticks and point at `settleResource`. Re-measured while doing it, and the
      sequence is one step shorter than the finding says: after `flush()` the resource needs **one
      microtask** to reach `resolved` — the extra tick is not required.
- [x] **`serializeValue` is exponential on shared (non-circular) substructure.** Fixed: identity
      memoisation (`Map<object, string>`) beside the cycle-guard `WeakSet`, both now carried in one
      `SerializeContext`. Re-measured on the same diamond: depth 16 36.97 ms → **0.63 ms**, depth 18
      118.72 ms → **1.25 ms**, depth 20 1 124 ms → **5.01 ms** (224×). One subtlety the fix had to
      handle and the finding did not name: a rendering containing `[Circular]` depends on the path
      that produced it, so a subtree that emitted a back-edge is deliberately kept out of the cache.
      Output is byte-identical either way; covered by a deterministic getter-read-count spec rather
      than a timing one. Original finding: `serializeObject`
      does `seen.add(v)` … `seen.delete(v)`, so an object reachable by two paths is serialised
      twice. Measured on a diamond: depth 16 → 65 536 nodes / 36.97 ms; depth 18 → 262 144 /
      118.72 ms; **depth 20 → 41 distinct objects become 1 048 576 serialised nodes, a 12.6 MB key
      and 1 124 ms**. Cycles are handled; DAGs are not — and a normalised store slice, a shared
      config object or any tree with repeated nodes is a DAG. Fix: memoise by identity
      (`Map<object, string>` beside the existing `WeakSet`); output stays byte-identical for
      non-shared input.
- [x] **`bench/auto-spy.bench.ts` measures the garbage collector.** Fixed: every case now ends with
      `pruneMockRegistry()`, so the registry never holds more than one iteration's worth and each
      case starts from the heap the previous one started from. The prune had to go _inside_ the
      timed body — Vitest runs **no** hooks in benchmark mode (`beforeAll` / `beforeEach` /
      `afterAll` in a `describe` are all silently skipped, verified) and `bench()`'s third argument
      is tinybench's bench-level `Options`, not its per-task `FnOptions`. Cost is one `Set.delete`
      per mock created (~50 ns against ~1.9 µs to create it). Two consecutive runs after the fix
      reproduce every case within **1.00–1.16×** (the worst was 569× before), and the 40-method /
      3-called row now reports the **7.48× lazy** win the docs publish. Timing table in
      `docs-site/core/performance.md` re-taken. Original finding: `@vitest/spy` holds every mock
      ever created in a module-level strong `Set` (`REGISTERED_MOCKS`); 20 000 eager 10-method spies
      retain 972 MB, and after dropping every reference and forcing GC **0.0% is collected**. Each
      bench case therefore allocates into a monotonically growing heap, and `p75` reports whether a
      major GC landed inside the sample. Two consecutive unmodified runs: `createAutoMock + 4
accesses` moved **569×** (5.0680 ms → 0.0089 ms), and run 1's summary reported "eager
      **272.67× faster** than lazy" for the 40-method case the docs publish as a 7× _lazy_ win. Fix:
      call this package's own `pruneMockRegistry()` (or `vi.clearAllMocks()`) between cases, then
      re-take the timing table in `docs-site/core/performance.md`. The memory table there is
      unaffected and reproduces (40-method / 2-touched lazy: 18 354 B × 2000 = 36.7 MB vs 35.4 MB
      published).
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

- [x] **`resetAutoSpy` does not reach into `mockDeep` children.** Fixed: `collectMocks` is now a
      visitor that treats an assembled spy as a container (own keys) and a mock as a leaf _except_
      when it is a `mockDeep` node, which is both. The children live in a closure and are
      deliberately absent from `Object.keys`, so the node publishes them through one new symbol seam
      (`DEEP_CHILDREN` in `spy-mark.ts`, answered before the `get` trap's symbol guard) that a spec
      cannot see. Worse than reported, in fact: a `mockDeep` root is a _function_, so the own-key
      walk found nothing at any depth and `resetAutoSpy(api)` reset nothing at all. Original
      finding: It walks own keys one level
      (`lib/reset-auto-spy.ts:43`), so a nested deep-mock keeps its configuration across tests.
      `vitest-mock-extended`'s `mockReset` recurses; this reads as a bug rather than a design choice.

## Field findings — consumer monorepo merge, 2026-08-29

Reported from a consumer, not from this repo: merging four months of `master` into an Angular
monorepo whose suite (1 725 spec files, 12 152 tests) had already moved to Vitest. Thirty-one specs
arrived in Jest style and had to be converted by hand, which is what surfaced these. Each one below
was hit and reproduced there; none is reproduced in this repo's own tests yet, so treat the
file:line references as pointing at _this_ library's code and the error text as evidence from the
consumer. Docs for the migration half of this list have landed in
`docs-site/migrating.md` ("Reading a spy back out of the container", "The type names", and three
new rows in the no-twin table).

- [ ] **`Cannot redefine property` says nothing about why, and the docs only cover the quiet half.**
      `migrating.md` already warns that `vi.mock` of a bundled barrel is a silent no-op. The loud
      half is what people hit _next_, when they work around the silence by reaching for a spy:
      `vi.spyOn(domainMetrics, 'injectDomainMetrics')` → `TypeError: Cannot redefine property:
injectDomainMetrics`, thrown by `Object.defineProperty` with no mention of bundling, of the
      module, or of the way out. Cost three separate diagnoses in one afternoon on the same suite —
      two by people, one by an agent that walked into it independently. This library already owns the
      `spyOn` seam through its adapters and already has `lib/docs-links.ts` for exactly this kind of
      redirect: catch the `TypeError`, re-throw it naming the module and pointing at the
      "provide a real seam" recipe. The silent `vi.mock` case deserves the same treatment if a
      factory registered for a bare specifier can be observed never to have run.
- [ ] **No helper for the seam that replaces a barrel mock.** The assertion a module mock is usually
      standing in for — _which collaborators did this entry point actually ask for_ — is answerable
      through DI without touching the module boundary: a provider factory runs exactly when something
      injects its token. Written out by hand it is nine lines of `providers.map(token => ({ provide:
token, useFactory: … }))` pushing into an array, and on the suite above it got written twice in
      one afternoon and was wanted a third time. Candidate for `/angular`: providers plus the ordered
      record of which tokens DI constructed. Nothing about it is Angular-specific except the provider
      shape, so check whether the nestjs entry wants the same thing before settling the API.
- [ ] **A `Spy<T>` passed where `T` is expected produces a message about private fields.**
      `adjustSubscriptionDetails(navigationTimingService, …)` → `TS2345: Argument of type
'Spy<NavigationTimingService>' is not assignable to parameter of type 'NavigationTimingService'.
Type 'Spy<NavigationTimingService>' is missing the following properties: active,
pendingStartTime, visitedRoutes, routerSubscription, and 12 more.` The fix is `asInstance`, and
      the message never says so. This is exactly the failure shape `no-mocked-for-spy` already
      rescues people from, pointed the other way — and that rule's wording ("a list of private field
      names that says nothing about the real problem, which is the declaration") is the model. A rule
      over a `Spy<T>`-typed identifier in an argument position where `T` is expected, fixable to
      `asInstance(spy)`, meets the fix bar in `lib/eslint/rules.ts:12-19`: it is decidable from the
      declaration in the same file and cannot change run-time behaviour.
- [ ] **`mockImplementation()` with no argument is a compile error Jest never had.** Jest installed a
      no-op; Vitest requires the function, so every carried-over call is `TS2554: Expected 1
arguments, but got 0` — four of them in one file on the suite above. Mechanical fix to
      `mockImplementation(() => undefined)`. Documented now as a row in `migrating.md`; worth a rule
      only if the codemod below does not land, since the compiler catches it in any suite with a type
      gate and misses it entirely in one without.
- [ ] **The migration codemod does not exist, and two of its steps are this library's knowledge.**
      `migrating.md` closes with a note on verifying a glob-editing codemod by matching rather than
      diffing, but ships no codemod. The generic `jest.*` → `vi.*` half exists in a dozen
      half-finished gists. Two steps do not exist anywhere: splitting
      `import { createSpyFromClass, provideAutoSpy, Spy } from 'jest-auto-spies'` into the root and
      `/angular` entries, and rewriting `TestBed.inject(X) as Spy<X>` to `asSpy(TestBed.inject(X))`.
      Both are decidable from the file. The trap that makes a hand-rolled codemod dangerous is
      `jest.Mock<R, [A]>` → `Mock<(a: A) => R>`: Jest puts the return type first, Vitest takes a call
      signature, and a rename that leaves the arguments in place compiles into the reverse meaning.
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

- [ ] **A spied method accepts arguments the real one would reject.** Found while writing the type
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

- [ ] **`no-overridden-provider` earns a suggestion for the exact-duplicate case.** First field data
      for it: 20 hits across an 8 673-file workspace on its first run there, and they split in two.
      Most are literal duplicates — `[provideAutoSpy(KidsModeService), …, provideAutoSpy(KidsModeService)]`
      — where deleting the earlier one cannot change behaviour, since Angular already ignored it. The
      rest are the interesting kind: an earlier `provideAutoSpy(AccountService, { … })` carrying
      `gettersToSpyOn` and `instanceMethodsToSpyOn`, overridden by a later bare
      `provideAutoSpy(AccountService)`, so the
      double the spec configured is not the double it got, and the assertions run against a poorer spy.
      The rule reports both identically today. Worth splitting: a suggestion (not a `--fix` — deletion
      is not safe unattended) for the textually identical pair, and wording for the other that says the
      surviving provider is the _barer_ one, because that is the case where the test is quietly
      checking something else. The existing message names the token; naming which of the two survives
      is what makes it actionable.

- [ ] **`no-mocked-for-spy --fix` leaves the file uncompilable when the double is a `vi.fn()`
      literal.** The rule rewrites the _declaration_ — `Mocked<T>` → `Spy<T>` — and stops there, but
      the creation site a few lines below is often an object literal the new type does not accept:

      ```ts
      let register: Spy<Pick<Registry, 'metrics'>> & { contentType: string };
      register = { contentType: '…', metrics: vi.fn().mockResolvedValue(payload) };
      // TS2322: Type 'Mock<Procedure>' is not assignable to type
      //   'AddSpyMethodsByReturnTypes<() => Promise<string>>'
      ```

      Ran into it on a real file: `eslint --fix` reported clean, and the type gate then failed. That
      is the worst shape for an autofix — the rule's own check passes, so nothing points back at it.
      `meta.fixable` is documented in `lib/eslint/rules.ts:12-19` as "decidable from the declaration
      in the same file", and this case shows the declaration alone is not enough: whether the fix
      compiles depends on where the value comes from. Two ways out, and the second is probably right:
      make the fix a **suggestion** whenever the initialiser in scope is not a library factory, or
      teach it to rewrite the creation site too (`createAutoMock<T>()` for a literal of spies), which
      is the edit a person makes anyway. Either way the rule should not be able to hand back code
      that does not type-check.

- [ ] **`globalFakeTimers` fakes `setImmediate`, and that turns an Express 404 into a 30 s hang.**
      Found while chasing an unrelated flake, and the symptom points nowhere near the cause. Express's
      router ends an unmatched request through `setImmediate(done, layerError)`
      (`router/index.js:203`); with the fake clock installed that callback is queued and never
      drained, so a request that should come back `404` sits until the test times out. Nobody reading
      `Test timed out in 30000ms` on an HTTP call goes looking for a routing mistake — the natural
      reading is a hung socket.

      Not a defect in the option, which fakes the right set for the reason it documents, but a gap in
      what it says about itself. Three things close it: name `setImmediate` as the one whose absence
      is felt outside timer code; say that a suite driving a real HTTP handler wants it out of
      `toFake`; and give the recipe next to that, because the alternative people reach for first —
      `vi.useRealTimers()` inside the file — is exactly what the guarded arming exists to prevent.

- [ ] **A rule for the spread that only fails under a bundler: `no-import-time-spread`.** Same suite,
      three days later: `Spread syntax requires ...iterable[Symbol.iterator] to be a function`, a
      `TypeError` thrown while the spec bundle loads, on a tree whose every test passes. The shape is
      `export const webosEvents = [...BaseEvents]` at module scope, where `BaseEvents` is a value
      imported from another module. Under `tsc` and under a browser's ESM loader this is safe —
      the importing module never runs before its dependency. Inside one bundle it is not: the chunk
      can be evaluated while the binding is still `undefined`, and `[...undefined]` throws. Same
      root cause as the barrel-initialisation note already in `migrating.md`, but the symptom names
      neither a module nor a barrel, so nothing connects the two. An AST scan for module-level
      `SpreadElement`s whose operand is an imported identifier — skipping function bodies, which run
      later — found exactly seven sites in an 8 673-file workspace, two of them spreading a workspace
      barrel. Probing all seven cleared them: none fired while the failure kept reproducing, so this
      particular flake is not explained by any of them, and the rule is worth having on its own terms
      rather than as a fix for it. That is a small enough population to flag at the cursor, and it is
      decidable from the imports in the same file, so it clears the bar in `lib/eslint/rules.ts:12-19`.
      It cannot carry a `--fix` (the safe rewrite depends on whether the operand is a constant that
      can be inlined or a value that must be read lazily), but it can carry a suggestion and a link.

- [ ] **`isolate: false` hides missing providers, and the setup file that patches `TestBed` is why.**
      The consumer's setup appends one DI provider to every `configureTestingModule` call, installed
      once per worker behind a flag. Under `isolate: false` that patch outlives the file that asked
      for it, so specs in unrelated libraries silently inherit a provider they never declared: two of
      them passed locally for weeks and failed the moment the run isolated (`npm test`, where
      coverage forces isolation), with `NG0201: No provider found`. The general shape — a spec that
      only passes because a neighbour in the worker configured the container — is worth a paragraph
      wherever this library documents running without isolation, next to the note below. Cheap check
      to suggest there: any suite with a shared `TestBed` patch should be run isolated once before
      it is trusted, because that is the run CI makes.

- [ ] **A load-time failure under `isolate: false` is reported against every file in the worker, with
      no stack.** Worth a paragraph wherever this library documents running without isolation, because
      it makes triage read backwards. On the suite above, four consecutive full runs of an unchanged
      tree reported 0, 95, 104 and 151 failed _files_ while the failed _test_ count stayed at zero —
      the number tracks how many spec files happened to share the worker that died, not how much is
      broken. The intersection of the failed lists across runs was **empty**, which is the tell: no
      file in those lists is the culprit. Two further traps found while chasing it: Vitest 4 collapses
      the identical unhandled error to a single message line with no stack and no originating module,
      and `json` reporter output carries the same bare message (`assertionResults: []`), so neither
      channel names the file. The triage rule that does work is the one this library can state: fix
      only files that failed on their own assertions, then re-run.

## Duplication removal (DRY — repo enforces jscpd threshold 0)

- [x] **Vitest-adapter registration was copy-pasted across 6 entries**
      (`index`, `angular`, `nestjs`, `react`, `vue`, `svelte`): each repeated
      `import { registerMockAdapter } … import { vitestMockAdapter } …
registerMockAdapter(vitestMockAdapter)` plus a near-identical comment.
      Extracted a single side-effect module `lib/use-vitest-adapter.ts`; every
      Vitest entry now does `import './lib/use-vitest-adapter';`. One source of
      truth for "this entry runs on Vitest".
- [x] **`provideAutoSpy` value-provider construction duplicated** between
      `lib/angular.ts` and `lib/nestjs.ts` (identical
      `{ provide, useValue: createSpyFromClass(...) }`). Extracted
      `lib/class-value-provider.ts`; both adapters and their public
      `AngularValueProvider` / `NestValueProvider` types derive from it.

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

- [x] **CommonJS output cut to the two entries where `require()` works.** Eight of the twelve `.cjs`
      files threw on their own first line (Vitest refuses to be required), and esbuild cannot
      code-split CommonJS, so each surviving bundle carried a private copy of the `MockAdapter` /
      `ObservableSupport` registries — `require('…/rxjs')` next to `require('…/node')` failed with
      "Observable spies require rxjs". Kept: `node` (self-contained, used alone) and `eslint-plugin`
      (no registry). Folded `bun-angular` into the shared ESM pass, which removed its inlined copy
      of the core. `dist/` 625 kB → 241 kB, tarball 187 kB → 108 kB.
- [x] **`bench/auto-spy.bench.ts` compared the lazy path against itself.** Its "eager" case was
      `createSpyFromClass(WideService)` with no config, and `lazySpies` defaults to `true` — so the
      reported "1.79x faster" (±84% rme) measured noise. Rewritten to pass both options explicitly
      and to sweep class width against methods actually called, which is what the default trades on.
- [x] **`vitest.shared-env.config.mts` carried dead configuration.** `test.poolOptions` was removed
      in Vitest 4 — it logged `was removed in Vitest 4` on every run and was ignored. The top-level
      `fileParallelism: false` already covers it.
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

- [x] **Pre-serialise `calledWith` config args at `set()` time.** Shipped. `MatcherConfig` now
      carries a `serialized` array rendered once in `set()`; positions holding an asymmetric matcher
      stay `undefined` and dispatch to `asymmetricMatch` as before. Re-measured on this machine
      rather than reusing the original figure — the absolute numbers differ, the ratio does not:
      an asymmetric config whose other arg is a 200-key object went **27.32 µs → 14.26 µs per call,
      1.92×**, which is the predicted 2×. Output unchanged, and pinned by a spec that counts config
      reads through a getter (one read at `set()`, none across three lookups) rather than by a
      timing assertion. Original finding: The exact map needs nothing: dispatch is flat 186–237 ns from 1 to 100 configs, and
      the `#arities` guard turns a 1 000-key object passed to a differently-shaped config into
      **145 ns** instead of 145.89 µs.
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
- [x] **`node.d.cts` → a thin re-export of its own ESM twin.** Shipped in
      `scripts/thin-node-cts.mjs`, run from `npm run build` after `tsup`. It had grown to
      **~94 kB / 1 829 lines** since the finding was written — the largest file in the package by a
      wide margin — because the CJS pass is a second tsup config object and `rollup-dts` inlines the
      whole surface again, where `dist/node.d.ts` says the same thing in seven re-export lines by
      sharing the emitted chunks. Now **3.9 kB**. Measured against published 3.7.0 and including
      everything else added this cycle: `dist` 712 → 640 kB, tarball **260 → 238 kB**; on the same
      export surface it was 232 kB, i.e. −10.8% against the −11.9% predicted.

      **The proposed shape does not compile, and neither does the obvious alternative** — measured
      with a `.cts` consumer that uses both a value and a type:

      | shape | result |
      | --- | --- |
      | `export * from './node.js'` | TS1479 — a CJS file cannot `require` an ESM one |
      | `export type * from './node.js'` | TS1479 as well, with no `resolution-mode` |
      | `import type * as N` + `export = N` | values fine, **every type alias lost** (TS2305 on `Spy`) |
      | `export type * … with { 'resolution-mode': 'import' }` | types fine, **values become type-only** (TS1362) |

      "Type-only re-exports cross the boundary freely" is true and is only half a declaration file:
      a CJS consumer calling `createSpyFromClass` needs the *value*. What works is both halves at
      once — one `export type *` carrying every type, and the values re-declared by name against the
      same namespace (`export declare const x: typeof Entry.x`), the list read from the built ESM
      module's own runtime exports so it cannot drift from what `node.cjs` provides. Verified clean
      on `node16` **and** `nodenext`, with `verbatimModuleSyntax` off **and** on, plus a real
      `require('./dist/node.cjs')` round-trip.

      `eslint-plugin.d.cts` was measured and deliberately left alone: 5 906 B, no external imports,
      and a default-only export whose CJS interop is not worth disturbing for 5 kB.
- [x] **What the published bundle-size number actually measures — recorded so the next scare is
      short.** bundlephobia's version chart makes 3.7.0 look like a step change; it is not. Measured
      from the published tarballs with bundlephobia's own method (esbuild, minify, gzip, peers
      external): **3.4.0 10.8 kB → 3.5.0 12.5 → 3.6.0 12.5 → 3.7.0 12.7 kB gzip.** The one real step
      is 3.4.0 → 3.5.0, and 3.7.0 adds 0.2 kB.

      More to the point, **that number is the whole barrel and nobody imports the whole barrel.**
      Bundling a consumer that imports only `createSpyFromClass` against the shipped `dist/index.js`
      costs **5.1 kB gzip / 14.8 kB raw, 19 modules** — the root entry tree-shakes, and every module
      left in the minimal path is one the factory genuinely needs. Adding `createAutoMock` moves it
      by nothing. The 12.7 kB figure is `export *`, which is the shape bundlephobia measures and no
      spec writes.

      And this is a **devDependency**: none of it reaches a production bundle, which is why
      `tsup.config.ts` refuses to minify in the first place. The two costs that are real are install
      weight (addressed above — tarball is now 232 kB) and per-spec import time (the item below).

- [ ] **De-chunk `dist/index.js` and `dist/angular.js` only.** Importing the root entry costs
      **5.9 ms per spec file** (150 identical trivial specs, `isolate: true`, single worker:
      full 1.88–2.03 s vs base 1.06–1.07 s), and the cost is **module count, not code volume** — the
      same 58.8 kB bundled into one module costs 0.1 ms/file. For a 1000-file suite that is ~5.9 s
      of aggregate import work. `angular` (11 modules / 52.8 kB) is the second-worst entry and every
      Angular consumer imports it alongside `index` (10 modules / 61.9 kB). Keep the stateful
      modules (`mock-adapter`, `observable-support`, `package-identity`) as one shared chunk — that
      invariant is what produced `"Observable spies require rxjs"` last pass — and inline the rest
      into those two entries only, ≈ +70 kB of `dist`.
- [ ] **Document the two drain-on-teardown buffers.** `lib/stray-rejections.ts`'s `captured` is
      unbounded and holds each rejection reason (an `Error` with its stack, and through it the whole
      async closure chain); `lib/prop-mock.ts`'s `globalThis.__vitestAutoSpyPatchedProps__` is the
      same shape. Both are drained by `setupAutoSpy`'s `afterEach`, so the supported path is safe; a
      hand-wired `trackStrayRejections()` read only through `countStrayRejections()` accumulates for
      the worker's life. Docs line, not a code change. Cosmetic sibling: the legacy string form of
      `setTimeout` is added to `stray-timers.ts`'s `handles` but never wrapped with `forgetting`, so
      its handle is never removed — it skews `countStrayTimers`, nothing more.
- [x] **`pruneMockRegistry()` verified in real Vitest.** `pool: 'forks'`, `--expose-gc`, 5 000 eager
      10-method spies = 50 000 mocks: `heldBytes` 243 232 168 → `retainedAfterPrune` 2 267 632.
      **99.1% released**, registry 50 000 → 0. No caveat found.
- [x] **No leak in this package's own code.** Nine modules audited: `create-spy-from-class` caches
      are `WeakMap` keyed on prototype, `mock-registry` is a `WeakSet`, `install-per-test` drops its
      handle in `afterEach`, `global-patch-guard` holds bounded strings, `mock-deep` and
      `package-identity` are bounded. The only 100%-retention leak in the process belongs to
      `@vitest/spy`, and `pruneMockRegistry()` releases 99.1% of it.

Measured this pass and rejected — do not re-open without new evidence:

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
  overhead, so subpath splitting buys ~0.1 ms/file where de-chunking buys ~5.8 ms/file. The move
  is to split **less**, not more.
- [~] **Full de-chunking of all 14 entries.** 569 607 B of standalone ESM against the 140 970 B
  shipped today (**+429 kB**), undoing the previous pass, and it breaks the single-registry
  invariant. Only `index` and `angular` are worth the trade.
- [~] **Optimising the `ArgsMap` exact map** — already optimal (flat 186–237 ns from 1 to 100
  configs; the `#arities` guard is the best thing in the file).
- [x] **Caching the `autoSpyAccessors` walk harder** — already `WeakMap`-cached per prototype
      (`accessorNamesCache`), so nothing to do in code. The stale line in
      `docs-site/core/performance.md` that called the walk uncached is now corrected.
- [~] **Dropping `AGENTS.md` from `files`.** `README.md` + `AGENTS.md` are 187 847 B raw /
  57 908 B gzip = **29.3% of every install**, and dropping `AGENTS.md` alone is −12.6%. Measured
  and offered, not recommended: it is what an agent in a consumer repo reads with no network,
  and "ship code with all surfaces" makes keeping it a deliberate product decision.

## Release infrastructure — move npm publishing to OIDC (deadline ~Jan 2027)

npm is retiring granular access tokens with **Bypass 2FA** — exactly the kind of
token both publishing workflows use today (`NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`
in `.github/workflows/auto-release.yml` and `.github/workflows/release.yml`).

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

- [ ] **Register the trusted publisher on npmjs.com.** Requires an interactive
      2FA challenge, so it cannot be scripted: package `vitest-auto-spy` →
      Settings → Trusted Publisher → GitHub Actions; owner `ASDAlexey`, repo
      `vitest-auto-spy`, workflow file `auto-release.yml` (with the extension),
      environment left empty, action `npm publish`.
- [ ] **Decide what happens to `release.yml`.** The publisher config names one
      workflow file, so two publishing workflows cannot both authenticate over
      OIDC unless npm accepts a second entry. Either reduce `release.yml` to
      creating the GitHub Release for a pushed tag, or drop it and leave
      `auto-release.yml` as the single publishing path.
- [ ] **Strip the token from the workflows** — remove the
      `env: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` block from the publish
      step. `permissions: id-token: write` is already set in both files, and
      that is all OIDC needs.
- [ ] **Check the toolchain floor** — trusted publishing needs npm >= 11.5.1 and
      Node >= 22.14. Node is pinned to 24; `npm i -g npm@11` currently resolves
      above 11.5.1, but pin an exact version so a floating 11.x cannot drift
      below the floor.
- [ ] **Drop `--provenance`** — under OIDC, provenance attestations are
      generated automatically for a public package from a public repo. The flag
      is harmless but no longer carries meaning.
- [ ] **Clean up after the first green OIDC release** — delete the `NPM_TOKEN`
      repo secret and revoke the token on npm. Only after a real publish has
      succeeded without it; the "skip if version already exists" guard in both
      workflows makes a retry safe.
- [ ] **Update the workflow header comments** — both files still state
      "Requires an `NPM_TOKEN` repo secret (an npm Automation or granular token
      that bypasses 2FA)".

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
- [ ] **`prefer-as-instance` as a lint rule with an autofix.** `Spy<T>` in a position that expects
      `T` cannot be seen in the AST: it is a _type_ relationship, so the rule needs
      `parserServices.program` — type-aware linting, which requires the consumer to set
      `parserOptions.project` and pays a full type-check per lint run. This plugin is deliberately
      type-free (`rule-types.ts` declares the ESTree slice it uses and imports no `eslint` or
      `typescript` types), so adding one type-aware rule would change what the plugin needs from
      every consumer that loads `configs.recommended`. If it is added, it belongs in a second,
      opt-in config (`configs.typeChecked`) and needs its own test setup: `RuleTester` with a real
      `tsconfig` and files on disk. Until then `asInstances(...)` is the answer to the cost of the
      repair, if not to finding it.
- [ ] **`NO_ERRORS_SCHEMA` next to a standalone component is a dead entry.** Schemas apply to a
      testing module's `declarations`; a standalone component carries its own. Detecting it needs a
      wrapper around `TestBed.configureTestingModule` that inspects the config — the mechanism
      already exists here (`instrumentTestBed` wraps exactly that method), but the natural home is an
      opt-in `enableAngularDiagnostics()` grouping it with `assertNgModuleScopes`, and that grouping
      is the design decision, not the code. The `toHaveDirectiveApplied` failure already says it in
      the one place people meet the problem.
- [ ] **A `toEqualRecords` matcher on top of `diffByField`.** Unchanged from the previous pass:
      `diffByField` is a plain function because it is reached for _after_ a failure, and a matcher
      would carry its own deep equality and compete with `toEqual` at every call site.
- [ ] **`overrideComponentProvider` could verify that the override applied.** It queues the component
      with the TestBed compiler, which removes the usual cause of a silent no-op, but does not assert
      afterwards that the injector resolved the spy.

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

- [x] **`mockResourceProp(object, property, initialValue)` — shipped** in `lib/resource-prop.ts`,
      exported from `/angular`. Returns `{ set, fail, loading, reload, resource }` and installs a
      double built from real `signal()`s, so a `computed()` downstream recomputes exactly as it does
      against a real resource. Two shape decisions worth recording: `isLoading` is a `computed()`
      rather than a plain arrow, because Angular's `Signal<T>` is branded and a bare function is not
      assignable to it; and the double deliberately omits `asReadonly` / `destroy` / `update`, which
      a *consumer* never calls — a double that answers a call nobody should make is how a typo
      survives a run. `resource` is exposed beyond the four members the finding named, because
      asserting on the installed double is the other half of driving it. Starts `'resolved'` at
      `initialValue`; `fail()` takes a string or an `Error`.
- [x] **`settleResource(resource, { turns = 20, label })` — S.** Shipped in
      `lib/settle-resource.ts`, exported from `/angular` and `/bun-angular`. Duck-typed on
      `{ status(): string }`, so `@angular/core` stays an optional peer and a hand-built double
      works. Re-measured rather than taken on trust: `httpResource` settles in **1** round after its
      flush, a plain `resource()` in **2** — the finding says one for both. `error` and `idle` end
      the wait too (waiting for either is waiting for something that cannot happen). One correction
      to the shape: a `flushEffects()` still has to come _before_ the flush, because an
      `httpResource` issues no request until something ticks and there is nothing for `expectOne` to
      find until then — `settleResource` cannot absorb that step, and its docstring says so.
- [x] **`stable(fixture, { timeout = 2000, label })` — S.** Shipped, with the caveat recorded under
      the live defect above: the specific `HttpClient` deadlock that motivated it does not reproduce
      under `provideHttpClientTesting` on Angular 21.2.17, so the message names the causes without
      claiming that one. Original item: Race `fixture.whenStable()` against a
      real timer — the `setTimer` pattern already in `lib/expect-emission.ts:44-45`, captured at
      import so fake timers cannot stop it — and on expiry throw the cause instead of letting the
      runner report a 5 s file-level timeout: _"the fixture was still unstable after 2000 ms. A
      pending HttpClient request keeps it unstable, and under `provideHttpClientTesting` only the
      spec can complete one — flush it before awaiting, or use `settleResource()`."_ This is the
      shape the earlier `settled(fixture)` item said it would have to take ("it belongs behind an
      option on `stable`"); the measurement is the missing argument. Angular 22 (2026-06-03) making
      components default to `OnPush` adds to it.
- [ ] **`provideHttpTesting()` + `expectRequest(url).flush(body)` — M, and it costs a peer.**
      Collapses the measured six-step dance (tick → inject controller → `expectOne` → flush →
      microtask → tick) into two lines, with `flush` returning a promise so the caller cannot get
      the settle wrong. The objection, stated plainly: it needs `@angular/common/http/testing`,
      which is **not a peer today** — a second optional peer (`@angular/common`). The precedent and
      the lazy-load strategy both exist, but it is a scope decision, which is why it ranks below the
      three items that need nothing new.
- [x] **`registerResourceMatchers()` — shipped** in `lib/resource-matchers.ts`, exported from
      `/angular`. The load-bearing behaviour is one the finding did not name: `toHaveResourceValue`
      **fails a resource that has not resolved even when its default value matches**, which is the
      assertion the whole family exists to stop passing, and the failure says which status it was in
      and names the flush. `toHaveResourceError` takes an optional substring or `RegExp`.
      Duck-typed on `{ status, value, error }` with `error` optional, so a hand-built double works;
      anything that is not a resource gets its own message rather than a `TypeError`, because the
      two ways to get there — passing `products.value()` instead of `products`, and passing a
      property that was never a resource — are both silent.
- [ ] **`enableAngularDiagnostics()` — M.** The grouping the earlier `NO_ERRORS_SCHEMA` item left
      open now has four members, which settles it: `ngModuleScopes` (apply `assertNgModuleScopes`
      automatically), `deadSchemas` (a `NO_ERRORS_SCHEMA` next to a standalone component is a dead
      entry), `unspiedProviders` (raise the `injectSpy` warning to a failure), `pendingRequests`
      (fail a test that ends with unflushed `HttpTestingController` requests). `instrumentTestBed`
      (`lib/testbed-diagnostics.ts:107-109`) already wraps `configureTestingModule`,
      `createComponent`, `compileComponents` and `overrideComponent` — this is a grouping and an
      opt-in, not new machinery.

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

- [ ] **Document the measured middle rung.** `renderShallow({ keepTemplate: true })` is **1.074 ms
      against 1.933 ms full — 1.8×** — because `buildOverride` (`lib/render-shallow.ts:88-102`)
      still applies `imports: options.keepChildren ?? []`, so the template renders while children
      resolve to nothing under `NO_ERRORS_SCHEMA`. Correct and intended, but the perf page presents
      `renderShallow` as all-or-nothing; keeping the template for `viewChild` and host bindings while
      still skipping the subtree is a real third option.
- [ ] **Document that `autoDetect` is zoneless-conditional.** Since Angular 19.0.0
      `autoDetectDefault = zonelessEnabled ? true : false`, so under zoneless it is **on by
      default**, while the docs present `detectChanges()` as something the spec must arrange — a
      zone-era description. Related deprecations in `@angular/core@21.2.17`: `autoDetectChanges()`
      at `types/testing.d.ts:112`, and `TestBed.flushEffects()` at `:498` in favour of
      `TestBed.tick()` at `:506` — which `lib/zoneless.ts:26-36` already prefers.
- [ ] **Rewrite the module-mock guidance: it is not the shared chunks, it is object spread.**
      Tested 2026-08-29 on a fixture of 11 spec files always collected in one run, on
      `@angular/build` 21.2.16 (splitting forced off at the mechanism level, byte-identical to what
      22.1.5 does) and on 22.1.6 (splitting forced back on). **Every cell produced the same result
      in both versions, and `splitting: false` fixed nothing** — it fixed no failing case and broke
      one that had passed.

      `vi.mock('@angular/core')` **does work**, with `TestBed` and app code in the graph, with all
      specs collected together, on the version this repo pins. The rule `CLAUDE.md` and
      `docs-site/adapters/angular.md` state as "`@angular/core` cannot be mocked at all" is wrong as
      an absolute; the real rule is narrower and is a one-line source fix: **a `vi.mock` factory must
      not use object spread.** Angular's builder unconditionally sets `'object-rest-spread': false`
      in `getFeatureSupport` — a deliberate V8 performance workaround (crbug/v8/11536) — so
      `{ ...actual, x }` always downlevels to a bundle-scope `__spreadValues` helper that the hoisted
      factory reaches before it is initialised. A modern `.browserslistrc` does not avoid it
      (tested). `Object.assign({}, actual, { x })` makes the identical mock pass. Splitting only
      decides which spelling of the same error you get: on → `Cannot access '__vi_import_1__' before
      initialization` (the helper lives in a shared chunk), off → `__spreadValues is not a function`
      (the helper is a module-scope `var`).

      Two things that are **permanently** true and should be stated as such: a relative
      `vi.mock('./x')` is blocked by an explicit builder guard — `unit-test/runners/vitest/build-options.js`
      injects a virtual entry `angular:vitest-mock-patch` that monkey-patches `vi.mock` and friends
      to throw on `/^[./]/` — so no build flag can ever change it; and, **new and worse**, a tsconfig
      **path alias slips past that regex and silently does nothing** — no throw, the real module is
      used, and the spec fails on a confusing assertion instead. That trap belongs next to the
      relative-path rule.

      The `splitting` option itself does not exist in any published `@angular/build` (checked
      21.2.16, 21.2.22, 22.0.0, 22.1.0–22.1.6, 22.2.0-next.5); on 21.x adding it to `angular.json`
      hard-fails schema validation. On 22.1.5/22.1.6 splitting is off unconditionally with no way to
      configure it. Cost of off, measured on the fixture: raw output **15.74 kB / 16 files → 22.48 kB
      / 13 files, +43%**, with a shared graph of two tiny modules — superlinear in shared-graph size,
      consistent with the 791 chunks / 596 MB seen at 784 specs. **The builder emits no warning in
      either mode.** Caveats on the experiment: the fixture is a toy (no components, no templates, no
      barrels, no `externalDependencies` — and `ignoreAnnotations: true` exists precisely because
      `"sideEffects": false` barrels misbehave across entry points with splitting off, which this
      fixture cannot have exercised), jsdom rather than happy-dom, and the shipped `splitting` option
      was never executed because it is unreleased.

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
- [~] **What to ship instead — three read-only pieces, no mutation.** (a) **shipped** as
      `angular-build-splitting-off`; (b) and (c) still open. A `doctor` check: detect an
      installed `@angular/build` in `[22.1.5, 22.1.7)` and report that the unit-test build has code
      splitting off, that `--coverage` will grow ~400 MB per spec with no plateau, and name both
      exits (upgrade to 22.1.7+ and set `"splitting": true`, or apply the patch). This is exactly
      the "a defect nothing consumes" niche the doctor exists for. (b) A `docs-site/adapters/angular.md`
      page. Note that the trade is **not** "memory against module mocking" — splitting off buys
      nothing for `vi.mock` (see the item above); what it buys is the live-binding / undefined-export
      class upstream turned it off for, and what it costs is 791 chunks / 596 MB and an
      OOM-under-coverage that no warning announces. Reproduce the patch script verbatim as a
      copy-pasteable escape hatch with a "delete this from 22.1.7" note. People will arrive at the
      page by searching the OOM. (c) Optionally a one-shot runtime notice from `setupAutoSpy`, in the same
      family as the duplicate-install report it already prints: read the builder's mode and say so
      once per run. Read-only, zero risk, and it fires in the session where it matters.

## `doctor` — a repository-level check for defects that never fail

**Shipped.** `npx vitest-auto-spy doctor`, non-zero exit, grouping the checks below. What they have
in common is that **nothing consumes them**: the run is green, and the only reader of a
`tsconfig.spec.json` after Jest is gone is somebody's editor. Each check is independent; the shared
part is a 15th tsup entry (`src/cli.ts`, ESM, shebang, `dts: false`, its own pass so it shares no
chunk with the core) behind `bin` in `package.json`. It imports nothing from the library — the core
loads Vitest, which refuses to be imported outside a test run.

Two invariants keep it honest, checked by `scripts/check-dist.mjs` on every `npm run build`: the
package declares no runtime `dependencies`, and `node:fs` appears only in `dist/cli.js` and
`dist/bun-angular.js` (the Bun preload inlines `templateUrl` from disk; nothing else may read one).

Docs: `docs-site/utilities/cli.md`, plus the README section and the `doctor` line in `AGENTS.md`
§19 and in the shipped skill's Finish block.

Still open on `doctor`:

- The `ts.parseJsonConfigFileContent` tier. The shipped glob matcher is self-contained and
  zero-dependency; the consumer's own `typescript` via `createRequire` would be the authority on
  `extends` chains and on the extension set an `include` entry expands over. Two patterns are
  exempt today rather than resolved properly: a declaration-only glob and one rooted in a directory
  the scan never enters.
- `helper-from-wrong-entry` and `no-unawaited-helper` — the two named below, both of which need a
  table generated from the installed version's own export map rather than a hand-written one.
- The other 43 checks of the sharpened catalogue.

- [x] **A spec that no tsconfig covers — shipped** as `tsconfig-glob-matches-nothing`, plus
      `tsconfig-file-missing` for a `files` entry that is gone. Found by a person opening a file and seeing
      `Cannot find name 'vi'` while `tsc --noEmit` reported zero errors: a migration codemod editing
      `include` had eaten `/**/*`, turning `src/**/*.spec.ts` into `src*.spec.ts` — a syntactically
      valid glob that matches nothing. Nine of 152 spec tsconfigs still covered their specs. The
      check: for every `tsconfig*.json`, expand `include` and report a pattern that matches no file.
- [x] **A non-spec file that imports a spec — shipped** as `spec-imported-by-non-spec`. Under a
      shared environment that is a cycle, and the spec loses its own suite.
- [x] **A spec that exports a fixture somebody imports — shipped** as `spec-exports-fixture`. The
      same defect from the other side; both fall out of one lexical import graph
      (`src/cli/checks/graph.ts`), built once per run and shared by every check that needs it.
- [x] **A foreign runner's pragma left in a spec — shipped** as `foreign-runner-pragma`
      (`@jest-environment`, `@jest-environment-options`, `@jest-config`). Vitest does
      not read them; the environment comes from the config, so the comment looks operative and is
      not.
- [x] **Orphan files referenced only by a removed runner config — shipped** as
      `dead-runner-config` (the jest/karma config itself, when neither package nor script mentions
      the runner) and `orphan-runner-file` (a path it references that still exists, is not a live
      `setupFiles` entry, and nothing imports). One of the three found this way had been empty since
      before the migration: a year as a setting that configured nothing.

Two of these (the import-cycle pair) overlap with the `no-shared-module-level-mock` lint rule, and
the overlap is not complete: the rule sees one file at a time, so it catches the _export_ but not
"and three files import it", and it cannot see a non-spec file importing a spec at all. That part
genuinely needs a repository-level pass.

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

- [x] **`npx vitest-auto-spy init`, on the same `bin` as `doctor` — shipped.** `src/cli.ts` is a
      15th ESM tsup entry with a shebang, importing nothing from the library core (Vitest refuses
      `require()`, and `init` writes files rather than creating spies). Tier 1, tier 2, the legacy
      refusal, the markers, `--check` / `--dry-run` / `--uninstall` and the Codex budget warning all
      landed as described below. **Not shipped:** the JSON/YAML targets (`.gemini/settings.json`,
      `.aider.conf.yml`) and therefore the sidecar manifest — a root `GEMINI.md` covers Gemini CLI
      without touching its settings, and every marker-carrying target is already found by its
      marker, so `--uninstall` needs no manifest. Add both only if a JSON target ever appears. - **Tier 1, always written:** a managed block in root `AGENTS.md` and root `CLAUDE.md`, plus
      `.claude/skills/vitest-auto-spy/SKILL.md` as a stub — the shipped skill's frontmatter copied
      verbatim (the description is what drives loading) over a body that points at
      `node_modules/vitest-auto-spy/AGENTS.md`, so it cannot go stale. `init --check` compares the
      stub's frontmatter against the shipped skill, the same CI pattern as `llms:check`. - **Tier 2, only when the tool's directory already exists**, glob-scoped so it costs no context
      on non-test tasks: `.cursor/rules/vitest-auto-spy.mdc` (`globs`, `alwaysApply: false`),
      `.github/instructions/vitest-auto-spy.instructions.md` (`applyTo`), `.devin/rules/` or
      `.windsurf/rules/` (`trigger: glob`, ≤12 000 chars), `.clinerules/` (`paths`). Their bodies
      are pointers, not copies — all of them read `AGENTS.md` anyway. - **Never create `.rules`, `.cursorrules`, `.windsurfrules` or `.clinerules`** (the legacy file
      forms). Zed resolves instructions **first-match-wins** over an ordered list ending in
      `AGENTS.md`, so creating any of them silently shadows the entire project's instructions.
      Append only if one already exists. - **Markers and idempotency:** `<!-- vitest-auto-spy:begin v=… sha=… -->` / `:end`, content
      between them fully regenerated, text outside never read or reformatted. JSON/YAML targets
      (`.gemini/settings.json`, `.aider.conf.yml`) take no markers — parse, set only our keys,
      record every touched path in a sidecar manifest so an `--uninstall` can be exact. - **The reason a CLI beats the paste-able snippet the README ships today:** `init` reads the
      consuming `package.json` and configs and **specialises the block** — which subpath matches
      this runner (`vitest-auto-spy` / `/bun` / `/bun-angular` / `/node`), which adapter matches
      the framework, the actual path of the setup file that needs `import 'vitest-auto-spy/rxjs'`,
      and it omits the rxjs bullet entirely when rxjs is absent. A hand-pasted snippet always
      states all of it and half of it is false for any given repo. - **Codex budget:** the whole root→cwd `AGENTS.md` chain is capped at `project_doc_max_bytes`,
      default **32 768 bytes**, and over-budget files are silently truncated. Target ≤1.6 kB for
      the block and warn when the resulting file crosses the cap. Nested `AGENTS.md` _below_ cwd
      are never read by Codex — only git-root down to cwd — so a monorepo needs the block in the
      package directory too.
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
- [ ] **Give four lint rules a fixer.** No rule declares `fixable` or `hasSuggestions` today.
      `fixable: 'code'` for `no-mocked-for-spy`; suggestions for `prefer-inject-spy`,
      `no-object-define-property` and the wrong-entry import. This is the cheapest lever on the
      whole adoption problem: an agent that runs `eslint --fix` converges on the library's idioms
      without reading a word of documentation. Not `no-done-callback` — the rewrite depends on the
      body, and a mechanical one turns a loud bug into a green test that runs even less of it.

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
  `npm run build` then `grep -rl proxy-zone dist/` must name `dist/zone.js` (and its `.d.ts`) and
  nothing else, `npm run size:badge` must not move for `dist/index.js`, and `package.json` must
  still declare no `dependencies`. A convenient re-export from the root would hand zone.js to every
  zoneless consumer, silently.

## Backlog (not in this pass)

- [ ] **`node:test` adapter ignores the `name` argument** of
      `createMockFn(impl, name)` — `node:test`'s `mock.fn()` has no `mockName`,
      so spy names are absent in `node:test` diagnostics (Vitest/Bun set them).
      Acceptable, but documenting the gap (or attaching a `displayName`) would
      make cross-runtime diagnostics uniform.
- [ ] **Expand `docs-site/comparison.md`** — the file already carries a TODO to
      link each competitor row and add a per-feature breakdown (see analysis
      below).

- [ ] **`using spy = createSpyFromClass(X)` via `Symbol.dispose`** — the one thing a newer runtime
      actually unlocks for this library. Attaching a `[Symbol.dispose]()` that calls `resetAutoSpy`
      is free on every supported version (Node defines the symbol since 18.18) and the `using`
      _syntax_ is the consumer's toolchain problem — esbuild/tsc downlevel it, and Node runs it
      natively from 24 (verified: 22 throws `SyntaxError`). Would remove the `afterEach` from specs
      that only exist to reset one spy. Not a performance item — a benchmark pass found no hot-path
      win from any newer built-in (see `docs-site/core/performance.md#which-node-version`).
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
  objects (mock-extended's `mockDeep`), and a documented per-feature comparison
  table (the `comparison.md` TODO).

## Field re-survey — 2026-08-29

Registry data for the window 2026-07-29 → 2026-08-27, typings read from published tarballs.
**Four of the seven rows in `comparison.md` are dead or dormant**, which is a stronger line than the
feature comparison and is not being made anywhere:

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

- [ ] **`vi.defineHelper` on every throw site — S.** Vitest 4.1's `defineHelper(fn)` exists so a
      wrapper's failure points at the _caller's_ line. This package throws from five places a user
      never opens: `errorHandler.throwArgumentsError`, the three `expectEmission` helpers,
      `assertMocked`, `narrow`, and the registered matchers — all of which currently open a file in
      `node_modules`. One wrap per entry, identity fallback off Vitest. Highest quality per line in
      this list, and nothing in the field has it.
- [ ] **`strict: true` / `onUnstubbedCall` — S.** Throw, naming class, method and args, when a method
      nobody configured is called. `vitest-mock-extended` has `fallbackMockImplementation`,
      `@golevelup` has `{ strict: true }`, testdouble is strict by default. The only tool here is
      `onlyMethodsToSpyOn`, which _deletes_ the method, so the failure reads `service.load is not a
function` — blaming the spy rather than the test. Biggest payoff exactly where this library is
      strongest: a wide service where one of forty methods was left unstubbed and `undefined`
      surfaces three frames later.
- [x] **`captureArg<T>()` — shipped** in `lib/capture-arg.ts`, exported from the root entry.
      Runtime-neutral as predicted; two things the finding had wrong, both found by testing rather
      than reasoning.

      **It must be a class, not an object literal.** Accessors in a literal are enumerable own
      properties, and the runner walks those when it serialises the expected side of an assertion —
      which read `.value` on a captor that had matched nothing and replaced a readable assertion
      failure with this helper's own throw. On a class the accessors sit on the prototype and are
      not enumerable, so a captor can be printed, diffed and logged without being read.

      **It does not belong in `calledWith`, and the types already say so.** The finding's "already
      routes through `ArgsMap#findByMatcher`" is true of the mechanism and wrong as a use: a captor
      matches every value, so `spy.load.calledWith(captor)` configures a return for *every* call —
      which is `mockReturnValue`, spelled less clearly. `calledWith` is typed to the method's own
      parameters, so it does not compile. `expect.any` type-checks there only because it returns
      `any`. Documented as assertion-only.

      Also: the last capture is boxed (`{ value: T } | undefined`) rather than read off the end of
      the array, so that capturing an actual `undefined` argument stays distinct from never having
      matched — without the non-null assertion the index access would otherwise need.
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
- [ ] **`explainSpy(spy, method?)` — M, and its first half is S.** `td.explain` and moq.ts's `dump`
      exist because the second-worst failure after "never stubbed" is "stubbed with the wrong
      arguments, so the default fired". Everything needed is already here — `ArgsMap` holds every
      config, `serializeValue` renders arbitrary values stably, `mock.calls` holds the invocations —
      it just is not readable. The S half is folding the same renderer into `errorHandler` so a
      `mustBeCalledWith` failure prints **both** sides: today `lib/error-handler.ts:15` prints only
      the actual arguments, where testdouble and sinon print wanted and actual.
- [ ] **`using spy = createSpyFromClass(X)` via `Symbol.dispose` — S.** Already in the backlog and
      the runner evidence has strengthened: `vi.spyOn` and `bun:test`'s `spyOn` both ship it (Bun
      1.3), node's mock timers gained it in 26.1/24.16, and `vi.doMock` now returns a `Disposable`.
      Attaching `[Symbol.dispose]() { resetAutoSpy(this) }` is free on every supported version and
      the `using` syntax is the consumer's toolchain problem.

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

- [ ] **A `/migrating` page aimed at `refactor-jasmine-vitest` output.** Show the codemod's
      `{ a: vi.fn(), b: vi.fn() }` expansion beside `createSpyFromClass(Service)`, and address both
      TODO cases explicitly — this library handles them _by construction_, because it reads the
      prototype instead of the call site. Also correct the record while there: Angular has not
      deprecated Karma (Karma's own maintainers added that notice in 2023); Vitest became the
      `ng new` default in 21.0.0, and 22.0.0 deprecated the webpack builder family and removed the
      experimental `:jest` and `:web-test-runner` builders.
