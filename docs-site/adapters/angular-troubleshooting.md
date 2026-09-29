---
title: Angular troubleshooting
description: Errors an Angular spec can hit before your own code runs - two copies of Angular testing, an already created testing module, NG0101, empty NgModule scopes, broken component definitions.
---

# Angular troubleshooting

Find your error message below. Each entry says what causes it and what to change. Most of these come
from the build setup or from Angular itself, not from your test.

| Error or symptom                                                                                          | Section                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `TypeError: cache.has is not a function` at startup                                                       | [Analog is older than the builder](#analog-is-older-than-the-builder)                                   |
| `Need to call TestBed.initTestEnvironment() first`, `Cannot read properties of null (reading 'ngModule')` | [Two copies of `@angular/core/testing`](#two-copies-of-angular-core-testing)                            |
| `the testing module was already instantiated`, `Cannot configure the test module…`                        | [The testing module was already instantiated](#the-testing-module-was-already-instantiated)             |
| `NG0101: ApplicationRef.tick is called recursively`                                                       | [NG0101](#ng0101-applicationref-tick-is-called-recursively)                                             |
| `Cannot set base providers because it has already been called`                                            | [Zone and zoneless files in one run](#zone-and-zoneless-files-in-one-run)                               |
| `stable: the fixture was still unstable after 2000 ms`                                                    | [A fixture never becomes stable](#a-fixture-never-becomes-stable)                                       |
| `NG0303`, `NG0301`, `NG0304` for a directive or pipe that is declared                                     | [An NgModule that contributes nothing](#an-ngmodule-that-contributes-nothing)                           |
| `Cannot read properties of undefined (reading 'provide')` inside Angular                                  | [A component whose own definition has a hole in it](#a-component-whose-own-definition-has-a-hole-in-it) |
| `@angular/core … no longer carries …, which this package reads`                                           | [When an Angular internal moves](#when-an-angular-internal-moves)                                       |
| `__spreadValues is not a function`, a `vi.mock` of a relative path throws                                 | [Angular unit-test builder](/guides/angular-unit-test-builder#module-mocks-under-the-unit-test-builder) |

## Analog is older than the builder

```text
TypeError: cache.has is not a function
```

On `@angular/build` 22.2, the Analog packages `@analogjs/vite-plugin-angular` and
`@analogjs/vitest-angular` must be **2.7.5 or newer**. Older versions stop at startup with this
error. Upgrade both.

`npx vitest-auto-spy doctor` reports this as
[`analog-behind-angular-build`](/utilities/cli#analog-behind-angular-build).

## Two copies of `@angular/core/testing`

```text
Need to call TestBed.initTestEnvironment() first
Cannot read properties of null (reading 'ngModule')
```

If `injectSpy` or `renderShallow` fails with one of these while your setup file does call
`initTestEnvironment`, the project has two copies of `@angular/core/testing`. Your setup file
initialised one, and the library talks to the other.

How it happens: Analog's Vitest plugin processes Angular together with your code, but Vitest loads
`vitest-auto-spy` from `node_modules` as is ([externalizes](/glossary) it). The library then imports
its own copy of Angular. Tell Vitest to process the library with your code too, so both share one
copy. Add it to `server.deps.inline` in the file that holds your Vitest settings (`vite.config.ts`
in an Analog project); keep any entries already there:

```ts
// vite.config.ts
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [angular()],
  test: {
    server: { deps: { inline: ['vitest-auto-spy'] } },
  },
});
```

When this happens, the library throws its own error with this explanation, and Angular's original
error is in its `cause`.
`npx vitest-auto-spy doctor` reads your config and reports the split before a run, as
[`angular-testbed-split`](/utilities/cli#angular-testbed-split).

**Or one copy, loaded twice.** `vi.resetModules()` loads `@angular/core/testing` again, and under
`isolate: false` every later file of the worker gets the new copy. A setup that remembers on
`globalThis` that it already ran, such as `setupTestBed()` from `@analogjs/vitest-angular`, skips
it, so the new `TestBed` is never initialised. The library's message names this case when it has
seen more than one `TestBed` in the worker. In the setup file, initialise again when
`getTestBed().platform` is `null`, or remove the reset:

```ts
// vitest.setup.ts
import { destroyPlatform } from '@angular/core';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

if (!getTestBed().platform) {
  // the old platform still lives in @angular/core — destroy it first
  destroyPlatform();
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
}
```

## The testing module was already instantiated

```text
[vitest-auto-spy] renderShallow(TaskListComponent): the testing module was already instantiated, so it can no longer be configured. Something read the injector first — TestBed.inject or injectSpy in a beforeEach, or an earlier render in the same test.
```

Angular's own form is _"Cannot configure the test module when the test module has already been
instantiated"_. The first `TestBed.inject`, `injectSpy` or `createComponent` creates the testing
module, and after that it cannot be configured. Common causes:

- `injectSpy` in a `beforeEach`, then `renderShallow` in the test. Move the `injectSpy` call into
  `renderShallow`'s `beforeCreate` option, a function that runs after the module is configured and
  before the component is created, so reading the injector there breaks nothing:

  ```ts
  import { of } from 'rxjs';
  import { injectSpy, provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';

  const ada = { id: 1, name: 'Ada' };

  const { fixture } = renderShallow(ProfileComponent, {
    providers: [provideAutoSpy(UserService)],
    beforeCreate: () => {
      injectSpy(UserService).load.mockReturnValue(of(ada));
    },
  });
  ```

  After the render, calling `injectSpy(UserService)` again to assert is fine: reading a created module
  is allowed, only configuring it is not. Details:
  [`renderShallow`](/adapters/angular#shallow-component-rendering).

- `overrideComponentProvider` after an `injectSpy`. Put the override first; the lint rule
  [`no-inject-before-override`](/utilities/eslint-rules#no-inject-before-override) catches it.
- Vitest fixtures are built by chaining `test.extend(...)` calls, one spy each. The first fixture
  creates the module before the others. Pass all spies in one
  [`extendWithAutoSpies`](/adapters/angular#fixtures-instead-of-let-beforeeach-—-extendwithautospies)
  call.
- A second render in the same test (`renderShallow`, or `create()` from
  [`prepareShallow`](/adapters/angular#the-same-options-in-every-test-—-prepareshallow)). Call
  `TestBed.resetTestingModule()` first.

## NG0101: ApplicationRef.tick is called recursively

```text
NG0101: ApplicationRef.tick is called recursively
```

In a zone.js project, a change-detection tick started from the test body can re-enter itself when a
component's `effect()` is dirty. Angular reports this to the `ErrorHandler` instead of throwing, so
the test may stay green with change detection unfinished.

Use [`stable`, `flushEffects` and `setInputs`](/adapters/angular#zoneless-waiting). They run the tick
inside `NgZone`, which avoids the error. A bare `TestBed.tick()` or `componentRef.setInput` followed
by your own tick can hit it.

It shows up only when all of these hold:

- the project loads zone.js (the CLI builder then adds `provideZoneChangeDetection()`);
- a component registers an `effect()`;
- that effect is dirty when the test ticks, often on the fixture's first render.

## Zone and zoneless files in one run

```text
Cannot set base providers because it has already been called
```

`TestBed.initTestEnvironment` can run once per platform, and under `isolate: false` the platform
lives for the whole worker. The second file in the other mode then fails. Use
[`setupAngularTestEnv`](/adapters/angular#zone-and-zoneless-in-the-same-run) to pick the mode per
file.

## A fixture never becomes stable

```text
[vitest-auto-spy] stable: the fixture was still unstable after 2000 ms. …
```

Something keeps Angular busy. The message names the likely cause:

- callbacks waiting on fake timers: `await advanceTimers(ms)` from
  [`vitest-auto-spy/setup`](/utilities/fake-timers) first;
- an `HttpClient` request nobody flushed:
  `TestBed.inject(HttpTestingController).expectOne(url).flush(body)`;
- a `PendingTasks` entry nothing released, or a real `setInterval` the component started.

A pending request under `provideHttpClientTesting` alone does not hang `whenStable()`. If a fixture
hangs there, the cause is one of the others. Options:
[The wait is bounded](/adapters/angular#the-wait-is-bounded).

## An NgModule that contributes nothing

```text
NG0303: Can't bind to 'appTruncate' since it isn't a known property of 'div'
NG0301: Export of name 'focusable' not found!
NG0304: 'ui-smart-row' is not a known element
(or nothing at all: an attribute directive never runs)
```

In an AOT test bundle, such as the one `@angular/build:unit-test` produces, every `NgModule` has
empty declarations and exports at runtime. Components compiled ahead of time do not care: their
dependencies are already built in. But `TestBed` resolves a scope itself when you put a module in
`imports: [SomeModule]`, or after `TestBed.overrideComponent` recompiles a component. It then finds
nothing, and the errors above never mention the module.

Check the modules you import for their declarations:

```ts
import { TestBed } from '@angular/core/testing';
import { assertNgModuleScopes } from 'vitest-auto-spy/angular';

assertNgModuleScopes(DirectivesModule, PipesModule);
TestBed.configureTestingModule({ imports: [DirectivesModule, PipesModule] });
```

The error names the module. The fix is to put what the spec needs into the testing module directly,
or to use a standalone host with [`createDirectiveHost`](/adapters/angular#a-host-for-a-directive-under-test).

**Common mistake:** passing a providers-only module. It is empty on purpose and is reported as a
false positive. [`enableAngularDiagnostics({ ngModuleScopes })`](/adapters/angular-diagnostics#ngmodulescopes)
runs this check on every testing module, with a filter that lets providers-only modules through.
Full reference: [`assertNgModuleScopes`](/adapters/angular-overrides#assertngmodulescopes-modules).

## A component whose own definition has a hole in it

```text
TypeError: Cannot read properties of undefined (reading 'provide')
  ❯ resolveProvider render3/di_setup.ts:95
```

A component's `providers`, `viewProviders` and compiled scope are fixed when its file runs. If the
bundler put a barrel in a chunk that has not run yet, the component gets `undefined` in those lists.
Angular fails much later, and the stack names neither the barrel nor the component. The spec that
breaks is often one nobody touched: editing a neighbouring file can move a symbol to another chunk.

Check the component before creating it:

```ts
import { TestBed } from '@angular/core/testing';
import { assertComponentDefIntact } from 'vitest-auto-spy/angular';

assertComponentDefIntact(HoverMenuComponent);
const fixture = TestBed.createComponent(HoverMenuComponent);
```

```text
[vitest-auto-spy] HoverMenuComponent.ɵcmp.providers[0] is undefined.
HoverMenuComponent baked that list in when its file ran, before the chunk holding the symbol had run — an uninitialised barrel chunk, which Angular reports later as "Cannot read properties of undefined (reading 'provide')".
In HoverMenuComponent's source, import the symbol at that position from its own file rather than through the barrel.
```

The fix is in the component's source: import that symbol from its own file, not through the barrel.

- It checks the three lists, nested arrays and forward references included. A directive is checked
  the same way.
- It also explains `Cannot read properties of undefined (reading 'ɵcmp')` from `imports: [Cmp]`,
  where the class itself never arrived. Then the message names the argument position.
- A `await import('@scope/lib')` in `beforeEach`, or a static import at the top of the spec, does not
  fix the order.

Full reference: [`assertComponentDefIntact`](/adapters/angular-overrides#assertcomponentdefintact-components).

## When an Angular internal moves

```text
[vitest-auto-spy] @angular/core 23.0.0 no longer carries ReactiveNode#consumers / #kind, which this
package reads.
`mockSignalProp()` can no longer see whether a signal has been read, nor write through a read-only
one, so a patch applied after the first read would be accepted and quietly change nothing.
Nothing here is fixable from a spec: report the Angular version above, and pin the previous one
until a release of this package reads the new shape.
```

A few helpers read Angular internals that have no public API: pending requests of a testing module,
the inputs of a compiled component, whether a signal has been read. If a new Angular version changes
one of them, the library fails loudly and names the version and the check that stops working. Without
that, the check would quietly find nothing to report, and the test would pass while checking less.

What to do: pin the previous Angular version and report the new one in an issue. A spec cannot fix
this.

The shapes are checked once per worker, the first time a helper needs them: `mockSignalProp`,
`enableAngularDiagnostics()` and `provideHttpTesting()`. A project that uses none of them pays
nothing. `setInputs`, `renderShallow` and `createComponentStub` raise the same error when they meet a
changed shape.
