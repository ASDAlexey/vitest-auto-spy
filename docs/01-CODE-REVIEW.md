# Code Review — `src/` (task 1)

> Full review of the library source. Findings are grouped by file with severity and a
> concrete fix. The strict tsconfig + ESLint adopted in this session (`no-explicit-any`,
> `consistent-type-assertions: 'never'`, `no-non-null-assertion`, `noUncheckedIndexedAccess`,
> `exactOptionalPropertyTypes`, …) drive most of the type-safety items. The actual fixes are
> applied by the convergence pass; this document is the rationale + backlog of anything left
> as a deliberate follow-up.

## Cross-cutting

The library is, by nature, built on dynamic spy assembly — a class is read at runtime and a
`vi.fn()` is decorated with helper methods that do not exist on its static type. A subset of
`any` is therefore **load-bearing for generic inference** and cannot become `unknown` without
breaking `Parameters`/`ReturnType` conditional types. Those spots keep a single, justified
`// eslint-disable … -- <reason>`; everything else is typed properly. The remaining-`any`
ledger is documented in `docs/RESULTS.md`.

## Highest-priority items

1. **`methodsToSpyOn` augments instead of restricts** (`create-spy-from-class.ts`) — providing
   the list spies on *all* prototype methods **plus** the named ones, where `jest-auto-spies`
   (the API this package mirrors) *restricts* to only the listed methods. Public-API
   correctness. Investigated during convergence; decision recorded in `RESULTS.md`.
2. **Delayed observable per-call — flagged as a crash, found NOT reachable.** The old code did
   `(returnedValue as Promise).then(...)` in the delay branch, which would throw for an
   `Observable`. On investigation, observable per-call (`nextWithPerCall`) bakes its delay into
   the observable and never sets a container-level `delay`, so the `.then` path was never hit
   for observables — no live crash. Resolution: rather than keep a dead defensive branch (it
   broke genuine 100% coverage), per-call delay handling was **unified** — `resolveWithPerCall`
   now bakes its delay into the promise at config time, like observables — removing the branch.
3. **`subject` type-lie after `nextWithValues`** (`observable-spy.ts createObservablePropSpy`) —
   `subject = configuredSubject as ReplaySubject<T>` reassigns the subject to a *merged
   observable* (not a Subject). A later `nextWith` would call `.next()` on a non-Subject. Fixed /
   guarded during convergence.
4. **`stringify()` can return `undefined`** (`args-map.ts`, `error-handler.ts`) — the result is
   cast `as string` / `as SerializedArgs`. An unserializable arg yields `undefined`, producing a
   collision-prone `"undefined"` key or a `.substring` throw. Guarded with `?? ''`.
5. **Promise/observable decoration duplication** (`promise-spy.ts` ↔ `observable-spy.ts`) — the
   two "decorate the function spy" / "decorate the calledWith object" skeletons and the
   `if (configs.length === 0) return;` early-outs are near-identical copy-paste. The repo runs
   `jscpd` at threshold 0, so the shared skeleton is extracted into a helper.

## Per-file notes

### `function-spy.ts`
- `valuesPerCalls!.shift()` / non-null assertions → replace with a local guard.
- Final `return functionSpy as unknown as AddSpyMethodsByReturnTypes<…>` — intrinsic; one
  justified disable, or an internal augmented-spy interface.
- `addMethodsToCalledWith` re-creates helpers on every `.calledWith()` call (last wins). Works,
  but wasteful — noted, low priority.

### `observable-spy.ts`
- `mergeSubjectWithDefaultValues`: a bare `{ delay }` or `{ complete: false }` entry matches no
  guard and silently becomes a no-op (`EMPTY`) instead of a pause. Minor; documented, behavior
  left as-is to avoid changing emission semantics.
- Decoration `any` params typed to `Record<string, unknown>` where possible.

### `create-spy-from-class.ts`
- `extractMethodsFromObject(obj: any)` / `getAllMethodNames(obj: any)` → `object`.
- `methodsToSpyOnOrConfig as string[]` casts removed — the key arrays are already `string`
  subtypes and assign without a cast.
- Inherited + own method names deduped via `Set` (a subclass override otherwise spies twice).

### `types.ts`
- `Func = (...args: any[]) => any`, `ClassType<T>` index signature, `Observable<any>` filters —
  load-bearing for inference; minimal justified disable.
- `ErrorValueConfig.errorValue` / `throwWith(value)` tightened to `unknown` where it compiles.
- Observable/promise `calledWith(...args: any[])` is weaker than the sync `Parameters<Method>`
  variant — tightened only where it compiles cleanly.

### `accessor-spy.ts`
- `accessorName as never` casts exist to satisfy `vi.spyOn`'s dynamic-key overloads — justified
  disable or restructure. `obj: any`/`autoSpy: any` → `Record<string, unknown>`.
- Getter/setter branches are asymmetric (`defineWithEmptyAccessors` guarded only on the setter
  side). Fragile ordering dependency — documented.

### `promise-spy.ts`
- Decoration `any` params and `value?: any` → `unknown`. Shares the extracted decoration helper
  with `observable-spy.ts` for the jscpd gate.

### `angular.ts`
- `TestBed.inject(token as never) as Spy<T>` — two banned casts; justified disables (TestBed
  genuinely returns `T`, the `Spy<T>` is the intended convenience type).
- `mockReadonlyProp(value: unknown)` → `T[K]` where `K extends keyof T`, if it compiles.

### `error-handler.ts`
- `actualArgs: any[]` → `unknown[]`; `stringify(...) as string` guarded.

### `internal-types.ts`
- `value: any`, `wrappedValue`, `[extra: string]: any` index signature — central to the
  decoration design; kept with justification.

## Sizes / length gates
All functions < 50 lines, all files < 500 lines. No `max-lines` / `max-lines-per-function`
violations before or after the refactor.

## Coverage gaps closed
- `nextWithPerCall` **with a `delay`** (was untested — exactly the `.then` crash path).
- Observable-prop `nextWithValues` then `nextWith` (the subject type-lie path).
- An assertion locking the intended `methodsToSpyOn` restrict/augment semantics.
