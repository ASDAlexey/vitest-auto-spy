---
title: Comparison
description: How vitest-auto-spy compares to jest-auto-spies, vitest-mock-extended, @golevelup/ts-vitest, ts-auto-mock, sinon and testdouble.
---

# Comparison

How `vitest-auto-spy` compares to other mocking / auto-spy libraries. The niche: the only auto-spy
library that reads a **class** and gives a **fully-typed** spy of every method with
**return-type-aware** control helpers — across any Vitest-compatible runtime and framework.

| Library                                                                                       | Reads a class? | Return-type-aware helpers? | Runtime     | We win on                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | -------------- | -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [**jest-auto-spies**](https://www.npmjs.com/package/jest-auto-spies)                          | ✅             | ✅                         | Jest only   | Vitest/Bun/`node:test` successor, same API — direct migration path.                                                                                                                                                    |
| [**@bugsplat/vitest-auto-spies**](https://www.npmjs.com/package/@bugsplat/vitest-auto-spies)   | ✅             | ✅                         | Vitest only | Same class-based API **plus** Bun & `node:test`, type-only `createAutoMock`, framework recipes, console spies, and **zero runtime deps** (it depends on `@hirez_io/auto-spies-core`; `rxjs < 8` cap — we support rxjs 8). |
| [**vitest-mock-extended**](https://www.npmjs.com/package/vitest-mock-extended)                | ❌ (Proxy)     | ❌                         | Vitest      | Return-type ergonomics **and** reading a real class. Its type-only mode is matched by `createAutoMock` / `mockDeep`, with the helpers kept.                                                                             |
| [**@golevelup/ts-vitest**](https://www.npmjs.com/package/@golevelup/ts-vitest)                 | partial        | ❌                         | Vitest      | Typed Promise/Observable helpers + explicit class→spy + `mustBeCalledWith`.                                                                                                                                            |
| [**ts-auto-mock**](https://www.npmjs.com/package/ts-auto-mock)                                 | ❌ (transform) | ❌                         | Jest/ts     | No compiler transformer to install — runtime-only, no toolchain coupling.                                                                                                                                              |
| [**sinon**](https://www.npmjs.com/package/sinon)                                               | ❌ (manual)    | ❌                         | Any         | Auto-generated + fully typed vs manual + loosely typed.                                                                                                                                                                |
| [**testdouble.js**](https://www.npmjs.com/package/testdouble)                                  | partial        | ❌                         | Any         | Stronger typing, return-type-aware helpers, framework recipes.                                                                                                                                                         |

**Pitch:** the only auto-spy library that reads a **class** and gives a **fully-typed** spy of
every method with **return-type-aware** control helpers (`resolveWith` / `nextWith` /
`calledWith`) — across any Vitest-compatible runtime and framework.

## Feature by feature

|                                          | vitest-auto-spy | jest-auto-spies | vitest-mock-extended | @golevelup/ts-vitest | sinon |
| ---------------------------------------- | :-------------: | :-------------: | :------------------: | :------------------: | :---: |
| Spy every method of a class in one call  |       ✅        |       ✅        |          ❌          |       partial        |  ❌   |
| Mock from a **type/interface**           |       ✅        |       ❌        |          ✅          |          ✅          |  ❌   |
| Recursive deep mock                      |       ✅        |       ❌        |          ✅          |          ❌          |  ❌   |
| Spy-free data double (`createMock`)      |       ✅        |       ❌        |          ❌          |          ❌          |  ❌   |
| `resolveWith` / `rejectWith`             |       ✅        |       ✅        |          ❌          |          ❌          |  ❌   |
| `nextWith` / `nextWithValues` (RxJS)     |       ✅        |       ✅        |          ❌          |          ❌          |  ❌   |
| `calledWith` / `mustBeCalledWith`        |       ✅        |       ✅        |    `calledWith`      |          ❌          |  ❌   |
| Getter / setter spies                    |       ✅        |       ✅        |          ❌          |          ❌          |  ✅   |
| Vitest                                   |       ✅        |       ❌        |          ✅          |          ✅          |  ✅   |
| Bun (`bun:test`)                         |       ✅        |       ❌        |          ❌          |          ❌          | partial |
| `node:test`                              |       ✅        |       ❌        |          ❌          |          ❌          | partial |
| Angular `TestBed` under `bun test`       |       ✅        |       ❌        |          ❌          |          ❌          |  ❌   |
| Runtime dependencies                     |     **0**       |       1         |          1           |          0           |   4   |

Dependency counts are each package's own `dependencies` on npm, checked 2026-08-26 —
`@hirez_io/auto-spies-core` for `jest-auto-spies`, `ts-essentials` for `vitest-mock-extended`, and
four `@sinonjs/*` + `diff` packages for `sinon`.

## Beyond the class spy

The tables above compare the part every one of these libraries does. What none of the others ship
alongside it:

- [**Angular's `TestBed` under `bun test`**](/runtimes/bun-angular) — Bun ships no DOM and cannot
  resolve `templateUrl`, so Angular specs do not run there at all. One preload closes both gaps.
- [`renderShallow`](/adapters/angular#shallow-component-rendering) and
  [`createWithAutoSpies`](/adapters/angular#building-a-class-with-auto-spied-dependencies) — the
  shallow-`TestBed` copy-paste and DI-driven instantiation as one call each.
- [`stable` / `flushEffects`](/adapters/angular#zoneless-waiting) and `toHaveSignalValue` — zoneless
  waiting and a signal matcher, for a codebase where `detectChanges()` is no longer enough.
- [Observable assertions](/core/observable-assertions) that fail when the stream stays silent,
  duck-typed so they pull in no rxjs.
- [`setupFakeTimers()` / `advanceTimers()`](/utilities/fake-timers) — an advance that also drains the
  microtasks a bare `advanceTimersByTime()` leaves pending, and
  [`flushEventLoop` / `settleDynamicImport`](/utilities/event-loop) for the queue the clock does not
  reach at all.
- [`mockConstructor` / `stubConstructor`](/utilities/constructor-doubles) — a double the code under
  test can call with `new`, which a runner's own `vi.fn(() => instance)` is not.
- [`fakeAsync` and `waitForAsync` on Vitest](/utilities/zone) — `zone.js/testing` installs its
  ProxyZone through Jasmine and Jest hooks only, so both throw until this patch is imported.
- [`assertMocked` / `moduleNamespace`](/utilities/module-mocks) — proof that a `vi.mock()` actually
  applied under a bundler, instead of a spec quietly asserting on the real module.
- [Eight ESLint rules](/utilities/eslint-plugin) versioned together with the API they recommend, and
  [`setupAutoSpy()`](/utilities/setup) for the test-run hygiene a shared environment needs.
- [Per-file `TestBed` diagnostics](/adapters/angular#where-a-spec-spends-its-time) — which specs
  actually pay for `TestBed`, and by how much.
- [`compareTestRuns`](/migrating) — whether the migration that brought you here lost a test, from
  the two sets of names rather than from two totals that happen to match.

## Where another library is the better answer

- **You are on Jest and staying there.** `jest-auto-spies` is the same API; there is nothing to gain
  from switching runner just for this.
- **You only ever mock interfaces, never classes, and want nothing else.**
  `vitest-mock-extended` is smaller and does exactly that. `createAutoMock` /
  [`mockDeep`](/core/auto-mock-by-type) cover the same ground here if you want the helpers too — the
  two are complementary, not exclusive.
- **You need sandboxes, fake servers, or a full test-double toolkit.** `sinon` is a wider tool; this
  package is deliberately only about turning a type or a class into a typed spy.
