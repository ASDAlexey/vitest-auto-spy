---
title: Angular diagnostics
description: enableAngularDiagnostics — four silent Angular-testing failures (dead NgModule imports, dead schemas, unspied providers, unflushed HTTP requests) turned into loud ones.
---

# Angular diagnostics

```ts
// vitest.setup.ts — after the Angular test environment is initialised
import { enableAngularDiagnostics } from 'vitest-auto-spy/angular';

enableAngularDiagnostics(); // all four
enableAngularDiagnostics({ pendingRequests: false }); // or pick
```

Four checks, one decision. Each member has the same shape: something a spec wrote does nothing,
nothing says so, and the test passes for a reason its author did not intend. They ship as one group
rather than four helpers because turning a suite from "passes" into "passes for the stated reason"
is taken once, in a setup file — and because three of the four hang off the same
`TestBed.configureTestingModule` hook the
[timing diagnostics](/adapters/angular#where-a-spec-spends-its-time) already install.

| Member             | Default | Fails when                                                                         |
| ------------------ | ------- | ---------------------------------------------------------------------------------- |
| `ngModuleScopes`   | `true`  | a testing module imports an NgModule that contributes nothing at all               |
| `deadSchemas`      | `true`  | `schemas` sit next to a standalone component, where they can never apply           |
| `unspiedProviders` | `true`  | `injectSpy` gets a real instance — a `console.warn` today, a throw under the group |
| `pendingRequests`  | `true`  | a test ends with unflushed `HttpTestingController` requests                        |

Every member defaults to `true`; pass `false` to leave one out. Calling `enableAngularDiagnostics`
again **replaces** the previous selection rather than adding to it, and the per-test hooks are
registered once per module — so a second call is safe from anywhere, including from inside a test,
where registering a hook would be an error.

`disableAngularDiagnostics()` turns the group off: no more configuration inspection, and `injectSpy`
warns again instead of failing. It leaves the `TestBed` timing instrumentation in place —
`enableTestBedDiagnostics` may be using it, and `disableTestBedDiagnostics()` is what removes that.

## Call it _after_ the Angular test environment is set up

Vitest runs `afterEach` hooks in **reverse registration order**. The `pendingRequests` hook
registered here has to run _before_ the TestBed teardown it inspects, which means being registered
_after_ it:

```ts
// vitest.setup.ts
import { getTestBed } from '@angular/core/testing';
import { enableAngularDiagnostics } from 'vitest-auto-spy/angular';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

enableAngularDiagnostics(); // ← last, so its afterEach runs first
```

The wrong order does not silently disable the check — `resetTestingModule` is wrapped to snapshot
the open requests before teardown, so the failure still arrives, just from the snapshot rather than
from a live injector. The right order is two lines and one less indirection in the stack trace.

## `ngModuleScopes`

Applies [`assertNgModuleScopes`](/adapters/angular-overrides#assertngmodulescopes) automatically to
every `imports` entry of every testing module — but only to the entries that pass a much stricter
filter first.

**Why there is a filter.** An empty runtime scope is suspicious when you hand-pick the modules to
check, because you pass the ones imported _for their declarations_. The automatic check sees every
import of every testing module, and there a **providers-only module** is legitimately scope-empty:
`HttpClientTestingModule`, any `forRoot()` result, dozens per real suite. Without the filter the
group would fail every file in the project on its first run, and the project would turn the whole
group back off.

So the automatic check fires on a module that has, at runtime:

- no `ɵmod.declarations` and no `ɵmod.exports`, **and**
- no `ɵinj.providers`, **and**
- no `ɵinj.imports`.

Emptiness is tested by flattening, not by `length === 0`: the compiler nests, and the `ɵinj.imports`
of `@NgModule({})` is `[[], []]` — the module's own imports and exports, both empty — which a plain
length check reads as two entries and calls a contribution.

```
[vitest-auto-spy] NgModule(s) with an empty runtime scope: DirectivesModule.
Either they declare nothing (a providers-only module — do not pass those here), or `ɵɵsetNgModuleScope` was not emitted into this test bundle, in which case importing them into the TestBed contributes no directives, components or pipes at all. Declare what the spec needs in the TestBed module directly.
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular
```

**The limitation, stated plainly.** A scope stripped by the AOT bundle and a scope that was always
empty are indistinguishable at runtime. The automatic check therefore only fires when a module
contributes _nothing at all_ — which catches the stripped-bundle case only for modules that also
provide nothing. A module that was stripped but still has providers passes this filter silently.
Hand-calling `assertNgModuleScopes(DirectivesModule, PipesModule)` in the spec remains the strict
form, because there you have told it what you expected the module to bring.

## `deadSchemas`

`NO_ERRORS_SCHEMA` next to a standalone component is a dead entry. Schemas are a property of the
testing module's `declarations`; a standalone component carries its own dependency scope and never
consults them. So a configuration that declares nothing and imports standalone components has
configured a no-op — the element or attribute the schema was meant to excuse is still unresolved,
and the spec is green over a template that never rendered what it was supposed to.

```ts
// fails
TestBed.configureTestingModule({ imports: [CatalogPageComponent], schemas: [NO_ERRORS_SCHEMA] });
```

The check fires when all three hold: `schemas` is non-empty, `declarations` is empty, and `imports`
carries at least one component class (an entry with a `ɵcmp`).

```
[vitest-auto-spy] enableAngularDiagnostics({ deadSchemas }): configureTestingModule was given 1 schema(s) that can never apply. The module declares nothing, and CatalogPageComponent carries its own dependency scope.
Nothing is being silenced here: whatever the schema was added for is still unresolved, and the template renders without it.
Drop the `schemas` entry, then put the missing directive, component or pipe into the standalone component's own `imports` — or render it through a standalone host built with `createDirectiveHost({ template, scope: [...] })`.
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-diagnostics
```

**What it deliberately misses.** It does not fire when `declarations` is non-empty, even if
standalone components are imported alongside them. The schema is live for the declarations there,
and a false failure on a correct spec costs more than a miss — that is the trade every member of
this group is tuned to.

## `unspiedProviders`

`injectSpy(X)` already reports when the injector hands back a plain instance instead of an auto-spy;
without the group that report is a `console.warn`. This member raises it to a thrown failure at the
`injectSpy` line, which is the line that assumed the spy.

```
[vitest-auto-spy] injectSpy(FeatureFlagService): the injector returned a plain instance, not an auto-spy. Register it with provideAutoSpy(FeatureFlagService) (or { provide: TOKEN, useValue: createAutoMock<T>() } for a token), or read it with TestBed.inject() if the real implementation is what this spec wants. As it stands, the control helpers are typed but absent, and `.mockReturnValue(…)` will throw on the real method.
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular
```

The warning form de-duplicates per token, so a `beforeEach` does not print the same line once per
test. **That de-duplication is skipped in fail mode**: a throw is seen once per test by definition,
and suppressing the second occurrence would only hide the failure from the test that came after.

## `pendingRequests`

Fails a test that ends while the `HttpTestingController` it configured is still holding requests.

```
[vitest-auto-spy] enableAngularDiagnostics({ pendingRequests }): the test ended with 2 unflushed HttpTestingController request(s): GET /api/users, POST /api/orders.
Nothing answered them and nothing asserted them, so the code under test is still waiting on a response it never received — everything the spec expected to happen after that call did not happen here.
Flush each one (`controller.expectOne('/url').flush(body)`), or call `controller.verify()` in the spec where the absence of a request is the thing being asserted.
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-diagnostics
```

### How it works without a second peer dependency

`@angular/common/http/testing` is **never imported** by this package and is not a peer of it. It
does not need to be, because the token arrives inside the configuration this group already sees:

- `provideHttpClientTesting()` returns an `EnvironmentProviders` wrapper — a `ɵproviders` property
  around a plain provider list — and one of those providers names `HttpTestingController`.
- `HttpClientTestingModule` keeps the same list on its `ɵinj.providers`.

The hook flattens `providers` (nested arrays, and the `ɵproviders` of any `EnvironmentProviders`
wrapper), then looks for a provider whose `provide` is a function named `HttpTestingController`; if
`providers` yields nothing it walks `imports` and reads each entry's `ɵinj.providers` the same way.
The token is therefore read out of **the caller's own configuration**, and the instance comes back
through `TestBed.inject(token, null)`.

A project that configures neither form is silently inert — no token is found, the check reports
nothing, and nothing had to be installed for that to be true. That is exactly the shape an optional
integration should have.

### The hook-ordering hazard, and how it is handled

Vitest runs `afterEach` in reverse registration order, so a suite whose TestBed teardown was
registered later would destroy the injector before this group's `afterEach` could ask it anything —
and the diagnostic would quietly report nothing, which is the failure mode it exists to remove.

`resetTestingModule` is therefore wrapped to snapshot the open requests while the testing module
still exists, and the `afterEach` reports from that snapshot when there is one. Reading is
**one-shot** in both directions: the requests are read with `match(() => true)`, which both lists
and takes them, and the snapshot is cleared as it is read. Two hooks that both looked cannot report
the same request twice.

If the running `TestBed` has no `resetTestingModule` at all, no wrapper is installed and the check
falls back to reading a live injector.

### `assertNoPendingRequests()`

The same check, exported for mid-test use — after the arrange step, before the assertions that
depend on it:

```ts
import { assertNoPendingRequests } from 'vitest-auto-spy/angular';

facade.load();
controller.expectOne('/api/users').flush([]);
assertNoPendingRequests(); // nothing else went out
```

Because reading takes the requests, calling it yourself is not paid for twice: the group's own
`afterEach` will not re-report what you already inspected. It is a no-op when the group is off, and
a no-op when the test never configured HTTP testing at all.

## What this group does not include

There is no `provideHttpTesting()` / `expectRequest()` helper here, and there is not going to be
one. That is a different feature — a wrapper over the HTTP testing API rather than a diagnostic over
what a spec already wrote — and it would cost a second optional peer dependency
(`@angular/common/http/testing`) to do at all. `pendingRequests` reads the token out of your
configuration precisely so that this page can stay at zero new dependencies.

## Related

- [Angular adapter](/adapters/angular) — `provideAutoSpy`, `injectSpy`, `renderShallow` and the
  TestBed timing diagnostics that share this group's hook.
- [Component provider overrides](/adapters/angular-overrides) — `overrideComponentProvider` and its
  own verification, which is **always on** rather than a member of this group.
