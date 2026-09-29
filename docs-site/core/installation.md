---
title: Installation
description: Install vitest-auto-spy, check what your project needs, and wire it into Angular CLI, Vitest, Bun, node:test or Rstest.
---

# Installation

Install the package as a dev dependency:

```bash
npm i -D vitest-auto-spy
```

On Vitest nothing else is required: import `createSpyFromClass` in a spec and it works. The package
has no runtime dependencies. For your first spec, follow [Getting started](./introduction).

## What you need

Your project provides the packages below. Each one is optional: install it only if you use the entry
point that needs it.

| Peer                        | Needed for                                                                        | Version  |
| --------------------------- | --------------------------------------------------------------------------------- | -------- |
| `vitest`                    | the default entry `vitest-auto-spy` and every Vitest-only entry                   | `>=2.1`  |
| `rxjs`                      | Observable spies from `vitest-auto-spy/rxjs`; rxjs 8 works too                    | `>=7.2`  |
| `@angular/core`             | `vitest-auto-spy/angular` and `vitest-auto-spy/bun-angular`                       | `>=20`   |
| `@angular/common`           | `vitest-auto-spy/angular-http` only                                               | `>=20`   |
| `@angular/router`           | `vitest-auto-spy/angular-router` only                                             | `>=20`   |
| `@angular/forms`            | `vitest-auto-spy/signal-forms` only (signal forms exist from Angular 22)          | `>=20`   |
| `@angular/platform-browser` | the directive matchers in `vitest-auto-spy/angular/matchers`, and the Bun preload | `>=20`   |
| `@angular/compiler`         | `vitest-auto-spy/angular/matchers` and the `vitest-auto-spy/bun-angular` preload  | `>=20`   |
| `@rstest/core`              | `vitest-auto-spy/rstest` only                                                     | `>=0.11` |

| Tool       | Minimum                                                          |
| ---------- | ---------------------------------------------------------------- |
| Node.js    | 22                                                               |
| Vitest     | 2.1                                                              |
| Angular    | 20 for the Angular entry points, 22 for `/signal-forms`          |
| Bun        | 1.4 for `vitest-auto-spy/bun-angular`; any recent Bun for `/bun` |
| TypeScript | 4.7 for the typed helpers; plain JavaScript works without types  |

Why each minimum is what it is: [Compatibility](./compatibility).

## Wiring it up

Pick the section for how you run tests. Each one ends with the command that runs them.

### Angular CLI (`ng test`)

Projects on Angular's `@angular/build:unit-test` builder run Vitest through `ng test`. The builder
sets up `TestBed` itself, and a new Angular CLI project already has `vitest` and `rxjs`. You add a
setup file only for two optional features:

- **Observable spies**: `nextWith` and the other helpers for methods that return an `Observable`;
- **checks between tests**: `setupAutoSpy()` undoes globals a test patched and flags what a test
  left running, such as timers or console output.

1. Create the setup file:

   ```ts
   // src/test-setup.ts
   // Observable spies; leave out if you do not need them
   import 'vitest-auto-spy/rxjs';

   // checks between tests
   import { setupAutoSpy } from 'vitest-auto-spy/setup';

   setupAutoSpy();
   ```

2. List it in the test target:

   ```jsonc
   // angular.json → projects → <your-app> → architect → test
   "test": {
     "builder": "@angular/build:unit-test",
     "options": {
       // keep the options already here and add this line
       // the path is relative to the workspace root
       "setupFiles": ["src/test-setup.ts"]
     }
   }
   ```

3. Run the tests:

   ```bash
   ng test
   ```

- Do not call `TestBed.initTestEnvironment()` in this file: the builder already did, and a second call
  throws `Cannot set base providers because it has already been called`. (Rare case: if one file
  serves both `ng test` and plain `vitest`, guard that call with `isAngularUnitTestBuilder()` from
  `vitest-auto-spy/setup`.)
- Keep `import 'vitest-auto-spy/rxjs'` in the setup file, not in another `.ts` file. From `@angular/build` 22.2 the builder
  does not compile other helper files, even ones listed in `tsconfig.spec.json`. The setup file needs
  no `tsconfig` entry.

Every check of `setupAutoSpy()` and its default is listed on [Test-run hygiene](../utilities/setup).
To check that everything works, run the spec from [Getting started](./introduction). The next page,
[Angular](../adapters/angular), shows
`provideAutoSpy` and `injectSpy` in a `TestBed` spec.

### Vitest

No setup is required: `import { createSpyFromClass } from 'vitest-auto-spy'` in a spec is enough.
Add a setup file only for things that are global by nature, such as Observable spies and checks
between tests:

```ts
// vitest.setup.ts
// Observable spies, once for every spec
import 'vitest-auto-spy/rxjs';

// checks between tests
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy();
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

```bash
npx vitest
```

`setupAutoSpy()` matters most when spec files share one environment (`isolate: false`). There a
patched global that was never restored leaks into the next file. See
[Test-run hygiene](../utilities/setup).

Angular with Vitest but without `ng test` (for example, with Analog's Vite plugin) needs your usual
`TestBed` setup file. If `injectSpy` then says `TestBed` is not initialized, see
[Two copies of the Angular testing module](#two-copies-of-the-angular-testing-module).

### Bun

```ts
// user.test.ts
import { describe, expect, it } from 'bun:test';
import { createSpyFromClass } from 'vitest-auto-spy/bun';
```

```bash
bun test
```

Bun's version of a setup file is a preload:

```toml
# bunfig.toml
[test]
preload = ["./bun-setup.ts"]
```

Angular under `bun test` has its own entry point and preload: see
[Angular on Bun](/runtimes/bun-angular). Bun's `--isolate`, `--parallel`, `--shard`, `--changed` and
`--timings` flags work unchanged; [Bun](/runtimes/bun) explains what each means for your spies.

### node:test

```ts
// user.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSpyFromClass } from 'vitest-auto-spy/node';
```

```bash
node --test
```

`node:test` has no `expect`. Use `node:assert`, as above, or any assertion library; the spies work
the same way.

### Rstest

```bash
npm i -D @rstest/core vitest-auto-spy
```

```ts
// user.test.ts
import { describe, expect, it } from '@rstest/core';
import { createSpyFromClass } from 'vitest-auto-spy/rstest';
```

```bash
npx rstest run
```

With `globals: true` in the config, the `rs` / `rstest` globals replace the first import. Rstest's
mocks look like Vitest's (`mock.calls`, `mockReturnValue`), so the
[Control helpers](./control-helpers) page applies as written. See [Rstest](/runtimes/rstest).

## Entry points

An entry point is the import path you pick for your runner or framework. Importing it also connects
the library to that runner's mock function. Import the one that matches your runner: importing
`vitest-auto-spy` in a `bun test` run connects the wrong one.

| Import                                | Gives you                                                                                                                                                                                                                                                                 | Needs                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `vitest-auto-spy`                     | the core: `createSpyFromClass`, `createAutoMock`, `mockDeep`, `createMock`, `createFixture` / `createFixtureFactory`, `createFunctionSpy`, the `mock*Prop` helpers, [Observable assertions](./observable-assertions), [type bridges](./spy-typing), `errorHandler`, types | `vitest`                                                 |
| `vitest-auto-spy/bun`                 | the same core on Bun's `bun:test` mocks                                                                                                                                                                                                                                   | `bun:test`                                               |
| `vitest-auto-spy/bun-angular`         | Angular's `TestBed` under `bun test`: DOM, `templateUrl` loading and a zoneless environment from one preload, plus the core and the Angular helpers                                                                                                                       | `bun:test`, `@angular/core`, `@angular/platform-browser` |
| `vitest-auto-spy/node`                | the same core on `node:test`'s `mock.fn()`                                                                                                                                                                                                                                | `node:test`                                              |
| `vitest-auto-spy/rstest`              | the same core on Rstest's `rstest.fn()` / `rstest.spyOn()`; see [Rstest](../runtimes/rstest)                                                                                                                                                                              | `@rstest/core`                                           |
| `vitest-auto-spy/rxjs`                | Observable spies (`nextWith`, `nextWithValues`, `observablePropsToSpyOn`, …) and `createObservableWithValues`                                                                                                                                                             | `rxjs`                                                   |
| `vitest-auto-spy/dom-stubs`           | stand-ins for browser globals a component creates itself: `stubIntersectionObserver`, `stubResizeObserver`, `stubMutationObserver`, `stubObserver`, `stubMediaElement`, `stubAbortController`, `stubAnimationFrame`, `stubElementRect` and the entry builders             | —                                                        |
| `vitest-auto-spy/diagnostics`         | `compareTestRuns`, `summarizeTestRun`, `formatTestRunComparison` and `diffByField`; plain functions, usable from a Node script too                                                                                                                                        | —                                                        |
| `vitest-auto-spy/angular`             | `provideAutoSpy`, `injectSpy` and its `Spy<T>` type, `renderShallow`, `createWithAutoSpies`, `stable` / `flushEffects`, the `mock*Prop` helpers                                                                                                                           | `@angular/core`                                          |
| `vitest-auto-spy/angular/diagnostics` | `enableAngularDiagnostics` and the `TestBed` timing helpers                                                                                                                                                                                                               | `@angular/core`                                          |
| `vitest-auto-spy/angular/doubles`     | the Material dialog stand-ins and the `Window` / `Document` stand-ins; connects the Vitest mock function on import                                                                                                                                                        | `@angular/core`                                          |
| `vitest-auto-spy/angular/matchers`    | `registerDirectiveMatchers`, `registerResourceMatchers`, `registerSignalMatchers`; call each once from the setup file                                                                                                                                                     | `@angular/core`, `@angular/platform-browser`             |
| `vitest-auto-spy/angular-http`        | [`httpResource()` and `HttpClient` in a spec](../adapters/angular-http): `provideHttpTesting`, `expectRequest`, `expectNoRequest`                                                                                                                                         | `@angular/common`, `@angular/core`                       |
| `vitest-auto-spy/angular-router`      | [an `ActivatedRoute` and a `Router` whose values agree](../adapters/angular-router): `provideActivatedRoute`, `injectActivatedRoute`, `provideRouterDouble`                                                                                                               | `@angular/router`, `@angular/core`, `rxjs`               |
| `vitest-auto-spy/signal-forms`        | [Angular signal forms in a spec](../adapters/signal-forms): `createForm` and `registerFormMatchers()` for `toHaveFieldErrors`                                                                                                                                             | `@angular/forms`, `@angular/core`                        |
| `vitest-auto-spy/nestjs`              | `provideAutoSpy`, `injectSpy` for `Test.createTestingModule`                                                                                                                                                                                                              | — (your `@nestjs/*`)                                     |
| `vitest-auto-spy/react`               | the core, under a name that reads naturally in React Testing Library specs                                                                                                                                                                                                | — (your `react`)                                         |
| `vitest-auto-spy/vue`                 | `provideAutoSpy` for `global.provide`, plus Pinia store spies                                                                                                                                                                                                             | — (your `vue` / `pinia`)                                 |
| `vitest-auto-spy/svelte`              | the core, under a name that reads naturally in Svelte specs                                                                                                                                                                                                               | — (your `svelte`)                                        |
| `vitest-auto-spy/console`             | [console spies](../utilities/console): silent typed spies over the global `console`                                                                                                                                                                                       | `vitest`                                                 |
| `vitest-auto-spy/jasmine`             | [the `jasmine-auto-spies` API](../migrating-jasmine): `.and` / `.calls` / `.withArgs` on every spy, `createSpyObj`, the `jasmine` namespace, `registerJasmineMatchers`                                                                                                    | `vitest`                                                 |
| `vitest-auto-spy/jasmine-compat`      | `enableJasmineCompat()` alone: the same `.and` / `.calls` layer for `bun test` and `node --test`                                                                                                                                                                          | — (your runner)                                          |
| `vitest-auto-spy/setup`               | [`setupAutoSpy()`](../utilities/setup) and [`setupFakeTimers()`](../utilities/fake-timers)                                                                                                                                                                                | `vitest`                                                 |
| `vitest-auto-spy/observer-spy`        | [`subscribeSpyTo`](../runtimes/rxjs#subscribespyto-for-a-suite-arriving-with-observer-spy), the `@hirez_io/observer-spy` API                                                                                                                                              | `rxjs`                                                   |
| `vitest-auto-spy/zone`                | [the zone patch](../utilities/zone) that makes Angular's `fakeAsync` work under Vitest                                                                                                                                                                                    | `vitest`, `zone.js`                                      |
| `vitest-auto-spy/eslint-plugin`       | [lint rules](../utilities/eslint-plugin) that point specs to these helpers                                                                                                                                                                                                | — (your `eslint`)                                        |
| `vitest-auto-spy/perf-reporter`       | the Vitest reporter that [`npx vitest-auto-spy perf`](../utilities/cli) uses, for a `reporters` list                                                                                                                                                                      | `vitest`                                                 |

A project without Angular or rxjs never loads either: they come only with the entries that name them.

`vitest-auto-spy/angular` adds to the root entry; it does not replace it. Of the root's exports it
re-exports only the `Spy<T>` type, the `mock*Prop` helpers with `restoreMockedProps` and
`countMockedProps`, the `expectEmission` family and `registerAutoSpyDefaults` /
`clearAutoSpyDefaults`. `createSpyFromClass`, `createMock`, `createAutoMock`, `asInstance` and the
rest come from `vitest-auto-spy`, so an Angular spec that needs one imports from both:

```ts
import { createAutoMock } from 'vitest-auto-spy';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';
```

`vitest-auto-spy/bun-angular` is different: it is a runner entry and re-exports the whole core.

`vitest-auto-spy/jasmine` works on Vitest only, because it imports `vitest`. On `bun test` and
`node --test`, call `enableJasmineCompat()` from `vitest-auto-spy/jasmine-compat` once in the setup
file instead. It works with whichever runner entry you already import.

**Common mistake:** a spy built before any entry point is imported fails with
`No mock adapter registered`. The message names the runner it detected and the import to add.

## TypeScript

The typed helpers need no extra setup. Your `tsconfig.json` needs a module resolution that
understands subpath imports such as `vitest-auto-spy/angular`:

```jsonc
{
  "compilerOptions": {
    // "bundler", "node16" or "nodenext"
    "moduleResolution": "bundler",
  },
}
```

If you use Observable spies, TypeScript must see the file with `import 'vitest-auto-spy/rxjs'`;
otherwise the Observable helpers are typed loosely. The setup file from
[Wiring it up](#wiring-it-up) already counts: both `ng test` and Vitest compile it.

`Spy<T>` is not assignable to `T`, because it leaves out `private` and `#private` members. Declare the
variable as `Spy<T>`, or convert with [`asInstance` / `asSpy`](./spy-typing).

## Troubleshooting

### Two copies of the Angular testing module

**Symptom:** `injectSpy` fails with `Need to call TestBed.initTestEnvironment() first`, although your
setup file initializes `TestBed`. Another form is `Cannot read properties of null (reading 'ngModule')`.

**Cause:** Vitest loaded `vitest-auto-spy` from `node_modules` without processing it. Node then loaded
a second copy of `@angular/core/testing`, and the package talks to the copy nobody initialized. This
happens mostly with Analog's Vite plugin, not with `ng test`.

**Fix:** tell Vitest to process the package with your code, so both share one copy:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { server: { deps: { inline: ['vitest-auto-spy'] } } } });
```

`injectSpy` and `renderShallow` print this hint in their error.
[`npx vitest-auto-spy doctor`](../utilities/cli#angular-testbed-split) finds such a config before
you run the tests.
