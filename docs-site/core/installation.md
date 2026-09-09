---
title: Installation
description: Install vitest-auto-spy, pick the entry point that matches your runner, and wire it into Vitest, Bun, node:test or Rstest.
---

# Installation

```bash
npm i -D vitest-auto-spy
```

::: tip The plural name is an alias
[`vitest-auto-spies`](https://www.npmjs.com/package/vitest-auto-spies) is a thin alias package that
re-exports this one, entry point for entry point — a typo installs the same code. Prefer the
singular name; the alias is generated from it and only ever follows it.
:::

Peer dependencies are all **provided by your project**; `rxjs` and the three `@angular/*` packages
are **optional** — install them only for the matching entry point. The package itself has **zero
runtime dependencies**.

| Peer                        | Needed for                                                                                        | Optional? |
| --------------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| `vitest`                    | the default runner                                                                                | no        |
| `rxjs`                      | `vitest-auto-spy/rxjs` observable spies — `>=7.2`, no upper bound (rxjs 8 too)                    | yes       |
| `@angular/core`             | `vitest-auto-spy/angular` and `vitest-auto-spy/bun-angular` helpers — `>=20`                      | yes       |
| `@angular/common`           | `vitest-auto-spy/angular-http` — `>=20`, this entry only                                          | yes       |
| `@angular/platform-browser` | `By` and the directive matchers on `vitest-auto-spy/angular`, the Bun preload's platform — `>=20` | yes       |

| Tool       | Minimum                                                                  |
| ---------- | ------------------------------------------------------------------------ |
| Node.js    | ≥ 22 — 18 and 20 are EOL; CI exercises 22, 24 and 26                     |
| Vitest     | ≥ 2.1                                                                    |
| Angular    | ≥ 20 for the Angular entry points — nothing else in the package needs it |
| Bun        | ≥ 1.4 for `vitest-auto-spy/bun-angular`; any recent Bun for `/bun`       |
| TypeScript | ≥ 4.7 for the typed helpers (plain JS works too, just untyped)           |

Vitest **≥ 2.1** because the typed `spy.method.mock.settledResults` surface is Vitest's own `Mock`
type, and `@vitest/spy` only grew `settledResults` in 2.0 — 2.1 is where the 2.x line actually sits.
The runtime helpers themselves still run on older Vitest (the library polyfills `settledResults` for
`bun:test` and `node:test` regardless), but the types no longer line up there, so the range stops
claiming it.

**rxjs ≥ 7.2**, and the number moved because an import specifier did. The observable layer builds its
subjects out of six operators — `concatMap`, `delay`, `switchMap`, `take`, `takeUntil`, `takeWhile` —
and it took them from `rxjs/operators`, the legacy deep path. **rxjs 8 removes that path entirely**,
so the old open-ended `>=7.0.0` promised a version the code could not have served. They now come
from the root `rxjs` entry, which is where rxjs re-exported them in **7.2** — verified against rxjs
7.2.0's own `dist/types/index.d.ts` rather than its release notes. `firstValueFrom`, the reason the
floor used to read 7.0, is untouched; 7.2 is just the first version where every symbol this package
imports exists at the specifier it imports it from. Every Angular major from 16 to 22 peers on
`^6.5.3 || ^7.4.0` already, so only a project pinning `rxjs@7.0` or `7.1` has anything to do.

Angular **≥ 20** on the Angular entry points, and two symbols the shipped code imports **as
values** are what set the number. A value import that is missing is a link error — the entry never
loads, so the symptom is not one unavailable helper:

- **`ɵSIGNAL` exists from Angular 18.** `runEffect()` reads it, and the import sits on the first
  line of the `/angular` bundle, eagerly. On Angular 16 or 17 the entry fails to link and
  `provideAutoSpy`, `injectSpy` and everything beside them are gone with it — not just `runEffect`.
- **`provideZonelessChangeDetection` exists from Angular 20.** In 18 and 19 the same function was
  called `provideExperimentalZonelessChangeDetection`; in 16 and 17 there was nothing. The
  `vitest-auto-spy/bun-angular` preload imports it by name, so below 20 `bun test` dies while
  loading the preload, before the first spec file.

Angular 20 is also the oldest Angular that Angular itself still supports — six months active plus
twelve months LTS put 19 past end of life on **2026-05-19**, and 18, 17 and 16 before that. The
technical floor and the supported floor are the same number, so the range gives up nothing that was
still getting fixes; before this major it read `>=16.0.0`, which was a promise for versions where
the main entry could not link. There is deliberately **no upper bound**: one would force a release
for every Angular major and hand `ERESOLVE` to anyone who upgraded first.

`@angular/platform-browser` is declared here for the first time. `vitest-auto-spy/angular` has
always imported `By` from it as a value — the directive matchers are built on it — and the Bun
preload boots through `platformBrowserTesting()`. Under npm's hoisted `node_modules` it resolved by
accident, because every Angular workspace has it; under pnpm's isolated layout it did not resolve at
all. Declaring it turns the accident into a contract.

Node **≥ 22** is the floor. Node 18 and 20 are both past end-of-life, and every runner in the
supported range already needs more than either: Vitest 4 declares `^20.0.0 || ^22.0.0 || >=24.0.0`,
and the Vite 7 it pulls is stricter still, at `^20.19.0 || >=22.12.0` — on Node 18 the run dies with
`TypeError: crypto.hash is not a function` before a single spec loads. Vitest 5 tightens further, to
`^22.12.0 || ^24.0.0 || >=26.0.0`. CI exercises Node 22, 24 and 26; the published output is still
ES2022. Which of the three to actually run — and what it costs — is measured in [Performance → Which
Node version](./performance#which-node-version).

Ships **ESM with bundled `.d.ts` types**. Two subpaths additionally ship a CommonJS build —
`vitest-auto-spy/node` (a `node --test` suite written in CJS) and `vitest-auto-spy/eslint-plugin`
(loaded by a CommonJS `eslint.config.cjs`). Everything else is ESM-only, because a `require()` of it
could never have worked: Vitest itself refuses to be required (`Vitest cannot be imported in a
CommonJS module using require()`), so every Vitest-backed entry threw on the first line of its own
`.cjs`. Test runners load ESM natively, so nothing is lost — and dropping the unreachable output cut
the published package roughly in half.

## Entry points

The library ships a framework-agnostic core plus runtime and framework layers, so a plain
Node / Bun / React / Vue project pulls **neither rxjs nor Angular into its runtime bundle** — and,
since 4.0.0, into its TypeScript program either:

| Import                           | Provides                                                                                                                                                                                                                                                                | Pulls in                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `vitest-auto-spy`                | `createSpyFromClass`, `createAutoMock`, `mockDeep`, `createMock`, `createFixture` / `createFixtureFactory`, `createFunctionSpy`, the `mock*Prop` helpers, the [observable assertions](./observable-assertions), the [type bridges](./spy-typing), `errorHandler`, types | `vitest`                                                 |
| `vitest-auto-spy/bun`            | the same core, driven by Bun's `bun:test` mocks                                                                                                                                                                                                                         | `bun:test`                                               |
| `vitest-auto-spy/bun-angular`    | Angular's `TestBed` under `bun test` — DOM, JIT `templateUrl` resolution and a zoneless environment from one preload, plus the core and the Angular helpers                                                                                                             | `bun:test`, `@angular/core`, `@angular/platform-browser` |
| `vitest-auto-spy/node`           | the same core, driven by `node:test`'s `mock.fn()`                                                                                                                                                                                                                      | `node:test`                                              |
| `vitest-auto-spy/rstest`         | the same core, driven by Rstest's `rstest.fn()` / `rstest.spyOn()` — [the Rstest runner](../runtimes/rstest)                                                                                                                                                            | `@rstest/core`                                           |
| `vitest-auto-spy/rxjs`           | observable spies (`nextWith`, `nextWithValues`, `observablePropsToSpyOn`, …) and `createObservableWithValues`                                                                                                                                                           | `rxjs`                                                   |
| `vitest-auto-spy/dom-stubs`      | the globals a component builds for itself — `stubIntersectionObserver`, `stubResizeObserver`, `stubMutationObserver`, `stubObserver`, `stubMediaElement`, `stubAbortController` and the entry builders. On the root entry until 4.0.0                                   | —                                                        |
| `vitest-auto-spy/diagnostics`    | `compareTestRuns` / `summarizeTestRun` / `formatTestRunComparison` and `diffByField` — the two reports a counter cannot give. On the root entry until 4.0.0; pure functions, so this one can be imported from a plain Node script too                                   | —                                                        |
| `vitest-auto-spy/angular`        | `provideAutoSpy`, `injectSpy`, `renderShallow`, `createWithAutoSpies`, `stable`/`flushEffects`, signal matchers, TestBed diagnostics, the `mock*Prop` helpers                                                                                                           | `@angular/core`, `@angular/platform-browser`             |
| `vitest-auto-spy/nestjs`         | `provideAutoSpy`, `injectSpy` for `Test.createTestingModule`                                                                                                                                                                                                            | — (your `@nestjs/*`)                                     |
| `vitest-auto-spy/react`          | the core, with a natural import for React Testing Library suites                                                                                                                                                                                                        | — (your `react`)                                         |
| `vitest-auto-spy/vue`            | `provideAutoSpy` for `global.provide` + Pinia store spying                                                                                                                                                                                                              | — (your `vue`/`pinia`)                                   |
| `vitest-auto-spy/svelte`         | the core, with a natural import for Svelte suites                                                                                                                                                                                                                       | — (your `svelte`)                                        |
| `vitest-auto-spy/console`        | [console spies](../utilities/console) — silent typed spies over the global `console`                                                                                                                                                                                    | `vitest`                                                 |
| `vitest-auto-spy/jasmine`        | [the drop-in surface for a `jasmine-auto-spies` suite](../migrating-jasmine) — `.and` / `.calls` / `.withArgs` on every spy, `createSpyObj`, the `jasmine` namespace, `registerJasmineMatchers`                                                                         | `vitest`                                                 |
| `vitest-auto-spy/setup`          | [`setupAutoSpy()`](../utilities/setup) and [`setupFakeTimers()`](../utilities/fake-timers)                                                                                                                                                                              | `vitest`                                                 |
| `vitest-auto-spy/jasmine-compat` | `enableJasmineCompat()` alone — the same `.and` / `.calls` layer, registering no adapter, for `bun test` and `node --test`                                                                                                                                              | — (your runner)                                          |
| `vitest-auto-spy/observer-spy`   | [`subscribeSpyTo`](../runtimes/rxjs#subscribespyto-for-a-suite-arriving-with-observer-spy) — the `@hirez_io/observer-spy` surface                                                                                                                                       | `rxjs`                                                   |
| `vitest-auto-spy/zone`           | [the zone patch](../utilities/zone) that makes Angular's `fakeAsync` work under Vitest                                                                                                                                                                                  | `vitest`, `zone.js`                                      |
| `vitest-auto-spy/eslint-plugin`  | [the lint rules](../utilities/eslint-plugin) that steer a suite onto these helpers                                                                                                                                                                                      | — (your `eslint`)                                        |

Each entry registers its mock adapter **on import**, so import the one matching your test runner —
mixing `vitest-auto-spy` into a `bun test` run leaves the wrong adapter installed.

`vitest-auto-spy/jasmine` is Vitest-only for that reason — it registers the Vitest adapter, which
means importing `vitest`. On `bun test` and `node --test`, call `enableJasmineCompat()` from
`vitest-auto-spy/jasmine-compat` once in the setup file instead; it registers no adapter, so it
composes with whichever runtime entry you already import.

## Wiring it up

### Vitest

Zero-config: `import { createSpyFromClass } from 'vitest-auto-spy'` in a spec is enough. A setup
file is only needed for things that are global by nature — the rxjs layer and run hygiene:

```ts
// vitest.setup.ts
import 'vitest-auto-spy/rxjs';
// once — enables observable spies everywhere
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy();
```

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

`setupAutoSpy()` matters most when the suite shares one environment (`isolate: false`), where an
un-restored property patch outlives the file that made it. See
[Test-run hygiene](../utilities/setup).

### Bun

```ts
// user.test.ts
import { describe, expect, it } from 'bun:test';
import { createSpyFromClass } from 'vitest-auto-spy/bun';
```

```bash
bun test
```

For the equivalent of a Vitest setup file, use a preload:

```toml
# bunfig.toml
[test]
preload = ["./bun-setup.ts"]
```

Angular under `bun test` has its own entry and its own preload — see
[Angular on Bun](/runtimes/bun-angular). Bun 1.4's `--isolate`, `--parallel`, `--shard`,
`--changed` and `--timings` all work unchanged; [Bun](/runtimes/bun) covers what each one means for
your spies.

### node:test

```ts
// user.test.ts
import { describe, it } from 'node:test';
import { createSpyFromClass } from 'vitest-auto-spy/node';
```

```bash
node --test
```

`node:test` has no `expect`; pair it with `node:assert` (or any assertion library) — the spy surface
is the same either way.

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

With `globals: true` in the config the `rs` / `rstest` globals replace that first import line. The
native mock surface is Vitest-shaped — bare-array `mock.calls`, the `mockReturnValue` family — so
[Control helpers](./control-helpers) read the same as on Vitest. See [Rstest](/runtimes/rstest).

## TypeScript

The typed helpers need nothing beyond a normal setup. Since **4.0.0** that includes rxjs: no
declaration this package ships names an rxjs type, so a project without rxjs neither installs it nor
loads it into the TypeScript program — 189 rxjs `.d.ts` files that used to arrive with every
`import { createSpyFromClass }`. Before 4.0.0 `rxjs` had to be installed for type-checking even in a
suite that never touched an observable.

If you _do_ use the observable layer, `import 'vitest-auto-spy/rxjs'` has to sit in a file this
`tsconfig` includes as well as in the runtime setup — that import is what makes `returnSubject()`
rxjs's own `Subject<T>` rather than the structural `SubjectLike<T>`. See
[Upgrading to 4.0](/upgrading-4).

```jsonc
{
  "compilerOptions": {
    // "bundler" or "node16"/"nodenext" — anything that understands `exports` subpaths
    "moduleResolution": "bundler",
  },
}
```

`Spy<T>` is a **mapped type**: it drops `#private` and `private` members, so it is not assignable
to `T`. Declare the variable as `Spy<T>` rather than as `T`, or bridge the two with
[`asInstance` / `asSpy`](./spy-typing).
