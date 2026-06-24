# Decoupling from Angular & rxjs (task 3)

> **STATUS: ✅ IMPLEMENTED.** Both the Angular and rxjs splits below are done, including the
> inversion-of-control refactor. Core is `vitest-auto-spy`, with `vitest-auto-spy/rxjs` and
> `vitest-auto-spy/angular` as opt-in subpaths; `rxjs`/`@angular/core` are optional peers.
> Verified at the bundle level — the core requires only `vitest`. The document below is the
> original plan, kept for rationale.

> Question: can the library be separated from Angular and rxjs internally, so the core spy
> functionality is usable in **any** project (plain Node, Bun, React, Vue) — with Angular as
> just one supported case rather than a hard dependency?

**Short answer: yes, it's feasible and worth it — but it is NOT a pure file-shuffle. Budget
~0.5–1.5 days, split across two PRs. The Angular split is trivial; the rxjs split needs one
real refactor (inversion of control).**

---

## Current dependency map

| File | Couples to | Notes |
|---|---|---|
| `src/lib/angular.ts` | `@angular/core/testing` (`TestBed`) | The **only** Angular-touching file. Exports `provideAutoSpy`, `injectSpy`, `mockReadonlyProp*`, `mockAccessorsProp`. Of these, only `provideAutoSpy`/`injectSpy` actually need `TestBed`; the `mock*` helpers are pure `Object.defineProperty` + `vi.fn()`. |
| `src/lib/observable-spy.ts` | `rxjs` + `rxjs/operators` (runtime) | Real runtime rxjs (`ReplaySubject`, `merge`, `defer`, operators). |
| `src/lib/types.ts` | `import type { Observable, Subject } from 'rxjs'` | **Type-only** — erased at runtime, but forces rxjs types on consumers. |
| `src/lib/internal-types.ts` | `import type { Observable } from 'rxjs'` | **Type-only**. |
| `src/lib/create-spy-from-class.ts` | statically imports `observable-spy.ts` | Drags rxjs into the core graph. |
| `src/lib/function-spy.ts` | statically imports `observable-spy.ts` | **The crux** — see below. |

Framework-agnostic already: `promise-spy.ts`, `accessor-spy.ts`, `args-map.ts`,
`error-handler.ts`, `constants.ts`, `value-config-guards.ts`. These need only `vitest` +
`javascript-stringify`.

## The crux: rxjs is wired into the core eagerly

`function-spy.ts` (the heart of the library) unconditionally calls
`addObservableHelpersToFunctionSpy(...)` on **every** spy — even a plain sync method gets a
`ReplaySubject` and `nextWith`/`throwWith` attached. So a naive "move files + subpath exports"
split does nothing: the static chain `create-spy-from-class → function-spy → observable-spy →
rxjs` would still pull rxjs into the core bundle regardless of `package.json` `exports`.

The fix is a small **inversion of control**: `function-spy.ts` stops importing the observable
helpers and instead consults an optional registry (`registerObservableSupport(installer)`).
The `vitest-auto-spy/rxjs` entry, when imported, registers the helpers. Core then never
references rxjs at runtime; requesting `observablePropsToSpyOn` without importing `/rxjs` throws
a clear "import vitest-auto-spy/rxjs to use observable spies" error.

## Target API (subpath exports)

| Entry | Specifier | Contents | Heavy deps |
|---|---|---|---|
| Core | `vitest-auto-spy` | `createSpyFromClass`, `createFunctionSpy`, sync + promise + accessor spies, `errorHandler`, public types | `vitest`, `javascript-stringify` |
| rxjs | `vitest-auto-spy/rxjs` | `createObservableWithValues`, observable helpers, observable types | `rxjs` |
| Angular | `vitest-auto-spy/angular` | `provideAutoSpy`, `injectSpy`, `mock*` helpers | `@angular/core`, `vitest` |

```jsonc
"exports": {
  ".":         { "types": "./dist/index.d.ts",   "import": "./dist/index.js",   "require": "./dist/index.cjs" },
  "./rxjs":    { "types": "./dist/rxjs.d.ts",     "import": "./dist/rxjs.js",     "require": "./dist/rxjs.cjs" },
  "./angular": { "types": "./dist/angular.d.ts",  "import": "./dist/angular.js",  "require": "./dist/angular.cjs" }
},
"peerDependencies": { "vitest": ">=1.0.0", "rxjs": ">=7.0.0", "@angular/core": ">=16.0.0" },
"peerDependenciesMeta": { "rxjs": { "optional": true }, "@angular/core": { "optional": true } }
```

tsup becomes multi-entry (`entry: ['src/index.ts','src/rxjs.ts','src/angular.ts']`); keep the
externals. Mark the `/rxjs` registration as a side effect so tree-shaking doesn't strip it:
`"sideEffects": ["**/rxjs.js", "**/rxjs.cjs"]`.

## Type-level coupling (the fiddly bit)

`types.ts` / `internal-types.ts` reference `Observable`/`Subject` *as types*. For a strict
plain-Node consumer without rxjs installed, those `import type` lines error. Options:
- **Pragmatic (recommended now):** accept that rxjs *types* are referenced but ship rxjs as an
  optional *runtime* peer. Non-Angular/non-rxjs users get zero runtime rxjs; TS users who never
  touch observable spies are unaffected in practice.
- **Pure (later):** define a minimal structural `ObservableLike<T> = { subscribe(...): … }`
  fallback in core and keep the rich `Observable` overloads in the `/rxjs` `.d.ts`. Localized to
  two files but fiddly for marginal benefit.

## Recommendation — ship in two PRs

- **PR 1 (easy, high value, ~80% of the goal for ~20% of the effort):** split out
  `vitest-auto-spy/angular` via subpath exports + `peerDependenciesMeta.optional` for
  `@angular/core`, add the multi-entry tsup config. Angular is one isolated file → near-zero
  risk. Result: usable in React/Vue/Node without Angular install warnings.
- **PR 2 (moderate, the real refactor):** invert the observable coupling, move observable code
  behind `vitest-auto-spy/rxjs`, mark `rxjs` optional, handle type degradation. This earns
  "zero rxjs in a plain-Node project."

**Verdict: not hard for Angular, mildly hard for rxjs — and clearly worth it, because it is the
#1 lever for reach (see `docs/04-ROADMAP.md`).** If effort must be capped, do PR 1 only.
