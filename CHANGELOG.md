# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The latest released version here must always match the one published on
[npm](https://www.npmjs.com/package/vitest-auto-spy) and the latest `v*` git tag — see
[CONTRIBUTING.md → Releasing](./CONTRIBUTING.md#releasing) for how that stays in sync.

## [Unreleased]

### Added

- **`registerAutoSpyDefaults` takes an `InjectionToken` — from `vitest-auto-spy/angular`.** The
  registry reached classes only, so a double behind a token was assembled again in every file that
  provided it — the drift the registry had removed for classes. On a consumer suite of ~1 760 spec
  files one logger token was provided in 63 files through 35 distinct provider lines, a navigation
  token in 77 files through 39, and 197 `returns` entries of `undefined` for token doubles were
  repeated across 117 files. The `/angular` export adds a token overload over the very same registry,
  and `provideAutoSpyForToken(TOKEN)` reads it the way `provideAutoSpy(Class)` reads a class's: its
  seeds and its configuration are merged over the registration — lists unioned, `returns` and
  `overrides` key by key with the call site winning, scalars decided by the call site — and a
  registered `returns` stays a default a later `calledWith` / `resolveWith` wins over. A token row is
  an `AutoSpyTokenDefaults<T>`: what `createAutoMock` takes (`returns`, `selfReturning`,
  `observablePropsToSpyOn`, `strict`, `name`) plus `overrides`, every key checked against the token's
  `T`. The table form mixes class rows and token rows, each checked against its own key, and
  `clearAutoSpyDefaults(TOKEN)` from the same entry drops one. The core export stays class-only — the
  core entry may not name Angular's types — so a token handed to it is `TS2345 … not assignable to
  parameter of type 'ClassType<unknown>'`, and the repair is the import.

- **`selfReturning: ['channel']` — a method that answers the double itself.** The link a chained call
  needs is the one `returns` cannot spell, because the double does not exist when the literal is
  written: `inject(LOGGER).channel('auth').debug('…')` in a constructor died on `undefined` unless the
  spec seeded `channel` with `vi.fn().mockReturnThis()` after the factory — 29 times in 27 files of
  the same consumer, plus two near-identical hand-written logger factories, and neither form fits a
  registration or a `providers: []` array. `selfReturning` is a list on every factory's configuration
  (`createSpyFromClass`, `createSpyFromInstance` — where the answer is the instance —, `createAutoMock`,
  `autoMocked`, `provideAutoSpy`, `provideAutoSpyForToken`, a registration). It installs the same
  default `returns` does, so it counts as configured under `strict`, a later `calledWith` /
  `mockReturnValue` still wins and `resetAutoSpy` clears it; a method also named in `returns` answers
  that value, which is how a spec takes one link out of a registered chain, since lists only union. A
  name that is not a spied method is reported as `selfReturning names 'x'`, like `returns`. The name
  and the idea are `mockDeep`'s `{ selfReturning: true }`, narrowed to the methods that chain.

- **`no-unknown-use-value-key`: each key of an object `useValue` literal is checked against the
  provided type.** Angular types `useValue` as `any`, so `{ provide: ActivatedRoute, useValue: {
  queryParams$: of({}) } }` compiles for a class with no `queryParams$`, the code under test reads the
  real member, and the spec stays green over a fixture nothing reads. The consumer carries about 870
  object `useValue` literals, 375 of them for class providers and 495 for tokens; a hand count over 434
  class literals found two keys the class does not have, that `queryParams$` among them, under a spec
  that passed. The rule asks the checker for the provided type — `T` of an `InjectionToken<T>`, or a
  `provide:` class's instance type — and reports each literal key no member of it has. It checks
  **keys only**: whether a value fits is the broad form `no-mistyped-use-value` keeps to primitive
  tokens, because a `useValue` is normally a partial fixture. Silent on `any`, `unknown`, `object`,
  `{}`, primitives, arrays and index signatures, on a spread's keys and computed keys, on `multi: true`,
  and without `parserOptions.project` / `projectService`. A rule of its own rather than an option on
  `no-mistyped-use-value`, so a project can take one reading without the other. `error`, because it
  decides on the checker's answer; not in `configs.typeErrors`, because the finding compiles.

- **`vitest-auto-spy/angular-router` — an `ActivatedRoute` whose streams and snapshot cannot
  disagree.** `ActivatedRoute` keeps `snapshot`, `params`, `queryParams`, `data` and `fragment` in
  instance fields, so `provideAutoSpy(ActivatedRoute)` has none of them and a hand-written `useValue`
  has whichever half its author read first. In one consumer suite 99 spec files built the double by
  hand: 31 bare `provideAutoSpy(ActivatedRoute)`, 68 `{ provide: ActivatedRoute, useValue }` lines
  across 56 files — spelling out `snapshot` 37 times, `queryParams` 32, `params` 17, `paramMap` twice
  — and 35 partial snapshots patched in through a repository wrapper that silenced the type with
  `as never`, because the honest type asks for a whole `ActivatedRouteSnapshot`.
  `provideActivatedRoute({ params, queryParams, data, fragment, url, outlet, component, routeConfig })`
  provides **Angular's own `ActivatedRoute`**, built over one record: every stream is a
  `BehaviorSubject` of one field, the snapshot is Angular's own `ActivatedRouteSnapshot` of the same
  record, and both `ParamMap`s are Angular's. `injectActivatedRoute()` returns the handle —
  `setParams`, `setQueryParams`, `setData`, `setFragment`, `setUrl` and `set({ … })` — and each change
  replaces the snapshot first and then emits the streams that moved, in the router's order and with
  its equality, so a spec cannot observe a state a navigation never produces. `createActivatedRoute()`
  is the same double without a `TestBed`. The route is a one-node tree (`root` is itself, `parent`
  is `null`) and a real route to the real `Router`: `relativeTo` resolves against its `url`. It is
  built with the router's internal constructors, unchanged from Angular 20 through 22 and checked as
  the double is built; the specs compare its keys with `new ActivatedRoute()`, and the Angular range
  job now builds it on 20, 21 and 22. `@angular/router` joins the **optional** peers — this entry is
  the only one that imports it — and the entry weighs 2.09 kB min+gzip. It registers no hooks and
  imports no runner, so it works the same under `bun test`.

- **`no-ts-expect-error-on-double`: a type suppression over a double's configuration is reported.**
  A `@ts-expect-error` or `@ts-ignore` whose line configures a double — `nextWith`,
  `nextOneTimeWith`, `resolveWith`, `returnValue`, `mockReturnValue`, `mockResolvedValue`,
  `calledWith(…)` and the rest whose argument is checked against the method's signature — switches off
  the one check a typed double gives. On the consumer the rule reports 34 such directives in 15 files,
  every one with a reason written after it: four on overloaded clients, seven blaming "the collapsed
  generic" for a fixture the real instantiation rejects as well, nineteen over a fixture or a
  production type that disagrees with the declared one, and four deliberately outside the type to
  reach a default branch. So a reason does not silence it. The message names
  `Spy<X, { overload: { m: 'first' } }>` for an overloaded method and `ReturnType<X['m']>` for the
  rest, and the deliberate case keeps its directive under an `eslint-disable-next-line … -- <why>`,
  which reaches it because the report sits on the directive's line. `rejectWith` / `failWith` /
  `throwWith` take `unknown` and are not read. `error`, syntax only.

- **`no-constant-expect`: an assertion the spec already decided is reported.** `expect(true).toBe(true)`,
  `expect({ … }).toBeDefined()` — a value spelled out in the spec, under a matcher whose answer that
  value fixes: `toBe` / `toEqual` / `toStrictEqual` with constants on both sides, and `toBeTruthy` /
  `toBeFalsy` / `toBeDefined` / `toBeUndefined` / `toBeNull` / `toBeNaN` for any literal, object and
  function literals included. `vitest/expect-expect` sees the `expect` and is satisfied, and
  `@vitest/eslint-plugin` 1.6 has no rule about the value; on the consumer it reports four — two tests
  asserting nothing else, two importing a barrel for coverage. `.resolves` / `.rejects`, `toThrow` and
  every other matcher are left alone. `error`.

- **`no-compile-components`: `compileComponents()` under a builder that inlines resources.** The call
  fetches `templateUrl` / `styleUrls` at run time, so under the Angular CLI's test builders,
  `jest-preset-angular` or `bun-angular` it resolves at once and the `await` before it waits for
  nothing; under a JIT setup that reads those files while the test runs it is needed. No spec shows
  which, so the rule reports nothing until `['error', { builder: 'inline-resources' }]` says so — it
  ships in `recommended` at `error` and inert, the way the type-aware rules wait for a program, rather
  than as the plugin's first `off`. A suggestion drops the call (the whole statement when only
  `TestBed` is left) and the `async` of a hook or test that awaits nothing else; a `.then()` chain, a
  returned or stored promise and a concise arrow body are reported without one. On the consumer: 449
  calls in 411 files, 435 with the edit. The plugin ships thirty-six rules; the three, landing in one
  commit with `no-unknown-use-value-key`, add 2.57 kB min+gzip together to `/eslint-plugin` (26.95 →
  29.52 kB) — a dev-time entry no test bundle imports.

- **`no-sync-testbed-await`: the `await` that `compileComponents()` was hiding.**
  `TestBed.configureTestingModule(…)` and every `override*` return `TestBed` itself — that is what
  makes them chainable — `resetTestingModule()` does too, and `createComponent()` / `getLastFixture()`
  return the `ComponentFixture`. None of them is a promise, so an `await` in front of one waits for
  nothing and the `async` it forced on the hook then awaits nothing either; both read, to everybody
  after, as a setup that is asynchronous and is not. The shape was invisible while the chain ended in
  a call that really did return a promise: on an Angular suite of 1862 spec files, removing 448
  `compileComponents()` calls from 410 files uncovered 18 such `await`s and 33 hooks left `async` with
  nothing to wait for, all of them older than the removal. Run over that consumer's last commit —
  1759 spec files, 411 still calling `compileComponents()` — the rule reports **14 times in 10
  files**, every one with the edit, and over the same tree with the calls removed and their awaits
  fixed it reports nothing: no false positive in 1759 files either way. The rule reports the `await` wherever the
  receiver is `TestBed`, `getTestBed()`, a chain of those members, or a name the file settles to one
  of them, and the chain is read link by link so that `TestBed.inject(Api).createComponent(x)` is not
  one. A suggestion drops the `await` **and** the `async` of a `beforeEach` / `beforeAll` /
  `afterEach` / `afterAll` / `it` / `test` callback that then awaits nothing else — the same edit
  `no-compile-components` offers, and a suggestion for the same reason: without the `await` the next
  statement runs one microtask earlier. `TestBed.inject(TOKEN)` and `TestBed.runInInjectionContext(fn)`
  are never reported, because each answers whatever the token or the callback holds, and four
  `await TestBed.inject(…)` calls in that suite await a real promise. `error`, **syntax only**: the
  fact is Angular's own signature, so unlike `@typescript-eslint/await-thenable` the rule needs no
  `parserOptions.project`. Run both and the same line draws two reports — one of which names the
  TestBed and carries the whole edit, while the stock suggestion leaves the `async` behind for
  `@typescript-eslint/require-await` to find on a later run; before that `require-await` is silent,
  because the `async` function does contain an `await`.

- **`prefer-provide-activated-route`: the hand-built half a green test keeps believing in.**
  `ActivatedRoute` keeps `snapshot`, `params`, `queryParams`, `data`, `fragment` and `url` in instance
  fields, so a hand-written double holds whichever half its author read first and `undefined` in the
  other — and a spec that sets `snapshot.params` without emitting `params` tests a route no navigation
  can produce. On an Angular monorepo of 11 000+ spec files, 42 providers of a hand-built route sit
  across 36 of them, and every shape is a half: a lone `snapshot`, an empty `{}`, a tree of `children`,
  a `createSpyFromClass(ActivatedRoute)` whose instance fields no longer exist, a `useFactory`
  assembling the two halves with `mockReadonlyPropGetter` one by one. The rule reports all four
  descriptor slots — `useValue`, written in place or parked in a name above the TestBed, `useClass`,
  `useFactory`, `useExisting` — and `provideAutoSpy(ActivatedRoute)` with a message of its own: a spy
  reads the prototype, and a route keeps nothing there. `provideActivatedRoute()` and every form of
  `createActivatedRoute()` a descriptor can carry — `.route`, destructured, built in a factory — are
  silent by shape. `error`, **syntax only**: every report has a `provide:` naming the route class
  beside it, so there is no heuristic in the decision, and the repair it names is a drop-in
  replacement of the reported line.

- **A strict double's getter nobody configured, and its stream nobody fed, are reported after the
  test.** Strict mode throws on a method nobody configured, but a spied getter still answered
  `undefined` and an observable property spy stayed a silent stream — the same "no data" branch, and
  nothing said so. A registration makes it common: on a consumer suite of ~1 760 spec files every
  `Router` double carried `gettersToSpyOn: ['url']` and `observablePropsToSpyOn: ['events']` from one
  `registerAutoSpyDefaults` row, and of the 119 files that doubled it 77 never configured `url` and
  100 never fed `events`. A read cannot throw where it happens — a failure diff that prints the double
  reads it, and a throw would break that message — so `setupAutoSpy({ unconfiguredReads })` (`'off'`
  by default, `'warn'`, `'throw'`) counts the reads while the test runs, from its own `beforeEach` to
  its `afterEach`, and reports them after it:
  `[vitest-auto-spy] Router.url was read 3 times and nothing configured it, and strict mode is on.`
  A getter read counts when it reached the scaffold nothing replaced — `mockReturnValue`,
  `mockImplementation`, `overrides` (a registered one included) and `mockReadonlyProp` configure it;
  a subscription counts when nothing fed the stream **by the end of the test**, so subscribing first
  and calling `nextWith` later is not a finding. `onUnstubbedRead({ className, member, kind, count })`
  — on `setupAutoSpy` or on one double, with `onUnstubbedCall`'s precedence — takes the findings
  instead of the report, from every double not built with `strict: false`, for a survey before the
  report goes on. Not part of `preset: 'strict'`. Covers `createSpyFromClass`, `provideAutoSpy`,
  `createSpyFromInstance`, and the observable properties of `createAutoMock` /
  `provideAutoSpyForToken`; `mockDeep` nodes stay out. The trackers ride every factory — with
  `selfReturning`, which landed in the same commit, +0.37…0.41 kB min+gzip on the core rows (16.80 →
  17.17 kB on `.`) and +0.41 kB on `/angular` — and `/setup`, which also carries the report, takes
  0.61 kB (16.36 → 16.98 kB).

- **`createComponentStub(Real, overrides?, { template }?)` in `/angular`: a child's stand-in that
  cannot drift from the child.** A hand-written stub restates the selector, the inputs and the
  outputs, and nothing checks the copy — a renamed input leaves the parent binding a property nobody
  declared while the spec stays green. On the consumer that shape was still 22 classes in 17 spec
  files after two clean-ups. The helper reads the copy from the real class's compiled definition
  (`ɵcmp`, `ɵdir`, `ɵpipe`): the selector, compiled back to the same selector list; every input
  under its public name, with its alias and transform, `input()` as a signal input and `model()` as a
  model; every output as an `EventEmitter`; `exportAs`; a pipe's name and purity, with the identity
  as its default `transform`. The stub is standalone, renders one `<ng-content>` per slot the real
  component projects, and works in `TestBed.overrideComponent(…, { remove: { imports: [Real] }, add: {
  imports: [Stub] } })` and next to `renderShallow(Parent, { keepTemplate: true, keepChildren: [Stub] })`.
  Not copied, on purpose: host bindings, providers, lifecycle hooks, queries. Each stub gets a
  component ID of its own, so stubbing the same child in every test prints no `NG0912`.
  `renderShallow` does not do this — it drops children instead of standing in for them. +1.02 kB
  min+gzip on `/angular` (21.64 → 22.65 kB).

- **`stubWebStorage('localStorage' | 'sessionStorage', { items, view }?)` in `/dom-stubs`.** An
  in-memory `Storage` a spec installs for itself — `getItem` / `setItem` / `removeItem` / `clear` /
  `key` / `length` with the platform's string coercion — and a handle whose `snapshot()` is the plain
  record to assert on. It goes through `mockValueProp`, so `restoreMockedProps()` and `setupAutoSpy()`
  put the previous storage back, and it lands on `document.defaultView` too when that is a separate
  object. The consumer carried four copies of a `TestingStorage` class for this. It is not a second
  `restoreWebStorage()`: that one repairs a broken environment once and leaves a working storage
  alone; this one replaces whatever is there, for one test, and installs in a `node` environment as
  well because the spec asked for it. +0.26 kB min+gzip on `/dom-stubs` (5.37 → 5.62 kB).

### Changed

- **`prefer-provide-auto-spy` names `selfReturning` for a chained call on a token.** Its token message
  used to recommend `provideAutoSpyForToken(LOGGER, { channel: vi.fn().mockReturnThis() })`, a seed
  that is stored verbatim and is no longer a spy; it now points at the third argument,
  `{ selfReturning: ["channel"] }`, which keeps `channel` assertable and configured under `strict`.

### Fixed

- **`registerAutoSpyDefaults` from `vitest-auto-spy/angular` keeps a generic class's declared default
  next to an accessor list and `returns`.** The class overload still had the shape `provideAutoSpy`
  lost: `registerAutoSpyDefaults(FlagService, { gettersToSpyOn: ['flags'], returns: { isEnabled:
  false } })` failed with `No overload matches this call`, the class overload reading `T` back from the
  list as `{ flags: any }`. It now takes `T` from the class alone (`NoInfer`), as `provideAutoSpy`,
  `overrideAutoSpy` and `overrideComponentProvider` do. The token overload never had the defect: `T`
  is read off the `InjectionToken<T>` reference before the configuration is consulted, so
  `registerAutoSpyDefaults(TOKEN, { observablePropsToSpyOn: […], returns: {…} })` compiles without a
  type argument on TypeScript 5.4 through 6.0, and a type test now pins it. The core
  `registerAutoSpyDefaults` keeps the trap for the same reason `createSpyFromClass` does — `NoInfer`
  is above the core's TypeScript floor — so there the argument is still spelled out. Types only.

- **`provideAutoSpy` keeps a generic class's declared default next to an accessor list and
  `returns`.** `provideAutoSpy(RemoteConfigService, { gettersToSpyOn: ['remoteConfig'], returns: {
  isKeyEnabled: false } })` failed with `'isKeyEnabled' does not exist in type 'MethodReturns<{
  remoteConfig: any; }>'`: TypeScript checks a generic class argument after the configuration, reads
  `T` back from the list as `{ remoteConfig: any }`, and rejects the call before the class is read —
  either half alone inferred the default, and `overrides` with `returns` failed the same way. The
  consumer spelled the type argument out at eight call sites. `provideAutoSpy`, `overrideAutoSpy`
  and `overrideComponentProvider` now take `T` from the class alone (`NoInfer`, TypeScript 5.4 — every
  Angular `/angular` supports already needs a newer one). The core `createSpyFromClass` keeps the
  trap — `NoInfer` is above the TypeScript floor the core documents, and the older emulations were
  measured and do not block this inference — so AGENTS.md §6 and §17 say to spell the argument out
  there, and a type test pins both the rejection and the explicit form.

- **The `Map`-backed stand-in coerces keys, not only values.** `restoreWebStorage()`'s replacement
  stored `setItem(1, …)` under the number and `getItem('1')` missed it; keys now go through
  `String()` as the platform's do, and `key()` converts its index as an `unsigned long` (`key(-1)` is
  `null`, `key(NaN)` is the first key). +37 B min+gzip on `/setup`.

- **A seeded member of a type-driven double is never reconfigured by `returns` or `selfReturning`,
  and no mock API is reached for on it.** `registerAutoSpyDefaults(LOGGER, { returns: {…},
  selfReturning: ['channel'] })` in a setup file, then a spec seeding that very member —
  `provideAutoSpyForToken(LOGGER, { channel: () => asInstance(channelLogger) })` — threw
  `TypeError: asVitestMock(...).mockImplementation is not a function` out of the provider, before the
  first line of the test ran. `createAutoMock` stores a seed verbatim, so the member the
  configuration pass read back was the spec's own arrow function: not a spy, so the value could not
  go into the library's container, and the fallback then handed a plain function to the adapter. The
  merge rule already answers it — the call site outranks the registration, and a seed is documented
  as returned verbatim — so a member named in `overrides` is now left exactly as it was seeded,
  whatever `returns` or `selfReturning` say about it. That also settles the one case the old fallback
  did reach: a seeded `vi.fn()` used to be overwritten by `returns` and now keeps its own
  implementation, which is the same rule rather than a second one. Every member that survives the
  seed check is one the double built itself, so that path no longer imports the adapter at all.

- **`no-compile-components` names the `@defer` exception instead of promising more than it can
  see.** Under an inlining builder the rule reported every `compileComponents()` as doing nothing —
  but a component whose template holds a `@defer` block ships async class metadata, which that call
  resolves whatever the builder did with the template, and removing it fails the test at run time
  with `Component 'X' has unresolved metadata. Please call 'await TestBed.compileComponents()'`.
  Measured on a 1 862-file suite: 410 files called it, and removing all of them broke exactly that
  one class of file. The message now says the call is *usually* redundant, names the exception, and
  spells the `// eslint-disable-next-line vitest-auto-spy/no-compile-components -- @defer: async
  class metadata` that keeps such a call; the suggestion's own text carries the caveat too, since
  that is what a bulk edit reads. What is reported did not change — a spec file shows nothing about
  another file's template and this rule reads no types, so narrowing it by call shape would be a
  guess wearing the clothes of a check.

Size, min+gzip, measured commit by commit. Token registrations add 18 B to the core entry and 64 B to
`/angular` (21.57 → 21.64 kB). `/jasmine` and `/nestjs` carry the same core and changed no line of
their own: +415 B (12.45 → 12.87 kB) and +409 B (12.14 → 12.55 kB), past 3 % only because the base is
smaller — 406 B and 392 B from the trackers and `selfReturning`, the rest from token registrations.
`/setup` takes another 34 B from the `angular-router` link added to the shared documentation-link
table. The four new lint rules add 2.57 kB to `/eslint-plugin` (26.95 → 29.52 kB), a dev-time entry
no test bundle imports.

## [5.7.0] - 2026-09-11

### Added

- **A strict throw something swallowed fails the test anyway.** A call to an unconfigured method of
  a strict double throws where it happens — and on the consumer that throw was caught before it
  reached the test more often than anyone guessed: by a `try`/`catch` in the code under test, which
  took its error branch and reported the strict message as a business error, or by an RxJS operator
  with no error handler, whose rethrow goes through a `setTimeout` a fake clock never runs. The test
  stayed green without the answer it depended on. After a suite-wide `strict: true` went on, four
  of the ten areas its specs were split into counted 34 such tests and the other six reported the
  same shape, among them an init flow that simulated a server logout in every test and a payment
  spec that passed through the error branch instead of the purchase it named. Those were the ones
  people noticed by hand: run over the same suite once they had been fixed — 1758 files green under
  strict — the guard failed 65 more tests in 26 files, 47 of the calls in one player service spec.
  `setupAutoSpy({ swallowedStrictCalls })` — `'throw'` by default with
  `strict: true` and under the strict preset, `'off'` otherwise, `'warn'` to print — records every
  strict throw and, after each test, fails the test with the ones the runner never reported, each
  with its first frames. A test that provokes one on purpose takes it with
  `takeStrictViolations()` from `vitest-auto-spy/setup`, which is also the assertion: after
  `expect(() => cart.total()).toThrow(…)`, `expect(takeStrictViolations()).toHaveLength(1)`.
  The recorder rides the strict dispatch, so every entry point carries it — +0.16…0.19 kB min+gzip
  on the core rows — and `/setup`, which also pays for the report and the advice text, takes 0.41 kB
  (15.96 → 16.36 kB).

- **`autoMocked<T>(overrides, config)`** takes the configuration `createAutoMock` takes — `returns`,
  `name`, `strict`, `observablePropsToSpyOn`. It accepted seeds only, so under a suite-wide
  `strict: true` a double handed to the function under test as an argument could not say what its
  `void` members answer, and each one needed a `mockReturnValue(undefined)` of its own after the
  factory — two doubles on the consumer.

- **`no-mistyped-use-value`: a primitive token's `useValue` is checked against the token.** Angular
  types `useValue` as `any`, so `{ provide: IS_PLATFORM_BROWSER, useValue: {} }` compiles for an
  `InjectionToken<boolean>` — and an object is truthy, so on the consumer that spec ran in "browser"
  mode whatever its author meant. The rule asks the type checker: when `provide` is an
  `InjectionToken<T>` whose `T` is primitive-like — every member a string, number, boolean, bigint,
  enum, a literal of those, `null` or `undefined` — and the value is not assignable to `T`, it reports
  the token, the declared type and the value's type. Measured on the consumer: 259 providers of
  primitive-typed tokens in 179 spec files, 2 of them mistyped, both that `{}`. Object-typed tokens
  are out of scope on purpose — their `useValue` is usually a partial fixture, `createMock<T>()` is the
  typed tool there, and reporting them would be hundreds of findings nobody should have to rewrite.
  It is the plugin's second type-aware rule and, like the first, says nothing without
  `parserOptions.project` / `projectService` or on a checker without `isTypeAssignableTo`. `error`,
  because it decides on the checker's answer; not in `configs.typeErrors`, because the finding
  compiles.

- **`no-instance-lifecycle-spy`: a spy on an instance's lifecycle hook is reported.**
  `vi.spyOn(component, 'ngOnInit')` — or `jest.spyOn`, and `ngOnDestroy`, `ngDoCheck`,
  `ngAfterContentInit`, `ngAfterContentChecked`, `ngAfterViewInit`, `ngAfterViewChecked` — installs
  a spy Angular never calls: a view runs the hook it read off the class prototype when the component
  was created. So `expect(component.ngOnInit).toHaveBeenCalled()` after `fixture.detectChanges()`
  cannot pass, and a `.mockImplementation` never runs; on the consumer the real `ngOnInit` kept
  running under a hook a spec believed it had stubbed. The message names the repair — spy on
  `Cls.prototype` before the component is created, or assert what the hook does. `X.prototype` and
  `Object.getPrototypeOf(x)` are left alone, and so is `ngOnChanges`, which Angular calls as
  `this.ngOnChanges(…)` and therefore does reach an instance spy. `warn`, because it decides on a
  heuristic: a spec that calls `component.ngOnInit()` itself, or an injector destroying a service,
  reaches the instance spy, and one file's syntax cannot tell those apart. The plugin ships thirty
  rules, and the two of them add 1.1 kB min+gzip to `/eslint-plugin` (25.88 → 26.95 kB) — a
  dev-time entry no test bundle ever imports.

### Fixed

- **`returns` is a default the spec can still build on.** It was installed as the host mock's
  implementation, which replaces the library's dispatch — so a `calledWith`, `mustBeCalledWith`,
  `resolveWith`, `nextWith` or `failWith` configured on the same method afterwards was written into
  state nothing read any more, and the call kept answering the `returns` value with no report,
  `misconfiguration: 'throw'` included. It is exactly what a spec reaches for once strict mode names
  a method: seed a harmless default where the double is built, then give one test its own answer —
  on the consumer that pattern silently lost its override in at least four specs, and it made a
  suite-wide default such as `Router.navigate` resolving `true` unsafe to register at all. The value
  now sits in the spy's own container: a later argument-matched configuration wins for its
  arguments and every other call still gets the default, a later `resolveWith`/`failWith`
  supersedes it like any other configuration, `undefined` counts as configured under `strict`, and
  `resetAutoSpy` clears it. A callable the library did not build — a host mock seeded through
  `overrides` — is still configured through its implementation. One consequence to know: a
  `returns` value now survives `vi.resetAllMocks()`, as `calledWith` always did.

- **`strict: false` on a double now keeps it away from a global `onUnstubbedCall` too.** The
  precedence put the suite-wide handler ahead of the double's own `strict`, so the opt-out the docs
  call "the only way to exempt one double from a suite-wide default" exempted it only from a
  suite-wide `strict: true`. A suite whose policy is a handler — a survey that records every gap
  before the throw goes on, or a throw with exceptions of its own — kept charging the doubles that
  had opted out, a `registerAutoSpyDefaults(Class, { strict: false })` included. On a 1759-file
  Angular consumer that registered its fire-and-forget metrics service that way, a recording handler
  still logged 1182 calls in 440 tests from that one class. The order is now: the double's
  `onUnstubbedCall`, the double's explicit `strict: false`, the global `onUnstubbedCall`, the
  double's `strict: true`, the global `strict`. A double with `strict: true` still reports through
  the global handler rather than throwing.

- **One unresolved member no longer erases every key of a type.** `OnlyMethodKeysOf`, and through it
  `returns` and `onlyMethodsToSpyOn`, asked `T[K] extends Func` of each member — and a conditional whose
  checked type is the error type, a member whose type failed to resolve, answers `any` for the whole
  union. A global augmentation is exactly where that hides, because `skipLibCheck` never reports the
  `.d.ts` it sits in: on the consumer one line, `Logger: typeof AppLogger` on `Window` with
  `AppLogger` an interface, turned `MethodReturns<Window>` into an index signature, so
  `returns: { open: null }` failed with "incompatible with index signature" under `strict` and
  `returns: { removeEventListener: undefined }` with "not assignable to never" without it — in five
  specs, one of them failing the suite's type gate. The check is now written `[T[K]] extends [Func]`,
  which does not distribute, so the broken member is one key among the rest. A member typed `any` is
  treated exactly as before.

- **A strict error carries the stack of the call that made it.** The error was built with the default
  ten frames, and a call through a `createAutoMock` Proxy, an RxJS operator and the library's dispatch
  used them all up — the swallowed-call report then showed library frames and never the production
  line. It now records up to thirty frames, on a strict throw only.

- **An optional method is a method.** `announce?(message: string): void` is `Func | undefined` under
  `strictNullChecks`, and every type that asked `T[K] extends Func` answered no: `returns` rejected
  the key (`'announce' does not exist in type 'MethodReturns<Provider>'`), and `Spy<T>` typed the
  member as the bare function, so `.mockReturnValue` did not exist on it — while at runtime a
  type-driven double builds a spy for it like any other key, and a strict one throws for it. On the
  consumer that forced `createAutoMock<Required<T>>` and a hand-built `createFunctionSpy` in the
  specs of three interfaces. `OnlyMethodKeysOf`, `MethodReturns` and `Spy<T>` now read the member
  through `Required<T>`, which removes only the optionality — a required property typed
  `(() => void) | null` is still not a method.

- **`returns` works on a type that declares `toString()`.** `MethodReturns<T>` typed a declared
  `toString` as its return value, `string`, and every object literal inherits `toString` from
  `Object.prototype` as a function — so `{ returns: { reload: undefined } }` on a `Location` double,
  or on any class with its own `toString()`, failed with `Types of property 'toString' are
  incompatible`, whichever member it actually configured. Under a suite-wide `strict: true` that is
  exactly where `returns` is needed, and on the consumer it forced a `Location` double back to a
  `mockReturnValue` per method. A member `Object.prototype` also has now accepts the inherited
  member's type alongside its declared return; `returns: { toString: 1 }` is still rejected.

## [5.6.0] - 2026-09-11

**Why upgrade.** Console output a test did not ask for now fails that test, by name, with the line
that wrote it — and output made while a file loads fails the file. One line, `preset: 'strict'`,
turns every guard `setupAutoSpy()` has to its failing grade. A suite-wide `strict: true` finally
reaches the doubles a spec builds: it used to live in a copy of the module no spec file read.

### Added

- **Console output nothing absorbed fails the test that wrote it.** `setupAutoSpy({ strayConsole: 'throw' })`
  — `'warn'` prints the same report without failing, `'off'` is the default — puts a recording
  wrapper under whatever stands on `console` and fails the test when a call reaches it. Absorbed
  means the call never got that far: a `vitest-auto-spy/console` spy the test installed, or a
  `vi.spyOn(console, 'error').mockImplementation(…)`. A bare `vi.spyOn(console, 'error')` calls
  through, so it still counts. The failure names the test, quotes the method and the first three
  lines of what was written, and adds the first stack frame outside `node_modules` — which Vitest
  then turns into a code frame at the `console.error(…)` line itself. Output made outside any test —
  while the spec file is imported, in a `beforeAll` or `afterAll`, or by a callback that fired after
  its test had ended — fails the **file**, from an `afterAll`, so an import-time line from a
  third-party package cannot slip by either. The wrapper forwards every call unchanged, so the
  reporter's `stdout | file > test` attribution and `onConsoleLog` see what they saw before.

  It watches `log`, `info`, `warn`, `error`, `debug`, `trace`, `table`, `dir`, `dirxml`, `timeLog`,
  `timeEnd` and `count`, `group` / `groupCollapsed` only with a label and `assert` only when it
  fails. A console method a test replaced is put back after the test, one a file replaced after the
  file, so a silencing spy can no longer travel into the next file of the worker.
  `strayConsole: { allow: ['…', /…/] }` lets environment noise through — a string as a substring, a
  pattern searched — and is documented as the last resort. `guardStrayConsole(reaction)` is the same
  guard registered on its own. The library's own warnings go through `console.warn`, so under the
  guard they fail the test that caused them like any other output.

  Why it is needed on top of the reporter: on a 1759-file Angular consumer running `isolate: false`,
  three spec files that merely imported `vitest-auto-spy/console` left silent spies on the shared
  `console` for the rest of their worker, and which files' output disappeared depended on which of
  the three a worker happened to run first.

- **`preset: 'strict'` — every guard at its failing grade, in one option.** It sets
  `duplicateCopies`, `propsOutsideHooks`, `guardGlobals`, `prototypePollution`, `strayConsole` and
  `misconfiguration` to `'throw'`, turns `strayTimers` on, and `strayRejections` when zone.js is
  loaded; any option passed next to it still wins. It is a preset rather than `strict: true` because
  that name already means strict *doubles*, which change what an unconfigured call returns — a
  semantic switch, not a report grade — and the preset leaves it alone. So does it `blockNetwork`,
  which changes the code under test, and a failure on the `strayTimers` count, which lands on a file
  from `afterAll` and can charge it a callback the previous file scheduled after its sweep. The Angular half is `enableAngularDiagnostics()`, which needs the
  test environment first and so stays a line of its own: on the same consumer it found real defects
  in 25 files and 324 tests and cost nothing measurable, 12.5 s against 13.4 s for the full run.

- **`misconfiguration: 'throw'` — the library's own misuse reports fail at the call site.** A typo
  in `onlyMethodsToSpyOn`, `gettersToSpyOn` naming a method, a `returns` key no spy answers to,
  `injectSpy` handed a real instance, a write to `jasmine.DEFAULT_TIMEOUT_INTERVAL` and the deprecated
  `providedMethodNames` all printed a `console.warn`, and two of them printed it once per worker —
  so under `isolate: false` the one file that showed the line was whichever got there first, and
  every later occurrence was invisible. Under `'throw'` each occurrence throws where it was written,
  with no de-duplication. The grade sits on `globalThis`, so every bundle of the package reads it,
  and it is released when the file is over.

- **Three lint rules for console output.** `no-passthrough-console-spy` reports a
  `vi.spyOn(console, m)` nothing in the file gives an implementation: it records the call and then
  calls through, so the line still prints while the spec reads as though it had silenced it. The
  rule follows the spy through a `const` or a `let` a hook assigns, accepts `mockImplementation` /
  `mockReturnValue` and their `Once` forms, stays silent wherever the spy is handed to something it
  cannot follow, and offers `.mockImplementation(() => undefined)` as a suggestion.
  `no-console-in-spec` reports a spec that calls a printing console method itself, or assigns one
  (`console.error = …`), which nothing puts back. `no-import-time-console-spies` reports an import of
  `vitest-auto-spy/console` in a file that never calls `installConsoleSpies()`: the entry installs
  its spies when it is first imported, once per worker, and under `isolate: false` that silences
  every later file.

  All three are **`error`**, because each decides on a fact rather than a reading of the code — a
  spy with no implementation calls through, a call on the global console writes, and the import
  installs once per worker. Measured on the consumer's 1759 spec files: **0** reports for the first
  (its one console spy already had an implementation), **6 in 2 files** for the second (every one a
  `console.error` in a `subscribe` error callback), and **32 of the 39 files** importing the entry for
  the third, before that suite moved onto `installConsoleSpies()`. The plugin ships twenty-eight
  rules.

- **`withoutStrayTimerTracking(work)` in `vitest-auto-spy/setup`** runs setup work whose timers are
  never counted or cancelled as strays. `setupAutoSpy()` now runs its Web Storage probe inside it:
  jsdom answers every `setItem` / `removeItem` with a real `setTimeout(…, 0)` that dispatches the
  `storage` event, so under `isolate: false` each file started with timers of the library's own that
  `strayTimers` could charge to a file with no timer in it.

- **`onStrayTimers` says where each stray came from.** It received a count and nothing else, so a
  callback scheduled after the previous file's sweep — and therefore charged to the next file — took
  several full runs to trace on the consumer. The report now carries `timers`: each stray's kind, the
  spec file that was running when it was scheduled, and up to five frames of the scheduling call,
  those outside `node_modules` first. The stack is captured at scheduling, twelve frames at most, and
  formatted only for the callbacks that turn out to be strays; `describeStrayTimers()` in
  `vitest-auto-spy/setup` returns the same list, and the `--detect-async-leaks` warning quotes the
  first three.

- **`createAutoMock(overrides, { name })`**, and `provideAutoSpyForToken` passes the token's description:
  a strict report on a type-driven double read `Nothing configured observe`, with no hint of which of
  a spec's doubles it was. It now reads `Nothing configured InjectionToken CAROUSEL_RESIZE_OBSERVER.observe`.

### Changed

- **The strict report prints an instance by its class.** `Called as:` rendered every argument in
  full, so an unconfigured method handed a DOM node or a service walked everything that object could
  reach — and a run with hundreds of strict failures could take a worker's heap through the message
  strings alone. Plain data still prints, up to 200 characters per argument; anything else prints as
  `[HTMLDivElement]`, `[Session]`.

- **The teardown net explains itself in full once per file.** When a hook ahead of `setupAutoSpy()`'s
  own `afterEach` throws, the net puts the `mock*Prop` patches back and says why; in a run where
  every test's teardown threw it printed the full paragraph more than 600 times. The first time in a
  file it still does, and after that it prints one line with the count.

- **Under `strayConsole` the `/console` import installs nothing.** An import runs once per worker
  under `isolate: false`, so it cannot know which file it belongs to, and installing there is what
  silenced every later file. The spies stand in where `installConsoleSpies()` is called — in a
  `beforeEach` for one test, at the top of a spec file for all of its tests — and the guard puts the
  console back after each. Spies an import installed before the guard armed are taken off. Without
  the guard the import still installs, as before.

- **`restoreConsole()` keeps the spies.** It puts the console methods back and clears what they
  recorded, and the next `installConsoleSpies()` puts the *same* spies back. It used to forget them,
  which left the exported `consoleErrorSpy` and its siblings detached in every other file of the
  worker: on the consumer, the moment three files started calling `restoreConsole()` in `afterEach`,
  12 tests in 5 other files failed on `Number of calls: 0`, and output the global silence had hidden
  surfaced in 7 files. `let consoleSpies = installConsoleSpies()` in a `beforeEach` with
  `restoreConsole()` in an `afterEach` is the pattern, and the exported constants are the same
  objects as the bag's.

- **`injectSpy`'s "plain instance, not an auto-spy" warning and the `propsOutsideHooks` report are
  de-duplicated per spec file, not per worker.** Per worker, each printed in whichever file reached the
  token or the shared object first, so the file that showed it changed from run to run — and under the
  stray-console guard, which file failed would have too.

- **`createAutoMock<T>().constructor` is `Object`**, as it is on every other double of the package.
  It was `undefined`, so production code that builds an error message from `value.constructor.name`
  threw a `TypeError` of its own. A seed or a `delete` still decides it.

- **`provideHttpTesting()` verifies only the modules built from its providers.** A module assembled
  from `provideHttpClient()` and `provideHttpClientTesting()` directly used to be checked by
  accident, because some other file had switched a worker-wide policy on.

### Fixed

- **A strict double broke Angular's teardown.** Angular calls `ngOnDestroy` itself on every provided
  value that has one when the testing module is torn down, and a `createAutoMock` proxy has every
  member — so every `provideAutoSpyForToken` double, and every class double of a service with an
  `ngOnDestroy`, threw `Nothing configured ….ngOnDestroy` from inside `resetTestingModule` under
  `strict`. The throw skipped the `afterEach` hooks after it and failed the tests that followed, which
  is how turning on a suite-wide `strict: true` on the consumer produced hundreds of failures and the
  teardown net's report 600 times over. Angular's lifecycle hooks (`ngOnDestroy`, `ngOnInit`,
  `ngOnChanges`, `ngDoCheck`, the `ngAfter…` four) now answer `undefined` on a strict double and are
  still recorded. The package's own stand-ins — the observer, media-element and constructor stubs and
  the console spies — were checked under a suite-wide strict default and never inherited it; the
  `observe` / `unobserve` reports in that run came from the suite's own token doubles, which is
  strict mode doing its job.

- **A suite-wide `strict: true` never reached a double a spec built.** `setupAutoSpy({ strict: true })`
  and `onUnstubbedCall` wrote the default into module scope — in the copy of the module `/setup`
  carries — while `createSpyFromClass` read it from its own copy in `dist/index.js` or
  `dist/angular.js`. On the consumer a probe spec calling an unconfigured method passed with strict
  on, and so did the whole suite, 12 717 of 12 717 tests: the switch had never applied once.
  `setSpyEngine()` from `/setup` missed the adapter the root entry registered the same way. Both now
  live on `globalThis`, with the holder cached per bundle, and so does `enableAngularDiagnostics`'
  unspied-provider grade. `scripts/smoke-dist.mjs` checks each switch through two bundles of the
  built package, the stray-console guard and the misconfiguration grade included.

- **`overrides` on a spied getter was silently dropped.** A member named in `gettersToSpyOn` — or
  by a `registerAutoSpyDefaults` registration, which is how the consumer met it — is an accessor
  whose setter records the assignment and whose getter keeps answering `undefined`, so
  `provideAutoSpy(RemoteConfigService, { overrides: { remoteConfig } })` did nothing and nothing said
  so. The seed is now what the getter spy returns, and a later `accessorSpies.getters.x.mockReturnValue(…)`
  still wins. A seed on a member that only has a spied setter becomes a plain value.

- **`enableAngularDiagnostics()` checked only the first spec file of each worker.** Its per-test
  hooks were registered once per module. Under `isolate: false` the setup file runs again for every
  spec file while `vitest-auto-spy/angular` stays loaded for the whole worker, so every later file
  ran with no pending-request check and no per-test reset, and the doubles `shadowedProviders`
  remembers piled up across files. Every call outside a test now registers its own pair on the file
  or `describe` being collected; a second pair in one file does nothing twice, and a call from inside
  a test only re-configures the group.

- **`pendingRequests` broke every HTTP spec under `sequence: { hooks: 'list' }`.** With `'list'`, a
  suite's own `getTestBed().resetTestingModule()` and Angular's cleanup ran before the check, which
  then called `TestBed.inject` on the reset `TestBed` and built a fresh module — so every spec using
  `HttpClientTesting` failed from its second test on with "Cannot configure the test module when the
  test module has already been instantiated", and the check read an empty module and never saw a
  real open request. The old snapshot wrapped the static `TestBed.resetTestingModule`; both resets go
  through the instance. The snapshot now wraps the instance, and the check never injects into a
  module that no longer exists, so `afterEach` order no longer matters.

- **`shadowedProviders` reported doubles from a module that had been reset, and could build a real
  root service to do it.** The remembered doubles were cleared only by the once-registered
  `beforeEach`, so a block that reset and re-configured with real services got false "shadowed"
  reports; they are now cleared before every test and at every reset. Each remembered token was
  resolved through the whole injector chain, which for a stale `providedIn: 'root'` token built the
  real service and failed on its dependencies (`NG0201: No provider found for InjectionToken …`).
  It now asks the component's node alone and skips a double the module no longer returns. Its message
  also recommended `overrideComponentProvider(Cmp, Token, provideAutoSpy(Token))`, a signature that
  does not exist; it now shows `overrideComponentProvider(Cmp, ServiceClass)`, and
  `TestBed.overrideProvider(TOKEN, provideAutoSpyForToken(TOKEN))` for an `InjectionToken`.

- **`extendWithAutoSpies({ providers })` reported the real service a spec kept on purpose.** A
  fixture whose token the `providers` list overrides — the documented way to keep a real service —
  was still read through `injectSpy`, which printed its "plain instance, not an auto-spy" warning in
  every such test; under `misconfiguration: 'throw'` or `strayConsole: 'throw'`, both in
  `preset: 'strict'`, the documented pattern failed. A token the list names, as a `{ provide }` object
  or a bare class, nested arrays included, is now read with `TestBed.inject`, and the report is gone.

- **`provideHttpTesting({ verifyOnTeardown })` checked only the first spec file of each worker, and
  under `sequence: { hooks: 'list' }` nothing.** The check was an `afterEach` registered when
  `vitest-auto-spy/angular-http` was first imported, behind a worker-wide on/off that one file's
  `verifyOnTeardown: false` switched off for the files after it. Every module built from the
  providers now arms the check for the test that built it, through an environment initializer, so it
  reaches every spec file and a provider list hoisted to a constant; it reads the requests the
  `TestBed` instance's reset took, and never asks a reset `TestBed` for anything.

### Size and memory

**`/setup` +2.35 kB (13.61 → 15.96 kB, +17.2 %), and it is the console guard.** Most of it is the
report — method, quoted lines, caller frame and the repair — because the failure is only useful if
it says where to go; the preset, the misconfiguration grade and the stray-timer origins are a few
hundred bytes more. `/setup` is imported once per worker by the setup file. **`/eslint-plugin`
+1.51 kB** is the three rules; it is loaded by ESLint, never by a test run. **`/angular-http`
+0.26 kB** is the per-module arming and the reset snapshot, **`/angular` +0.79 kB** the diagnostics
fixes, the getter seed and the override read in `extendWithAutoSpies`. The core entries grew
0.34…0.43 kB each for the shared-settings holders, the misconfiguration grade, the bounded strict
report and the lifecycle-hook exemption. Total across all twenty-one: 235.2 → 244.1 kB, and the badge
moves 16.2 → 16.6 kB. The one new runtime import is `@angular/core` in `/angular-http`, for the
environment initializer — a peer its `@angular/common/http` import already requires; no core entry
imports anything new.

**Under `strayTimers`, a scheduled timer costs about 1.6 µs more.** The stray-timer origins are a
stack captured at every `setTimeout`, `setInterval` and `requestAnimationFrame`: a `setTimeout` +
`clearTimeout` pair on Node's real timers goes from 116 ns tracked in 5.5.0 to about 1.75 µs (70 ns
untracked), and a pending timer holds about 0.9 kB more until it fires or is swept (Node v24.19.0,
Apple M4 Max). Nearly all of it is V8 building the stack — about 0.9 µs for any depth, so the
twelve-frame cap is not what to tune. `preset: 'strict'` turns `strayTimers` on, so it pays this too;
without `strayTimers` nothing changed. Spies are unaffected: creation and first call stay within
1.5 % of 5.5.0 on a 100-method double, and the retained bytes are identical.

## [5.5.0] - 2026-09-11

**Why upgrade.** 5.4.0 lost `calledWith`, `mustBeCalledWith` and `resolveWith` on every spy in a
suite that loads more than one copy of the package, and this puts them back. A key a test leaves on
`Object.prototype`, which stops every later file in the worker from collecting while the run reads
zero failures, is now named by file. And the ESLint plugin reports the hand-rolled doubles it could
not see — stub classes, doubles typed `{ m: Mock }`, and a `let` a `beforeEach` fills in.

### Added

- **The ESLint plugin sees the stub-class double and the declared structural double** — two shapes it
  was blind to, both found by auditing a consumer of 1759 spec files that runs every rule of
  `recommended` at `error` with no `eslint-disable` anywhere, i.e. one where a remaining hand-rolled
  double is by definition one no rule could see.

  `no-stub-class-double` (**`warn`**) reports a class whose own fields are `vi.fn()`s —
  `class NewCardServiceMock { load = vi.fn(); }`, which is an object of `vi.fn()`s with a `new` in
  front of it and drifts from its class the same way. `prefer-create-spy-from-class` matched an
  `ObjectExpression` and a class declaration is not one; that blind spot held **112 `vi.fn()` fields
  in 46 classes across 32 files**. It reports at **one** field, where the object rule needs two,
  because the ambiguity the threshold exists for does not arise — nobody writes an options bag as a
  class — and the shapes that do hold a `vi.fn()` field without being a service double are subtracted
  outright: a **decorated** class (a test host, whose fields are event handlers), one with an
  **`implements`** clause (which cannot drift — the compiler holds it to the type), one that
  **`extends`** anything, and one with **no name of its own** (a class expression in a property slot,
  replacing a module export). Option `{ minRunnerFns }` raises the count.

  `no-structural-double` (**`warn`**) reports an object of `vi.fn()`s bound to a name whose *declared
  type* is an object of Vitest `Mock`s — `let card: { load: Mock }`, filled in a `beforeEach`. The
  annotation is the proof the count-based rule lacks, so this fires at a single `vi.fn()`, and it sits
  **below** `prefer-create-spy-from-class`'s threshold so one double never draws two reports. A bare
  `let fn: Mock` is never reported and must not be: that is a plain `vi.fn()` callback and `Mock` is
  its correct type — 109 of the consumer's 290 `Mock` references are that, against 120 in the member
  position, every one of which was assigned an object literal of `vi.fn()`s.

  Both are `warn` rather than `error`, and the reason is the evidence rather than the finding: each
  decides on a heuristic with no `provide:` beside it to settle the question, and a project that
  disagrees with the reading must be able to switch it off without losing the rule that reads a count.
  Measured before the severity was chosen, on the consumer's 1759 files: **12 reports across 8 files**
  and **115 across 74**.

- **`prefer-provide-auto-spy` reads `useClass:` and `useValue: new StubMock()`.** The string
  `useClass` appeared nowhere in the plugin, so `{ provide: NewCardService, useClass: NewCardServiceMock }`
  — the shape 22 of that consumer's stub classes are registered through — was reported by nothing, and
  a stub instantiated by hand in a `useValue` slipped past for the adjacent reason (the object reading
  answers for an `ObjectExpression`, and a `new` expression is not one). One `vi.fn()` field is enough
  here because the `provide:` proves the class is a service double, and the new message says what the
  other two cannot: the whole registration becomes `providers: [provideAutoSpy(Class)]` and the stub
  class can be deleted, with its tuned returns moving to `{ overrides: … }`. Stays at **`error`** with
  the rest of the rule — its evidence is a `provide:`, not a heuristic — and it reported **18 times
  across 9 files** on that suite. A class the linted file does not declare (a shared `*.mock.ts`) still
  resolves to nothing and is still not reported; that part of the gap stays open.

- **`prefer-provide-auto-spy` follows a name a hook fills in, and reads `useExisting:` and
  `TestBed.overrideProvider`.** Three migration shards reported the same blind spot independently, and
  the starkest of them put it this way: *all six* of its `provideAutoSpy` opportunities were written
  as a `let` declared above the TestBed and assigned in a `beforeEach`, so across an entire 170-file
  shard the plugin reported nothing but `prefer-render-shallow`. The rule already followed a name to a
  `const` initialiser; it now follows either spelling of a single binding —

  ```ts
  let nav: { go: Mock };
  beforeEach(() => {
    nav = { go: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: NavService, useValue: nav }] });
  });
  ```

  — and stops at the **second** write, where what the name holds at the use site depends on run order.
  `useExisting:` joins `useClass:` (Angular aliases the token instead of constructing the stub per
  injector; neither difference changes the repair), and `TestBed.overrideProvider(X, { useValue: … })`
  is read as the same substitution from outside the array, with a message of its own for that call
  site — `TestBed.overrideProvider(X, provideAutoSpy(X))` is the whole replacement, because
  `provideAutoSpy` returns `{ provide, useValue }` and `overrideProvider` reads the `useValue` off it.
  A call whose descriptor is **not** an object literal is left alone, which is what keeps the arm
  usable: 28 of one consumer's 61 override calls already hand over a `provideAutoSpy(…)`.

  Measured on the same 1759 spec files: the rule goes from 18 reports to **154 across 87 files** — 100
  `useValue`, 28 of them behind a token, 20 stub classes, 6 at an override call. It stays at `error`,
  because every one of those reports has a `provide:` or an override token beside it; most of them were
  previously `no-structural-double`'s at `warn`, whose message recommends `createAutoMock<T>()` — the
  right answer for a double *without* DI and the wrong one here.

  Two neighbours were re-cut so that one double still draws one report. `prefer-create-spy-from-class`
  and `no-structural-double` stand down when the literal is what a `useValue` hands to DI **or is bound
  to a name that is**, read forward through the scope manager rather than off the enclosing property;
  `no-stub-class-double` stands down for a class an override's descriptor names. Their counts on that
  suite move to **10 in 7** and **5 in 4** — 112 of those doubles turn out to be behind DI — and their
  severity does not move with it: the argument for `warn` was the evidence, not the volume.

- **`no-overridden-provider` sees a registration a `TestBed.overrideProvider` replaces.** An override
  wins over a module provider whenever it runs, so `providers: [provideAutoSpy(X)]` beside a later
  `.overrideProvider(X, …)` is a double the spec configured and nothing uses — found by a shard as two
  dead auto-spies in one file, and 9 reports in 5 of the consumer's files, every one of them a
  configured `provideAutoSpy(X, { instanceMethodsToSpyOn: […] })` buried by a barer provider for the
  same token. `error`, with the rest of the rule.

  The arm is narrow on purpose, and each condition came off a real file: the same suite compared by
  **identity** (an override in a nested `describe` decides for that block alone, and the consumer has
  that shape), the override written directly in a `beforeEach` / `beforeAll` so every test of the suite
  reaches it (one file overrides three tokens from a helper three of its thirty-four tests call, and
  reporting those would have been three false positives), and a `providers` array that is not a
  decorated class's own — reaching a component-level provider is the documented use of
  `overrideProvider`, not a defect. A suite that calls `TestBed.resetTestingModule()` is exempt
  outright, and a registration the array itself already buried is reported once.

- **`no-mocked-for-spy` still names exactly `Mocked` and `MockedObject`, and the reference page now
  says why the other seven are not oversights.** The dividing line is the type parameter rather than
  the spelling: `Mocked<T>` takes any `T` and maps its members, while `Mock<T>`, `MockInstance<T>`,
  `MockedFunction<T>`, `MockedFunctionDeep<T>` and `PartialMock<T>` all constrain `T` to
  `Procedure | Constructable`, so none of them can name a class at all — each types one `vi.fn()`,
  which is correct usage. `MockedClass<T>` is a mocked class *constructor*, whose counterpart here is
  `createSpyClass` / `mockConstructor`, and `MockedObjectDeep<T>`'s is `mockDeep<T>()`, typed
  `DeepMockProxy<T>`. A suite that types its doubles as `Mock` is therefore not writing `Mocked<T>` in
  another spelling; it is writing the *members* of a hand-built object type, which is
  `no-structural-double`'s subject — a rule of its own rather than an arm of this one, because its
  finding **compiles** and everything in `configs.typeErrors` has to be a finding that does not.

- **One enumerable key left on `Object.prototype` stops a worker collecting, and the run still looks
  green.** `setupAutoSpy()` now watches `Object.prototype`, `Array.prototype` and
  `Function.prototype`, takes back off any own enumerable key a test added, and fails that test by
  name — `prototypePollution`, defaulting to `'throw'`; `guardPrototypePollution` is the same check
  registered on its own. Vitest assembles a file's hooks in `mergeHooks`, which walks its hooks
  object with `for…in`, so one inherited key is spread as if it were an array during **collect**:
  `TypeError: Spread syntax requires ...iterable[Symbol.iterator] to be a function`, with no stack,
  because every frame of it sits under `stackIgnorePatterns`. Under `isolate: false` the key outlives
  the file that wrote it, so the casualties are that worker's whole tail. Found in a 1759-file
  consumer, where the report read `145 failed | 1613 passed` over `11880 passed | 0 failed` — zero
  failing tests because those 145 files never ran — and the count wandered across 0, 75, 83, 122, 135,
  145 and 155 on an unchanged tree, since a run whose writer happened to go last came out green. The
  write is nearly always accidental: patching `Object.getPrototypeOf(instance)` to decorate a class
  hands you `Object.prototype` itself the moment `instance` is an object literal from a `useValue`
  provider or a test double. A key the environment already carried is left alone, so a project's own
  prototype polyfill is not swept.

### Documentation

- **A member read while the component is being constructed can only be seeded by the provider.**
  `mockReadonlyProp(spy, 'paymentParams', …)` written below `TestBed.createComponent` never runs: the
  component read the member in a field initializer, the `TypeError` came out of the component's own
  line, and the stack names the component rather than the seeding that is missing. Three shards
  discovered that independently. §9 and the error → fix table now say it, with the one repair —
  `provideAutoSpy(X, { overrides: … })`, or a token factory's second argument. It is deliberately not a
  lint rule: on the consumer's 1759 files, 154 `mock*Prop` calls in 50 files are written after the
  first render and every one of them is correct, so the shape carries no signal. Nor can the helper
  say it at run time — it is never reached.

- **`arr.map(asInstance)` infers `unknown[]`.** Passing the overloaded helper by reference resolves
  against its `DeepMockProxy<T>` overload, from which `T` cannot be inferred; `arr.map((spy) => asInstance(spy))`
  gives each call its own inference, and `asInstances(a, b, c)` keeps tuple types for a fixed set. In
  the error → fix table.

### Fixed

- **`doctor` reported a freshly generated library as a broken tsconfig.** `tsconfig-glob-matches-nothing`
  exists for the codemod that turned `src/**/*.spec.ts` into `src*.spec.ts` over specs that were
  there, and it also fired — as an `error`, failing the command — on a correct `src/**/*.spec.ts` in
  a library nobody had written a spec for yet: six of seven errors on a 14 751-file consumer were one
  scaffolded library, one `index.ts` per project. The only fix the message offered was deleting the
  tsconfig, i.e. taking away the one file the first spec will need. The check now asks whether files
  with the pattern's ending exist in **the config's own directory tree** — its directory, not the
  pattern's prefix, which is exactly what a broken glob gets wrong. If they do, the glob is missing
  them and it stays an `error`; if there are none, it is an `info` that says nothing is unchecked
  yet. A pattern whose last segment names one file keeps the `error` whatever the tree holds.

- **`calledWith`, `mustBeCalledWith` and `resolveWith` went missing from every spy in a consumer that
  loads more than one copy of the package.** 5.4.0 started sharing the helper bundles on the
  prototype every fast spy inherits, and recorded "already shared" against the *bundle* alone. That
  record is only correct while there is one prototype in the process, and there routinely is not:
  `dist/index.js` and `dist/angular.js` are each built unsplit, so each carries its own `fast-spy`
  and its own `spy-decoration`, while the mock adapter every spy is built through is pinned to the
  single `dist/shared-state.js`. A spy therefore reaches the `attachHelpers` of a copy that does not
  own its prototype, the bundle was written onto that copy's prototype instead, and the spy inherited
  nothing — `spy.method.calledWith is not a function`, on 175 tests of one Angular suite, while the
  observable bundle stayed because the copy that recorded it did own the prototype. The bundle now
  goes on the prototype the **target** has, read off the target rather than off the sharing copy's
  own module scope, and the record of what is already on it **lives on that prototype** under a
  `Symbol.for` key: it is the one object every copy holds, so any number of copies in any load order
  read the same answer, and which copy's sink is registered stops mattering. Keeping that record per
  copy is not enough — two copies then both believe they own the prototype and the second overwrites
  the first, which trades a missing helper for one that rejects the spy it was called on
  (`calledWith was called off its spy`, since each copy's `calledWith` reads the spy through that
  copy's own internals class). So the first bundle to claim a key keeps it and every later bundle
  falls back to own properties on the spy, which is what every spy had before the bundles were
  shared at all. The sharing moved from `spy-decoration` into `fast-spy`, where the prototypes and
  their descriptors already live: `/rxjs`, `/bun` and `/node`, which reach the first module and not
  the second, each came out slightly smaller than in 5.4.0.

- **`propsOutsideHooks` graded the library's own `blockNetwork` stubs as written outside a hook.**
  The epoch-opening `beforeEach` was registered after the hook `blockNetwork` installs its stubs
  through, so `open`, `send` and `fetch` were stamped with the previous test's epoch and the sweep
  reported its own patches — once per worker, behind whichever spec file went first: 13 stderr
  blocks on one full run of a 1759-file suite over 13 workers, every one naming a spec that patches
  no property at all. The same ordering is what made the strict grade unusable —
  `propsOutsideHooks: 'throw'` failed a run of a single spec file on the stubs, which is why the
  consumer kept `'warn'`. The opener now registers ahead of every stub-installing hook
  `setupAutoSpy()` installs, and `setup-hook-order.spec.ts` holds the pairing: its first test fails
  on exactly that throw if the order regresses. The spec lives in a file of its own because the
  grader reports each patched property once per worker — next to the other `blockNetwork` suites the
  first report is spent before it runs, and the regression sits behind the dedup, silent.

### Size and memory

**`/eslint-plugin` +2.78 kB (21.59 → 24.37 kB, +12.9 %), and it is the rules.** `stub-class` (the
new `no-stub-class-double`), `declared-double` (`no-structural-double`) and `provider-override`
(the `TestBed.overrideProvider` reading shared by `prefer-provide-auto-spy`, `no-overridden-provider`
and `no-stub-class-double`) are new modules, and `bindings` now follows a name to the hook that fills it in. The entry is loaded
by ESLint in the editor and the lint job, never by a test run, so no spec pays for it; its cold import
is 101.6 → 117.4 kB of module graph.

**`/setup` +0.64 kB (12.97 → 13.61 kB, +4.9 %): the prototype-pollution guard, most of it the
message.** The report has to say why a key on `Object.prototype` kills collection and what to patch
instead, because the runner shows no stack to start from. `/setup` is imported once per worker by the
setup file, and the check it adds runs `Object.keys` over three prototypes after each test.

**The core entries** — `.` +0.12 kB (+0.7 %), `/rstest` / `/react` / `/vue` / `/svelte`
+0.26…0.27 kB (+1.7 %), `/angular` / `/nestjs` / `/console` / `/jasmine` +0.14…0.16 kB — carry the
multi-copy fix above: the claim record under a `Symbol.for` key on the shared prototype. `/rxjs`,
`/bun`, `/bun-angular` and `/node` went down 0.02…0.05 kB. Total across all twenty-one: 230.1 →
235.2 kB. No entry gained a runtime import of a peer.

**Memory is flat and creation is not slower.** Against the published 5.4.0, on the `/node` entry
over 100 000 spied methods, median of seven: **2.89 kB per spied method either side**, 25.75 kB per
lazy spy either side, spy creation 21.7 → 19.7 µs and the first call of every method 4 357 → 4 227 ns.

## [5.4.0] - 2026-09-10

**Why upgrade.** A setup file registers spy defaults for a dozen classes in one table instead of a
dozen calls, a `renderShallow({ keepTemplate: true })` template keeps its own pipes and directives,
and doubles got lighter — an untouched `createAutoMock<T>()` retains 705 B where it retained 1 249.

### Added

- **`registerAutoSpyDefaults` also takes a table.** A setup file that registers a dozen classes
  wrote a dozen near-identical calls; `registerAutoSpyDefaults([[Router, { … }], [AccountService, { … }]])`
  is the same registrations said once. Rows apply in order — a later row for a class an earlier row
  named replaces it, exactly as a second call does — and both forms share one registry, so a table and
  a per-class call in the same file mix freely. The row is checked against **its own** class rather
  than against a widened common type: a key the row's class does not carry fails on that row's line,
  and the diagnostic names that class's members and nothing else. `AutoSpyDefaultEntry<T>` is exported
  for a row built outside the literal.

### Documentation

- **What jsdom actually costs, measured once instead of argued twice.** Two earlier measurements
  disagreed by a factor of forty about the per-file price of a DOM, and the reason turns out to be
  the isolation mode rather than the DOM: on 40 trivial spec files, one worker, `isolate: true`,
  jsdom costs **228 ms of user CPU per file** over the `node` environment, because the environment is
  rebuilt per file. Under `isolate: false` the same set costs **5.8 ms per file** — one build per
  worker, amortised. `happy-dom` sits between them (92 ms per file isolated), and on this package's
  own 117-file Angular suite it is 26.5 s of user CPU against jsdom's 23.2 s, or 12 % less. `perf`
  now offers that swap as `perf-environment-engine`.

- **The worker count is a memory setting.** `perf` reports `perf-workers` on a run over a minute of
  summed CPU that declares no `maxWorkers`: 1.42 GB of resident memory plus ~155 MB per worker, so a
  cap of four on a 16-core machine is about 1.9 GB, and the wall clock it costs was 2.8 % on a field
  deployment. Documented in `utilities/cli` on both language sides.

- **The `mock*Prop` journal holds strong references, and the docs now say what that means under
  `isolate: false`.** Every entry keeps the patched object and the descriptor it replaced, and an
  undone patch is marked rather than spliced out, so the list is only ever emptied wholesale by
  `restoreMockedProps()`. Per-file under `isolate: true`; per-worker without it.

- **The per-method constants, published.** A lazy placeholder is 294 B and 191 ns, materialising it
  on first read is 1 923 B and another 454 ns, and a bare `vi.fn()` is 5 783 B and 3 380 ns — so a
  touched method is 3.0× lighter and 5.2× faster to build, and an untouched one 20× lighter. The
  spread is published with the median, because the last of the three is wide.

- **The size table says what the framework entries weigh.** `react`, `vue` and `svelte` are 16.1 kB
  each because that is what the core weighs: `src/react.ts` is a barrel whose own code is seven bytes
  in the bundle. Nobody should go looking for weight in it.

- **`cold-import` prints this package's share of each entry's import time.** The same import is
  measured again with the peers already resident, so the table now says that `.` is 2.8 ms of 18.9
  and `./angular` 3.1 ms of 84.0 — the rest is Angular, Vitest and rxjs. Without the denominator any
  future size-against-speed argument is held with the wrong number.

### Fixed

- **`renderShallow({ keepTemplate: true })` kept the template and dropped the vocabulary it is
  written in.** The override replaced the component's `imports` with `keepChildren ?? []` whether or
  not the template survived, so a kept template lost its own pipes and directives with it: a
  `{{ label | shout }}` failed with `NG0302: The pipe 'shout' could not be found`, and an attribute
  directive was worse — `el.injector.get(MarkDirective, null)` came back `null`, nothing threw, and
  the spec stayed green over behaviour that never ran. The override now keeps the component's own
  scope minus the child *components*, which is what makes the render shallow; `keepChildren` is
  added to it rather than substituted for it. A child re-exported by an imported `NgModule` still
  renders — the module is kept whole, because dropping it would take the pipes and directives it
  exports with it. `bench-angular/baseline.json` is re-measured on the fixed version: the
  `keepTemplate` rung is 1.29× the full cycle where it read 1.60×, and the difference is a template
  that now actually renders.

- **`sideEffects` did not list `dom-stubs.js`.** The entry schedules its sweep sentinel and installs
  its own copy of the fast-spy prototype on import, so it is a side-effect module, and the field said
  otherwise. Verified rather than reasoned: a two-line esbuild entry point whose only statement is
  `import 'vitest-auto-spy/dom-stubs'` bundled to **0 bytes** without the glob and 8 853 B with it.

- **`coverage-include-recompiles-globs` gave Vitest 5 advice about a bug Vitest 5 fixed.** The check
  described a provider that recompiles the pattern list on every filename, which stopped being true
  in `BaseCoverageProvider.getGlobMatchers()`. The measurement behind it stands and still applies to
  the versions the package supports (peer `>=2.1.0`), so the check is gated on the installed major
  instead of being removed, and its message names the mechanism correctly.

### Internal

- **`node:test` ran on a flag Node 26 removed.** `test:node` passed
  `--experimental-transform-types`, which Node 26 dropped along with the transform behind it, so the
  job died on `node: bad option` before a single test — and 26 is in the matrix on purpose, next to
  22 and 24. Dropping the flag is not enough on its own: strip-only mode is the whole of what Node 26
  has, and it rejects a parameter property with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. The ten in
  `fast-spy`, `function-spy`, `nest-unit` and `observable-spy` are now a field and an assignment,
  which is what the compiler emitted for them anyway under `useDefineForClassFields: false`. The
  suite is its own guard from here: with no flag it runs strip-only on every Node, so non-erasable
  syntax reaching the `/node` graph fails `npm run check` on the maintainer's machine instead of one
  job on CI. 27 tests pass on 22.23.1, 24.19.0 and 26.7.0.

- **The heap-plateau invariant grew an arm that can actually fail, and three more populations.**
  The existing arm sweeps with `vi.clearAllMocks()` inside the cycle, and on Vitest 5 that *empties*
  the mock registry — so a regression back to `vi.fn()` would have plateaued at `ratio 1.000` and
  passed. The new arm runs the same cycle without the sweep, where the registry only grows; put on
  the runner engine it fails at `ratio 1.488` with the heap climbing to 610 MB, while every sweeping
  arm stays green. The cycle is also parameterised over four factories — the class spy materialised
  and untouched, `createAutoMock` and `mockDeep` — since they retain along four different routes.
  Together, +0.5 s on `test:invariants`.

- **The docblocks on `mock-registry.ts` described `@vitest/spy` before version 5.** They said mocks
  enter one module-level `Set` on creation and that nothing removes them. On 5, `REGISTERED_MOCKS`
  holds `WeakRef`s drained by a `FinalizationRegistry`, `clearAllMocks()` walks `DIRTY_MOCK_STATES`
  instead, a mock joins that on its first *call*, and `mockClear()` takes it back out. The code was
  right; the comment that a reader would use to decide whether the epochs can be touched was not.

### Size and memory

**Doubles got lighter, measured on `bench:memory` (2026-09-10, Vitest 5.0.0).** A materialised
method retains **1 923 B** where it retained 1 971, because the helper bundle now lives on the
prototype every fast spy inherits instead of being copied onto each spy — 48 B per materialised
method, in every arm and both widths. An untouched `createAutoMock<T>()` retains **705 B** where it
retained 1 249: its Proxy handler used to be an object and seven trap closures per double, and it is
now one handler for the whole run with everything that varies kept on the Proxy's own target. A
runner-backed mock (`setSpyEngine('runner')`, Bun, `node:test`) is a foreign object with no
prototype of ours and still gets the copy. The stream handle is built on the first stream helper
rather than on every spy.

**`dist/shared-state.js` is 7.3 kB → 4.9 kB.** `guardAccessorSpies` lived in `mock-adapter.ts`,
which is pinned into that file, so it dragged `redefine-failure` and its whole message in with it —
a sixth copy of code every entry's graph already carried. It now lives in
`redefine-accessor-spy.ts`, next to the `defineProperty` that raises the failure.

**Entry sizes**, against the 5.3.0 baseline: `.` +0.22 kB (+1.4 %), `/angular` +0.17 kB (+0.8 %),
`/bun-angular` +0.27 kB (+1.5 %), `/react` / `/vue` / `/svelte` +0.10…0.11 kB (+0.6 %). That is the
new code — the shared-prototype path, the singleton auto-mock traps, the kept-template branch, the
memoised NgModule verdict and the defaults table. Four entries went the other way on the
shared-state split: `/dom-stubs` −0.09 kB, `/setup` −0.07 kB, `/diagnostics` and `/jasmine-compat`
−0.03 kB each. Total across all twenty-one: 230.1 kB.

**`/rxjs` is the one entry over 3 %: +88 B on 2.19 kB (+4.0 %), and it is worth naming exactly.**
The rxjs stream helpers now go on the shared prototype like every other bundle, so `observable-spy`
reaches `attachHelpers` in `spy-decoration`, which reaches `isFastSpy` in `spy-probe` — and that puts
`spy-probe` into the chunk this entry downloads, `isThenable` included, which `/rxjs` never calls.
The shared chunk goes 1 942 → 2 795 B raw for it. Extracting `isThenable` into a module of its own
was tried and measured: it saved nothing on `/rxjs` (+1 B) and made the whole package **570 B
larger**, because a fifth chunk boundary costs more than the function does. So the 88 B stays, and
what it buys is seven fewer own property slots on every materialised spy in a suite that loads
`/rxjs` — which, in an Angular suite, is every suite.

**Memory is flat and creation is not slower.** Against the published 5.3.0, on the `/node` entry over
100 000 spied methods, median of seven: **2.89 kB per spied method either side**, 25.75 kB per lazy
spy either side, spy creation **21.7 → 21.0 µs** (−3.2 %) and the first call of every method
**4 459 → 4 331 ns** (−2.9 %). The prototype-shared helper bundle and the singleton auto-mock traps
pay for the defaults table's registry lookup rather than the other way round.

## [5.3.0] - 2026-09-10

**Why upgrade.** A first lint run on a suite that has not chosen `renderShallow` is no longer red:
`prefer-render-shallow` is a `warn` in `configs.recommended`. Every rule also has its own anchor in a
reference page, so a config can link to the rule it turns down.

### Documentation

- **A per-rule reference, separate from the setup page.** `docs-site/utilities/eslint-rules.md` gives
  each of the twenty-three rules a section under a stable anchor —
  `…/utilities/eslint-rules#no-bare-called-with` — so a consumer's config can link to the rule it
  turns down instead of to a page. Each section answers the six questions a thematic table cannot:
  what counts as a finding, what the rule _decides on_ (AST shape, a name, the whole file, or the
  type checker, which is what tells a reader when it will stay quiet and when it will be wrong), the
  finding before and after, the concrete failure a suite gets without it, where it reports working
  code and what quiets it, and why its severity is what it is. `docs-site/utilities/eslint-plugin.md`
  stays the page about installing it. Russian at `docs-site/ru/utilities/eslint-rules.md`.

- **Three severities the docs still reported from before 4.0.0.** `prefer-native-spy-api` and
  `jasmine-namespace-without-entry` ship at `error` and have since 4.0.0, but the rule table in
  [Migrating from jasmine-auto-spies](https://asdalexey.github.io/vitest-auto-spy/migrating-jasmine)
  still listed them as `off` and `warn`, and both the editor-diagnostics page and the agent skill said
  in prose that `prefer-native-spy-api` is `off` in `recommended`. It is a rule a suite switches off
  for itself while the bridge is still in place, which is what all four now say. The
  editor-diagnostics page also counted twenty rules in its description where the body counts
  twenty-three.

### Changed

- **`prefer-render-shallow` ships as a `warn` in `configs.recommended` rather than an `error`.** It is
  the one rule in that config whose finding is not a defect. Every other rule there names something
  wrong or dead — a double that drifts from the class it stands in for, an assertion that never runs, a
  provider the container already dropped, a schema guarding nothing — while this one names a file that
  could be rendered more cheaply. Moving a suite onto `renderShallow` is an architectural choice a
  project takes or declines, not a repair, and at `error` the plugin was gating that choice: on the
  1759-spec-file suite the rule was measured against it reports **491 times across 398 files**, so the
  first run is red and every such consumer answers it by downgrading the rule in its own config — a
  `recommended` whose job was to be overridden. Nothing about what the rule reports or how it reports
  it has changed, and a project that has taken the decision sets `'error'` in the same one line the
  docs already describe for turning a rule down. `{ templates: 'never' }` is still documented as
  `['error', { templates: 'never' }]`: the array form carries the severity as well as the option, which
  is the right way round for a project spelling the policy out.

## [5.2.0] - 2026-09-10

**Why upgrade.** A spy's composition can live with its class instead of in every spec that doubles
it, three lint rules report what review was finding by hand — including the first type-aware one —
and `overload` is chosen per method rather than for a whole type.

### Added

- **`prefer-observer-stub` — the observer stub that was already written.** Reports an
  `IntersectionObserver` / `ResizeObserver` / `MutationObserver` constructor replaced by hand, in the
  three spellings it is written in — `globalThis.X = class { … }` (cast, computed key or a name
  declared above it), `vi.stubGlobal('X', Fake)` and `vi.spyOn(globalThis, 'X')` — and names
  `stubIntersectionObserver()` / `stubResizeObserver()` / `stubMutationObserver()`, which is the same
  block in one line. The message spends its length on the half nobody guesses: the save and the
  `afterEach` restore are not the author's to write, because the helper installs through
  `mockValueProp` and `restoreMockedProps()` runs the undo after every test. That half is a defect
  rather than verbosity — a restore parked at the end of an `it` runs only if every assertion above
  it passed, so the first red test leaves the stub live for the rest of the file and, under
  `isolate: false`, for every later file the worker picks up.

  Measured over the Angular monorepo of 1 759 spec files it was written for, at the commit before that
  suite moved onto the helpers: **six spec files** replaced a global observer by hand — four with a
  module-scope `global.IntersectionObserver = vi.fn(() => ({ … }))`, two with
  `vi.stubGlobal('IntersectionObserver', …)` over four call sites. Eight spec files call the helpers
  today and those two still do not, which is what a rule is for: nothing but review was going to find
  them. One of the hand-rolled ones carried a comment saying there was no other way.

  Three shapes match and stay silent by construction: the restore itself
  (`globalThis.IntersectionObserver = original`), because what is assigned is a name holding whatever
  was read out of the global rather than a double; a real implementation from a polyfill
  (`window.ResizeObserver = ResizeObserver`), which is application code doing its job; and a receiver
  that is not the global object, such as a fake `window` a spec hands to the code under test.
  `Object.defineProperty(globalThis, 'ResizeObserver', …)` is left to `no-object-define-property`,
  which already reports every `defineProperty` in a spec and names the same helper family — two rules
  on one line would say the same thing twice.

- **`registerAutoSpyDefaults(Class, config)` — a spy's composition lives with the class, not in 109
  specs.** Register once from a setup file and every `provideAutoSpy(X)` / `createSpyFromClass(X)`
  starts from it, **merged** with whatever the call site adds rather than replaced: lists unioned,
  `returns` and `overrides` merged key by key, scalars won by the call site, and the bare-array form
  taken too. `clearAutoSpyDefaults(Class)` drops one, `clearAutoSpyDefaults()` the lot.

  The reason is not repetition. Measured over one Angular suite: 739 of 2228 `provideAutoSpy` calls
  carry a configuration, and one class collects incompatible opinions — `Router` 122 calls in 109
  files with **23 distinct configurations**, `AccountService` 70/62/**27**, `PurchaseStateService`
  53/52/**25**, and the `*RemoteConfigService` family 205 calls with 120 repeating
  `{ gettersToSpyOn: ['remoteConfig'] }` word for word. The list options are additive and never
  complain about a name they cannot find — deliberately, since they exist to name members no
  prototype carries — so 23 opinions about `Router` means most of those files do not spy `events` at
  all, and the day production grows a subscription to it not one of them says so. **By class
  identity, not by inheritance**: a registration on a widely-extended base changing doubles in files
  nobody was looking at would relocate that failure rather than remove it. A second registration for
  the same class replaces the first, for the same reason.

- **`enableAngularDiagnostics({ shadowedProviders })` — the double the component never got.** A
  component that declares its own `providers` resolves them through its **node** injector, so a
  `provideAutoSpy(X)` on the testing module never reaches it: the component runs against the real
  service, the double records nothing, and an assertion that it was *not* called passes for the wrong
  reason. The check compares every double the module registered with what the component actually
  resolved, and names each token that lost. Measured: of 71 component specs whose subject declares
  its own `providers`, 43 register the same token on the module and **7 do nothing else** — while
  `overrideComponentProvider`, which repairs it in one line, had **zero** uses in that repository.
  That is the argument for the check rather than against the helper: it cannot be found from the
  symptom, because there is none. Silent when what the component resolved is itself a double, so a
  spec that already reached for `TestBed.overrideProvider` or `overrideComponentProvider` is left
  alone. `assertNoShadowedProviders(component, fixture)` is the same check, callable, for a spec that
  renders through a helper of its own.

- **`no-dead-schemas` — `schemas` on a testing module that declares nothing.** A schema is a property
  of the module's `declarations`; a standalone component brought in through `imports` carries its own
  dependency scope and the schema never reaches it. The static twin of
  `enableAngularDiagnostics({ deadSchemas })`, which knows more but throws inside `it()` — a suite
  yields its list one red run at a time, where the rule hands over all of it at once. Measured over
  one Angular suite: of 333 files mentioning a schema, **230 entries in 204 files** are dead
  (`apps/smart` 63, `libs/purchase` 61, `apps/web` 22, `libs/gamification` 22). Nothing is being
  silenced, so this is not a green-and-wrong test — what the line costs is a false sense of
  protection, and the day somebody adds `declarations` it starts being true and a template typo
  quietly stops being an error. **The file decides, not the call**: Angular merges successive
  `configureTestingModule` calls, so a `declarations` anywhere in the file silences the rule for all
  of it, and a list the rule cannot count (a spread, a name, a helper call) reads as present.

- **`no-private-member-access` — the rule that reads types, and the only one that does.** It reports
  the three spellings that get a spec past a modifier: `instance['privateMember']`, which compiles
  because TypeScript checks visibility on the dotted form only (bracket access is also how an index
  signature is read); `(instance as any).privateMember` — and `as unknown as { … }`, and a decoy
  interface declared in the spec — where the access *was* checked, against a type substituted a line
  earlier; and `vi.spyOn(Object.getPrototypeOf(component), 'privateMethod')`, which patches the
  prototype every instance in the worker shares. All three pin a member no caller can reach, so a
  rename is a green refactor that turns red in a test file and proves nothing about the public
  surface. A cast chain is walked to the bottom, because the middle of `as unknown as …` is `unknown`
  and answers nothing; a dotted access with no cast in front of it is never resolved, which is both
  correct and what keeps the rule off every `a.b` in the file.

  **Type-aware by necessity, with a number behind it.** Measured over a 1759-file Angular spec
  corpus: a syntax-only version of the bracket half reports **511 sites in 85 files**, of which
  **324 in 45 files** are really `private` / `protected`. The other **187 (37 %)** are correct code —
  `process.env['KEY']`, `dataset['error']`, a route's `queryParams['id']`,
  `form.controls['profileName']`, `errors?.['required']` — and **41 of those 85 files hold no private
  access at all**. So nothing is reported unless the checker resolves the name to a class member
  carrying the modifier, the name is taken from the **type** of the key (`const KEY = 'secret';
  card[KEY]` resolves; `card[key]` with a plain `string` does not), and without
  `parserOptions.project` / `projectService` the rule reports nothing at all rather than falling back
  to the syntax. The cast and prototype halves need no types and work either way — **50** casts in 10
  files and **9** prototype spies in 3 on the same corpus, for **383 findings in 55 files** in total.

  There is deliberately **no paired helper**: an export for reading a private member would legitimise
  what the rule is for. The message names the way out instead — the public API that reaches the
  member, or, on a component, the rendered template, which is the surface `protected` exists for.

- **`overload` takes a map, so the choice can be named per method.** `Spy<T, { overload: 'first' }>`
  moves *every* overloaded member at once, which on a wide type breaks the ones nobody was fixing —
  putting it on `Spy<Response>` for one method collected five `TS2769`s on `download` in the same
  file, and the workaround reached for instead was widening `mock.calls[0]` to `unknown[]`.
  `Spy<Performance, { overload: { getEntriesByType: 'first' } }>` moves that member and leaves its
  siblings on the default. A name the type does not have never matches, so a rename leaves a dead
  entry rather than a red build — the same trade `instanceMethodsToSpyOn` makes.

  The default stays `'last'`, and that is a decision rather than an omission: "the useful signature"
  is not decidable from the type. A generated `observe` client wants the first, a four-overload
  `api-mgw` client wants the last, and both live in one suite; separating them structurally would
  mean naming Angular's `HttpEvent` in a declaration this package ships, which nothing here is
  allowed to do. What the docs now say out loud is the reason to name the method rather than trust
  the default at all: **overload order is not always the author's.** A `declare global` in a
  third-party package appends a signature to a global interface — `web-vitals` does exactly that to
  `Performance.getEntriesByType` — so which one `ReturnType` reads depends on which packages are in
  the program, and can move on a dependency bump with nothing in the diff to say so.

### Documentation

- **The `vitest/expect-expect` pairing, as a convention rather than a list.** `assertFunctionNames:
  ['expect*', 'assert*', '**.expect*']` covers this package's `expectEmission` family, its `assert*`
  helpers and a helper reached through an object, and needs no edit when a suite grows another one.
  Measured over 1759 spec files: zero false positives. Naming helpers one by one does not survive
  contact with a real suite — in that one a genuine assertion helper was called `find`, and listing
  `find` swallows every `Array.prototype.find`.

- **Replacing a hand-rolled global observer stub**, next to `stubIntersectionObserver` and friends:
  the nineteen-line `global.IntersectionObserver = class { … } as unknown as typeof IntersectionObserver`
  against the one-line helper, and what the helper adds — a double the spec can drive, a patch
  `restoreMockedProps()` undoes on its own, and no cast. The page links to
  `prefer-observer-stub`, which reports the hand-rolled form rather than leaving it to review.

- **`overload` is now findable from the message that leads to it.** The symptom is a stub of the
  real response shape being rejected — `TS2345: Argument of type 'Page' is not assignable to
  parameter of type 'HttpEvent<Page>'` — with nothing in it about overload order, and the workaround
  it attracts is `@ts-expect-error`: in one migration, sixty of them across twenty-five files while
  another person on the same codebase found `{ overload: 'first' }`. The wording now appears
  verbatim next to the option — in `SpyOptions.overload`'s own JSDoc, in `spy-typing`, in `AGENTS.md`
  and in the skill's symptom table — and a type test pins the helper half of it (`nextWith`'s
  parameter, not only `ReturnType`).

  **Putting the hint in the compiler's own text was tried first and does not pay**, which is
  recorded in `spy-typing` so it is not retried. It works: a payload named
  `OverloadCollapsed_UseSpyOverloadOption<HttpEvent<Page>>` does print, because a type alias whose
  body builds a union keeps its name in a `TS2345` where a pass-through alias is erased. It fails on
  everything else. Cost — the flag has to be decided per member, which stops the payload bundles
  being shared between members: a flag whose body is the constant `false`, with no overload
  detection at all, already takes `types:budget` from a delta of **9 665 to 11 769** against a
  ceiling of 11 000, and detection adds ~840 more (the cheapest probe measured 12 605, the most
  obvious one 16 355). Precision — on a four-overload `api-mgw` client, where `'last'` is already
  right, an honestly wrong stub reads `OverloadCollapsed_UseSpyOverloadOption<Movie[]>` and is sent
  to an option that would change nothing. Coverage — `mockReturnValue` is typed by
  `MockInstance<Method>`, the runner's own surface, which nothing this package wraps can reach.

### Fixed

- **Two pieces of state this release added were per-bundle, and only the published package could
  show it.** tsup inlines the core into every entry bundle, so a module-scoped variable is one
  variable per entry point — and both new features are split across entry points by construction.
  `registerAutoSpyDefaults` in a setup file importing `vitest-auto-spy` did not reach a
  `createSpyFromClass` importing `vitest-auto-spy/vue`; the registration went into the root bundle's
  map and the double was built from the Vue bundle's empty one, with nothing said. Worse, the
  outside-a-hook epoch: `setupAutoSpy` ships only from `vitest-auto-spy/setup` and the `mock*Prop`
  helpers only from the core entries, so the `beforeEach` advancing the counter and the call
  stamping a patch with it were **always** in different bundles — every correctly placed
  `mockValueProp` came out stamped `0` against a sweep counting from its own copy, and the new
  report fired on exactly the code it exists to bless, once per patch per test, on the default
  `'warn'`. Both now live on `globalThis`, where the patch journal already did for a related reason.
  Every spec in `src/**` imports source, where there is one module and no split, which is why a
  green gate said nothing; `smoke:dist` grew a case for each, and it now runs five cross-entry
  checks over the built package instead of three.

- **A rule that asks for types could take the whole lint run down, and on CI it did.**
  `no-private-member-access` asks the checker to resolve a member, which makes TypeScript check the
  file — and building one of *its* error messages throws on TypeScript 6.0.3 when the message has to
  name a symbol from another module and the program carries neither `paths` nor `baseUrl`
  (`getLocalModuleSpecifier` reads a path that is `undefined`). That program is precisely what
  `@typescript-eslint/parser` falls back to: an isolated one-file program, handed over the **second**
  time a single file is parsed in single-run mode — a mode it infers from `CI=true`, so the failure
  exists only where nobody debugs. The throw came back out of the rule and ended the run, taking
  every other rule's findings with it. The rule now answers a compiler that throws the way it already
  answers a parser with no program at all: silence, because a program that cannot see the class has
  nothing to say about it. Two tests pin it — one hands the rule a checker that throws, one parses
  one file twice with the inference on — and the rule's own suite no longer changes behaviour with
  the environment.

- **A `mock*Prop` patch made outside a per-test hook is now reported instead of quietly expiring.**
  `restoreProps` undoes a patch after the test **during which it was applied**, whenever it was
  created — so one written in a `describe` body, or in `beforeAll`, survives exactly one test and is
  never put back. The first test passes, every test after it reads the real member, and the failure
  arrives as `… is not a function` nowhere near the line that caused it; found in six files of one
  suite at once during a bulk move onto `mockValueProp`. `setupAutoSpy` now names the property and
  the hook to move the call to, graded by `propsOutsideHooks` — `'warn'` (default), `'throw'`,
  `'off'` — and `reportPropsOutsideHooks` sets the same dial for a suite that wires its own hooks.
  Reported once per object **and** property, keyed by the object rather than the name so that two
  files of one worker patching the same member name are both named under `isolate: false`.

  Reported rather than repaired, and the distinction is the point. The sibling defect —
  `restoreMocks: true` taking accessor spies off a double built anywhere but a `beforeEach` — was
  fixed silently because no spec could have meant it. This one has a legitimate reading and a
  one-line repair, and re-applying the patch on every test would defeat what `restoreMockedProps()`
  is for: keeping a patch from outliving its file, which is exactly what a self-restoring patch would
  do under `isolate: false`.

- **A generic class's declared default type argument reaches the double.** `class
  RemoteConfigService<T = RemoteConfigDefaults>` handed to `createSpyFromClass` or `injectSpy`
  inferred `T` as `unknown`, so every member typed against it read as `unknown` — on a class that
  had declared exactly what it should be, with nothing in the failure naming a type parameter. Two
  shapes caused it and both are gone: `ClassType<T>` carried an `& { [key: string]: any }`
  intersection (an index signature makes inference drop a default), and `injectSpy`'s token
  parameter was a union (a union drops it too, so the class case is now its own overload ahead of
  it). Spelling the argument out keeps working, and is still the answer for a class with no default.
  A generic **method** — `show<T, U>(…)` on a modal or factory service — still collapses to
  `unknown`, because no mapped type in TypeScript can carry a generic signature through
  `Parameters` / `ReturnType`; that limit is now documented rather than left to be rediscovered.

- **`restoreMocks: true` no longer takes the accessor spies off a double before its test runs.**
  `gettersToSpyOn` / `settersToSpyOn` were installed with `vi.spyOn`, the only call in this package
  that writes to the runner's restore registry — and `restoreMocks: true` empties that registry in
  `onBeforeTryTask`, which runs **before** the `beforeEach` hooks and after `beforeAll` and the
  `describe` body. A double built anywhere but a `beforeEach` therefore arrived at its test with the
  spied accessors put back to the no-op scaffolding, while `accessorSpies.getters.x` stayed a live
  mock nobody read any more: `mockReturnValue` kept answering and the property kept answering
  `undefined`. The report was `Cannot read properties of undefined` inside the code under test, with
  nothing in it naming `restoreMocks`, `spyOn` or `accessorSpies`. The Vitest and Rstest adapters now
  install accessor spies by redefining the property, which is the path the Bun and `node:test`
  adapters have always taken — so an accessor spy is this library's to reset and nobody else's to
  restore, on all four runtimes. `vi.clearAllMocks()` / `vi.resetAllMocks()` and the `clearMocks` /
  `mockReset` config keys still reach them, through the same sweep sentinel the method spies use, and
  the non-configurable-property diagnostic is unchanged. It fixes the same failure on
  `createSpyFromInstance`, whose accessor patch was journalled by `mockAccessorsProp` and then
  redefined on top by a spy the runner owned. `mockReadonlyProp` and the other `mock*Prop` helpers
  were never affected — they keep their own journal — and that asymmetry between two helpers for one
  job is what made the failure hard to place.

- **`no-inject-before-override` reads `injectSpy()` and `renderShallow()`, not only the `TestBed.`
  spellings.** `injectSpy(X)` *is* `TestBed.inject(X)` and `renderShallow` ends in
  `TestBed.createComponent`, so the file the rest of the plugin had just rewritten was exactly the
  file this rule stayed silent on: an `injectSpy` in `beforeEach` above a `TestBed.overrideComponent`,
  failing at run time with `Cannot override component when the test module has already been
  instantiated` and reported by nothing. Found by hand in a migrated suite.
  `TestBed.runInInjectionContext` joins the member-call selector for the same reason; a member call
  such as `moduleRef.injectSpy` — the two-argument NestJS form, which reaches no TestBed — is still
  ignored.

### Changed

- **The Rstest entry no longer passes `rstest.spyOn` to the adapter**, since accessor spies are
  installed by redefinition on every runtime now. `RstestApi` is `{ fn }` alone.

### Internal

- **The `node:test` adapter is now proven on `node:test`.** It was the one adapter with no suite of
  its own: `src/bun-tests/` runs the Bun entry on Bun and `src/rstest-tests/` runs Rstest through its
  bundler, while everything Node-shaped was asserted against a stub under Vitest — which cannot load
  `node:test` at all. `npm run test:node` runs `src/node-tests/` (27 tests over the core surface, the
  mock naming, the swappable tracker and the emission helpers) on the real runner, and it is in the
  gate and in the CI matrix, so it runs across the whole declared `engines` range. The suite loads
  the TypeScript sources directly through `scripts/node-ts-resolve.mjs` rather than a bundle, because
  `sideEffects: false` lets any bundler tree-shake `src/node.ts`'s `registerMockAdapter(...)` call
  away — which would quietly delete the thing the suite exists to prove. What it does prove that
  nothing else could: a spy reports the method's own name to `util.inspect()` and to `node:assert`
  diffs, and keeps it through `resetCalls()`, `restore()` and a tracker-wide `mock.reset()`.

- **`bench:check --update` stamped the wrong command over every baseline it rewrote.**
  `scripts/bench-check.mjs` hard-coded the *self*-benchmark's command line into `generated.command`,
  so regenerating `bench-angular/baseline.json` recorded a recipe that had never produced it — and
  dropped `generated.note`, the paragraph saying why those numbers were not re-measured for the
  Vitest 5 port. Both went back in by hand after every run, which is the kind of step that gets
  skipped once and then believed. `--update` now rewrites only what the run measured — ratios,
  reference arms, date, Node version — and carries the command and the note forward from the file it
  overwrites; `--command "<text>"` records a new line when the recipe itself changes. Argument
  parsing marks the indices a value-taking flag consumes instead of testing the one position after
  `--baseline`, so a value that looks like a results path or like a flag is no longer mistaken for
  one, and `--help` reads the header up to the first non-comment line rather than to a hard-coded
  line number.

### Size and memory

`/eslint-plugin` is **+3.33 kB** (18 229 → 21 564 B min+gzip, +18.3 %), and all of it is the three
new rules: `no-private-member-access` (226 lines, the only type-aware rule in the plugin and the
largest of the three), `no-dead-schemas` (123) and `prefer-observer-stub` (252), plus the shared
`rule-types` surface the type-aware one needs. The entry is a subpath no runtime imports — a lint
config loads it, a spec never does — so the weight lands on the ESLint process and on nothing else.

The other entries move by what the release added to the core: **+760 B** on `.` / `/rstest` (+5.0 %)
and +750 B on `/react`, `/vue` and `/svelte` (+4.9 %), +570…680 B on `/bun`, `/node` and
`/bun-angular`, which is `registerAutoSpyDefaults` and its merge (145 lines) plus the epoch journal
behind the outside-a-hook report (117). `/setup` is **+570 B** (+4.6 %) for the report itself, and
`/angular` **+1.18 kB** (+6.3 %) for `shadowedProviders` and `assertNoShadowedProviders` — the
component-def walk and the injector comparison behind them. `/jasmine` and `/nestjs` take **+230 B**
each and `/console` and `/dom-stubs` **+100…120 B**, all under 2.5 % — the share of the same core
each of them pulls in. `/rxjs`, `/diagnostics`, `/angular-http`, `/jasmine-compat`, `/observer-spy`
and `/zone` are unchanged.

Memory is flat — **2.89 kB per spied method, unchanged** over 100 000 of them — and so is the first
call of every method, at **4 265 ns** either side. **Spy creation costs about 7 % more**: 18.5…20.4
against 20.3…21.9 µs on a 100-method class, five independent runs of a median of seven landing
between +4.9 % and +9.8 %, so the spread is wide but the sign never turns. It is
`mergeAutoSpyDefaults` on the creation path — every `createSpyFromClass` now asks the registry
whether the class has one, and building the same package with that one call removed puts creation
back to parity (−6.5 % and +0.6 % on two runs). About **1.4 µs on a 100-method double, 14 ns per
spied method**, against a feature that removes a repeated configuration from every spec that doubles
the class; kept, and the number is written down here so a later release cannot spend it twice.
Measured on the `/node` entry against the published 5.1.0.

## [5.1.0] - 2026-09-09

**Why upgrade.** A wrong stub on a spied method is now a compile error instead of a green test, the
same suite runs on Rstest by rewriting one import, and `configs.typeErrors` spreads the two lint
rules that should not be downgraded to `warn`.

### Added

- **`vitest-auto-spy/rstest` — the same core on Rstest, the Rspack-powered runner.** The entry
  registers an adapter over `rstest.fn()` / `rstest.spyOn()`, and the public API is the Vitest one
  name for name, so a spec moves between the two by rewriting its import. Rstest implements the
  Jest/Vitest mock surface, which is why none of the `node:test` differences apply here:
  `spy.method.mock.calls[0]` is a bare argument array, the `mockReturnValue` family is native, and
  `gettersToSpyOn` / `settersToSpyOn` go through `rstest.spyOn(obj, 'prop', 'get' | 'set')` instead of
  the redefinition fallback. The library's method spies come from its own engine rather than the
  runner's, so a run-wide clear needed a bridge: the entry plants one sentinel mock whose `mockClear`
  / `mockReset` sweep them, and `rstest.clearAllMocks()`, `rstest.resetAllMocks()` and the
  `clearMocks: true` / `resetMocks: true` config keys all reach a double built by
  `createSpyFromClass`, with nothing to enable.

  Two things are deliberately not part of it. `vitest-auto-spy/setup` is wired to Vitest's hooks —
  on Rstest, import the entry once in the setup file, which is the part a setup file is for. And
  `trackNodeMocks()` stays `node:test`-only: Rstest drops its mock registry between files, like
  Vitest and Bun, so there is nothing to track.

  `npx vitest-auto-spy init` and `doctor` recognise an Rstest project — `@rstest/core` in the
  dependencies, or `rstest` in a test script — and write `vitest-auto-spy/rstest` into the agent
  instructions instead of the Vitest entry. The suite runs on the real runner in the gate
  (`npm run test:rstest`), against the built package rather than the sources. A new entry point costs
  a new bundle and nothing else: `./rstest` is 15.30 kB min+gzip, and no existing entry moved by more
  than 0.02 kB. Rstest is 0.x; Vitest remains the zero-config default, and this entry is for a suite
  that already runs on Rspack.

- **`configs.typeErrors` — the rules whose findings do not compile, as a config you can spread.**
  `configs.recommended` grades every rule `error`; a suite landing the plugin on an existing codebase
  routinely rebuilds that map as `warn` and fixes in batches. Two rules should not go with it, and the
  recipe used to say so by having the reader copy their names back: `prefer-as-spy` reports `TS2352`
  and `no-mocked-for-spy` reports `TS2322`, by construction rather than by luck, so "fix them in
  batches" does not describe them — the type gate fails first, with errors that never name the rule
  that already found them. Both are `--fix`, so keeping them at `error` costs one `eslint --fix` run.
  Spread `...autoSpy.configs.typeErrors.rules` after the downgrade instead of maintaining two string
  literals in your own config. Nothing in `recommended` changed.

### Changed

- **A spied method rejects the *stub* the real one rejects, not only the arguments.** `Spy<T>`
  carried the mock surface as a bare `MockInstance`, whose type parameter defaults to `Procedure` —
  `(...args: any[]) => any` — so every helper that *configures* a double took `any`.
  `spy.getPosters.mockReturnValue(42)` compiled on a method returning `Poster[][]`, so did
  `mockReturnValue(undefined)`, and so did `mockImplementation(() => of(null))` on one returning
  `Observable<Token>`; the spec then stayed green until production code read the value. This was the
  other half of the 3.13.0 fix that stopped a double accepting *calls* the real method rejects, and
  the asymmetry it left behind was visible one line away: the `calledWith(…)` continuation has always
  typed `mockReturnValue` against `ReturnType<Method>`, while the bare call next to it accepted
  anything.

  The surface is now `MockInstance<Method>`. `mockReturnValue` / `mockReturnValueOnce` take
  `ReturnType<Method>`, `mockImplementation` / `mockImplementationOnce` / `withImplementation` take
  `(...args: Parameters<Method>) => ReturnType<Method>`, `mockResolvedValue` takes the awaited
  return, and `mock.calls`, `mock.lastCall` and `getMockImplementation()` come back typed instead of
  `any[]`. The zero-argument `mockReturnValue()` on a `void` method still compiles — that overload
  is this package's own and is unaffected — and the overload selected by `Spy<T, { overload: 'first' }>`
  is the one the stub is checked against.

  Reported twice independently while a large Angular monorepo moved 122 specs off `jest-auto-spies`,
  each time with a standalone `tsc --strict` probe rather than an inference, because a typed spy that
  accepts a wrong stub reads as a spy that is not typed at all.

  **This tightens type checking on existing suites**: a `mockReturnValue` / `mockImplementation` /
  `mockResolvedValue` that stubbed the wrong shape used to compile and now does not. Nothing changes
  at run time, and this repository's own suite needed no edit. Cost measured on the `types:budget`
  fixture: 9044 → 9318 instantiations, against a budget of 11 000.

- **`Spy<T>` and `DeepMockProxy<T>` keep `readonly`, and `mockValueProp` is how a double is
  rewritten.** Both are homomorphic mapped types, so a `readonly` member of the source type arrives
  `readonly` on the stand-in for it. Dropping the modifier was tried here first, on the argument that
  the runtime never had the restriction, and it is reverted: it made a plain assignment compile
  everywhere — including on a member replaced by a **spied accessor** (`gettersToSpyOn`), where the
  write reaches the setter spy and the getter goes on answering `undefined`. That trades a `TS2540`
  fixable in one line for a silent no-op at run time, which is the defect class the stub-typing
  change in this same section removes.

  Measured on a spied accessor rather than argued, and the middle row is the trap worth naming:

  | write | getter after | setter spy | returned |
  | --- | --- | --- | --- |
  | `double.token = 'x'` | `undefined` | recorded | — |
  | `Reflect.set(double, 'token', 'x')` | `undefined` | recorded | **`true`** |
  | `mockValueProp(double, 'token', 'x')` | `'x'` | — | — |

  So `Reflect.set` is **not** an escape hatch: it invokes the same `[[Set]]`, is equally inert, and
  reports success. `mockValueProp` redefines the property as a data slot, which is why it is the one
  that works on a plain member and on a spied accessor alike — and its checked overload
  (`K extends keyof T`) already accepts a `readonly` member, because `readonly` does not remove a key
  from `keyof T`. For a suite that would rather write assignments to data properties, `Mutable<T>` has
  been exported since 3.5.0 and is the opt-in — `createAutoMock<Mutable<Service>>({ … })` — with the
  same caveat about spied accessors.

- **The cross-family `invocationCallOrder` mismatch is now stated where a migration meets it.** No
  behaviour change: `toHaveBeenCalledBefore` / `toHaveBeenCalledAfter` between one of this package's
  method spies and a hand-written `vi.fn()` still compare two counters that never met, and
  `setSpyEngine('runner')` is still the switch that makes them one. What changed is the description
  of it. `AGENTS.md` called the comparison "meaningless", which undersells a matcher that returns an
  **answer** rather than an error; `docs-site/migrating.md` did not mention it at all, and that is the
  page a reader is on when the regression happens — under `jest-auto-spies` both families were
  `jest.fn()`, so the assertion used to mean what it said. Measured in a converted suite: a double
  reporting `[164, 165, 167, 168, 169]` beside a `vi.fn()` reporting `[28]` for its single call in the
  same test, under an assertion that had been passing. Two tests in `fast-spy.spec.ts` now pin it —
  one that three runner calls do not move this package's counter, and an `it.fails` that the matcher
  denies an ordering that did happen — so the day the two become comparable is a red test rather than
  a quiet change of meaning.

- **`prefer-provide-auto-spy` names `overrides`, on both halves of its message.** The class-side
  message described `provideAutoSpy(Class)` as spying methods and stopped there, so the rule read as
  asking for something the class factory could not express — a member the double must *be* rather
  than answer with — and the reader reached for `gettersToSpyOn`, which is a different thing.
  `ClassSpyConfiguration.overrides` has taken property seeds since 3.5.0, with the same shape and
  semantics as `provideAutoSpyForToken`'s second argument; only the message was silent about it. The
  token-side message gained the nested case for the same reason: a bare type-driven double is one
  level deep, every key it is asked for becomes a function spy, so a request-shaped fixture needs
  `provideAutoSpyForToken(REQUEST, { headers: { get: vi.fn() } })` rather than the bare call.

## [5.0.1] - 2026-09-07

**Why upgrade.** `explainSpy` reads a double again, whatever entry point built it — from the
published package it answered `nothing configured` for every configured double.

### Fixed

- **`explainSpy` reads a double built by another entry point again.** From the published package it
  answered `nothing configured` for every configured double, whatever `calledWith` had been set on
  it. The report finds the argument map behind a spy with `map instanceof ArgsMap`, and tsup inlines
  a copy of that class into every entry point that reaches it — `dist/index.js`, `dist/angular.js`
  and `dist/diagnostics.js` each carry their own — so the map a double was built with was never an
  instance of the class the diagnostic held. `ArgsMap` now carries a
  `Symbol.for('vitest-auto-spy.args-map')` brand and the check is that brand, which every copy
  resolves to the same value. Nothing in the source suite could see this: a spec imports one copy,
  so all four metrics stayed at 100 % while the feature was dead in the package. `npm run
  smoke:dist` loads each built entry point in its own process and runs the cross-entry checks that
  do see it.

## [5.0.0] - 2026-09-07

**Why upgrade.** Three peer and engine floors that this package can actually keep, and fifteen fixes
— most of them cases where a helper reported the wrong test, left the next one dirty, or edited the
wrong span of a file.

### Changed — BREAKING

- **The Angular peer range is now `>=20.0.0`, and `@angular/platform-browser` is declared.** The
  old `>=16.0.0` was not a promise this package could keep, and the two ways it broke were both
  link-time rather than graceful:
  - `ɵSIGNAL` (`lib/run-effect.ts`) is a **value** import on the eager path of `dist/angular.js`,
    and Angular did not export it before **18**. A missing named ESM export fails the *link*, so on
    Angular 16 or 17 the symptom was not "`runEffect` is unavailable" — the whole `/angular` entry
    was unavailable, `provideAutoSpy` included.
  - `provideZonelessChangeDetection` (`src/bun-angular.ts`) arrived in **20**; in 18–19 the symbol
    was `provideExperimentalZonelessChangeDetection`, and in 16–17 there was none.

  Verified by downloading `@angular/core`, `@angular/common` and `@angular/platform-browser` 16
  through 22 and parsing their real export lists, not by reading release notes. The same check
  corrected a belief this repository held in the other direction: `platformBrowserTesting` and
  `BrowserTestingModule` are exported identically from `@angular/platform-browser/testing` in
  **every** major from 16 — what changed in 20 is that `platform-browser-dynamic` left the picture.

  Nothing supported is dropped. On Angular's own policy — 6 months active plus 12 months LTS — 16,
  17, 18 and 19 are all past end of life (19's LTS ended 2026-05-19); 20 is the oldest major still
  receiving fixes, and it is exactly this package's technical floor.

  `@angular/platform-browser` was never declared at all, although `lib/directive-matchers.ts`
  imports `By` from it as a value and the `/angular` entry needs it at runtime. Under npm's hoisted
  layout that worked by accident; under pnpm's isolated one it did not resolve. It is now an
  optional peer with the same range.

  There is deliberately **no upper bound**. A bounded range would force a release for every Angular
  major and hand consumers `ERESOLVE` for upgrading first. The real fragility is `ɵSIGNAL`, a
  private symbol, and a range cannot protect against it — reading it structurally can.
- **The rxjs peer range is now `>=7.2.0`, and the operators come from the root entry.**
  `lib/observable-spy.ts` imported six operators from `rxjs/operators`, the legacy deep path that
  **rxjs 8 removes**; the open-ended `>=7.0.0` therefore promised a version it could not serve.
  rxjs re-exported every one of them from `rxjs` itself in **7.2** (verified against 7.2.0, not
  assumed), so the import moved and the floor moved with it. No Angular consumer pays anything:
  Angular 16 through 22 all peer on `^6.5.3 || ^7.4.0`, so an Angular project already has more than
  this asks.
- **`engines.node` is now `>=22`.** The old `>=18` outlived both versions it named: Node 18 went
  end of life 2025-04-30 and Node 20 followed on 2026-04-30, so the floor promised maintenance
  nobody was giving. Node 22 is the oldest release still in Active LTS, and it is what every number
  on the performance page is measured on. `engines` is advisory in npm's default configuration — an
  install on an older runtime warns rather than fails — but a consumer running `--engine-strict`,
  and every CI image pinned by this field, will see it.
- **`flushEffects()` calls `TestBed.tick()` directly.** The `ApplicationRef.tick()` fallback existed
  for Angular below 20 and is now unreachable, and with it goes the spec that deleted `TestBed.tick`
  at runtime purely to drive that branch to full coverage.

Unchanged, and worth saying because both were checked rather than assumed: `vitest` stays at
`>=2.1.0` — every runner API this package uses unguarded exists in 2.1.0, and the one later
addition, `vi.defineHelper` (4.1), is feature-probed. `zone.js` stays absent from the peer list —
`/zone` reads `globalThis.Zone` and imports nothing from it.

### Fixed

- **`stubAbortController()` fires `onabort` exactly once under happy-dom as well as jsdom.**
  happy-dom's `EventTarget` invokes `on<type>` properties itself and jsdom's does not, so the stub's
  own `this.signal.onabort?.(event)` was a second call on one runtime and the only call on the other.
  The property is parked for the dispatch and run from a `{ once: true }` listener instead, which is
  one call on both. The DOM stubs now have a suite of their own under real happy-dom
  (`npm run test:happy-dom`, in the gate and in CI) — until this release every one of them was
  verified against jsdom alone and a `environment: 'happy-dom'` project was taking them on trust.
- **A signal's `reason` is the `DOMException` the platform produces, not `new Error('AbortError')`.**
  Code under test that branches on `signal.reason.name === 'AbortError'` — the shape the platform
  documents, and what an `AbortError`-vs-`TimeoutError` distinction is written against — took the
  `else` against the stub while passing in the browser.
- **`mockReadonlyProp` / `mockReadonlyPropGetter` no longer leave the real setter live.**
  `Object.defineProperty` over an *existing* accessor pair keeps whatever the new descriptor does not
  name, so defining `get` alone left the object's own `set` in place: a write the code under test
  made went into the real setter, silently, and the getter kept answering with the stub value. The
  descriptor now names `set: undefined`, which is what "readonly" was supposed to mean.
- **`mockDeep` keeps the call state attached when `.mock` is read before the first call.** The spy
  surface was read with the Proxy as the receiver, so the fast engine's lazy `mock` getter wrote its
  state onto the *node* while the raw spy recorded calls into its own — and
  `const state = api.getName.mock` taken at the top of a test stayed empty however often the method
  ran. Members are now read with the spy as the receiver.
- **A `delay` on `resolveWith` counts from the call, not from the line that configured it.** The
  delayed promise was built at configuration time, so `vi.advanceTimersByTime()` in the test body
  raced a timer that had already been running since `beforeEach`; a per-call entry now builds its
  promise when the call happens.
- **A spy's recorded result no longer settles on any thenable.** `settleInto` treated anything with
  a `.then` as a promise to await, and a lazy query builder's `.then` *is* the query — so reading the
  result of one call executed it, and `then` being a member another spy owned recorded a call nobody
  made. Only a real `Promise` is settled, which is the test Vitest's own runner applies.
- **A failing Angular teardown check leaves the next test a clean `TestBed`.** A throwing `afterEach`
  makes Vitest skip that test's remaining `afterEach` hooks — the framework's own module teardown
  among them — so the report named the *next* spec, dying on a stale module, instead of the one that
  leaked. Both `provideHttpTesting()`'s verification and
  `enableAngularDiagnostics({ pendingRequests })` now reset before rethrowing.
- **`provideHttpTesting()` keeps verifying after the first test of a file.** The teardown check was
  armed one shot per call, so hoisting the providers to a module constant — the ordinary
  optimisation once a suite uses the helper in a dozen places — verified test one and let every later
  test leak in silence. The setting is now the suite's policy, and each test's `afterEach` decides
  from whether that test's `TestBed` has an `HttpTestingController` at all.
- **`overrideComponentProvider` no longer fails the next test with a stale queue.** A test that
  queued an override and never rendered — an `@if` branch not taken, a spec asserting only on the
  service — left its entry and the `createComponent` wrapper installed across `resetTestingModule`;
  the next test that *did* render verified the previous test's entry against its own fixture and
  failed with a false *the override did not apply*. The queue and the wrapper are now dropped when
  the framework resets the module.
- **`extendWithAutoSpies({ providers })` wins over the generated spy, as its own documentation
  said.** The listed providers went in *before* the generated ones and Angular resolves duplicates
  last-one-wins, so naming a token to override it had exactly no effect.
- **An `until` predicate that throws fails the assertion instead of the timeout.** rxjs routes a
  throw from a subscriber callback to `reportUnhandledError` on a fresh macrotask: the run collected
  an unhandled error, the subscription and the watchdog stayed alive, and the eventual message
  blamed the silence — *did not emit within 5000 ms* — rather than the predicate. The throw is now
  caught where it happens and rejects with the predicate, the emission index and the cause.
- **The codemod stops rewriting prose inside comments and strings.** Its mask scanned with one
  `String.replace`, and the regex-literal alternative could swallow a span that began at a
  *division* — running to the next `/`, taking an unseen comment or quote with it. The span was
  handed back "unchanged" but consumed, so its contents stayed in the code mask and the transforms
  edited the sentence inside. The scan now backs up to the slash and resumes one character later, and
  a `/` is read as opening a regular expression only after a keyword or an operator.
- **The codemod keeps a comment inside an import clause attached to its specifier.** The clause was
  split on raw commas, so a comment containing one produced a specifier nobody exported; and the
  rewritten statement joined every name onto one line, which put the closing `}` and the whole
  `from '…'` *inside* a line comment — emitting a statement that no longer parses while the residue
  check, now also commented out, reported the file as fully migrated. Comments ride their specifier,
  and a clause carrying one is emitted one name per line.
- **`init` never overwrites a file it did not write.** `.cursor/rules/vitest-auto-spy.mdc` and
  `.claude/skills/vitest-auto-spy/SKILL.md` are exactly the paths a team plausibly authored before
  discovering this CLI; the owned-file plan rewrote them regardless, and `--uninstall` then deleted
  the replacement. A file present without the managed markers is now left byte for byte, and named
  in the warnings.
- **`codemod` says so when the repository scan stopped at its safety cap.** Past 50 000 files the
  scan truncates, and *Nothing left to migrate* off a truncated list is a claim about a tree the
  tool never looked at.

### Added

- **`AbortSignal.abort()`, `AbortSignal.timeout()` and `AbortSignal.any()` on the stub.** The three
  statics are how modern code makes a signal without a controller — `fetch(url, { signal:
  AbortSignal.timeout(5_000) })` most of all — and the stub had none of them, so a spec that called
  `stubAbortController()` to fix the jsdom brand-check broke the code it was trying to test.
  `timeout()` aborts through `setTimeout`, so `vi.useFakeTimers()` drives it exactly as it drives the
  platform's, and with a `TimeoutError` rather than an `AbortError` because that is the distinction
  the platform draws.
- **`video.currentTime = 0` reaches the record and fires `timeupdate`.** `media.set()` was the only
  way in, and a player restarting itself assigns the field directly — the component's own
  `timeupdate` handler stayed unrun while the assertion read the new value, which looks like a bug in
  the component. The stub's `currentTime` is now a get/set pair, and `media.set()` is unchanged.
- **`VITEST_AUTO_SPY_SCAN_CAP` raises the CLI's 50 000-file scan cap.** The truncation warning above
  tells the reader to raise the cap; this is the cap.

### Size and memory

`/dom-stubs` is **+219 B** (5 030 → 5 249 B min+gzip, +4.4 %), the one entry past the 200 B
allowance, and it is all stub surface rather than machinery: 42 B for the happy-dom `onabort`
repair, and 177 B for the three `AbortSignal` statics, the `DOMException` reasons and the
`currentTime` setter — measured by building the entry with those two files at their previous
revision. The module graph is unchanged at 2 modules, so nothing new is pulled in; the bytes are
code this entry already had to have to stand in for the platform it stands in for. Every other entry
moved under 1 %: `/angular` +192 B (+1.0 %) for the override queue and the HTTP verification policy,
`.` / `/react` / `/vue` / `/svelte` +76 B (+0.5 %), `/bun` +69 B, `/node` +67 B, `/bun-angular`
+46 B, `/setup` +4 B, `/eslint-plugin` and `/diagnostics` unchanged, `/rxjs` −12 B.

## [4.6.1] - 2026-09-06

**Why upgrade.** No user-facing changes — a README correction only. The package, its exports and its
behaviour are identical to 4.6.0.

## [4.6.0] - 2026-09-06

**Why upgrade.** One install now spans Vitest 2.1 through 5.x, and the newest lint rule stops both
lying about the file it reports and going quiet on the file it should.

### Added

- **Vitest 5 support, on the same install.** The peer range still starts at `>=2.1.0`, so one
  version of this package spans Vitest 2.1 through 5.x — no second major, no version-split types, no
  `@next` tag, and no edit to a spec. Two changes in Vitest 5 reach a spy library rather than a
  spec, and both are absorbed here. Its `clearAllMocks()` now visits only the mocks *called* since
  the last sweep, so the engine this package has shipped since 4.1 — which is deliberately not
  `vi.fn()` — makes itself reachable to that sweep; without it `vi.clearAllMocks()` and the new
  `clearMocks: true` default would have gone silently no-op on every double this library builds, and
  call history would have leaked between tests. And `Matchers` gained a second type parameter
  (`Matchers<T>` → `Matchers<R, T>`), which TypeScript refuses to merge across; the bundled matchers
  now declare themselves on Chai's `Assertion`, which carries no type parameters in either major, so
  they keep typing on 4 and 5 from one declaration. Measured 2026-09-06 on 40 spec files, 800 tests,
  400 spied methods per file, v8 coverage on, Node v24.19.0, median of five runs: the same suite
  takes **1383 ms on Vitest 4.1.11 and 1276 ms on Vitest 5.0.0** (−7.7 %), and this package's spy
  engine is worth another **−6.1 %** on Vitest 4 and **−8.1 %** on Vitest 5 over building every
  method with `vi.fn()` (`setSpyEngine('runner')`) — 1473 ms → 1276 ms end to end, **−13.4 %**. The
  one thing Vitest 5 can still break is its own default: with `clearMocks` on, a test asserting on a
  call an *earlier* test recorded reads zero. Count it in a plain variable, or set
  `clearMocks: false`. One feature is not carried over whole: `setupAutoSpy({ pruneMockRegistry: true })`
  finds long-lived mocks by walking `@vitest/spy`'s registry, which Vitest 5 no longer exposes, so
  its automatic half is a no-op there — mark the mock with `keepMockRegistered()`, which works on
  every version.

### Fixed

- **`prefer-render-shallow` no longer goes quiet on a spec that mocks `DOCUMENT`.** The rule asks
  whether the file reads the rendered template, over the whole source text, and a `DOCUMENT`
  stand-in that delegates to the real document —
  `{ querySelector: document.querySelector.bind(document), … }` — answered yes on the strength of
  its own keys. Found on a consumer suite where the single component spec that rendered a template
  nobody reads was also the only one the rule never reported. Only the `name: document.name` shape
  is subtracted, and only where the two names match: a bare `document.querySelector('.row')` still
  counts, because a fixture attached to the document is read exactly that way.
- **`{ templates: 'never' }` no longer reports a false claim about the file.** The policy setting
  reused the `'as-needed'` wording — *"nothing in this file reads either — no `nativeElement`, no
  `debugElement`, no `By.css`, no `querySelector`"* — on files chosen without asking that question,
  so the component spec with thirty-five `querySelector` calls was told it had none. `'never'` now
  states the policy, what `renderShallow` costs and buys, and the two prices it charges: a spec
  asserting on markup goes red, and coverage falls by whatever only the template reached. The second
  message costs `/eslint-plugin` +367 B min+gzip; see **Size and memory** below.

### Size and memory

`/eslint-plugin` is **+367 B** (17 584 → 17 951 B min+gzip, +2.1 %), all of it the second
`prefer-render-shallow` message — 1045 bytes of prose that `{ templates: 'never' }` needed because
the shared wording claimed something about the file the rule had not checked. It is a dev-only entry
that no application bundle loads, and the rules are the only entry where a message *is* the feature.

## [4.5.1] - 2026-09-05

**Why upgrade.** `renderShallow` and `enableAngularDiagnostics` stop cancelling each other out, so a
suite can take both of this package's recommendations at once.

### Fixed

- **`renderShallow` no longer trips `enableAngularDiagnostics({ deadSchemas })`.** It configured the
  testing module with `NO_ERRORS_SCHEMA` unconditionally, including for a standalone component,
  where a module-level schema can never reach the template — which is precisely what `deadSchemas`
  fails a test for. A suite that took both of this package's recommendations therefore could not use
  `renderShallow` at all: every call threw *configureTestingModule was given 1 schema(s) that can
  never apply*. The schema is now passed only where it can do something, which is the non-standalone
  branch that puts the component in `declarations`.

## [4.5.0] - 2026-09-05

**Why upgrade.** A twentieth lint rule that turns a measured cost — up to 20× the per-test cycle —
into something the editor points at.

### Added

- **`prefer-render-shallow`, the twentieth lint rule.** Reports a `TestBed.createComponent` in a
  spec file that never reads the rendered template — no `nativeElement`, no `debugElement`, no
  `By.css`, no `querySelector` — and points at `renderShallow(X)`, which is the same `TestBed` with
  the children dropped and the template blank. The code it reports works, so the run stays green;
  what it is about is cost, and `bench-angular/` puts a number on it: **0.24×** the per-test cycle
  at 100 children and **0.05×** at 400, while at zero children the two are level, so a leaf
  component gains nothing and the report is worth ignoring there. The question is asked of the whole file rather than of one
  fixture — a component suite parks the fixture in a `let` and reads `debugElement` three helpers
  away — so one template read anywhere silences it and the rule under-reports rather than guesses.
  It cannot see a component that reads its own template through `viewChild` or content projection;
  that one keeps `{ keepTemplate: true }`. The rewrite ships as a **suggestion** rather than a
  `--fix`: `renderShallow` configures the testing module itself, so an unattended repository-wide fix
  would change what the module holds and would throw on any spec that had already instantiated it.
  `{ templates: 'never' }` turns the same rule into the policy a project may prefer — no spec renders
  a real template at all, bar a `createDirectiveHost` harness, which is the only way a directive can
  be reached — and the option's own paragraph states what that costs: measured on one
  consumer suite, 18 of 40 tests red and coverage from 100 % to 95.7 %. It costs **+925 B min+gzip
  on `/eslint-plugin`** (16.66 kB → 17.58 kB, +5.6 %), and nearly all of that is the two report
  messages, which are paragraphs rather than sentences because a lint message that only says
  "prefer X" moves the problem. No other entry point moved a byte — the rule and its `dom-reads`
  helper are reachable from `vitest-auto-spy/eslint-plugin` alone, and nothing under `src/lib/`
  gained a runtime import.

## [4.4.0] - 2026-09-05

**Why upgrade.** `localStorage` keeps working when CI moves to a newer Node, instead of taking
eleven unrelated specs down with it.

### Added

- **`restoreWebStorage()`, and `setupAutoSpy({ restoreWebStorage })` — on by default.** Vitest copies
  a DOM environment's globals onto `globalThis` behind `if (k in global) return KEYS.includes(k)`,
  and neither `localStorage` nor `sessionStorage` is in `KEYS`; they arrived only because Node put
  neither on `globalThis`. Node's own Web Storage made the key exist, so the environment's storage
  stopped arriving: `setItem is not a function` on Node 25, `undefined` on Node 26, under jsdom and
  happy-dom alike, since the filter runs before either. The suite stays green until a spec touches
  storage, which is why this lands as "CI moved to a new Node and eleven unrelated specs died". The
  repair decides by using the storage — a namespaced key written, read back and removed — rather
  than by inspecting it, because Node 25 hands out a `setItem` that throws and the next runtime is
  free to invent a third shape. A storage that survives that round trip is left exactly as it is, so
  a spec's own stub is safe; one that does not is replaced with the window's own storage where that
  is a separate object, and with a `Map`-backed stand-in otherwise. Nothing is installed in a `node`
  environment, which is supposed to have no Web Storage at all.

### Size and memory

`/setup` gave 373 B back (+3.1 %) for the Web Storage repair, which is the entry that runs it
and the only one that carries it.

## [4.3.0] - 2026-09-04

**Why upgrade.** Two new ways to read a double, and a class of failure that stops pointing at this
library's own source.

### Added

- **`createSpyFromInstance(instance, config?)` / `restoreSpiedInstance(instance)`.** Every other
  factory here _constructs_ a double; this one patches an object the test already holds — a service
  a factory built, a third-party client, a half-real `TestBed.inject(X)` — in place, same identity,
  so whatever captured it first sees the spies. `vi.mockObject` is Vitest-only,
  `sinon.createStubInstance` builds a new object from a constructor rather than patching yours, and
  `bun:test` and `node:test` have nothing; this runs on all three through the same `MockAdapter`
  seam. Discovery is the object's own function-valued fields plus the prototype chain up to but not
  including `Object.prototype`, so an arrow-function property needs no `instanceMethodsToSpyOn` and
  `hasOwnProperty` is never replaced. Restoration reuses the `mock*Prop` journal, so
  `restoreSpiedInstance`, `restoreMockedProps()` and `using` all compose — and `using` **restores**
  rather than resets, the only sense disposal can have for an object the consumer owns. It costs
  **+322 B min+gzip** on every entry that exports it, measured by building the root entry with and
  without it.
- **`explainSpy(spy, method?)`, on the `/diagnostics` entry.** `mustBeCalledWith` prints wanted next to actual, but only on the
  call that breaks. `explainSpy` answers the same question on demand, while the test is red for some
  other reason: every configured argument list next to every recorded call, each call attributed to
  the config it hit or to the default it fell through to. `calledWith` and `mustBeCalledWith` share
  one numbering. The two states a reader most often arrives in are said outright rather than left to
  be inferred — `nothing configured`, and `N calls, none matched`. It never throws: a plain
  `vi.fn()` is reported as one in the text. The return is a `string` to print, not an API to assert
  on. It ships from `/diagnostics` rather than the root for the reason that entry exists: ESM
  re-export is eager, a reader calls this at a breakpoint rather than from a spec, and on the root it
  would have cost every consumer 1 226 B min+gzip — measured, and most of what the root entry would
  otherwise have grown by. On `/diagnostics` it is +2.25 kB against an entry that was
  1.59 kB, because there it pulls in the argument serializer and the spy marks on its own rather
  than sharing them; that entry is imported by a reader debugging, not by every spec file, which is
  the trade the entry exists to make.
- **Two `doctor` checks that resolve a name, not a file.** `helper-from-wrong-entry` reports a
  helper imported from an entry that does not export it — `provideAutoSpy` from the root instead of
  `/angular` or `/nestjs`. `no-unawaited-helper` reports an `expectEmission` / `expectError` /
  `stable` / `flushEventLoop` called as a bare statement and dropped, where the promise settles after
  the test has ended and its assertion reports into a later test or nowhere. Both look a name up in a
  table generated from this package's own `exports` map, which is why neither can be a lint rule, and
  both go quiet when the installed major differs from the table's. Neither has a fixer; `doctor`
  still never writes.
- **An Angular render benchmark**, `npm run bench:angular`, so the `renderShallow` figures on the
  performance page are reproducible by a reader and by CI rather than quoted.
- **A `@testing-library/angular` migration page.** It is the only third party with zoneless support,
  and its `/vitest-utils` `createMock` / `provideMock` overlap this library directly.

### Changed

- **An emission-helper failure now names the line in your spec that called it.** These assertions
  build their error inside a `subscribe` or timer callback, so the frame the reporter showed was
  `node_modules/vitest-auto-spy/…` — a location whose only effect is to send the reader, or an
  agent, into a file they did not write. The stack is captured at helper entry and pinned onto the
  failure. Only errors these helpers build are re-anchored: the one `expectError` resolves with
  belongs to the code under test and keeps the stack it was created with.
- **`node:test` spies carry their method name.** `mock.fn()` takes no name and has no `mockName()`,
  so every spy used to print as `[Function: dispatch]` — this library's internal dispatcher. The
  adapter now names the implementation at creation and lets `mock.fn()` carry that name onto the
  mock, so it survives `mock.reset()` / `restore()` / `resetCalls()` and an implementation swap —
  and it is what `node:assert` diffs, `util.inspect()` and this library's own messages read.
  `getMockName()` still does not exist there; read `spy.method.name`. Naming at creation rather than
  redefining `name` afterwards is what keeps this nearly free: redefining drops the function out of
  V8's fast map and costs +206 B per mock, against +65 B for naming at creation — measured over
  200 000 mocks on Node 24.19.0.
- **`/rxjs`, `/console`, `/nestjs`, `/setup`, `/jasmine`, `/jasmine-compat` and `/dom-stubs` each
  evaluate 10.0 kB less.** Only the process-wide `defaultTimeoutMs` cell behind
  `setEmissionTimeout()` needs to be pinned into the shared chunk, not the 10 kB emission helper
  around it; splitting the cell out (`emission-timeout.ts`) took `dist/shared-state.js` from
  17 467 to 7 465 B. The eight entries that do use the helper lose 2.5 kB each, because inlined into
  the entry it tree-shakes better than it did behind a barrel re-export, and **no entry gains a
  module**. `/setup` min+gzip 12 092 → 12 072 B. The per-import time this buys is ≈0.08 ms, at the
  resolution limit of the harness — the bytes are the claim, not the milliseconds.

### Size and memory

Every entry that exports the new factory grows **+0.65 kB min+gzip** (`.`, `/react`, `/vue`,
`/svelte`, +4.5 %), **+0.74 kB** on `/bun` (+5.7 %), **+0.73 kB** on `/node` (+5.3 %) and
**+0.64 kB** on `/bun-angular` (+3.8 %). Of that, 322 B is `createSpyFromInstance` itself and the
remaining ~353 B is the stack anchoring, the `node:test` naming and `ArgsMap.configuredEntries` —
each measured by building the entry with and without it. `/diagnostics` is the one large relative
move, +2.25 kB on a 1.59 kB entry, and it is `explainSpy` being deliberately kept off the root.
Seven entries got *smaller* — `/rxjs`, `/dom-stubs`, `/jasmine-compat` and `/setup` among them —
from the shared-chunk split described below.

Heap per spied method is **+4.0 %** (2.78 kB → 2.89 kB) and creating a spy **+2.6 %**, measured over
100 000 spied methods through the `/node` entry, median of seven runs. The first version of the
`node:test` naming cost +13.0 % heap and +17.6 % create time, because redefining `name` on a
function drops it out of V8's fast map; naming the implementation at creation instead brought it
back. Heap after a lazy create is unchanged.

## [4.2.0] - 2026-09-04

**Why upgrade.** No user-facing changes. Everything here is a gate: the numbers this project argues
from are now measured by CI rather than quoted from a README.

### Added

- **Four measurement gates, all of them in `npm run check` and in CI.** `bench:check` holds every
  benchmark ratio against a committed baseline; `cold-import` gates the module-graph size of every
  entry point; `size:entries` gates the min+gzip weight of each one; and a pair of invariant specs
  assert that the heap reaches a plateau across create/teardown cycles and that teardown stays
  linear. `deps:check` fails on a lockfile that has drifted from the installed tree, and
  `format:check` covers the scope the `format` script owns — the gap that let a source file sit
  unformatted in the repository.
- **Every performance number republished from a fresh measurement.** The previous figures predated
  the spy engine introduced in 4.1 and were quoted rather than reproducible; each one is now
  produced by a script in `bench/` that a reader can run.

## [4.1.0] - 2026-09-03

**Why upgrade.** A method spy is no longer a `vi.fn()`, and that is the whole release. The library
builds its own mock function — one shared prototype carrying the `Mock` surface, call state
allocated on the first call rather than at creation, no entry in any global registry — and every
table in the head-to-head benchmark changed hands.

| Case (micro, median p75 of seven runs) | 4.0.1 | 4.1.0 | best other arm | lead |
| --- | ---: | ---: | ---: | ---: |
| small project — 6 methods, 1 called | — | **1.42 µs** | 6.83 µs hand-written | 4.82× |
| medium project — 14 methods, 2 called | — | **2.67 µs** | 15.92 µs hand-written | 5.97× |
| large project — 45 methods, 2 called | — | **5.79 µs** | 52.79 µs hand-written | 9.11× |
| 10 methods, all 10 called → 14 methods, all 14 | 18.92 µs (0.66× — a loss) | **8.17 µs** | 17.92 µs hand-written | 2.19× |
| 40 methods, all 40 called → 45 methods, all 45 | 75.33 µs (0.71× — a loss) | **26.12 µs** | 62.04 µs hand-written | 2.37× |
| double from a type — 2 members | 3.58 µs (0.77× — a loss) | **1.00 µs** | 2.79 µs vitest-mock-extended | 2.79× |
| double from a type — 40 members | 72.88 µs (0.80× — a loss) | **18.92 µs** | 56.79 µs vitest-mock-extended | 3.00× |
| deep double, 3 levels, leaf called | 8.83 µs (0.61× — a loss) | **2.29 µs** | 5.46 µs vitest-mock-extended | 2.38× |
| configure a return + 3 calls — from a type | 2.08 µs (0.76× — a loss) | **0.71 µs** | 1.58 µs @golevelup | 2.24× |
| `calledWith` dispatch, 2 configured + 1 miss | 0.54 µs (parity) | **0.17 µs** | 0.54 µs vitest-mock-extended | 3.25× |

Six of those rows were losses and one was parity; the narrowest margin now is 2.19×. The class cases
changed shape in the same release (see below), so the two left-hand columns are the same operation
on a slightly different class where the row says so. Everything is the median p75 of seven
independent runs on one machine, `npm run bench:vs:precise`.

At suite scale the same change is worth a few per cent, not a multiple, and that row is published
too: `npm run bench:suite` on a 20-method class under `isolate: true` puts hand-written `vi.fn()`
doubles about **5 % ahead** of this library at the median across 1 000 / 3 000 / 10 000 tests, where
they were 10-15 % ahead before — two runs of three rounds, individual rounds 0.81-1.01×. Building a
double is on the order of one per cent of what a test costs — a 10× win on the double cannot be worth
more than that on the run, and anybody quoting the micro-benchmark as a suite-level claim is quoting
it wrong. Against `@bugsplat/vitest-auto-spies` the same runs measure 1.63-1.72×.

**What it costs.** One thing, and it is namable: `mock.invocationCallOrder` counts on this library's
own scale, so `toHaveBeenCalledBefore` / `toHaveBeenCalledAfter` **between an auto-spy and a
hand-written `vi.fn()`** compares two counters that never met. Everything else a spec can observe is
identical, and the suite pins it by putting a spy and a `vi.fn()` through the same steps and
comparing their recorded state: `vi.isMockFunction`, every matcher, the snapshot serialiser, the
whole `mockReturnValue` / `mockResolvedValue` / `mockImplementation` family, `mock.calls` /
`.results` / `.settledResults` / `.instances` / `.contexts` / `.lastCall`, `mockClear` / `mockReset`
/ `mockRestore`, `using`, `vi.clearAllMocks()`, `vi.resetAllMocks()` and the `clearMocks` /
`mockReset` config keys. Nothing was removed or renamed.

### Added

- **`setSpyEngine(engine)` / `getSpyEngine()`**, on `vitest-auto-spy/setup`. `'auto-spy'` is the
  default; `'runner'` builds every method spy from `vi.fn()`, method for method, exactly as every
  release before this one did. Doubles already built keep the engine they were built with. Vitest
  only — on Bun and `node:test` the runner's own matchers recognise only the runner's own mocks, so
  those entries keep using them.

### Changed

- **Method spies come from this library's own mock function on Vitest.** `vi.fn()` assigns some
  twenty-five closures as own properties of every mock it creates, allocates six arrays of call
  state up front, and registers the mock in a module-level strong `Set` — per method, on every
  double a spec builds. The replacement is one function object and one small config record; the six
  arrays appear on the first call, so a materialised method that is never called owns none of them.
- **A run-wide `vi.clearAllMocks()` reaches those spies through one registered `vi.fn()` of the
  library's own.** Vitest clears mocks by walking a `Set` inside `@vitest/spy` that only `vi.fn()`
  and `vi.spyOn()` write to and that has no public API; the adapter registers a single mock whose
  `mockClear` sweeps this library's spies instead. `clearMocks: true` and `mockReset: true` in a
  config keep working untouched, because Vitest applies both through those same two functions.
- **What it weighs.** The engine adds **+1.4 kB min+gzip** to every entry that builds Vitest spies —
  `.` 12.94 → 14.33 kB, `/angular` 16.84 → 18.23 kB, `/setup` 10.60 → 12.09 kB, `/nestjs` 9.54 →
  10.95 kB — which is the mock function itself and buys the tables above. The entries that build no
  Vitest spy are unchanged to the byte (`/rxjs`, `/angular-http`, `/diagnostics`, `/jasmine-compat`,
  `/observer-spy`, `/zone`, `/eslint-plugin`), and `/node`, `/bun` and `/bun-angular` pay **+0.12 kB
  or less**, not the full engine — the two predicates the settled-results polyfill needs moved out of
  the engine module so the runtimes that never build a fast spy stop bundling one.
- **A sweep is now O(1) and holds nothing alive.** It bumps a counter; each spy compares its own
  stamp against it before it records or reports anything, and empties itself if it is behind. A
  state object a spec is holding answers with the emptied arrays too, which is what the runner's own
  state does.
- **`calledWith(x)` with a single primitive argument is looked up by value.** It was rendered into a
  string key on **every call** of that spy — an array from `map`, a string per argument, a joined
  string, then a hash — for a lookup a `Map` does on the value with no allocation at all. Shapes
  where the two disagree (a symbol, which renders by description; `-0`, which renders apart from `0`
  and is the same key under `SameValueZero`) stay on the string path and keep the answer they had.
- **The benchmark's class cases are now measured project profiles rather than round numbers.**
  Across four private Angular suites — ~2 700 spec files, 2 742 doubles built from a class — the
  service a spec doubles has 5–8 methods at the median, 12–16 at the p75 and 32–44 at the p90, and
  the spec touches 1 of them at the median and 2 at the p90: **5–6 % of what it built**. The cases
  are that survey's median, p75 and p90, plus two `worst case` blocks where every method is called.

### Fixed

- **`pruneMockRegistry()` no longer drops the mock that carries the sweep.** It would have taken the
  sentinel with everything else the file created, and `vi.clearAllMocks()` would then have gone
  silently nowhere for the rest of the run — found under `isolate: false`, where it reproduced.

## [4.0.0] - 2026-09-03

**Why upgrade.** Three things, and the first is the one a project feels without changing a line:

- **rxjs leaves your TypeScript program.** The published declarations named `Observable` and
  `Subject`, so every consumer loaded rxjs whether or not the project used it — **189 rxjs `.d.ts`
  files, 303 files in the program against 114 after**. A React, Vue, Svelte or Node suite stops
  paying for a peer it never asked for, and `skipLibCheck: false` stops erroring inside a shipped
  `.d.ts`. Suites that *do* use rxjs keep the exact types they had.
- **Every spec file gets 0.159 ms back.** The DOM stubs and the run-diagnostics helpers moved off
  the core, so a spec that never touches a DOM global stops evaluating 27 kB to reach
  `createSpyFromClass`. The root entry is 15.5 → 12.9 kB min+gzip.
- **The lint rules stop deciding for you.** All nineteen are `error`; which findings block a merge
  is one line of config, and the dial is documented per rule.

**What it costs.** Two import specifiers and, if you annotate `returnSubject()`, one import — the
full list, with the line that fixes each, is in
[Upgrading to 4.0](https://asdalexey.github.io/vitest-auto-spy/upgrading-4). Nothing was removed or
renamed, and no runtime behaviour changed.

> This section also carries the entries written for 3.10 – 3.18, which shipped before the
> changelog caught up with the tags. Everything under **BREAKING CHANGES** and the first three
> **Changed** bullets is 4.0.0; the rest is the backlog those releases never got a heading for.

### BREAKING CHANGES

- **rxjs is gone from the published declarations, and that is the whole of the major.** No export was
  removed or renamed, no runtime behaviour differs, no configuration key changed meaning. What
  changed is that `dist/types-*.d.ts` no longer opens with `import { Observable, Subject } from
  'rxjs'`. `import type` does not fix that and was measured rather than assumed — TypeScript resolves
  a type-only import exactly as it resolves a value one, loads the same 191 files and raises the same
  `TS2307` — so the reference had to go, and removing it is a breaking type change.

  Measured on the shipped package against a consumer whose only use of the library is
  `createSpyFromClass` on a promise-returning service: the TypeScript program goes from **303 files
  to 114**, of which **189 → 0** are rxjs `.d.ts` files, and `TS2307` inside a shipped declaration
  under `skipLibCheck: false` with no rxjs installed goes from reproducible to absent. Every React,
  Vue, Svelte and Node consumer paid that; the invariant "rxjs lives behind `/rxjs`" held at runtime
  and was broken at the type level since the subpath existed.

  **What replaced it.** Detection is structural, through a new exported type `ObservableLike<T>`: a
  member earns the observable bundle when its type has `subscribe` and a promise-returning
  `forEach(next)` — rxjs's `Observable`, every `Subject`, Angular's `EventEmitter`. `forEach` rather than `subscribe` carries the element type because
  TypeScript pairs the *trailing* signature of an overloaded method when inferring and rxjs 7's last
  `subscribe` overload is the deprecated positional one, through which `T` infers as `unknown` — the
  trap `expectEmission` already shipped once. `Promise`, arrays, `Signal` and Angular's
  `OutputEmitterRef` do not have `forEach` and are unaffected. One case newly matches, in the useful
  direction: an `Observable` from a **second copy of rxjs**, which used to fall through to the
  plain-spy branch because `Subject` is nominal, with `nextWith is not a function` as the only clue.

  `returnSubject()` and `nextWithPerCall()` return `SubjectOf<T>`, which is rxjs's own `Subject<T>`
  wherever `import 'vitest-auto-spy/rxjs'` is in the TypeScript program — that entry augments the
  new `AutoSpyRxjsTypes<T>` — and the structural `SubjectLike<T>` (`next` / `error` / `complete` /
  `asObservable`) where it is not. So a suite that has rxjs keeps the exact type it had, and the one
  import that makes the helpers *exist* is the one that makes them rxjs-typed.

  **What to do if it breaks you.** `Type 'SubjectLike<T>' is not assignable to type 'Subject<T>'`
  means the import is missing from the program your specs are checked in — typically a Vitest
  `setupFiles` entry no `tsconfig` `include` covers. Add the file, or put the import spec-side. A
  suite that never annotates the result (`const subject = spy.load.returnSubject()`) is unaffected
  either way. Full note in `docs-site/upgrading-4.md`.

  The cost, stated so nobody has to re-derive it: the seam adds four documented types, `+5 900 B` of
  declarations (306 777 → 312 677 B) and `+40` type instantiations on the budget fixture
  (9 126 → 9 166, budget 11 000). `scripts/check-dist.mjs` now fails the build if any declaration but
  `dist/rxjs.d.ts` and `dist/observer-spy.d.ts` names rxjs again, because one `import type` written
  back into `lib/types.ts` would undo all of it silently, in a file whose own compile stays green.

### Changed

- **`vitest-auto-spy/dom-stubs` and `vitest-auto-spy/diagnostics` — thirteen helpers and their
  thirteen types off every entry that re-exports the core.** `stubIntersectionObserver`,
  `stubResizeObserver`, `stubMutationObserver`, `stubObserver`, `intersectionEntry`, `resizeEntry`,
  `mutationRecord`, `stubMediaElement` and `stubAbortController` moved to `/dom-stubs`;
  `compareTestRuns`, `summarizeTestRun`, `formatTestRunComparison` and `diffByField` moved to
  `/diagnostics`. **Not only the root:** `vitest-auto-spy`, `/bun`, `/bun-angular`, `/node`,
  `/react`, `/vue` and `/svelte` all re-export the core, so all seven lose them — 182 export
  bindings in total, which is what `/release-audit` counts. Nothing about any of them changed — same functions, same
  signatures, and the undo journal lives on `globalThis`, so `restoreMockedProps()` and
  `setupAutoSpy()` from the root still put back everything the stubs patch. The compiler finds every
  call site, and `npx vitest-auto-spy codemod` rewrites the specifiers off the installed package's
  own `exports` map.

  ESM re-export is eager and no runner tree-shakes a test file, so the only way to stop evaluating a
  module is to stop exporting it: every spec in every project, Node services with no DOM included,
  was evaluating 27 kB of observer, media-element and `AbortController` code to get
  `createSpyFromClass`. Measured on the built package under Node's own loader, one process per
  sample, `vitest` imported first so the number is this package's own top-level work, medians of 40
  interleaved pairs: **−0.159 ms** on a spec file that does not import them, **+0.155 ms** on one
  that imports `/dom-stubs`, **+0.069 ms** for `/diagnostics` (inside the noise), and `dist` down
  **20 295 B of JS and 3 795 B of declarations**. The trade is per *file*, so a project is ahead
  unless more than half its spec files reach for the DOM stubs.

  Both entries are built **standalone** rather than chunked, and that is the whole of the second row:
  chunked, `/dom-stubs` pulled four modules the standalone root had already inlined and the same
  measurement read **+0.62 ms** — four times the win, in the wrong direction. This is the per-module
  overhead the de-chunking pass measured, arriving from the other side; `TODO.md` had this item
  filed as "the wrong lever" on the strength of the time alone, and it is taken now because the size
  went the same way and the major was open anyway.

- **Every ESLint rule in `configs.recommended` is an `error`.** It used to be a graded mix — ten
  `error`, eight `warn`, one `off` — which decided on the consumer's behalf how much each finding
  mattered. A `warn` is a finding a build does not stop for, so in a repository that does not read
  lint output it is `off` with extra noise; which findings block a merge is a project's call, and it
  is one line of config either way. So the default is the strict end and the docs carry the dial:
  `docs-site/utilities/eslint-plugin.md` gains *Adding it to your project* and *Tuning it for your
  project* — the `files` glob and how to tell an inert plugin from a clean suite, spreading
  `configs.recommended.rules` (a bare `rules` key beside the spread config **replaces** the map
  rather than merging, and nothing reports that), landing it on a large suite without a red CI, and
  per-line disables.

  Three rules can report on code that is correct, and each is listed there with the line that fixes
  it rather than a lower severity. `jasmine-namespace-without-entry` decides on a layer installed in
  a setup file no spec imports, and its `setupModules` option is what names that file.
  `prefer-native-spy-api` reports working bridge code, so a suite still migrating off
  `jasmine-auto-spies` sets it to `'off'` until the bridge is gone. `no-unregistered-inject-spy` has
  no option and needs none: it stays silent unless the file calls `provideAutoSpy` and its whole
  `providers` array is readable — a spread, an unknown provider factory, `createWithAutoSpies`,
  `renderShallow` or `TestBed.overrideProvider` each silence it — so what is left is a scoped
  `'off'` for the files where a helper does the registering.

- **The control helpers are shared across spies, and the memory per spied method drops by a third
  under rxjs.** `calledWith`, `mustBeCalledWith`, `failWith`, `resolveWith`, `rejectWith`,
  `resolveWithPerCall`, the stream helpers and the reset and clear hooks used to be a closure each,
  created for every method a spec touched — eight to twenty function objects before the runner's own
  mock. They are now one set for the run that finds its spy through `this`; the reset and clear hooks
  became methods of the spy's state, which sits under the spy's mark in place of `true`, so brand
  and hooks cost one property definition where they cost three. Measured on 1 000 spies × 100
  methods, every method touched once: heap per spied method 3.34 → 2.78 kB on `node:test`,
  4.29 → 2.88 kB with rxjs loaded (−33 %), 2.72 → 1.66 kB on Bun with rxjs (−39 %); first call of a
  method −10 % on `node:test`, −12 % with rxjs, −20 % / −28 % on Bun (medians, against the
  published 3.15.0). Creating a spy is unchanged:
  its cost is V8's `defineProperty` per lazy accessor, and every cheaper layout that was tried
  either made materialising the method slower on V8 or building the spy slower on JSC — the
  measurements are in `core/performance.md` so nobody re-runs them. **One thing changes for a
  caller:** a helper destructured off its spy (`const { resolveWith } = spy.load`) used to work by
  accident and now throws at the call, naming the helper and the two shapes that work. The core
  entry grows by 0.2 kB min+gzip for the shared code and that message. Two per-entry figures need
  reading with care: `/setup` gained 1.2 kB the first time this was built, from a module-level
  helper call the bundler could not prove pure — it carries `@__PURE__` marks now and is back at its
  size — and `/rxjs` bundled *alone* grows by 0.7 kB, of which 0.5 kB is the docs-link table its new
  error message shares with the core; a consumer of `/rxjs` has the core loaded already, so the
  incremental cost is the two small classes. The same 0.2 kB reads as +5 % on `/console`, the
  smallest entry that carries the core.

- **The three moats are now sold where a reader lands, not only on the comparison page.** Accessor
  spies on Bun — `bun:test`'s `spyOn(obj, 'prop', 'get')` throws
  _"does not support accessor properties yet"_ (Bun 1.4.0) and no library that generates a double
  from a class or a type has accessor spies on any runner — reached the README feature bullet, which
  previously said only "Getter / setter spies via `accessorSpies`". `injectSpy`'s
  `reportWhenNotASpy` warning, against Spectator typing every `inject<T>(token)` as `SpyObject<T>`
  whether it was mocked or not, reached the README bullet for `enableAngularDiagnostics()`.
- **`@testing-library/angular` is documented in the README as a direct competitor, not a
  complement.** Its `/vitest-utils` `createMock` / `provideMock` overlap `createSpyFromClass` /
  `provideAutoSpy` directly. Re-read in the published 19.4.2 tarball on 2026-09-02
  (`fesm2022/testing-library-angular-vitest-utils.mjs`, 52 lines): accessors are skipped silently
  because the walk assigns a mock only where `typeof descriptor?.value === 'function'` (line 14),
  and the recursion has no `Object.prototype` guard, so `hasOwnProperty`, `toString`, `valueOf` and
  `isPrototypeOf` are mocked on the double (line 18). Its `./zoneless` entry point, since 19.2.0
  (2026-03-17), is recorded as the point in its favour. New README `### @testing-library/angular
  /vitest-utils` section, a row in the README comparison table, and the defect made concrete on the
  landing page's accessor-spies card. `comparison.md` gained line numbers, the 2026-09-02
  re-verification note in the "Where the numbers come from" box, and the counterpart citation for
  this package's own guard (`walkOwnPrototypes`, `src/lib/create-spy-from-class.ts:81`).

### Fixed

- **`jasmine-namespace-without-entry` reported `spy.mock.calls[0]`, which is Vitest's own shape.**
  Also `spy.mock.calls.length` and `spy.mock.calls[0]?.[0]` — how every suite that has never seen
  jasmine reads its recorded arguments. All three conditions the rule had were met: the member is
  named `calls`, the `[0]` makes it read *through*, and the chain walks down to one of this library's
  factories. Bare `spy.mock.calls` passed while `spy.mock.calls[0]` was reported, a difference no
  message could explain, and while the rule was a `warn` nobody chased it. It now refuses any
  namespace hanging off `.mock`: jasmine's shape is `spy.calls.…`, and `.mock` is the runner's
  bookkeeping. Found while checking the claim that the four jasmine rules are inert in a suite that
  never used jasmine — they are now, and `docs-site/utilities/eslint-plugin.md` gains *Which of the
  nineteen apply to you*, which says so per audience (never-jasmine, coming from Jest, coming from
  jasmine) rather than leaving a reader to work it out from nineteen descriptions.

### Added

- **`node:test` no longer retains every spy for the life of the process — `trackNodeMocks()` on
  `vitest-auto-spy/node` cuts the retained heap 21×.** `node:test` pushes every `mock.fn()` onto the
  private `#mocks` array of one module-level `MockTracker` and never removes an entry: `reset()` is
  the only method that empties it, and it restores everything on the way. So a dropped spy stayed
  reachable, and with it every argument it had recorded. This package's own docs concluded there was
  no library-side fix because the tracker is global — **that conclusion was wrong, and this release
  corrects it.** The tracker _this library uses_ was global; `MockTracker` is an ordinary class
  reachable as `mock.constructor`, and `createNodeMockAdapter()` already took the tracker as a
  parameter. `trackNodeMocks()` creates spies on a tracker the library owns and replaces it with a
  fresh instance after every test, so the retired instance and its array become garbage together.
  Measured on Node v24.19.0 with `--expose-gc`, 20 000 spies of a 10-method class created across 20
  tests and dropped: **124.5 MB retained before, 5.9 MB after** against a 5.4 MB baseline — 119.0 MB
  down to 0.4 MB net. `/node` grows **0.3 kB min+gzip** (15.8 → 16.1 kB); no other entry moves.
  Three things it deliberately does not do. It **never calls `mock.reset()`** — that is the advice it
  replaces, and it restores and forgets the `mock.fn()` a spec wrote by hand; swapping a tracker the
  library owns touches no spy at all, because a `node:test` mock keeps recording calls and keeps its
  implementation once its tracker is gone. It **does not move spies that already exist**, so it
  belongs as early in the file as the imports allow. And it **never throws**: `mock.constructor` is
  not documented API, so the constructed tracker is probed — a mock is created, called, and its
  recorded call read back — before a single spy is routed at it, and every failure leaves spies going
  to `node:test`'s own tracker exactly as before. Opt-in, idempotent and reversible, the shape
  `trackStrayTimers()` and `trackMockRegistry()` already use. `pruneNodeMocks()` sweeps by hand for a
  suite whose tests run concurrently and reports how many spies went; `countNodeMocks()` reads the
  number back. `mock.reset()` in `afterEach` still works and is documented as the fallback for a
  suite that wants nothing from this package.

- **A migration page from `@suites/unit`.**
  [Migrating from `@suites/unit`](https://asdalexey.github.io/vitest-auto-spy/migrating-suites) is
  the practical translation the [comparison](https://asdalexey.github.io/vitest-auto-spy/comparison#nestjs)
  points at, now that `createNestUnit` answers Suites' solitary / sociable model directly:
  `TestBed.solitary(S).compile()` → `createNestUnit(S)`, `TestBed.sociable(S).expose(D).compile()` →
  `createNestUnit(S, { expose: [D] })`, `unitRef.get` → `spies.get`, `.mock(D).impl(…)` → a control
  helper after the fact or `providers: [provideAutoSpy(D, config)]`, `.final(v)` →
  `{ provide, useValue }` — and the `await` disappears, because the graph is built synchronously.
  It covers string and symbol tokens, `@Optional()` (which `@suites/di.nestjs` does not read:
  `optional:paramtypes` is not among the three metadata keys its reflectors touch), property
  injection, and a side-by-side table of what each side refuses. The load-bearing difference has its
  own section: `@suites/doubles.vitest` builds its double as a `Proxy` over `{}` whose `get` trap
  mints `new Proxy(vi.fn(), handler())` for any missing name, so `unitRef.get(Api).getUserz` is a
  working mock of nothing and a renamed method leaves a green spec, where `spies.get(Api).getUserz`
  is `undefined` because the double is read off the real prototype. Also an honest list of what the
  move costs — no Inversify adapter, no Jest entry point, no `identifierMetadata`, and configuring a
  double *before* construction needs `providers` rather than a line after the fact. Read against the
  published tarballs of `@suites/unit` 3.1.1 (2026-05-08), `@suites/di.nestjs` and
  `@suites/doubles.vitest` 3.1.0.

- **[Migrating from `@ngneat/spectator`](https://asdalexey.github.io/vitest-auto-spy/migrating-spectator)** —
  a migration page for the 739 852 downloads a month sitting on a package whose repository returns
  404. Every claim is verified against the published tarball rather than repeated: the four
  `BrowserDynamicTestingModule` call sites in `fesm2022/ngneat-spectator.mjs`, the three runtime
  dependencies including jQuery, and `jasmine.Spy` reaching the Vitest entry point through
  `lib/mock.d.ts:11` — so `@ngneat/spectator/vitest` does not escape the Jasmine globals either.
  Three widely repeated claims did **not** hold and the page says so: the `ngneat` **org** still
  returns 200 (only the repository is gone), `@angular/platform-browser-dynamic` still ships at
  22.1.4 and still exports the symbol (the real defect is that Spectator declares it in neither
  `dependencies` nor `peerDependencies`, reproduced as a clean-install `ERR_MODULE_NOT_FOUND`), and
  the `@openng/spectator` fork is **not** byte-identical and **does not fix the Angular 22 failure** —
  it carries the same undeclared import, and the fix, `openng-org/spectator#13`, has been open since
  2026-07-26. The translation table maps `createSpyObject` → `createSpyFromClass`, `mockProvider` →
  `provideAutoSpy`, `spectator.inject` → `injectSpy` and `SpyObject<T>` → `Spy<T>`, and states plainly
  that DOM querying, events and the DOM matchers are **not** covered here — that half belongs to
  `@testing-library/angular`. Checks run 2026-09-02.

- **`provideHttpTesting()` and `expectRequest(url)` — `httpResource()` and `HttpClient` answered in
  two lines, behind a new `vitest-auto-spy/angular-http` entry.** `httpResource()` is Angular's
  flagship data primitive, and nothing in the testing field has an answer for it: no helper in
  ng-mocks, none in Spectator, none in `@testing-library/angular`. What a spec has instead is a
  six-step dance whose order is not guessable — tick (a resource created in an injection context has
  issued **nothing** until something does), inject the `HttpTestingController`, `expectOne`, `flush`,
  let one microtask run so the response reaches the resource, tick again so the view reading it is
  current. Miss the first tick and `expectOne` reports a request that was never sent; miss the
  microtask and the assertion reads the resource's _default_ value — a green test that asserts
  nothing until the day the default changes. `await expectRequest('/api/products').flush([product])`
  is all six, and `products.value()` is readable on the next line: the spec proves that with a real
  `httpResource()`, a real `HttpClient` and a real component whose rendered text is asserted with no
  `tick`, no `await Promise.resolve()` and no `detectChanges()` of its own. `provideHttpTesting()` is
  `provideHttpClient()` + `provideHttpClientTesting()` in one spread, and its `verifyOnTeardown`
  (default `true`) fails the test that ends holding a request nothing answered, naming it — instead
  of letting it leak into the next test's `expectRequest`. `expectNoRequest()` and
  `verifyNoPendingRequests()` are the two smaller halves. Every failure names the fix, and the one
  that matters lists **the requests that were actually made**: "the only request made was
  `GET /api/product`" ends the search that "expected one matching request, found none" starts.
  **The second optional peer, and why it is confined.** `expectRequest` has to name the
  `HttpTestingController` before the caller has configured anything, so — unlike
  `enableAngularDiagnostics({ pendingRequests })`, which reads the token structurally out of the
  caller's own `configureTestingModule` and needs no peer at all — it costs `@angular/common`. It is
  declared **optional**, and it is confined to one entry: `vitest-auto-spy/angular` has to keep
  loading in a project that has `@angular/core` and not `@angular/common`, so a static import inside
  `dist/angular.js` was never an option. The package already had this exact situation with rxjs and
  solved it the same way, so `angular-http` is a subpath of its own and `grep -l "@angular/common"
  dist/*.js` lists `dist/angular-http.js` and nothing else. **The entry weighs 2.2 kB min+gzip**
  (2 198 B, esbuild bundle, minified, gzipped, peers external — the README badge's own method); the
  core entry is byte-identical at 15 530 B. **What it deliberately does not do:** it does not
  re-export the core (the one subpath that does not — it is a companion to `vitest-auto-spy/angular`,
  and staying narrow is what keeps the peer confined); it does not wrap interceptor configuration, so
  a suite testing its own interceptors keeps `provideHttpClient(withInterceptors([…]))` and adds
  `provideHttpClientTesting()` after it; it does not replace `settleResource`, which is still the
  answer whenever the wait is not tied to one request; and it changes nothing about
  `enableAngularDiagnostics({ pendingRequests })`, which keeps working unchanged — both take the open
  requests with the one-shot `match(() => true)`, so one unanswered request is still reported once.
  One honest limit: `verifyOnTeardown` is armed by `provideHttpTesting()` but the hook itself is
  registered when your spec file imports the entry, because a hook cannot be registered from inside a
  running `beforeEach` — measured on Vitest 4.1, `afterEach()` called there is accepted and never
  runs, and `onTestFinished()` runs after Angular's teardown has already destroyed the injector.

- **`@remarks` on the six declarations people get wrong, so the correction arrives in
  `dist/*.d.ts`.** A declaration file is the one document an agent opens without being told to and
  the one an editor reads on hover, and it is the only channel that costs nothing and needs no
  configuration: no import, no setup file, no plugin, nothing the consumer has to opt into. Four of
  the six carried a block since 3.10.0; this completes the set and brings the older ones up to what
  the package now does. `createSpyFromClass` says that discovery walks the **prototype chain**, so
  an arrow-function property, an Angular `signal()` field and every method of an ngrx
  `signalStore()` need `instanceMethodsToSpyOn` — or `createAutoMock<T>()`, which reads no
  prototype. `methodsToSpyOn` says it is **additive**, `jest-auto-spies`' semantics, and names
  `onlyMethodsToSpyOn` as the exhaustive whitelist a migrating spec usually meant. `Spy<T>` says it
  is a mapped type and therefore not assignable to `T`, that `asInstance(spy)` is the one place to
  bridge it, and — new — that `vi.mocked(…)` is not that bridge: it retypes the value as
  `MockedObject<T>`, which brings the private members back and carries the runner's
  `mockReturnValue` but none of `calledWith`, `resolveWith` or `accessorSpies`, so the assignment it
  was reached for still fails and the helpers stop compiling. `nextWith` says the helpers exist only
  once `vitest-auto-spy/rxjs` is imported, and — new — that the `ReplaySubject(1)` behind it is
  *configuration* rather than a call record: `vi.clearAllMocks()` cannot reach it, so a spy that
  outlives its test replays the previous test's value ahead of what this one configured, and
  `resetAutoSpy(spy)` in `beforeEach` is the fix. `calledWith` says it is lenient on a miss and
  arity-exact, and — new — that the chain is built at the call from the spy it is reached through,
  so `const { calledWith } = spy.load` compiles and then throws `calledWith was called off its spy`,
  in the same words the runtime message uses. `injectSpy` now carries one block on **each**
  declaration naming its own shape: Angular's `injectSpy(token)` off the global `TestBed`, and
  NestJS's `injectSpy(moduleRef, token)` — which had no `@remarks` at all, and which also says that
  the Angular helper's "not an auto-spy" warning has no counterpart there, so a provider listed as
  the bare class comes back as the real instance typed `Spy<T>` and fails a line later on
  `.mockReturnValue(…)`. Comment-only: every bundle is byte-identical — `dist/**/*.js` totals
  743 916 B before and after — and the whole cost is 1 903 B of prose spread across four declaration
  files (`dist/bun.d.ts`, the shared `dist/types-*.d.ts` chunk, `dist/zoneless-*.d.ts` and
  `dist/nestjs.d.ts`), none of which any runtime loads.

- **`createNestUnit(Target, { expose, providers })` on `vitest-auto-spy/nestjs` — the unit built
  from its own DI metadata, every collaborator spied.** The spec this replaces lists
  `provideAutoSpy(X)` once per constructor parameter and is rewritten whenever the constructor
  changes; `@suites/unit` (recommended by the NestJS docs) avoids that with its solitary / sociable
  model, and until now that was the one thing the Nest entry did not have. `createNestUnit` reads
  the five keys Nest's decorators already emit — `design:paramtypes`, `@Inject`'s
  `self:paramtypes` (with `forwardRef` unwrapped), `@Optional()`'s `optional:paramtypes`, and the
  two property-injection keys — through whatever `Reflect.getMetadata` the project loaded, and
  answers each token with the doubles the rest of the library builds: a class spy read off the real
  prototype, so a mistyped method name is still `undefined` rather than a fresh function, and a
  type mock for a string or symbol token. One instance per token across the graph, as Nest's
  singleton scope gives. `expose` builds a collaborator for real with its own dependencies spied
  (Suites' `sociable().expose()`); `providers` — `provideAutoSpy(X)` output, `useValue`,
  `useClass`, a zero-argument `useFactory` called once — wins over both. `spies.get(token)` keeps
  the Angular helper's guard: a token the unit never asked for is refused with the list of what was
  auto-spied, and an exposed class is refused as real, not a spy. It refuses, by name and with the
  fix, a parameter whose type has no runtime class (`Object` for an interface, `undefined` for a
  circular import) unless `@Inject(TOKEN)` names it or `@Optional()` allows `undefined`; a class
  with parameters and no metadata at all, saying what emits it; and a cycle among the classes built
  for real (`A -> B -> A`). Two limits, both deliberate: it does not resolve `forwardRef` cycles —
  expose one side less, or provide it — and the metadata is the compiler's, so tsc and SWC
  (`decoratorMetadata`) emit it and esbuild / Vite do not, exactly as for Nest itself. No new
  dependency: `@nestjs/*` stay optional peers read structurally, and `reflect-metadata` is Nest's
  own requirement. Verified end to end outside the repository against the packed tarball, with
  services compiled by tsc 7.0.2 and decorated by `@nestjs/common` 12.0.1. Size: `/nestjs` 8.09 → 9.54 kB min+gzip against the published 3.16.0
  (**+1.45 kB, +18 %** — the largest percentage in the package only because that entry is the
  smallest one carrying the core; the module and its five messages); the main entry is unchanged at 15.53 kB, since
  nothing outside `/nestjs` imports it.

- **`docs-site/migrating-angular-schematic.md` — what Angular's own `refactor-jasmine-vitest`
  leaves behind.** `ng generate @schematics/angular:refactor-jasmine-vitest` expands
  `jasmine.createSpyObj('Api', ['get', 'post'])` into a hand-written
  `{ get: vi.fn().mockName('Api.get'), post: … }` literal and emits a `// TODO: vitest-migration:`
  comment for three shapes it cannot resolve — `createSpyObj-single-argument`,
  `createSpyObj-dynamic-variable` and `createSpyObj-dynamic-property-map`, the last of which it
  rewrites anyway, dropping the property map on the floor. The page shows the schematic's real
  output (22.1.6, run, not reasoned from source) beside `createSpyFromClass(Api)`, which closes all
  three by construction because it reads the prototype rather than the call site; what the
  `MockedObject<T>` literal costs afterwards; the `/jasmine` entry as the way to stop at jasmine
  syntax first; and the record with versions — Karma was deprecated by its own maintainers in 2023,
  not by Angular; Vitest became the `ng new` default in 21.0.0; 22.0.0 deprecated the webpack
  builder family and removed the experimental `:jest` and `:web-test-runner` builders. It is not the
  codemod's job: `npx vitest-auto-spy codemod --from jasmine` takes a `jasmine-auto-spies` suite
  onto this library; this page takes the output of Angular's schematic onto it.

- **`setupAutoSpy()` says once, in the run itself, when `@angular/build` is building the test bundle
  unsplit.** `@angular/build` in `[22.1.5, 22.1.7)` compiles the unit-test bundle with esbuild code
  splitting off: every spec becomes a self-contained bundle, and `--coverage` grows by hundreds of
  megabytes with no plateau until the OOM killer ends the run — 791 chunks / 596 MB on a 784-spec
  suite. The builder emits no warning, and the two places that already said so — the `doctor` check
  `angular-build-splitting-off` and the Angular page — both have to be sought out. Now the setup file
  writes one line to stderr from inside the affected run, naming the version, both exits (22.1.7 with
  `"splitting": true`; the doctor check) and the opt-out. Once per worker: the builder runs Vitest
  with `isolate: false` and evaluates the setup file once, and a flag on `globalThis` keeps a second
  evaluation quiet. The builder is recognised by the marker its own `vitest-mock-patch` setup file
  leaves on `globalThis` (verified in 22.1.5 and 22.1.6), so a plain Vitest run reads nothing; under
  the builder the version comes from the nearest `node_modules/@angular/build/package.json` above the
  working directory. That is the one place the library reads the disk — one file, read-only, through
  `process.getBuiltinModule` rather than a static `node:fs` import so `/setup` still loads where there
  is no `process`, silent on a Node before 20.16 / 22.3 — and `check-dist` now allows `node:fs` in
  `dist/setup.js` for exactly that and nothing else. The window and the wording are shared with the
  doctor check (`src/lib/angular-build-notice.ts`), so the two cannot drift. Off with
  `setupAutoSpy({ angularBuildHint: false })`. Size: `/setup` 9.93 → 10.59 kB min+gzip against the
  published 3.16.0 (**+0.66 kB, +6.6 %**), the module and its message; `writeWarning` moved into its own module
  without changing behaviour, and no other entry carries the new code.

- **A type-instantiation budget in the gate, so `Spy<T>` cannot quietly become a deep proxy.** The
  comparison page's one type-level claim — half the type-checker work of `@golevelup/ts-vitest` and
  `vitest-mock-extended` — was measured once, on a fixture that was never committed, and nothing
  since would have noticed a conditional type or a distributive branch doubling the bill every
  consumer pays on every `tsc` run. `npm run types:budget`, now part of `npm run check`, generates a
  fixture of the survey's shape (an 80-member class mixing sync, `Promise` and `Observable` methods
  with properties and getters, 30 `createSpyFromClass` declarations, 600 member touches) into a
  temporary directory, type-checks it against the sources with `tsc --extendedDiagnostics`,
  subtracts a control with the same class and no spies, and fails when the instantiations
  attributable to `Spy<T>` exceed the budget. On 2026-09-02 with TypeScript 5.9.3: total 19 933,
  control 10 807, delta **9 126** against a budget of **11 000** — 20 % of headroom, where a
  deep-proxy regression roughly doubles the delta. The fixture is generated, not committed, so it is
  neither linted nor scanned by jscpd; `--print` dumps it and `--measure` prints the numbers
  without failing. The delta is measured on a different fixture from the survey and against the
  sources rather than the published declarations, so it is not comparable to the 2 656 — only to
  itself across commits. About one second per run.

- **`lazySpies: 'proxy'` — one trap object where there were N placeholders.** `lazySpies: true` does
  not build the spy, but it still has to define *something* per method: one `Object.defineProperty`
  accessor. On a class wide enough to matter that placeholder is not overhead around the cost, it
  **is** the cost. Measured on Node 24.19 with 2 000 doubles held at once and nothing touched:
  **101 584 B → 11 813 B on a 400-method class**, 25 597 B → 4 135 B at 100, 5 629 B → 2 219 B at 20
  — 253 B per method against 25 B. Creation follows, because there is nothing to define: creating a
  double and calling two of its methods five times each is **5.67× faster at 400 methods**, 1.78× at
  100, 1.35× at 20. Under `isolate: false`, where every double a file made is alive at once, this is
  the difference between a job that finishes and a job that is killed — the shapes it exists for are
  generated API clients (orval, `ng-openapi-gen`) and ngrx facades.

  **Opt-in, and it stays opt-in.** A `Proxy` cannot remove itself: once a method has materialised the
  accessor path leaves a plain data property behind and every later read is free (0.33 ns — the JIT
  deletes it), while the proxy still goes through a trap, **+30 ns per read and +43 ns per call for
  the life of the double**. At five methods it loses on memory too (+102 B) and on time (0.80×).
  Both tables cross over around twenty methods, so the default does not move.

  It is not a different double: `Object.keys`, spread, `JSON.stringify`, `in`, `hasOwnProperty`,
  `Object.getOwnPropertyDescriptor`, `delete`, `Object.freeze`, key order, `returns`, `overrides` and
  `fillMissing` all behave exactly as on the accessor path, and the suite asserts the two against
  each other rather than against hand-written expectations. One decision worth recording: reading a
  descriptor deliberately does **not** materialise. `Object.keys`, a spread and `resetAutoSpy` each
  read a descriptor per key, so materialising there would build the whole class on the first teardown
  and hand back exactly the memory the mode exists to save — the trap reports the accessor descriptor
  the placeholder path would have installed instead.

  **What it costs, measured against the published 3.15.1.** The module adds **+0.38 to +0.40 kB
  min+gzip to every entry that carries `createSpyFromClass`** — `.` 15.14 → 15.53 kB, `./angular`
  16.45 → 16.84 kB, `./nestjs` 7.71 → 8.09 kB (+4.8 %, the largest percentage only because that
  entry is the smallest one carrying the core), `./jasmine` 9.48 → 9.86 kB (+4.0 %). The seven
  entries that do not carry the core — `/rxjs`, `/console`, `/jasmine-compat`, `/observer-spy`,
  `/setup`, `/zone`, `/eslint-plugin` — are byte-identical, which is what confirms the delta is this
  one module and nothing else. 390 B of shipped code against 89 771 B retained per double at width
  400 is not a trade that needs arguing. Nothing new is imported: the module reaches only
  `./function-spy` and a type.

  Creation on the **default** path is unchanged. The cross-process harness reported +5.6 %, +12.5 %
  and +7.3 % on three runs while its own baseline moved 19.98 → 23.93 µs, so the noise floor there is
  several times the effect; measured properly — both `dist` builds loaded into one process and the
  blocks interleaved, median of 21 — head is **2.4 % to 3.6 % faster**, stable in sign across four
  runs. Heap per spy and per spied method are byte-identical on the default path (25.73 kB and
  2.78 kB, unchanged), which is the expected result: the new branch is two string comparisons per
  double, not per method.

- **`doctor` check `coverage-include-recompiles-globs` — the coverage scope that costs more than the
  coverage.** `@vitest/coverage-v8` memoises the *verdict* of `isIncluded`, keyed by filename, and
  never the compiled matcher, so `picomatch` recompiles the whole pattern array once per file.
  Profiled on one shard of a 1 725-file Angular suite with 124 include globs plus 304 negations:
  `Generate coverage` 224.2 s, of which **114.1 s is the final `coverageMap.filter`** — a loop whose
  entire body is one `isIncluded` call — against **0.35 s** for the pass over untested files that a
  narrowed scope usually gets blamed for. The check is `info`: nothing is broken and the report is
  correct, it is just paid for once per file per pattern.

  The fix ships as a recipe rather than as surface, because it is a coverage provider and has nothing
  to do with spies: `coverage.provider: 'custom'` plus a `customProviderModule` that re-exports
  `@vitest/coverage-v8` and overwrites `isIncluded` in `getProvider()` with one that compiles the
  list once. On the same real shard the Vitest phase drops **229.59 s → 22.88 s**, 432/432 files both
  ways, cobertura 8.0 MB both ways, and the report does not move (`Statements 41.77 %`, 27 292/65 325
  before and 27 289/65 325 after). Documented on the Angular page, together with the trap that makes
  a correct wrapper measure as zero — delegating the `allowExternal: false` case back to the original
  method, which `@angular/build:unit-test` turns on, so every call takes the slow path and the run
  comes out at 227.6 s against a 229.6 s baseline. The same section records the other reason to
  narrow a scope: cobertura at 10.78 MB against GitLab's 10 MB parse limit, over which the report is
  dropped silently — green job, percentages in the log, no line highlighting in the merge request.

- **`failWith(error)` on the sync bundle — the outcome the container could not carry.** Vitest 4.1
  added `mockThrow` / `mockThrowOnce`; Bun 1.4 and `node:test` have no equivalent (checked, not
  assumed), so a suite that runs on all three still wrote `mockImplementation(() => { throw e })` by
  hand. More to the point, **no** runtime can make one `calledWith` chain throw while its siblings
  answer normally — `mockImplementation` replaces the whole dispatch, which is the opposite of
  configuring one set of arguments. `cart.checkout.failWith(err)` throws on every call;
  `cart.checkout.calledWith(BAD_ID).failWith(err)` throws only for those arguments. It supersedes a
  `resolveWith` / `nextWith` / per-call batch configured before it and is superseded by one
  configured after, so what a call does never depends on the order the spec was written in.
  **Not** named `throwWith`: that is the observable helper that errors the stream, every spy carries
  every bundle at runtime (only the types tell them apart), and one name for both means whichever is
  attached last silently wins — which is exactly what happened the first time this was written that
  way.

- **`extendWithAutoSpies(test, spec)` (`/angular`) — the `TestBed` half of a spec as Vitest
  fixtures.** Replaces the `let cart: Spy<CartService>` + `beforeEach(configureTestingModule …)`
  block with one statement whose types are inferred, and a test that never destructures a fixture
  never builds it. Entries are a class, `[Class, config]`, or an `InjectionToken`. It takes the whole
  map at once rather than composing as a chain of `.extend`s, and that is a `TestBed` constraint
  rather than a typing one: fixtures resolve independently, so the first one would configure *and*
  inject — instantiating the module — and the second would then hit Angular's "Cannot configure the
  test module when the test module has already been instantiated". A `beforeEach` that configures
  further still composes; one that *injects* cannot. Needs Vitest 4.1 for the builder form of
  `test.extend`, and says so: on an older runner it throws `needs Vitest 4.1 or newer` before doing
  anything, because the object-form `extend` handed a string does not fail — it registers fixtures
  named `"0"`, `"1"`, … and every test then dies on `undefined` with no mention of why. Vitest exports
  no version, so the check reads the arity of `extend` (one parameter through 4.0, three from 4.1).

- **`onStrayTimers` on `setupAutoSpy`, and a warning when `detectAsyncLeaks` is on.** Running
  `setupAutoSpy({ strayTimers: true })` under Vitest 4.1's `--detect-async-leaks` reported **no
  leaks at all**: the sweep cancels in `afterAll`, Vitest collects afterwards, and a cancelled timer
  is no longer referenced — so a suite that leaks timers was handed a clean bill of health, which is
  worse than either feature alone. Cancelling is still right (a callback firing during a later file
  is the more expensive failure), so the sweep now says what it took away. `onStrayTimers` takes the
  count instead, which also makes `expect(cancelled).toBe(0)` a one-liner. The warning goes to
  stderr, not `console.warn`: the sweep runs after the file's last test, and Vitest attributes
  intercepted console output to a task — with no task left, the line is dropped.

- **ESLint `no-bare-called-with`** (in `recommended`, `error`). `spy.method.calledWith(1);` as a
  statement of its own configures a stub that answers `undefined` and asserts nothing, so the test
  passes whether or not the call ever happened. Vitest 4.1 turned this from a theoretical trap into a
  likely one by adding chai-style `expect(fn).to.have.been.calledWith(x)` for suites arriving from
  sinon — the same word, the opposite meaning. Chains rooted at `expect(...)` are left alone.
  `mustBeCalledWith` gets its own message: on its own it rejects *every* call, the matching one
  included, since nothing was configured for it.

### Fixed

- **A stray-timer leak was framed inside `node_modules/vitest-auto-spy`.** `trackStrayTimers()`
  wraps the global schedulers, so the stack Vitest 4.1's `detectAsyncLeaks` captures at resource
  creation ran through this package — the reported file stayed right, but the code frame the
  reporter prints, and the line a reader or an agent opens, was `stray-timers.ts` instead of the
  `setTimeout` the author wrote. The wrappers now go through `vi.defineHelper`, which drops those
  frames; the frame is the spec line again. No-op on Bun, `node:test` and Vitest below 4.1, where the
  probe degrades to identity.

- **`subscribeSpyTo` / `ObserverSpy` / `SubscriberSpy` (`/observer-spy`) — the other half of a
  jasmine-era suite.** `@hirez_io/observer-spy` sits beside `jasmine-auto-spies` in almost every suite that has
  one, is by the same author, and is the larger of the two by downloads; it was last published in
  2022. Without a bridge, moving means rewriting every stream assertion at the same time as
  everything else. Four departures from upstream, each closing a defect rather than adding a feature:
  `getValues()` returns a **copy** (upstream hands back its live internal array, so sorting what you
  read corrupts the spy you are still reading) and is typed `T[]` rather than `any[]` (upstream's own
  issue #69, which turns every downstream inference into `any`); `getFirstValue()` / `getValueAt(i)`
  **throw** where upstream types them `T` and answers `undefined`; and an unexpected error surfaces
  at the value reader that asked, naming it, instead of being rethrown from the observer — under
  rxjs 7 that rethrow goes through `reportUnhandledError`, so it never reaches the subscribing line
  and lands as an unattributed asynchronous failure. A `SubscriberSpy` is also disposable, so `using`
  scopes the subscription to its block and there is no `autoUnsubscribe()` setup file to remember.
  It stays a bridge: `subscribeSpyTo` is synchronous inspection, so a stream that never emits gives
  an empty spy and a green test, while `expectEmission` / `expectEmissions` fail on silence.

- **`codemod --from jasmine` — thirteen transforms that take a suite off the compatibility layer.**
  `--from` accepts `jest-auto-spies`, `jasmine-auto-spies` (alias `jasmine`) and `auto`, the default,
  which reads each file and applies the set that file needs. The jasmine set drops `.and.` from the
  auto-spies helpers, maps jasmine's own strategies to their `mock*` twins
  (`returnValue` → `mockReturnValue`, `callFake` → `mockImplementation`, `returnValues` → a
  `mockReturnValueOnce` chain, `withArgs(…)` → `calledWith(…)`), and rewrites the jasmine globals —
  `createSpy`, `createSpyObj`, the asymmetric matchers, `clock()`, `addMatchers`, `fail`,
  `withContext`, `toBeTrue`, `toHaveSize`, `toHaveBeenCalledOnceWith`, `jasmine.Spy` / `SpyObj`.
  The one it treats as dangerous rather than mechanical is **`spyOn`**: jasmine's stubs the method,
  Vitest's calls through, so a rename silently inverts every unstubbed spy in the suite and the test
  only fails if the real implementation happens to do something observable. It emits
  `.mockImplementation(() => undefined)` unless a strategy is already chained. A bare `spyOn(` is
  deliberately **not** an auto-detection marker for the same reason — the one construct both dialects
  spell identically with opposite defaults has to be asked for out loud. Anything it cannot rewrite
  safely is reported, never silently changed: `callThrough`, `DEFAULT_TIMEOUT_INTERVAL` and seven
  other members with no runtime twin come back as findings with the config-level answer.

- **`doctor` recognises a jasmine-era repository** — `jasmine-auto-spies`, `@hirez_io/observer-spy`,
  `jasmine-core`, `@types/jasmine`, `karma*`, a `karma.conf.js`, or `"types": ["jasmine"]` — and
  prints the two steps in order: land the suite green on `vitest-auto-spy/jasmine`, then run the
  codemod and drop the import.

- **Four ESLint rules for a suite mid-migration, and `no-done-callback` now catches `done.fail(…)`.**
  `jasmine-namespace-without-entry` (warn) reports `.and` / `.calls` / `.withArgs` used on a spy this
  library built in a file that installs nothing — the runtime failure is
  `Cannot read properties of undefined (reading 'returnValue')`, which names neither the spy nor the
  missing import. `no-jasmine-globals` reports `jasmine.*`, a bare `spyOn` / `spyOnProperty` /
  `spyOnAllFunctions` / `fail` / `pending`, and `.withContext(` — that last one is the quiet one:
  Vitest's chai layer ships an `@internal` `withContext` that walks a string's character indices as
  though they were flags and hands the assertion back, so a `.withContext('why')` left in a migrated
  spec keeps compiling, keeps passing, and has silently dropped its message.
  `no-save-arguments-by-value` reports jasmine's defensive argument copy, which no Vitest-family
  runner has — a suite that relied on it starts asserting on post-mutation state with nothing to see.
  `prefer-native-spy-api` ships **off**: it rewrites the shim to the native spelling, autofixing only
  where the receiver provably came from a library factory and offering a suggestion elsewhere, and it
  reports working code, so it is the rule for the last mile rather than the first.

- **`vitest-auto-spy/jasmine` — a suite arriving from `jasmine-auto-spies` runs before it is
  rewritten.** The two libraries are siblings over the same `@hirez_io/auto-spies-core`, so every
  configuration key already matches (`methodsToSpyOn`, `observablePropsToSpyOn`, `gettersToSpyOn`,
  `settersToSpyOn`) and so does every helper name. Exactly one thing differs, and it is on every
  async line of every spec: upstream installs the helpers on `functionSpy.and`, because that is where
  jasmine's own strategies live, so `spy.load.and.nextWith(v)` is a `TypeError` here. This entry
  installs `.and`, `.calls` and `.withArgs` on every spy built afterwards, plus `createSpyObj` and an
  importable `jasmine` namespace (`objectContaining`, `any`, `clock()`, and the eight asymmetric
  matchers Vitest has no twin for — `truthy`, `falsy`, `empty`, `notEmpty`, `is`, `mapContaining`,
  `setContaining`, `arrayWithExactContents`). It is a bridge, not a destination: land the suite green,
  then run the codemod and drop the import. Two differences from upstream are deliberate.
  `.and.callThrough()` restores *this library's* dispatch, so `calledWith` decides again — upstream
  has no original to call through to and silently yields `undefined`. And `Spy<T>` here does not open
  with `/// <reference types="jasmine" />`, so importing it does not require `@types/jasmine` in a
  project that has no other use for it. The namespaces are written against the mock adapter rather
  than against Vitest, so `enableJasmineCompat()` from `vitest-auto-spy/jasmine-compat` or `…/node` gives a Bun
  or `node:test` suite the same surface without pulling Vitest into the process — proven by
  `src/bun-tests/jasmine.bun.test.ts` rather than asserted. Nothing is installed on `globalThis`, and
  a project that never imports the entry pays one `undefined` check per spy and ships none of the
  code.

- **`createFixture<T>(defaults, overrides?)` and `createFixtureFactory<T>(defaults)` — somewhere to
  put a model, so it is written out and checked once.** `createMock` answers "this spec reads two
  fields of a big shape"; it has nothing to say about the more expensive habit, which is a content
  model with seventeen required fields copied into every spec that needs one. Measured on a single
  migration shard, those copies alone produced **28 `TS1117`** diagnostics — a duplicate key in a
  literal, where the runtime keeps the *second* one, so an automated "drop one" fix silently changes
  values — plus half of that shard's `TS2741`. The `defaults` argument is a **complete** `T` and that
  is the point rather than a chore: a field the model dropped six months ago fails in one place
  instead of in eight copies nobody re-checks, which is the diagnostic `Partial<T>` and `as T` both
  delete. Overrides are deep-partial-checked like `createMock`'s and merge leaf by leaf; an
  overridden array replaces the default one outright, because no merge rule over arrays is right
  often enough to guess at. Every call hands back a fresh object and the defaults are copied when the
  factory is built — a fixture shared by reference is the most common way one test's mutation decides
  another's outcome, and under `isolate: false` that sharing reaches across files. The copy is deep
  through plain objects and arrays and stops there: a `Date`, a `Map`, a DOM node or a class instance
  travels by reference, because rebuilding one would strip its prototype, accessors included. For
  defaults that *are* a model instance with getters, `withOverrides()` snapshots them first.

- **`assertComponentDefIntact(...components)` (`/angular`) — the hole a half-loaded barrel leaves in
  a component's own definition.** Providers and the compiled scope are baked into `ɵcmp` when the
  component's module executes, not read at `createComponent` time, so a bundler that splits a barrel
  into a chunk which has not run yet builds the definition with `undefined` in `providers`,
  `viewProviders` or `dependencies`. Angular finds out much later and from inside itself —
  `TypeError: Cannot read properties of undefined (reading 'provide')` at `resolveProvider
  render3/di_setup.ts:95` — with a stack naming neither the barrel, nor the symbol, nor the
  component; and the spec that breaks is one nobody touched, because chunk boundaries move with file
  *contents*. Both obvious cures fail for the same reason: an `await import()` at the top of
  `beforeEach` is already too late, and a static import in the spec header does not fix the order
  this bundler emits. The check walks the three lists — nested arrays and the thunk Angular emits for
  a forward reference included — and names the list and the index. The same call answers the related
  `Cannot read properties of undefined (reading 'ɵcmp')` from `imports: [Cmp]`, where the class
  reference itself never arrived, and a directive's `ɵdir` is read the same way. It does not fix the
  build, which is a bundler configuration question; it replaces a half-hour investigation with one
  line and points it away from the spec.

- **`doctor` reports two coverage settings that configure nothing.** Both are the same defect in two
  shapes: a coverage key written where the party that assembles the coverage options never looks at
  it. Nothing fails either way — the run is green and a report is produced, it is simply not the
  report the setting describes, and no warning says so. `coverage-all-removed` flags `coverage.all`
  on Vitest 4 or newer, where the key was removed rather than renamed, so the report quietly covers
  only what the run imported. `coverage-include-misses-bundle` flags a source-only
  `coverage.include` in the runner config of an `@angular/build:unit-test` target: coverage is
  matched twice there, first against the executed bundle chunks and only then against the remapped
  sources, so a list of `.ts` globs loses every counter on the first pass. The reader is lexical,
  like every other check in this CLI — the cost of that is a missed finding, never a wrong one.

- **ESLint: `no-unregistered-inject-spy` (`warn`), the fourteenth rule.** `injectSpy(X)` for a token
  nothing in the file registered as an auto-spy hands back whatever Angular DI already had — the real
  service, or an object an imported testing module put there — and the compiler says nothing, because
  `injectSpy` is declared to return a `Spy<T>`: the helpers exist for `tsc` and are absent at run
  time, so the first `.mockReturnValue(…)` or `.calledWith(…)` throws on a real method. The library
  already warns about this at run time, and that is the reason for the rule rather than an argument
  against it — a warning on stderr does not fail the run, scrolls past in a suite of a thousand
  files, and arrives only for the tests that executed the line; in one consumer monorepo dozens of
  spec files print it on every CI run and it has never been acted on. The check needs no types, only
  the file's own registrations, so **it is quiet unless it can read all of them**: at least one
  `provideAutoSpy` has to be present, and a spread or an unknown provider factory in any `providers`
  array, `createWithAutoSpies`, `renderShallow` or `TestBed.overrideProvider` silences the file — a
  false positive here costs more than the warning it replaces. A token given a plain
  `{ provide: X, useValue: … }` is recorded as provided and left to `prefer-provide-auto-spy`, since
  two rules firing on one line only teach people to disable both. Tokens are compared as source text,
  the way `no-overridden-provider` already compares them; no fix and no suggestion, because the
  repair is either a provider the file does not have or a `TestBed.inject(X)` that says the real
  implementation was the point.

### Fixed

- **The codemod refused to place 23 of its own exports, and said the wrong thing about why.**
  `provideAutoSpy` — the second-most-common import in a `jest-auto-spies` or `jasmine-auto-spies`
  spec — came back as `No entry point of the installed vitest-auto-spy exports provideAutoSpy`, which
  is false: five of them do. The resolver collapsed "the table has no such name" and "the table has it
  under several entries and none is the root" into one `undefined`, and the caller printed the first
  message for both. It affected every multi-entry name with no root export — `injectSpy`,
  `renderShallow`, `createWithAutoSpies`, `stable`, `trackInjections` and eighteen more — in any
  repository whose detected entry was not among the candidates, so the migrated file kept importing
  the legacy package and then failed the residue check for doing so. Resolution now reads the file:
  an entry it already imports from, or the framework its own code names (`TestBed`,
  `Test.createTestingModule`, `shallowMount`), decides it silently; with nothing to go on it places
  the common case and reports `ambiguous-entry-point` listing the alternatives. The runtime outranks
  the guess — in a Bun repository `injectSpy` lands on `/bun-angular`, since `/angular` there would
  register the Vitest adapter and every spy would fail at run time.

- **A write-only setter was spied as a method, and the method spy overwrote its own setter spy.**
  `set nickname(value: string)` declared with no getter beside it has an `undefined` `get` on its
  prototype descriptor, and method discovery asked only about `get` — so the name was counted as a
  method, and the function spy, assigned after `createAccessorsSpies` had installed the spied
  accessor, replaced it. `settersToSpyOn: ['nickname']` therefore produced an
  `accessorSpies.setters.nickname` that recorded nothing, `service.nickname = 'x'` overwrote the spy
  with a string rather than being observed, and nothing in the failure named either cause.
  Discovery now excludes **both** halves of an accessor: a name is a method when its descriptor
  carries a value. (`jasmine-auto-spies` has the identical defect, from the identical one-sided
  filter — a suite migrating with `settersToSpyOn` arrives here already broken and lands fixed.)

- **A `calledWith` config holding an asymmetric matcher could not be overridden ([#6](https://github.com/ASDAlexey/vitest-auto-spy/issues/6)).**
  `spy.load.calledWith(12, expect.anything()).mockReturnValue('a')` followed by the same line
  returning `'b'` kept answering `'a'`. Exact argument lists are keyed in a map, where the second
  registration simply overwrites the first; a config containing a matcher cannot be a static key, so
  it lives in a list that lookup scans front to back — and `expect.anything()` builds a fresh
  instance per call, so the second config was appended *behind* one that still matched every call it
  was meant to take over. It never answered, and a `beforeEach` reconfiguring the same spy grew the
  list once per test. Re-registering an equivalent argument list now replaces the config in place,
  which also keeps the registration order that decides between two *overlapping* configs — a narrow
  `expect.any(Number)` written before a wide `expect.anything()` still wins. Two matchers count as
  equivalent when they accept the same values: same matcher class, same own state (`sample`,
  `inverse`, `precision`), both carrying the runner's `Symbol.for('jest.asymmetricMatcher')` brand.
  A hand-rolled `{ asymmetricMatch }` object carries no brand and its verdict is a closure that no
  serialization can compare, so those are still compared by reference and only the same instance
  overrides. Affects every helper on the chain — `mockReturnValue`, `resolveWith`, `nextWith`,
  `nextOneTimeWith`, the per-call variants — and `mustBeCalledWith` alike.

- **A `RegExp` argument keyed as `{}`.** A regular expression has no own enumerable entries, so the
  argument serializer rendered every one of them identically: `calledWith(/a/)` answered a call made
  with `/b/`, and a `mustBeCalledWith` mismatch printed `{}` on both sides. It now renders as its
  literal (`/ab+/giu`). This is also what tells `expect.stringMatching('a')` apart from
  `expect.stringContaining('a')` when deciding whether a re-registration is an override.

- **`using` on Node 22: the package installs the missing `Symbol.dispose` itself.** Node 22 ships V8
  12.4, which has no explicit resource management, so Node supplies `Symbol.dispose` in JavaScript —
  as `Symbol.for('nodejs.dispose')`, and **onto its main realm only**. Vitest's `jsdom` /
  `happy-dom` environments put the intrinsics of a bare `vm` context on `globalThis`, and that realm
  has no such patch: `Symbol.dispose` is `undefined`, `using spy = createSpyFromClass(X)` throws
  `TypeError: Symbol.dispose is not defined.` out of `tslib.__addDisposableResource` before anything
  looks at the double, and `spy[Symbol.dispose]` degrades into a property literally named
  `"undefined"`. Node 24 has the symbol natively in every realm, which is why the same suite passed
  there and failed one LTS down — including this repository's own, on the Node 22 leg of CI.
  Importing the package now defines the symbol where it is missing, using that same registry key so
  it is identical to the one Node patches in (`Symbol.for` is shared by every realm of the process),
  non-enumerable and `configurable`; a realm that already has `Symbol.dispose` is left untouched.
  Library code compares against that resolved key rather than reading `Symbol.dispose` at each site.

- **A spied method rejects the arguments the real one rejects.** The mock surface on every method
  of a `Spy<T>` was intersected in as `Mock`, which is `Mock<Procedure>` — and `Procedure` is
  `(...args: any[]) => any`. An intersection accepts a call matching *either* member, so on a double
  of `read(key: string)` all of `read(1)`, `read('ok', 'extra')` and `read()` compiled, while none of
  them compiles on the real instance: a spec could call the double the way production code never
  could and stay green. The surface is now `MockInstance` — the same helpers without the call and
  construct signatures — so the only call signature left is the method's own. Nothing about
  *configuring* a double changed (`mockReturnValue` / `mockImplementation` stay as lenient as they
  were, because `MockInstance` defaults to `Procedure` too). Side effect worth knowing:
  `expectTypeOf(spy.method).parameters` and `.returns` now resolve instead of collapsing to `never`.
  **This tightens type checking on existing suites**: a call that passed the wrong arguments used to
  compile and now does not. This repository's own suite contained exactly one such call.
- **`nextWithValues` no longer drops a falsy value.** The entries were mapped with
  `isNextValueConfig(config) && config.value` — a truthiness test on top of a guard that had already
  proved the key was present — so `{ value: false }`, `{ value: 0 }`, `{ value: '' }`, `{ value: null }`
  and a falsy `{ errorValue }` emitted **nothing at all**. An ordinary boolean or counter stream
  therefore stayed silent, and the symptom arrived elsewhere: a timed-out `expectEmission`, or a
  component still holding its initial state under a green assertion on the default.
- **`createWithAutoSpies(...).spies.get(token)` refuses a token the instance never asked for.** The
  auto-spy injector answers *anything*, so stubbing the wrong token — a base class instead of the
  implementation, a service the class stopped injecting — used to succeed and configure an object
  the instance has never seen; the assertion then failed on the real collaborator several frames in,
  or passed while testing nothing. The call now throws, naming the token and listing the ones that
  were auto-spied.
- **`assertMocked(ns, { exports: [] })` is an error rather than a pass.** An empty list took the
  named-exports branch, found nothing to check and returned — so the one call in the file whose job
  is to prove `vi.mock` applied proved nothing. `Object.keys(stubs)` and a filtered constant are the
  two ways to get there by accident.
- **A `vi.resetAllMocks()` in one file no longer kills a shared double in another.** Registered
  means reachable, and `vi.resetAllMocks()` walks the same `@vitest/spy` set as
  `vi.clearAllMocks()`, calling `mockReset()` on everything in it — and `mockReset` reinstalls an
  implementation only when it was passed to `vi.fn(implementation)`; behaviour chained on with
  `.mockReturnValue(…)` or `.mockReturnThis()` is simply gone. Under `isolate: false` the bill
  arrives in a *different* file later in the same worker: it dies inside application code on a
  double it never touched (`TypeError: Cannot read properties of undefined (reading '…')`), the
  failure moves with the file order, and it never reproduces on the file that caused it.
  `vi.restoreAllMocks()` does not do this — in Vitest 4 it walks `MOCK_RESTORE`, which only
  `vi.spyOn` writes to — so a probe built around it comes back green and sends the search the wrong
  way. The implementation each long-lived mock carried when it was first classified is now
  remembered and put back before a test that has lost it, and only when it has gone missing: a mock
  a spec deliberately re-implements is left as the spec left it, and one that never carried an
  implementation is never touched. `trackMockRegistry()` installs the `beforeEach` (Vitest applies
  `restoreMocks` / `mockReset` / `clearMocks` before `beforeEach` hooks, so the repair lands after
  them); **`restoreLongLivedImplementations()`** is exported for a suite that wants the repair at
  another moment, and returns how many it put back.
- **`copyWindowGlobals` names a forced global the host refused.** The five forced keys are the ones
  the DOM is useless without, and a refusal used to be swallowed whole — the run then failed in the
  first spec that touched `document`, as `document is not defined`, naming neither the helper nor
  the property that refused. The warning now lists each refused key with the error underneath, and
  still leaves the host value in place; a refused key that is not one of the five stays quiet, as
  the documented outcome.

### Documentation

- **An "Error → cure" table in the README, keyed by what the compiler prints.** `asSpy` and
  `asInstance` were unfindable from the messages that call for them: no `TS2739` text contains either
  name, so neither a person nor an agent grepping the error reaches the helper. Six rows, one per
  shape the confusion takes, plus the two facts that cost the most time when they are missing — that
  the last row is word for word the second one (one message serving two different mistakes, told
  apart only by the line it lands on), and that the error count does not fall monotonically, because
  TypeScript stops checking a call at the first bad argument and stops excess-property checking at
  the first unknown key. One file counted 40 → 1 → 1 → 1 → 0.

### Internal

- **The two `prefer-*` provider rules read hand-rolled doubles from one module.** `rules.ts` had
  grown past the 500-line ceiling its own lint config sets, and the part that pushed it over was a
  reading shared by `prefer-provide-auto-spy` and `prefer-create-spy-from-class`: how many `vi.fn()`s
  a subtree carries, whether the object was written in place or parked in a `const` above the
  TestBed, and whether it sits somewhere the answer must be "leave it alone". That now lives in
  `eslint/hand-rolled-doubles.ts`, which is also what stops the two rules from drifting into
  disagreeing about the same literal. No rule behaviour changed.

### Fixed

- **The README and `performance.md` quoted different `renderShallow` numbers and neither said so.**
  The README's feature bullet advertised a flat **1.7×** — an aggregate over three converted specs
  of a private Angular 22 suite, one of which is a **0.8×** regression — while
  `docs-site/core/performance.md` carried a per-render table running from **1.2×** (no children) to
  **16.2×** (400 child instances) that appeared nowhere a prospective user looks. Both figures were
  correct and they answer different questions: the table isolates one render, the README row is a
  whole spec file's wall clock, which also pays for imports, the `TestBed` module and the
  assertions. Neither page acknowledged the other, so they read as a contradiction. Both now carry
  both numbers and explain the gap — the per-render ratio is the upper bound on what a file can
  gain, and a leaf component with no subtree to remove loses. The landing card, the README feature
  bullet and the comparison page now quote the range rather than a single headline. The
  measurements themselves are unchanged and re-dated in place (per-render 2026-08-26,
  `keepTemplate: true` 2026-08-30, the suite conversion as previously published); nothing was
  re-run. `performance.md` also now says the Angular figures are not part of `npm run bench`, which
  deliberately covers only the plain core.

## [3.9.0] - 2026-08-30

### Added

- **`setupAutoSpy({ frozenClockHint })` — a timeout under fake timers now says the clock is why.**
  A frozen clock turns waiting into waiting forever, and the runner's advice ("pass a timeout value
  as the last argument") is the one repair that cannot work: the callback is not late, it is never
  scheduled to run. Under `globalFakeTimers` nothing in the spec even says the clock is fake, so the
  timeout arrives in a file that never mentions a timer. The hint appends `vi.isFakeTimers()` and
  `vi.getTimerCount()` — facts, not a guess — to both `Test timed out in Nms.` and
  `Hook timed out in Nms.`, and names the case that reaches this with no timer in sight:
  `setImmediate` is faked too, and Express ends a request matching no route through `finalhandler`
  on `setImmediate`, so the 404 is never written and a routing mistake is reported as a slow test.
  On by default; silent while the clock is real, and silent when its queue is empty.

- **`setupAutoSpy({ hookTimeoutHint })` — a `beforeEach` that ran out of `hookTimeout` now says why.**
  Jest resolves one `testTimeout` for a hook and for a test body alike (`hook.timeout || getState().testTimeout`);
  Vitest resolves `hookTimeout` separately and defaults it to 10 000 ms, so a suite that carried its
  preset's `testTimeout: 30000` into the runner config and stopped there gives hooks a third of the
  budget its tests get. The failure lands nowhere near the cause: Vitest attributes a `beforeEach`
  timeout to the **test**, with the test's duration pinned at the limit, so the log reads
  `× should create 10045ms` — a slow test whose body never ran. On by default, because it only ever
  appends a sentence to a test that has already failed, and silent unless the two budgets actually
  differ or the hook named its own timeout (`beforeEach(fn, 300)`), which the config is not to blame
  for. `hookTimeoutHint: false` turns it off.

- **`using spy = createSpyFromClass(X)` — every double carries `[Symbol.dispose]()`.** It runs
  `resetAutoSpy(this)`, so the `afterEach` that existed only to reset one spy can go: recorded
  calls, `calledWith` / `mustBeCalledWith` chains, `resolveWith` / `nextWith` values and a bare
  `mockReturnValue` all go with the block. `createAutoMock` proxies and **every `mockDeep` node**
  carry it too, so `using api = mockDeep<Api>()` resets the whole tree, children included. The key
  is **non-enumerable** — `{ ...spy }` copies enumerable own symbol properties, so an enumerable
  dispose method would follow the double into every snapshot — and has a stable identity across
  reads, which a `Disposable` check and a `DisposableStack` both assume. There is deliberately **no
  `[Symbol.asyncDispose]`**: `resetAutoSpy` is synchronous, and `await using` already falls back to
  `@@dispose`. `Symbol.dispose` exists on every supported runtime, so there is no feature detection;
  the `using` _declaration_ is your toolchain's question — esbuild and `tsc` both downlevel it. A
  standalone `createFunctionSpy` is **not** covered: it is a host-runner mock, and Vitest puts its
  own `[Symbol.dispose]` on those, which restores the original implementation instead.

- **`strict: true` / `onUnstubbedCall` — fail on a method nobody configured, naming the call.** An
  unconfigured method answers `undefined`, which is a legal value, so the failure surfaces frames
  later inside production code as `Cannot read properties of undefined`. Strict mode makes the
  omission say so on the line that called it — `Nothing configured Cart.checkout, and strict mode is
  on. / Called as: Cart.checkout(1,'now')`, with the arguments printed because on a wide service
  _which_ call is half the diagnosis. Available on `createSpyFromClass`, `createAutoMock`,
  `provideAutoSpy`, and suite-wide through `setupAutoSpy({ strict })` (armed only when the option is
  passed, released in the `afterAll` of the file that armed it, so a shared worker cannot fail a
  spec that never opted in). `onUnstubbedCall` is the general form — whatever it returns becomes the
  call's return value, which covers "record, don't fail" and a blanket fallback value. Precedence,
  most specific first and stopping at the first one set: the double's `onUnstubbedCall`, the global
  `onUnstubbedCall`, the double's `strict` (**including an explicit `strict: false`**, the only way
  to exempt one collaborator from a suite-wide default), the global `strict`. It is not
  argument-level strictness: a `calledWith` chain for _other_ arguments is a statement that the
  method is stubbed, and `mustBeCalledWith` is the tool that throws on an argument miss. It does not
  reach accessor spies, observable-property spies, `mockDeep` nodes, `console-spy`,
  `mockResourceProp`'s `reload` or a standalone `createFunctionSpy`; `fillMissing` members **are**
  covered, since a member the prototype never named is by definition one nobody configured.
  `mockReturnValue` / `mockImplementation` / the `returns:` option replace the library's dispatch
  rather than registering configuration, so they never reach the guard at all — with one visible
  edge, `mockReturnValueOnce`, whose queue empties back onto the library dispatch and is then
  reported as unstubbed. Full page: `core/strict-mode`.

- **`npx vitest-auto-spy codemod` — migrate a suite off `jest-auto-spies` and Jest.** Seven
  transforms: `auto-spies-import` splits an
  `import { createSpyFromClass, provideAutoSpy, Spy } from 'jest-auto-spies'` across the entry
  points that actually export each name, from a table generated from the **installed** package's own
  export map; `inject-cast` rewrites `TestBed.inject(X) as Spy<X>` into
  `asSpy<X>(TestBed.inject(X))`, carrying the type arguments across rather than leaving them to
  inference; `jest-types` transposes `jest.Mock<R, [A]>` into the single call signature Vitest takes
  (a plain rename compiles into the reverse meaning and nothing fails until a call site disagrees);
  `jest-namespace` renames the `jest.*` members that have a `vi` twin; `jest-globals-import`,
  `jasmine-aliases` (`xit` / `fdescribe` → `it.skip` / `describe.only`) and
  `mock-implementation-arity` finish the mechanical half. **Dry-run by default** — the first thing a
  repository sees is a diff it can reject — with `--write` to apply, `--only` / `--skip` to select,
  and `--list` to print the transforms and the generated entry-point table. A member with no `vi`
  twin (`requireMock`, `replaceProperty`, `createMockFromModule`, `setTimeout`, …) is **left alone
  and reported with what to do instead**, and so is a member in neither list, because an unknown
  member is exactly where guessing produces a rewrite that still compiles and means something else.
  `--verify` transforms nothing and matches the files against the patterns the codemod removes,
  exiting 1 on anything left — the check that also works on a file somebody edited by hand.

- **`enableAngularDiagnostics()` on `/angular` — four silent Angular-testing failures turned into
  loud ones.** `ngModuleScopes` fails on a testing module importing an NgModule that contributes
  nothing at runtime; `deadSchemas` on `NO_ERRORS_SCHEMA` sitting next to a standalone component,
  where it can never apply; `unspiedProviders` raises `injectSpy`'s existing `console.warn` about a
  plain instance to a thrown failure at the `injectSpy` line; `pendingRequests` fails a test that
  ends with unflushed `HttpTestingController` requests, naming each method and URL. Every member
  defaults to `true` and takes `false` to opt out; a second call replaces the previous selection
  rather than adding to it, and `disableAngularDiagnostics()` turns the group off while leaving the
  `TestBed` timing instrumentation alone. `assertNoPendingRequests()` is the same HTTP check
  exported for mid-test use. **`@angular/common/http/testing` is never imported** — the token is read
  out of the caller's own `provideHttpClientTesting()` / `HttpClientTestingModule` configuration, so
  a project that configures neither is silently inert. Call it _after_
  `initTestEnvironment(...)`: Vitest runs `afterEach` in reverse registration order, and the check
  has to run before the TestBed teardown it inspects.

- **`trackInjections(tokens, options?)`, exported from both `/angular` and `/nestjs`.** Which
  collaborators an entry point actually asked for, recorded through DI provider factories instead of
  a module mock — a factory runs exactly when something injects its token, and DI is a seam the
  build cannot remove. Returns an `InjectionLog`: `providers` to spread into a testing module,
  `injectedTokens()` in the order the factories ran, `names()` for a readable `toEqual`,
  `wasInjected(token)`, `get<D>(token)` typed as `Spy<D>`, and `reset()` for the record only. Each
  token gets a class spy when it is a function and a `createAutoMock()` otherwise; `double` replaces
  that where a collaborator has to be a real object. Doubles are built **eagerly** so a spec can stub
  one before the entry point runs; the record fills in as DI constructs them, once per injector.
  `{ provide, useFactory }` is the same object in both frameworks, so it is one implementation rather
  than two that drift, and the core imports no framework at all.

- **ESLint: `no-import-time-spread` (`error`, suggestion), the thirteenth rule.** A module-scope
  spread of an imported binding — `export const webosEvents = [...BaseEvents]` — is safe under `tsc`
  and under a browser's ESM loader, and raises
  `Spread syntax requires ...iterable[Symbol.iterator] to be a function` while a spec _bundle_ loads,
  because a shared chunk can be evaluated while a binding it re-exports is still `undefined`. An AST
  pass found exactly seven sites in an 8 673-file workspace. A function body and an instance field
  are deliberately not reported — they run later than the module does — while a `static` field is,
  and the operand has to be the imported binding itself.

### Changed

- **`no-overridden-provider` classifies the pair, and every message names the surviving provider's
  line.** The first field data — 20 reports across an 8 673-file workspace — split in two. A
  **verbatim duplicate** (`provideAutoSpy(X)` twice in one array) cannot change what the test gets,
  so that one carries a **suggestion** to delete the dead copy — a suggestion and never `--fix`,
  because a run that deletes lines of a `providers` array unattended is not something to discover in
  a diff. The other half is the interesting one: the surviving provider is the **barer** of the two,
  so everything a configured `provideAutoSpy(X, { gettersToSpyOn: … })` set up is gone and the
  assertions below run against a poorer spy answering to the same name. That case carries **no
  edit** — which of the two to keep is the entire question — and says so instead.

- **`no-mocked-for-spy`'s `--fix` is narrowed to values that came from this library's factories.**
  The old fix rewrote the declaration to `Spy<T>` and left the object literal assigned beneath it,
  which the new type rejects: `eslint --fix` reported clean and the type gate failed afterwards —
  the worst shape an autofix has, because the rule's own check passes and nothing points back at it.
  A declaration is decidable; what the name is _assigned_ a few lines below is a separate question.
  The plain fix therefore survives only where the value came out of `createSpyFromClass`,
  `createAutoMock`, `createMock`, `mockDeep`, `injectSpy`, `asSpy` and friends, which return a
  `Spy<T>` already, plus annotations that belong to no variable (a parameter, a return type, an `as`
  expression). Everywhere else the identical edit is offered as a **suggestion**, to be accepted
  together with the repair at the creation site.

- **A `mustBeCalledWith` failure prints `Wanted:` next to `Actual:`.** The diagnosis is the
  comparison, not either half of it, the way `td.explain` and sinon report it. Every configured call
  is listed when there is more than one, matchers included, so a config that never matched is
  visible rather than inferred.

- **`Cannot redefine property` is re-thrown with the property, the target and the way out.** Where an
  accessor spy goes through this library — an `observablePropsToSpyOn` or getter/setter spy on an
  auto-spy — the bare `TypeError` becomes a sentence naming the property, saying what the target
  actually is (an ES module namespace is what a bundler leaves behind once it has inlined a barrel or
  a workspace alias), and pointing at the "provide a real seam" recipe: inject the dependency, pass
  it as an argument, or reach it through an object your own code owns. A `vi.spyOn` written by hand
  in a spec is not something this package can see, so that one still reports the bare `TypeError`.

- **`overrideComponentProvider` verifies that the override applied.** Queuing the component with the
  TestBed compiler removes the _usual_ cause of a silent no-op; it does not prove the override
  landed. Each call now queues a check and wraps `TestBed.createComponent` once: on the next fixture
  the component's **own** injector is asked for the token, and a mismatch throws naming the
  component, the token and what was resolved instead. The check is **always on** rather than a member
  of `enableAngularDiagnostics` — an override that did not apply is a bug in the helper, it cannot
  fire in a spec that never called the helper, and it stays silent when the component was not
  rendered. Limits: the **first** `createComponent` only (the wrapper unhooks itself), an absent
  component means silence rather than a guess, a later competing `TestBed.overrideProvider` still
  wins (the check reports it, it cannot prevent it), and a `TestBed` without `createComponent` gets
  no verification rather than a stale one. The injector is read structurally off the `DebugElement`,
  so no `@angular/platform-browser` import was added.

- **`dist/index.js` and `dist/angular.js` are built as one module each.** Importing an entry costs
  per-module loader work rather than per-byte work, and every consumer imports the root on every spec
  while every Angular consumer imports both. The root entry now reaches the loader as **2 modules
  instead of 8** and `/angular` as **2 instead of 10** — measured at ~0.8 ms less per spec file for
  the root and ~1.0 ms for an Angular consumer, at a cost of ~120 kB in a dev-only dependency that
  never reaches a production bundle. The four stateful modules (`mock-adapter`,
  `observable-support`, `package-identity`, `expect-emission`) are pinned to a single
  `dist/shared-state.js` that every ESM entry imports, which makes the one-registry invariant
  structural rather than emergent — two copies of it is the historical
  `No mock adapter registered` / `Observable spies require rxjs` failure. Only these two entries:
  de-chunking all fourteen costs +429 kB and duplicates the registries. The CommonJS build is
  untouched and stays self-contained.

- **Library throw sites report the caller's line.** Vitest 4.1's `vi.defineHelper` is probed off the
  runtime (`globalThis.__vitest_index__`, present with or without `globals`) rather than imported, so
  nothing changes on Bun, on `node:test`, or on Vitest below 4.1, where it degrades to the identity
  function. Where it helps, the frame the runner reports is the spec line that called the helper
  instead of a file inside `node_modules/vitest-auto-spy` — which is exactly the wrong invitation,
  since the first thing both a person and an agent do with it is open that file.

### Fixed

- **The codemod's entry-point table lost every type when it was read from source.** The table is
  generated from the installed package's own `exports` map, and the walker that collects the exported
  names knew `export * from './…'` but not `export type * from './…'` — the one line with which the
  root entry re-exports its whole public type surface. So `Spy<T>` and everything declared beside it
  were missing, `auto-spies-import` decided it could not place the name, and the import was left on
  `jest-auto-spies` with a residue error. Nothing announced it: the table still built and still
  looked complete. It also only reproduced where `dist` is absent and the sources are read, which is
  how CI runs the suite and is not how a developer with a built tree runs it — so the specs were
  green locally and red in CI. Both spellings are now followed, and both are pinned by a test.

- **`mockReadonlyProp` / `mockValueProp` / `mockReadonlyPropGetter` / `mockAccessorsProp` explain a
  property that refuses to be replaced.** They reach the same `Object.defineProperty` as the accessor
  spies behind the adapter, which have named the target and the way out for a while, and used to hand
  the bare `TypeError: Cannot redefine property: injectDomainMetrics` straight back. The shared
  explanation now lives in one place and both seams use it. The second half of the fix is the one
  that was costing a second failure: the undo journal is written **after** the define succeeds rather
  than before it, so a patch that never happened no longer sits there until the next
  `restoreMockedProps()` reports a teardown failure for it. Anything that is not the runtime refusing
  to redefine is re-thrown untouched.

- **`no-overridden-provider` no longer reports `multi: true`.** Angular *accumulates* multi providers
  for a token instead of keeping the last, so two of them in one array is the feature and not a
  defect — a spec asserting that two `BEFORE_INIT` hooks run in registration order registers both on
  purpose, and the report could only be silenced with an `eslint-disable` over a working test. The
  flag was not read at all: `multi` appeared nowhere in the built plugin. Mixing the two modes for
  one token is still reported, because Angular refuses that pair at runtime with
  `Cannot mix multi providers and regular providers`; a `multi` value the rule cannot resolve
  (`multi: flag`) is read as multi, since a missed report costs less than a false one.
  `prefer-provide-auto-spy` steps back from a multi provider too — `provideAutoSpy` takes no
  registration mode, so the replacement it would ask for does not exist.

- **The legacy string form of `setTimeout` no longer skews `countStrayTimers()`.** Its handler is not
  a function and cannot be wrapped, so nothing can report when it fired; recording it among the
  tracked handles left the count stuck above zero for the rest of the file, and the
  `afterEach(() => expect(countStrayTimers()).toBe(0))` this module recommends could never pass again
  once a suite used the form. Those handles are now kept apart: still cancelled at teardown, never
  counted as pending.

- **`assertNgModuleScopes` and the `ngModuleScopes` diagnostic test emptiness by flattening.** The
  compiler nests, and the `ɵinj.imports` of `@NgModule({})` is `[[], []]` — the module's own imports
  and exports, both empty — which a `length === 0` test read as two entries and called a
  contribution.

- **A `mockDeep` node answers `[Symbol.dispose]` with the library's reset.** Every node answered
  Vitest's own dispose, which restores the root spy instead of resetting the tree, so
  `using api = mockDeep<Api>()` did the wrong thing. It is answered from the proxy trap rather than
  defined on the node — a `defineProperty` there lands in the property store, where every key is
  reported as enumerable, which is precisely what the non-enumerable definition exists to avoid — and
  at every depth, so `using` on a sub-tree resets that sub-tree.

## [3.8.1] - 2026-08-29

No library changes. The patch bump came from a `fix:`-typed commit that only touched `CHANGELOG.md`,
`TODO.md` and `changes/unreleased.md`; `dist/` is identical to 3.8.0. Recorded here so the changelog
has no gap against npm — see [CONTRIBUTING.md → Release checklist](./CONTRIBUTING.md#release-checklist--these-four-must-always-match).

## [3.8.0] - 2026-08-29

### Added

- **`npx vitest-auto-spy doctor` — a repository-level check for defects that never fail anything.**
  Every check shares one property: nothing consumes the result. The suite is green, `tsc --noEmit`
  reports zero errors, and the only reader of the stale thing is whoever opens the file. It reports
  a `tsconfig` `include` pattern that matches no file — the one that motivated the tool, where a
  migration codemod had eaten a `/**` and turned `src/**/*.spec.ts` into `src*.spec.ts`, a valid
  glob matching nothing, leaving nine of 152 spec tsconfigs actually covering their specs — a
  `files` entry that is gone, a production module importing a `*.spec.ts` (a cycle under a shared
  environment, and the spec loses its own suite), a spec importing another spec, a
  `@jest-environment` pragma the runner never reads, configuration for a runner that is no longer
  installed together with the setup files only it referenced, and `@angular/build` in
  `[22.1.5, 22.1.7)`, where the unit-test bundle is built with code splitting off and `--coverage`
  grows by hundreds of megabytes with no plateau. Read-only: there is no `--fix`. Exit code 1 when
  anything above a note was found, so it is one line in CI.

- **`npx vitest-auto-spy init` — the pointer every coding agent in the repository actually reads.**
  No agent scans dependencies for instructions, so the `AGENTS.md` and the skill shipped in this
  package's tarball are never discovered on their own. `init` writes a managed block into
  `AGENTS.md`, `CLAUDE.md` and `GEMINI.md`, a Claude Code skill stub whose frontmatter is copied
  verbatim from the shipped skill over a body that only points at `node_modules` (so it cannot go
  stale), and a glob-scoped rule file for each tool whose own directory already exists — Cursor,
  Copilot, Windsurf, Devin, Cline, Roo. It never creates `.rules`, `.cursorrules`, `.windsurfrules`
  or `.clinerules`: Zed resolves instructions first-match-wins over a list ending in `AGENTS.md`,
  so creating one silently shadows the whole project's instructions. Unlike the paste-able snippet
  in the README, the block is **specialised** — the subpath that matches this runner, the adapter
  that matches this framework, the real path of the setup file that needs
  `import 'vitest-auto-spy/rxjs'`, and no rxjs bullet at all when rxjs is absent. Everything sits
  between `<!-- vitest-auto-spy:begin … -->` markers and is regenerated in full on each run, with
  text outside them never read or reformatted; `--check` is the CI form, `--dry-run` prints the
  plan, `--uninstall` puts the files back. The block stays under 1.6 kB because Codex caps the
  whole root→cwd `AGENTS.md` chain at 32 768 bytes and truncates past it in silence — `init` warns
  when the file it appended to crosses that line.

- **`mockResourceProp(object, property, initialValue)` on `/angular` — drive an Angular resource
  with no HTTP at all.** `settleResource` is the answer when the request is the point; this is the
  answer when it is not. The property is replaced by a double the spec moves directly —
  `set(value)`, `fail(error)`, `loading()`, plus a spied `reload` — so nothing is ever in flight:
  no tick, no `HttpTestingController`, no budget, and no way to assert against a resource's default
  value by accident. The double is built from real `signal()`s, so a `computed()` reading
  `products.value()` recomputes and an `effect()` watching `products.status()` runs, exactly as
  against a real `httpResource`. Undone by `restoreMockedProps()` like every other property patch.

- **`registerResourceMatchers()` on `/angular` — `toBeLoading` / `toHaveResourceValue` /
  `toHaveResourceError`.** A resource carries a value *and* a status, and the two only mean
  something together: `expect(component.products.value()).toEqual([])` passes just as happily
  against a resource still `loading` with its default value as against one that genuinely resolved
  to nothing. **`toHaveResourceValue` fails an unresolved resource even when the value matches**,
  and says which status it was in and which flush is missing. Duck-typed on `{ status, value,
  error }`, so `httpResource`, `resource`, `rxResource` and a `mockResourceProp` double all work;
  handed something that is not a resource, each matcher says so instead of throwing a `TypeError`.

- **`captureArg<T>()` — take hold of an argument the code under test built, instead of describing
  it.** `expect.any(Function)` answers *what kind of thing* was passed; a captor hands back the
  value, which is the difference between "a callback was passed" and "call the callback that was
  passed and see what it does". Written by hand it is a reach into `mock.calls` by index into a
  tuple position with a cast at the end — four chances to be wrong about a call that already
  happened. It is an asymmetric matcher, so `toHaveBeenCalledWith` and its whole family consult it
  on Vitest, Bun and `node:test` alike with no runner API involved. Assertion-only by design: a
  captor matches every value, so using one in `calledWith` would configure a return for every call
  — the types stop that line from compiling.

### Changed

- **`dist/node.d.cts` is 3.9 kB instead of 94 kB — the published tarball drops over 20 kB.** It was
  the largest file in the package by a wide margin: the CJS build is a second tsup config object, so
  `rollup-dts` ran over it separately and inlined the entire type surface a second time, where
  `dist/node.d.ts` says the same thing in seven lines by sharing the emitted chunks. A post-build
  step (`scripts/thin-node-cts.mjs`) now rewrites it as a re-export of that twin. Measured against
  the published 3.7.0 and *including* everything added in this release, `dist` is 712 → 640 kB and
  the tarball 260 → 238 kB. No type or value changed hands — verified with a CommonJS consumer that
  uses both, under `module`/`moduleResolution` `node16` **and** `nodenext`, with
  `verbatimModuleSyntax` off **and** on, plus a real `require('vitest-auto-spy/node')` round-trip.

## [3.7.0] - 2026-08-29

### Added

- **`settleResource(resource, { turns, label })` on `/angular` and `/bun-angular` — one wait for
  `httpResource()`, `resource()` and `rxResource()`.** Angular's resource primitives need a
  different wait each, and no library in the Angular world had an answer: measured on 21.2.17
  (zoneless TestBed), an `httpResource` settles **one** tick + microtask after its response is
  flushed and a plain `resource()` takes **two**, while a freshly created `httpResource` has issued
  no request at all until something ticks. Getting it wrong does not fail — it asserts the
  resource's *default* value, a green test proving nothing until the day the default changes. This
  is the loop both converge under, with a turn budget and a failure that names the resource and the
  flush it is missing. The wait ends on any settled status, `error` and `idle` included, because
  waiting for either is waiting for something that cannot happen. Duck-typed on
  `{ status(): string }`, so `@angular/core` stays an optional peer and a hand-built double works.

  One thing it deliberately does not absorb: the `flushEffects()` that comes *before* the flush.
  There is nothing for `expectOne` to find until something ticks, so the order is tick → flush →
  wait, and the docs say so at every mention.

- **`stable(fixture, { timeout = 2000, label })` — the wait is bounded now.** A fixture that never
  stabilises used to hang until Vitest reported a 5 s *file-level* timeout naming neither the helper
  nor the fixture, which blames the file for the state of one component. It now throws the cause and
  names both things that produce it. The watchdog runs on a timer captured at import, so
  `vi.useFakeTimers()` cannot freeze it — a watchdog the code under test can stop is not a watchdog.
  `{ timeout: 0 }` restores the unbounded wait.

### Fixed

- **`serializeValue` was exponential on shared (non-circular) substructure.** The cycle guard added
  and *removed* each object as it walked, so a node reachable by two paths was serialised twice —
  correct, and quadratic in the worst case, exponential in the common one. Measured on a diamond:
  depth 16 was 36.97 ms, depth 18 118.72 ms, and depth 20 turned 41 distinct objects into 1 048 576
  serialised nodes, a 12.6 MB key and **1 124 ms**. Cycles were handled; DAGs were not — and a
  normalised store slice, a shared config object or any tree with repeated nodes is a DAG. Now
  memoised by identity beside the existing cycle guard: **0.63 ms / 1.25 ms / 5.01 ms** for the same
  three depths, a 224× improvement at depth 20, with byte-identical output. A rendering that
  contains `[Circular]` depends on the path that produced it, so a subtree that emitted a back-edge
  is deliberately kept out of the cache.

- **`resetAutoSpy` / `clearAutoSpy` now reach into `mockDeep` children.** They walked own keys one
  level, and a `mockDeep` root is a *function* — so they found no mocks at any depth and
  `resetAutoSpy(api)` reset nothing at all, leaving a `calledWith` seeded on `api.repo.user.find`
  alive into the next test. `vitest-mock-extended`'s `mockReset` recurses, and a nested double
  surviving a reset reads as a bug wherever the expectation came from. The children stay invisible
  to a spec: the node publishes them through one internal symbol, not as own keys.

- **`flushEventLoopUntil` no longer claims a use case it cannot serve.** Its docstring, and
  `docs-site/utilities/event-loop.md`, showed an Angular `httpResource()` as *the* example. It never
  worked: the helper takes real event-loop turns and never ticks, so — measured — a resource awaited
  through it finishes the whole budget having issued zero requests, then fails saying the condition
  was never met. Both now point at `settleResource` and say plainly why.

- **`docs-site/core/performance.md` said the accessor walk was uncached.** It has been
  `WeakMap`-memoised per prototype for some time; the page was out of date, and the line read as an
  argument for replacing `autoSpyAccessors: true` with an explicit list on speed grounds. What the
  option actually costs is the accessor indirection, which the same page already measures at 5%.

### Internal

- **`calledWith` config args are serialized once, at `set()` time.** `ArgsMap` re-rendered the
  *config* side of an asymmetric match on every invocation, and a config arg never changes after it
  is registered — so a config holding an `expect.any(...)` beside a large object paid two deep walks
  per call where one is enough. Measured on a 200-key object: **27.32 µs → 14.26 µs per call,
  1.92×**. Positions holding a matcher are never serialized at all. Output and matching behaviour
  are unchanged; the exact-map path, already flat at 186–237 ns from 1 to 100 configs, is untouched.

- **`bench/auto-spy.bench.ts` was measuring the garbage collector.** `@vitest/spy` keeps every mock
  it ever creates in a module-level *strong* `Set` — that set is what `vi.clearAllMocks()` walks —
  so nothing a bench case allocated was ever collectable: 20 000 eager 10-method spies retained
  972 MB, and forcing a GC after dropping every reference released **0.0%**. Each case therefore
  allocated into a heap it inherited from the case before, and `p75` reported whether a major GC
  landed inside the sample. Two consecutive unmodified runs moved `createAutoMock + 4 accesses`
  **569×** (5.0680 ms → 0.0089 ms), and one of them announced "eager 272.67× faster than lazy" for
  the case the docs publish as a 7× *lazy* win. Every case now ends with this package's own
  `pruneMockRegistry()`; two runs after the fix reproduce every case within **1.00–1.16×**, and the
  40-method / 3-called row reports the 7.48× it is supposed to. Timing table in
  `docs-site/core/performance.md` re-taken. (The prune had to go inside the timed body: Vitest runs
  no hooks at all in benchmark mode, and `bench()`'s third argument is tinybench's bench-level
  options, not its per-task hooks. It costs one `Set.delete` per mock created, against ~1.9 µs to
  create one.)

- **`npm run check` enforces the coverage gate again.** It had drifted back to `npm run test`, so
  the 100% threshold was silently bypassed locally while CI ran `test:coverage`. It runs
  `test:coverage` now — and caught two genuinely uncovered branches in the same session.

- **The Angular surface shared by `/angular` and `/bun-angular` is one list.** `lib/angular-portable.ts`
  holds the helpers that are identical on both runners; the two entries re-export it instead of
  repeating it. The second copy was the kind that rots quietly — a helper added to one entry and not
  the other is not a failure anywhere, it is simply missing on Bun.

## [3.6.0] - 2026-08-29

### Added

- **`docs-site/utilities/editor-diagnostics.md` — the lint rules, in the editor.** They are
  worth more while the cursor is still on the line than in CI, because every shape they catch
  *passes*. No editor needs a plugin of this package's own: WebStorm, IntelliJ IDEA Ultimate,
  PhpStorm, PyCharm Professional and RubyMine all run ESLint natively — inline, in the Problems tool
  window and under **Code → Inspect Code** — and VS Code, Cursor and Windsurf need only the ESLint
  extension. The page carries the setup for both, the three things that otherwise read as "the rules
  do not work" (flat config only, scope the block to spec files yourself, `⌥⏎` is where the fixes
  and suggestions live), a table of what gets underlined and why, and the reason a native JetBrains
  plugin is not planned. Summarised in the README as **Editor diagnostics — WebStorm & VS Code**.

### Fixed

- **The docs site builds again.** Two dead links (`/core/factories` in `adapters/angular.md`,
  `/utilities/doubles` in `utilities/setup.md`) pointed at pages that do not exist, and VitePress
  fails the build on a dead link — so the GitHub Pages deploy had been failing, and nothing
  published since had reached the site. They now point at
  `/core/auto-mock-by-type#recursive-deep-mocks-—-mockdeep` and `/utilities/constructor-doubles`.

### Discoverability

- **The Open Graph image exists.** The meta tags had referenced `og-image.png` since the site went
  up; the file was never created, so every shared link rendered without a card. It is generated from
  a checked-in SVG, and `meta robots` now carries `max-image-preview:large`, without which neither
  Google nor Yandex will use it.

- **IndexNow, on every docs deploy.** A new job in `docs.yml` reads the freshly published
  `sitemap.xml` and submits every URL to `api.indexnow.org`, which Yandex, Bing, Seznam and Naver
  consume — the closest thing to a "reindex now" button for Yandex, and it needs no account. The key
  file is served from `docs-site/public/`; the job is `continue-on-error`, so a submission failure
  never fails a deploy that already succeeded.

- **A second JSON-LD graph** (`WebSite` + `Person` with `sameAs` + `SoftwareApplication` with its
  runtime requirements and feature list), `robots.txt` naming the sitemap and both llms files, and
  `<link rel="alternate" type="text/plain">` announcing `llms.txt` / `llms-full.txt` the way a feed
  is announced. Keyword metadata widened to the terms this package can win — `vitest mock class`,
  `replace jest-auto-spies`, `webstorm eslint inspections`, `openai codex`, `glm z.ai`.

### Documentation

- **Every mainstream coding agent now gets a named file, not "or equivalent".** The README section
  and `docs-site/agents.md` gained a per-agent table — which instruction file each tool actually
  reads and whether it honours `AGENTS.md` — covering **OpenAI Codex** (the `codex` CLI, the IDE
  extension and Codex cloud) second only to Claude Code, **GLM (z.ai coding plan)** and **Kimi K2**,
  Cursor, GitHub Copilot, OpenCode, Cline, Windsurf/Cascade, Zed, Gemini CLI, Qwen Code, Roo Code,
  Junie and Aider. Codex gets the `~/.codex/config.toml` fallback keys and the 32 768-byte chain
  budget that silently truncates a long `AGENTS.md`; GLM gets the point that matters — it is a
  model, not an agent, and inside Claude Code the whole `CLAUDE.md` / skill / plugin path works
  unchanged. A new **Install it in your agent** subsection gives the two commands that cover the
  field, plus the glob-scoped rule files for Cursor, Copilot and Windsurf. The Zed hazard is called
  out: never create `.rules` / `.cursorrules` / `.windsurfrules` / `.clinerules` just to hold a
  pointer — Zed resolves that list first-match-wins and the new file shadows everything.

- **Angular leads the framework adapters**, in the README section order, the table of contents and
  the package description — it is the framework this library is exercised on hardest.

- **A complete table of contents.** It listed only top-level sections plus Angular's; it now covers
  the `How to mock:` recipes, `Runtimes`, `Spying instance-assigned callables`, `Standalone
  observable builder`, `Which factory, and what it costs`, `Console spies` and the new agent
  subsections.

### Added

- **A twelfth rule: `prefer-as-spy`** (`warn`, and the second that runs under `--fix`) —
  `TestBed.inject(X) as Spy<X>` becomes `asSpy<X>(TestBed.inject(X))`, with the `asSpy` import added
  and a `Spy` import the rewrite orphans taken out. That cast is written once per injected double in
  a `jest-auto-spies` suite and fails here with `TS2352`: `Spy<T>` adds `accessorSpies` and the
  per-method helpers, so neither type sufficiently overlaps the other. It is the most common compile
  error a migrated Angular suite produces, and it arrives in batches — which is what makes it worth a
  fix rather than a suggestion. It qualifies for one because the developer has already asserted
  `Spy<X>` in the file being linted: `asSpy` is a typed identity function, so the rewrite keeps that
  assertion whole, decides nothing the cast had not decided, and cannot reach run time — a wrong fix
  fails to compile. The type arguments are carried across rather than left to inference, which
  answers `Spy<Service<any>>` for a generic class. A `Spy` the file declares itself and a cast that
  hops through `unknown` are left alone — the hop says the value is not a `T`, so the call would not
  compile — except for `TestBed.inject(X) as unknown as Spy<X>`, where the container returns `X` by
  construction and the hop was only silencing `TS2352`.

## [3.5.0] - 2026-08-29

### Added

- **`countMockedProps()`** — how many `mock*Prop` patches are still in place, the counterpart of
  `countStrayTimers()` / `countStrayRejections()`. It answers one question: did the teardown
  actually run? `afterEach(() => expect(countMockedProps()).toBe(0))`.

- **An eleventh rule: `no-inject-before-override`** (`warn`) — the trap this plugin's own advice
  sets. `TestBed.inject()` and `TestBed.createComponent()` **instantiate** the testing module, and
  every `TestBed.override*` afterwards throws `Cannot override provider when the test module has
  already been instantiated`. Migrating to `provideAutoSpy` walks people into it: a hand-rolled
  `useValue` configured its return values inside the literal, the replacement has nowhere to put
  them, so `asSpy(TestBed.inject(X)).m.mockReturnValue(…)` lands in `beforeEach` — and every
  override in the suite stops working, including one written *above* that line inside a
  `createComponent` helper the tests call. Found twice independently after a migration, once for
  sixteen tests at a stroke. The check is deliberately order-free, because lexical order is not run
  order: it asks whether the suite overrides at all, exempting an `override*` that sits in the same
  hook body ahead of the injection (that one really does run first) and any suite that calls
  `TestBed.resetTestingModule()`. The message names both repairs — configure the double after the
  overrides with `injectSpy(X)` inside the test, or keep the access lazy
  (`const api = () => injectSpy(Api)`) so instantiation happens in the first test. `warn` rather
  than `error` because the run does report this one, loudly and with a clear message; the rule's
  value is catching it at edit time instead of in the full run after five hundred files.

- **A tenth rule: `no-overridden-provider`** (`error`). Angular keeps the *last* provider registered
  for a token, so a second one in the same array silently replaces the first. In a testing module
  that is a defect rather than untidiness, and it was found on **eight tokens of one spec file**,
  each registered both ways at once:
  `providers: [provideAutoSpy(X), { provide: X, useValue: mockX }]`. Every one of those
  `provideAutoSpy` calls was dead code. It misleads from both sides — the author believes there is an
  auto-spy and writes assertions against one, while what DI hands out is the hand-rolled object
  drifting from the class; and whoever comes later to replace that object sees `provideAutoSpy`
  beside it and reads the migration as done. Nothing in the other nine rules could see it:
  `prefer-provide-auto-spy` looks at the `useValue`, and there it finds an identifier with a
  perfectly good `provideAutoSpy` next to it. The rule reads both spellings in either order
  (`provideAutoSpy`, `provideAutoSpyForToken`, `{ provide: … }`), reports every provider the last one
  buries, and compares tokens as source text — in a `providers` array a token is written by name,
  once, next to the double it stands for, so there is nothing for a resolver to add. No fix and no
  suggestion: deleting either line is a valid repair and the two mean opposite things.

- **`expectError(source$, options?)` — the error, unwrapped.** The emission helpers wrap a stream
  failure in a new `Error` whose message names the stream, which is right for reporting a failure
  nobody expected and useless when the failure is the subject: `rejects.toBe(originalError)`,
  `rejects.toBeInstanceOf(UdmsStatusError)` and an exact message comparison all fail against the
  wrapper, and three migrated specs lost the assertion they had. `expectError` resolves *with* the
  error as it was thrown, waits for it however late it arrives, and fails — naming the stream — when
  the stream completes or stays quiet instead. The wrapped failures now also carry the original on
  `cause`.

- **`expectEmission` / `expectEmissions` / `expectNoEmission` take `{ skip, until }`.** The dominant
  shape on a replayed stream is not "it emitted" but "it emitted *the* value", and writing that as
  `source$.pipe(filter(…))` or `pipe(skip(1))` moves the interesting condition out of the assertion
  and into the source — in a helper whose whole point is that it needs no rxjs. Non-matching
  emissions are still counted, so a failure reads `4 emission(s) received` rather than `0`, which is
  what tells "the wrong thing fired" from "nothing fired"; a `filter` in front of the helper throws
  that distinction away.

- **`{ advance }` closes the window between subscribing and awaiting.** A stream driven by a
  `debounceTime`, a retry or a poll needs the clock moved *after* something is listening, and `await`
  gives control away before the next statement runs. The shape specs arrive at otherwise — hold the
  promise, advance, then await — is correct and breaks silently the moment somebody adds an `await`
  one line above it. A callback rather than an `advanceTimers: true` flag, because these helpers are
  in the core entry, which has no test runner in it.

- **`observablePropsToSpyOn` on the token path.** The third option the two provider forms did not
  share, and the one where the asymmetry cost the most: a class tells the factory which members are
  methods, a type does not, so every unnamed key of a token-driven double was a *function* spy —
  an `Observable` property included, which the code under test then subscribed to as if it were a
  function, failing far from the double. A token with observable members therefore sent people back
  to a hand-written double, which is what `prefer-provide-auto-spy` and
  `prefer-create-spy-from-class` exist to steer them away from. A member also named in `overrides`
  keeps its seed, the same precedence the class factory uses.

- **`ClassSpyConfiguration.overrides` and `AutoMockConfiguration.returns` — the missing halves.**
  `provideAutoSpyForToken` took property seeds and `provideAutoSpy` took method configuration, so a
  double needing both was provided in one statement and finished in another. Both factories now take
  both: `returns` for what a spied method answers, `overrides` for a member that is not a method
  result. A seeded member is stored verbatim and is no longer a spy — seed data there, name methods
  in `returns`.

- **`Mutable<T>`.** `Spy<T>` is a homomorphic mapped type, so it preserves the `readonly` of an
  abstract getter — and an abstract class whose useful members are getters is exactly the shape
  `createAutoMock` exists for. `Mutable<Spy<PlatformLocation>>` makes the direct assignment the
  Proxy's `set` trap has always handled type-check as well.

- **`prefer-create-spy-from-class` takes `{ minRunnerFns }`.** The threshold of two `vi.fn()`s is
  what makes two doubles on adjacent lines behave differently, and seven migration batches tripped
  over it independently. It stays at two by default — an object holding one `vi.fn()` is
  indistinguishable from an options bag with a callback in it, and this rule fires on every object
  literal in a file — but it is now named in the message and configurable, and the case those
  reports were about is covered from the side that can prove it: `prefer-provide-auto-spy` has a
  `provide:` next to the object, fires at one, and since it learnt to follow a name reaches the same
  doubles.

- **`expectCompletion(source$, options?)` — the assertion for a stream whose value is not the
  point.** A save, a purge, an `Observable<void>`, a `Subject` a teardown closes. `firstValueFrom`
  rejects such a stream with rxjs's `EmptyError`, and the workaround people arrive at
  independently — `lastValueFrom(source$, { defaultValue: undefined })` — reads as though the
  default were the interesting part when the whole assertion is "it finished". It resolves on
  completion, rejects on a stream that is still running when the timeout expires (with a message
  that names `take` / `first` / `takeUntil` / a `Subject` nobody completes) and on one that errors.
  Emissions do not fail it: it asserts termination, and `expectNoEmission` is still the one for
  silence.

- **`mockDeep<T>(overrides?, { selfReturning: true })` — a deep mock that survives a chain of
  calls.** `mockDeep` builds depth on property *access*, so `api.repo.user.find()` chains while
  `logger.channel('app').info('x')` throws: the called node returned `undefined`, and
  `DeepMockProxy<T>` types the whole chain perfectly, so nothing warns. Six spec files in one
  migration were written against the type and reverted to `createAutoMock` + `mockReturnThis`
  before the cause was found. With the option, an *unconfigured* call hands the node back;
  `mockReturnValue`, `calledWith(...)` and `resolveWith` all still win, so the only case it gets
  wrong is a node deliberately configured to return `undefined` — which is why it is opt-in.

- **`setEmissionTimeout(ms)` — one default instead of `{ timeout: 0 }` at every call site.** The
  emission watchdog runs on real time on purpose (see *Changed*), so in a suite under global fake
  timers a failing assertion spends a real second. The reflex that produces is `{ timeout: 0 }`
  everywhere — nine call sites in a single batch — which disables the watchdog and leaves the next
  silent stream hanging to the runner's own timeout with no message worth reading. Set the default
  once in the setup file instead.

- **`blockNetwork` closes `XMLHttpRequest` and `navigator.sendBeacon`, not only `fetch`.** jsdom
  ships no `fetch` but implements XHR in full, and plenty of libraries never left it: `rmp-vast`
  pings every VAST tracker through a hand-rolled `XMLHttpRequest` (`FW.ajax`), so a suite driving an
  ad player with `setupAutoSpy({ blockNetwork: true })` already on kept reaching
  `radiantmediaplayer.com` — one ping per quartile, per ad, per test — and printed jsdom's
  `AggregateError at Object.dispatchError` for every connection that failed. What a green run
  printed therefore depended on whether the machine had a route to the internet. `blockNetwork()`
  now takes `{ fetch?, xhr?, beacon? }` (and `setupAutoSpy({ blockNetwork })` takes the same object
  or `true`); every channel is closed by default, so the bare call is unchanged apart from covering
  more. The two callers want different answers, which is why `xhr` is a mode rather than a boolean:
  `'reject'` (the default) fails the request the way an unreachable host does — `readyState` 4,
  `status` 0, an `error` event, and `BLOCKED_XHR_MESSAGE` on `statusText`, the only string channel a
  failed request has — so the code under test takes the branch a unit test should be asserting on,
  while `'empty'` answers it with a silent 200 and an empty body, for a tracker ping whose response
  nobody reads and whose failure only trades one kind of noise for another. The diversion happens in
  `open`, so the only address the real implementation ever holds is a local one whatever `send` then
  does; the failure itself is synthesised rather than delegated to a URL the environment refuses,
  because there is no URL jsdom and happy-dom agree to fail on. A `data:` URL is let through — the
  scheme a spec serves its own fixtures from, and the only one a DOM answers without a socket —
  while a **relative** URL is not, since the DOM resolves it against the document origin and the
  request then rests on nothing listening on that port. `sendBeacon` is replaced only where the
  environment has one, because introducing it would hand the code under test a capability it does
  not otherwise have. Everything goes in through `mockValueProp`, so `restoreMockedProps()` puts it
  all back. `WebSocket` and `EventSource` are left alone on purpose: their failure is an event on an
  object the code keeps and reconnects, so no blanket answer is free of a behaviour change of its
  own.

- **`no-mocked-for-spy` fixes what it reports** (`eslint --fix`), and it is the only rule here that
  does. It renames `Mocked<T>` / `MockedObject<T>` to `Spy<T>`, adds
  `import type { Spy } from 'vitest-auto-spy'` when the name is free, and drops the orphaned
  `Mocked` import once the last reference to it is gone — with the whole declaration when it was the
  only specifier, out of the braces when it was not. The reason this one may run unattended is that
  it touches nothing but a declaration: a wrong rewrite is a compile error, never a test that
  silently changed meaning. It declines where it cannot prove the rename — a `Mocked` the file
  declares itself, a `Spy` already bound to something else, or a `Mocked<{ a: Mock }>` whose
  argument is not a named type — and reports those without a fix.

- **A suggestion for the shape `no-expect-in-subscribe` fires on most often.** One template
  accounted for 111 of the 133 rule violations in a batch of 22 migrated spec files:
  `it(name, () => new Promise<void>((done) => { src$.subscribe((value) => { expect(…); done(); }); }))`,
  which is what a mechanical migration off Jasmine's `done` produced when `done` stopped being a
  test parameter. The rule now offers the rewrite —
  `it(name, async () => { const value = await firstValueFrom(src$); expect(…); })` — re-indented to
  the depth the test already sits at, with `firstValueFrom` imported when the file has no binding
  for it. It is offered only for that exact frame: one `subscribe` statement in the promise
  executor (anything else there is usually the statement that *triggers* the source, and that has to
  run while something is already listening), one block-bodied callback taking at most a value, and
  `done` mentioned exactly once and standing last. A suggestion rather than a fix, because a wrong
  rewrite here leaves a test that still passes — the failure this rule exists to catch.

- **Suggestions on `prefer-inject-spy` and `no-object-define-property`.** Both change behaviour
  rather than spelling, so an editor offers the edit and a human accepts it:
  `vi.spyOn(TestBed.inject(X), 'm')` → `injectSpy(X).m` (whether that finds a spy depends on a
  `provideAutoSpy(X)` usually written in another file), and
  `Object.defineProperty(o, 'p', { value })` → `mockValueProp(o, 'p', value)` (which leaves the
  property writable and configurable where the original sealed it — the point of the change, and
  still a change). Each brings its own import. Both decline the shapes they would have to invent:
  `TestBed.inject(X, null, flags)`, a computed method name, a descriptor with a getter or an extra
  key, or a name that already means something else in the file.

- **`createSpyFromClass(X, { fillMissing: true })` — a partially abstract class.** The
  empty-prototype fallback covers a *fully* abstract class; one concrete member is enough to leave
  that path, and a DI token with a few `abstract` declarations plus one concrete helper or getter is
  the ordinary Angular shape. `abstract read(): string` is erased before it reaches a prototype, so
  discovery finds only the concrete members, the fallback does not fire, and every abstract member is
  missing while `Spy<T>` types it as present: the read yields `undefined` and the failure lands in
  production code as `… is not a function`, with nothing pointing at the spec. `fillMissing` answers
  a name the prototype never carried with a spy. It has to be opt-in — TypeScript erases `abstract`,
  so at runtime such a class and a concrete one are the same object, and filling every unknown key by
  default would silence a genuine typo on every class in the suite, which is the property that
  separates this library from the mock-everything proxies. A member the record already has is still
  read from the record, so a lazy placeholder materialises exactly as it would without the wrapper;
  and the protocol keys the surrounding machinery probes to decide *what kind of object this is* —
  `then`, `constructor`, `toJSON`, `asymmetricMatch`, `$$typeof`, `nodeType`, and every symbol — are
  never filled: a spy on `asymmetricMatch` turns each `toEqual` against the double into a matcher
  invocation, and one on `toJSON` rewrites every snapshot of it.

### Fixed

- **A failed call could arrive as a successful one carrying the previous test's data** — the
  quietest defect in this library's history. Every observable helper writes into one
  `ReplaySubject(1)` per spied member, and that subject was created once and kept for the life of
  the spy, so its buffer outlived the configuration that filled it. A `nextWith(uri)` in one test
  was replayed to the next one **ahead of** the `throwWith(error)` that test was written for: the
  code under test walked the *success* branch on stale data, and the error branch was reached one
  emission late, if at all. Nothing in the failure pointed at the previous test. It needs a spy that
  outlives a test, which is the ordinary shape when the TestBed is built in `beforeAll`. A second
  failure came from the same place: `error()` and `complete()` close a Subject permanently, so every
  later `nextWith` on that spy pushed into a dead subject and emitted nothing at all — even after
  `resetAutoSpy`, which claims to return a spy to pristine and could not reach this state. The
  subject's lifetime is now the spy's *configuration*: `resetAutoSpy` drops it, and a terminated one
  is replaced by the next configuration. Inside one test nothing changes — `nextWith(a)` then
  `throwWith(e)` still means "emit a, then fail". `vi.clearAllMocks()` and `clearMocks: true` still
  cannot reach it, for the same reason they cannot clear a `calledWith` chain, so a spy shared
  across tests wants `resetAutoSpy(spy)` in `beforeEach`.

- **A proxy double satisfied rxjs's duck-typing, and that silently emptied a stream.**
  `of(autoMocked<AnimationItem>())` never emitted: `of(...)` calls `popScheduler(args)`, which takes
  the last argument for a scheduler when `typeof x.schedule === 'function'`, so a double that
  answers every property was eaten whole as the scheduler, `of()` was left with an empty argument
  list, and the emission was scheduled onto a spy that does nothing. The component under test kept
  its `null` and the assertion that failed was about an unrelated `emit()` — nothing pointed at
  `of`. Four keys are now answered with `undefined` unless a spec seeds them: `schedule`, `lift` and
  `@@observable` and `getReader` (`isObservable` and both `innerFrom` probes), joining `then` and
  every symbol, which always were. `subscribe` is deliberately **not** on that list — it is an
  ordinary method name and `expect(store.subscribe).toHaveBeenCalledWith(cb)` is a real assertion;
  denying `lift` and `@@observable` is enough that `from(double)` now fails with rxjs's own "You
  provided an invalid object where a stream was expected". A type that genuinely has one of the four
  seeds it once and gets it back.

- **`gettersToSpyOn` on a get/set pair spied only the getter.** The double came out poorer than the
  original exactly where the code under test expects symmetry: the assignment landed on the no-op
  setter the spy scaffolding installs, so the write vanished *and* there was nothing to assert on —
  `accessorSpies.setters.x` was `undefined`, and the failure read `Cannot read properties of
  undefined` several steps from the configuration behind it. Naming either half now installs both
  when the **prototype descriptor** declares both; mirroring never adds what the class does not
  have, so a read-only member stays read-only.

- **All four `mock*Prop` helpers were a silent no-op on `createAutoMock` and `mockDeep` doubles.**
  Both are Proxies; the helpers are built on `Object.defineProperty`; neither Proxy trapped it. The
  patch landed on the Proxy's own target, the `get` trap never looked there, nothing threw, and the
  test carried on reading the old value. That broke the composition of two things this library
  recommends in the same breath — `no-object-define-property` sends people to `mock*Prop`, the
  factory decision tree sends them to `createAutoMock` — and specs that hit it ended up building the
  double by hand, real getters plus a `createFunctionSpy` per method. Both Proxies now carry
  `defineProperty`, `deleteProperty` and (on `mockDeep`) `getOwnPropertyDescriptor` traps over the
  same store the `get` trap reads, so every helper works and `restoreMockedProps()` undoes it.
  Accessor descriptors are kept as accessors, so `mockReadonlyProp`'s getter is *called* rather than
  handed back.

- **A `mockDeep` result had nowhere to go.** `DeepMockProxy<T>` is not assignable to `T` (a mapped
  type cannot see private members, and it loses non-public members at depth), and `asInstance` — the
  bridge that exists for exactly this — took only a `Spy<T>`, which a deep mock is not: it has no
  `accessorSpies` bag. So the factory decision tree recommended `mockDeep` whenever the calls chain,
  and the result then fitted nothing that expected `T`. `asInstance` now has a second overload for
  it; the runtime story is identical to `createAutoMock`'s, so the bridge is the same one.

- **`delete mock.optionalMethod` deleted nothing.** On a double that materialises members on demand,
  dropping a key is not deletion — the next read made a fresh spy, the member was truthy again, and
  a test named "the optional method is missing, so we do not crash" exercised the branch where it is
  present. Green, and asserting nothing. A deleted key is now remembered as absent until something
  writes to it again, as it would be on a real object.

- **`expectEmission` inferred `unknown` instead of the emitted type, silently.** Its parameter
  matched rxjs's overloaded `subscribe` in a way that inferred nothing — TypeScript pairs the
  *trailing* signatures, and in rxjs 7 that is the deprecated positional overload — so
  `expectEmission(of(1))` was a `Promise<unknown>`. The call compiled, `resolves.toBe(1)` passed,
  and the loss surfaced only when somebody read a field off the awaited value (`TS2339`) or
  destructured it (`TS2488`). Three agents hit it independently, and the helper was losing to
  `firstValueFrom` — 58 files against 7 in one repository — on nothing but its types. Every helper
  now takes a first overload shaped like the callback form, which pairs correctly with rxjs 7 *and*
  with the single signature rxjs 8 leaves behind; `expectEmissions` was wrong the same way and is
  fixed with it. Hand-rolled observer-only sources still take the second overload unchanged.

- **`expectEmission` hung on an Angular `output()`.** `OutputEmitterRef.subscribe` takes a bare
  callback, and the helpers passed an observer object; `emit()` then called that object, and the
  `TypeError` went into Angular's `ErrorHandler` rather than out to the spec — so
  `await expectEmission(component.selectionChange)` waited for the watchdog with nothing to explain
  it. Both subscription contracts are now accepted: an rxjs source (detected by `pipe`) still gets
  the observer object, because rxjs reads a function argument as `next` and drops `error` and
  `complete`, and everything else gets an observer that is also callable.

- **`provideAutoSpy` / `createSpyFromClass` take an `abstract class`.** `abstract class LocalStorage
  extends AbstractStorage {}`, provided in production with `useClass`, is the standard Angular
  DI-token idiom, and it failed in both directions: the bare call compiled and produced a double
  with no spies on it, while the config form that would fix that did not compile at all
  (`TS2345: Cannot assign an abstract constructor type to a non-abstract constructor type`).
  `ClassType<T>` now carries an **abstract** construct signature — nothing in this library calls
  `new` on the token — and at runtime, when prototype discovery comes back empty (abstract members
  are erased before they reach a prototype), the factory hands back the `createAutoMock` proxy
  instead of an empty object, so every method of the declared type answers. `returns` is applied to
  it too. The hand-written workaround, `{ provide: X, useValue: createAutoMock<X>() }`, is no longer
  needed.

- **`onlyMethodsToSpyOn` was silently discarded on an abstract class.** The empty-prototype fallback
  above fired first and handed back the `createAutoMock` proxy, which answers *every* key — so the
  one thing a restricting list exists for ("spy these and no others, so an unexpected call is loud")
  was switched off without a word. A restricting list now keeps the assembled record whatever the
  prototype named. The typo warning that goes with it is suppressed when the prototype names nothing
  at all: there every entry would be reported and none of it is evidence of a typo, because a
  whitelist is the only way to describe such a class.

- **`overrideProvider(X, provideAutoSpy(X))` is not a silent no-op**, contrary to what `AGENTS.md`
  §13, the Angular page and the site's landing page all claimed. `provideAutoSpy` returns
  `{ provide, useValue }`; `overrideProvider` reads `useValue` off it and ignores the extra key, and
  the spy is installed. `overrideAutoSpy` is still the right call — it says what it does and hands
  the spy back directly — but the documented reason was false. Corrected in all three places.

- **A `mock*Prop` patch no longer survives a teardown that never ran.** `setupAutoSpy()` restored
  properties from an `afterEach`, and Vitest calls `afterEach` hooks in **reverse** registration
  order — so the hook a setup file registers is the *last* one, and any hook the spec file
  registered, which therefore runs first, takes the whole chain down with it when it throws. The
  patches then travelled into the next test and the failure surfaced wherever the leaked value
  happened to matter, which is routinely a different `describe` and an error about something else.
  The chain that exposed it is worth recording: a spec kept a long-standing
  `afterEach(() => vi.restoreAllMocks())`; migrating it to
  `provideAutoSpy(LayoutStateService, { gettersToSpyOn: [...] })` made the restored getter return
  `undefined`; `ngOnDestroy` called it as a signal and got a `TypeError`; the hook aborted; nothing
  of the library's cleanup ran; and the visible failure was a template error about a null profile in
  another `describe` entirely. Against the hand-rolled `vi.fn()` it replaced, the restored getter was
  still *callable*, so the mine had been armed and invisible for as long as the file existed. The
  restores now also run from an `onTestFinished` hook, which Vitest calls after the `afterEach` chain
  and calls whatever that chain did — measured in both orderings rather than assumed. The net does
  nothing unless the hook was skipped, so the ordinary path costs one boolean, and when it does fire
  it warns with the count and the cause, at the test where it happened instead of two tests later.

- **`flushEventLoopUntil`'s failure names the cause that reads as a flake.** It listed three
  possibilities and none of them covered what actually happened twice: the work *had* started, and a
  **cold** dynamic `import()` needed more turns than the budget. The giveaway is that only the first
  such test in a file fails while every later one passes off the module cache, so it looks
  intermittent and gets retried rather than read. The message now names that case first, with its
  fix — `await settleDynamicImport(() => import('…'))`, which awaits the module instead of counting
  turns.

### Changed

- **Documented the one migration rename that is not equivalent.** `vi.fn(() => x)` reads `x` when
  the double is *called*; `mockReturnValue(x)` freezes the value `x` had when the double was
  *configured*. Nothing distinguishes them until the test reassigns `x`, and the commonest reason to
  do that is a fresh `Subject` after the previous one was `error()`ed — which is exactly what the
  suite is exercising when it reassigns. In one spec the service then received a completed subject
  and silently skipped the modal it was meant to show, with the test green. The repair is
  `mockImplementation(() => x)`; `mockReturnValue` is for a literal. Written up in the migration
  guide and in AGENTS.md §18, because the rename looks like the safest edit in the file and anyone
  writing a codemod will reach for it.

- **`no-expect-in-subscribe` says which of three edits it is looking at.** The rule reported one
  message for three repairs that share a shape and nothing else, and five batches split the work by
  hand — the proportion moves per *file*, not per suite: 110 of 111 places were a mechanical
  inversion in one, 36 of 119 in another. Now: the subscription is the last thing the test does →
  invert it into `await firstValueFrom(...)`; another statement follows it → that statement is
  usually what makes the stream emit (`httpMock.expectOne(...)`, `subject.next(...)`,
  `vi.runAllTimers()`), inverting deadlocks, so hold the promise, fire the trigger and await it;
  the assertion is in the `error` branch, positional or named → `rejects`, which additionally fails
  when the stream succeeds, something an `error` callback nobody calls cannot do. The message also
  names `expectEmissions(source$, N)` for a callback that was asserting on every emission, and spells
  out that `subscribe({ next: () => expect.unreachable(…), error: (e) => expect(e).toBe(err) })`
  collapses to one `rejects` line.

- **…and finds assertions the callback reaches through a helper.**
  `source$.subscribe((data) => assertShape(data))` is the same green-and-empty test as the inline
  form, and the rule saw nothing there at all. It now steps once through a name bound in the same
  file — declared or assigned, either spelling — and counts the `expect`s in its body. A helper
  declared inside the callback is counted once, not twice.

- **The done-callback suggestion covers the observer forms.** `subscribe({ next })` behaves as the
  positional callback, and `subscribe({ complete })` becomes
  `await lastValueFrom(src, { defaultValue: undefined })` — `complete` fires after an empty stream
  too, which `firstValueFrom` rejects on, and seven places in one file were written that way. Two
  handlers are declined outright: a one-off codemod that looked for `done()` as the last line of *a*
  callback found it in `complete`, took `next` for the body, and broke a file.

- **`prefer-provide-auto-spy` reads `useFactory`.** It looked only at `useValue`, so
  `useFactory: vi.fn().mockImplementation(() => ({ isKeyEnabled: vi.fn() }))` went unreported — with,
  in one file, a structural double unrelated to the class and a double cast to make it fit. The
  factory is read *through* the function, which is the opposite of how a `useValue` is read and right
  for each: a factory's body is what DI ends up holding, while a function inside a `useValue` is a
  lazily-built double, i.e. the shape these rules recommend.

- **`no-mocked-for-spy` sees every type position.** The selector was pinned to a `let` annotation,
  so it missed a factory's return type, a helper's parameter, and `as unknown as Mocked<T>` — which
  in one batch stood on the line after the declaration in all eight reports. Fixing one and leaving
  the other is how a file ends up saying both.

- **…and says what a `Signal<T>` property needs.** Third independent report of one substitution: a
  signal replaced by `vi.fn().mockReturnValue(value)`, which reads identically at the call site and
  stops being a signal the moment anything puts a `computed()` or an `effect()` downstream of it.
  The message now spells the repair out as `mockReadonlyProp(obj, key, signal(value))`, with the
  word **real** on the signal.

- **`no-object-define-property` names the helper each descriptor asks for.** Five batches met four
  descriptor shapes and a message listing two helpers, and for two of those shapes the named helper
  is actively wrong: `{ get }` is `mockReadonlyPropGetter`, and a `{ value }` holding a mock the
  code calls with `new` is `stubConstructor` — spelled with a `function` because an arrow cannot be
  constructed, which is why `mockValueProp` there produces "is not a constructor" three assertions
  before anything looks wrong. The suggestion now declines that shape rather than proposing it, and
  the message adds the case where the property is missing because it is an instance field, whose
  repair belongs where the spy is built (`instanceMethodsToSpyOn`).

- **…and calls out a patch paired with a hand-written restore.** Two `Object.defineProperty` calls
  on the same object and key in the same block are a patch and a manual undo, and the undo runs only
  if every assertion between them passes: the first red one skips it and the global stays patched
  for the rest of the file — and, under `isolate: false`, of the worker.

- **`prefer-create-spy-from-class` stays out of `vi.mock()` factories.** The object a module mock
  returns replaces the module's *exports*, and its `vi.fn()`s stand in for classes used as DI
  tokens; `createSpyFromClass` cannot go there in any form, because a token has to be a constructor.

- **The emission watchdog's real-time clock is now explained rather than merely implemented.** It
  stays on the timers captured at import, for two reasons that are now written down: the helper *is*
  the assertion, so its clock must be the one thing a spec cannot stop; and a virtual watchdog would
  race the timers the spec advances — `{ timeout: 200 }` followed by `vi.advanceTimersByTime(5_000)`
  would fire at 200 virtual ms and reject the stream the spec was about to advance into. The timeout
  message no longer advises `{ timeout: 0 }` under fake timers, which disables the watchdog and
  takes the failure message with it; it points at `setEmissionTimeout` instead.

- **`PropStubValue<V>` accepts `null` and `undefined`.** "This member is absent in this test" is a
  normal thing for a spec to say, and interface declarations routinely omit the `| null` the runtime
  has. Such a call already compiled — by falling through to the untyped escape-hatch overload every
  `mock*Prop` helper carries — so what this changes is which overload answers: the checked one, with
  its property-name check and completions. Worth stating plainly, because it is easy to over-read:
  nothing a `mock*Prop` helper is handed is ever *rejected*, and that is deliberate — the escape
  hatch is a routine tool (a partial fixture of a fat type, a synthetic DOM event, a member the
  double does not have), not a last resort.

- **Documented two failures that are only diagnosable from the docs.** A member Angular moved onto
  the instance (`Router.currentNavigation` since Angular 20) is not on the prototype, so the spy does
  not have it and configuring it throws `TypeError: Cannot read properties of undefined (reading
  'mockReturnValue')`; the fix is `instanceMethodsToSpyOn`, and there is no better runtime message to
  be had — instance fields do not exist until a constructor has run, and this factory never
  constructs. Answering an unknown member with *something* would make that something truthy, which
  is the exact failure mode the protocol deny-list above removes. And a component's own
  `@Component({ providers })` beating a module-level `provideAutoSpy` is now a section of §13 rather
  than a row in the error table — it has surfaced twice in one migration wave, both times as a
  `TypeError` inside whatever the real service touched first.

- **Documented the one thing about `mockDeep` that the types hide:** depth comes from property
  access, not from calls. `AGENTS.md` §2, the decision tree, and the auto-mock page now say so
  before recommending it for chains.

- **`prefer-provide-auto-spy` sees the doubles it was written for.** It read the `useValue` only
  when the object literal was written in place, and only its direct properties. Both misses were
  found on live code: in one spec file eight hand-rolled doubles were declared as `const`s above the
  TestBed and passed by name, and the rule reported none of them; and a platform double written as
  `{ type: 'tizen', application: { init: vi.fn() } }` read as configuration because the spy was one
  level down. It now follows a name to the `const` that initialised it — same file, never
  reassigned, the same one-step resolution `prefer-inject-spy` uses — and looks through the whole
  `useValue` subtree, stopping at every function boundary so that a factory returning spies (the
  shape it steers towards) is still not flagged.

- **A configured `vi.fn()` counts as one.** `vi.fn()` and `vi.fn().mockReturnValue(of([]))` are the
  same double, one of them tuned, but the check both provider rules sit on read the immediate
  callee's object and stopped there — so it recognised the bare form and missed every configured
  one. In one `providers` array the double on one line was reported and the one on the next was
  not; four independent migration batches found it on four different files. Exactly backwards, too:
  the more a hand-rolled double has been tuned, the further it has drifted from the class it stands
  in for. The member chain is now unwound to the call that created the mock, however long it is
  (`vi.fn().mockReturnValue(x).mockName('y')`), which mostly shows up in
  `prefer-create-spy-from-class` — it counts direct property values and never walked the subtree.

- **`prefer-provide-auto-spy` stops recommending a call that does not compile.** It named
  `provideAutoSpy(Token)` for everything, and on an `InjectionToken` that is wrong: `provideAutoSpy`
  reads a class prototype and a token has none, so the right call is `provideAutoSpyForToken` —
  which the message had never heard of. Three batches reported it independently, and it was not a
  rare corner: 6 of 8 reports in one, 3 of 12 and 2 of 5 in the others. The rule now tells the two
  apart, by the declaration where `new InjectionToken(…)` is within the resolver's reach and by the
  `SCREAMING_SNAKE_CASE` spelling otherwise, and the class message names the token form as well —
  the two are never interchangeable, so guessing silently would have been worse than saying both.
  The token message also carries the seed that the first use of it needs:
  `provideAutoSpyForToken(LOGGER, { channel: vi.fn().mockReturnThis() })`, without which a
  constructor doing `inject(LOGGER).channel('auth').debug('…')` dies on `undefined` before the spec
  runs a line.

- **`prefer-create-spy-from-class` no longer flags its own fix.** An object of `vi.fn()`s handed to
  one of this library's factories — `createAutoMock<T>({ send: vi.fn(), abort: vi.fn() })`,
  `mockDeep<T>({ api: { load: vi.fn(), save: vi.fn() } })` — is a *seed*, and there is no other form
  it could take: it was reported all the same, so replacing a hand-rolled double as the rule asks
  produced a fresh violation of the same rule. At `error` level that stops the work, and the only
  way past it is an `eslint-disable` over correct code. Anything inside a call to `autoMocked`,
  `createAutoMock`, `createMock`, `createSpyClass`, `createSpyFromClass`, `mockConstructor`,
  `mockDeep`, `provideAutoSpy` or `provideAutoSpyForToken` is now left alone, at any depth.
  `prefer-provide-auto-spy` was checked for the same trap and does not have it: a `useValue` built
  by a factory is a call rather than an object literal, which it already ignores.

- **`no-expect-in-subscribe` reports once per `subscribe`, with the assertion count.** It counted
  `expect` calls, so one file produced 44 messages for 23 places — which doubles the apparent size
  of the job when a migration is triaged by rule counts, and every one of those messages named the
  same rewrite.

- **`no-object-define-property` names the helper the descriptor asks for.** The message listed
  `mockReadonlyProp` / `mockValueProp` for every shape, including
  `Object.defineProperty(host, 'offsetHeight', { get: () => 1000, configurable: true })` — which is
  literally `mockReadonlyPropGetter`. It now maps the descriptor to the helper (`value` →
  `mockValueProp`, `get` → `mockReadonlyPropGetter`, a `get`/`set` pair → `mockAccessorsProp`, a
  signal-valued property → `mockReadonlyProp`), and the suggestion covers the getter form as well
  as the value one. A `configurable` key alongside is fine — restoring configurability is the point
  of the change — and anything else is reported without a suggestion.

- **`setupAutoSpy({ strayRejections: true })` no longer reports a failure twice.** An `async` test
  that fails an assertion leaves its own `AssertionError` in two places: the runner reports the
  failed test, and under some zone patches the same error also arrives as a rejection nobody
  handled. A red run then printed two messages per failure, and the first thing a reader does with
  the second one is go looking for a defect that is not there. The teardown step now reads the
  errors the runner has already attributed to the test that just finished — `task.result.errors`,
  populated by the time `afterEach` runs — and drops a captured rejection that is the same object,
  or carries the same message and stack. What survives is what the check is for: the rejections that
  fail no test at all.

- **`prefer-inject-spy` reads the two-step form too.** It used to see only
  `vi.spyOn(TestBed.inject(X), 'm')`; the same mistake spelled over two lines —
  `const events = TestBed.inject(EventsService); vi.spyOn(events, 'announce')` — went unreported,
  which was found with both forms on adjacent lines of one file and only the first of them flagged.
  The variable is resolved through the parser's scope manager, so the rule still leaves alone
  anything it cannot pin down: a name bound by an import or a parameter, a `let` declared without an
  initialiser, one initialised from something other than `TestBed.inject`, and one assigned again
  anywhere in the file — by the `spyOn` it holds whatever that assignment put there.

## [3.4.0] - 2026-08-29

### Added

- **`setupAutoSpy({ pruneMockRegistry: true })`** — keeps `@vitest/spy`'s registry of every mock ever
  created down to the mocks that outlive a file. `vi.fn()` and `vi.spyOn()` add what they create to one
  module-level `Set`, because that is what `vi.clearAllMocks()` walks, and no API takes anything out
  of it again. With `isolate: true` the module is re-evaluated per file and the set starts empty; with
  `isolate: false` it is evaluated once per worker and only grows, so `clearMocks: true` walks every
  mock of every file already run **before every single test**, and the worker's heap holds all of them
  at once — with their recorded arguments, and through those whole component trees. The set is not
  exposed, so it is taken from the one thing that iterates it: `Set.forEach` hands its receiver to the
  callback, so `vi.clearAllMocks()` under a briefly patched `Set.prototype.forEach` reveals it, and the
  capture is verified against a probe mock — without a match nothing is pruned, because a slower run
  beats a broken one. The half that is easy to get wrong is what must **not** go: dropping a mock means
  `clearMocks` can no longer see it, which is harmless for one that dies with its file and a bug for the
  module-level `vi.fn()` in a shared `*.mock.ts` that six spec files import — the first file to import
  it creates it, a naive prune drops it when that file ends, and the file that happens to run second
  then fails on calls its predecessor made. Read as flakiness, because which file is first is the
  runner's choice. So the split is drawn where it is observable: what exists when a file's hooks start
  was created while the module graph was being evaluated and is kept, everything added afterwards
  belongs to that file and goes when it ends. `trackMockRegistry()` installs it on its own,
  `keepMockRegistered(mock)` marks the one case the split misses (a module loaded by a dynamic
  `import()` inside a test), and `getMockRegistrySize()` reports what is left. Off by default: it
  reaches into a set the runner does not expose.

## [3.3.0] - 2026-08-29

### Added

- **`setupAutoSpy({ strayRejections: true })`** — turns a promise rejection zone.js swallowed into a
  failed test. zone.js replaces the global `Promise`, and a rejected `ZoneAwarePromise` nobody
  handled is drained into `console.error` and no further: it never reaches
  `process.on('unhandledRejection')`, the channel Vitest listens on, so the runner is never told and
  the file still exits 0. An assertion that dies inside a `.then()` therefore prints to stderr and
  leaves its test green — as does an `async` helper called without `await`, and a `TypeError` thrown
  inside an `import('…').then(…)` in production code. In the migrated Angular monorepo this came
  from — 1688 spec files, 11 587 tests, green, exit 0 — that one shape was hiding **six real
  defects**, two of them assertions that were simply false. The option claims the hook zone.js
  leaves free under Node and jsdom (`Zone[Zone.__symbol__('unhandledPromiseRejectionHandler')]`),
  chaining to whatever was already there rather than replacing it, and fails the test the runner was
  in when the rejection surfaced. Off by default, because it needs zone.js already loaded — this
  package never imports it, so a zoneless project is untouched and the call throws rather than
  pretending to watch. Deliberately **not** a `process.on('unhandledRejection')` listener: Vitest's
  own handler bails out as soon as a second listener exists, so adding one would *silence* the
  native rejections the runner already fails a run for. `trackStrayRejections()`,
  `countStrayRejections()` and `flushStrayRejections()` are exported for a suite that wants the
  check somewhere narrower.

- **`no-floating-assertion`** — a ninth ESLint rule, `error` in `configs.recommended`, and the
  static half of the same failure. It flags an `expect()` inside a `.then()` / `.catch()` /
  `.finally()` callback whose chain is a bare expression statement: nothing awaits it, returns it,
  assigns it or passes it on, so the test ends before the callback runs and the assertion never runs
  at all — the test passes whatever it claimed, including claims that are false. It walks to the top
  of the chain before deciding, so the first callback of `p.then(a).catch(b)` is not cleared by the
  second having a consumer, and it reads only the *immediately* enclosing callback: awaiting the
  chain revives an `expect` sitting directly in the `.then()`, but not one parked in a
  `subscribe()` inside it, and reporting only what the fix repairs keeps the message honest.

## [3.2.0] - 2026-08-28

### Added

- **`setupFakeTimers(config?, { betweenTests })`** — keeps the clock fake in the gaps between tests,
  not only during them, which is what Jest's `fakeTimers.enableGlobally` did. Arming in `beforeEach`
  alone does not reproduce it: a `beforeAll` inside a **nested** `describe` runs after the previous
  test's `afterEach`, so a block that prepares its samples there — driving an animation clock with
  `vi.advanceTimersByTimeAsync`, say — fails with `A function to advance timers was called but the
  timers APIs are not mocked`, in a set whose own tests never touch a timer. Off by default, because
  a scoped call belongs to its `describe`; `setupAutoSpy({ globalFakeTimers })` turns it on, and the
  fakes come off in `afterAll` so they never outlive the file.

### Changed

- **The `vitest-auto-spies` alias is published by CI**, from both release paths, right after the
  canonical package reaches npm (`.github/workflows/publish-alias.yml`). The step re-checks that the
  generated directory matches `package.json`, refuses to publish before the package the alias
  depends on is on npm, and skips a version that is already there — so it is safe to re-run, and it
  can be run on its own to catch up a version released before it existed. Publishing by hand is what
  let the alias sit at 1.9.3, two majors and four entry points behind.

- **CI runs `npm run test:zone` and `npm run alias:sync:check`.** `vitest-auto-spy/zone` is the only
  entry that touches zone.js and no other suite loads any of it, so `fakeAsync` / `waitForAsync` were
  verified locally and nowhere else.

- **`installProxyZonePatch({ scope })`** — `'shared'` (the new default) runs every test and hook body
  of the run through one proxy zone, which is what Angular's own jasmine patch does: a component
  built in `beforeEach` schedules from its constructor, and the `tick()` inside the `fakeAsync` test
  has to see those timers. `'callback'` keeps the previous fork-per-callback behaviour, which is what
  `test.concurrent` needs — two callbacks in flight would otherwise swap the same `ProxyZoneSpec`
  delegate under one another.

- **`DeepPartial<T>` accepts the real value at every level**, not only a partial of it. The type is a
  mapping over host objects as well — `BuiltIn` can only list ECMAScript types, since naming `Node`
  or `NodeList` would put `lib: ["DOM"]` into the published `.d.ts` for `/node`, `/nestjs` and
  `/bun` — and a real `NodeList` had stopped being assignable to the mapping of itself
  (`createMock<MutationRecord>({ addedNodes: nodeList })`). Excess-property checking is unaffected: a
  key `T` does not have is still rejected at any depth.
## [3.1.0] - 2026-08-28

Everything below comes from one source: a 1688-spec Angular monorepo moving from Jest to Vitest
under the native `@angular/build:unit-test` builder. Each item is something that had to be written
by hand there, in more than one place, by more than one person.

### Added

- **`mockConstructor(factory, name?)` and `stubConstructor(target, key, factory)`** — a test double
  the code under test can call with `new`. This is the single most common failure of a Jest → Vitest
  move: `jest.fn().mockImplementation(() => instance)` served `new`, and Vitest only forwards `new`
  to a constructible implementation, so an arrow records the call, skips the body and hands back an
  empty object. What arrives is `TypeError: (cb) => {…} is not a constructor` with a stack in
  production code, or a green test for the wrong reason. `mockConstructor` stays a full runner mock
  (matchers, `mockClear`), collects `instances`, throws by name if it is ever called *without* `new`,
  and refuses a factory that returns a primitive (which `new` would discard). `stubConstructor`
  installs it through `mockValueProp`, so `restoreMockedProps()` puts the real constructor back.
- **`flushEventLoop(turns?)` and `settleDynamicImport(load, turns?)`** — real event-loop turns while
  the timers are faked, without touching the clock. `await Promise.resolve()` never advances a
  dynamic `import()` or a native `async` function inside a dependency, and `setTimeout` is the fake
  one; the working alternative, `vi.advanceTimersByTimeAsync(0)`, reads as "move the timers" in a
  test that has no timers and gets deleted as noise.
- **`stubAbortController()`** — a realm-consistent `AbortController` / `AbortSignal`, so
  `addEventListener(…, { signal })` works under jsdom. The failure it removes,
  `TypeError: 'addEventListener' called on an object that is not a valid instance of EventTarget`,
  is raised by jsdom, caused by Node's fetch globals and triggered by zone.js, and names none of
  them.
- **`mutationRecord(target, init?)` and `resizeEntry(target, rect?)`** — the missing counterparts of
  `intersectionEntry`. A `MutationRecord` cannot be written as an object literal at all
  (`addedNodes` is a `NodeList`), and the obvious `DocumentFragment` construction **moves** the
  nodes, tearing them out of the fixture under test; this one moves nothing.
- **`stubIntersectionObserver({ autoEmit: true })`**, `stubObserver(name, { autoEmit })`, and
  `observers.last.options`. `autoEmit` reproduces the Jest-era global mock that reported everything
  as visible synchronously from `observe()` — without it, a whole ported suite silently asserts on
  components that never loaded their data. `options` exposes the init object, so a spec can assert
  "one observer per unique root margin" instead of counting constructions.
- **`autoMocked<T>(overrides?)`** — `createAutoMock` typed as `T & Spy<T>`, for a collaborator that
  is passed as an argument rather than injected (a logger, a reporter, a telemetry client) and has to
  satisfy `T` at the call site and expose spy helpers at the assertion.
- **`setupAutoSpy({ globalFakeTimers })`** — Jest's `fakeTimers.enableGlobally`, which Vitest has no
  setting for, with both ends guarded so a spec that drives the clock itself does not hit a second
  `vi.useRealTimers()`.
- **`mockSystemTime`, `withSystemTime`, `mockNow`, `useCountingClock`** (from `/setup`). Clock
  control that survives fake timers being re-installed around every test: `vi.useFakeTimers()`
  installs a fresh `Date` each call, so a `beforeAll` patch of `Date.now` is left on an object
  nothing reads, and the naive undo re-attaches a dead clock's `now` to the live one.
  `useCountingClock` makes `Date.now()` count, which is the only way to express an expectation about
  *order* or *duration* under a frozen clock.
- **`overrideAutoSpy(Token, config?)` and `overrideComponentProvider(Component, Token, config?)`**
  (from `/angular`) — for a dependency a component declares in its own `providers`, which a
  testing-module provider cannot replace. They also remove two silent no-ops:
  `overrideProvider(X, provideAutoSpy(X))` passes a provider where `{ useValue }` is expected and is
  ignored without a warning, and `overrideProvider` never reaches a component the TestBed compiler
  was not given.
- **`assertNgModuleScopes(...modules)`** (from `/angular`) — names the module when an AOT test bundle
  has stripped `ɵɵsetNgModuleScope`, so `imports: [DirectivesModule]` contributes nothing. It
  otherwise reports as `NG0303`, `NG0301`, `NG0304` or as complete silence, none of which mentions a
  module.
- **`registerFocusMatchers()` / `expect(el).toHaveFocus()`** (from `/setup`) — distinguishes the
  three causes a focus assertion actually has: the expected element does not exist, focus is still on
  `<body>`, or focus is elsewhere. The two idioms it replaces fail with two giant DOM dumps or with
  `expected false to deeply equal true`.
- **`injectSpy` accepts an `InjectionToken`**, not only a class, and **warns when the injector hands
  back a plain instance** rather than an auto-spy — a provider the spec forgot to register is
  otherwise found when `.mockReturnValue(…)` is called on the real method, or, for a class with no
  private members to make the types disagree, never. Once per token.
- **`asInstances(...spies)`** — `asInstance` for a whole argument list. One wrapper per argument is
  not merely longer, it is *discovered* one argument at a time: TypeScript stops checking a call at
  the first argument that does not fit, so a factory taking five spies reports one `TS2345`, and the
  next only after the previous is fixed and `tsc` is run again.
- **`Spy<T, { overload: 'first' }>`, `asSpy<T, Options>`, `Overload<F, N>`.** `Parameters` and
  `ReturnType` read the **last** signature of an overloaded method — on a generated API client
  (`ng-openapi-gen`, `openapi-generator`) that is `observe: 'events'`, the one nobody calls, so
  `nextWith(body)` stops compiling and demands an `HttpEvent<T>` with nothing in the message about
  overload order.
- **`createMock` / `createAutoMock` take a deep partial.** `Partial<T>` is one level, so a fixture
  for a tree the test reads one leaf of — a config object, an account token, a route snapshot — cost
  one call per level and the ability to name each nested type. What matters is preserved: a key `T`
  does not have is rejected **at any depth**, which is the check `as T` throws away and the reason a
  renamed field goes unnoticed.
- **`returns` in the spy configuration** — `provideAutoSpy(X, { returns: { getProducts: of([]) } })`.
  Without it the value needs a second statement in every `beforeEach`, and the shortcut people take
  instead is an exported `const` provider, which under `isolate: false` is one set of spies shared by
  every file that imports it. Installed through the mock adapter, so it works on all three runners.
- **`narrow(value, guard)`, `narrow.byKey(value, key)`, `narrow.observable(value)`** — the branch of a
  union a test knows it got. The two alternatives are an assertion (a lie the compiler then stops
  checking) and a hand-written `if (…) else throw` per site; this one prints the shape the value
  actually had, which is the only thing that makes it cheaper than the assertion.
- **`withOverrides(model, overrides?)`** — a fixture from a model instance whose getters survive.
  `{ ...model, flag: true }` drops every accessor (spread copies own enumerable properties);
  `Object.assign(new Model(), fields)` keeps them live, so each runs against a half-filled instance
  and throws from inside the model. This reads them once, while the model is whole.
- **`compareTestRuns(baseline, current, root?)`** — whether a migration lost a test. Counters cannot
  answer it: a file can lose a whole suite while a flake elsewhere starts passing, and the totals
  match. The answer is the symmetric difference of two sets of `file::full name`, from the JSON
  report both runners write.
- **`createDirectiveHost({ template, scope, props })`** and
  **`registerDirectiveMatchers()` / `toHaveDirectiveApplied`** (from `/angular`) — a host for a
  directive under test that is correct for the compiler *and* for the TestBed. `imports` on a
  `@Component` is resolved by AOT and baked into `ɵcmp`; `imports` on
  `TestBed.configureTestingModule` is resolved at runtime from `ɵmod`, which a test bundle leaves
  empty — so the same line is alive in one place and dead in the other, and a `standalone: false`
  host declared in a spec is compiled outside any scope at all.
- **`setupAngularTestEnv`, `installPerTest`, `guardGlobals`** — see above.
- **Two more lint rules**: `no-mocked-for-spy` (a variable declared as Vitest's `Mocked<T>`, whose
  assignment then fails with a list of private field names) and `no-done-callback` (Vitest passes a
  `TestContext`, so `done()` throws inside a promise nobody awaits and the test **passes** having run
  almost none of its body).
- **`stubMediaElement(options?)`** — a `<video>` / `<audio>` that answers. jsdom implements the media
  elements as a shell (`play()` throws, `duration` is `NaN` behind a setter-less accessor,
  `canPlayType()` says `''` to everything, `readyState` never leaves 0, `error` is not on the
  prototype), so every player, advertising or subtitle suite writes the same forty lines of
  `Object.defineProperty` against the prototype — and leaks them into the next file. Two things the
  hand-written version gets wrong are what this is for: the state is **per element** (one closed-over
  `duration` reports the same length for the ad and for the content, which is the pair the spec exists
  to tell apart), and `set()` **fires the event** the browser would (`durationchange`, `timeupdate`,
  `ended`, `error`, `loadedmetadata`) instead of only moving the field, which leaves the component on
  its initial state while the assertion reads the new value off the element.
- **`assertMocked(namespace, options?)` and `moduleNamespace(exports, options?)`** — the two halves of
  "the module mock did nothing". `vi.mock()` is the one piece of a ported suite that fails *silently*:
  under a bundler a workspace alias or a barrel is already inlined when the mock would be installed,
  and under `isolate: false` a module already in the worker's graph keeps whichever mock got there
  first. `assertMocked` turns both into a failure at the line that assumed the mock, naming the
  specifier. `moduleNamespace` produces the `{ …exports, default, __esModule }` shape that the
  `mod.default ?? mod` interop probe of any CJS-and-ESM dependency looks for — without it the factory
  fails as `No "default" export is defined on the mock`, thrown from inside that dependency.
- **`flushEventLoopUntil(isDone, options?)`** — real event-loop turns until a condition holds, with a
  budget. The shape behind every hand-rolled "settle" helper (a `resource()` leaving `loading`, a
  chunk becoming reachable): written by hand it is a fixed turn count tuned by trial, which always
  waits the maximum and breaks again as soon as a dependency adds a hand-off. A condition that never
  holds fails naming what was waited for, instead of hanging until the runner's timeout blames the
  file.
- **`diffByField(actual, expected)`** — which field of an array of records moved, and in how many
  elements. The runner collapses objects, so nine collected events against nine expected ones report
  as `expected [ { event_timestamp: 1, …(5) }, …(8) ] to deeply equal [ { …(6) }, … ]` — and the
  answer is normally "one field moved in all of them", which the message cannot say. It reports
  `actual 1 everywhere, expected 2, 3, 4, …`, the signature of a frozen clock or a constant id.
- **`setupAutoSpy({ guardGlobals })`** — names the test that redefined a property of `globalThis` /
  `document` / `navigator` as **non-configurable**, which nothing can undo.
  `Object.defineProperty(document, 'cookie', { value })` defaults `configurable` to `false`; under
  per-file isolation that is harmless, and under `isolate: false` it is a mine that fails a *later*
  file, in some library, every other run. Exported as `guardGlobalPatches(reaction)` too.
- **`installPerTest(install)`** (from `/setup`) — re-installs a stub before every test of the block
  and hands back a reader for the current handle. Every stub here is restored away after each test,
  so one installed at `describe` level or in a `beforeAll` is gone from the second test on — and the
  failure is an assertion about the component, with the stub ten lines above it apparently in force.
  The same ordering bites from the other side: a setup file's root `beforeEach` runs *before* a
  file's own hooks, so a `beforeAll` in a spec loses to it silently.
- **`setupAngularTestEnv({ zoneless, initZone, initZoneless })`** (from `/angular`) — zone and
  zoneless spec files in one worker. `initTestEnvironment` may be called once per platform and, under
  `isolate: false`, the platform lives for the whole run, so a repository migrating to zoneless
  gradually fails on the second file in the other mode with `Cannot set base providers because it has
  already been called` — naming neither file. Vitest's `test.projects` does not help: nothing promises
  a worker serves files of one project. The initialisers stay the caller's.
- **A sixth lint rule, `no-shared-module-level-mock`** — an *exported* value holding `vi.fn()`s, which
  under `isolate: false` is one set of spies for the whole worker, registered against whichever file
  imported first and out of reach of every other file's `clearMocks`. The rule stops at every function
  boundary, so the factory form — the fix — is not flagged along with the problem.

### Changed

- **The `vitest-auto-spies` alias package is generated, not hand-written** (`npm run alias:sync`,
  checked by `npm run check`). Hand-writing it had let it drift to a release behind, with no
  `/bun-angular`, `/setup`, `/zone` or `/eslint-plugin`, and with a `require` condition on entries
  that are ESM-only — one that resolves to an ESM file and throws `ERR_REQUIRE_ESM` on every Node
  below 22.12. The alias now mirrors the canonical `exports` map exactly: same subpaths, CJS only
  for `/node` and `/eslint-plugin`, same peer ranges, same version. Publishing it stays a manual
  step after the canonical release — see `CONTRIBUTING.md` → Releasing.

### Fixed

- **`Spy<T>` collapsed to `never` for a method whose return type could not be read.** A generic
  method with a conditional return type — `get<K extends keyof this>(k: K): this[K] extends
  Stringified<infer R> ? R : never`, which is the shape of every typed configuration service — does
  not match `(...args: any[]) => infer ReturnType`, so the helper bundle took its false branch and
  `Method & Mock & never` annihilated the member. What the user saw was `Property 'mockReturnValue'
  does not exist on type 'never'`, with nothing anywhere naming the method or the return type. The
  fallback is now the synchronous helper bundle, and every return-type comparison is made on tuples
  (`[X] extends [Y]`) so that a return type that *does* resolve to `never` cannot distribute into one
  either.
- **`gettersToSpyOn` / `settersToSpyOn` could not name a signal-valued getter — which is most of
  them.** The element type was "keys whose value is not callable", and `Signal<T>` is
  `(() => T) & { … }`: callable. For a service whose readonly state is all signals (`get isCompactMode():
  Signal<boolean>`) the list had *no* valid member, and the failure read `Type 'string' is not
  assignable to type 'never'` — 34 of one shard's 51 type errors. Whether a member is an accessor is
  a fact about its descriptor, not about the type of the value, so any string key may now be named.
  What is checked instead, at runtime, is the case that is unambiguously a mistake: naming a
  **method**, which installs a spied accessor over it and takes the method away.
- **The `mock*Prop` helpers rejected a real value when handed the `Spy<T>` they are meant for.**
  `injectSpy` / `asSpy` is the documented way to reach a service, and on that object a signal-valued
  member is typed `Signal<T> & Mock & …` — so `mockReadonlyProp(spy, 'state', signal(x))` could not
  type-check, and the spec had to keep the instance under a second name purely to patch it. The value
  is now checked against the member's own type.

### Documentation

- `AGENTS.md` gains two sections — "Waiting: four queues, and which tool drives each" and "Doubles
  for what the code builds itself" — and thirteen new rows in the error → fix table, including the
  `Spy<T>` ↔ `T` compiler errors by code (`TS2352` → `asSpy`, `TS2739`/`TS2740`/`TS2345` →
  `asInstance`), `Mocked<T>` vs `Spy<T>`, and the generic-class `any` that surfaces as an
  `AddPromiseSpyMethods` mismatch eight levels deep.
- New guidance on patching **DOM object** properties with `mockValueProp` (the three ways the
  hand-written `Object.defineProperty` goes wrong, including the accessor-on-the-prototype case),
  on shared fixtures having to be **factories** under `isolate: false`, on Vitest's `afterEach`
  ordering differing from Jest's, and on installing observer stubs in `beforeEach` rather than
  `beforeAll`.
- The migration guide now states plainly which `jest.*` calls have **no** Vitest equivalent
  (`jest.requireMock`, `jest.replaceProperty`, `fakeTimers.enableGlobally`, `jest.spyOn(global,
  'Date')`, a `jest.fn()` used with `new`) and that `vi.mock()` of a bundled barrel is a silent
  no-op.
- New pages: "Constructor doubles", "Waiting and the clock", "Media element stub" and "Module
  mocks"; the "Patterns that hold up" page gains "An array assertion that says nothing".

### Added — `vitest-auto-spy/zone`

- **`fakeAsync` and `waitForAsync` work on Vitest.** `zone.js/testing` patches jasmine, mocha and
  jest; Vitest is not among them, so in an Angular project on Vitest *every* `fakeAsync` fails with
  `Expected to be running in 'ProxyZone', but it was not found`. One package does something about it
  today (`@analogjs/vitest-angular`), which a project moving to the native `@angular/build:unit-test`
  builder loses along with Analog. Importing `vitest-auto-spy/zone` runs every test and hook body
  inside a forked proxy zone. It needs `test: { globals: true }` — the patch replaces the runner
  globals, and an imported `it` is a module binding nothing can reach.
- **zone.js is a `devDependency` of this package and nothing else** — not a dependency, not an
  optional peer. The entry imports none of it (it reads `globalThis.Zone`, which the consumer has
  loaded, and says so plainly when it has not), no other entry reaches the module even transitively,
  and `dist/zone.js` is self-contained. A zoneless project gets no zone code and no zone install.
  This is recorded as an invariant in `AGENTS.md`, because a convenient re-export from the root would
  quietly break every zoneless consumer.
- Three details are what make the patch not break the runner, and each was a failure in *other
  people's files* when it was written by hand: the wrapper declares **no parameters** (Vitest reads
  `fn.toString()` to find fixtures), it carries the original `length` and `toString`, and `it` is
  **proxied** rather than replaced, so `it.each(table)(…)` keeps the receiver its implementation
  reads.

## [3.0.0] - 2026-08-26

### BREAKING CHANGES

- **The `vitest` peer range is now `>=2.1.0`** (was `>=1.0.0`). The typed
  `spy.method.mock.settledResults` surface comes from Vitest's own `Mock` type, and `@vitest/spy`
  only grew `settledResults` in 2.0 — on Vitest 1 that documented surface never type-checked, so the
  old range claimed a version the types could not serve. 2.1 rather than 2.0 because the 2.x line
  effectively *is* 2.1 (2.0.x is ~0.3% of Vitest installs against 2.1.x's ~10%). Nothing in the
  shipped code changes: there are no version branches to delete, so `dist/` size, runtime and memory
  are untouched — this is the supported range catching up with what the types actually require.
  Vitest 1 users: upgrade Vitest, or stay on `vitest-auto-spy@2.0.x`.

## [2.0.3] - 2026-08-26

### Changed

- **A spy no longer allocates its `calledWith` machinery until something configures it.** Every
  function spy used to be born with two `calledWith` chains — an object plus an argument map each —
  and the overwhelming majority of spies never configure either. They are now built on first use, so
  a materialised spy sheds ~560 B: 2000 spies over a 40-method class drop from 417.3 MB to 372.7 MB
  of heap, about 11%. Nothing changes when a spec does use `calledWith`; the chain is then built
  exactly as before. `resetAutoSpy()` now drops the chains instead of replacing them with empty maps,
  so a reset spy is back to a fresh spy's footprint. On the dispatch path the same change removed a
  `{ found, value }` object that was allocated on every call of a configured spy purely to carry a
  boolean — an object argument matches in 2.64 µs instead of 2.82 µs.

### Fixed

- **`require('vitest-auto-spy/node')` was handed ESM type declarations.** The two subpaths that ship
  CommonJS listed a single `types` key for both conditions, pointing at the `.d.ts`. In a
  `"type": "module"` package that makes TypeScript's `node16` resolution read an ESM declaration file
  for a CommonJS import and report the types as masquerading — while the emitted `.d.cts` files were
  published and referenced by nothing. Both subpaths now carry per-condition `types`.

## [2.0.2] - 2026-08-26

### Fixed

- **The release workflow tagged a version it never published.** `npm version` was called inside a
  command substitution to read the new number back, but this package defines a `version` lifecycle
  script, so npm printed that script's banner (`> vitest-auto-spy@x.y.z version`) before the tag
  name. The multi-line `key=value` that produced was rejected by `$GITHUB_OUTPUT` with
  `Invalid format '> version'` — and the step failed *after* `git push --follow-tags` had already
  run. v1.13.0, v2.0.0 and v2.0.1 were therefore tagged on GitHub while the publish and release steps
  never ran, leaving npm on 1.12.0. The version is now read back from `package.json`, the way the
  publish step already did.

## [2.0.1] - 2026-08-26

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

## [2.0.0] - 2026-08-26

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

## [1.13.0] - 2026-08-26

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

### Changed

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

### Fixed

- **`calledWith` no longer depends on the order an object literal was written in.** Argument matching
  builds a serialized key, and object keys went into it in insertion order — so
  `calledWith({ id: 1, name: 'a' })` did not match a call made with `{ name: 'a', id: 1 }`. The spy
  answered `undefined` and nothing in the failure pointed at the cause. Keys are now sorted at every
  depth, which also makes `mustBeCalledWith` mismatch messages stable rather than dependent on
  construction order. Array order is untouched — there the order is the value.

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

[Unreleased]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v5.7.0...HEAD
[5.7.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v5.6.0...v5.7.0
[5.6.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v5.5.0...v5.6.0
[5.5.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v5.4.0...v5.5.0
[5.4.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v5.3.0...v5.4.0
[5.3.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v5.2.0...v5.3.0
[5.2.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v5.1.0...v5.2.0
[5.1.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v5.0.1...v5.1.0
[5.0.1]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v5.0.0...v5.0.1
[5.0.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v4.6.1...v5.0.0
[4.6.1]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v4.6.0...v4.6.1
[4.6.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v4.5.1...v4.6.0
[4.5.1]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v4.5.0...v4.5.1
[4.5.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v4.4.0...v4.5.0
[4.4.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v4.3.0...v4.4.0
[4.3.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v4.2.0...v4.3.0
[4.2.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v4.1.0...v4.2.0
[4.1.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v4.0.1...v4.1.0
[4.0.1]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v4.0.0...v4.0.1
[4.0.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.9.0...v4.0.0
[3.9.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.8.1...v3.9.0
[3.8.1]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.8.0...v3.8.1
[3.8.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.7.0...v3.8.0
[3.7.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.6.0...v3.7.0
[3.6.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.5.0...v3.6.0
[3.5.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.4.0...v3.5.0
[3.4.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.3.0...v3.4.0
[3.3.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v2.0.3...v3.0.0
[2.0.3]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v2.0.2...v2.0.3
[2.0.2]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.13.0...v2.0.0
[1.13.0]: https://github.com/ASDAlexey/vitest-auto-spy/compare/v1.12.0...v1.13.0
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
