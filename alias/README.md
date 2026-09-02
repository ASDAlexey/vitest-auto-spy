# vitest-auto-spies

> **This is an alias.** The real package is **[`vitest-auto-spy`](https://www.npmjs.com/package/vitest-auto-spy)** (singular).
> This package simply re-exports it, so `vitest-auto-spies` and `vitest-auto-spy` are the same code.

**Auto-generate fully-typed test spies from a class — across Vitest, Bun and `node:test`, with
RxJS / Angular / NestJS / React / Vue / Svelte recipes.** A drop-in replacement for
[`jest-auto-spies`](https://www.npmjs.com/package/jest-auto-spies) and, through the `/jasmine`
subpath, for [`jasmine-auto-spies`](https://www.npmjs.com/package/jasmine-auto-spies).

## Install

Prefer the canonical name:

```bash
npm install -D vitest-auto-spy
```

…or install this alias — identical API:

```bash
npm install -D vitest-auto-spies
```

## Usage

```ts
import { type Spy, createSpyFromClass } from 'vitest-auto-spies';

const userService: Spy<UserService> = createSpyFromClass(UserService);
userService.getName.mockReturnValue('Ada');
```

## Entry points

Every entry point of `vitest-auto-spy` is re-exported here, under the same names:

| Subpath                            | What it adds                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `vitest-auto-spies`                | the core — `createSpyFromClass`, `createAutoMock`, `mockDeep`, …                     |
| `vitest-auto-spies/bun`            | the `bun:test` mock adapter                                                          |
| `vitest-auto-spies/bun-angular`    | Angular's `TestBed` under `bun test` (a preload)                                     |
| `vitest-auto-spies/node`           | the `node:test` mock adapter — the one entry that also ships CJS                     |
| `vitest-auto-spies/rxjs`           | Observable spies (`nextWith`, `observablePropsToSpyOn`, …)                           |
| `vitest-auto-spies/console`        | silent, typed `console` spies                                                        |
| `vitest-auto-spies/jasmine`        | the drop-in surface for a `jasmine-auto-spies` suite — `.and`, `.calls`, `.withArgs` |
| `vitest-auto-spies/jasmine-compat` | `enableJasmineCompat()` alone, for `bun test` and `node --test`                      |
| `vitest-auto-spies/observer-spy`   | `subscribeSpyTo` — the `@hirez_io/observer-spy` surface                              |
| `vitest-auto-spies/angular`        | `provideAutoSpy`, `injectSpy`, `renderShallow`, the override helpers                 |
| `vitest-auto-spies/nestjs`         | `provideAutoSpy` / `injectSpy` for a Nest `TestingModule`                            |
| `vitest-auto-spies/react`          | the React Testing Library recipe                                                     |
| `vitest-auto-spies/vue`            | Vue / Pinia helpers                                                                  |
| `vitest-auto-spies/svelte`         | the Svelte recipe                                                                    |
| `vitest-auto-spies/setup`          | `setupAutoSpy`, fake timers, the clock helpers, `installPerTest`                     |
| `vitest-auto-spies/zone`           | `fakeAsync` / `waitForAsync` on Vitest                                               |
| `vitest-auto-spies/eslint-plugin`  | the flat-config lint rules — also ships CJS                                          |

The package is **ESM**, exactly like the canonical one: only `/node` and `/eslint-plugin` can be
`require()`d. This directory is generated from the canonical `package.json`
(`npm run alias:sync` in the repository), so the two can no longer drift.

👉 **Full documentation:** https://github.com/ASDAlexey/vitest-auto-spy#readme
