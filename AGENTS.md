# vitest-auto-spy — instructions for AI coding agents

You are looking at the agent-facing reference for **`vitest-auto-spy`**: typed test spies generated
from a class, a type, or nothing at all, on Vitest / `bun:test` / `node:test`.

This file is written for an agent **using** the library in someone's test suite. It is shipped
inside the npm package, so it is readable with no network:

```
node_modules/vitest-auto-spy/AGENTS.md
```

Working on the library's own source instead? Read `CONTRIBUTING.md` in the repository.

| Resource                | Where                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| Spec patterns at scale  | <https://asdalexey.github.io/vitest-auto-spy/recipes>                 |
| Docs index for LLMs     | <https://asdalexey.github.io/vitest-auto-spy/llms.txt>                |
| Entire docs as one file | <https://asdalexey.github.io/vitest-auto-spy/llms-full.txt>           |
| Human docs              | <https://asdalexey.github.io/vitest-auto-spy/>                        |
| Source                  | <https://github.com/ASDAlexey/vitest-auto-spy>                        |
| Types                   | `node_modules/vitest-auto-spy/dist/index.d.ts` (and one per subpath)  |

**Read `dist/*.d.ts` before inventing a call.** Every export is typed and documented there, and the
type is the authority when this file and the code disagree.

---

## 1. Pick the entry point first

Each entry registers its mock adapter **on import**. Importing the wrong one leaves the wrong
adapter installed and spies fail at runtime.

| Runner / framework    | Import from                     |
| --------------------- | ------------------------------- |
| Vitest (default)      | `vitest-auto-spy`               |
| `bun test`            | `vitest-auto-spy/bun`           |
| `bun test` + Angular  | `vitest-auto-spy/bun-angular`   |
| `node --test`         | `vitest-auto-spy/node`          |
| Angular + Vitest      | `vitest-auto-spy/angular`       |
| NestJS                | `vitest-auto-spy/nestjs`        |
| React                 | `vitest-auto-spy/react`         |
| Vue / Pinia           | `vitest-auto-spy/vue`           |
| Svelte                | `vitest-auto-spy/svelte`        |

Three add-ons, orthogonal to the runner:

| Add-on                          | Import                          | Needed for                                              |
| ------------------------------- | ------------------------------- | ------------------------------------------------------- |
| Observable spies                | `import 'vitest-auto-spy/rxjs'` | `nextWith` & friends. **Side-effect import, once.**      |
| Console spies                   | `vitest-auto-spy/console`       | silent typed spies over the global `console`             |
| Setup helpers                   | `vitest-auto-spy/setup`         | `setupAutoSpy()`, `setupFakeTimers()`                   |

`vitest-auto-spy/bun-angular` is **ESM-only**; everything else ships dual ESM + CJS.

---

## 2. Pick the factory

```
Do you have a real class at runtime?
├── yes → createSpyFromClass(Class, config?)          → Spy<T>
└── no  → Is the double CALLED by the code under test?
         ├── yes, and calls go one level deep → createAutoMock<T>(overrides?)  → Spy<T>
         ├── yes, and calls chain (a.b.c())    → mockDeep<T>(overrides?)       → DeepMockProxy<T>
         └── no, it is only READ (DTO, config, route snapshot)
                                                → createMock<T>(partial?)      → T   (no spies)

One standalone function?          → createFunctionSpy<Fn>('name')
Code under test does `new Foo()`? → createSpyClass(Foo)   (a vi.fn() rejects `new`)
```

`createMock<T>()` is the one to reach for on data shapes — it returns a plain `T`, so it satisfies a
`no-type-assertion` lint rule without an `eslint-disable` on every fixture.

---

### Cost, so it stops being a question

Building a spy is not a thing to optimise. Measured on a ten-method class:
`provideAutoSpy` ~8 µs, `createSpyFromClass` ~29 µs, `createAutoMock` ~33 µs, a `calledWith`
lookup ~0.7 µs. Five providers across two thousand tests is under a tenth of a second for the
whole run. Call the factory in `beforeEach` and look at `TestBed` instead — that is where a slow
spec spends its time.

`provideAutoSpy` is the fastest of the three because it defaults to `lazySpies: true`. The two
settings that do cost: `{ lazySpies: false }` gives that up, and `autoSpyAccessors: true` walks
the prototype chain uncached on every call — name the accessors instead.

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
import { injectSpy, mockReadonlyProp, provideAutoSpy, type Spy } from 'vitest-auto-spy/angular';

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
import { createSpyFromClass, type Spy } from 'vitest-auto-spy';

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

Every spied method is a real runner mock, so `mockReturnValue`, `mockImplementation`,
`toHaveBeenCalledWith` and the rest all work as usual. On top of that:

| Return type    | Helpers added                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| anything       | `calledWith(...args)` → `.mockReturnValue(v)` / `.returnValue(v)`, `mustBeCalledWith(...args)` → same        |
| `Promise<T>`   | `resolveWith(v)`, `rejectWith(v)`, `resolveWithPerCall([{ value }, …])`                                     |
| `Observable<T>`| `nextWith(v)`, `nextOneTimeWith(v)`, `nextWithValues(configs)`, `nextWithPerCall(configs)`, `throwWith(v)`, `complete()`, `returnSubject()` |

`Observable` **properties** (not just methods) get the same helpers — list them in
`observablePropsToSpyOn`.

```ts
// argument dispatch — other arguments return undefined
users.getName.calledWith(1).mockReturnValue('Ada');
// argument enforcement — other arguments throw
users.getName.mustBeCalledWith(1).mockReturnValue('Ada');
// asymmetric matchers work in both
users.save.calledWith(expect.objectContaining({ id: 1 })).mockReturnValue(true);

// promises
users.load.resolveWith({ id: 1 });
users.load.rejectWith('FAKE ERROR');
users.load.resolveWithPerCall([{ value: a }, { value: b }]);
expect(users.load.mock.settledResults).toEqual([{ type: 'fulfilled', value: { id: 1 } }]);

// observables — requires `import 'vitest-auto-spy/rxjs'` once
feed.items$.nextWith([item]);          // emit, stream stays open
feed.items$.nextOneTimeWith([item]);   // emit once, then complete
feed.items$.nextWithValues([{ value: a }, { value: b, delay: 100 }, { complete: true }]);
const [first$, second$] = feed.watch$.nextWithPerCall([{ value: 'a' }, { value: 'b', doNotComplete: true }]);
feed.items$.throwWith('FAKE ERROR');
const subject = feed.items$.returnSubject();  // ReplaySubject, for anything the helpers miss
```

`mock.settledResults` is native on Vitest and polyfilled on Bun / `node:test`, so it is identical on
all three. Entries are `{ type: 'fulfilled' | 'incomplete' | 'rejected', value }`.

---

## 5. `createSpyFromClass` configuration

```ts
createSpyFromClass(MyService);                        // every method on the prototype chain
createSpyFromClass(MyService, ['reload', 'count']);    // those two ADDED to the discovered ones
createSpyFromClass(MyService, {
  methodsToSpyOn: ['reload'],           // ADDS (jest-auto-spies semantics)
  onlyMethodsToSpyOn: ['getName'],      // RESTRICTS — skips prototype discovery
  instanceMethodsToSpyOn: ['reload'],   // ADDS; same behaviour, clearer name
  observablePropsToSpyOn: ['products$'],
  gettersToSpyOn: ['userName'],
  settersToSpyOn: ['userName'],
  autoSpyAccessors: true,               // discover every accessor on the prototype chain
  lazySpies: true,                      // build each method spy on first access
});
```

| Key                      | Semantics                                                                  |
| ------------------------ | -------------------------------------------------------------------------- |
| `methodsToSpyOn`         | **Additive**, as in `jest-auto-spies`. Same behaviour as `instanceMethodsToSpyOn`. |
| `onlyMethodsToSpyOn`     | **Exhaustive whitelist.** Skips discovery; anything not listed is absent.  |
| `instanceMethodsToSpyOn` | **Additive.** The name to prefer in new code (see below).                  |
| `autoSpyAccessors`       | Merged with the explicit getter/setter lists.                              |
| `lazySpies`              | Behaviour-identical; only changes *when* each spy is built.                |

**`instanceMethodsToSpyOn` is not an edge case — it is a top-5 option** (103 of ~370 spec files in
the reference suite). Method discovery walks the *prototype chain*; a callable assigned to an
**instance field** is invisible to it:

- an Angular `signal()` / `computed()` field — the dominant case in a signals codebase
- an arrow-function property — `readonly reload = (): void => {}`
- anything on an ngrx `signalStore()`, which puts **everything** on the instance

```ts
createSpyFromClass(TaskStore, { instanceMethodsToSpyOn: ['count', 'reload'] });
provideAutoSpy(ProjectStore, { instanceMethodsToSpyOn: ['current', 'isEmpty'] });
```

For an ngrx `signalStore()`, prefer `createAutoMock<T>()` over listing every member: it mocks from
the type, needs no prototype, and the list cannot fall behind the store.

The symptom of getting this wrong is **a spy that is never called and no warning at all**: the
additive lists exist precisely to name things the prototype does not have, so a typo in one cannot
be told apart from an instance field and stays silent.

Only `onlyMethodsToSpyOn` warns, because only a restricting list can be silently destructive — a
misspelling there leaves the real method unspied, and the code under test then calls something that
is not there:
`[vitest-auto-spy] createSpyFromClass(X): onlyMethodsToSpyOn names method(s) that are not on the class prototype: …`.

Also true, and worth not re-deriving:

- **Inherited methods are spied** — discovery walks the whole chain (`Object.prototype` excluded).
- **Constructor bodies never run.** The spy is assembled from the prototype.
- **Abstract classes work at runtime** but TypeScript refuses them as `ClassType<T>`. Pass a
  concrete subclass and keep the abstract class as the DI token.

### Getters and setters live in `accessorSpies`

```ts
const settings = createSpyFromClass(SettingsService, { gettersToSpyOn: ['theme'], settersToSpyOn: ['theme'] });

settings.accessorSpies.getters.theme.mockReturnValue('dark');
expect(settings.theme).toBe('dark');       // the property itself stays typed as `string`

settings.theme = 'light';
expect(settings.accessorSpies.setters.theme).toHaveBeenCalledWith('light');
```

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

asInstance(spy);                       // Spy<T> → T,  for an API typed against the class
asSpy(TestBed.inject(CartService));    // T → Spy<T>,  for the helpers
```

Both are the same object at runtime. `injectSpy(X)` already returns `Spy<X>`.

---

## 7. Resetting

```ts
import { clearAutoSpy, resetAutoSpy } from 'vitest-auto-spy';

clearAutoSpy(service); // recorded calls only — configured returns survive
resetAutoSpy(service); // calls AND configuration (calledWith / resolveWith / mockReturnValue)
```

Both cover method spies **and** accessor spies, on `createSpyFromClass` spies and `createAutoMock`
proxies alike. Reach for these instead of looping over methods calling `mockClear` by hand.

---

## 8. Observable assertions (core entry — no rxjs needed)

`expect()` inside a `subscribe()` callback is the classic green-but-empty test: if the stream never
emits, the callback never runs and nothing is asserted. Invert it — **the assertion is the `await`**:

```ts
import { expectEmission, expectEmissions, expectNoEmission } from 'vitest-auto-spy';

await expect(expectEmission(component.visible$)).resolves.toEqual([task]);
await expect(expectEmissions(source$, 3)).resolves.toEqual([1, 2, 3]);
await expectNoEmission(source$, { timeout: 50 });
```

Options: `{ timeout, label }`. `timeout` defaults to `1000` ms (`0` for `expectNoEmission`, and `0`
disables the watchdog — use it under fake timers). The source is duck-typed, so rxjs `Observable`s,
`Subject`s, Angular `toObservable()` results and hand-rolled subscribables all work.

---

## 9. Patching properties (and putting them back)

```ts
import { mockAccessorsProp, mockReadonlyProp, mockReadonlyPropGetter, mockValueProp, restoreMockedProps } from 'vitest-auto-spy';

mockReadonlyProp(service, 'isReady', true);         // static value, signals included
mockReadonlyPropGetter(service, 'label', () => 'A'); // dynamic getter
mockValueProp(service, 'retries', 3);                // plain writable value
mockAccessorsProp(service, 'theme');                 // spied get + set

restoreMockedProps(); // put every patch back; each helper also returns its own undo
```

`vi.restoreAllMocks()` does **not** undo these — it knows about spies, not about redefined
properties. Never use bare `Object.defineProperty` in a spec: nothing restores the original
descriptor, and under `isolate: false` the patch leaks into the next file.

---

## 10. Setup file

```ts
// vitest.setup.ts
import 'vitest-auto-spy/rxjs'; // once — enables observable spies everywhere
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy(); // { duplicateCopies: 'throw', restoreProps: true, restoreMocks: false }
```

`setupAutoSpy()` does three things: `restoreMockedProps()` in a global `afterEach`, a duplicate-install
check that fails the run, and (opt-in) `vi.restoreAllMocks()`. Turn on `restoreMocks: true` when the
suite runs with `isolate: false`.

**The one that only bites at scale:** with `isolate: false`, a `setTimeout` or
`requestAnimationFrame` a component schedules and never clears keeps running after its file is done,
and fires while the **next** file is mid-test. It is reported against that innocent file, as
`Schedulers cannot synchronously execute watches while scheduling`, `signal read during notification
phase`, or an unhandled rejection naming a component the failing file never imported. If you see any
of those, suspect the previous file, not the one that failed:

```ts
setupAutoSpy({ strayTimers: true }); // wrap the schedulers, sweep the survivors in afterAll
```

The pieces are exported too — `trackStrayTimers()` (idempotent, returns the undo),
`cancelStrayTimers()` (returns how many it cancelled) and `countStrayTimers()`, all from
`vitest-auto-spy/setup`. Use `expect(countStrayTimers()).toBe(0)` in an `afterEach` to make a leak
fail rather than be tidied away.

Two more switches, both about the environment rather than the spies:

```ts
setupAutoSpy({ blockNetwork: true }); // reject every fetch, naming what was requested
```

Only relevant under happy-dom, which — unlike jsdom — implements `fetch`. A component that pulls a
remote asset then really fetches it; nothing asserts on the response, so the tests pass, and the
aborts at teardown fail the run with **no test named**. If a green run exits 1 with
`DOMException [AbortError]`, this is it.

`restoreTimerGlobals` is on by default and needs no thought unless you turn it off: uninstalling
fake timers under happy-dom **deletes** `Date` instead of restoring it (the global is inherited from
the realm, not owned by `globalThis`), and with `isolate: false` the next file dies inside Vitest's
own `useFakeTimers` with `Cannot read properties of undefined (reading 'now')`. If you see that,
the file in the stack is not the cause.


Fake timers:

```ts
import { advanceTimers, setupFakeTimers } from 'vitest-auto-spy/setup';

setupFakeTimers();           // install + restore, paired
await advanceTimers(5_000);  // advance AND drain the microtasks a bare advanceTimersByTime leaves
```

---

## 11. Angular

```ts
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({
  providers: [provideAutoSpy(MyService), provideAutoSpy(ApiService, { methodsToSpyOn: ['get'] })],
});

const myService = injectSpy(MyService); // Spy<MyService>
```

`provideAutoSpy` defaults to `lazySpies: true` (the plain `createSpyFromClass` does not). Pass
`{ lazySpies: false }` to opt out. The spies never touch `NgZone`, so they work zoneless and with
zone.js alike.

### Signals — which helper depends on whose signal it is

```ts
// a DEPENDENCY's signal — name it, then configure the mock like any other
provideAutoSpy(ProjectStore, { instanceMethodsToSpyOn: ['current'] });
injectSpy(ProjectStore).current.mockReturnValue({ id: 1 });

// the CLASS UNDER TEST's own signal / computed / input — replace the field with a REAL signal
mockReadonlyProp(component, 'selected', signal(true));
mockReadonlyProp(component, 'items', signal([]));
mockReadonlyProp(component, 'host', signal({ nativeElement: element }));

// a value that changes during the test — keep the signal, set it
const selected = signal(false);

mockReadonlyProp(component, 'selected', selected);
selected.set(true); // every computed reading it updates
```

Pass a real `signal()`, not a `vi.fn()` returning a value — anything `computed()` downstream has to
recompute, and only a real signal notifies it.

`mockSignalProp` is that pair in one call, and hands back the writable half:

```ts
import { mockSignalProp } from 'vitest-auto-spy/angular';

const selected = mockSignalProp(component, 'selected', false);

selected.set(true); // every computed reading it updates
```

Use it whenever the value has to change during the test. `mockReadonlyProp` stays right when the
value is fixed for the whole test and you never need the handle.




### Observers the component constructs itself

Do not assign `globalThis.IntersectionObserver` by hand: it stays assigned, and under
`isolate: false` the next file inherits it.

```ts
import { intersectionEntry, stubIntersectionObserver } from 'vitest-auto-spy';

const observers = stubIntersectionObserver(); // also stubResizeObserver / stubMutationObserver

fixture.detectChanges(); // the component constructs it

observers.last.emit([intersectionEntry(element, true)]); // one batch, as the browser delivers it
await fixture.whenStable();

expect(observers.last.disconnected).toBe(true); // after the component is destroyed
```

`restoreMockedProps()` puts the real constructor back, so `setupAutoSpy()` covers the teardown.
`observers.last` throws if the code under test constructed nothing — render first, and install the
stub before the construction, not after.
### `injectSpy` cannot reach a component-level provider

`injectSpy(X)` reads the **global** `TestBed` injector. A provider declared on the component
(`@Component({ providers: [...] })`) lives in the element injector, which `TestBed.inject` never
sees. Go through the fixture and re-view the result:

```ts
const player = asSpy(fixture.debugElement.injector.get(PlayerService));

player.play.mockReturnValue(true);
```

### Never mock `@angular/core` to control an `effect()`

Under the Angular unit-test builder the specs are bundled and `@angular/core` sits in a shared
chunk, so `vi.mock('@angular/core', …)` re-enters a chunk that is still initialising and fails with
`Cannot access '__vi_import_N__' before initialization`. The same applies to any module those shared
chunks depend on, and to `vi.mock()` with a relative path (`./`, `../`), which has no module
boundary left to replace once bundled.

Assert the effect's **result** instead — set the signals it reads, let it run, check what it
produced:

```ts
mockReadonlyProp(component, 'state', signal(State.Selected));

await stable(fixture);

expect(component.icon()).toBe('favouritesFilled');
```

When the effect will never become dirty on its own — because its trigger is now a static signal —
run that one effect directly:

```ts
import { runEffect } from 'vitest-auto-spy/angular';

runEffect(component.highlightEffect); // runs the body now, with the current signal values
```

`flushEffects()` runs everything currently dirty; `runEffect(ref)` runs one specific effect
regardless. Prefer asserting the result where practical — `runEffect` reads Angular's reactive node,
and throws with instructions if a future version moves it.

### ngrx `rxMethod`

An `rxMethod` is a function with a `destroy` property. A bare mock has no `destroy`, so the
component's cleanup throws:

```ts
const load = Object.assign(vi.fn(), { destroy: vi.fn() });
```

```ts
// shallow rendering — configureTestingModule + NO_ERRORS_SCHEMA + overrideComponent, in one call
const { fixture, component } = renderShallow(TaskListComponent, {
  providers: [provideAutoSpy(TaskService)],
  inputs: { projectId: 42 }, // signal inputs take the VALUE, not the signal
});
// other options: imports, keepTemplate, keepChildren, template, beforeCreate, detectChanges

// build a class through DI, every unprovided token auto-spied
const { instance, spies } = createWithAutoSpies(CartService, {
  providers: [{ provide: TaxService, useValue: realTax }], // explicit providers win
});
spies.get(PricingService).total.mockReturnValue(100);
// NOTE: Injector.create() — it does NOT accept EnvironmentProviders (provideHttpClient() etc.)

// zoneless waiting
await stable(fixture); // flush effects, then await the fixture
flushEffects();        // the no-fixture half: services, stores, runInInjectionContext

// signal assertions
registerSignalMatchers();                        // once, in the setup file
expect(component.total).toHaveSignalValue(3);
```

Two zoneless traps:

- `fixture.detectChanges()` runs **one** change-detection pass and does **not** flush pending
  effects. Asserting right after it reads state that has not finished computing. Use `await stable(fixture)`.
- `expect(someSignal).toBeTruthy()` passes for **every** signal ever created — a signal is a
  function. Use `toHaveSignalValue`, which also rejects the missing-parentheses mistake.

Per-file timing, to find which specs actually pay for `TestBed`:

```ts
import { enableTestBedDiagnostics } from 'vitest-auto-spy/angular';

if (process.env['SPEC_TIMING']) { enableTestBedDiagnostics(); }
```

### Angular under `bun test`

`vitest-auto-spy/bun-angular` is a **preload**, not a normal import — it installs a DOM, inlines
`templateUrl` / `styleUrls` through a `Bun.plugin` hook and boots a zoneless TestBed:

```toml
# bunfig.toml
[test]
preload = ["vitest-auto-spy/bun-angular"]
```

It re-exports everything in this section except `registerSignalMatchers` and the TestBed
diagnostics, which need the runner's `expect.extend` and suite-level hooks.

---

## 12. Other adapters

```ts
// NestJS
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/nestjs';
const moduleRef = await Test.createTestingModule({ providers: [provideAutoSpy(MyService)] }).compile();
const spy = injectSpy(moduleRef, MyService);

// Vue / Pinia — provideAutoSpy(token, Class, methodsOrConfig?) returns a `global.provide` map
import { provideAutoSpy } from 'vitest-auto-spy/vue';
const provide = provideAutoSpy(UserServiceKey, UserService);
provide[UserServiceKey].getName.mockReturnValue('Ada');
mount(Greeting, { global: { provide } });
// a setup-store (`defineStore('x', () => …)`) is not a class — use createAutoMock<T>() there

// React / Svelte — the core API, re-exported with the right adapter registered
import { createSpyFromClass } from 'vitest-auto-spy/react';
```

Console spies — importing the entry replaces `console.debug` / `error` / `info` / `log` / `time` /
`timeEnd` / `trace` / `warn` with silent typed spies, named `console<Method>Spy`:

```ts
import { consoleInfoSpy, consoleWarnSpy, resetConsoleSpies, restoreConsole } from 'vitest-auto-spy/console';

expect(consoleInfoSpy).toHaveBeenCalledWith('done'); // the output is silenced, not printed
```

Import your runtime entry (`…/bun`, `…/node`) **before** `…/console`, or it registers the Vitest
adapter. Prefer not to touch the real global? `createAutoMock<Console>()` gives a detached one.

---

## 13. ESLint plugin (flat config only)

```js
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [{ files: ['**/*.spec.ts'], ...autoSpy.configs.recommended }];
```

| Rule                           | Level   | Flags                                                                |
| ------------------------------ | ------- | -------------------------------------------------------------------- |
| `no-expect-in-subscribe`       | `error` | `expect()` inside `subscribe()` → `expectEmission`                    |
| `no-object-define-property`    | `error` | `Object.defineProperty` in a spec → `mockReadonlyProp` / `mockValueProp` |
| `prefer-provide-auto-spy`      | `warn`  | `{ provide: X, useValue: { a: vi.fn() } }` → `provideAutoSpy(X)`      |
| `prefer-create-spy-from-class` | `warn`  | an object literal of 2+ `vi.fn()`s → `createSpyFromClass`             |
| `prefer-inject-spy`            | `warn`  | `vi.spyOn(TestBed.inject(X), 'm')` → `injectSpy(X)`                   |

The legacy `.eslintrc` `plugins: []` form cannot work — it resolves names to `eslint-plugin-*`
packages, which a subpath export can never be.

---

## 14. Error → fix

| Message contains                                              | Cause                                                | Fix                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| `No mock adapter registered`                                   | no runtime entry was imported, or the wrong one       | import `vitest-auto-spy` (Vitest) / `…/bun` / `…/node` once before creating spies |
| `Observable spies require rxjs`                                | the rxjs layer was never loaded                       | `import 'vitest-auto-spy/rxjs';` once, in the setup file                      |
| `requested method(s) not found on the class prototype`          | typo, or an instance-field callable                   | fix the name, or move it to `instanceMethodsToSpyOn`                          |
| `was configured with 'mustBeCalledWith'`                        | the code called the spy with other arguments          | that is the assertion firing — fix the code, or relax to `calledWith`         |
| `advanceTimers() requires fake timers`                          | no fake timers installed                              | `setupFakeTimers()` or `vi.useFakeTimers()` first                             |
| `no DOM could be installed`                                     | `bun-angular` preload with no DOM package             | `bun add -d @happy-dom/global-registrator` (or `jsdom`)                       |
| `cannot read "…" referenced by …`                               | a `templateUrl` / `styleUrls` path does not resolve   | fix the path, relative to the component file                                  |
| duplicate-copy report from `setupAutoSpy()`                     | two installs, or one loaded as both ESM and CJS       | dedupe the dependency; `setupAutoSpy({ duplicateCopies: 'warn' })` to downgrade |
| `Type 'Spy<T>' is not assignable to type 'T'`                   | `Spy<T>` drops private members — by design            | declare as `Spy<T>`, or use `asInstance()` / `asSpy()` (§6)                   |
| a spy is never called, no warning                               | the method is an instance field, not on the prototype | `instanceMethodsToSpyOn`, or `createAutoMock<T>()`                            |
| `Cannot access '__vi_import_N__' before initialization`          | `vi.mock()` on `@angular/core` or a relative path      | you cannot mock it — the specs are bundled. Assert the result instead        |
| `Schedulers cannot synchronously execute watches while scheduling` | a timer from a **previous** file, under `isolate: false` | track and cancel pending timers/frames in the setup file (§10)          |
| `signal read during notification phase`                         | same — a stray `requestAnimationFrame` callback       | same                                                                          |
| `… .destroy is not a function`                                  | an ngrx `rxMethod` replaced with a bare mock          | `Object.assign(vi.fn(), { destroy: vi.fn() })`                                |
| `NullInjectorError` for a service you did provide               | it is a component-level provider, not a module one    | `asSpy(fixture.debugElement.injector.get(X))`, not `injectSpy(X)`             |
| `runEffect(): … not an EffectRef returned by effect()`          | passed the callback, a signal, or an unassigned field | pass what `effect()` returned; a field may need its lifecycle hook to run first |

---

## 15. Do not write this

| ❌                                                       | ✅                                                        |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `import … from 'jest-auto-spies'`                         | `import … from 'vitest-auto-spy'`                         |
| `vitest-auto-spy` inside a `bun test` file                | `vitest-auto-spy/bun`                                     |
| `let s: MyService = createSpyFromClass(MyService)`        | `let s: Spy<MyService> = …`                               |
| `createSpyFromClass(X) as unknown as X`                   | `asInstance(createSpyFromClass(X))`                       |
| `{ provide: X, useValue: { a: vi.fn(), b: vi.fn() } }`    | `provideAutoSpy(X)`                                       |
| `vi.spyOn(TestBed.inject(X), 'method')`                   | `injectSpy(X).method`                                     |
| `Object.defineProperty(service, 'ready', { value: true })`| `mockReadonlyProp(service, 'ready', true)`                |
| `source$.subscribe(v => expect(v).toBe(1))`               | `await expect(expectEmission(source$)).resolves.toBe(1)`  |
| `expect(component.total).toBeTruthy()` (a signal)         | `expect(component.total).toHaveSignalValue(3)`            |
| `fixture.detectChanges()` then assert signal state        | `await stable(fixture)` then assert                       |
| `onlyMethodsToSpyOn: [...]` "to add a method"             | omit it, or use `instanceMethodsToSpyOn`                  |
| a `vi.fn()` the code calls with `new`                     | `createSpyClass(Foo)`                                     |
| `configureTestingModule` inside every `it()`              | one per `describe`                                        |
| `vi.mock('@angular/core')` to neutralise `effect()`       | set the signals, `await stable(fixture)`, assert the result |
| a second `vi.spyOn(console, 'error')`                     | `consoleErrorSpy` from `vitest-auto-spy/console`           |
| `mockReadonlyProp(c, 'items', vi.fn(() => []))`           | `mockReadonlyProp(c, 'items', signal([]))` — a real signal |

---

## 16. Before you report success

Run what the project actually has — check its `package.json` first.

```bash
npx vitest run path/to/file.spec.ts   # or: bun test path/to/file.test.ts
npx tsc --noEmit                      # Spy<T> mistakes are compile errors, not runtime ones
```

Type errors matter here more than usual: most of this library's guarantees are type-level, so a
suite that runs green but does not type-check is not done.
