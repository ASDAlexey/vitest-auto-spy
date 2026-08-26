---
title: Installation
description: Install vitest-auto-spy, pick the entry point that matches your runner, and wire it into Vitest, Bun or node:test.
---

# Installation

```bash
npm i -D vitest-auto-spy
```

Peer dependencies are all **provided by your project**; `rxjs` and `@angular/core` are **optional**
— install them only for the matching entry point. The package itself has **zero runtime
dependencies**.

| Peer            | Needed for                                                                  | Optional? |
| --------------- | --------------------------------------------------------------------------- | --------- |
| `vitest`        | the default runner                                                          | no        |
| `rxjs`          | `vitest-auto-spy/rxjs` observable spies — `>=7`, no upper bound (rxjs 8 too) | yes       |
| `@angular/core` | `vitest-auto-spy/angular` and `vitest-auto-spy/bun-angular` helpers          | yes       |

| Tool       | Minimum                                                          |
| ---------- | ---------------------------------------------------------------- |
| Node.js    | ≥ 18                                                             |
| Vitest     | ≥ 1.0                                                            |
| Bun        | ≥ 1.4 for `vitest-auto-spy/bun-angular`; any recent Bun for `/bun` |
| TypeScript | ≥ 4.7 for the typed helpers (plain JS works too, just untyped)   |

Ships **dual ESM + CommonJS** with bundled `.d.ts` types, so it drops into both `import`- and
`require`-style setups. The one exception is `vitest-auto-spy/bun-angular`, which is **ESM-only**
(it awaits its DOM registrar at the top level, and top-level `await` has no CommonJS form).

## Entry points

The library ships a framework-agnostic core plus runtime and framework layers, so a plain
Node / Bun / React / Vue project pulls **neither rxjs nor Angular into its runtime bundle**:

| Import                          | Provides                                                                                                                                                                                                        | Pulls in                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `vitest-auto-spy`               | `createSpyFromClass`, `createAutoMock`, `mockDeep`, `createMock`, `createFunctionSpy`, the `mock*Prop` helpers, the [observable assertions](./observable-assertions), the [type bridges](./spy-typing), `errorHandler`, types | `vitest`                    |
| `vitest-auto-spy/bun`           | the same core, driven by Bun's `bun:test` mocks                                                                                                                                                                 | `bun:test`                  |
| `vitest-auto-spy/bun-angular`   | Angular's `TestBed` under `bun test` — DOM, JIT `templateUrl` resolution and a zoneless environment from one preload, plus the core and the Angular helpers                                                     | `bun:test`, `@angular/core` |
| `vitest-auto-spy/node`          | the same core, driven by `node:test`'s `mock.fn()`                                                                                                                                                              | `node:test`                 |
| `vitest-auto-spy/rxjs`          | observable spies (`nextWith`, `nextWithValues`, `observablePropsToSpyOn`, …) + `createObservableWithValues`                                                                                                     | `rxjs`                      |
| `vitest-auto-spy/angular`       | `provideAutoSpy`, `injectSpy`, `renderShallow`, `createWithAutoSpies`, `stable`/`flushEffects`, signal matchers, TestBed diagnostics, the `mock*Prop` helpers                                                   | `@angular/core`             |
| `vitest-auto-spy/nestjs`        | `provideAutoSpy`, `injectSpy` for `Test.createTestingModule`                                                                                                                                                    | — (your `@nestjs/*`)        |
| `vitest-auto-spy/react`         | the core, with a natural import for React Testing Library suites                                                                                                                                                | — (your `react`)            |
| `vitest-auto-spy/vue`           | `provideAutoSpy` for `global.provide` + Pinia store spying                                                                                                                                                      | — (your `vue`/`pinia`)      |
| `vitest-auto-spy/svelte`        | the core, with a natural import for Svelte suites                                                                                                                                                               | — (your `svelte`)           |
| `vitest-auto-spy/console`       | [console spies](../utilities/console) — silent typed spies over the global `console`                                                                                                                            | `vitest`                    |
| `vitest-auto-spy/setup`         | [`setupAutoSpy()`](../utilities/setup) and [`setupFakeTimers()`](../utilities/fake-timers)                                                                                                                      | `vitest`                    |
| `vitest-auto-spy/eslint-plugin` | [the lint rules](../utilities/eslint-plugin) that steer a suite onto these helpers                                                                                                                              | — (your `eslint`)           |

Each entry registers its mock adapter **on import**, so import the one matching your test runner —
mixing `vitest-auto-spy` into a `bun test` run leaves the wrong adapter installed.

## Wiring it up

### Vitest

Zero-config: `import { createSpyFromClass } from 'vitest-auto-spy'` in a spec is enough. A setup
file is only needed for things that are global by nature — the rxjs layer and run hygiene:

```ts
// vitest.setup.ts
import 'vitest-auto-spy/rxjs'; // once — enables observable spies everywhere
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

## TypeScript

The typed helpers need nothing beyond a normal setup, with one thing worth knowing: **the `Spy<T>`
type surface references rxjs types even when you never import the rxjs layer.** Keep `rxjs`
installed for type-checking — it is normally already a devDependency — and none of it reaches your
runtime bundle.

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
