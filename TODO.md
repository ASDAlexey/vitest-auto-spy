# TODO — refactoring & analysis

Audit of `vitest-auto-spy` (v1.3.0). The core is already cleanly layered (IoC
`MockAdapter` / `ObservableSupport` registries, one factory reused by the
class-based and type-based paths). Items below are ordered by value. Status
markers: `[x]` done in this pass, `[ ]` backlog, `[~]` considered & intentionally
skipped.

## Correctness / quality gate

- [x] **Restore 100% coverage** — `auto-mock.ts` Proxy traps `has` / `ownKeys` /
      `getOwnPropertyDescriptor` (lines 71–83) had no tests, so `npm run
      test:coverage` (and therefore CI's `Test + coverage` step) was **red**
      at 98.34% on this branch. Added trap-exercising specs. The `set` trap was
      already covered by the "assign a plain property" test.
- [x] **`npm run check` now enforces the coverage gate** — it ran `npm test`
      (no coverage), so the 100% threshold was silently bypassed locally while
      CI ran `test:coverage`. Switched `check` to `test:coverage` so a local
      `check` matches CI.

## Duplication removal (DRY — repo enforces jscpd threshold 0)

- [x] **Vitest-adapter registration was copy-pasted across 6 entries**
      (`index`, `angular`, `nestjs`, `react`, `vue`, `svelte`): each repeated
      `import { registerMockAdapter } … import { vitestMockAdapter } …
      registerMockAdapter(vitestMockAdapter)` plus a near-identical comment.
      Extracted a single side-effect module `lib/use-vitest-adapter.ts`; every
      Vitest entry now does `import './lib/use-vitest-adapter';`. One source of
      truth for "this entry runs on Vitest".
- [x] **`provideAutoSpy` value-provider construction duplicated** between
      `lib/angular.ts` and `lib/nestjs.ts` (identical
      `{ provide, useValue: createSpyFromClass(...) }`). Extracted
      `lib/class-value-provider.ts`; both adapters and their public
      `AngularValueProvider` / `NestValueProvider` types derive from it.

## Considered & intentionally skipped

- [~] **Merge the three `as any` mock casts** (`asVitestMock` / `asBunMock` /
      `asNodeMock`). Each casts to a *different* concrete mock type and carries a
      runtime-specific eslint-disable rationale; a shared generic `castMock<T>`
      would erase that locality for one saved line. jscpd reports 0 clones —
      below threshold. Left as-is.
- [~] **Split `lib/types.ts` per `.claude/rules/ts-files.md`** (one
      `.type.ts` / `.interface.ts` per declaration). That rule targets app code;
      `types.ts` is this library's curated public type barrel and re-exported via
      `export type * from './lib/types'`. Fragmenting it would churn the public
      surface for no consumer benefit. Skipped deliberately.

## Backlog (not in this pass)

- [ ] **`node:test` adapter ignores the `name` argument** of
      `createMockFn(impl, name)` — `node:test`'s `mock.fn()` has no `mockName`,
      so spy names are absent in `node:test` diagnostics (Vitest/Bun set them).
      Acceptable, but documenting the gap (or attaching a `displayName`) would
      make cross-runtime diagnostics uniform.
- [ ] **Expand `docs-site/comparison.md`** — the file already carries a TODO to
      link each competitor row and add a per-feature breakdown (see analysis
      below).

---

# Competitor analysis

The defensible niche: **the only auto-spy library that reads a real _class_ and
returns a _fully-typed_ spy of every method with _return-type-aware_ control
helpers (`resolveWith` / `nextWith` / `calledWith` / `mustBeCalledWith`),
portable across every Vitest-compatible runtime (Vitest / Bun / `node:test`) and
framework (Angular / NestJS / React / Vue / Svelte).**

| Library | Reads a class? | Return-type-aware helpers? | Runtime | Typed | Where we win |
| --- | --- | --- | --- | --- | --- |
| **jest-auto-spies** (`@hirez_io`) | ✅ | ✅ (rxjs/promise) | Jest only | ✅ | Same API on Vitest/Bun/`node:test`; the maintained successor — direct migration path. |
| **vitest-mock-extended** | ❌ (type Proxy) | ❌ | Vitest | ✅ | We read a real class **and** add promise/observable ergonomics. Our `createAutoMock<T>()` matches its type-only mode while keeping the helpers. Complementary. |
| **@golevelup/ts-vitest** (`createMock`) | partial | ❌ | Vitest/Nest | ✅ | Explicit class→spy, typed Promise/Observable helpers, `mustBeCalledWith`. |
| **ts-auto-mock** | ❌ (compiler transform) | ❌ | Jest/ts | ✅ | No ttsc/transformer build step; runtime-only, zero toolchain coupling. |
| **sinon** | ❌ (manual stubs) | ❌ | Any | ❌ | Auto-generated + fully typed vs. hand-written + loosely typed. |
| **testdouble.js** | partial (`td.object`) | ❌ | Any | weak | Stronger typing, return-type-aware helpers, framework recipes. |
| **vitest `vi.fn` / `vi.spyOn`** (built-in) | ❌ | ❌ | Vitest | partial | Zero boilerplate: a whole class → spy in one call, no per-method wiring. |

## Reads of the field

- **Closest direct competitor: `jest-auto-spies`.** Same author lineage of the
  API. Its weakness is Jest lock-in; our entire reason-to-exist is carrying that
  exact ergonomics to Vitest/Bun/`node:test`. Keep the API a 1:1 drop-in (the
  README already pitches this) — that migration story is the moat.
- **Closest type-only competitor: `vitest-mock-extended`.** It mocks from a
  *type* via a deep Proxy and is popular, but offers no return-type-aware
  helpers. Our new `createAutoMock<T>()` covers the same "no class at runtime"
  case **while** keeping `resolveWith` / `nextWith` / `calledWith`. Position it
  explicitly as "mock-extended ergonomics + helpers" in `comparison.md`.
- **Differentiators to keep sharp:** (1) one call spies a whole class, (2)
  return-type-driven helper bundles, (3) runtime-agnostic core behind
  `MockAdapter` so the same spies run on 3 runners, (4) framework recipes that
  pull in **zero** framework runtime deps (Angular/Nest/React/Vue/Svelte are
  optional peers), (5) rxjs kept behind an opt-in `/rxjs` entry so non-rxjs
  consumers ship no rxjs.
- **Gaps vs. the field worth closing later:** partial-deep mocking of nested
  objects (mock-extended's `mockDeep`), and a documented per-feature comparison
  table (the `comparison.md` TODO).
