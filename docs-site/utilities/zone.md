---
title: fakeAsync on Vitest
description: vitest-auto-spy/zone makes Angular's fakeAsync and waitForAsync work on Vitest. A separate import, so a zoneless project never loads it.
---

# `fakeAsync` on Vitest

`vitest-auto-spy/zone` makes Angular's `fakeAsync`, `tick()` and `waitForAsync` work on Vitest. You
need it when your Angular project uses zone.js and every `fakeAsync` test fails with this error:

```text
Error: Expected to be running in 'ProxyZone', but it was not found.
```

It works with Angular 20 and newer. A zoneless project does not need it: nothing else in the library
imports this entry or zone.js.

Install the package, then add one import to your test setup file. With `ng test` (Angular's
`@angular/build:unit-test` builder) that is all:

```bash
npm install -D vitest-auto-spy
```

```ts
// src/test-setup.ts, listed in "setupFiles" of the "test" target in angular.json
import 'vitest-auto-spy/zone';
```

With a plain `vitest.config.ts`, the setup file needs more lines; see
[With a plain `vitest.config.ts`](#with-a-plain-vitest-config-ts). Your existing `fakeAsync` specs then
work as they are.

## Set it up

### With `ng test` (Angular's unit-test builder)

The builder loads `zone.js` and `zone.js/testing` itself when your app uses zone.js. It also sets up
`TestBed`, the DOM and Angular compilation. The one-line setup file above is all you need: create it,
and add its path to the `setupFiles` option of the `test` target in `angular.json`.

### With a plain `vitest.config.ts`

A plain config has to do what the builder does. It needs a plugin that compiles Angular components
(here `@analogjs/vite-plugin-angular`), a DOM (`jsdom`), `globals: true`, and a setup file:

```bash
npm install -D vitest-auto-spy @analogjs/vite-plugin-angular jsdom
```

```ts
// vitest.config.ts
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [angular()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

The setup file loads zone.js first, then `zone.js/testing`, then `vitest-auto-spy/zone`. Then it
initializes the `TestBed` environment. The order of the first three lines matters: `vitest-auto-spy/zone` needs zone.js and
`zone.js/testing` already loaded.

```ts
// src/test-setup.ts
import 'zone.js';
import 'zone.js/testing';
import 'vitest-auto-spy/zone';

import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
```

`globals: true` is required: the patch replaces the global `it` and hooks (see
[Requirements](#requirements)). For type-checking the global `describe` and `it`, add
`"types": ["vitest/globals"]` to `compilerOptions` in `tsconfig.spec.json`.

## Write a `fakeAsync` spec

Nothing in the spec mentions the patch. Write it the way Angular's docs show. Use the global `it`,
`test` and hooks (`beforeEach` and the others), not ones imported from `'vitest'`, or the patch
cannot reach them. Importing `expect` or `vi` from `'vitest'` is fine.

```ts
import { Component, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';

@Component({ selector: 'app-cart-badge', template: '{{ count() }}' })
class CartBadgeComponent {
  readonly count = signal(0);

  constructor() {
    setTimeout(() => this.count.set(3), 200);
  }
}

describe('CartBadgeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CartBadgeComponent] });
  });

  it('shows the count after the delay', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartBadgeComponent);

    tick(200);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toBe('3');
  }));
});
```

## What it does

`fakeAsync` only works inside a special zone.js zone, the proxy zone (`ProxyZoneSpec` from
`zone.js/testing`). The patch runs every test and hook body inside one, so `fakeAsync` can take over
the clock.

It wraps these globals: `it`, `test`, `beforeEach`, `afterEach`, `beforeAll` and `afterAll`. Their
modifiers keep working as before: `it.each`, `it.skip`, `it.only`, `it.todo`, `it.concurrent`,
`describe.skip`, `describe.only` and `test.extend` fixtures.

How the patch avoids breaking the runner is in
[How the patch keeps the runner intact](#how-the-patch-keeps-the-runner-intact).

## One zone for the run, or one per callback

### `installProxyZonePatch(options?)`

Importing `vitest-auto-spy/zone` already installs the patch with `scope: 'shared'`. Call
`installProxyZonePatch()` yourself only to choose the other scope:

```ts
// src/test-setup.ts
import 'zone.js';
import 'zone.js/testing';

import { installProxyZonePatch } from 'vitest-auto-spy/zone';

installProxyZonePatch({ scope: 'callback' });
```

The call replaces the shared patch, and importing the entry again later does not switch it back.
Calling it twice with the same scope changes nothing. It returns a function that puts back what it
replaced.

| Option  | Type                     | Default    | Meaning                                                                      |
| ------- | ------------------------ | ---------- | ---------------------------------------------------------------------------- |
| `scope` | `'shared' \| 'callback'` | `'shared'` | `'shared'`: one proxy zone for all tests; `'callback'`: one per test or hook |

Use `'callback'` for `test.concurrent` specs that call `fakeAsync`.

What the two values are for:

- **`'shared'`** is what Angular's own jasmine patch does, and what most Angular specs expect. A
  component created in `beforeEach` often starts a timer in its constructor. The `tick()` inside
  the `fakeAsync` test must see that timer, so both need the same zone. With one zone per callback
  they land in different zones, and the test waits for a timer nothing will flush.
- **`'callback'`** gives each test and hook body its own zone. It is meant for `test.concurrent`,
  where two callbacks run at once and a shared zone would mix their state.

## Requirements

**Globals on: `test: { globals: true }`.** The patch replaces the runner's global `it`, `test` and
hooks. If a spec imports `it` from `'vitest'`, it gets the original function, and the patch cannot
change it.

**zone.js loaded first.** This entry does not import zone.js. Under `@angular/build:unit-test` the
builder loads it for you. Otherwise import `zone.js` and `zone.js/testing` at the top of the setup
file, before this entry.

If something is missing, the patch throws from the setup file and says what to add:

| Error text starts with                                                    | Fix                                                                  |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `vitest-auto-spy/zone: globalThis.Zone is not there`                      | import `zone.js` and `zone.js/testing` before `vitest-auto-spy/zone` |
| `vitest-auto-spy/zone: zone.js is loaded but Zone.ProxyZoneSpec is not`   | add `import 'zone.js/testing';` after `zone.js`                      |
| `vitest-auto-spy/zone: the runner globals (it, beforeEach, …) are not on` | set `test: { globals: true }` in the Vitest config                   |

The full text of the first one:

```text
[vitest-auto-spy] vitest-auto-spy/zone: globalThis.Zone is not there, so there is nothing to patch — this entry does not import zone.js itself, so that a zoneless project never pulls it in.
Load it at the top of the setup file: `import 'zone.js'; import 'zone.js/testing';` (under @angular/build:unit-test the builder does this already).
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/zone#requirements
```

## `fakeAsync` and the helpers that time themselves out

This only matters if you use the library's stream assertions ([emission
helpers](/core/observable-assertions)) or its [`stable`](/adapters/angular) helper inside `fakeAsync`.
Their timeouts run on real time, and `tick()` does not move them.

Such a helper waits for a value up to its own timeout, and that timeout is part of the check. If
`tick()` moved it, advancing the fake clock to make the value appear could expire the wait first.

Everything the code under test schedules still belongs to the fake clock: timers, promises and
microtasks. Move them with `tick()` and `flushMicrotasks()` as usual.

## In depth

You do not need this section to use the entry.

### Why not `zone.js/plugins/vitest-patch`

`zone.js/testing` patches three runners: jasmine, mocha and jest. Vitest is not one of them.

zone.js 0.16.2 (2026-05-06) ships its own Vitest patch, `zone.js/plugins/vitest-patch`. Nothing
installs it for you:

- `zone.js/testing` does not include it. Its bundle carries the jasmine, mocha and jest patches and
  never mentions `vitest`.
- `@angular/build:unit-test`, in every version from 20 to 22, only adds `zone.js/testing` to the
  polyfills.
- The one package that installs a patch as a side effect is `@analogjs/vitest-angular`, through
  `…/setup-zone`. A project that moves to the native builder loses it along with Analog.

Some guides tell you to import the official plugin by hand. ng-mocks, for example, prescribes this
order in its install guide: `zone.js`, then `zone.js/testing`, then `zone.js/plugins/vitest-patch`.
(ng-mocks lists its own tested combinations: Angular 20 / Vitest 3 / jsdom 26 zoneless only, and
Angular 21 and 22 / Vitest 4 / jsdom 28 with or without zone.js. That list is about ng-mocks, not
this entry.)

Following it gives you the plugin's behaviour below. Measured on Vitest 4.1.9 with zone.js 0.16.2,
one spec file per API:

| In the spec                             | Without the plugin   | With `zone.js/plugins/vitest-patch`                                                        |
| --------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| `it.skip` / `it.todo` / `it.concurrent` | reported             | **the test is gone, and the run exits 0**                                                  |
| `it.only`                               | only that test runs  | **that test is gone; the unfocused one runs**                                              |
| `it.each`                               | passes               | **`TypeError: Cannot read properties of undefined (reading 'apply')`, no tests collected** |
| `describe.skip`                         | skipped              | **the suite runs**                                                                         |
| `describe.only`                         | only that suite runs | **every suite runs**                                                                       |
| `test.extend`                           | fixtures work        | **`TypeError: test.extend is not a function`**                                             |
| `test: { globals: false }`              | —                    | patches nothing, warns nothing, every `fakeAsync` still throws                             |

The cause: the plugin replaces the runner globals with plain functions and reattaches ten hard-coded
names to them. So `it.extend`, `it.fails` and `it.scoped` are lost. `it.skip`, `it.only` and
`it.todo` become factories that return a function instead of registering a test. The plugin keeps
`fn.length` but not `fn.toString()`, which Vitest reads to find destructured fixtures.

The same spec files under `vitest-auto-spy/zone` behave exactly like the unpatched run.

In fairness, a plain `fakeAsync` in a bare `it` inside a bare `describe` does work under the
official plugin. It solves its problem for specs that use no test modifier at all.

### How the patch keeps the runner intact

`fakeAsync` needs one thing: the callback it wraps must run inside a zone with a `ProxyZoneSpec`.
`fakeAsync` swaps its own `FakeAsyncTestZoneSpec` into that spec. So the patch runs every test and
hook body inside a forked proxy zone.

The hard part is doing that without disturbing the runner. Each of the three ways to get it wrong
breaks files the patch author never saw, and each was measured on the official plugin above:

| Detail                                                                | What goes wrong without it                                                                                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the wrapper's own source declares **no** parameters                   | Vitest reads `fn.toString()` to find fixtures; `function (...args)` fails every file with `FixtureParseError: … must use object destructuring`             |
| the wrapper then reports the original `fn.length` and `fn.toString()` | the runner reads both to decide how to call the callback; a wrapper that reported its own zero parameters would change that decision and hide the fixtures |
| `it` is **proxied**, not replaced                                     | `each` is a method that reads `this`; called detached it returns `undefined` and the next line throws. `it.skip` / `test.each` come for free               |

A second call of `installProxyZonePatch` leaves already patched globals alone. This matters under
`isolate: false`: Vitest then runs the setup file once per spec file but keeps the globals for the
whole worker, and the patch must not wrap them again.

### Why it is a separate entry

zone.js is only a `devDependency` of this package. It is not a dependency and not an optional peer.
`vitest-auto-spy` declares no runtime dependencies at all, so installing it never adds zone.js to
your tree.

No other entry of the library reaches this module, even indirectly. `dist/zone.js` is
self-contained, and nothing else in `dist/` references it. A zoneless project that imports
`vitest-auto-spy` gets no zone code, no zone import and no byte of this file. The package keeps this
as a rule, not as an accident of one release (see `AGENTS.md`).
