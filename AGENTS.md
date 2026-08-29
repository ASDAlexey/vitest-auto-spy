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
| Spec patterns at scale  | <https://asdalexey.github.io/vitest-auto-spy/recipes>                |
| Docs index for LLMs     | <https://asdalexey.github.io/vitest-auto-spy/llms.txt>               |
| Entire docs as one file | <https://asdalexey.github.io/vitest-auto-spy/llms-full.txt>          |
| Human docs              | <https://asdalexey.github.io/vitest-auto-spy/>                       |
| Source                  | <https://github.com/ASDAlexey/vitest-auto-spy>                       |
| Types                   | `node_modules/vitest-auto-spy/dist/index.d.ts` (and one per subpath) |

**Read `dist/*.d.ts` before inventing a call.** Every export is typed and documented there, and the
type is the authority when this file and the code disagree.

---

## 1. Pick the entry point first

Each entry registers its mock adapter **on import**. Importing the wrong one leaves the wrong
adapter installed and spies fail at runtime.

| Runner / framework   | Import from                   |
| -------------------- | ----------------------------- |
| Vitest (default)     | `vitest-auto-spy`             |
| `bun test`           | `vitest-auto-spy/bun`         |
| `bun test` + Angular | `vitest-auto-spy/bun-angular` |
| `node --test`        | `vitest-auto-spy/node`        |
| Angular + Vitest     | `vitest-auto-spy/angular`     |
| NestJS               | `vitest-auto-spy/nestjs`      |
| React                | `vitest-auto-spy/react`       |
| Vue / Pinia          | `vitest-auto-spy/vue`         |
| Svelte               | `vitest-auto-spy/svelte`      |

Three add-ons, orthogonal to the runner:

| Add-on           | Import                          | Needed for                                          |
| ---------------- | ------------------------------- | --------------------------------------------------- |
| Observable spies | `import 'vitest-auto-spy/rxjs'` | `nextWith` & friends. **Side-effect import, once.** |
| Console spies    | `vitest-auto-spy/console`       | silent typed spies over the global `console`        |
| Setup helpers    | `vitest-auto-spy/setup`         | `setupAutoSpy()`, `setupFakeTimers()`               |

The package is **ESM**. Only `vitest-auto-spy/node` and `vitest-auto-spy/eslint-plugin` also ship a
CommonJS build; every other subpath is ESM-only (a `require()` of a Vitest-backed entry always threw —
Vitest refuses to be required).

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
Code under test does `new Foo()`? → a real class?  createSpyClass(Foo)
                                  → only a shape?  mockConstructor<T>(() => instance)
                                  → on a global?   stubConstructor(globalThis, 'Image', factory)
                                    (a vi.fn() rejects `new` — see §12)
Passed as an argument, not injected, and asserted on?
                                  → autoMocked<T>()   (typed `T & Spy<T>`, no asInstance/asSpy)
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

Every spied method is a real runner mock, so `mockReturnValue`, `mockImplementation`,
`toHaveBeenCalledWith` and the rest all work as usual. On top of that:

| Return type     | Helpers added                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| anything        | `calledWith(...args)` → `.mockReturnValue(v)` / `.returnValue(v)`, `mustBeCalledWith(...args)` → same                                       |
| `Promise<T>`    | `resolveWith(v)`, `rejectWith(v)`, `resolveWithPerCall([{ value }, …])`                                                                     |
| `Observable<T>` | `nextWith(v)`, `nextOneTimeWith(v)`, `nextWithValues(configs)`, `nextWithPerCall(configs)`, `throwWith(v)`, `complete()`, `returnSubject()` |

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
feed.items$.nextWith([item]); // emit, stream stays open
feed.items$.nextOneTimeWith([item]); // emit once, then complete
feed.items$.nextWithValues([{ value: a }, { value: b, delay: 100 }, { complete: true }]);
const [first$, second$] = feed.watch$.nextWithPerCall([{ value: 'a' }, { value: 'b', doNotComplete: true }]);
feed.items$.throwWith('FAKE ERROR');
const subject = feed.items$.returnSubject(); // ReplaySubject, for anything the helpers miss
```

`mock.settledResults` is native on Vitest and polyfilled on Bun / `node:test`, so it is identical on
all three. Entries are `{ type: 'fulfilled' | 'incomplete' | 'rejected', value }`.

---

## 5. `createSpyFromClass` configuration

```ts
createSpyFromClass(MyService); // every method on the prototype chain
createSpyFromClass(MyService, ['reload', 'count']); // those two ADDED to the discovered ones
createSpyFromClass(MyService, {
  methodsToSpyOn: ['reload'], // ADDS (jest-auto-spies semantics)
  onlyMethodsToSpyOn: ['getName'], // RESTRICTS — skips prototype discovery
  instanceMethodsToSpyOn: ['reload'], // ADDS; same behaviour, clearer name
  observablePropsToSpyOn: ['products$'],
  gettersToSpyOn: ['userName'],
  settersToSpyOn: ['userName'],
  autoSpyAccessors: true, // discover every accessor on the prototype chain
  lazySpies: true, // build each method spy on first access
});
```

| Key                      | Semantics                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `methodsToSpyOn`         | **Additive**, as in `jest-auto-spies`. Same behaviour as `instanceMethodsToSpyOn`. |
| `onlyMethodsToSpyOn`     | **Exhaustive whitelist.** Skips discovery; anything not listed is absent.          |
| `instanceMethodsToSpyOn` | **Additive.** The name to prefer in new code (see below).                          |
| `autoSpyAccessors`       | Merged with the explicit getter/setter lists.                                      |
| `lazySpies`              | Behaviour-identical; only changes _when_ each spy is built.                        |

**`instanceMethodsToSpyOn` is not an edge case — it is a top-5 option** (103 of ~370 spec files in
the reference suite). Method discovery walks the _prototype chain_; a callable assigned to an
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
expect(settings.theme).toBe('dark'); // the property itself stays typed as `string`

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

asInstance(spy); // Spy<T> → T,  for an API typed against the class
asSpy(TestBed.inject(CartService)); // T → Spy<T>,  for the helpers
```

Both are the same object at runtime. `injectSpy(X)` already returns `Spy<X>`.

The compiler reports this in four different ways, none of which contains both the words "spy" and
"instance", which is why the fix is hard to find from the message alone:

| Message                                                                              | Direction | Fix                               |
| ------------------------------------------------------------------------------------ | --------- | --------------------------------- |
| `TS2352: … 'accessorSpies' is missing in type 'Router'`                              | `T` → spy | `asSpy(TestBed.inject(Router))`   |
| `TS2739` / `TS2740: Type 'Spy<X>' is missing the following properties from type 'X'` | spy → `T` | `asInstance(spy)`                 |
| `TS2345: Argument of type 'Spy<X>' is not assignable to parameter of type 'X'`       | spy → `T` | `asInstance(spy)`                 |
| `is missing the following properties: _modalOpened, body, …` (private names)         | —         | declare `Spy<T>`, not `Mocked<T>` |

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

mockReadonlyProp(service, 'isReady', true); // static value, signals included
mockReadonlyPropGetter(service, 'label', () => 'A'); // dynamic getter
mockValueProp(service, 'retries', 3); // plain writable value
mockAccessorsProp(service, 'theme'); // spied get + set

restoreMockedProps(); // put every patch back; each helper also returns its own undo
```

`vi.restoreAllMocks()` does **not** undo these — it knows about spies, not about redefined
properties. Never use bare `Object.defineProperty` in a spec: nothing restores the original
descriptor, and under `isolate: false` the patch leaks into the next file.

### Properties of DOM objects — the same helpers, and the reason to look for them

`document.fullscreenElement`, `document.visibilityState`, `document.cookie`, `navigator.userAgent`,
`element.scrollHeight`: half the patching a browser suite does is on objects, not on `globalThis`,
so the "globals go through `stubGlobal`" rule does not cover it. `mockValueProp` does — it is the
port of `jest.replaceProperty`, and a project that never used that one walks straight past it.

```ts
mockValueProp(document, 'fullscreenElement', videoElement);
mockValueProp(navigator, 'userAgent', 'Tizen 6.0');
mockValueProp(element, 'scrollHeight', 400);
```

The hand-written form fails in three ways that all surface in **someone else's file**:

- `Object.defineProperty(obj, key, { value })` defaults `configurable` to `false`, so the property
  can never be changed or removed again — for the rest of the worker;
- the undo is written as the last line of the test, so a failing assertion skips it;
- the real property is an **accessor on the prototype** (`document.fullscreenElement` is one), the
  patch writes a `value` over it, and "put the old descriptor back" is not the correct undo —
  deleting the own property is. `mockValueProp` records what was actually there and does the right
  one.

---

## 10. Setup file

```ts
// vitest.setup.ts
import 'vitest-auto-spy/rxjs';
// once — enables observable spies everywhere
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

**The one that keeps a suite green while it is wrong:** zone.js replaces the global `Promise`, and a
rejection nobody handled is drained into `console.error` and no further — it never reaches
`process.on('unhandledRejection')`, the channel Vitest watches, so the runner is never told and the
file still exits 0. `compileComponents().then(() => expect(…))`, an `async` helper called without
`await`, a `TypeError` thrown inside `import('…').then(…)` in production code: each of those is a
passing test with a line of stderr behind it. One migrated suite — 1688 spec files, 11 587 tests,
green — was hiding six of them, two being assertions that were simply false.

```ts
setupAutoSpy({ strayRejections: true }); // fail the test the swallowed rejection surfaced in
```

Off by default, and it needs zone.js already loaded — this package never imports it, so the setup
file does (`import 'zone.js';`) or the Angular builder does. Without it the call **throws** rather
than quietly watching nothing. Native, non-zone rejections already fail a Vitest run, and nothing
here touches them. The pieces are exported too — `trackStrayRejections()` (idempotent, returns the
undo), `flushStrayRejections()` (takes what was captured and starts again from empty) and
`countStrayRejections()`. The `no-floating-assertion` lint rule catches the commonest shape before
it ever runs (§16).

**The one that gets slower the longer the run goes on:** every `vi.fn()` and `vi.spyOn()` is added
to one `Set` inside `@vitest/spy`, because that is what `vi.clearAllMocks()` walks, and nothing takes
anything out of it again. With `isolate: false` the set is created once per worker and only grows:
`clearMocks: true` then walks every mock of every file already run **before every single test**, and
the worker holds all of them at once — their recorded arguments included, and through those whole
component trees.

```ts
setupAutoSpy({ pruneMockRegistry: true }); // keep only the mocks that outlive a file
```

The part to understand before turning it on is what must **not** be pruned. Dropping a mock from that
set means `clearMocks` can no longer see it, so its calls accumulate silently — harmless for a mock
that dies with its file, a bug for the module-level `vi.fn()` in a shared `*.mock.ts` that six spec
files import. The first file to import it creates it; drop it when that file ends and the file that
happens to run **second** fails on calls its predecessor made, which reads as flakiness because which
file is first is the runner's choice. So the split is drawn where it is observable: what is already in
the registry when a file's hooks start was created while the module graph was being evaluated and is
kept; everything added after that belongs to the file and goes when it ends. One case lands on the
wrong side — a module first loaded by a dynamic `import()` inside a test — and says so explicitly:

```ts
export const navigation = { setFocus: keepMockRegistered(vi.fn()) };
```

`trackMockRegistry()` installs the pair of hooks on its own, `pruneMockRegistry()` is the one-shot
sweep (it returns how many went) and `getMockRegistrySize()` reports what is left.

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

setupFakeTimers(); // install + restore, paired
await advanceTimers(5_000); // advance AND drain the microtasks a bare advanceTimersByTime leaves
```

Coming from a Jest project that had `fakeTimers: { enableGlobally: true }`, every one of its tests
was written against a frozen clock. Turning that back on file by file is a thousand edits; turn it
on once instead:

```ts
setupAutoSpy({ globalFakeTimers: true }); // or a vi.useFakeTimers() config
```

Both ends are guarded, which is the half a hand-written pair of hooks gets wrong: a spec that drives
the clock itself would otherwise reach a second `vi.useRealTimers()`, and that one leaves the
environment without `clearInterval` — which explodes during teardown of whichever file runs next.

`globalFakeTimers` also keeps the clock fake **between** tests, and that half is not decoration: a
`beforeAll` inside a nested `describe` runs after the previous test's `afterEach`, so a
`beforeEach`-only pair leaves it on real timers and the block fails with `the timers APIs are not
mocked` without touching a timer itself. For one `describe` instead of the whole run:
`setupFakeTimers(config, { betweenTests: true })`.

Whatever you turn on, the hooks belong to the spec file whose collection imported the setup module.
If something keeps that module in the cache across files — `@angular/build:unit-test` under
`--coverage` serves every test file as a wrapper around the built bundle, so the setup module is
never re-evaluated — only the first file of each worker gets them, and the rest fail somewhere
unrelated. Run coverage with `--isolate`, or call `setupAutoSpy()` from something evaluated per file.

### Freezing and counting the clock

```ts
import { mockNow, mockSystemTime, useCountingClock, withSystemTime } from 'vitest-auto-spy/setup';

mockSystemTime('2025-04-30T00:00:00Z');   // works whether or not fakes are already installed
await withSystemTime('2025-04-30T00:00:00Z', async () => { … });   // scoped, restores itself
const clock = useCountingClock();          // Date.now() → 1, 2, 3 …, reset before every test
mockNow(() => nextTimestamp());            // any Date.now source, re-applied before every test
```

**An assertion that contains a date must set the clock.** Otherwise the expected string is computed
from `new Date()` and the test starts failing on its own some days after it was written — which
reads as a regression and is not one.

`vi.spyOn(globalThis, 'Date')` is not the way. Fake timers already own that global, so it throws
`Date is not a constructor` with a stack in production code and no mention of timers.
`mockSystemTime` does the right thing either way.

`useCountingClock` exists because under fake timers every call inside one test reports the _same_
"now", so a spec that asserts on **order** or **duration** — analytics batches, tracing, a rate
limiter, a TTL cache — cannot express its expectation at all. Patching `Date.now` by hand does not
survive: `vi.useFakeTimers()` installs a fresh `Date` on every call, so a module-scope or `beforeAll`
patch is left on an object nothing reads, and the naive undo re-attaches a dead clock's `now` to the
live one.

### Asserting focus

```ts
registerFocusMatchers(); // once, in the setup file

expect(fixture.nativeElement.querySelector('.play')).toHaveFocus();
```

The two idioms it replaces both fail unhelpfully: `expect(document.activeElement).toBe(el)` prints
two whole DOM subtrees, and `expect(el === document.activeElement).toBe(true)` prints
`expected false to deeply equal true`. The matcher separates the causes instead — the query found
nothing, the element is not in the document, focus is still on `<body>` (nothing claimed it), or
focus is on another element, which it names as `button#save.primary` rather than as a subtree.

### Shared fixtures are functions, not constants

Under `isolate: false` a module is evaluated **once per worker**, so this is one set of spies shared
by every file that imports it, registered against whichever file got there first — and the others'
`clearMocks` never reaches them. The symptom is a 30-second timeout, in a different file each run.

```ts
// ❌ __mocks__/context.ts
export const mockActionContext = { actions: { navigateToSection: vi.fn() } };
export const checkoutProvider = { provide: CheckoutState, useValue: { load: vi.fn() } };

// ✅
export const createActionContext = () => ({ actions: { navigateToSection: vi.fn() } });
export const createCheckoutProvider = () => ({ provide: CheckoutState, useValue: { load: vi.fn() } });
```

A spec file must **export nothing**: under `isolate: false` an exported spec file is imported by its
neighbours and loses its own suite. Put shared doubles in a `*.mock.ts` next to them, as factories.
The `no-shared-module-level-mock` lint rule (§16) finds these mechanically.

### A stub must be re-installed for every test

Every stub this library installs is taken off again by `restoreMockedProps()` after each test — that
is what keeps it out of the next file. So a stub installed once at `describe` level, or in a
`beforeAll`, is gone from the second test on, and what fails is an assertion about the component
with the stub sitting ten lines above it, apparently in force. The same ordering bites the other way:
a project-wide setup file installs its defaults in a root `beforeEach`, and root hooks run **before**
a file's own — so a `beforeAll` in a spec loses to them silently, while a `beforeEach` wins.

```ts
import { installPerTest } from 'vitest-auto-spy/setup';

const observers = installPerTest(() => stubIntersectionObserver({ autoEmit: true }));

it('…', () => expect(observers().last.targets).toEqual([host]));
```

It hands back a **reader**, not the handle: the handle is a different object each test.

### Naming the file that sealed a global

```ts
setupAutoSpy({ guardGlobals: 'throw' }); // or 'warn' while a suite is being cleaned up
```

`Object.defineProperty(document, 'cookie', { value })` defaults `configurable` to `false`, so the
property can no longer be redefined _or_ deleted. Under `isolate: false` every later file in the
worker inherits it, and what fails is some library, every other run, with nothing naming the file
that did it. The guard compares `globalThis` / `document` / `navigator` around every test and reports
only what appeared and cannot be removed.

### Hook order differs from Jest

Vitest runs `afterEach` hooks as a stack (innermost / last-registered first); Jest ran them in
declaration order. A ported suite where a spec's `afterEach` depends on a patch the setup file
installed needs `sequence: { hooks: 'list' }` in the Vitest config, or the setup file's teardown runs
first and the spec's hook operates on an already-restored environment.

---

## 11. Waiting: four queues, and which tool drives each

Under Jest these were hard to tell apart; under Vitest with a real bundler they are four separate
mechanisms, and a test that waits on the wrong one fails with a message that names none of them.

| What is pending                               | What drives it                                     | What does **not**                         |
| --------------------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| change detection                              | `fixture.detectChanges()`                          | anything `await`ed                        |
| effects + `afterNextRender` + CD              | `await stable(fixture)` (`…/angular`)              | `detectChanges()` alone                   |
| timers, debounces, polling                    | `await advanceTimers(ms)` (`…/setup`)              | `await Promise.resolve()`                 |
| a dynamic `import()`, native `async` in a dep | `await flushEventLoop()` / `settleDynamicImport()` | `tick()`, `flushMicrotasks()`, microtasks |

```ts
import { flushEventLoop, settleDynamicImport } from 'vitest-auto-spy';

fixture.debugElement.query(By.css('.open')).nativeElement.click(); // production code: await import(…)
await settleDynamicImport(() => import('./profile-select.modal'));
```

Three rules worth stating outright, because each of them cost a day somewhere:

- **`afterNextRender` does not run on `detectChanges()`.** A component that fills a form there is
  still empty when the assertion reads it. `await stable(fixture)` (or `await fixture.whenStable()`)
  is what runs the after-render phase.
- **`fixture.whenRenderingDone()` is not a stronger `whenStable()`.** With an animation renderer
  installed it degrades to `Promise.resolve()`. Use `stable(fixture)`.
- **`fakeAsync` / `tick()` / `flushMicrotasks()` never reach the module loader.** Spinning
  `await Promise.resolve()` ten times looks like it works and instead lands the continuation after
  teardown — a green run with `NG0205: Injector has already been destroyed` in "Unhandled Errors"
  and a non-zero exit code.

`flushEventLoopUntil(isDone, { turns, label })` is the same thing with a condition and a budget —
for a `resource()` leaving `loading`, a chunk becoming reachable, an SDK reporting itself ready. Use
it instead of a hand-tuned turn count: the count depends on the dependency, not on the spec, and a
condition that never holds fails naming the `label` rather than hanging until the runner's timeout.

`flushEventLoop(turns?)` takes real event-loop turns even while the timers are faked, without
touching the clock. It is the honest name for the `await vi.advanceTimersByTimeAsync(0)` trick,
which reads as "move the timers" in a test that has no timers and gets deleted as noise.

---

## 12. Doubles for what the code builds itself

Production code that does `new Foo()` cannot be served by a `vi.fn()`. Vitest only forwards `new` to
an implementation that is itself constructible, and **an arrow function is not**: the call is
recorded, the body never runs, `new` hands back an empty object. The warning Vitest prints
("the mock did not use 'function' or 'class'") is nowhere near the failure, which arrives as
`TypeError: (cb) => {…} is not a constructor` with a stack **in production code** — or as a green
test for the wrong reason, when the resulting `undefined` is swallowed by a `catch`.

```ts
import { createSpyClass, mockConstructor, stubConstructor } from 'vitest-auto-spy';

// a real class exists                    → full auto-spy instances
mockValueProp(globalThis, 'Worker', createSpyClass(BackgroundWorker));

// only a type / a shape exists           → a runner mock that is also a constructor
const LicenseClient = mockConstructor<LicenseClient>(() => ({ prepareRequest: vi.fn() }));

// it lives on a global (or any object)   → the same, installed and auto-restored
const Image = stubConstructor(globalThis, 'Image', () => ({ src: '' }));

tracker.ping();
expect(Image).toHaveBeenCalledTimes(1);
expect(Image.instances[0].src).toBe('https://tns.example/hit');
```

`mockConstructor` stays a runner mock, so `toHaveBeenCalledWith` / `mockClear` work as usual, and it
throws a named error if it is ever called **without** `new`. `stubConstructor` installs through
`mockValueProp`, so `restoreMockedProps()` puts the platform's constructor back.

For the three observers, prefer the purpose-built stubs (§13). For `AbortController` — which breaks
in a jsdom run for a reason involving none of the three parties in the stack trace — use
`stubAbortController()`.

### `<video>` and `<audio>`

jsdom implements them as a shell: `play()` throws, `duration` is `NaN` and is an accessor with no
setter, `canPlayType()` answers `''` for everything, `readyState` never leaves 0, `error` is not on
the prototype. `stubMediaElement()` patches the prototype (so it covers an element production code
creates itself) and, crucially, **fires the event that goes with each change** — production code
listens for `durationchange` / `timeupdate` / `ended`, and assigning the field alone leaves those
handlers unrun:

```ts
const media = stubMediaElement({ duration: 120 });

media.set(video, { readyState: 1 }); // → loadedmetadata
media.set(video, { currentTime: 119 }); // → timeupdate
media.set(video, { ended: true }); // → ended
expect(media.play).toHaveBeenCalledTimes(1);
```

State is per element, so an ad and the content report different durations.

### A module mock that did nothing

`vi.mock()` is the one thing in a ported suite that fails **silently**. Under a bundler
(`@angular/build:unit-test`, a pre-built `vite-node` entry) a workspace alias or a barrel is already
inlined when the mock would be installed, so the real implementation runs and the test either passes
for the wrong reason or fails somewhere unrelated.

```ts
import * as engine from '@app/pricing-engine';

vi.mock('@app/pricing-engine');
beforeEach(() => assertMocked(engine, { specifier: '@app/pricing-engine', exports: ['createEngine'] }));
```

And when a mocked dependency probes itself with `mod.default ?? mod` — every package that ships both
CJS and ESM does — a factory of bare named exports throws `No "default" export is defined on the
mock` from **inside that dependency**. `moduleNamespace` is the shape it expects:

```ts
vi.mock('shaka-player', () => moduleNamespace({ Player: mockConstructor(() => playerStub) }));
```

There is no `mockModule(…)` helper here, and there cannot be: Vitest hoists the literal `vi.mock`
call, so a wrapper around it would be hoisted as a call to a function that does not exist yet. Share
a fixture between the factory and the tests with `vi.hoisted()`.

---

## 13. Angular

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

Install it in `beforeEach`, **never in `beforeAll`**: a shared setup file's root `beforeEach` runs
_after_ a file's `beforeAll`, so a stub installed there is overwritten by the setup file's default
before the test starts. The symptom is `expected "vi.fn()" to be called 2 times, but got 0 times`,
in a file where the mock class is ten lines above.

Three more knobs, each for a shape that otherwise gets hand-rolled:

```ts
stubIntersectionObserver({ autoEmit: true }); // every observed target reports as visible, at once
observers.last.options; // the init object: { rootMargin, threshold, … }
observers.last.emit([mutationRecord(host, { addedNodes: [span] })]);
observers.last.emit([resizeEntry(host, { width: 320 })]);
```

`autoEmit` is the mode a suite ported from Jest needs: there the global mock fired its callback with
`isIntersecting: true` immediately, so lazily-loading sections fetched their data during
`detectChanges()`. Against the default inert observer those specs assert on an empty component and
fail with something that has nothing to do with intersection.

`mutationRecord()` exists because a `MutationRecord` cannot be written as an object literal at all —
`addedNodes` is a `NodeList`. Do not build one from a `DocumentFragment`: appending **moves** the
nodes, so the helper silently rips the element out of the fixture it was just asserted on.

### `injectSpy` cannot reach a component-level provider

`injectSpy(X)` reads the **global** `TestBed` injector. A provider declared on the component
(`@Component({ providers: [...] })`) lives in the element injector, which `TestBed.inject` never
sees. Go through the fixture and re-view the result:

```ts
const player = asSpy(fixture.debugElement.injector.get(PlayerService));

player.play.mockReturnValue(true);
```

To _replace_ it rather than read it, the provider has to be overridden — and `provideAutoSpy` cannot
do that, because a testing-module provider loses to one the component declares:

```ts
import { overrideAutoSpy, overrideComponentProvider } from 'vitest-auto-spy/angular';

const menu = overrideComponentProvider(CatalogPageComponent, NavigationBuilderService); // → Spy<NavigationBuilderService>

// or, when the component is already in the testing module:
TestBed.configureTestingModule({ … }).overrideProvider(PaymentMethodService, overrideAutoSpy(PaymentMethodService));
```

Two silent failures this avoids. `overrideProvider(X, provideAutoSpy(X))` passes a _provider_ where
`{ useValue }` is expected — no error, no warning, the test runs on the real service. And
`overrideProvider` only reaches a component the TestBed compiler knows about, so a standalone
component instantiated through a parent's template needs to be in `imports` first;
`overrideComponentProvider` queues it.

Do **not** reach for `TestBed.overrideComponent` here — see the next subsection for why it is worse
than the problem it solves.

### An NgModule that contributes nothing

Under an AOT test bundle (`@angular/build:unit-test`, and any builder that compiles specs the way it
compiles production code) `ɵɵsetNgModuleScope` is stripped, because only the TestBed reads it. Every
NgModule then has an empty `ɵmod.declarations` / `ɵmod.exports` at runtime. Nothing notices while
AOT is in charge — the flat dependency list is already baked into each `ɵcmp` — but the moment the
TestBed resolves a scope itself, through `imports: [SomeModule]` or through a JIT recompilation
after `overrideComponent`, it resolves it from nothing:

```
NG0303: Can't bind to 'appTruncate' since it isn't a known property of 'div'
NG0301: Export of name 'focusable' not found!
NG0304: 'ui-smart-row' is not a known element
(nothing at all — an attribute directive simply never instantiates)
```

None of the four names the module. Say so up front instead:

```ts
import { assertNgModuleScopes } from 'vitest-auto-spy/angular';

assertNgModuleScopes(DirectivesModule, PipesModule); // throws, naming the module and the cause
```

Then declare what the spec needs in the TestBed module directly. Pass only modules you expect to
bring declarations — a providers-only module is legitimately empty.

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
flushEffects(); // the no-fixture half: services, stores, runInInjectionContext

// signal assertions
registerSignalMatchers(); // once, in the setup file
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

if (process.env['SPEC_TIMING']) {
  enableTestBedDiagnostics();
}
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

### Zone and zoneless spec files in one worker

`TestBed.initTestEnvironment` may be called once per platform, and under `isolate: false` the
platform lives for the whole worker — so a repository migrating to zoneless gradually cannot express
itself in setup files: the second file the worker picks up in the other mode fails with `Cannot set
base providers because it has already been called`, naming neither file. `test.projects` does not
help; nothing promises a worker serves files of one project.

```ts
setupAngularTestEnv({
  zoneless: (testPath) => testPath.includes('/libs/music/'),
  initZone: setupZoneTestEnv,
  initZoneless: setupZonelessTestEnv,
});
```

It resets the environment only when the mode actually changes, and the initialisers stay yours —
which platform and which providers is not this library's decision.

---

### A dependency behind an `InjectionToken`

```ts
providers: [provideAutoSpyForToken(PASSCODE_SERVICE_TOKEN)];
const passcode = injectSpy(PASSCODE_SERVICE_TOKEN); // Spy<PasscodeService>
```

A token typed with an interface has no class to read, so the habit is a `…Mock` class written in the
spec — after which `Spy<Mock>` and `Spy<Interface>` disagree and somebody casts. Do not write
`TestBed.inject<any>(TOKEN)`; both of these accept a token.

### A host for a directive under test

```ts
const Host = createDirectiveHost({
  template: `<div [appTruncate]="enabled"></div>`,
  scope: [DirectivesModule], // the component's imports, NOT the TestBed's
  props: { enabled: false },
});

TestBed.configureTestingModule({ imports: [Host] });
```

The two halves of Angular disagree about where `imports` is resolved: on a `@Component` the AOT
compiler resolves it at build time and bakes the flat list into `ɵcmp`, so an NgModule there works;
on `TestBed.configureTestingModule` it is resolved at runtime from `ɵmod`, and `ɵɵsetNgModuleScope`
is not emitted into a test bundle, so the same line contributes nothing. A host written
`standalone: false` inside a spec is compiled outside any scope at all — no `NgClass`, no
`AsyncPipe`, nothing.

`registerDirectiveMatchers()` adds `expect(fixture).toHaveDirectiveApplied(Directive, 'div')`, which
asserts the fact Angular reports three wrong ways (`NG0303` points at the module where the directive
_is_ declared; `NG0304` calls a missing directive a missing component; a bare attribute reports
nothing at all). `schemas: [NO_ERRORS_SCHEMA]` next to a standalone component is a dead entry —
schemas apply to a testing module's `declarations` only.

### Patching a property of a spy

`mockReadonlyProp` / `mockValueProp` / `mockSignalProp` accept the `Spy<T>` that `injectSpy` returns,
and type the value against the member's **own** type. For a signal-valued member prefer
`mockSignalProp(service, 'state', initial)` over `gettersToSpyOn`: a spied getter returns `undefined`
until configured, a real signal keeps everything downstream reactive.

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

**Invariant of this package, not a detail of one release:** `zone.js` is a **devDependency and only a
devDependency** — never a dependency, never a peer, not even an optional one. Everything about zones
lives behind this one subpath; no other entry reaches it, even transitively, and the module imports
no zone.js of its own (it reads `globalThis.Zone`, which the consumer loaded). Do not add a
convenient re-export from the root: it would quietly hand zone.js to every zoneless consumer.

---

## 15. Other adapters

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

## 16. ESLint plugin (flat config only)

```js
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [{ files: ['**/*.spec.ts'], ...autoSpy.configs.recommended }];
```

| Rule                           | Level   | Flags                                                                    |
| ------------------------------ | ------- | ------------------------------------------------------------------------ |
| `no-expect-in-subscribe`       | `error` | `expect()` inside `subscribe()` → `expectEmission`                       |
| `no-object-define-property`    | `error` | `Object.defineProperty` in a spec → `mockReadonlyProp` / `mockValueProp` |
| `prefer-provide-auto-spy`      | `warn`  | `{ provide: X, useValue: { a: vi.fn() } }` → `provideAutoSpy(X)`         |
| `prefer-create-spy-from-class` | `warn`  | an object literal of 2+ `vi.fn()`s → `createSpyFromClass`                |
| `prefer-inject-spy`            | `warn`  | `vi.spyOn(TestBed.inject(X), 'm')` → `injectSpy(X)`                      |
| `no-shared-module-level-mock`  | `error` | an **exported** value holding `vi.fn()`s → export a factory instead      |
| `no-mocked-for-spy`            | `warn`  | `let s: Mocked<T>` → `Spy<T>`                                            |
| `no-done-callback`             | `error` | `it('x', (done) => …)` → `async` + an awaited assertion                  |
| `no-floating-assertion`        | `error` | `expect()` in a `.then()` nobody awaits → `expect(await promise)`        |

The legacy `.eslintrc` `plugins: []` form cannot work — it resolves names to `eslint-plugin-*`
packages, which a subpath export can never be.

---

## 17. Error → fix

| Message contains                                                                     | Cause                                                                  | Fix                                                                                         |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `No mock adapter registered`                                                         | no runtime entry was imported, or the wrong one                        | import `vitest-auto-spy` (Vitest) / `…/bun` / `…/node` once before creating spies           |
| `Observable spies require rxjs`                                                      | the rxjs layer was never loaded                                        | `import 'vitest-auto-spy/rxjs';` once, in the setup file                                    |
| `requested method(s) not found on the class prototype`                               | typo, or an instance-field callable                                    | fix the name, or move it to `instanceMethodsToSpyOn`                                        |
| `was configured with 'mustBeCalledWith'`                                             | the code called the spy with other arguments                           | that is the assertion firing — fix the code, or relax to `calledWith`                       |
| `advanceTimers() requires fake timers`                                               | no fake timers installed                                               | `setupFakeTimers()` or `vi.useFakeTimers()` first                                           |
| `the timers APIs are not mocked` in a nested `describe`'s `beforeAll`                | fakes armed in `beforeEach` only; Jest armed them for the whole file   | `setupFakeTimers(cfg, { betweenTests: true })` / `setupAutoSpy({ globalFakeTimers: true })` |
| setup-file hooks reaching only the first spec file of a worker                       | the setup module stayed cached (Angular unit-test builder + coverage)  | run coverage with `--isolate`, or call `setupAutoSpy()` from a per-file module              |
| `no DOM could be installed`                                                          | `bun-angular` preload with no DOM package                              | `bun add -d @happy-dom/global-registrator` (or `jsdom`)                                     |
| `cannot read "…" referenced by …`                                                    | a `templateUrl` / `styleUrls` path does not resolve                    | fix the path, relative to the component file                                                |
| duplicate-copy report from `setupAutoSpy()`                                          | two installs, or one loaded as both ESM and CJS                        | dedupe the dependency; `setupAutoSpy({ duplicateCopies: 'warn' })` to downgrade             |
| `Type 'Spy<T>' is not assignable to type 'T'`                                        | `Spy<T>` drops private members — by design                             | declare as `Spy<T>`, or use `asInstance()` / `asSpy()` (§6)                                 |
| a spy is never called, no warning                                                    | the method is an instance field, not on the prototype                  | `instanceMethodsToSpyOn`, or `createAutoMock<T>()`                                          |
| `Cannot access '__vi_import_N__' before initialization`                              | `vi.mock()` on `@angular/core` or a relative path                      | you cannot mock it — the specs are bundled. Assert the result instead                       |
| `Schedulers cannot synchronously execute watches while scheduling`                   | a timer from a **previous** file, under `isolate: false`               | track and cancel pending timers/frames in the setup file (§10)                              |
| `signal read during notification phase`                                              | same — a stray `requestAnimationFrame` callback                        | same                                                                                        |
| an assertion error printed to stderr, every test green and the run exiting 0         | zone.js swallowed a rejection nobody handled                           | `setupAutoSpy({ strayRejections: true })` fails the test it surfaced in (§10)               |
| an `expect()` inside a `.then()` that never seems to run                             | nothing awaits the chain, so the test ended first                      | `await` the promise and assert the settled value — `no-floating-assertion` (§16)            |
| `trackStrayRejections() found no zone.js on the host`                                | `strayRejections` turned on where zone.js is not loaded                | `import 'zone.js';` in the setup file, or drop the option                                   |
| `… .destroy is not a function`                                                       | an ngrx `rxMethod` replaced with a bare mock                           | `Object.assign(vi.fn(), { destroy: vi.fn() })`                                              |
| `NullInjectorError` for a service you did provide                                    | it is a component-level provider, not a module one                     | `asSpy(fixture.debugElement.injector.get(X))`, not `injectSpy(X)`                           |
| `runEffect(): … not an EffectRef returned by effect()`                               | passed the callback, a signal, or an unassigned field                  | pass what `effect()` returned; a field may need its lifecycle hook to run first             |
| `X is not a constructor`, stack in production code                                   | a `vi.fn(() => …)` where the code does `new X()`                       | `mockConstructor` / `stubConstructor` / `createSpyClass` (§12)                              |
| `Date is not a constructor`                                                          | `vi.spyOn(globalThis, 'Date')` — the fakes own it                      | `mockSystemTime(date)` / `vi.setSystemTime`                                                 |
| `TS2352: … 'accessorSpies' is missing in type 'X'`                                   | `TestBed.inject(X) as Spy<X>`                                          | `asSpy(TestBed.inject(X))` — never a double assertion (§6)                                  |
| `TS2739` / `TS2740` / `TS2345` with `Spy<X>` on the left                             | a spy handed to an API typed against the class                         | `asInstance(spy)` (§6)                                                                      |
| `is missing the following properties: _private, …`                                   | declared as Vitest's `Mocked<T>`                                       | declare `Spy<T>` (§6)                                                                       |
| `AddPromiseSpyMethods<unknown>` vs `WithMockReturnValue<…>`                          | a generic class inferred as `Service<any>`                             | `asSpy<Service>(…)` / `injectSpy<Service>(…)` (§6)                                          |
| `'addEventListener' called on an object that is not a valid instance of EventTarget` | Node's `AbortSignal` under jsdom + zone.js                             | `stubAbortController()` (§12)                                                               |
| `vi.requireMock is not a function`                                                   | a mechanical `jest.` → `vi.` rename                                    | there is no equivalent — provide the double through the TestBed instead                     |
| a `vi.mock()` factory that never applies, only sometimes                             | under `isolate: false` the module was already in the worker's graph    | do not mock it; inject the dependency, or `vi.hoisted()` + a real seam                      |
| a `vi.mock()` of a workspace alias that never applies at all                         | a bundler inlined the module before the mock could be installed        | `assertMocked(ns, { specifier })` to prove it, then inject instead of mocking               |
| `No "default" export is defined on the mock`, thrown inside a dependency             | a factory returning bare named exports; the dep probes `default`       | `vi.mock('x', () => moduleNamespace({ … }))`                                                |
| `Not implemented: HTMLMediaElement.play`, or `duration` is `NaN` and cannot be set   | jsdom implements the media elements as a shell                         | `stubMediaElement({ duration })`, then `media.set(el, …)` to fire the events                |
| `Cannot set base providers because it has already been called`                       | zone and zoneless spec files sharing one worker                        | `setupAngularTestEnv({ zoneless, initZone, initZoneless })` (§13)                           |
| a stub that works in the first test of the file and in no other                      | installed at `describe` level or in `beforeAll`, then restored away    | install it in `beforeEach`, or `installPerTest(() => stub…())`                              |
| a third-party library failing every other run, no test named                         | a test sealed a global with `Object.defineProperty` (non-configurable) | `setupAutoSpy({ guardGlobals: 'throw' })` names the file; then `mockValueProp`              |
| `expected [ { at: 1, …(5) }, …(8) ] to deeply equal [ { …(6) }, … ]`                 | one field moved in every element — usually a frozen clock or an id     | `expect(diffByField(actual, expected)).toBeUndefined()`                                     |
| a hand-tuned number of turns waiting for a `resource()` to load                      | the hand-off count depends on the dependency, not on the spec          | `await flushEventLoopUntil(() => r.status() !== 'loading', { label })`                      |
| `Property 'mockReturnValue' does not exist on type 'never'`                          | a generic method with a conditional return type; the spy collapsed     | upgrade — fixed in the types; the member now keeps its sync helper bundle                   |
| `Type 'string' is not assignable to type 'never'` on `gettersToSpyOn`                | the list used to reject callable values, i.e. every `Signal<T>`        | upgrade — any string key is nameable; prefer `mockSignalProp` for a signal                  |
| `Expected to be running in 'ProxyZone', but it was not found`                        | `zone.js/testing` patches jasmine/mocha/jest, not Vitest               | `import 'vitest-auto-spy/zone'` after zone.js, with `globals: true` (§14)                   |
| `nextWith` demanding `HttpEvent<T>` on a generated API client                        | `Parameters`/`ReturnType` read the **last** overload                   | `asSpy<Client, { overload: 'first' }>(…)`, or `Overload<M, 0>`                              |
| a spy that cannot take a real `signal()` in `mockReadonlyProp`                       | the value was typed against `Spy<T>[K]`, not against `T[K]`            | upgrade — the `mock*Prop` helpers accept a `Spy<T>` and check against `T`                   |
| `NG0303` / `NG0304` / nothing at all, from a directive spec                          | the host is `standalone: false`, or the module is in the TestBed       | `createDirectiveHost({ template, scope: [Module] })` (§13)                                  |
| `TS2540: Cannot assign to 'X' because it is a read-only property`                    | a `readonly` field of an object under test                             | `mockValueProp(obj, 'X', value)` — on a class **getter**, `mockReadonlyProp`                |
| `let s: MockInstance<() => unknown>` not matching anything                           | `MockInstance<F>` is invariant in `F`; Jest's `SpyInstance` was not    | `MockInstance<T['method']>`, or better `injectSpy(X).method`                                |
| two runs with the same totals, one of them missing a suite                           | a lost `describe` and a fixed flake cancel out in the counters         | `compareTestRuns(before, after)` — compare the set of names, not the numbers                |
| a 30 s timeout, in a different file each run                                         | module-level `vi.fn()` in a fixture shared by files                    | make the fixture a factory (§10)                                                            |
| a component's `afterNextRender` state is empty                                       | `detectChanges()` does not run the after-render phase                  | `await stable(fixture)` (§11)                                                               |

---

## 18. Do not write this

| ❌                                                                   | ✅                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `import … from 'jest-auto-spies'`                                    | `import … from 'vitest-auto-spy'`                             |
| `vitest-auto-spy` inside a `bun test` file                           | `vitest-auto-spy/bun`                                         |
| `let s: MyService = createSpyFromClass(MyService)`                   | `let s: Spy<MyService> = …`                                   |
| `createSpyFromClass(X) as unknown as X`                              | `asInstance(createSpyFromClass(X))`                           |
| `{ provide: X, useValue: { a: vi.fn(), b: vi.fn() } }`               | `provideAutoSpy(X)`                                           |
| `vi.spyOn(TestBed.inject(X), 'method')`                              | `injectSpy(X).method`                                         |
| `Object.defineProperty(service, 'ready', { value: true })`           | `mockReadonlyProp(service, 'ready', true)`                    |
| `source$.subscribe(v => expect(v).toBe(1))`                          | `await expect(expectEmission(source$)).resolves.toBe(1)`      |
| `expect(component.total).toBeTruthy()` (a signal)                    | `expect(component.total).toHaveSignalValue(3)`                |
| `fixture.detectChanges()` then assert signal state                   | `await stable(fixture)` then assert                           |
| `onlyMethodsToSpyOn: [...]` "to add a method"                        | omit it, or use `instanceMethodsToSpyOn`                      |
| a `vi.fn()` the code calls with `new`                                | `createSpyClass(Foo)` / `mockConstructor(factory)`            |
| an exported `const` fixture holding `vi.fn()`s                       | an exported **factory** that returns it (§10)                 |
| `let s: Mocked<MyService>` (Vitest's own type)                       | `let s: Spy<MyService>`                                       |
| `it('x', (done) => …)` / `beforeEach((done) => …)`                   | `async` + `await` — Vitest passes a `TestContext`, not `done` |
| `{ ...modelInstance, flag: true }` (drops every getter)              | `withOverrides(modelInstance, { flag: true })`                |
| `if ('params' in link) … else throw` in every spec                   | `narrow.byKey(link, 'params')`                                |
| five `asInstance(...)` in one call                                   | `...asInstances(a, b, c, d, e)`                               |
| `vi.stubGlobal('Image', vi.fn(() => ({ src: '' })))`                 | `stubConstructor(globalThis, 'Image', () => ({ src: '' }))`   |
| `Object.defineProperty(document, 'cookie', { value })`               | `mockValueProp(document, 'cookie', value)`                    |
| `vi.spyOn(globalThis, 'Date')`                                       | `mockSystemTime('2025-04-30T00:00:00Z')`                      |
| ten `await Promise.resolve()` for a dynamic `import()`               | `await settleDynamicImport(() => import('…'))`                |
| `await fixture.whenRenderingDone()`                                  | `await stable(fixture)`                                       |
| an exported `const` provider with `vi.fn()` inside                   | an exported **factory** returning it (§10)                    |
| `.overrideProvider(X, provideAutoSpy(X))` (silent no-op)             | `.overrideProvider(X, overrideAutoSpy(X))`                    |
| `TestBed.overrideComponent` to swap a provider                       | `overrideComponentProvider(Cmp, X)`                           |
| `{ target, isIntersecting } as unknown as IntersectionObserverEntry` | `intersectionEntry(target, true)`                             |
| an assertion containing a date, with no clock set                    | `mockSystemTime(iso)` first                                   |
| `configureTestingModule` inside every `it()`                         | one per `describe`                                            |
| `vi.mock('@angular/core')` to neutralise `effect()`                  | set the signals, `await stable(fixture)`, assert the result   |
| a second `vi.spyOn(console, 'error')`                                | `consoleErrorSpy` from `vitest-auto-spy/console`              |
| `mockReadonlyProp(c, 'items', vi.fn(() => []))`                      | `mockReadonlyProp(c, 'items', signal([]))` — a real signal    |

---

## 19. Before you report success

Run what the project actually has — check its `package.json` first.

```bash
npx vitest run path/to/file.spec.ts   # or: bun test path/to/file.test.ts
npx tsc --noEmit                      # Spy<T> mistakes are compile errors, not runtime ones
```

Type errors matter here more than usual: most of this library's guarantees are type-level, so a
suite that runs green but does not type-check is not done.
