---
title: Upgrading to 5.0
description: Two breaking changes, both peer ranges. Angular moves to >=20 and gains @angular/platform-browser; rxjs moves to >=7.2 because the deep operator path is gone in rxjs 8. What to change, and what stays.
---

# Upgrading to 5.0

Version 5.0 changes two peer dependency ranges: Angular `>=20` and rxjs `>=7.2`. In 5.0 itself no helper, option
or spy behaviour changed. Most projects only bump the version:

```bash
npm install -D vitest-auto-spy@5   # pnpm: pnpm add -D vitest-auto-spy@5
```

**Checklist**

1. If you use an Angular entry point and your Angular is below 20, upgrade Angular first.
2. If you use pnpm and `vitest-auto-spy/angular` cannot resolve `@angular/platform-browser`, add it
   to `devDependencies`.
3. If you pin `rxjs@7.0` or `7.1` on purpose, move to 7.2 or newer. Angular projects already have it.
4. Going to a later 5.x (the usual case)? Also:
   - run `npx vitest-auto-spy doctor`: it names every import that moved off
     `vitest-auto-spy/angular` in 5.21.0 (diagnostics, dialog and platform doubles, matchers);
   - run your type-check: since 5.1.0 stubs are typed from the method;
   - run the tests: a few fixed helpers now fail specs that passed by accident.

   Details: [Changes in later 5.x releases](#changes-in-later-5-x-releases).

## Why upgrade

No helper, option or runtime behaviour changed. What changed is what the package **says** it runs on.
Both old ranges promised versions the code could not serve.

| What you get                                                                                                                             | Verified                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **The Angular range is honest.** `>=16.0.0` allowed four majors on which an entry point does not even load.                              | Angular 16–22 downloaded and their export lists parsed: `ɵSIGNAL` first appears in 18, `provideZonelessChangeDetection` in 20 |
| **`@angular/platform-browser` resolves under pnpm.** `/angular` imports `By` from it, but it was never a declared peer.                  | undeclared → optional peer on the same `>=20` range as the other two                                                          |
| **The rxjs range no longer promises rxjs 8.** The observable helpers imported six operators from `rxjs/operators`, which rxjs 8 removes. | the six now come from the root `rxjs` entry, which exports them since 7.2 (checked in rxjs 7.2.0's own type declarations)     |
| **`flushEffects()` is simpler.** The `ApplicationRef.tick()` fallback for old Angular is gone.                                           | fallback removed, coverage still 100 %                                                                                        |

The cost, for almost everyone, is a number in `package.json`. Every Angular major that Angular still
supports meets the new floor. Every Angular project already meets the rxjs one.

## What changed

Two breaking changes, both peer ranges:

- no helper was removed or renamed;
- no option changed meaning;
- no spy behaves differently.

If you go from 4.x straight to a later 5.x, you will also see type errors from 5.1.0, which checks
what a stub returns. [Changes in later 5.x releases](#changes-in-later-5-x-releases) sorts them by
message.

|                                                                                                                        | What to do                                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [1. Angular is `>=20`, and there are now three Angular peers](#_1-angular-is-20-and-there-are-now-three-angular-peers) | upgrade Angular if you are below 20; add `@angular/platform-browser` if pnpm complains |
| [2. rxjs is `>=7.2`](#_2-rxjs-is-7-2-because-the-deep-import-path-is-gone)                                             | nothing, unless you pin `rxjs@7.0` or `7.1` on purpose                                 |

## 1. Angular is `>=20`, and there are now three Angular peers

```jsonc
"peerDependencies": {
  "@angular/common": ">=20.0.0",
  "@angular/core": ">=20.0.0",
  "@angular/platform-browser": ">=20.0.0", // new: was never declared
  // …
}
```

All three are **optional** peers. A project that never imports an Angular entry point installs none of
them.

### Why 20 and not something lower

The package imports two Angular symbols as values. If a value import is missing, the whole entry
fails to load, not one helper.

- **`ɵSIGNAL` exists from Angular 18.** `runEffect()` reads it, and the `/angular` entry imports it
  on load. On Angular 16 or 17 the whole entry fails, together with `provideAutoSpy` and
  `injectSpy`.
- **`provideZonelessChangeDetection` exists from Angular 20.** In 18 and 19 it was called
  `provideExperimentalZonelessChangeDetection`; in 16 and 17 it did not exist.
  `vitest-auto-spy/bun-angular` imports it by name, so below 20 `bun test` fails while loading the
  preload, before any spec runs. **This symbol sets the floor at 20.** On 18 and 19 the `/angular`
  entry loads fine; only `/bun-angular` does not.

To build the matrix below, `@angular/core`, `@angular/common` and `@angular/platform-browser` were
downloaded at 16.2.12, 17.3.12, 18.2.14, 19.2.25, 20.3.30, 21.2.22 and 22.1.5. Their real export
lists were parsed; release notes were not trusted.

```
                                 16 17 18 19 20 21 22
ɵSIGNAL                           .  .  y  y  y  y  y
provideZonelessChangeDetection    .  .  .  .  y  y  y
provideExperimentalZonelessCD     .  .  y  y  .  .  .
TestBed.tick()                    .  .  .  .  y  y  y
InputSignal / ModelSignal         .  y  y  y  y  y  y
the other 29 symbols this code imports
                                  y  y  y  y  y  y  y
```

### Nothing that was still supported is cut off

Angular supports each major for six months of active support plus twelve months of LTS. When this
floor was set, **Angular 19's LTS had ended on 2026-05-19**, and 16–18 before it. Angular 20 is the
oldest major Angular itself still supports, and it is also this package's technical floor. So the
change drops nothing that still gets fixes.

| major | released   | LTS ends   | status                 |
| ----: | ---------- | ---------- | ---------------------- |
|    16 | 2023-05-03 | 2024-11-03 | EOL                    |
|    17 | 2023-11-08 | 2025-05-08 | EOL                    |
|    18 | 2024-05-22 | 2025-11-22 | EOL                    |
|    19 | 2024-11-19 | 2026-05-19 | EOL                    |
|    20 | 2025-05-28 | 2026-11-28 | LTS; **the new floor** |
|    21 | 2025-11-19 | 2027-05-19 | LTS                    |
|    22 | 2026-06-03 | 2027-12-03 | active                 |

### `@angular/platform-browser` is a peer for the first time

`vitest-auto-spy/angular` imports `By` from it; the directive matchers use it. The Bun preload starts
through `platformBrowserTesting()`. Neither import was declared.

- With npm's hoisted `node_modules`, it worked by accident: every Angular workspace has the package.
- With **pnpm's isolated layout, it did not resolve at all**, and `npm ls` gave no hint why.

If your install works, nothing changes for you. If you use pnpm and `/angular` could not resolve
`@angular/platform-browser`, this release fixes it.

::: tip Not an Angular 20 thing
`platformBrowserTesting()` and `BrowserTestingModule` from `@angular/platform-browser/testing` are
sometimes called Angular 20+. They are not: they export the same names in every major from 16. What
changed in 20 is that `@angular/platform-browser-dynamic/testing` stopped being the recommended path.
The `bun-angular` floor depends on `provideZonelessChangeDetection` only.
:::

### There is deliberately no upper bound

A range like `>=20.0.0 <23.0.0` looks safer, because `ɵSIGNAL` is a private Angular symbol. It is the
wrong fix:

- it forces a release of this package for every Angular major;
- it gives `ERESOLVE` to anyone who upgrades Angular first;
- it does not protect anything: Angular can drop a private symbol in a _minor_.

The real protection is in the code: read the symbol at runtime instead of importing it by name. Then
an Angular without `ɵSIGNAL` breaks one helper, not the whole entry. The package already does this
for its zone and zoneless helpers, and `runEffect()` is moving the same way.

## 2. rxjs is `>=7.2`, because the deep import path is gone

```jsonc
"peerDependencies": {
  "rxjs": ">=7.2.0" // was >=7.0.0
}
```

The observable helpers use six operators: `concatMap`, `delay`, `switchMap`, `take`, `takeUntil` and
`takeWhile`. They were imported from `rxjs/operators`, an old deep path. **rxjs 8 removes that
path.** So `>=7.0.0` promised a major the code could not load in.

The import now uses the root `rxjs` entry, which exports all six since **7.2**. This was checked in
rxjs 7.2.0's own type declarations, not in its changelog. `firstValueFrom`, the reason for the old 7.0
floor, is unchanged. 7.2 is the first version where every symbol the package imports exists at the
path it imports it from.

**Who has to act:** only a project that pins `rxjs@7.0` or `7.1` on purpose. On rxjs 7, Angular
16–22 all require `^7.4.0`, which is above the floor, so an Angular project has nothing to do.
There is no upper bound here either: rxjs 8 is now actually reachable.

## What `flushEffects()` looks like now

Not a breaking change. `flushEffects()` now always uses `TestBed.tick()`, which exists from Angular 20. `TestBed.tick()` also refreshes fixture views that were never attached to the `ApplicationRef`.
The old `ApplicationRef.tick()` fallback was only for Angular versions the package no longer
supports, so it is gone.

```ts
import { flushEffects } from 'vitest-auto-spy/angular';

store.filter.set('open');
flushEffects(); // runs pending effects in services and stores, no fixture needed
```

## Changes in later 5.x releases

The sections above describe 5.0 itself. If you jump from 4.x to a later 5.x, these changes also
reach you.

### Stubs are type-checked (5.1.0)

Since **5.1.0**, a spied method's mock is `MockInstance<Method>`, not `MockInstance` with no type
argument (which meant `(...args: any[]) => any`). These are now typed from the method:

- `mockReturnValue`, `mockImplementation`, `mockResolvedValue` and their `Once` variants;
- the parameters an implementation receives;
- `mock.calls`.

Nothing changes at run time.

Measured on a 4.6 → 5.24 upgrade of an Angular application with 850 spec files: **61 errors in 22
files**, none of them a runtime change. 59 fall into eight shapes; the last two were bugs in the
package:

| The error says                                                                                     | Count | What it is                                                                                                       | Fix                                                                                                |
| -------------------------------------------------------------------------------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `… with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' …`                         |    21 | a stub whose type differs from the method's in `?: T` against `?: T \| undefined`, or a `key: undefined`         | build the subject from the method (`returnSubject()`); omit the key instead of writing `undefined` |
| `Argument of type 'Spy<X>' is not assignable to parameter of type 'X'`                             |     9 | a spy returned from another spy                                                                                  | `mockReturnValue(asInstance(double))`                                                              |
| `Argument of type 'Observable<A>' is not assignable to parameter of type 'Observable<B>'`          |     8 | the fixture is not what the method returns, e.g. a DOM `Event` for a router `Event`, `null` for a non-null value | fix the fixture; that is the finding                                                               |
| `Types of parameters 'x' and 'y' are incompatible` on `mockImplementation`                         |     5 | a parameter annotation in the implementation that disagrees with the method                                      | drop the annotation and let the method type it                                                     |
| `TS4111` or `TS2375` inside a `mockImplementation` body                                            |     6 | the body used to get `any` parameters, so nothing in it was checked                                              | the usual fix for that error, now that the body is typed                                           |
| `Argument of type 'Partial<X>'`, a hand-written `MockXType`, or a base class where `X` is wanted   |     4 | a hand-built partial object where the method returns the class                                                   | `createSpyFromClass(X)` or `createAutoMock<X>()`, then `asInstance`                                |
| `TS2349: This expression is not callable` on something read from `mock.calls`                      |     4 | `mock.calls` is typed; a listener taken from `addEventListener` is `EventListenerOrEventListenerObject`          | narrow it (`typeof listener === 'function'`) before calling it                                     |
| `… is not assignable to parameter of type 'RxMethod<…>'` inside `mockReadonlyProp(…, vi.fn(impl))` |     2 | `vi.fn(impl)` takes its type from the member it replaces, and the implementation returns the wrong thing         | return what the member returns: `Object.assign(vi.fn(), { destroy: vi.fn() })` for an `rxMethod`   |

The two largest shapes, before and after:

```ts
// `Subject` is invariant: its type argument must match the method exactly, `?` for `?`
const events$ = new Subject<EventData<{ params?: EventDataParams }>>(); // ❌ `on` declares `params?: EventDataParams | undefined`
remoteRendering.on.mockReturnValue(events$);

const events$ = remoteRendering.on.returnSubject(); // ✅ typed from `on`, whatever it declares
```

```ts
overlay.create.mockReturnValue(overlayRef); // ❌ a Spy<OverlayRef> has none of OverlayRef's private members
overlay.create.mockReturnValue(asInstance(overlayRef)); // ✅ the same object, typed as the class
```

One shape was the package's bug, not the spec's. `@ngrx/signals` types every nullable object slice
of a store as a **union of call signatures**, for example `DeepSignal<Angle> | Signal<null>`. From
5.1.0 through 5.24.0 such a member accepted no implementation, because
`mockImplementation(() => angle())` matched neither half. 5.25.0 types the stub as one signature that
returns the union. Upgrade instead of casting (2 of the 61 above).

Do not answer any of these with `as any`, `as unknown as X` or `@ts-expect-error`. Each one turns off
the check the line exists for, and 8 of the 61 were fixtures that did not match what the method
returns.

### Exports moved off `vitest-auto-spy/angular` (5.21.0)

5.21.0 moved 32 exports off `vitest-auto-spy/angular` to three narrower entries. A spec that imports
`provideAutoSpy` no longer loads the TestBed diagnostics and the Material dialog doubles, and
`/angular` got 14.3 % smaller. Most projects change one import line per moved group, in one setup file:

| Import from `vitest-auto-spy/angular`                                                                                                                                                   | Now import from                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `enableAngularDiagnostics`, `disableAngularDiagnostics`, `assertNoPendingRequests`, `assertNoShadowedProviders`, `AngularDiagnosticsOptions`                                            | `vitest-auto-spy/angular/diagnostics` |
| `enableTestBedDiagnostics`, `disableTestBedDiagnostics`, `instrumentTestBed`, `getTestBedTiming`, `formatSpecTiming`, `reportSpecTiming`, `SpecTiming`, `TestBedDiagnosticsOptions`     | `vitest-auto-spy/angular/diagnostics` |
| `createMatDialogRef`, `injectMatDialogRef`, `provideMatDialogData`, `provideMatDialogRef`, `DialogComponent`, `DialogRefLike`, `DialogResult`, `MatDialogRefDouble`, `MatDialogRefInit` | `vitest-auto-spy/angular/doubles`     |
| `createWindowDouble`, `createDocumentDouble`, `provideWindowDouble`, `provideDocumentDouble`, `PlatformOverrides`                                                                       | `vitest-auto-spy/angular/doubles`     |
| `registerDirectiveMatchers`, `registerResourceMatchers`, `registerSignalMatchers`, `ResourceLike`, `SignalLike`                                                                         | `vitest-auto-spy/angular/matchers`    |

Like `/angular-http` and `/angular-router`, the three new entries do **not** re-export the core.
`trackInjections` stays in `vitest-auto-spy/angular`. `npx vitest-auto-spy doctor` reports every
moved name still imported from `/angular` as a `helper-from-wrong-entry` error, including files your
`tsconfig` does not reach. The changelog for 5.21.0 has the details.

Since 5.35.0, `vitest-auto-spy/angular` also exports the `Spy<T>` type, so
`import { type Spy, injectSpy } from 'vitest-auto-spy/angular'` compiles. The rest of the core
stays on `vitest-auto-spy`.

### Angular diagnostics and zone fixes (5.6.0, 5.19.0)

These are bug fixes, but a check that was silently off can start reporting after the upgrade.

- **5.6.0: every spec file is checked.** Under `isolate: false`, `enableAngularDiagnostics()` and
  `provideHttpTesting({ verifyOnTeardown })` registered their hooks once per module, so only the
  **first** spec file of each worker was checked. Now every file is.
- **5.6.0: pending HTTP requests under `sequence: { hooks: 'list' }`.** The teardown check used to
  read an empty module and report nothing. `TestBed.inject` on the reset `TestBed` also rebuilt the
  module, so every spec using HTTP testing failed from its second test with _Cannot configure the
  test module when the test module has already been instantiated_.
- **5.19.0: the diagnostics see `getTestBed()` too.** `ngModuleScopes`, `deadSchemas`,
  `shadowedProviders` and the `overrideComponentProvider` check used to see only the static
  `TestBed` and missed `getTestBed().configureTestingModule(…)`. `TestBed.overrideTemplate` now
  counts towards the measured `TestBed` time.
- **5.19.0: a diagnostic that threw no longer skips the reset.** Before, the **next** test failed
  with _Cannot configure the test module when the test module has already been instantiated_,
  naming a spec with nothing wrong in it.
- **5.19.0: `pendingRequests` finds a nested `HttpTestingController`.** Reading only the first level
  of imports found no token and turned the check off without a word.
- **5.19.0: `installProxyZonePatch()` no longer stacks.** Called from a setup file under
  `isolate: false`, it wrapped its own wrapper: two hundred files left two hundred Proxy layers on
  every `it` of the last one. The zones never nested, so results stayed correct, but each layer cost
  time. A second install is now a no-op, and so is its undo.
- **5.19.0: the emission watchdog uses the zone.js clock.** Inside `fakeAsync`, `tick(1_500)` towards
  a `debounceTime(2_000)` used to reject the wait it was about to satisfy.

### Angular helper behaviour changes (5.9.0 to 5.46.0)

Each of these makes a spec fail where it used to pass silently. Expect a few red specs after the
upgrade; each one was hiding a real problem.

- **5.9.0: `stable()` and `setInputs()` work in zone-based projects.** They run the tick inside
  `TestBed.inject(NgZone)`. Under zoneless that is a `NoopNgZone`, so it costs nothing there.
- **5.9.0: `runEffect()` runs the previous cleanup.** Before, every call left one more cleanup
  behind, and all of them fired together at `fixture.destroy()`. That broke cleanups that are not
  idempotent, such as `queue.pop()`, a counter decrement or an `unsubscribe` on a shared subject.
- **5.9.0: `hasValue()` on a resource double follows Angular's rule** (Angular v20 and later):
  it reports whether there is a value, not what the status is. With a `defaultValue`, `hasValue()` is `true` while `loading`, `reloading` and `idle`, and
  `false` only on `error` or an `undefined` value. A template like
  `@if (products.hasValue()) { … } @else { <spinner/> }` keeps the list while the next page loads;
  the old status-based double showed the spinner instead.
- **5.11.0: `renderShallow` `inputs` refuses names the component does not declare.** Before, Angular
  answered with `NG0303` on the console and no value. A key that silently did nothing now fails, in
  a spec that used to be green.
- **5.11.0: `setInputs()` on a fixture without `ɵcmp` names the class.** It used to fail with
  `Cannot read properties of undefined (reading 'inputs')`.
- **5.19.0: `setInputs()` accepts inputs exposed by host directives.** It used to refuse them and say
  "It declares no inputs at all" about a component that has some.
- **5.19.0: a failed resource double throws from `value()`, like Angular.** Component code that reads
  `value()` without checking `hasValue()` used to pass in the spec and crash in the app.
  `reload()` now answers `false` while there is nothing to re-issue; before it was always `true`.
- **5.20.0: `injectSpy(GenericClass)` no longer infers `never`.** For a class whose constructor takes
  its own type parameter, 5.19.0 inferred `never`, and the typed `accessorSpies` turned that into an
  assignment error. Such a class is now read at its constraint, for example `Spy<ModalRef<unknown>>`.
  For a particular type, write it out: `injectSpy<ModalRef<PurchaseOptions>>(ModalRef)`.
- **5.46.0: `toHaveSignalValue` and `toHaveResourceValue` compare the contents of a `Set` or a `Map`.**
  Before, any two Sets were equal, and so were any two Maps. An assertion on the wrong set passed.

### Spy and assertion behaviour changes (5.2.0 to 5.44.0)

These fixes can turn a green spec red, or break the type-check. Each red spec was passing for the
wrong reason.

- **5.2.0: a generic class's declared default type argument reaches the spy.** For
  `class FlagsConfigService<T = FlagsConfigDefaults>`, `createSpyFromClass` and `injectSpy` used to
  infer `T` as `unknown`. Every member typed with `T` then read as `unknown`.
- **5.2.0: `restoreMocks: true` keeps the accessor spies of a double built outside `beforeEach`.**
  Before, the runner's restore ran before the test and put back the real accessors. The
  `accessorSpies` entries stayed, but nothing read them any more.
- **5.6.0: a seed in `overrides` reaches a spied getter.** For a member in `gettersToSpyOn`, the seed
  used to be dropped, and the getter answered `undefined`. Now the getter returns the seed. A later
  `accessorSpies.getters.x.mockReturnValue(…)` still wins.
- **5.9.0: `returns` and `selfReturning` skip a member seeded in `overrides`.** This applies to
  `createAutoMock` and `provideAutoSpyForToken`. A seeded plain function used to throw
  `TypeError: asVitestMock(...).mockImplementation is not a function` from the provider.
- **5.15.0: a getter in `overrides` runs only when the spec reads it.** It used to run while the
  double was built. A getter written to throw then failed inside `TestBed.configureTestingModule`.
- **5.19.0: `calledWith` stops treating different arguments as one.** Two functions with the same
  name, two `Error`s that differ only in message, or a `Set` in another order used to share one
  answer. A spec that relied on that now fails and prints both argument lists.
- **5.19.0: `resetAutoSpy` also drops pending `Once` values and accessor configuration.** A queued
  `mockReturnValueOnce` used to answer the first call after the reset, in a later test. A
  `accessorSpies.getters.x.mockReturnValue(…)` used to survive too. A spec that relied on either now
  reads `undefined`.
- **5.19.0: `accessorSpies.getters` and `.setters` are typed from the member.** Stubbing a getter
  with a value of the wrong type is now a type error.
- **5.19.0: the emission helpers stop at the value they wait for.** A `tap`, `finalize` or `defer` spy
  after that value is no longer called. A spec that counted five `tap` calls now sees one, as in
  production. `of(1).pipe(repeat())` no longer hangs.
- **5.19.0: `setupAutoSpy()` closes an emission wait the test never awaited.** It used to keep running
  into the next test and fail there. Now it is torn down at the end of its own test, with a warning
  that names the test.
- **5.44.0: a function in `overrides` for a method becomes that method's spy.** This applies to
  `createSpyFromClass` and `provideAutoSpy`. Before, the function was stored as written, so
  `expect(sanitizer.sanitize).toHaveBeenCalledOnce()` compiled and then threw
  `[Function sanitize] is not a spy`.

### Setup and network stub changes (5.19.0 to 5.22.0)

These come from `vitest-auto-spy/setup`. Each can change a result in a spec that used to pass.

- **5.19.0: `advanceTimers()` refuses to run when only the clock is faked.** `mockSystemTime()`
  fakes `Date` alone, so there is nothing to advance. The call used to pass and do nothing. Now it
  throws and names `setupFakeTimers()`.
- **5.19.0: `withSystemTime` and `mockSystemTime` put the clock back under fakes the suite
  installed.** Before, the undo did nothing there, and the clock stayed where the block left it.
- **5.20.0: `blockNetwork` no longer switches MSW off.** With `server.listen()` in a `beforeAll`, the
  `fetch` stub used to go on top of MSW. Every mocked `fetch` request then failed with
  `fetch is stubbed in unit tests`, `HttpClient` included.
- **5.22.0: `stubResponse({ body: null })` sends the JSON literal `null`.** Before, `null` meant "no
  body", and `.json()` threw `Unexpected end of JSON input`. For no body, omit `body` or write
  `body: undefined`. `{ body: null, status: 204 }` (or 205, 304) now throws by name.

### Package changes (5.19.0)

These change how the package installs and loads, not what a spy does.

- **`vitest` is an optional peer.** A project on `/bun` or `/node` no longer installs Vitest. The
  range is still `>=2.1.0`.
- **`vitest-auto-spy/package.json` resolves.** Tools that read a dependency's manifest, such as
  Storybook or Nx, used to get `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- **`require('vitest-auto-spy/eslint-plugin')` is typed correctly.** Its CommonJS declaration is now
  `export =`. Before, an `eslint.config.cts` or `.cjs` type-checked the call that throws and rejected
  the one that works.

### ESLint rule changes (5.5.0 to 5.25.0)

Expect new reports after the upgrade. The counts come from one project with 1 759 spec files.

- **5.5.0: two new rules, both `warn`.** `no-stub-class-double` reports a stub class with `vi.fn()`
  fields. `no-structural-double` reports an object of `vi.fn()`s typed as `{ m: Mock }`. They started
  at 12 reports in 8 files and 115 in 74. After the change below, they gave 10 in 7 and 5 in 4.
- **5.5.0: `prefer-provide-auto-spy` sees more doubles.** It reads `useClass:`, `useExisting:`,
  `useValue: new StubMock()`, a `let` filled in a `beforeEach`, and `TestBed.overrideProvider`.
  Before, no rule read `overrideProvider`. On that project the rule went from 18 reports to 154, at
  `error`. Most of those doubles were `no-structural-double` reports at `warn` before.
- **5.5.0: one double draws one report.** `prefer-create-spy-from-class` and `no-structural-double`
  stay silent when the object goes to Angular DI. Before, an object kept in a `const` could get two
  reports: one recommending `createSpyFromClass` and one `provideAutoSpy`.
- **5.5.0: `no-overridden-provider` sees a provider that `TestBed.overrideProvider` replaces.** The
  replaced `provideAutoSpy(X)` is a spy nothing uses.
- **5.24.0: `no-redundant-mock-reset` reports fewer resets.** 5.23.0 also reported three kinds that
  are not redundant: a restore or reset in `afterEach` or `afterAll`, a reset after another
  `beforeEach` has run, and anything in `beforeAll`. The rule no longer reports them.
- **5.25.0: `prefer-create-mock` reports nested fixture casts once.** Before, each cast drew its own
  report. Accepting the outer fix left the inner cast unchecked.

### CLI changes (5.18.0 to 5.20.0)

A CI job that runs `perf --gate`, `doctor` or `init --check` can change colour after the upgrade.

- **5.18.0: the `perf` gate judges a file by its tests, not by its size.** A file budget is now
  counted in the run's median test. `--factor` applies per test; `--max-file-ms` is only a floor. The
  old rule flagged large files and slow CI machines. The same file was green on a laptop and red on
  CI.
- **5.18.0: `perf` prints what would fail `--gate`.** Files and test bodies over budget replace the
  two "ten slowest" tables. Those tables showed the largest files, which were rarely the slow ones.
- **5.19.0: an unknown flag is an error with exit code 2.** Before, `init --dryrun` wrote the files,
  and `perf --gat` passed with no gate at all.
- **5.19.0: `init --check` ignores a change of the version stamp alone.** A new release of the
  package no longer turns the check red when the instructions did not change.
- **5.19.0: Code Quality reports keep numbers in backticks.** `returns 200` and `returns 404` are two
  findings now. Before, the merge request widget showed one and dropped the other.
- **5.19.0: the codemod reads JSX correctly.** The `/` of a self-closing tag was taken for a regular
  expression. Part of a `.tsx` spec was then skipped by every transform and by `--verify`.
- **5.20.0: `doctor` warns when a scan stops at its cap.** Past 50 000 files it reports
  `scan-cap-reached`. Before, it said "No problems found." about files it never read.
- **5.20.0: `perf` tables print the path last, in full.** They used to cut the path in the middle, so
  a CI log had paths nobody could copy.

### A suite-wide `strict: true` starts to apply (5.6.0)

Before **5.6.0**, `setupAutoSpy({ strict: true })` had no effect: it was stored in a copy of the
module no spec read. 5.6.0 fixed that. If your project is on 5.5 or earlier and sets the option, this
is a behaviour change. Every unconfigured call on a spy now throws
"… was called; this strict double has nothing configured for it". One project got ten red tests from
it. Configure the call the error names, or drop `strict` for that spy.

## What did _not_ change

- **No helper was removed, renamed or deprecated.** `provideAutoSpy`, `injectSpy`, `renderShallow`,
  `createWithAutoSpies`, `stable`, `flushEffects`, the signal and resource matchers and the
  `mock*Prop` helpers behave as before.
- **In 5.0 itself, no import path in your specs changes.** (5.21.0 later moved some Angular
  helpers; see above.)
- **Angular stays optional.** A React, Vue, Svelte, NestJS or plain Node project installs no Angular
  package and loads none into its TypeScript program.
- **The `vitest` peer still starts at 2.1.** One install supports Vitest 2.1 through 5.x.
- **Zoneless and zone.js are both supported.** `fakeAsync` still needs
  [`vitest-auto-spy/zone`](/utilities/zone).

## Coming from further back

- [Upgrading to 4.0](/upgrading-4) has real work: rxjs left the published declarations, and two
  groups of helpers moved to their own import paths.
- [Upgrading to 3.0](/upgrading-3) is one line in `package.json`.
- [Upgrading to 2.0](/upgrading-2) matters only if you are still on 1.x.
