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

| Import                          | Provides                                                                                                                                                                                                        | Pulls in               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `vitest-auto-spy`               | `createSpyFromClass`, `createAutoMock`, `mockDeep`, `createFunctionSpy`, the `mock*Prop` helpers, the [observable assertions](./observable-assertions), the [type bridges](./spy-typing), `errorHandler`, types | `vitest`               |
| `vitest-auto-spy/bun`           | the same core, driven by Bun's `bun:test` mocks                                                                                                                                                                 | `bun:test`             |
| `vitest-auto-spy/node`          | the same core, driven by `node:test`'s `mock.fn()`                                                                                                                                                              | `node:test`            |
| `vitest-auto-spy/rxjs`          | observable spies (`nextWith`, `nextWithValues`, `observablePropsToSpyOn`, …) + `createObservableWithValues`                                                                                                     | `rxjs`                 |
| `vitest-auto-spy/angular`       | `provideAutoSpy`, `injectSpy`, `renderShallow`, `createWithAutoSpies`, `stable`/`flushEffects`, signal matchers, TestBed diagnostics, the `mock*Prop` helpers                                                   | `@angular/core`        |
| `vitest-auto-spy/nestjs`        | `provideAutoSpy`, `injectSpy` for `Test.createTestingModule`                                                                                                                                                    | — (your `@nestjs/*`)   |
| `vitest-auto-spy/react`         | the core, with a natural import for React Testing Library suites                                                                                                                                                | — (your `react`)       |
| `vitest-auto-spy/vue`           | `provideAutoSpy` for `global.provide` + Pinia store spying                                                                                                                                                      | — (your `vue`/`pinia`) |
| `vitest-auto-spy/svelte`        | the core, with a natural import for Svelte suites                                                                                                                                                               | — (your `svelte`)      |
| `vitest-auto-spy/console`       | [console spies](../utilities/console) — silent typed spies over the global `console`                                                                                                                            | `vitest`               |
| `vitest-auto-spy/setup`         | [`setupAutoSpy()`](../utilities/setup) — property restore, duplicate-copy detection and mock-registry hygiene                                                                                                   | `vitest`               |
| `vitest-auto-spy/eslint-plugin` | [the lint rules](../utilities/eslint-plugin) that steer a suite onto these helpers                                                                                                                              | — (your `eslint`)      |

```ts
import { createSpyFromClass } from 'vitest-auto-spy';
// once (e.g. in your test setup) — enables observable spies
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';
import 'vitest-auto-spy/rxjs';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

// once, in your setup file
```

Each entry registers its mock adapter on import, so import the one matching your test runner.
See [Runtimes](/runtimes/vitest) for the runner-specific entries.

<!-- TODO: expand — add a Bun/node:test-specific install note and any tsconfig/vitest.config wiring tips. -->
