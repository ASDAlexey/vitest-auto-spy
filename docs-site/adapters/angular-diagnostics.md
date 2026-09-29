---
title: Angular diagnostics
description: enableAngularDiagnostics turns five silent mistakes in Angular specs into failing tests - dead NgModule imports, dead schemas, real services where a spy was expected, unanswered HTTP requests and spies the component's own providers hide.
---

# Angular diagnostics

`enableAngularDiagnostics()` turns five common mistakes in Angular specs into test failures. Each
mistake lets a test pass for the wrong reason, and nothing warns you. Turn it on once, in your Vitest
setup file. Pick the variant that matches how you run tests.

**Plain Vitest** (`vitest` with a `vitest.config.ts`):

```ts
// src/test-setup.ts
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { enableAngularDiagnostics } from 'vitest-auto-spy/angular/diagnostics';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

enableAngularDiagnostics(); // all five checks
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { setupFiles: ['src/test-setup.ts'] },
});
```

**Angular CLI** (`ng test`): the builder already calls `initTestEnvironment()`, and you need no
`vitest.config.ts`. The setup file has only the import and the call, and `angular.json` lists it:

```ts
// src/test-setup.ts
import { enableAngularDiagnostics } from 'vitest-auto-spy/angular/diagnostics';

enableAngularDiagnostics();
```

```jsonc
// angular.json
"test": {
  "builder": "@angular/build:unit-test",
  "options": { "setupFiles": ["src/test-setup.ts"] }
}
```

Your specs stay as they are. A spec with one of the mistakes below now fails with a message that
names the fix.

## The five checks

| Check               | Default | The test fails when                                                                |
| ------------------- | ------- | ---------------------------------------------------------------------------------- |
| `ngModuleScopes`    | `true`  | the testing module imports an NgModule that brings nothing                         |
| `deadSchemas`       | `true`  | `schemas` sit next to a standalone component, where they never apply               |
| `unspiedProviders`  | `true`  | `injectSpy()` gets a real service instead of a spy                                 |
| `pendingRequests`   | `true`  | a test ends with HTTP requests nobody answered                                     |
| `shadowedProviders` | `true`  | a spy on the testing module never reaches the component, whose own `providers` win |

Pass `false` to leave a check out. `pendingRequests` also takes an object with its one option,
`ignoreCancelled`. Every call starts from all five on, so checks you do not name are on:

```ts
enableAngularDiagnostics({ pendingRequests: false }); // the other four
enableAngularDiagnostics({ pendingRequests: { ignoreCancelled: true } }); // all five; cancelled requests pass
```

| Function                                  | What it does                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `enableAngularDiagnostics(options?)`      | turns the checks on; a second call **replaces** the previous selection, it does not add to it |
| `disableAngularDiagnostics()`             | turns them all off; `injectSpy()` goes back to a warning                                      |
| `assertNoPendingRequests(options?)`       | runs the `pendingRequests` check in the middle of a test                                      |
| `assertNoShadowedProviders(cmp, fixture)` | runs the `shadowedProviders` check on a fixture you built yourself                            |

All four come from `vitest-auto-spy/angular/diagnostics`.

## Call it _after_ the Angular test environment is set up

The checks read the `TestBed` that `initTestEnvironment()` builds. So call `enableAngularDiagnostics()`
after it, as in the plain Vitest example above. With `ng test`, the builder sets up the environment
before your setup files run, so the order is already right.

Call it from the setup file, not from a spec. The setup file runs for every spec file, so every file
gets the checks. This also holds with Vitest's `isolate: false`, where one worker process runs many
spec files.

You can call it again inside a test, for example `enableAngularDiagnostics({ pendingRequests: false })`.
The new selection replaces the old one for the rest of that spec file. The next file starts with the
selection from your setup file again, because the setup file runs before each file.

The order of `afterEach` hooks does not matter. If your own `afterEach` resets the `TestBed` first,
the checks still see what the test left behind.

## `ngModuleScopes`

Fails when the testing module imports an NgModule that brings nothing at runtime. Some test builds
lose the list of declarations of a compiled NgModule. Its directives then silently do not render.

```ts
TestBed.configureTestingModule({ imports: [ProfileComponent, DirectivesModule] }); // throws here
```

```text
[vitest-auto-spy] ngModuleScopes: DirectivesModule is imported into the testing module but contributes nothing — this test bundle dropped its ɵɵsetNgModuleScope, so its directives are missing (NG0303/NG0304).
Import the directives it exports directly, or declare them in the TestBed.
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-diagnostics#ngmodulescopes
```

**Fix:** import the directives themselves, or declare them in the testing module.

The automatic check fires only when a module brings _nothing at all_: no declarations, no exports,
no providers and no imports. Modules with only providers, such as `HttpClientTestingModule` or a
`forRoot()` result, are normal and never fail.

**Common mistake:** expecting it to catch a module that lost its declarations but still has
providers. It cannot tell that one from a providers-only module. For those, call
[`assertNgModuleScopes(DirectivesModule)`](/adapters/angular-overrides#assertngmodulescopes-modules)
in the spec yourself: there you say which modules must bring declarations.

## `deadSchemas`

Fails when `schemas` such as `NO_ERRORS_SCHEMA` sit next to a standalone component. Schemas apply
only to components in `declarations`. A standalone component has its own imports and ignores them. So
the schema silences nothing: the unknown element still does not render, and the spec stays green.

```ts
TestBed.configureTestingModule({ imports: [ProfileComponent], schemas: [NO_ERRORS_SCHEMA] }); // throws
```

```text
[vitest-auto-spy] enableAngularDiagnostics({ deadSchemas }): configureTestingModule was given 1 schema(s) that can never apply. The module declares nothing, and ProfileComponent carries its own dependency scope.
Nothing is being silenced here: whatever the schema was added for is still unresolved, and the template renders without it.
Drop the `schemas` entry, then put the missing directive, component or pipe into the standalone component's own `imports` — or render it through a standalone host built with `createDirectiveHost({ template, scope: [...] })`.
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-diagnostics#deadschemas
```

**Fix:** remove `schemas`. Add the missing directive, component or pipe to the component's own
`imports`, or render it through `createDirectiveHost({ template, scope: [...] })`.

It fires only when all three hold: `schemas` is not empty, `declarations` is empty, and `imports`
holds at least one component. It looks at the whole module, including every
`configureTestingModule()` call of the test (for example one in `beforeEach` and one in the test).

**Common mistake:** expecting a failure when `declarations` is not empty. There the schema is live for
the declared components, so the check stays silent on purpose.

## `unspiedProviders`

Fails at the `injectSpy()` line when the testing module has no spy for that service, so Angular built
the real one. Without the diagnostics, `injectSpy()` only prints a `console.warn`.

```ts
TestBed.configureTestingModule({ imports: [ProfileComponent] }); // no provideAutoSpy(FeatureFlagService)
const flags = injectSpy(FeatureFlagService); // throws here
```

```text
[vitest-auto-spy] injectSpy(FeatureFlagService): got a real FeatureFlagService — nothing in the testing module provides a double, so Angular built it (providedIn: 'root').
Add provideAutoSpy(FeatureFlagService) to providers.
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular#injectspy-says-when-it-got-the-real-thing
```

**Fix:** add `provideAutoSpy(FeatureFlagService)` to `providers`.

The warning prints once per service and spec file. The failure is reported in every test that hits
it, so no test hides it from the next.

## `pendingRequests`

Fails a test that ends while `HttpTestingController` still holds requests nobody answered. The code
under test is still waiting for them, so nothing that depends on the response ran.

```ts
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

it('loads the user', () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const http = TestBed.inject(HttpTestingController);

  TestBed.inject(UserService).load().subscribe();

  http.expectOne('/api/user').flush({ id: 1, name: 'Ada' }); // remove this line and the test fails
});
```

Without the `flush` line, the test fails with:

```text
[vitest-auto-spy] GET /api/user was never answered (end of "loads the user").
The code under test is still waiting on it, so nothing after that call ran; left open, the next test would match it.
Answer it in the spec: controller.expectOne('/api/user').flush(body).
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-diagnostics#pendingrequests
```

**Fix:** answer each request in the spec. With `provideHttpClientTesting()` or
`HttpClientTestingModule` that is `controller.expectOne(url).flush(body)`. With
[`provideHttpTesting()`](/adapters/angular-http) the message suggests
`await expectRequest('/api/user').flush(body)` instead.

The check finds `HttpTestingController` in your own `providers` and `imports`, at any depth. A
project without HTTP testing is not affected, and nothing extra needs installing.

**Common mistake:** a test that cancels a request on purpose fails. Use `ignoreCancelled`, below.

### `ignoreCancelled`

A cancelled request counts as unanswered too. When the code unsubscribes, Angular keeps the request in
the controller, marked `cancelled`, and by default the test fails. This happens with an `httpResource()` whose component was destroyed,
a `takeUntil`, or a `switchMap` that moved on. If your code cancels requests on purpose, pass an
object in the setup file. It then applies to the whole project:

```ts
enableAngularDiagnostics({ pendingRequests: { ignoreCancelled: true } });
```

| Option            | Type      | Default | Meaning                                      |
| ----------------- | --------- | ------- | -------------------------------------------- |
| `ignoreCancelled` | `boolean` | `false` | a cancelled request no longer fails the test |

A cancelled request is still cleared from the controller, so it cannot leak into the next test. A
request that is still waiting fails as before. Angular's own `HttpTestingController.verify()` has an
option with the same name and meaning.

### `assertNoPendingRequests()`

Runs the same check in the middle of a test, usually after the arrange step:

```ts
import { assertNoPendingRequests } from 'vitest-auto-spy/angular/diagnostics';

facade.load();
controller.expectOne('/api/users').flush([]);
assertNoPendingRequests(); // → throws if anything else went out
```

| Option            | Type      | Default                                        | Meaning                       |
| ----------------- | --------- | ---------------------------------------------- | ----------------------------- |
| `ignoreCancelled` | `boolean` | the value passed to `enableAngularDiagnostics` | override it for this one call |

It only looks at requests that no `expectOne(...)` has taken yet, so call it after those lines. The
requests it reports are cleared, so the end-of-test check does not report them again. It does nothing
when the diagnostics are off or the test never set up HTTP testing.

## `shadowedProviders`

Fails when a spy on the testing module never reaches the component, because the component lists the
same service in its own `providers`. The component then talks to the real service. The spy records
nothing, and a check like "was _not_ called" passes for the wrong reason.

```ts
@Component({ selector: 'app-promo', providers: [PromoService], template: '…' })
export class PromoComponent {}

TestBed.configureTestingModule({ imports: [PromoComponent], providers: [provideAutoSpy(PromoService)] });
const fixture = TestBed.createComponent(PromoComponent); // throws here
```

```text
[vitest-auto-spy] PromoComponent declares its own providers, so 1 double on the testing module never reached it: PromoService → a PromoService instance.
The component's own providers are asked before the module's, so it runs against the real service while the spec asserts on a double that records nothing.
Replace the module-level registration with overrideComponentProvider(PromoComponent, PromoService).
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-diagnostics#shadowedproviders
```

**Fix:** put the spy into the component's own providers:

```ts
import { overrideComponentProvider } from 'vitest-auto-spy/angular';

const promo = overrideComponentProvider(PromoComponent, PromoService); // → Spy<PromoService>
```

An optional spy config is the third argument. For an `InjectionToken`, which
`overrideComponentProvider` does not take, use
`TestBed.overrideProvider(TOKEN, provideAutoSpyForToken(TOKEN))`.

The check stays silent when the component already gets a spy: through `TestBed.overrideProvider`,
`overrideComponentProvider` or a `viewProviders` spy. It reports only a **real** instance. It also
stays silent when a later provider or override replaced the module's spy.

**Common mistake:** adding `provideAutoSpy(PromoService)` to the module and expecting the component to
use it. A component's own `providers` always win over the module's.

### `assertNoShadowedProviders(component, fixture)`

Runs the same check on a fixture you built yourself, for example through your own render helper:

```ts
import { assertNoShadowedProviders } from 'vitest-auto-spy/angular/diagnostics';

const fixture = renderThroughOurHelper(CartComponent);

assertNoShadowedProviders(CartComponent, fixture); // → throws if a module spy never reached CartComponent
```

It does nothing when the fixture never rendered that component.

## What this group does not include

The diagnostics only check what a spec already wrote. They do not answer HTTP requests for you. For
that, use [`provideHttpTesting()` and `expectRequest()`](/adapters/angular-http) from
`vitest-auto-spy/angular-http`. This entry does not import `@angular/common/http/testing`, so it adds
no dependency.

## In depth

### Both ways of reaching the `TestBed` are seen

A spec can configure its module through the `TestBed` class or through `getTestBed()`. Both are the
same object: each static method calls the instance. The checks sit on the instance, so both styles
are checked:

```ts
getTestBed().configureTestingModule({ imports: [CatalogPageComponent] }); // checked
const fixture = getTestBed().createComponent(CatalogPageComponent); // and so is this
```

This holds for `ngModuleScopes`, `deadSchemas`, `shadowedProviders` and the
[`overrideComponentProvider` verification](/adapters/angular-overrides). Each call is counted once.
`TestBed.overrideTemplate` goes through `overrideComponent`, so it counts toward the measured
[`TestBed` time](/adapters/angular).

### Why `ngModuleScopes` filters modules

When you call `assertNgModuleScopes()` yourself, you pass modules you import for their declarations,
so an empty scope is a real problem. The automatic check sees every import instead. Many of them are
providers-only modules, which are legitimately empty. Without the filter, the check would fail every
spec file on the first run.

A stripped scope and an always-empty scope look the same at runtime. So the automatic check only
fires when a module brings nothing at all.

Emptiness is tested by flattening the nested arrays, not by `length === 0`. The compiled
`ɵinj.imports` of `@NgModule({})` is `[[], []]`: two empty lists that a length check would count as
two entries.

### How `deadSchemas` reads the configuration

A test may call `configureTestingModule()` several times, for example in `beforeEach` and again in the
test. Angular adds the calls up, and the check judges the sum, not one call. So a schema added in one
call next to declarations from another call counts as live. The sum is forgotten before every test and
at every `resetTestingModule()`.

### How it works without a second peer dependency

This package never imports `@angular/common/http/testing`, and it is not a peer dependency. The
`HttpTestingController` token comes from your own configuration:

- `provideHttpClientTesting()` returns an `EnvironmentProviders` wrapper. Its `ɵproviders` list
  contains a provider for `HttpTestingController`.
- `HttpClientTestingModule` keeps the same list in its `ɵinj.providers`.

The check flattens `providers`, including nested arrays and the `ɵproviders` of any
`EnvironmentProviders` wrapper. It looks for a provider whose `provide` is a function named
`HttpTestingController`. If `providers` has none, it walks `imports` and reads each entry's
`ɵinj.providers` the same way. It gets the instance through `TestBed.inject(token, null)`, and only
while the testing module exists. Asking a reset `TestBed` would build a new module, and the next
`configureTestingModule()` would then refuse to run.

The walk over `imports` goes all the way down, so a shared testing module that contains
`HttpClientTestingModule` works:

```ts
TestBed.configureTestingModule({ imports: [SharedTestingModule] }); // HttpClientTestingModule is inside
```

Each module is walked once and cached. Nested arrays and a `forRoot()`-style `{ ngModule, providers }`
result are understood. A cycle in the imports is not followed twice. The walk stops at the first
token found.

### The hook-ordering hazard, and how it is handled

Your own `afterEach(() => getTestBed().resetTestingModule())`, or Angular's cleanup hook, may destroy
the testing module before the diagnostics look at it. This holds for both hook orders, `sequence:
{ hooks: 'stack' }` and `'list'`.

So the diagnostics wrap the `TestBed` instance's `resetTestingModule()`. Before each reset, the
wrapper saves the open requests while the module still exists. It wraps the instance because the
static `TestBed.resetTestingModule()` calls it, and `getTestBed().resetTestingModule()` and Angular's
cleanup hook call it directly. The `afterEach` then reports the saved requests **and** any still open.
A test that resets twice built two modules, and both are reported.

The same wrapper forgets the spies `shadowedProviders` remembered for the module and the `deadSchemas`
sum.

Reading takes the requests: `match(() => true)` both lists and removes them, and the saved list is
emptied as it is read. So two hooks never report the same request twice.

The wrapper tries to save the requests, and it always runs the reset. If saving throws, for example because Angular already
destroyed the injector, the error is swallowed and `resetTestingModule()` still runs.

If the `TestBed` has no `resetTestingModule()` at all, no wrapper is installed, and the check reads the
live injector. The wrapper is installed once per `TestBed` instance and does nothing while the
diagnostics are off.

### How `shadowedProviders` compares

It reads the component's own injector with `{ self: true }`. So it never looks further up for a
service the component does not declare. It cannot build a real root service the test never asked
for, and it cannot fail on that service's missing dependencies (`NG0201`). The spies it compares
against are forgotten before every test and at every reset.

## Related

- [Angular adapter](/adapters/angular): `provideAutoSpy`, `injectSpy`, `renderShallow` and the
  `TestBed` timing diagnostics, which share a hook with this group.
- [Component provider overrides](/adapters/angular-overrides): `overrideComponentProvider` and its own
  check, which is **always on** and not part of this group.
- [Angular HTTP](/adapters/angular-http): `provideHttpTesting()` and `expectRequest()`.

`disableAngularDiagnostics()` does not remove the `TestBed` timing instrumentation that
`enableTestBedDiagnostics()` from the [Angular adapter](/adapters/angular) also uses. Call
`disableTestBedDiagnostics()` for that.
