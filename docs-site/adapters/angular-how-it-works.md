---
title: How the Angular helpers work
description: Why the Angular entry points, stand-ins, matchers and checks behave as they do - the Angular and builder details behind each rule.
---

# How the Angular helpers work

This page explains why the Angular helpers behave as they do. You do not need it to write tests:
[Angular](/adapters/angular) shows how to use them. Read a section here when a rule on another page
surprises you and you want the reason.

Some sections quote Angular's own source. The file and line numbers are from the version named in
the section; they move between releases.

## Entry points

### Why the Angular helpers are split across entry points

An import of `vitest-auto-spy/angular` loads that entry's whole module graph. So a helper that a
test set uses once, in a setup file, must not ride along with every `provideAutoSpy` import. That is
why the narrow helpers have their own entry points: `/angular-http`, `/angular-router`,
`/signal-forms`, `/angular/diagnostics`, `/angular/doubles` and `/angular/matchers`. `trackInjections`
stays in `/angular`, because `createWithAutoSpies` needs its module anyway.

`/angular` is also not a second copy of the core. It re-exports only a few root helpers, listed on
[Installation](/core/installation#entry-points). `vitest-auto-spy/bun-angular` is different: it is a
runner entry, so it re-exports the whole core.

### Why `@angular/material` is not a dependency

This library has no runtime dependencies at all, and a dialog is one component library's shape, not
Angular's. So the Material dialog stand-ins take the token and the ref class as **arguments**.
`MatDialogRef` is the DI token, the shape the stand-in is checked against and the type its result is
read from. The import in your own spec stays the only place Material is named.

There is no `openDialogReturning()` wrapper on purpose. It would say `mockReturnValue` in other words,
and it would have to know `MatDialog`'s own type, which is exactly what this design keeps out.

## TestBed

### Why `extendWithAutoSpies` takes one map

This is a `TestBed` rule, not a typing limit. Fixtures resolve lazily and independently. In
`base.extend('cart', …).extend('api', …)`, the `cart` fixture would configure the testing module and
inject from it, which creates the module. The `api` fixture would then call `configureTestingModule`
too late and fail with Angular's _"Cannot configure the test module when the test module has already
been instantiated"_. Every provider must be known before the first injection.

A `beforeEach` that only configures the module still composes: it runs before any fixture resolves,
and repeated `configureTestingModule` calls merge until the first injection. A `beforeEach` that
**injects** does not compose, and nothing can repair that later: Angular has already decided.

`extendWithAutoSpies` needs Vitest 4.1, because the builder form of `test.extend` is what infers the
types. On an older Vitest the call throws at once (`extendWithAutoSpies needs Vitest 4.1 or newer`).
Without that check, the older `extend` would take the string, register fixtures named `"0"`, `"1"`, …
and hand every test `undefined`. Vitest exposes no version to ask, so the check reads how many
parameters `extend` declares: one up to 4.0, three from 4.1.

### Why `setupAngularTestEnv` remembers the mode per worker

`TestBed.initTestEnvironment` may be called once per platform, and under `isolate: false` the platform
lives for the whole worker. A repository that moves to zoneless gradually (some libraries switched,
the rest still on zone.js) cannot express that in setup files alone. The second file the worker picks
up in the other mode fails with `Cannot set base providers because it has already been called`, and
the message names neither file.

Vitest's `test.projects` does not solve it either: nothing promises that a worker serves files of only
one project. What works is to decide the mode from the file about to run and, when it differs from the
installed one, tear the environment down before initialising the other.

The mode is remembered per **worker**, not per call. Under `isolate: false` the setup file runs once per
spec file while the platform lives for the whole worker. A mode kept in the call would be `undefined`
again in every file, and every file would pay for a `resetTestEnvironment()` plus your initialiser. A
remembered mode is still checked: if something else tore the platform down meanwhile, the environment
is initialised again.

The initialisers stay yours. Which platform, which providers and which `teardown` policy a project
wants is not this library's decision. The packages that supply them (`@analogjs/vitest-angular`,
`jest-preset-angular`, a hand-written `initTestEnvironment`) are not its dependencies.

### Why `autoDetect` does not make an assertion see the change

Older advice says a spec has to switch automatic change detection on. That advice comes from test
sets that run on zone.js. Since Angular 19.0.0 the fixture's default depends on the mode. On `@angular/core@21.2.17` it reads:

```ts
// @angular/core/fesm2022/testing.mjs:164-167, rewrapped
autoDetectDefault = this.zonelessEnabled ? true : false;
autoDetect = inject(ComponentFixtureAutoDetect, { optional: true }) ?? this.autoDetectDefault;
```

So in a zoneless test set automatic change detection is **on by default**: nothing has to provide
`ComponentFixtureAutoDetect` or call `autoDetectChanges()`. What is still the spec's job is _when_ it
runs. Angular schedules the change-detection run when you write to a signal; it does not run it on
that line. So an assertion on the next line still reads the DOM from before the write. The fix is
`await stable(fixture)` from `vitest-auto-spy/angular`: it runs change detection and the effects and
waits for them, before your assertion. Calling `fixture.detectChanges()` again is not the fix.

Two related deprecations in the same version point the same way:

| `@angular/core@21.2.17`                  | What the typings say                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `autoDetectChanges(autoDetect: boolean)` | `@deprecated` at `types/testing.d.ts:112`; use the no-argument `autoDetectChanges()` at `:121` |
| `TestBed.flushEffects()`                 | `@deprecated` at `:498` in favour of `TestBed.tick()` at `:506`                                |

`flushEffects()` from this package simply calls `TestBed.tick()`. The package supports Angular 20 and
newer only, so it no longer falls back to `ApplicationRef.tick()`. A test set that calls
`flushEffects()` already uses the API Angular keeps.

### How `overrideComponentProvider` reaches a nested component

`TestBed.overrideProvider` only reaches a component the `TestBed` compiler knows about. A standalone
component created through a parent's template is not in the testing module's `imports`, so the
override never applies to it. Finding that out means knowing how Angular's `TestBedCompiler.queueType`
works. `overrideComponentProvider` queues the component for you: as an import when it is standalone,
as a declaration otherwise.

`TestBed.overrideComponent` is not the answer here. It forces a JIT recompile (JIT: compiling the
component in the browser at run time). Under an ahead-of-time test bundle, that recompile resolves the
component's directives and pipes from a runtime scope the bundler has removed, so the component ends up
with none of them.

### How the override is verified

Each `overrideComponentProvider` call queues one entry: component, token, spy. It registers **once**
with the same `createComponent` hook the [Angular diagnostics](/adapters/angular-diagnostics) use. On
the next fixture it checks every queued entry, then unregisters and empties the queue. The check
belongs to the fixture that call built; a check left registered would run against a later spec's
unrelated component.

The hook sits on the `TestBed` **instance**, and every static `TestBed` method delegates to that
instance. So
`getTestBed().createComponent(HostComponent)` is verified the same way as `TestBed.createComponent`.
Sharing one hook with the diagnostics, rather than wrapping `createComponent` a second time, also
fixes the order of the two checks instead of leaving it to whichever was installed last.

The token is resolved through the component's **own** injector, not the testing module's:

- if `fixture.debugElement.componentInstance` is an instance of the overridden component, its
  injector answers;
- otherwise the fixture root is searched with `element.componentInstance instanceof component`, and
  the matching element's injector answers.

No `@angular/platform-browser` import is involved. `By.directive` would have been the usual
predicate, but it would add an import this entry does not otherwise need. The `DebugElement` API is
read structurally instead.

The nested case works because, on Angular 21.2.17, a child placed by a parent's template already
exists when `createComponent` returns, before any `detectChanges()`. This was measured, not assumed:
the check finds the nested component's injector on the fixture the call returns, with no change
detection in between.

A non-object answer is printed as it is (`resolved … to not-a-service`), and a class instance is
named by its constructor. On a `TestBed` without `createComponent`, nothing is queued at all: the
helper falls back to "no check" rather than to a stale check on some later fixture. The override
itself still applies.

### Why the override check is always on

The check is not part of [`enableAngularDiagnostics`](/adapters/angular-diagnostics), for three reasons:

- **The helper exists because the usual approach fails silently.** An override that did not apply is
  a bug in the helper. Putting its own correctness check behind a flag would ship the silent failure
  the helper was written to remove.
- **It cannot fire in a spec that never called `overrideComponentProvider`.** Nothing is queued, so
  `createComponent` is never wrapped.
- **It stays silent when the component was not rendered.** No injector, no check.

The diagnostics group has neither of the last two properties. It applies to every spec in a test
set, including specs written long before it existed. That is why turning a passing test set red there
is the project's decision, not a side effect of an import.

### Why a directive host must be standalone

Under the Angular CLI's unit-test builder, Angular resolves `imports` in two places, and the same line
works in one and does nothing in the other:

| Where                                         | Resolved by                                 | An `NgModule` there                                                             |
| --------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| `@Component({ imports })`                     | the AOT compiler, at build time             | **works**: the flat list is written into the compiled component                 |
| `TestBed.configureTestingModule({ imports })` | `TestBedCompiler`, at run time, from `ɵmod` | **contributes nothing**: `ɵɵsetNgModuleScope` is not emitted into a test bundle |

So the host must be **standalone** and carry the module in its _own_ `imports`. A host written with `standalone: false` inside a spec is worse: it belongs to no `NgModule`, so it
gets no imports at all (no `NgClass`, no `AsyncPipe`, nothing). [`createDirectiveHost`](/adapters/angular#a-host-for-a-directive-under-test)
applies this: the host is always standalone, `scope` becomes its imports, and `props` types
`fixture.componentInstance`.

### What `keepTemplate` reads from the compiled component

`keepTemplate: true` keeps the template's building blocks by reading the imports the compiler wrote
into the compiled component (`ɵcmp`). They come in three shapes: the flat array, a function that
returns it, or `null` for a component that imports nothing. The shape does not depend on JIT versus
AOT. JIT always emits the function, and AOT emits the array unless a **cycle** between two components
forces it to defer the read. All three shapes are handled. Calling the array as a function was once a
`TypeError: dependencies is not a function` on every AOT-compiled standalone component without a
cycle, and only under `keepTemplate: true`.

## Stand-ins

### Why the resource stand-in's `value()` throws after a failure

The [`mockResourceProp`](/adapters/angular#skipping-the-request-entirely-—-mockresourceprop)
stand-in refuses to be more forgiving than a real resource in two places.

**`value()` throws once the resource has failed.** Angular builds `value` as a computation that
rethrows the failure instead of returning the last good value. Component code that reads
`products.value()` without checking `hasValue()` first breaks in the application, so it must break in
the test too. The error carries the cause. The spec's own side is unaffected: `fail()` on an
already-failed resource, `loading()` and `snapshot()` read the stored value directly.

```ts
products.fail('offline');

expect(() => products.resource.value()).toThrow(); // as a real resource does
expect(component.errorMessage()).toBe('offline'); // a branch that checks first is fine
```

**`reload()` answers the way Angular's does**: `false` while there is nothing to re-issue (a resource
that never ran or is still running), `true` otherwise. It is still a spy and still re-issues nothing.
Override it with `reload.mockReturnValue(…)` where the branch is the point of the test.

`hasValue()` is worth reading twice. Since Angular v20 it depends on the value, not the status. A
resource declared with a `defaultValue` has a value from the moment it is created, so `hasValue()` is
`true` while it is `loading`, `reloading` and `idle`. It is `false` only in the `error` state or over an
`undefined` value. So a template written as `@if (products.hasValue()) { … } @else { <spinner/> }`
keeps showing the list while the next page loads.

### Why the window stand-in takes your token

Angular ships `DOCUMENT` (from `@angular/core` itself since v20), but it has never shipped a `WINDOW`
token: every application declares its own `InjectionToken<Window>`. So `provideWindowDouble` has to be
handed yours. It is generic over the token's type, so for an `InjectionToken<AppWindow>` the overrides
are checked against that interface's members too.

Methods read from the stand-in are bound to the real object, and constructors are handed over
untouched. A method has to keep its `this`. But a bound function loses its target's own members,
and for `Date`, `Promise`, `Object`, `Array`, `Number` and `Event` that is where everything lives. So
those come back as they are: `win.Date.now()`, `win.Promise.resolve()`, `win.Object.keys(…)` and
`new win.Event('resize')` all work, and `win.Event === window.Event` holds, which is what an
`instanceof` in the code under test reads. A constructor needs no binding anyway: its `this` is the
instance being built.

### Why `provideAutoSpyForToken` exists

A token typed with an _interface_ has no class to read. That is where the usual workaround comes
from: a `PasscodeServiceMock` class written in the spec, spied and provided. After that,
`Spy<PasscodeServiceMock>` and `Spy<PasscodeService>` disagree about `calledWith`, and someone reaches
for a cast, or more often for `TestBed.inject<any>(TOKEN)` with an `eslint-disable` at the top of the
file. `provideAutoSpyForToken` reads the type from the token, and `injectSpy` already accepts one.
`provideAutoSpy` reads a class prototype, which a token does not have, so it is not the call for this.

### Why the Router stand-in exists

After `ActivatedRoute`, `Router` is the provider real test sets write by hand most often. Two private test
sets had 48 of them, and all 48 were the same line:
`createAutoMock<Router>({ events: of(), url: '/' }, { returns: { navigate: Promise.resolve(true) } })`.
[`provideRouterDouble()`](/adapters/angular-router) replaces that line with a `Router` whose URL and
events agree with the route.

## Matchers and checks

### Why matchers throw on a wrong argument

A wrong argument throws instead of failing the assertion, because `.not` turns a failure into a pass:

```ts
expect(products.value()).not.toBeLoading(); // green, and about an object nobody asked about
```

That line asserts nothing, whatever the resource is doing. The same applies to `toHaveFocus` given
something that is not an element (most often a query that found nothing, so
`expect(missingEl).not.toHaveFocus()` passed), and to `toHaveDirectiveApplied` given something that is
not a fixture or a `DebugElement` (`expect(undefined).not.toHaveDirectiveApplied(X)` passed the same
way).

### Why the Angular diagnostics exist

The [five checks](/adapters/angular-diagnostics#the-five-checks) share one shape: something a spec
wrote does nothing, nothing says so, and the test passes for a reason its author did not intend. They
ship as one group rather than five helpers, because turning a test set from "passes" into "passes for
the stated reason" is a decision you take once, in a setup file. Four of the five also hang off the
same `TestBed.configureTestingModule` hook the timing diagnostics already install.

The size of the problem, measured in one Angular test set: of 71 component specs whose component
declares its own `providers`, 43 also registered the same token on the module. 22 of those worked
around it with `TestBed.overrideComponent({ set: { providers } })`, 14 with `TestBed.overrideProvider`,
4 read the spy back through the component's injector, and **7 did nothing at all**, which is the
failure `shadowedProviders` reports. `overrideComponentProvider` had existed since 3.1.0 and had
**zero** uses in that repository. That argues for the check, not against the helper: you cannot find
the helper from the symptom, because there is no symptom. The check also stays quiet on the 40 specs
that had handled the case one way or another.

On a 1759-file Angular project, turning the group on found real defects in 25 files and 324 tests,
and cost nothing measurable (12.5 s against 13.4 s for the full run).

Each check is tuned the same way, `deadSchemas` most visibly: a false failure on a correct spec costs
more than a miss. And `pendingRequests` stays quiet in a project that does not set up Angular's HTTP
testing at all: no token is found, nothing is reported, and nothing had to be installed. That is the
shape an optional integration should have.

## The unit-test builder

### Why a `vi.mock` factory must not use object spread

Angular's builder always sets `'object-rest-spread': false` in `getFeatureSupport`
(`@angular/build/src/tools/esbuild/utils.js:166` in 22.2.0). It is a deliberate workaround for a V8
performance defect, [crbug/v8/11536](https://bugs.chromium.org/p/v8/issues/detail?id=11536). So
`{ ...actual, x }` never survives as spread: it is rewritten to a bundle-level `__spreadValues`
helper. `vi.mock` factories are moved to the very top of the test bundle, above the code that defines the
helper, so the factory calls the helper before it exists.

A modern `.browserslistrc` does not help: the flag does not depend on the target. Code splitting only
decides which error text you get, so the shared chunks can look like the cause when they are not:

| Splitting | What the run says                                                                           |
| --------- | ------------------------------------------------------------------------------------------- |
| on        | `Cannot access '__vi_import_1__' before initialization`: the helper lives in a shared chunk |
| off       | `__spreadValues is not a function`: the helper is a module-level `var`                      |

Neither message mentions spread or the factory. The fix is to write
`Object.assign({}, actual, { … })` instead of `{ ...actual, … }` in the factory, where `actual` is
what `await importOriginal()` returned; the full example is on
[The Angular unit-test builder](/guides/angular-unit-test-builder#the-rule-a-vi-mock-factory-must-not-use-object-spread).

### Why a relative `vi.mock` path is blocked

`vi.mock('./thing')` is rejected on purpose, not by a bundling accident. The builder injects a virtual
entry point, `angular:vitest-mock-patch`
(`@angular/build/src/builders/unit-test/runners/vitest/build-options.js`). It patches `vi.mock`,
`vi.doMock`, `vi.importMock`, `vi.unmock` and `vi.doUnmock` to throw when the path matches
`/^[./]/`.

### Why the `@angular/build` patch is not shipped

`@angular/build` 22.1.5 and 22.1.6 turn code splitting off, and the builder guide shows a local patch
for them. This package deliberately does not ship it, and would not accept a pull request that did:

- Making it automatic means a `postinstall` script that rewrites another package's files inside
  `node_modules`. That is the most alarming thing a test library can do in a supply-chain audit, and
  it goes against keeping this package's own bundles unminified and readable.
- It edits a string at no fixed path, so an upstream refactor breaks it silently. That is the worst
  failure mode for a package whose promise is that failures name their own cause.
- Its useful life was weeks: `@angular/build` 22.1.7 closed the window it existed for.

Whether a workspace trades a 596 MB bundle graph (what code splitting off
produced on one project) for anything is the app team's call. The diagnosis
belongs here; changing someone else's package does not.

### How coverage matches files under the builder

**Coverage is matched twice, and the first pass sees chunks.** `@vitest/coverage-v8` calls
`isIncluded` on the URL of each executed script before any source-map remap. When
`excludeAfterRemap` is on, it calls it again on the remapped source path. `@angular/build` turns
`excludeAfterRemap` on itself, so both passes use the same list. The tests run over a bundle, so the
first pass compares your globs with `spec-*.js` and `chunk-*.js`, not with `.ts` files. A list of
source globs drops every counter there, and the report comes out **empty**.

**Vitest 4 recompiles the globs for every file.** `@vitest/coverage-v8` decides whether a file belongs
in the report by calling `isIncluded`, which calls `picomatch` with the whole pattern array. Its
`globCache` remembers the answer per filename, never the compiled matcher, so every filename
recompiles every pattern. Vitest 5 fixed this upstream: `BaseCoverageProvider.getGlobMatchers()`
builds the matchers once and keeps them. On Vitest 5 the extra cost and the wrapper are gone.
`@angular/build:unit-test` accepts Vitest 5 from 22.2.0 (before 22.2 its range stopped at `^4`), and
Analog needs 2.7.5 or newer for the same. The workaround for Vitest 4 is on
[The Angular unit-test builder](/guides/angular-unit-test-builder#coverage-matching-costs-more-than-coverage).

## Storybook

### Why Storybook's `expect` rejects these spies

`storybook/test` has an instrumented `expect`: each assertion shows up in the Interactions panel.
With this library's spies it fails with `TypeError: [Function] is not a spy or a call to a spy!`.

The instrumenter wraps every function argument of an instrumented call in a new arrow function,
unless the function has its own enumerable keys. That rule recognises `vi.fn()`, whose `mock*`
methods are its own properties. This library's spies keep those methods on a shared prototype, which
is where their memory saving comes from. So the rule does not see them, and the matcher receives the
wrapper. The `expect` from `vitest` is not instrumented and receives the spy itself. The two ways
around it are on [Storybook with Angular](/guides/storybook-angular#why-expect-comes-from-vitest).
