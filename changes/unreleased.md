# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Release notes are taken from the root `CHANGELOG.md` (and from
> Conventional Commits only when a version has no section there yet), so nothing here is pasted
> anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v5.14.0** — the git tag, `package.json` and `CHANGELOG.md` agree._

## Staged for the next release

<!-- Add user-facing items here as work lands, mirroring `## [Unreleased]` in the root CHANGELOG. -->

### Added

### Added

- **`narrow.defined(value, label?)`** returns the value with `null` and `undefined` stripped, so an
  optional read narrows inside the expression that needed it:
  `expect(narrow.defined(row.content?.covers).map(…)).toEqual(…)`. `expect(value).toBeDefined()` and
  `assert.exists(value)` both assert without returning, which under a strict spec type-check costs
  two statements and a local per read — one consumer suite hit that shape fifteen times across four
  files and twice grew a helper function per member of a stub just to carry it. It is not a
  replacement for `assert.exists` where the assertion is the point of the test; the difference is
  whether the line asserts that a value arrived or reads one the test already knows arrived. A
  falsy-but-present value passes: `0`, `''`, `false` and `NaN` are all defined. Failure prints the
  shape the value had, like every other `narrow` helper.

### Fixed

- **`prefer-create-spy-from-class` reported the seed of a stub, and named a repair that cannot be
  made.** `createComponentStub(ChartComponent, { redraw: vi.fn(), reset: vi.fn() })` is the shape
  the documentation shows — two members the parent calls through a `viewChild` — and two `vi.fn()`s
  is exactly the rule's default threshold, so it fired on it. `createSpyFromClass` is no repair
  there: the class is already the **first** argument, and a spy object is not a component class. The
  only ways out were deleting a seed the spec needed or an `eslint-disable` over a documented call.
  This is the same omission the 5.10.1 release closed for `provideWindowDouble`'s overrides bag;
  `createComponentStub` and `createDirectiveHost` are now on the same exemption list, found the same
  way — by a consumer suite converting a shelf spec.

- **`renderShallow({ keepTemplate: true })` handed Angular a scope it refuses, under AOT.** The kept
  imports are read off `ɵcmp.dependencies`, and the docs said a child re-exported by an imported
  `NgModule` survives because the module is kept whole. That is the JIT list. Under AOT ngtsc
  resolves the module at compile time and flattens its exported declarations into it, so what the
  trim put back into `imports` was a `standalone: false` pipe or directive — which Angular rejects
  with `The "WhisperPipe" pipe, imported from "ReportComponent", is not standalone. Does the pipe
have the standalone: false flag?`, a message aimed at the pipe's author about a pipe that is fine
  and a call that works under JIT. Found on a consumer suite whose component reached two workspace
  pipe modules; the reader spent two iterations on the pipes before the list was the suspect. The
  scope genuinely cannot be rebuilt — the module is not in the list to keep — so `renderShallow`
  now checks what it is about to hand over and throws first, naming the declarations, saying they
  are not the thing to change, and giving the two ways on: drop `keepTemplate` when the spec reads
  TypeScript state only, or build the component with `TestBed` directly and seed the services its
  children inject. A list that still carries the `NgModule` itself — every JIT run — is unchanged.

- **`no-import-time-spread` described a `TypeError` an object spread never raises.** The rule
  reported `{ ...Imported }` at module scope with the same message as `[...Imported]` — "…and
  `[...undefined]` throws `Spread syntax requires ...iterable[Symbol.iterator] to be a function`" —
  but the two fail nothing alike. `[...undefined]` and `f(...undefined)` throw; `{ ...undefined }`
  is `{}`. So the object form raises nothing, the bundle loads, and the constant it built is short
  of every key it meant to copy, each one reading `undefined` for the rest of the run. Found on a
  consumer workspace whose `export const MusicItemType = { ...ShelfItemTypeEnum, ...MusicOnlyItemType }`
  the rule flagged correctly and described wrongly — the reader searched the log for a
  `Spread syntax requires …` that was never going to be there, and the finding read as a false
  positive. An object spread is now reported through `noImportTimeSpreadObject`, whose message opens
  by saying there is no error to look for and names the damage instead. What is reported, the
  suggestion, and the exit code are unchanged; the repair for the object form is written out as
  "write the keys out" rather than "inline the constant".

- **A seeded getter was flattened again by the defaults merge.** 5.15.0 kept an `overrides` seed as
  a descriptor where the double is built; the merge that puts a `registerAutoSpyDefaults`
  registration under the call site still copied both sides with a spread, and a spread reads every
  getter it copies. So the same seed behaved differently depending on something the spec cannot see:
  live on a class or token the registry has never heard of, flattened on one that carries any
  registration at all — whether or not the registration names that key. Found on a consumer suite
  converting `{ provide: NAVIGATION_SERVICE_TOKEN, useValue: { get currentFocus() {…} } }` to
  `provideAutoSpyForToken`, where the token is registered in the setup file: the directive read the
  value the variable held while `TestBed.configureTestingModule` was running, which is `undefined`,
  and the test failed on an assertion three frames away from the cause. The merge copies property
  descriptors now, on both sides and for every object key it merges (`overrides` and `returns`), so
  an accessor reaches `createProxyPropStore` as an accessor.
- **A getter in `overrides` ran while the double was being built.** `createAutoMock` and `mockDeep`
  read every seeded key with `Reflect.get` and stored the result, so an accessor in the seed was
  flattened at construction: a getter written to throw — the way a spec says "this global is missing
  on this platform" — failed the provider literal during `TestBed.configureTestingModule` instead of
  at the branch under test, and a `{ set }` seed was dropped entirely. Seeds now keep their
  descriptor, so an accessor is installed as one and answers reads and writes exactly like a patch
  from `mockAccessorsProp`. Reading the key's descriptor, `Object.keys` and `in` still do not run it.

### Changed

- **`prefer-inject-spy` stops reporting the tokens whose instance has to stay real, and takes
  `{ ignoreTokens }` for the rest.** The rule shipped with an empty `meta.schema` at `error`, so the
  only way past a report was a per-line disable — and three of them in one consumer suite were about
  code with nothing to repair. `ApplicationRef`, `DestroyRef`, `EnvironmentInjector`, `HttpClient`
  and `Injector` are now exempt whatever is spied on them. `DestroyRef` is the one that is not a
  judgement call: it carries `__NG_ENV_ID__`, the only class in `@angular/core` that does, and
  `R3Injector.get()` answers `token[NG_ENV_ID](this)` before it reads its own records — so
  `{ provide: DestroyRef, useValue }` is accepted, ignored, and the advice the rule was printing
  could not be followed at all. The other four are self-defeating rather than impossible: a spied
  `ApplicationRef` has no `injector` for a hand-built `createComponent()` to take a renderer from,
  `Injector` and `EnvironmentInjector` propagate the substitution to every token resolved after
  them, and `HttpClient` under `provideHttpClientTesting()` is real on purpose, with the
  `HttpTestingController` flushing the request a spy on `get` only read the options of. Node-injector
  tokens (`ElementRef`, `Renderer2`, `ChangeDetectorRef`) are deliberately not on the list:
  `TestBed.inject()` cannot hand any of them back, so the entry would exempt a line nobody can
  write. A project names its own with `['error', { ignoreTokens: ['MapRendererService'] }]`; tokens
  are compared as source text, the way `no-unregistered-inject-spy` compares them, and the option
  extends the built-in five rather than replacing them. The message now carries the escape hatch and
  the `DestroyRef` reason, so an aliased import — which source-text comparison cannot recognise — is
  reported with the answer in it. Severity, suggestion and the shapes it reads are unchanged.
