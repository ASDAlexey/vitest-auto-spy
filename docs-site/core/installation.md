# Installation

```bash
npm i -D vitest-auto-spy
```

Peer dependencies are all **optional** and provided by your project: `vitest` (required), plus
`rxjs` and `@angular/core` only if you use the matching entry point. The package itself has
**zero runtime dependencies**.

## Entry points

The library ships a framework-agnostic core plus runtime and framework layers, so a plain
Node / Bun / React / Vue project pulls **neither rxjs nor Angular into its runtime bundle**:

| Import | Provides | Pulls in |
| --- | --- | --- |
| `vitest-auto-spy` | `createSpyFromClass`, `createFunctionSpy`, sync + promise + accessor spies, `errorHandler`, types | `vitest` |
| `vitest-auto-spy/bun` | the same core, driven by Bun's `bun:test` mocks | `bun:test` |
| `vitest-auto-spy/node` | the same core, driven by `node:test`'s `mock.fn()` | `node:test` |
| `vitest-auto-spy/rxjs` | observable spies (`nextWith`, `nextWithValues`, `observablePropsToSpyOn`, …) + `createObservableWithValues` | `rxjs` |
| `vitest-auto-spy/angular` | `provideAutoSpy`, `injectSpy`, `mockReadonlyProp*`, `mockAccessorsProp` | `@angular/core` |

```ts
import { createSpyFromClass } from 'vitest-auto-spy';
import 'vitest-auto-spy/rxjs'; // once (e.g. in your test setup) — enables observable spies
import { provideAutoSpy, injectSpy } from 'vitest-auto-spy/angular';
```

Each entry registers its mock adapter on import, so import the one matching your test runner.
See [Runtimes](/runtimes/vitest) for the runner-specific entries.

<!-- TODO: expand — add a Bun/node:test-specific install note and any tsconfig/vitest.config wiring tips. -->
