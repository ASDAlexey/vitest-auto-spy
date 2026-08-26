# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The latest released version here must always match the one published on
[npm](https://www.npmjs.com/package/vitest-auto-spy) and the latest `v*` git tag — see
[CONTRIBUTING.md → Releasing](./CONTRIBUTING.md#releasing) for how that stays in sync.

## [Unreleased]

### BREAKING CHANGES

- **`methodsToSpyOn` now adds instead of restricting**, which is what `jest-auto-spies` always did
  and what this library documented itself as being compatible with. Up to v1 an explicit list
  replaced prototype discovery, so a spec that named two methods silently lost every other one. The
  failure surfaced far from the cause — `TypeError: this.flags.readJsonFlag is not a function` inside
  a component constructor, with no line of the stack pointing at the spy configuration in the spec.
  In one migrated codebase a single component went from 147 failing tests out of 147 to 4 once the
  option was reinterpreted; across two independent projects the same option had been worked around
  739 and 572 times respectively.

  The exhaustive whitelist is still available, under a name that says what it does:

  ```diff
  - createSpyFromClass(ApiService, { methodsToSpyOn: ['get', 'post'] });   // v1: only these two
  + createSpyFromClass(ApiService, { onlyMethodsToSpyOn: ['get', 'post'] }); // v2: only these two
  ```

  **What to do.** If you migrated from `jest-auto-spies` and never thought about this option, do
  nothing — your specs now behave the way they did under Jest. If you relied on the restriction,
  rename the key to `onlyMethodsToSpyOn`; the array shorthand
  (`createSpyFromClass(Service, ['a', 'b'])`) is additive too and becomes
  `{ onlyMethodsToSpyOn: ['a', 'b'] }`. A grep for `methodsToSpyOn` finds every site, and leaving
  one un-renamed spies on more than before rather than less — noisier, never broken.

  `instanceMethodsToSpyOn` is unchanged and now behaves identically to `methodsToSpyOn`; the two
  differ only in what their names tell a reader. Prefer it in new code.

- **Lazy method spies are now the default for every factory**, not just for `provideAutoSpy`. A
  method becomes a spy on first access instead of all of them being built up front. On a forty-method
  class where a test touches two, holding two thousand spies costs **27 ms and 35 MB** instead of
  **257 ms and 425 MB** — nine times the speed, a twelfth of the memory. The reverse case, a test
  that calls every method, pays 5% in time and 1% in memory for the accessor indirection, and that
  asymmetry is why it is a default rather than a choice.

  Enumeration is unaffected — the placeholders are enumerable accessors, so `Object.keys`, spread and
  snapshots see the same keys, and `vi.isMockFunction`, `calledWith`, `resetAutoSpy` / `clearAutoSpy`
  all behave as before. What changes is the property *descriptor* of an untouched method: a getter
  rather than a value. A spec asserting on `Object.getOwnPropertyDescriptor(...).value` before
  touching the method needs `{ lazySpies: false }`.

  `provideAutoSpy` no longer forces the flag on, since the core does it — the Angular entry lost a
  wrapper function and the two paths are now the same speed.

- **The unknown-method warning moved to `onlyMethodsToSpyOn`.** An additive list naming something the
  prototype does not have is the documented way to reach an instance-assigned callable, so warning
  about it would fire on correct code. Under a restricting list the same typo is destructive — it
  leaves the real method unspied — so that is where the warning belongs.

### Added

- **`setupAutoSpy({ strayTimers: true })`** _(`/setup`)_ — cancel timeouts, intervals and animation
  frames that outlive the file that scheduled them. Under `isolate: false` a `setTimeout` a component
  never clears fires while a **later** file is mid-test, so the runner blames innocent code; the
  zoneless half is worse, because Angular's scheduler races a timeout against a frame callback and
  what surfaces is `Schedulers cannot synchronously execute watches while scheduling` or `signal read
  during notification phase`, again against the wrong file. The option wraps the four schedulers once
  per worker and sweeps in `afterAll`. `trackStrayTimers()` (idempotent, returns the undo),
  `cancelStrayTimers()` (returns how many it cancelled) and `countStrayTimers()` are exported for a
  suite that would rather fail on a leak than tidy it away; each takes an optional host, so a test can
  contain a stand-in instead of the real globals.
- **`runEffect(effectRef)`** _(`/angular`, `/bun-angular`)_ — run one `effect()` body on demand, with
  the signal values as they stand and without marking the effect clean. The alternative a project
  reaches for is replacing `effect()` via `vi.mock('@angular/core')`, which cannot work under the
  Angular unit-test builder: specs are bundled, `@angular/core` lands in a shared chunk, and
  substituting it re-enters that chunk mid-initialisation (`Cannot access '__vi_import_N__' before
  initialization`). Complements `flushEffects()`, which runs everything currently dirty — `runEffect`
  is for the effect whose trigger a spec replaced with a static signal, so it never becomes dirty. It
  reads Angular's reactive node, so it throws with "assert the result instead" if a future version
  moves the effect body.

- **Documentation written for AI agents**, because most tests are now written with one in the loop and
  a library an agent has to infer costs tokens on every task and produces the same mistakes each time:
  - **`AGENTS.md`, shipped inside the npm tarball** — readable at
    `node_modules/vitest-auto-spy/AGENTS.md` with no network, in the version actually installed. It is
    the compressed form of the docs, not a second copy of the README: entry-point table, the
    factory decision tree, the helper-per-return-type table, the configuration semantics (that
    `methodsToSpyOn` restricts while `instanceMethodsToSpyOn` adds), an **error→fix table**, and a
    do-not-write-this list covering the mistakes agents actually make — `let s: T = createSpyFromClass(T)`,
    `expect()` inside `subscribe()`, `Object.defineProperty` in a spec, `toBeTruthy()` on a signal.
  - **`llms.txt` and `llms-full.txt`** on the docs site
    ([`/llms.txt`](https://asdalexey.github.io/vitest-auto-spy/llms.txt),
    [`/llms-full.txt`](https://asdalexey.github.io/vitest-auto-spy/llms-full.txt)) — the
    [llmstxt.org](https://llmstxt.org) convention a crawler looks for at a docs root, so an agent
    fetches one page instead of scraping ten. Generated from the VitePress sidebar by
    `scripts/generate-llms-txt.mjs`, so a page missing from the sidebar is a **build error** rather
    than a silent omission, and checked in CI so the committed pair cannot go stale.
  - **A Claude Code skill and plugin** — `skills/vitest-auto-spy/SKILL.md` ships in the tarball, and
    the repository doubles as a plugin marketplace (`/plugin marketplace add ASDAlexey/vitest-auto-spy`).
    The manifests are version-synced to `package.json` by the `version` lifecycle script, so a bump
    cannot leave the skill advertising a release it does not describe.
  - **A "For AI agents" docs page** and a README section covering all of the above.
- **A "Spec patterns" page** _(docs site)_ — what a large Angular 22 zoneless suite (~370 spec files,
  on this library since early versions) actually converged on, with the frequencies, because the
  distribution is nothing like the API reference implies: `provideAutoSpy` in 371 files, `injectSpy`
  in 308, `mockReadonlyProp` in 127, `instanceMethodsToSpyOn` in 103, `observablePropsToSpyOn` in 79
  — and bare `createSpyFromClass` in only 41. It documents the canonical service spec, which signal
  helper to use for a dependency versus the class under test, the property-vs-method distinction for
  observables, and four traps that only appear at scale: reaching a **component-level** provider that
  `injectSpy` cannot see, why `vi.mock('@angular/core')` cannot work under the Angular unit-test
  builder, what an ngrx `rxMethod` needs beyond a bare mock, and timers that outlive their file under
  `isolate: false` and are then reported against an innocent one.
- **`@example` blocks on 38 public exports**, so the surface an agent reads most — `dist/*.d.ts`, on
  hover or on disk — teaches the call rather than only naming it.
- **`AGENTS.md` and the skill were reordered around that same measurement.** They led with
  `createSpyFromClass`, which is the least-used entry point in an Angular app; they now lead with the
  DI shape, promote `instanceMethodsToSpyOn` from a footnote to a top-5 option, and carry six more
  error→fix rows for the failures above — including the two that are reported against the wrong file
  (`Schedulers cannot synchronously execute watches while scheduling`, `signal read during
  notification phase`).

- **Observer stubs** _(core)_ — `stubIntersectionObserver()`, `stubResizeObserver()`,
  `stubMutationObserver()` and the generic `stubObserver(name)`, plus `intersectionEntry()` for the
  entry itself. A component constructs its observer internally and keeps it private, so the only
  handle a spec has is the global constructor; the version projects hand-roll goes wrong in two ways
  that this one does not. The stub is installed through `mockValueProp`, so `restoreMockedProps()`
  takes it off — a directly assigned `globalThis.IntersectionObserver` is inherited by the next file
  under `isolate: false` and fails it on something unrelated. And the instances live on the returned
  handle rather than a `static last`, which is shared mutable state that outlives the spec just like
  the stub does. `emit()` takes a batch, because a fast scroll delivers several entries in one call
  and code assuming one entry per call is a real bug worth reaching. Asking for `last` before the
  code under test constructed anything throws and says which of the two mistakes it is.
- **`mockSignalProp(object, prop, initial)`** _(`/angular`)_ — replace a signal-valued property with
  a real `WritableSignal` and get the handle back. Prototype discovery cannot see a `signal()` field
  (it is assigned on the instance) and `methodsToSpyOn` turns it into a function spy that answers
  `undefined`, so suites write the `signal()` + `mockReadonlyProp` pair by hand — measured at 46
  occurrences across three projects. The signal is Angular's own, so a `computed()` downstream
  recomputes and an `effect()` runs; a stand-in with a `set` method would satisfy `service.count()`
  and notify nothing, which is the failure the helper exists to prevent rather than cause.
- **`setupAutoSpy({ blockNetwork: true })`** _(`/setup`)_ — reject every `fetch`, naming what was
  requested. jsdom ships no `fetch`, so a component reaching for a remote asset is inert under it;
  happy-dom implements it and the same component issues real requests. Nothing asserts on them, so
  every test passes — and the runner aborts what is still in flight at teardown, those aborts arrive
  as unhandled rejections, and a run with 2257 green tests exits 1 with no test named. `blockNetwork()`
  is exported for suites that want it somewhere narrower.
- **`restoreTimerGlobals()` / `getWatchedTimerGlobals()`** _(`/setup`)_, wired into `setupAutoSpy()`
  by default and into `setupFakeTimers()` unconditionally.

### Fixed

- **`vitest.shared-env.config.mts` carried configuration Vitest 4 ignores.** It set
  `poolOptions: { threads: { singleThread: true } }`; `test.poolOptions` was removed in Vitest 4,
  which logged `was removed in Vitest 4` on every run and dropped it. The top-level
  `fileParallelism: false` already forces `maxWorkers` to 1, so the shared-environment run was
  correct — it just also printed a deprecation on every invocation.
- **The benchmark compared the lazy spy path against itself.** `bench/auto-spy.bench.ts` wrote its
  "eager" case as `createSpyFromClass(WideService)` with no configuration, and `lazySpies` defaults
  to `true` — so both branches were lazy and the reported "1.79x faster than lazy" was noise
  (±84% rme) guarding nothing. It now passes `lazySpies` explicitly on both sides and sweeps class
  width against how many methods a test actually calls, which is the trade the default is making.
  Measured that way, lazy wins from 1.8× (10 methods, 2 called) to 7× (40 methods, 3 called) and
  gives back ~10% only when a single test calls every method.
- **`setupFakeTimers()` no longer breaks a later file.** Two bugs in one helper. Its hooks were
  unguarded, so a suite that drives the clock itself — or a nested `describe` calling the helper
  again — reached a second `vi.useRealTimers()`, which leaves the environment without `clearInterval`
  and explodes during teardown of whichever file runs next. And uninstalling does not restore a
  global that was not an own property of the global object: under happy-dom `Date` is inherited from
  the realm, so `vi.useRealTimers()` **deletes** it, and with `isolate: false` the next file dies
  inside Vitest's own `useFakeTimers` with `Cannot read properties of undefined (reading 'now')`,
  naming a file that never touched a timer. Both hooks are now guarded, and the real globals —
  captured at import time, before any spec can fake them — are put back after each test. Only what
  went missing is restored, so a replacement a spec installed on purpose is left alone.
- **`calledWith` no longer depends on the order an object literal was written in.** Argument matching
  builds a serialized key, and object keys went into it in insertion order — so
  `calledWith({ id: 1, name: 'a' })` did not match a call made with `{ name: 'a', id: 1 }`. The spy
  answered `undefined` and nothing in the failure pointed at the cause. Keys are now sorted at every
  depth, which also makes `mustBeCalledWith` mismatch messages stable rather than dependent on
  construction order. Array order is untouched — there the order is the value.

### Changed

- **The published package is roughly half the size** — `dist/` 625 kB → 241 kB, tarball 187 kB →
  108 kB, 74 files → 54. CommonJS now ships only for `vitest-auto-spy/node` and
  `vitest-auto-spy/eslint-plugin`; every other subpath is ESM-only. Nothing that worked stopped
  working, because the removed output could not be loaded in the first place: Vitest refuses to be
  required (`Vitest cannot be imported in a CommonJS module using require()`), so eight of the twelve
  `.cjs` files threw on their own first line. The four that did load were not usable together
  either — esbuild cannot code-split CommonJS, so each `.cjs` carried a private copy of the
  `MockAdapter` / `ObservableSupport` registries and `require('vitest-auto-spy/rxjs')` alongside
  `require('vitest-auto-spy/node')` still failed with "Observable spies require rxjs". The two
  survivors are the two that are self-contained and genuinely reachable: a `node --test` suite
  written in CJS, and a CommonJS `eslint.config.cjs`. Separately, `bun-angular` moved into the same
  ESM pass as every other entry, so it shares the emitted chunks instead of inlining its own copy of
  the core (45 kB → 8 kB of JS, 43 kB → 7 kB of types). Subpaths that lost their `require` condition
  resolve through `default`, so a bundler asking for `require` still finds the ESM file rather than
  failing resolution.

- **Every error and warning now ends with `Docs: <url>`** — a stack trace is read far more often than
  a README, by a person at 2am and by an agent on every failed run, and a message that names its own
  fix is the difference between repairing the test and guessing at it. Covers the missing mock
  adapter, the missing rxjs layer, a method not found on the prototype, `advanceTimers()` without
  fake timers, a `bun-angular` preload with no DOM package, an unresolvable `templateUrl`, a
  `mustBeCalledWith` violation and the duplicate-install report. The unknown-method warning also now
  points at `instanceMethodsToSpyOn`, which is what it usually means. Costs ~0.4 kB minzipped on a
  dev-only dependency.

- **A "How it works" page** _(docs site)_ — the two ideas the library rests on, spelled out for
  someone deciding whether to trust it with their suite. The runtime half: the prototype-chain walk
  that discovers method names, why it stops before `Object.prototype`, why names come from property
  descriptors rather than from reading them (a getter would execute), and why the class is never
  constructed — which is what makes a service with five constructor dependencies mockable without
  mocking any of them. The type half: the conditional type that reads a method's return type to
  decide whether it gets `resolveWith`, `nextWith` or `mockReturnValue`. It also names the single
  `as` in the core and explains why it cannot be removed. Sits in Core between `Installation` and
  `createSpyFromClass`; the README's short "How it works (and what it won't spy)" links to it.

## [1.12.0] - 2026-08-26

### Added

- **`vitest-auto-spy/bun-angular`** _(new entry)_ — Angular's `TestBed` under `bun test`. Angular has
  no Bun integration of its own: Bun ships no DOM, and `@Component({ templateUrl: './x.html' })` is
  not an import, so the JIT compiler refuses to build the component ("Component X is not resolved").
  One preload closes both — it installs a DOM (`@happy-dom/global-registrator`, else `jsdom`, and
  nothing if one is already present), registers a `Bun.plugin` `onLoad` hook that inlines
  `templateUrl` / `styleUrl` / `styleUrls`, initialises a **zoneless** `TestBed` environment that
  resets after each test, and registers the Bun mock adapter:

  ```toml
  # bunfig.toml
  [test]
  preload = ["vitest-auto-spy/bun-angular"]
  ```

  `provideAutoSpy`, `injectSpy`, `renderShallow`, `createWithAutoSpies`, `stable` / `flushEffects`
  and the whole core behave exactly as on Vitest. `registerSignalMatchers` and the TestBed
  diagnostics family stay Vitest-only — they need the runner's `expect.extend` and suite-level hooks.
  The entry is ESM-only (it awaits its DOM registrar at the top level, which has no CommonJS form);
  Bun runs ESM natively, so nothing is lost. The building blocks — `registerDomGlobals`,
  `createJsdomRegistrar`, `createGlobalRegistratorRegistrar`, `copyWindowGlobals`,
  `inlineAngularResources` — are exported for a project that would rather compose its own preload.

- **A real Bun test suite** — `src/bun-tests/` runs the published API on the actual `bun:test`
  (core, rxjs layer, DOM registrars and Angular `TestBed`), where the Vitest suite could only drive
  the Bun adapter against a stub. CI gained a **Bun 1.4** job that runs it three ways — unflagged
  (one shared global), `--isolate` (Bun 1.4's fresh-global-per-file mode) and against the **built**
  `bun-angular` bundle used as a preload — on both `1.4.0` and `latest`.

- **`createMock<T>(partial?)`** _(core)_ — a plain, spy-free `T` built from the fields a test seeds,
  for the doubles the code under test only **reads**: DTOs, route snapshots, config objects. The
  counterpart to `createAutoMock`, which stays the answer for a collaborator you call and assert on
  (where an un-seeded property read returning a spy is the point, not a hazard). It is also the one
  place the `as` lives, so a suite under a `no-type-assertion` lint rule stops sprinkling
  `eslint-disable` over its fixtures; `Partial<T>` keeps the seeded fields type-checked.
- **`setupFakeTimers(config?)` / `advanceTimers(ms?)`** _(`/setup`)_ — the fake-timer boilerplate, and
  the bug inside it. `setupFakeTimers` pairs `vi.useFakeTimers()` with the `afterEach` restore a
  suite forgets — a clock left installed leaks into every later file in the same worker, surfacing as
  an unrelated test hanging on a `setTimeout` that never fires; `config` is forwarded verbatim to
  `vi.useFakeTimers()`. `advanceTimers` advances the clock **and** awaits the microtasks the timer
  callbacks queued (a resolved promise, an `await` continuation, an RxJS `delay()` handing control
  back), which a bare `vi.advanceTimersByTime()` leaves pending — the assertion then reads state from
  before the callback finished and fails like a race in the code under test. On real timers it throws
  a message naming the fix instead of failing deeper in with "timers are not mocked".

### Changed

- **The documentation site was rewritten end to end** — every `<!-- TODO: expand -->` stub is gone.
  The landing page leads with the four runtimes and Angular-on-Bun; `Installation` gained per-runner
  wiring (Vitest setup file, `bunfig.toml` preload, `node --test`) and a TypeScript section;
  `node:test` gained a runnable example and a table of where its native mock surface differs (most
  usefully: `spy.method.mockReturnValue` does **not** exist there, while
  `calledWith(...).mockReturnValue(...)` works everywhere); `createSpyFromClass` documents the
  `Spy<T>` shape, `accessorSpies`, `instanceMethodsToSpyOn` and the edge cases (inherited methods,
  abstract classes, constructors never running); the RxJS page documents marble-equivalent sequences
  and delay/timing semantics; and the React / Vue / Svelte / NestJS recipes and the migration guide
  are full walkthroughs rather than sketches. `comparison.md` gained a feature-by-feature matrix, a
  "where another library is the better answer" section, and dependency counts checked against npm.
  Every page now carries `title` / `description` frontmatter, so canonical links and OpenGraph tags
  are no longer empty.

### Fixed

- **`mockDeep` was unusable on `bun:test`** — every node handed its spy methods back with `this`
  still pointing at the Proxy, and Bun's `mock()` asserts `this instanceof Mock` inside
  `mockReturnValue` and friends, so `mock.a.b.mockReturnValue(1)` threw
  `Expected this to be instanceof Mock`. Methods are now bound to the underlying spy. Vitest was
  unaffected, which is why only a run on the real runtime could surface it.

## [1.11.0] - 2026-08-26

### Added

- **`renderShallow(Component, options?)`** _(`/angular`)_ — the `TestBed` sequence a component-heavy
  suite copy-pastes (`configureTestingModule` + `NO_ERRORS_SCHEMA` + `overrideComponent` with emptied
  `imports`, a blank template and no styles), as one call that returns a real `ComponentFixture`.
  Options: `providers` (incl. `EnvironmentProviders`), `imports`, `inputs` (signal inputs take the
  value), `keepTemplate`, `keepChildren`, `template`, `beforeCreate`, `detectChanges`.
  Measured on a private Angular 22 zoneless suite: converting three of its most expensive component specs took them from
  291 ms to 174 ms (1.7× overall; 2.1× and 1.8× on the two with a real child tree, 0.8× — slower —
  on a leaf component, where the per-test `overrideComponent` costs more than the subtree it removes).
- **`createWithAutoSpies(Class, options?)`** _(`/angular`)_ — build a service, store or pipe through
  real Angular DI with every unprovided token answered by a spy instead of a `NullInjectorError`.
  Constructor parameters and `inject()` fields both resolve; explicit `providers` win;
  `spies.get(token)` reads back what the instance actually used.
- **`stable(fixture)` / `flushEffects()`** _(`/angular`)_ — zoneless waiting. `detectChanges()` runs
  one pass and never flushes effects, so an assertion after it reads state that has not finished
  computing. `flushEffects` prefers `TestBed.tick()` (Angular ≥ 20) and falls back to
  `ApplicationRef.tick()`.
- **`expectEmission` / `expectEmissions` / `expectNoEmission`** — assert an Observable without a
  `subscribe` callback that may never run. The source is duck-typed, so these live in the core entry
  and pull in no rxjs, and the watchdog uses the timer functions captured at import time, so
  `vi.useFakeTimers()` cannot silence it.
- **`setupAutoSpy(options?)`** _(new `vitest-auto-spy/setup` entry)_ — one call for a project's test-run
  hygiene: `restoreMockedProps()` in a global `afterEach`, detection of a second copy of the library
  in the process (a duplicate install, or one install loaded as both ESM and CJS) with a report that
  says what to do, and opt-in `vi.restoreAllMocks()` for runs with `isolate: false`.
- **`enableTestBedDiagnostics(options?)`** _(`/angular`)_ — one line per spec file saying how much of
  its wall clock went into `TestBed` versus plain logic, and how many components it created. Also
  `instrumentTestBed`, `disableTestBedDiagnostics`, `getTestBedTiming`, `formatSpecTiming`,
  `reportSpecTiming`.
- **`vitest-auto-spy/eslint-plugin`** (new entry) — five flat-config rules that steer a suite onto
  these helpers: `prefer-provide-auto-spy`, `prefer-create-spy-from-class`, `prefer-inject-spy`,
  `no-object-define-property`, `no-expect-in-subscribe`. Every message links to the matching README
  recipe.
- **`registerSignalMatchers()`** _(`/angular`)_ — adds `expect(sig).toHaveSignalValue(value)`, which
  reads the signal and refuses anything that is not a zero-argument getter (unlike
  `expect(sig).toBeTruthy()`, which passes for every signal ever created).
- **`asInstance(spy)` / `asSpy(instance)`** — the two named views between `Spy<T>` and `T`, replacing
  the `as any` a mapped type forces at those boundaries. **`createSpyClass(Class, config?)`** — a spy
  that can be called with `new` (a `vi.fn()` refuses once it carries a `mockReturnValue`), recording
  `calls` and `instances`.
- **`countMockedProps()`** — how many `mock*Prop` patches are still applied.
- The property helpers (`mockReadonlyProp`, `mockReadonlyPropGetter`, `mockValueProp`,
  `mockAccessorsProp`, `restoreMockedProps`) are now exported from the **core** entry too. Nothing
  about them is Angular-specific; `vitest-auto-spy/angular` keeps exporting them unchanged.
- README gained a **"How to mock"** section: one recipe per thing a spec stands in for — a service
  behind DI, a service without DI, reading a spy back from DI, a whole class's dependencies, a
  readonly property or signal, an Observable, a component's children, a `new`-ed class, a pipe.
- The documentation site gained pages for everything above: **Observable assertions** and
  **Bridging `Spy<T>` and `T`** under Core, **Test-run hygiene** and **ESLint plugin** under
  Utilities, and an Angular page that now covers `renderShallow` (with the measured numbers),
  `createWithAutoSpies`, zoneless waiting, the signal matcher and the `TestBed` diagnostics.

### Fixed

- **`TestBed` diagnostics measured on a fake clock.** `vi.useFakeTimers()` replaces
  `performance.now`, so an instrumented spec reported "0 ms for 155 components". The clock is now
  captured at import time.
- **The diagnostics report was swallowed by the library's own console spies.** It went through
  `console.info`, which `vitest-auto-spy/console` replaces with a silent mock; it now writes to
  `process.stdout` and falls back to the console only where there is none.
- **Two specs could only pass with per-file isolation.** `core-standalone.spec.ts` and
  `mock-adapter.spec.ts` exercise an *empty* IoC registry, and relied on their file being the first
  to touch a process-wide one — so they failed under `isolate: false`, and `mock-adapter.spec.ts`
  additionally left a fake adapter installed for whatever ran next. Both now empty and restore the
  registry themselves (via internal `resetMockAdapter()` / `resetObservableSupport()`), and
  `npm run test:shared-env` runs the whole suite with `isolate: false` in a single worker — in CI
  too, so the mode `setupAutoSpy()` exists for stays proven rather than asserted.
- `src/lib/observable-spy.ts` was committed unformatted. Nothing caught it: CI ran type-check,
  coverage and build only, so `npm run lint` and `npm run format:check` never ran there. Both are
  now CI steps, alongside the shared-environment run.
- **`renderShallow` rejected `EnvironmentProviders`** — the shape every Angular `provide*()` helper
  returns (`provideHttpClient()`, `provideRouter()`, …). `TestBed` accepts them; the option type
  now does too.

## [1.10.0] - 2026-08-18

### Added

- **`instanceMethodsToSpyOn`** — spy callables that live on the *instance* instead of the prototype:
  arrow-function properties, Angular `signal()` / `computed()` fields, ngrx `signalStore()` methods.
  Prototype discovery cannot see them, and naming them in `methodsToSpyOn` was the wrong tool — that
  option *restricts* what is spied and reports the name as a probable typo. Names listed here are
  **added** on top of whatever the method resolution produced, and never warn.
- **`mockValueProp(obj, prop, value)`** — the writable counterpart of `mockReadonlyProp`, for members
  the code under test assigns to (and for stubbing a method on a real, non-spy instance).
- **`restoreMockedProps()`** — undoes every patch the `mock*Prop` helpers applied, newest first,
  restoring the original descriptor (or deleting the property when there was none). Needed whenever
  the patched object outlives the spec file — a global, a class prototype, a singleton — which is
  always the case under Vitest's `isolate: false`.
- The `mock*Prop` helpers now also accept a `PropertyKey` overload, so members the public type does
  not describe (`#private` fields, ad-hoc keys) no longer need an `as never` cast at the call site.
- Every `mock*Prop` helper **returns its own undo** (`RestoreProp`), for a stub that has to come off
  inside a single test rather than at the end of the file; calling it twice is a no-op.
- `mockAccessorsProp(obj, prop, { get, set })` takes real implementations behind the spied
  accessors — what a DOM property backed by an attribute (`input.valueAsNumber`, …) needs.

### Fixed

- **Lazy method spies are assignable again.** `provideAutoSpy` builds spies lazily, and the
  placeholder was a getter-only property, so the common `spy.method = vi.fn()` threw
  `TypeError: Cannot set property … which has only a getter` under ES-module strict mode. The
  placeholder now carries a setter that materializes the assigned value.

## [1.9.3] - 2026-08-01

### Changed

- **Published bundles are no longer minified.** `tsup` ran with `minify: true`, so every file in
  `dist/` shipped as a single unreadable line — which supply-chain scanners flag as unauditable
  code (Socket raised a `Minified code` alert on 1.9.2). The published output is now plain,
  readable JavaScript: the tarball grows from ~30 kB to ~47 kB and the unpacked size from ~190 kB
  to ~325 kB, which costs nothing at runtime — this is a dev-only dependency that never reaches a
  production bundle. No API or behaviour change.

## [1.9.2] - 2026-07-18

### Docs

- Redesigned the README hero (`assets/one-api-three-runtimes.svg`): the `Spy<UserService>` card now
  shows real typed methods mapped to their `resolveWith` / `nextWith` / `calledWith` helpers, the
  `createSpyFromClass(UserService)` call sits on a single line, and the runtime chips carry the
  Vitest / Bun / node:test brand marks and colors. Fixed a dark-mode grey halo (removed the blurred
  glow and the light drop-shadow), a badge that overflowed the card, and raw `<>` in `aria-label`
  that broke SVG parsing.
- Expanded the intro copy and search metadata for discoverability: the README and docs now name the
  full helper set (`resolveWith` / `rejectWith`, `nextWith` / `throwWith`, `calledWith` /
  `mustBeCalledWith`) plus `createAutoMock<T>()` and `mockDeep<T>()`, and added matching `package.json`
  keywords and docs-site meta keywords.

## [1.9.1] - 2026-07-18

### Docs

- Recolored the npm version and downloads badges from npm red to `brightgreen`, matching the
  coverage / Vitest / Bun / runtime-deps badges for a consistent badge row.

## [1.9.0] - 2026-07-18

### Added

- **`mockDeep<T>()` — recursive, class-free auto-mock.** The deep counterpart of `createAutoMock`:
  nested access auto-creates chainable spies, so `mock.repo.user.find()` works with no manual
  seeding — every hop is itself a callable spy carrying the full `calledWith` / `resolveWith` /
  `nextWith` surface. Seed concrete values via `overrides` or assignment.
- **`mock.settledResults` across every runtime.** Vitest tracks each mock call's eventual promise
  outcome natively; a built-in polyfill now provides the same `{ type, value }` array on Bun
  (`bun:test`) and `node:test`, so `spy.method.mock.settledResults` reads identically on all three.
- **Asymmetric matchers in `calledWith` / `mustBeCalledWith`.** A config may now include
  `expect.any(...)`, `expect.objectContaining({...})`, `expect.stringMatching(...)`, …; a config
  that contains a matcher is stored as a predicate and evaluated against the actual args on lookup.
- **`resetAutoSpy(spy)` / `clearAutoSpy(spy)`.** Reset every spy inside an assembled auto-spy in one
  call — `clearAutoSpy` drops recorded calls only, `resetAutoSpy` also reverts all configuration.
  Works on both `createSpyFromClass` spies and `createAutoMock` proxies, covering method and
  accessor spies alike (found by brand, never by triggering live accessors).
- **`lazySpies` / `autoSpyAccessors` config and friendlier diagnostics.** `lazySpies` materializes
  each method spy on first access (cheaper for wide classes); `autoSpyAccessors` auto-discovers
  every getter/setter on the prototype chain; `createSpyFromClass` now warns (without throwing) when
  a requested method name is absent from the class prototype.

### Changed

- **Performance — Angular spies are lazy by default.** `provideAutoSpy` now defaults to
  `lazySpies: true`: on a wide service where a test calls only a couple of methods, spy assembly is
  roughly **4× faster** (≈8× on a 20-method service). Behaviour is unchanged; pass
  `{ lazySpies: false }` to build every spy eagerly.
- **Performance — deferred observable subjects.** Observable spies no longer allocate their backing
  `ReplaySubject` until an observable helper is first used, so a sync/promise method spy created
  with the rxjs layer loaded skips that allocation.

### Fixed

- **`resetAutoSpy` reverts a bare `mockReturnValue`.** A return value set directly on a spy
  (`spy.method.mockReturnValue(x)`), not just library `calledWith` config, is now reverted on reset
  — via a new `MockAdapter` primitive that re-installs the library dispatch across Vitest, Bun and
  `node:test` (a plain `mockClear` could not, and a full `mockReset` would wipe the dispatch itself).

### Docs

- New **VitePress documentation site** deployed to GitHub Pages (with sitemap, canonical / Open Graph
  tags and JSON-LD for SEO), plus reference pages for `mockDeep`, `settledResults`, asymmetric
  matchers, `lazySpies` and the reset helpers. README updated to match.

## [1.8.2] - 2026-07-17

> README-only release — no code or API changes (a `fix:`-typed README commit cut a patch).

## [1.8.1] - 2026-07-17

> README-only release — no code or API changes (a `fix:`-typed README commit cut a patch).

## [1.8.0] - 2026-07-17

### Added

- **`returnValue()` alias on the `calledWith` / `mustBeCalledWith` chain.** The `jest-auto-spies`
  name `spy.method.calledWith(1).returnValue(x)` now works alongside `mockReturnValue`, so migrating
  from `jest-auto-spies` / `@bugsplat/vitest-auto-spies` is a pure import swap — no test rewrites.

### Changed

- **Performance:** `createSpyFromClass` caches each class's prototype method names in a `WeakMap`,
  so spying the same class in every `beforeEach` no longer re-walks the prototype chain.

### Docs

- Comparison tables (README + docs site) now cover `@bugsplat/vitest-auto-spies`, positioning this
  package as a superset (Bun / `node:test`, `createAutoMock`, framework recipes, console spies, zero
  runtime deps, rxjs 8). Migration guides document the `returnValue` alias, and two README SVG
  diagrams were added (a runtimes hero and an Angular `provideAutoSpy` recipe).

## [1.7.0] - 2026-07-04

### Added

- **Console spies — `vitest-auto-spy/console`.** A new entry point: importing it replaces
  `console.debug` / `error` / `info` / `log` / `time` / `timeEnd` / `trace` / `warn` with
  **silent, fully-typed spies**, each exported ready to assert — no `vi.spyOn(console, 'info')`
  boilerplate, no log output polluting the test run:

  ```ts
  import { consoleInfoSpy, consoleWarnSpy } from 'vitest-auto-spy/console';

  service.doWork();

  expect(consoleInfoSpy).toHaveBeenCalledWith('done');
  expect(consoleWarnSpy).not.toHaveBeenCalled();
  ```

  Housekeeping helpers: `resetConsoleSpies()` clears the recorded calls (Vitest's
  `clearMocks: true` already does this per test), `restoreConsole()` puts the original methods
  back, `installConsoleSpies()` re-installs after a restore (idempotent otherwise). The spies are
  built on the registered `MockAdapter`, so a runtime entry imported first (`…/bun`, `…/node`)
  drives them with that runner's mocks; with none, the default Vitest adapter is registered.
- **`hasMockAdapter()`** (internal seam) — lets non-runtime side-effect entries such as
  `…/console` register the default Vitest adapter only when no runtime entry already installed
  its own, instead of stomping it.

### Docs

- README: a dedicated **Utilities** section — a table of every standalone helper (`injectSpy`,
  `provideAutoSpy`, `createFunctionSpy`, `createAutoMock`, `createObservableWithValues`,
  `mockReadonlyProp` / `mockReadonlyPropGetter` / `mockAccessorsProp`, `errorHandler`, the console
  spies) with entry points and examples.
- Docs site: new **Utilities → Console spies** page; `createAutoMock` and the console spies added
  to the API reference.

## [1.5.1] - 2026-06-29

> README-only release — no code or API changes (the `fix:`-typed README commit cut a patch).

## [1.5.0] - 2026-06-28

> README-only release — no code or API changes. Published as a **minor** because the README commit
> was typed `feat:`; included here for an honest, gap-free history.

## [1.4.0] - 2026-06-28

### Added

- **Framework adapters — NestJS, React, Vue/Pinia, Svelte.** Four new entry points over the same
  core, each importing **nothing** from its framework (helpers are structural, frameworks stay
  optional consumer-side peers):
  - `vitest-auto-spy/nestjs` — `provideAutoSpy` (the `{ provide, useValue }` shape `Test.createTestingModule` consumes) and `injectSpy(moduleRef, token)` typed as `Spy<T>`.
  - `vitest-auto-spy/vue` — `provideAutoSpy(token, Class)` returning `{ [token]: Spy<T> }` for `@vue/test-utils`' `global.provide`, plus class-based Pinia store spying.
  - `vitest-auto-spy/react` and `vitest-auto-spy/svelte` — natural import paths over the core for spying class-based services/stores in those suites.
- **`createAutoMock<T>()` — auto-mock by type/interface (no class).** A `Proxy`-based factory that
  builds a fully-typed `Spy<T>` from a TypeScript type alone, materializing each accessed method as
  a decorated spy lazily (cached by key) with the **same** return-type-aware control helpers as
  `createSpyFromClass`. Optional `overrides` seed concrete property values/implementations.
- **Bun & `node:test` runtimes** — two new entry points that run the exact same core on a
  non-Vitest runner: `vitest-auto-spy/bun` (Bun's `bun:test` mocks) and `vitest-auto-spy/node`
  (`node:test`'s `mock.fn()`). Public API is identical to the Vitest entry; only native mock
  methods differ by runner (the auto-spy helpers are normalised). Built on the `MockAdapter`
  seam below.

### Changed

- **`MockAdapter` seam — the core no longer imports `vitest`.** The single `vi.fn()` /
  `vi.spyOn()` dependency now lives behind a registered `MockAdapter` (the same inversion-of-control
  pattern as the rxjs decouple). `vitest-auto-spy` registers the default Vitest adapter on import,
  so existing usage is unchanged and stays zero-config — verified at the bundle level (only
  `vitest-adapter` references `vitest`; the rest of the core does not). This unblocks future
  non-Vitest entries (`vitest-auto-spy/bun`, `…/node`) over the same core.

### Docs

- README leads with the runtime-agnostic, multi-framework story: runtime-support badges, a
  competitor comparison table, a `createAutoMock` section, and a **Framework adapters** section
  (NestJS/React/Vue/Svelte ahead of Angular). npm keywords lead with `auto-mock` / `class-mock` /
  `typed-mock` instead of `angular`.

## [1.3.0] - 2026-06-24

> Maintenance release — no user-facing or API changes. Published as a **minor** because the
> maintenance commit was typed `feat:`; it ships no new feature, included here for an honest,
> gap-free history.

### Removed

- Internal planning docs (`docs/`) are no longer tracked in the repository; they are now
  local-only working notes (`/docs/` is git-ignored). The published npm package is unaffected
  (`docs/` was never part of the tarball).

## [1.2.0] - 2026-06-24

> ⚠️ **Heads up:** this version carries a breaking import-surface change (subpath entries) but
> was published as a **minor** bump, not a major. Pin to `1.1.x` if you cannot move
> observable/Angular imports to their subpaths yet.

### Added

- **Framework-agnostic core with opt-in subpath entry points** (`vitest-auto-spy`,
  `vitest-auto-spy/rxjs`, `vitest-auto-spy/angular`). The core no longer references rxjs or
  Angular at runtime — verified at the bundle level (`dist/index.*` requires only `vitest`).
  A plain Node / Bun / React / Vue project pulls in neither rxjs nor Angular.
- Inversion-of-control observable registry (`lib/observable-support.ts`): importing
  `vitest-auto-spy/rxjs` registers the observable helpers; using observable spies without it
  throws an actionable hint. `rxjs` and `@angular/core` are now **optional** peer dependencies
  (`peerDependenciesMeta`).
- Dependency-free arg serializer (`lib/serialize-args.ts`) reproducing the
  `javascript-stringify` output the library relied on (single-quoted strings, distinct
  `undefined`/function/symbol/BigInt/Date renderings, circular-ref safety).

### Changed

- **BREAKING:** observable helpers (`createObservableWithValues`, `observablePropsToSpyOn`,
  `nextWith`, …) now live under `vitest-auto-spy/rxjs`, and the Angular helpers
  (`provideAutoSpy`, `injectSpy`, `mock*`) under `vitest-auto-spy/angular`. Update imports
  accordingly (see the README "Entry points" table). The sync/promise/accessor core API is
  unchanged.
- Build: drop shipped sourcemaps (`sourcemap: false`) and minify (`minify: true`); multi-entry
  tsup output. Published tarball ~29.4 kB → ~13.7 kB compressed (131 kB → ~49 kB unpacked).
- Removed the `javascript-stringify` runtime dependency — the package now has **zero runtime
  dependencies**.

### Fixed

- **Coverage gate now measures the real implementation.** Since the `auto-spy` → `lib/*`
  module split, `coverage.include` pointed at the empty re-export barrel, so the "100%"
  threshold was vacuous (0/0). It now covers `src/lib/**` + the barrel and genuinely holds at
  100% lines/branches/functions/statements.
- Observable-property `nextWith` / `complete` after `nextWithValues` keep operating on the
  backing `Subject` (previously a type-lie reassigned the subject to a merged observable).
- `createSpyFromClass(Service, ['a', 'b'])` now **restricts** spying to the listed methods
  (matching `jest-auto-spies`) instead of augmenting the auto-discovered set.
- Per-call delay handling unified: `resolveWithPerCall` delays are now baked into the wrapped
  promise at configuration time (the same way `nextWithPerCall` already bakes observable
  delays), removing a dead Promise-vs-Observable branch in the call path.

## [1.1.0] - 2026-06-23

### Added

- Strict TypeScript config: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
  `noPropertyAccessFromIndexSignature`, `noUncheckedSideEffectImports`, `isolatedModules`,
  `useUnknownInCatchVariables`, `allowUnreachableCode: false`, `allowUnusedLabels: false`.
- ESLint (`.eslintrc.cjs`) + Prettier (`.prettierrc`) toolchain, distilled to the rules
  relevant for a TypeScript library (`@typescript-eslint` strictness, `no-explicit-any`,
  `consistent-type-assertions: never`, `no-non-null-assertion`, rxjs hygiene, eslint-comments
  discipline, regex optimisation).
- `jscpd` duplicate-detection at threshold 0 (`.jscpd.json`).
- npm scripts: `lint`, `lint:fix`, `format`, `format:check`, `jscpd`, `check`.
- Shared `spy-decoration` helper, removing the copy-pasted promise/observable decoration
  blocks (jscpd reports 0 clones).
- Automated releases from Conventional Commits (`.github/workflows/auto-release.yml`) and a
  GitHub Release on tag push (`.github/workflows/release.yml`).

### Changed

- Split the monolithic `auto-spy.ts` into focused `src/lib/**` modules (accessor / function /
  observable / promise spies, arg-map, error handler, types).
- Hardened the entire `src/lib/**` type surface against the strict config: replaced `any`
  with `unknown` + narrowing wherever possible, removed unnecessary `as` casts, and replaced
  non-null assertions with real guards. Remaining `any`/casts are limited to load-bearing
  generic-inference spots, each carrying a justified `eslint-disable` description.

## [1.0.1] - 2026-06-21

### Added

- `engines`, `publishConfig` and expanded npm keywords in `package.json`.
- Issue / pull-request templates, badges, and a `jest-auto-spies` migration guide in the README.
- CI test matrix across Node LTS versions; standalone npm release workflow.

### Fixed

- Synced `package-lock.json` with `package.json` so `npm ci` matches the lockfile.

## [1.0.0] - 2026-06-21

### Added

- Initial public release — a Vitest-powered, drop-in replacement for `jest-auto-spies`.
- `createSpyFromClass` with array and config-object overloads
  (`methodsToSpyOn`, `observablePropsToSpyOn`, `gettersToSpyOn`, `settersToSpyOn`).
- Sync helpers: `mockReturnValue`, `calledWith`, `mustBeCalledWith`.
- Promise helpers: `resolveWith`, `rejectWith`, `resolveWithPerCall`.
- Observable helpers: `nextWith`, `nextOneTimeWith`, `nextWithValues`,
  `nextWithPerCall`, `throwWith`, `complete`, `returnSubject`.
- Getter/setter spies via `accessorSpies`.
- Angular helpers `provideAutoSpy` and `injectSpy` (work with both zoneless and zone.js).
- Standalone `createObservableWithValues` and `createFunctionSpy`.
- Readonly/signal property mockers: `mockReadonlyProp`, `mockReadonlyPropGetter`,
  `mockAccessorsProp`.
- Dual ESM + CJS build with type declarations; 100% test coverage.

[Unreleased]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.12.0...HEAD
[1.12.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.9.3...v1.10.0
[1.9.3]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.9.2...v1.9.3
[1.9.2]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.9.1...v1.9.2
[1.9.1]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.9.0...v1.9.1
[1.9.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.8.2...v1.9.0
[1.8.2]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.8.1...v1.8.2
[1.8.1]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.5.1...v1.7.0
[1.5.1]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/ASDAlexey/vitest-auto-spy/releases/tag/v1.0.0
