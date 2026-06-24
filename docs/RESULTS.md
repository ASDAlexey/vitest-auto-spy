# Results — overnight work summary

This is the aggregate report for the 9 requested tasks. Per-topic detail lives in the sibling
docs; this file is the index + the final verification status.

## Final gate status — all green ✅

| Gate | Command | Result |
|---|---|---|
| TypeScript (strict) | `npm run typecheck` | **0 errors** |
| ESLint | `npm run lint` | **0 errors, 0 warnings** |
| Tests | `npm run test` | **45 passed, 0 failed** |
| Coverage | `npm run test:coverage` | **genuine 100%** lines/branches/functions/statements over `src/lib/**` |
| Duplication | `npm run jscpd` | **0 clones** (threshold 0) |
| Build | `npm run build` | **success** (ESM + CJS + dts) |
| Formatting | `npm run format:check` | **clean** |
| Combined | `npm run check` | **exit 0** |

> ⚠️ Important honesty note: the previous coverage gate was **vacuous**. Since the recent
> "split auto-spy into focused lib modules" refactor, `coverage.include` was still
> `['src/auto-spy.ts']` — a re-export barrel with zero executable statements — so the 100%
> threshold passed against nothing. It now measures `src/lib/**` and **genuinely** holds at 100%.
> This was found and fixed this session.

## Task-by-task

1. **Review `src` + fix everything** → `docs/01-CODE-REVIEW.md`. All findings addressed: `any`
   minimised (55 of 63 removed; 8 load-bearing kept with justified disables), unnecessary casts
   removed, non-null assertions replaced with guards, duplication extracted into
   `src/lib/spy-decoration.ts`. Real bugs fixed (below).
2. **ESLint + Prettier from meta-pdm, lib-relevant rules** → `.eslintrc.cjs`, `.prettierrc`.
   Distilled to the rules that apply to a TS library (kept `@typescript-eslint` strictness,
   `no-explicit-any`, `consistent-type-assertions: never`, `no-non-null-assertion`, rxjs
   hygiene, eslint-comments, regex, import dedup; dropped Angular/ngrx/template/local-rules
   plugins). Toolchain installed; scripts added.
3. **Decouple from Angular & rxjs** → `docs/02-DECOUPLE-ANGULAR-RXJS.md`. **APPLIED.** Both
   splits done in one pass: Angular and rxjs moved behind `vitest-auto-spy/angular` and
   `vitest-auto-spy/rxjs` subpath exports, with the inversion-of-control observable registry
   (`lib/observable-support.ts`) so the core never imports rxjs at runtime. Verified at the
   bundle level — `dist/index.*` requires only `vitest`; `dist/rxjs.*` only `rxjs`;
   `dist/angular.*` only `@angular/core/testing`. `rxjs`/`@angular/core` are now optional peers.
4. **Size optimization** → `docs/03-SIZE-OPTIMIZATION.md`. **APPLIED — all three levers.**
   Sourcemaps dropped + minify (#1, #2) and the `javascript-stringify` dependency replaced with
   a dependency-free inline serializer (#3, gated by serialization-contract tests). Tarball
   29.4 kB → 13.7 kB compressed (131 kB → 48.6 kB unpacked); zero runtime dependencies.
5. **All results in md** → this file + the four `docs/0x-*.md`.
6. **Future roadmap (Node/Bun, more stars)** → `docs/04-ROADMAP.md`. Framework-agnostic core is
   the #1 star lever, then `bun test` / `node:test`, Nest/React/Vue adapters, marketing, and a
   competitor analysis with the unique niche.
7. **Super-strict tsconfig** → `tsconfig.json`. Matches and exceeds the meta-pdm one (adds
   `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
   `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`,
   `noUncheckedSideEffectImports`, `isolatedModules`, `useUnknownInCatchVariables`,
   `allowUnreachableCode: false`, `allowUnusedLabels: false`). No `any` leaks past lint.
8. **Changelog + release folder** → `CHANGELOG.md` `[Unreleased]` section + `changes/`
   (`unreleased.md` to paste into GitHub Releases, `README.md` cut-a-release guide).
9. **Verify tests 100% / eslint clean / jscpd clean** → see the gate table above. All pass.

## Real bugs fixed (with regression tests)

- **Vacuous coverage gate** — coverage now measures real source (the headline fix for task 9).
- **Observable-prop subject type-lie** — `nextWith`/`complete` after `nextWithValues` now keep
  a real backing `Subject` (test: `nextWith after nextWithValues still emits via the backing
  subject`).
- **`methodsToSpyOn` augment → restrict** — now matches `jest-auto-spies` (test: `restricts
  spying to the listed methods only`). No existing test depended on the old augment behavior.
- **Serializer totality** — `args-map` / `error-handler` no longer rely on a dead `?? ''`
  fallback; `String(stringify(...))` keeps them total without an unreachable branch.

### On the agent-reported "delayed observable per-call `.then` crash"
Investigated and found **not reachable**: observable per-call (`nextWithPerCall`) bakes its
delay into the observable and never sets a container-level `delay`, so the old `.then` path was
never hit for observables. Rather than keep a defensive-but-dead branch (which broke real 100%
coverage), the per-call delay handling was **unified** — `resolveWithPerCall` now bakes its
delay into the promise at config time, just like observables — deleting the branch entirely.

## Remaining `any` ledger (8, all justified inline)

| File | Count | Why kept |
|---|---|---|
| `types.ts` | 4 | `Func`, `ClassType`, `Observable<any>` filter, the `infer ReturnType` conditional — load-bearing for generic inference. |
| `internal-types.ts` | 3 | `wrappedValue`, `value`, the `[extra: string]: any` index signature — the dynamic decoration design. |
| `function-spy.ts` | 1 | the single `spy as any` public-surface bridge, isolated in `exposeAsSpy`. |

Plus a handful of justified `consistent-type-assertions` disables for runtime-assembled spy
types and `vi.spyOn` / `TestBed.inject` dynamic keys. No `as unknown` anywhere (banned).

## Follow-up session — decoupling + size optimization applied
The previously analysis-only tasks 3 and 4 have since been **implemented** (see the updated
task-by-task notes above and `docs/02`/`docs/03`):

- **Subpath entry points + IoC** — `vitest-auto-spy` (core), `vitest-auto-spy/rxjs`,
  `vitest-auto-spy/angular`. Core is framework-agnostic at runtime. **BREAKING**: observable
  and Angular helpers move to their subpaths (major version bump on next release).
- **Size** — sourcemaps off, minify on, `javascript-stringify` removed (inline serializer).
  Zero runtime dependencies; tarball ~53% smaller compressed.
- **Gates** — 55 tests, genuine 100% coverage (added `core-standalone.spec.ts` for the
  no-rxjs paths and `lib/serialize-args.spec.ts` for the serializer contract), ESLint 0,
  jscpd 0, typecheck 0, build success, Prettier clean.
