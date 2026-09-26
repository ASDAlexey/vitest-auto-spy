# vitest-auto-spy — instructions for AI coding agents

You are looking at the agent-facing reference for **`vitest-auto-spy`**: typed test spies generated
from a class, a type, or nothing at all, on Vitest / `bun:test` / `node:test` / Rstest.

This file is written for an agent **using** the library in someone's test suite. It is shipped
inside the npm package, so it is readable with no network:

```
node_modules/vitest-auto-spy/AGENTS.md
```

Working on the library's own source instead? Read `CONTRIBUTING.md` in the repository.

Setting this up for a team? `npx vitest-auto-spy init` writes a pointer to this file into the
instruction files this repository's agents actually read — `AGENTS.md` (Codex, Cursor, Copilot and
most of the field), `CLAUDE.md` (Claude Code) and `GEMINI.md` (Gemini CLI), plus the glob-scoped
rule file of any tool whose own directory already exists. `--check` is the CI form; `--only
CLAUDE.md,.claude` limits it to the files a repository keeps untracked. A hand-made copy of the
package's skill in `.claude/skills/vitest-auto-spy/` is reported `stale` (and fails `--check`): delete
it and re-run `init`. Full table:
<https://asdalexey.github.io/vitest-auto-spy/agents>.

| Resource | Where |
| --- | --- |
| Spec patterns at scale | <https://asdalexey.github.io/vitest-auto-spy/recipes> |
| Task recipes | <https://asdalexey.github.io/vitest-auto-spy/guides/mocking-classes> · `/guides/mocking-local-storage` · `/guides/mocking-prisma` · `/guides/storybook-angular` |
| Docs index for LLMs | <https://asdalexey.github.io/vitest-auto-spy/llms.txt> |
| Entire docs as one file | <https://asdalexey.github.io/vitest-auto-spy/llms-full.txt> |
| Human docs | <https://asdalexey.github.io/vitest-auto-spy/> |
| Source | <https://github.com/ASDAlexey/vitest-auto-spy> |
| Types | `node_modules/vitest-auto-spy/dist/index.d.ts` (and one per subpath) |

**Read `dist/*.d.ts` before inventing a call.** Every export is typed and documented there, and the
type is the authority when this file and the code disagree.

## How to read this file

This file is the map, small enough to read whole. Sections §1, §3, §6, §7 and §14 are here; every
other section sits in its own file under `agent-docs/`, with a stub below that says when to read it
and lists its subsections. Section numbers are the same in every file, so "§5" means
`agent-docs/configuration.md` wherever it is cited.

```bash
D=node_modules/vitest-auto-spy
cat "$D/agent-docs/factories.md"                             # one topic file, whole
grep -n '^### ' "$D/agent-docs/angular.md"                   # the map of a long topic file
grep -n -F '<text of the error>' "$D/agent-docs/errors.md"   # a failure: its row, with the fix
```

| Read | Sections |
| --- | --- |
| Always, before writing a spec | §1 entry point, §2 factory (`agent-docs/factories.md`), §3 the 90% recipe, §18 do not write this (`agent-docs/anti-patterns.md`), §19 before you report success (`agent-docs/checklist.md`) |
| When the task touches it | §4 return-type helpers (`agent-docs/return-helpers.md`), §5 `createSpyFromClass` configuration (`agent-docs/configuration.md`), §6 `Spy<T>` vs `T`, §7 resetting, §8 observables (`agent-docs/observables.md`), §9 patching properties (`agent-docs/properties.md`), §10 setup file (`agent-docs/setup.md`), §11 waiting (`agent-docs/waiting.md`), §12 doubles for what the code builds (`agent-docs/doubles.md`), §15 other adapters (`agent-docs/adapters.md`) |
| Only for that stack | §13 Angular (`agent-docs/angular.md`), §14 `fakeAsync`, §16 ESLint plugin (`agent-docs/eslint.md`), §20 migrating off `jasmine-auto-spies` (`agent-docs/migration-jasmine.md`) |
| Never front to back | §17 Error → fix (`agent-docs/errors.md`), §10 setup file and §13 Angular: grep the message or list the `###` headings first |

---

## 1. Pick the entry point first

Each entry registers its mock adapter **on import**. Importing the wrong one leaves the wrong
adapter installed and spies fail at runtime.

| Runner / framework | Import from |
| --- | --- |
| Vitest (default) | `vitest-auto-spy` |
| `bun test` | `vitest-auto-spy/bun` |
| `bun test` + Angular | `vitest-auto-spy/bun-angular` |
| `node --test` | `vitest-auto-spy/node` |
| `rstest run` | `vitest-auto-spy/rstest` |
| Angular + Vitest | `vitest-auto-spy/angular` |
| NestJS | `vitest-auto-spy/nestjs` |
| React | `vitest-auto-spy/react` |
| Vue / Pinia | `vitest-auto-spy/vue` |
| Svelte | `vitest-auto-spy/svelte` |

Add-ons, orthogonal to the runner:

| Add-on | Import | Needed for |
| --- | --- | --- |
| Observable spies | `import 'vitest-auto-spy/rxjs'` | `nextWith` & friends. **Side-effect import, once**, in a setup file, a spec, or a `.d.ts` the `tsconfig` includes (§4) |
| observer-spy shim | `vitest-auto-spy/observer-spy` | `subscribeSpyTo` — the `@hirez_io/observer-spy` surface (§20). Its own entry so `/rxjs` does not carry it |
| Console spies | `vitest-auto-spy/console` | silent typed spies over the global `console` — `installConsoleSpies()` per test, `restoreConsole()` after |
| DOM stubs | `vitest-auto-spy/dom-stubs` | `stubIntersectionObserver` / `stubResizeObserver` / `stubMutationObserver` / `stubObserver`, `stubMediaElement`, `stubAbortController`, `stubWebStorage` (§12), `stubAnimationFrame`, `stubElementRect`, `intersectionEntry` / `resizeEntry` / `mutationRecord`. **Moved off the root in 4.0.0** |
| Run diagnostics | `vitest-auto-spy/diagnostics` | `compareTestRuns`, `summarizeTestRun`, `formatTestRunComparison`, `diffByField`. **Moved off the root in 4.0.0** |
| Angular HTTP | `vitest-auto-spy/angular-http` | `provideHttpTesting`, `expectRequest` — `httpResource()` / `HttpClient` (§13). Optional `@angular/common` peer, this entry only |
| Angular router | `vitest-auto-spy/angular-router` | `provideActivatedRoute`, `injectActivatedRoute` — an `ActivatedRoute` whose streams and snapshot share one record; `provideRouterDouble`, `injectRouterDouble` — a `Router` whose URL, `routerState` and `events` agree (§13). Optional `@angular/router` peer, this entry only |
| Angular diagnostics | `vitest-auto-spy/angular/diagnostics` | `enableAngularDiagnostics` and the whole TestBed timing family (§13). Companion to `/angular` like `/angular-http` — no core re-export; **moved off `/angular` in 5.21.0** so importing spies stops evaluating it |
| Angular doubles | `vitest-auto-spy/angular/doubles` | The Material dialog trio and the `Window`/`Document` platform doubles (§13). Companion to `/angular`; registers the Vitest adapter, so its doubles spy out of the box; **moved off `/angular` in 5.21.0** |
| Angular matchers | `vitest-auto-spy/angular/matchers` | `registerDirectiveMatchers`, `registerResourceMatchers`, `registerSignalMatchers` (§13). Companion to `/angular` — no core re-export; **moved off `/angular` in 5.21.0** |
| Signal forms | `vitest-auto-spy/signal-forms` | `createForm`, `registerFormMatchers` — a signal form built where `form()` can inject, and `toHaveFieldErrors` over what it produced (§13). Optional `@angular/forms` peer, this entry only; Angular 22+ |
| Setup helpers | `vitest-auto-spy/setup` | `setupAutoSpy()`, `setupFakeTimers()`, `blockNetwork()`, `stubResponse()`; the entry imports Vitest, so it is not for `bun test` |
| Zone patch | `import 'vitest-auto-spy/zone'` | `fakeAsync` / `waitForAsync` on Vitest (§14) |
| jasmine compat | `vitest-auto-spy/jasmine` | `.and` / `.calls` / `.withArgs`, the `jasmine` namespace (§20) |

`vitest-auto-spy/jasmine` is Vitest-only, because its types are Vitest's. On `bun test` and
`node --test` call `enableJasmineCompat()` from `vitest-auto-spy/jasmine-compat` instead.

`vitest-auto-spy/setup` is Vitest-only as well — `setupAutoSpy()` registers Vitest hooks. On
`bun test` nothing restores a `spyOn`, a `mock*Prop` patch or a file-scope auto-spy between tests;
put `afterEach(() => { restoreMockedProps(); mock.restore(); })` in a `--preload` file, and any
`mock.module()` there too (inside a test it swaps bindings after the original module already ran).

The rxjs peer is **>= 7.2**, not `>=7`. The observable layer used to pull `concatMap`, `delay`,
`switchMap`, `take`, `takeUntil` and `takeWhile` from `rxjs/operators`; rxjs 8 removes that deep path,
so the specifier moved to the root `rxjs` entry — which is where rxjs re-exported them in 7.2 — and
the floor moved with it. Any Angular project already satisfies it: Angular 16 through 22 all peer on
`^6.5.3 || ^7.4.0`.

The Angular entries need **Angular >= 20** — `@angular/core`, `@angular/common`,
`@angular/platform-browser` and `@angular/router`, all optional peers on the same range. Below 20 the failure is a link
error, not a missing helper: `/angular` imports `ɵSIGNAL` (Angular 18+) as a value on the first line
of its bundle, so on 16 and 17 the whole entry fails to load, and `/bun-angular` imports
`provideZonelessChangeDetection` (Angular 20+; called `provideExperimentalZonelessChangeDetection`
in 18 and 19), so on anything older the preload throws before the first spec. Angular 19 and
everything under it is out of Angular's own support window as well, so the floor cuts nothing that
still gets fixes. `@angular/platform-browser` is a declared peer since this major — `By` in the
directive matchers and `platformBrowserTesting()` in the Bun preload are both value imports of it,
and under pnpm's isolated layout it never resolved before.

The package is **ESM**. Only `vitest-auto-spy/node` and `vitest-auto-spy/eslint-plugin` also ship a
CommonJS build; every other subpath is ESM-only (a `require()` of a Vitest-backed entry always threw —
Vitest refuses to be required). The plugin's CommonJS declaration is an `export =`, which is what
`require('vitest-auto-spy/eslint-plugin')` actually returns — an `eslint.config.cts` / `.cjs` used to
type-check the call that throws and reject the one that works.

`vitest-auto-spy/package.json` resolves as well. Tools that read a dependency's manifest by specifier
— Storybook, Nx, a renovate helper — used to get `ERR_PACKAGE_PATH_NOT_EXPORTED` and had nowhere to
go from there.

**Every peer is optional now, `vitest` included.** The range is unchanged (`>=2.1.0`); what changed
is that a suite on `/bun` or `/node`, which never loads the Vitest runner, no longer installs it to
satisfy a peer. The one thing still to know is that `/bun`, `/bun-angular` and `/node` declarations
name Vitest's `Mock` type, so a project type-checking those entries without `vitest` installed will
want it as a devDependency anyway; freeing that is a type change and waits for a major.

---

## 2. Pick the factory

In [`agent-docs/factories.md`](./agent-docs/factories.md). Read it before writing any double: the decision tree from "what do you have" to the factory, and what a Proxy-backed `createAutoMock` cannot do.

<!-- agents-outline: agent-docs/factories.md -->

- What a Proxy-backed double cannot do
- It answers everything, so it must not answer _these_
- Cost, so it stops being a question

<!-- /agents-outline -->

---

## 3. The 90% recipe

Measured across a ~370-file Angular suite: `provideAutoSpy` appears in 371 files, `injectSpy` in
308, `mockReadonlyProp` in 127, `instanceMethodsToSpyOn` in 103, `observablePropsToSpyOn` in 79 —
and bare `createSpyFromClass` in only 41. **In an Angular app the spy almost always arrives through
DI.** Write that shape first.

```ts
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { type Spy, injectSpy, mockReadonlyProp, provideAutoSpy } from 'vitest-auto-spy/angular';

describe('TaskService', () => {
  let projects: Spy<ProjectStore>;
  let feed: Spy<NewsFeedService>;
  let service: TaskService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideAutoSpy(NotificationService), // plain service — nothing to configure
        provideAutoSpy(ProjectStore, { instanceMethodsToSpyOn: ['current', 'isEmpty'] }), // signals
        provideAutoSpy(NewsFeedService, { observablePropsToSpyOn: ['connected$'] }), // Observable props
      ],
    });

    projects = injectSpy(ProjectStore);
    feed = injectSpy(NewsFeedService);

    feed.connected$.nextWith(true); // seed the defaults every test needs, once
    projects.save.mockReturnValue(of(true));

    service = TestBed.inject(TaskService);
  });

  it('saves through the store', () => {
    service.save(task);

    expect(projects.save).toHaveBeenCalledWith(task);
  });
});
```

Outside Angular, or for a class you construct yourself:

```ts
import { type Spy, createSpyFromClass } from 'vitest-auto-spy';

let users: Spy<UserService>;

beforeEach(() => {
  users = createSpyFromClass(UserService);
});

it('loads', async () => {
  users.load.calledWith(1).resolveWith({ id: 1 });

  await expect(subject.open(1)).resolves.toEqual({ id: 1 });
  expect(users.load).toHaveBeenCalledWith(1);
});
```

Four conventions that carry most of the value:

1. **One `configureTestingModule` per `describe`** — reconfiguring per `it()` pays for module
   compilation on every test, the largest avoidable cost in an Angular suite.
2. **Declare each spy as `Spy<T>`, never as `T`** (§6).
3. **Seed defaults in `beforeEach`, override in the test.** An unconfigured method returns
   `undefined`, and the failure surfaces far from its cause.
4. **`provideAutoSpy` is lazy by default** — listing a wide service costs nothing for the methods a
   test never touches.

---

## 4. Helpers a spied method earns from its return type

In [`agent-docs/return-helpers.md`](./agent-docs/return-helpers.md). Read it when stubbing a return value: `calledWith`, `resolveWith`, `nextWith`, `returnSubject` and the rest, by return type.

<!-- agents-outline: agent-docs/return-helpers.md -->
<!-- /agents-outline -->

---

## 5. `createSpyFromClass` configuration

In [`agent-docs/configuration.md`](./agent-docs/configuration.md). Read it when passing a config to `createSpyFromClass`: which lists add and which restrict, `registerAutoSpyDefaults`, `strict`, getters and setters.

<!-- agents-outline: agent-docs/configuration.md -->

- The composition belongs to the class — `registerAutoSpyDefaults`
- `strict` — a method nobody configured throws instead of answering `undefined`
- Getters and setters live in `accessorSpies`

<!-- /agents-outline -->

---

## 6. `Spy<T>` is not assignable to `T` — this is intentional

`Spy<T>` is a **mapped type**, so it drops `#private` and `private` members.

```ts
let users: Spy<UserService> = createSpyFromClass(UserService); // ✅
let users: UserService = createSpyFromClass(UserService);      // ❌ private members missing
```

Do **not** patch this with `as any`, `as unknown as T`, or `@ts-expect-error`. Use the named views:

```ts
import { asInstance, asSpy } from 'vitest-auto-spy';

asInstance(spy); // Spy<T> → T,  for an API typed against the class
asSpy(TestBed.inject(CartService)); // T → Spy<T>,  for the helpers
```

Both are the same object at runtime. `injectSpy(X)` already returns `Spy<X>`.

The compiler reports this in four different ways, none of which contains both the words "spy" and
"instance", which is why the fix is hard to find from the message alone:

| Message | Direction | Fix |
| --- | --- | --- |
| `TS2352: … 'accessorSpies' is missing in type 'Router'` | `T` → spy | `asSpy(TestBed.inject(Router))` |
| `TS2739` / `TS2740: Type 'Spy<X>' is missing the following properties from type 'X'` | spy → `T` | `asInstance(spy)` |
| `TS2345: Argument of type 'Spy<X>' is not assignable to parameter of type 'X'` | spy → `T` | `asInstance(spy)` |
| `is missing the following properties: _modalOpened, body, …` (private names) | — | declare `Spy<T>`, not `Mocked<T>` |

That last row is its own trap: Vitest's `Mocked<T>` keeps `T`'s **private** members, so the error
lists private field names and reads as "the double is incomplete". It is not — the declaration is
wrong. `Spy<T>` covers the public surface on purpose.

**A generic class needs its type argument spelled out.** `TestBed.inject` infers from the
constructor and produces `Service<any>`, and the `any` surfaces much later as a mismatch between
`AddPromiseSpyMethods<unknown>` and `WithMockReturnValue<…>` — eight levels deep, and nothing about
it says "type parameter":

```ts
const config = asSpy<FeatureFlagService>(TestBed.inject(FeatureFlagService)); // ✅
const config = injectSpy<FeatureFlagService>(FeatureFlagService);             // ✅
```

`injectSpy(X)` without the argument keeps a declared default when the constructor does not take the
type parameter. When it does — `constructor(public data: T, …)`, the shape of most modal refs — 5.19.0
inferred `X<never>`, and with the typed `accessorSpies` bag `Spy<X<never>>` no longer assigns to
`Spy<X<unknown>>`. Such a class is now read at its **constraint**: `ModalRef<T = unknown>` gives
`Spy<ModalRef<unknown>>`, `ConfigService<T extends Config = Defaults>` gives
`Spy<ConfigService<Config>>`. A constructor cannot hand TypeScript the default here, so spell the
argument out whenever the default or a particular instantiation is what the spec means:
`injectSpy<ConfigService>(ConfigService)`, `injectSpy<ModalRef<PurchaseOptions>>(ModalRef)`.

It applies to `createSpyFromClass` with a configuration too, in one combination: an accessor list
(or `overrides`) **and** `returns` on a generic class. TypeScript checks a generic class argument
after the configuration, reads `T` back from `gettersToSpyOn: ['flagsConfig']` as
`{ flagsConfig: any }`, and fails with `'isKeyEnabled' does not exist in type
'MethodReturns<{ flagsConfig: any; }>'`. Spell it out — `createSpyFromClass<FlagsConfigService>(…)`.
`provideAutoSpy`, `overrideAutoSpy`, `overrideComponentProvider` and the class overload of
`registerAutoSpyDefaults` (`/angular`) take `T` from the class alone, so there the inferred form
compiles; the core `registerAutoSpyDefaults` needs the argument spelled out like
`createSpyFromClass`. A token key needs nothing: `T` comes from the `InjectionToken<T>` itself.

**A declared default now reaches the double, and used not to.** `class FlagsConfigService<T =
FlagsConfigDefaults>` handed to `createSpyFromClass` / `injectSpy` inferred `T` as `unknown`, so
every member typed against it read as `unknown` on a class that had said exactly what it should be.
Two shapes caused it, both fixed: the `& { [key: string]: any }` intersection `ClassType<T>` used to
carry (an index signature makes inference drop the default) and the union in `injectSpy`'s token
parameter (a union does too — a class now matches a bare construct-signature overload first).
Spelling the argument out still works and is still the answer when the class has **no** default.

**A generic _method_ is a different thing, and it does collapse.** `show<T, U>(component: Type<T>,
data: U)` on a modal or factory service reaches `Spy<T>` through `Parameters` / `ReturnType`, which
instantiate the method's own type parameters — so the double types as `show(component: Type<unknown>,
data: unknown)`. No mapped type in TypeScript can preserve a generic signature, so this is a limit
rather than a defect, and it is usually harmless: `unknown` accepts every argument and every seeded
return, so `spy.show.calledWith(MyModal, data).mockReturnValue(ref)` compiles. It bites only where
the instantiated type appears in a **contravariant** position; there, name the shape on a declaration
of your own and assign the factory's result to it.

---

## 7. Resetting

```ts
import { clearAutoSpy, resetAutoSpy } from 'vitest-auto-spy';

clearAutoSpy(service); // recorded calls only — configured returns survive
resetAutoSpy(service); // calls AND configuration (calledWith / resolveWith / mockReturnValue)
```

Both cover method spies **and** accessor spies, on `createSpyFromClass` spies and `createAutoMock`
proxies alike. Reach for these instead of looping over methods calling `mockClear` by hand.

**`mockReset()` on one method keeps its `calledWith` chains** — they live in the library's state, where
the runner's reset cannot reach — so `spy.isFeatureOn.mockReset(); spy.isFeatureOn.mockReturnValue(true)`
still reports that `mockReturnValue()` replaced a configured chain (and throws under `strict`). To
answer one value for every call after a `beforeEach` configured `calledWith(…)`, drop the chain with
`resetAutoSpy(spy.isFeatureOn)` first; the report names it.

**`resetAutoSpy` is `vi.resetAllMocks()` for one double**, and two things it used to leave behind now
go with the rest: a pending `mockReturnValueOnce` / `mockResolvedValueOnce` queue (it used to answer
the first call _after_ the reset, in a later test) and an accessor spy's configuration (a
`accessorSpies.getters.x.mockReturnValue(…)` used to survive and hand the next test the previous
test's value). A spec that relied on a queued `Once` value outliving the reset reads `undefined`
now. The double stays usable: the library's own dispatch is put back afterwards, so a fresh
`calledWith` configures it as normal.

Every double also carries `[Symbol.dispose]()` — it runs `resetAutoSpy(this)` — so an `afterEach`
that exists only to reset one spy can be deleted:

```ts
it('loads', () => {
  using cart = createSpyFromClass(Cart); // reset when the block ends

  cart.total.calledWith().mockReturnValue(42);
  expect(cart.total()).toBe(42);
});
```

`createAutoMock` proxies and **every `mockDeep` node** carry it (so `using` on a sub-tree resets that
sub-tree). The key is non-enumerable, so a spread does not copy it, and there is no
`[Symbol.asyncDispose]`. A standalone `createFunctionSpy` is **not** covered: Vitest's own
`[Symbol.dispose]` on a host mock restores the original implementation instead — call
`resetAutoSpy(spy)` there. If the project does not transpile `using`, call `spy[Symbol.dispose]()`.

`src/lib/dispose-symbol.ts` installs `Symbol.dispose` when the realm has none, and `DISPOSE` — not
`Symbol.dispose` — is what library code compares against. Node 22 has no explicit resource
management in V8: it patches the symbol in itself, as `Symbol.for('nodejs.dispose')`, onto the main
realm only, so under `jsdom` / `happy-dom` (a bare `vm` context) it is absent, the downlevelled
`using` throws out of `tslib.__addDisposableResource`, and `spy[Symbol.dispose]` degrades into a
property named `"undefined"`. The shim is the same registry symbol, so it is identical to Node's
across realms.

---

## 8. Observable assertions (core entry — no rxjs needed)

In [`agent-docs/observables.md`](./agent-docs/observables.md). Read it when asserting what a stream emitted, and for `createLog()`, the order between spies.

<!-- agents-outline: agent-docs/observables.md -->

- `createLog()` — the order between the spies

<!-- /agents-outline -->

---

## 9. Patching properties (and putting them back)

In [`agent-docs/properties.md`](./agent-docs/properties.md). Read it when a test overrides a getter, a readonly property, a signal property or a DOM object property and has to put it back.

<!-- agents-outline: agent-docs/properties.md -->

- Properties of DOM objects — the same helpers, and the reason to look for them

<!-- /agents-outline -->

---

## 10. Setup file

In [`agent-docs/setup.md`](./agent-docs/setup.md). Read it when the task touches `setupAutoSpy()` or the setup file, or when a guard failed a file: stray timers, console output, sealed globals, leftovers on `<body>`.

<!-- agents-outline: agent-docs/setup.md -->

- What a method spy is, and the one thing that differs from `vi.fn()`
- Freezing and counting the clock
- Asserting focus
- Shared fixtures are functions, not constants
- A stub must be re-installed for every test
- Naming the file that sealed a global
- Naming the file that polluted `Object.prototype`
- Naming the test that left an attribute on `<body>`
- Failing on console output nothing absorbed
- One grade for everything — `preset: 'strict'`
- Hook order differs from Jest

<!-- /agents-outline -->

---

## 11. Waiting: four queues, and which tool drives each

In [`agent-docs/waiting.md`](./agent-docs/waiting.md). Read it when a test waits for something: change detection, effects, timers, microtasks and dynamic imports are four queues, each with its own tool.

<!-- agents-outline: agent-docs/waiting.md -->
<!-- /agents-outline -->

---

## 12. Doubles for what the code builds itself

In [`agent-docs/doubles.md`](./agent-docs/doubles.md). Read it when production code does `new Foo()`, touches `<video>`, `localStorage`, animation frames or element boxes, or a module mock did nothing.

<!-- agents-outline: agent-docs/doubles.md -->

- `<video>` and `<audio>`
- `localStorage` and `sessionStorage`
- Animation frames and element boxes
- A module mock that did nothing

<!-- /agents-outline -->

---

## 13. Angular

In [`agent-docs/angular.md`](./agent-docs/angular.md). Read it for any spec that uses `TestBed`, signals, Angular HTTP, the router or an Angular double.

<!-- agents-outline: agent-docs/angular.md -->

- The same thing as fixtures — `extendWithAutoSpies` (Vitest 4.1+)
- Signals — which helper depends on whose signal it is
- Observers the component constructs itself
- A component's own `providers` win, and the symptom is nowhere near the cause
- `injectSpy` cannot reach a component-level provider
- An NgModule that contributes nothing
- A component whose own definition has a hole in it
- Four silent failures, as one setup line
- `httpResource()` and `HttpClient` in two lines — `vitest-auto-spy/angular-http`
- `ActivatedRoute` from one record — `vitest-auto-spy/angular-router`
- `Router` from one URL — `vitest-auto-spy/angular-router`
- `Location` from Angular's own testing classes — `vitest-auto-spy/angular-router`
- Signal forms — `vitest-auto-spy/signal-forms`
- `window` and `document` over the real ones — `provideWindowDouble` / `provideDocumentDouble`
- The Material dialog trio — `provideMatDialogData` / `provideMatDialogRef`
- Which collaborators the code asked for — `trackInjections`
- Never mock `@angular/core` to control an `effect()`
- Counting recomputations and effect runs — `trackRecomputations` / `trackEffectRuns`
- ngrx `rxMethod`
- Angular under `bun test`
- Zone and zoneless spec files in one worker
- A dependency behind an `InjectionToken`
- A host for a directive under test
- A stand-in for a child — `createComponentStub`
- Patching a property of a spy
- Rstest

<!-- /agents-outline -->

---

## 14. `fakeAsync` needs `vitest-auto-spy/zone`

```ts
// vitest.setup.ts — zone.js first (or the Angular builder loads it), then the patch
import 'vitest-auto-spy/zone';
```

`zone.js/testing` patches jasmine, mocha and jest — not Vitest — so without this every `fakeAsync`
fails with `Expected to be running in 'ProxyZone', but it was not found`. Needs
`test: { globals: true }`: the patch replaces the runner globals, and an imported `it` is a module
binding nothing can reach.

One proxy zone serves the whole run (`scope: 'shared'`, the default), because that is what Angular's
jasmine patch does and what the ecosystem expects: a component built in `beforeEach` schedules from
its constructor, and `tick()` in the `fakeAsync` test has to see those timers. Use
`installProxyZonePatch({ scope: 'callback' })` for `test.concurrent`, where two callbacks are in
flight at once and would otherwise swap the same `ProxyZoneSpec` delegate under one another.

Calling `installProxyZonePatch()` yourself is idempotent now: a second call is a no-op instead of
wrapping the previous wrapper, and so is the undo it returns. Under `isolate: false` an explicit
call in a setup file used to add a `Proxy` layer per spec file — two hundred layers at two hundred
files, every `fakeAsync` callback paying for all of them.

**Invariant of this package, not a detail of one release:** `zone.js` is a **devDependency and only a
devDependency** — never a dependency, never a peer, not even an optional one. Everything about zones
lives behind this one subpath; no other entry reaches it, even transitively, and the module imports
no zone.js of its own (it reads `globalThis.Zone`, which the consumer loaded). Do not add a
convenient re-export from the root: it would quietly hand zone.js to every zoneless consumer.

---

## 15. Other adapters

In [`agent-docs/adapters.md`](./agent-docs/adapters.md). Read it for NestJS, Vue, React, Svelte, `bun test`, `node:test`, Rstest and the console entry.

<!-- agents-outline: agent-docs/adapters.md -->
<!-- /agents-outline -->

---

## 16. ESLint plugin (flat config only)

In [`agent-docs/eslint.md`](./agent-docs/eslint.md). Read it when configuring `vitest-auto-spy/eslint-plugin` or fixing one of its reports.

<!-- agents-outline: agent-docs/eslint.md -->
<!-- /agents-outline -->

---

## 17. Error → fix

In [`agent-docs/errors.md`](./agent-docs/errors.md). A table from the text of a failure to its fix. Do not read it front to back — grep it by the message: `grep -n -F '<text of the error>' node_modules/vitest-auto-spy/agent-docs/errors.md`.

<!-- agents-outline: agent-docs/errors.md -->
<!-- /agents-outline -->

---

## 18. Do not write this

In [`agent-docs/anti-patterns.md`](./agent-docs/anti-patterns.md). Read it before writing a spec: the table of patterns to avoid with what to write instead, and advice that circulates and is wrong on Vitest.

<!-- agents-outline: agent-docs/anti-patterns.md -->

- Advice that circulates and is wrong on Vitest

<!-- /agents-outline -->

---

## 19. Before you report success

In [`agent-docs/checklist.md`](./agent-docs/checklist.md). Read it before reporting a task done: what to run, and the checks for a slow suite, a `jest-auto-spies` migration and a codemod over specs.

<!-- agents-outline: agent-docs/checklist.md -->

- If you were asked why a suite is slow
- Migrating a suite off `jest-auto-spies` — run the codemod, then verify it
- If you are writing a codemod over specs

<!-- /agents-outline -->

---

## 20. Migrating a suite off `jasmine-auto-spies`

In [`agent-docs/migration-jasmine.md`](./agent-docs/migration-jasmine.md). Read it when moving a suite off `jasmine-auto-spies`.

<!-- agents-outline: agent-docs/migration-jasmine.md -->

- The renames, once the suite is green
- Four traps, all of them silent
- `@hirez_io/observer-spy` comes with it

<!-- /agents-outline -->
