# vitest-auto-spy — instructions for AI coding agents

Reference for an agent **writing tests with `vitest-auto-spy`** in someone else's project: typed
test spies generated from a class, a type, or nothing at all, on Vitest, `bun:test`, `node:test` and
Rstest. It ships in the npm package, so it works offline: `node_modules/vitest-auto-spy/AGENTS.md`.
Working on the library's own source? Read `CONTRIBUTING.md` in the repository instead.

The spec you will write most often, an Angular service with a spied store and HTTP (the full recipe
is §3):

```ts
import { TestBed } from '@angular/core/testing';
import { type Spy, injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

let store: Spy<CartStore>;

beforeEach(() => {
  TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAutoSpy(CartStore)] });
  store = injectSpy(CartStore);
});

it('posts the order', async () => {
  const order = TestBed.inject(OrderService).checkout(); // Promise<Order>, sent through HttpClient

  await expectRequest('/api/orders', { method: 'POST' }).flush({ id: 1 });
  await expect(order).resolves.toEqual({ id: 1 });
  expect(store.clear).toHaveBeenCalled();
});
```

To point a team's agents at this file, run `npx vitest-auto-spy init`: it adds a pointer to
`AGENTS.md`, `CLAUDE.md`, `GEMINI.md` and the rule files of tools already set up, all or nothing.
`--check` is the CI form and fails on a `stale` hand-made skill copy (delete it, re-run `init`) or an
`edited` managed block. `--only CLAUDE.md,.claude` limits it to untracked files. Full table:
<https://asdalexey.github.io/vitest-auto-spy/utilities/cli>.

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
| observer-spy shim | `vitest-auto-spy/observer-spy` | `subscribeSpyTo` — the `@hirez_io/observer-spy` surface (§20). |
| Console spies | `vitest-auto-spy/console` | silent typed spies over the global `console` — `useConsoleSpies()` in the `describe` (or `installConsoleSpies()` per test, `restoreConsole()` after); `consoleOutput()` is everything logged, keyed by channel, `consoleLines()` the same in call order. No `vitest` import: loads on every runner |
| DOM stubs | `vitest-auto-spy/dom-stubs` | `stubIntersectionObserver` / `stubResizeObserver` / `stubMutationObserver` / `stubObserver`, `stubMediaElement`, `stubAbortController`, `stubWebStorage` (§12), `stubAnimationFrame`, `stubElementRect`, `intersectionEntry` / `resizeEntry` / `mutationRecord`, `createElementStub` (an `HTMLElement` for `ElementRef`), `fillMissingDomApis` (setup file). |
| Run diagnostics | `vitest-auto-spy/diagnostics` | `compareTestRuns`, `summarizeTestRun`, `formatTestRunComparison`, `diffByField`. |
| Angular HTTP | `vitest-auto-spy/angular-http` | `provideHttpTesting`, `expectRequest` — `httpResource()` / `HttpClient` (§13). Optional `@angular/common` peer, this entry only |
| Angular router | `vitest-auto-spy/angular-router` | `provideActivatedRoute`, `injectActivatedRoute` — an `ActivatedRoute` whose streams and snapshot share one record; `provideRouterDouble`, `injectRouterDouble` — a `Router` whose URL, `routerState` and `events` agree (§13). Optional `@angular/router` peer, this entry only |
| Angular diagnostics | `vitest-auto-spy/angular/diagnostics` | `enableAngularDiagnostics` and the whole TestBed timing family (§13). Companion to `/angular`, no core re-export |
| Angular doubles | `vitest-auto-spy/angular/doubles` | The Material dialog trio, the `Window`/`Document` doubles, `providePlatform`, and `DomSanitizer` / `ChangeDetectorRef` / CDK `Overlay` doubles (§13). Companion to `/angular`; registers the Vitest adapter, so its doubles spy out of the box |
| Angular matchers | `vitest-auto-spy/angular/matchers` | `registerDirectiveMatchers`, `registerResourceMatchers`, `registerSignalMatchers` (§13). Companion to `/angular`, no core re-export |
| Signal forms | `vitest-auto-spy/signal-forms` | `createForm`, `registerFormMatchers` — a signal form built where `form()` can inject, and `toHaveFieldErrors` over what it produced (§13). Optional `@angular/forms` peer, this entry only; Angular 22+ |
| Setup helpers | `vitest-auto-spy/setup` | `setupAutoSpy()`, `setupFakeTimers()`, `withFakeTimers()`, `blockNetwork()`, `stubResponse()`; the entry imports Vitest, so it is not for `bun test` |
| Zone patch | `import 'vitest-auto-spy/zone'` | `fakeAsync` / `waitForAsync` on Vitest (§14) |
| jasmine compat | `vitest-auto-spy/jasmine` | `.and` / `.calls` / `.withArgs`, the `jasmine` namespace (§20) |

**Runner limits of two add-ons.** `/jasmine` and `/setup` import Vitest, so they are Vitest-only.

- `bun test` / `node --test` and jasmine's API: call `enableJasmineCompat()` from
  `vitest-auto-spy/jasmine-compat`.
- `bun test` and teardown: nothing restores a `spyOn`, a `mock*Prop` patch or a file-scope auto-spy
  between tests. Put `afterEach(() => { restoreMockedProps(); mock.restore(); })` in a `--preload`
  file, with any `mock.module()` (inside a test it swaps bindings after the module already ran).

**Requirements.**

- rxjs **>= 7.2** (not `>=7`); every Angular 16–22 project already has it.
- The Angular entries need **Angular >= 20**: `@angular/core`, `@angular/common`,
  `@angular/platform-browser`, `@angular/router`, all optional peers on one range. Below 20 the
  `/bun-angular` preload throws before the first spec.
- The package is **ESM**. Only `/node` and `/eslint-plugin` also ship CommonJS; every other entry
  is ESM-only, and `require()` of a Vitest-backed one throws. `require('vitest-auto-spy/eslint-plugin')` is typed as `export =`.
- Every peer is optional, `vitest` included (range `>=2.1.0`). `/node`, `/bun`, `/bun-angular`,
  `/rstest`, `/jasmine-compat`, `/angular-router`, `/console`, `/nestjs`, `/observer-spy` and `/rxjs`
  type-check with no Vitest installed and `skipLibCheck: false`. A Vitest suite that imports only
  runner-free entries gets spies without `mockThrow` until one file adds
  `import type {} from 'vitest-auto-spy';`.
  `@angular/compiler` (`/angular/matchers`, `/bun-angular`) and `@rstest/core` (`/rstest`) are
  optional peers too.
- `vitest-auto-spy/package.json` resolves, for tools that read a dependency's manifest. No
  declaration needs `@types/node` or `lib: esnext.disposable`.

Why these floors: <https://asdalexey.github.io/vitest-auto-spy/core/compatibility>.

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

In an Angular app the spy almost always arrives through DI: `provideAutoSpy` in the providers,
`injectSpy` to read it. Write that shape first.

```ts
import { TestBed } from '@angular/core/testing';
import { type Spy, injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

describe('TaskService', () => {
  let projects: Spy<ProjectStore>;
  let feed: Spy<NewsFeedService>;
  let service: TaskService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ...provideHttpTesting(), // HttpClient + the testing backend
        provideAutoSpy(NotificationService), // plain service: nothing to configure
        provideAutoSpy(ProjectStore, { instanceMethodsToSpyOn: ['current'] }), // a signal member
        provideAutoSpy(NewsFeedService, { observablePropsToSpyOn: ['connected$'] }), // an Observable property
      ],
    });

    projects = injectSpy(ProjectStore);
    feed = injectSpy(NewsFeedService);

    projects.current.mockReturnValue({ id: 1 }); // defaults every test needs, once
    projects.fetchAll.resolveWith([]); // a Promise method
    feed.connected$.nextWith(true); // needs `import 'vitest-auto-spy/rxjs'` in the setup file

    service = TestBed.inject(TaskService);
  });

  it('saves through the API and tells the store', async () => {
    let saved: Task | undefined;
    service.save(task).subscribe((result) => (saved = result)); // HttpClient.post inside

    const request = expectRequest('/api/tasks', { method: 'POST' });
    expect(request.request.body).toEqual(task);
    await request.flush({ ...task, id: 7 }); // await flush(), not subscribe()

    expect(saved?.id).toBe(7);
    expect(projects.refresh).toHaveBeenCalled(); // every method is a spy, configured or not
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

| Member of the dependency | How to declare it | How to seed it |
| --- | --- | --- |
| method returning a value | nothing | `spy.m.mockReturnValue(v)` or `spy.m.calledWith(args).mockReturnValue(v)` |
| method returning `Promise<T>` | nothing | `spy.m.resolveWith(v)` / `rejectWith(e)` (§4) |
| method returning `Observable<T>` | nothing | `spy.m.nextWith(v)` / `throwWith(e)` (§4, needs `/rxjs`) |
| `Observable` property (`items$`) | `observablePropsToSpyOn: ['items$']` | `spy.items$.nextWith(v)` |
| signal / `computed` member of a dependency | `instanceMethodsToSpyOn: ['items']` | `spy.items.mockReturnValue(v)`; a value that changes mid-test: `mockSignalProp` (§13) |
| plain data field | `overrides: { field: value }` | set in the provider (§5) |

Rules that carry most of the value:

1. **One `configureTestingModule` per `describe`.** Reconfiguring per `it()` compiles the module for
   every test, the largest avoidable cost in an Angular suite.
2. **Declare each spy as `Spy<T>`, never as `T`** (§6).
3. **Seed defaults in `beforeEach`, override in the test.** An unconfigured method returns
   `undefined`, and the failure surfaces far from its cause. Seed before `TestBed.inject(ClassUnderTest)`
   when its constructor or field initialisers read the dependency.
4. **`provideAutoSpy` is lazy by default**, so listing a wide service costs nothing for the methods a
   test never touches.
5. **Two import lines.** `provideAutoSpy`, `injectSpy` and the `Spy<T>` type come from
   `vitest-auto-spy/angular`; `createSpyFromClass`, `createAutoMock`, `asSpy` and `asInstance` only
   from `vitest-auto-spy`.

---

## 4. Helpers a spied method earns from its return type

In [`agent-docs/return-helpers.md`](./agent-docs/return-helpers.md). Read it when stubbing a return value: `calledWith`, `resolveWith`, `nextWith`, `returnSubject` and the rest, by return type.

<!-- agents-outline: agent-docs/return-helpers.md -->
<!-- /agents-outline -->

---

## 5. `createSpyFromClass` configuration

In [`agent-docs/configuration.md`](./agent-docs/configuration.md). Read it when passing a config to `createSpyFromClass`: which lists add and which restrict, `registerAutoSpyDefaults`, `strict`, getters and setters.

<!-- agents-outline: agent-docs/configuration.md -->

- `instanceMethodsToSpyOn` for members discovery cannot see
- The composition belongs to the class — `registerAutoSpyDefaults`
- `strict` — a method nobody configured throws instead of answering `undefined`
- Getters and setters live in `accessorSpies`

<!-- /agents-outline -->

---

## 6. `Spy<T>` is not assignable to `T` — this is intentional

`Spy<T>` is a **mapped type**, so it drops `#private` and `private` members. Declare doubles as
`Spy<T>`, and convert at the boundary with the two named views:

```ts
import { asInstance, asSpy } from 'vitest-auto-spy';

let users: Spy<UserService> = createSpyFromClass(UserService); // ✅
let users: UserService = createSpyFromClass(UserService); // ❌ private members missing

new ProfileFacade(asInstance(users)); // Spy<T> → T, for an API typed against the class
const cart = asSpy(TestBed.inject(CartService)); // T → Spy<T>, for the helpers
```

Both are the same object at runtime. `injectSpy(X)` already returns `Spy<X>`. The double a
`returnsClass` method answers is `innerDouble(outer, 'create')`, typed `Spy<Report>` and read
without recording a call on `create`; for a generic method name the type,
`innerDouble<DialogRef<Comp>>(dialog, 'open')`. Do **not** patch the
mismatch with `as any`, `as unknown as T` or `@ts-expect-error`.

| Compiler message | Direction | Fix |
| --- | --- | --- |
| `TS2352: … 'accessorSpies' is missing in type 'Router'` | `T` → spy | `asSpy(TestBed.inject(Router))` |
| `TS2739` / `TS2740: Type 'Spy<X>' is missing the following properties from type 'X'` | spy → `T` | `asInstance(spy)` |
| `TS2345: Argument of type 'Spy<X>' is not assignable to parameter of type 'X'` | spy → `T` | `asInstance(spy)` |
| `is missing the following properties: _modalOpened, body, …` (private names) | — | declare `Spy<T>`, not Vitest's `Mocked<T>` (it keeps private members, so the list reads like an incomplete double) |

**A generic class: spell the type argument out.** `TestBed.inject` infers `Service<any>`, and the
`any` surfaces far away as a mismatch between `AddPromiseSpyMethods<unknown>` and
`WithMockReturnValue<…>`:

```ts
const config = asSpy<FeatureFlagService>(TestBed.inject(FeatureFlagService)); // ✅
const config = injectSpy<FeatureFlagService>(FeatureFlagService); // ✅
const modal = injectSpy<ModalRef<PurchaseOptions>>(ModalRef); // a particular instantiation
```

- `injectSpy(X)` without the argument keeps a declared default (`class X<T = Defaults>`). When the
  constructor takes the type parameter (`constructor(public data: T)`), it reads the **constraint**:
  `ModalRef<T = unknown>` gives `Spy<ModalRef<unknown>>`. Spell the argument out when the spec means
  the default or one instantiation.
- `createSpyFromClass` needs the argument in one combination: a generic class with an accessor list
  (or `overrides`) **and** `returns`. The symptom: `'isKeyEnabled' does not exist in type
'MethodReturns<{ flagsConfig: any; }>'`. Write `createSpyFromClass<FlagsConfigService>(…)`. The
  core `registerAutoSpyDefaults` needs it the same way.
- `provideAutoSpy`, `overrideAutoSpy`, `overrideComponentProvider` and the `/angular` class overload
  of `registerAutoSpyDefaults` take `T` from the class alone. A token needs nothing: `T` comes from
  `InjectionToken<T>`.

**A generic method collapses to `unknown`.** `show<T, U>(component: Type<T>, data: U)` types on the
double as `show(component: Type<unknown>, data: unknown)`; no mapped type can keep a generic
signature. Usually harmless: `spy.show.calledWith(MyModal, data).mockReturnValue(ref)` compiles.
Where the instantiated type sits in a contravariant position, name the shape on a declaration of
your own and assign the factory's result to it.

Details: <https://asdalexey.github.io/vitest-auto-spy/core/spy-typing>.

---

## 7. Resetting

Use these instead of looping over methods calling `mockClear` by hand:

```ts
import { clearAutoSpy, resetAutoSpy } from 'vitest-auto-spy';

clearAutoSpy(service); // recorded calls only; configured returns survive
resetAutoSpy(service); // calls AND configuration (calledWith / resolveWith / mockReturnValue)
```

| Call | Clears calls | Clears configuration | Also clears |
| --- | --- | --- | --- |
| `clearAutoSpy(x)` | yes | no | — |
| `resetAutoSpy(x)` | yes | yes | pending `mockReturnValueOnce` / `mockResolvedValueOnce` queues, accessor spies' configuration |
| `spy.m.mockReset()` | yes | runner state only | **not** the `calledWith` chains |

Both cover method spies **and** accessor spies, on `createSpyFromClass` spies and `createAutoMock`
proxies alike. `resetAutoSpy` is `vi.resetAllMocks()` for one double; the double stays usable, and a
fresh `calledWith` configures it as normal.

**Common mistake:** `spy.isFeatureOn.mockReset(); spy.isFeatureOn.mockReturnValue(true)` after a
`beforeEach` that configured `calledWith(…)`. The chain survives `mockReset()`, so the library reports
that `mockReturnValue()` replaced a configured chain (and throws under `strict`). Fix: call
`resetAutoSpy(spy.isFeatureOn)` first.

**`using` resets a double at block end.** Every double carries `[Symbol.dispose]()`, which runs
`resetAutoSpy(this)`, so an `afterEach` that exists only to reset one spy can go:

```ts
it('loads', () => {
  using cart = createSpyFromClass(Cart); // reset when the block ends

  cart.total.calledWith().mockReturnValue(42);
  expect(cart.total()).toBe(42);
});
```

- `createAutoMock` proxies and every `mockDeep` node carry it (`using` on a sub-tree resets that
  sub-tree). The key is non-enumerable, so a spread does not copy it. There is no
  `[Symbol.asyncDispose]`.
- A standalone `createFunctionSpy` is **not** covered: Vitest's own `[Symbol.dispose]` on it restores
  the original implementation instead. Call `resetAutoSpy(spy)` there.
- If the project does not transpile `using`, call `spy[Symbol.dispose]()`.
- Works under `jsdom` / `happy-dom` on Node 22, where the realm has no `Symbol.dispose`: the library
  installs the same registry symbol Node uses.

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
- Running with `isolate: false`
- Shared fixtures are functions, not constants
- A stub must be re-installed for every test
- Naming the file that sealed a global
- Naming the file that polluted `Object.prototype`
- Naming the test that left an attribute on `<body>`
- Failing on console output nothing absorbed
- A `TestBed` left dirty at file end — `cleanTestBed`
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
- An element for `ElementRef` — `createElementStub`
- The members the DOM environment leaves out — `fillMissingDomApis`
- A module mock that did nothing

<!-- /agents-outline -->

---

## 13. Angular

In [`agent-docs/angular.md`](./agent-docs/angular.md). Read it for any spec that uses `TestBed`, signals, Angular HTTP, the router or an Angular double.
For selected void window methods, use `createWindowSpies` from `/angular/doubles`; the window recipe is in that file.

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
- Platform, sanitizer, change detector and CDK overlay — `vitest-auto-spy/angular/doubles`
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
- Coming from spectator, Suites or Testing Library

<!-- /agents-outline -->

---

## 14. `fakeAsync` needs `vitest-auto-spy/zone`

Needed when a spec on Vitest uses `fakeAsync`, `tick` or `waitForAsync`. `zone.js/testing` patches
jasmine, mocha and jest, not Vitest.

```ts
// vitest.setup.ts: zone.js first (or let the Angular builder load it), then the patch
import 'vitest-auto-spy/zone';
```

| Option | Default | Meaning |
| --- | --- | --- |
| `installProxyZonePatch({ scope: 'shared' })` | `'shared'` | one proxy zone for the whole run, as Angular's jasmine patch does: `tick()` in the test sees timers a component scheduled in `beforeEach` |
| `installProxyZonePatch({ scope: 'callback' })` | — | one zone per test or hook; use it for `test.concurrent` specs that call `fakeAsync` |

- The import already installs `'shared'`. Call `installProxyZonePatch({ scope: 'callback' })` in the
  setup file, after the import, only to switch; a later import of the entry does not switch it back.
- Requires `test: { globals: true }`. The patch replaces the runner globals; an imported `it` is a
  module binding it cannot reach.
- A second call with the same scope is a no-op, and so is a second call of the undo it returns. The
  undo puts back what the call replaced.
- The entry imports no zone.js of its own: it reads `globalThis.Zone`, which the project loaded.

**Common mistake:** no import, or `globals: false`. Symptom: every `fakeAsync` fails with
`Expected to be running in 'ProxyZone', but it was not found`. Fix: the import above in the setup
file, and `globals: true`.

---

## 15. Other adapters

In [`agent-docs/adapters.md`](./agent-docs/adapters.md). Read it for NestJS, Vue, React, Svelte, `bun test`, `node:test`, Rstest and the console entry.

<!-- agents-outline: agent-docs/adapters.md -->

- `trackNodeMocks` for `node:test` memory
- Rstest

<!-- /agents-outline -->

---

## 16. ESLint plugin (flat config only)

In [`agent-docs/eslint.md`](./agent-docs/eslint.md). Read it when configuring `vitest-auto-spy/eslint-plugin` or fixing one of its reports. For `vitest/require-hook`, spread `autoSpy.hookRegisteringHelpers` into `allowedFunctionCalls` rather than keeping the names by hand.

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
