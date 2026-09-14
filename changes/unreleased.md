# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Release notes are taken from the root `CHANGELOG.md` (and from
> Conventional Commits only when a version has no section there yet), so nothing here is pasted
> anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v5.14.0** — the git tag, `package.json` and `CHANGELOG.md` agree._

## Staged for the next release

<!-- Add user-facing items here as work lands, mirroring `## [Unreleased]` in the root CHANGELOG. -->

### Fixed

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
