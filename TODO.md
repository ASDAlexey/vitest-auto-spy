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

## Performance pass (Unreleased)

- [x] **CommonJS output cut to the two entries where `require()` works.** Eight of the twelve `.cjs`
      files threw on their own first line (Vitest refuses to be required), and esbuild cannot
      code-split CommonJS, so each surviving bundle carried a private copy of the `MockAdapter` /
      `ObservableSupport` registries — `require('…/rxjs')` next to `require('…/node')` failed with
      "Observable spies require rxjs". Kept: `node` (self-contained, used alone) and `eslint-plugin`
      (no registry). Folded `bun-angular` into the shared ESM pass, which removed its inlined copy
      of the core. `dist/` 625 kB → 241 kB, tarball 187 kB → 108 kB.
- [x] **`bench/auto-spy.bench.ts` compared the lazy path against itself.** Its "eager" case was
      `createSpyFromClass(WideService)` with no config, and `lazySpies` defaults to `true` — so the
      reported "1.79x faster" (±84% rme) measured noise. Rewritten to pass both options explicitly
      and to sweep class width against methods actually called, which is what the default trades on.
- [x] **`vitest.shared-env.config.mts` carried dead configuration.** `test.poolOptions` was removed
      in Vitest 4 — it logged `was removed in Vitest 4` on every run and was ignored. The top-level
      `fileParallelism: false` already covers it.
- [~] **Micro-optimising `createFunctionSpy`.** Measured before deciding: `vi.fn()` alone is 1.3 µs
      (p75) and the full `createFunctionSpy` is 1.9 µs, so *everything* this library adds per method
      — two `ArgsMap`s, the promise helpers, three `defineProperty` brands, the `settledResults`
      probe — is ~0.6 µs, and `new ArgsMap()` twice is 0.04 µs of it. Removing the whole bundle
      would save a spec with 20 services × 10 methods about 0.12 ms. Not worth the loss of the
      reset/clear hooks it buys. The levers that do move a suite are per-file environment cost and
      the child subtree in `TestBed.createComponent` — both measured in
      `docs-site/core/performance.md`.
- [~] **Rewriting a hot path in Rust (napi / WASM).** The hot path is not computation: it is minting
      JS closures the runner itself tracks, which no native module can return. The one pure-compute
      piece, `serialize-args`, runs the whole `calledWith` dispatch in 0.5 µs (p75) — less than a
      napi boundary crossing costs — and its input is arbitrary JS values (`Map`, `Set`, `Date`,
      circular refs) that would have to be walked in JS before they could cross at all. Against that,
      prebuilt binaries for six platform/arch pairs would multiply the package weight this pass just
      halved, break Bun / browser / StackBlitz portability, and hand supply-chain scanners an opaque
      artifact in a package that deliberately ships unminified (see `tsup.config.ts`).

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
