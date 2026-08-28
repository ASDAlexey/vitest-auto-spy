---
name: vitest-auto-spy
description: Write or fix tests that use vitest-auto-spy — typed spies generated from a class or a type on Vitest, bun:test and node:test. Use when a spec imports `vitest-auto-spy` (or a subpath such as `/angular`, `/bun`, `/bun-angular`, `/node`, `/rxjs`, `/nestjs`, `/vue`, `/react`, `/svelte`, `/console`, `/setup`, `/zone`, `/eslint-plugin`), when the user mentions createSpyFromClass, createAutoMock, autoMocked, createMock, mockDeep, provideAutoSpy, provideAutoSpyForToken, injectSpy, renderShallow, createWithAutoSpies, overrideComponentProvider, assertNgModuleScopes, setupAngularTestEnv, createDirectiveHost, toHaveDirectiveApplied, expectEmission, mockSignalProp, runEffect, mockReadonlyProp, stubIntersectionObserver, stubResizeObserver, stubMutationObserver, stubMediaElement, stubAbortController, mockConstructor, stubConstructor, flushEventLoop, settleDynamicImport, mockSystemTime, useCountingClock, registerFocusMatchers, toHaveFocus, assertMocked, moduleNamespace, diffByField, installPerTest, asInstances, narrow, withOverrides, compareTestRuns, installProxyZonePatch, setupAutoSpy, blockNetwork, trackStrayTimers, Spy<T>, calledWith, mustBeCalledWith, onlyMethodsToSpyOn, instanceMethodsToSpyOn, observablePropsToSpyOn, resolveWith or nextWith, when migrating a suite off jest-auto-spies, or when a test fails with "No mock adapter registered", "Observable spies require rxjs", "not found on the class prototype", "is not a constructor", "Expected to be running in 'ProxyZone'" or "Spy<T> is not assignable".
---

# vitest-auto-spy

Typed test spies generated from a class, a type, or nothing at all.

## Read this first

The authoritative reference is **`AGENTS.md`** — a complete cheat sheet with the configuration
surface, the error→fix table and the anti-pattern list. Read it before writing a spec:

```bash
cat node_modules/vitest-auto-spy/AGENTS.md   # in the consuming project
cat "${CLAUDE_PLUGIN_ROOT}/AGENTS.md"        # when this skill came from the plugin
```

If neither exists, fetch <https://asdalexey.github.io/vitest-auto-spy/llms-full.txt>.

The **types are the authority** when any doc and the code disagree — check
`node_modules/vitest-auto-spy/dist/index.d.ts` (one `.d.ts` per subpath).

## Before writing anything

1. **Identify the runner.** `package.json` scripts plus the config file: Vitest, `bun test`, or
   `node --test`. The import path depends on it — `vitest-auto-spy` / `…/bun` / `…/node` — and the
   wrong one leaves the wrong mock adapter registered.
2. **Check the setup file** for `import 'vitest-auto-spy/rxjs'` and `setupAutoSpy()`. Observable
   helpers (`nextWith`, `observablePropsToSpyOn`) throw without the rxjs import.
3. **Follow the suite's existing conventions** — globals vs. explicit `import { describe } from
'vitest'`, file layout, naming. Match the neighbouring spec.

## The decision that matters

```
Angular / NestJS / Vue?         → provideAutoSpy(Class) in the providers, injectSpy(Class) to read
Real class, constructed by you? → createSpyFromClass(Class, config?)   → Spy<T>
Type only, and it gets CALLED?  → createAutoMock<T>(overrides?)        → Spy<T>
…and calls chain (a.b.c())?     → mockDeep<T>(overrides?)
Type only, and it is only READ? → createMock<T>(partial?)              → plain T, no spies
A single function?              → createFunctionSpy<Fn>('name')
Code does `new Foo()`?          → createSpyClass(Foo)
```

In an Angular app the DI path dominates: across a ~370-file suite `provideAutoSpy` appears in 371
files and bare `createSpyFromClass` in 41. Write the DI shape unless the class is constructed by
hand.

## Skeleton — Angular

```ts
describe('TaskService', () => {
  let projects: Spy<ProjectStore>;
  let service: TaskService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideAutoSpy(NotificationService),
        provideAutoSpy(ProjectStore, { instanceMethodsToSpyOn: ['current'] }), // signals/computed
        provideAutoSpy(NewsFeedService, { observablePropsToSpyOn: ['connected$'] }), // Observable props
      ],
    });

    projects = injectSpy(ProjectStore);
    projects.save.mockReturnValue(of(true)); // seed defaults once
    service = TestBed.inject(TaskService);
  });
});
```

One `configureTestingModule` per `describe` — reconfiguring per `it()` recompiles the module every
test. Use `mockReadonlyProp(component, 'selected', signal(true))` for the signals of the class under
test, `await stable(fixture)` before asserting zoneless state, `renderShallow` for components.

## Skeleton — anything else

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

## Reach for these before hand-rolling

| Situation                                                          | Helper                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| a `signal()` / `computed()` field on the class under test          | `mockSignalProp(obj, prop, initial)` — returns the writable       |
| an `effect()` whose trigger is now a static signal                 | `runEffect(effectRef)`                                            |
| the component constructs its own `IntersectionObserver`            | `stubIntersectionObserver()` (+ `Resize` / `Mutation`)            |
| a green run exiting 1 with `AbortError` under happy-dom            | `setupAutoSpy({ blockNetwork: true })`                            |
| timers or frames from a previous file failing this one             | `setupAutoSpy({ strayTimers: true })`                             |
| `Cannot read properties of undefined (reading 'now')`              | `restoreTimerGlobals` — on by default                             |
| a spy handed to an API typed against the real class                | `asInstance()` / `asSpy()`                                        |
| the code under test does `new X()` (a global, a vendor SDK)        | `mockConstructor(factory)` / `stubConstructor(obj, key, factory)` |
| `X is not a constructor`, with a stack in production code          | same — a `vi.fn(() => …)` cannot serve `new`                      |
| waiting for a dynamic `import()` under fake timers                 | `settleDynamicImport(() => import('…'))` / `flushEventLoop()`     |
| `addEventListener(…, { signal })` throwing about `EventTarget`     | `stubAbortController()`                                           |
| a suite ported from Jest's `fakeTimers.enableGlobally`             | `setupAutoSpy({ globalFakeTimers: true })`                        |
| a nested `describe`'s `beforeAll` landing on real timers           | `setupFakeTimers(cfg, { betweenTests: true })`                    |
| setup hooks applying to the first spec file of a worker only       | the setup module is cached — run coverage with `--isolate`        |
| `fakeAsync` inside `test.concurrent`                               | `installProxyZonePatch({ scope: 'callback' })`                    |
| an assertion containing a date                                     | `mockSystemTime(iso)` — never `vi.spyOn(globalThis, 'Date')`      |
| a spec asserting on tick _order_ under a frozen clock              | `useCountingClock()`                                              |
| a dependency declared in the component's own `providers`           | `overrideComponentProvider(Cmp, Token)`                           |
| `NG0303` / `NG0301` / `NG0304` from an imported NgModule           | `assertNgModuleScopes(Module)` — an AOT bundle stripped its scope |
| a focus assertion failing as `expected false to deeply equal true` | `registerFocusMatchers()` + `expect(el).toHaveFocus()`            |
| a collaborator passed as an argument, then asserted on             | `autoMocked<T>()` — typed `T & Spy<T>`                            |
| a `<video>` / `<audio>`: `play()` throws, `duration` is `NaN`      | `stubMediaElement({ duration })`, then `media.set(el, …)`         |
| a `vi.mock()` that silently did nothing under a bundler            | `assertMocked(ns, { specifier, exports })`                        |
| `No "default" export is defined on the mock`                       | `vi.mock('x', () => moduleNamespace({ … }))`                      |
| waiting for a `resource()` / an SDK to become ready                | `flushEventLoopUntil(() => …, { label })` — budgeted, not tuned   |
| `expected [ { at: 1, …(5) }, …(8) ] to deeply equal …`             | `expect(diffByField(actual, expected)).toBeUndefined()`           |
| a stub that works only in the first test of the file               | `installPerTest(() => stub…())` — or install it in `beforeEach`   |
| a library failing every other run after a `defineProperty` on DOM  | `setupAutoSpy({ guardGlobals: 'throw' })` names the file          |
| `Cannot set base providers because it has already been called`     | `setupAngularTestEnv({ zoneless, initZone, initZoneless })`       |
| a dependency behind an `InjectionToken`, with no class to spy       | `provideAutoSpyForToken(TOKEN)` + `injectSpy(TOKEN)`              |
| `Expected to be running in 'ProxyZone', but it was not found`      | `import 'vitest-auto-spy/zone'` (needs `globals: true`)           |
| `Property 'mockReturnValue' does not exist on type 'never'`        | upgrade — the spy no longer collapses on an unreadable return type |
| a signal-valued getter that `gettersToSpyOn` will not accept       | it accepts any key now; for a signal prefer `mockSignalProp`      |
| five `asInstance(…)` in one call, found one per `tsc` run          | `...asInstances(a, b, c, d, e)`                                   |
| `nextWith` demanding `HttpEvent<T>` on a generated client          | `asSpy<Client, { overload: 'first' }>(…)` / `Overload<M, 0>`      |
| a fixture that needs a nested object built by its own call         | `createMock<T>({ a: { b: 1 } })` — deep partial, still exact      |
| `'params' in link` ladders, or a cast, to pick a union branch      | `narrow.byKey(link, 'params')` / `narrow.observable(x)`           |
| `{ ...modelInstance, flag: true }` losing every getter             | `withOverrides(modelInstance, { flag: true })`                    |
| `NG0303` / `NG0304` / silence from a directive spec                | `createDirectiveHost({ template, scope: [Module] })`              |
| "did the migration lose a test?" with matching counters            | `compareTestRuns(before, after)`                                  |

## Rules that prevent most of the mistakes

- Declare the variable as **`Spy<T>`, never as `T`** — `Spy<T>` is a mapped type and drops private
  members. Bridge with `asInstance()` / `asSpy()`, never with `as unknown as T`.
- **`methodsToSpyOn` **adds** to the discovered prototype methods**, as in `jest-auto-spies`;
  `onlyMethodsToSpyOn` is the exhaustive whitelist. Omitting both is usually right. For a callable
  that is an instance field (arrow property, `signal()`, ngrx `signalStore()`), use
  `instanceMethodsToSpyOn` — prototype discovery cannot see it.
- **Never `Object.defineProperty` in a spec.** Use `mockReadonlyProp` / `mockValueProp` /
  `mockAccessorsProp`, which `restoreMockedProps()` can undo (`vi.restoreAllMocks()` cannot).
- **Never `expect()` inside a `subscribe()` callback** — a silent stream makes it a green test that
  asserted nothing. Use `expectEmission` / `expectEmissions` / `expectNoEmission` and `await`.
- **Never assert a signal with `toBeTruthy()`** — every signal is truthy. Use
  `toHaveSignalValue(v)` after `registerSignalMatchers()`.
- **Never `vi.mock('@angular/core')`** (or any relative path) under the Angular unit-test builder —
  the specs are bundled, so it fails with `Cannot access '__vi_import_N__' before initialization`.
  To control an `effect()`, set the signals it reads and assert what it produced.
- **`injectSpy(X)` only reaches the global TestBed.** For a component-level provider use
  `asSpy(fixture.debugElement.injector.get(X))` to read it, or `overrideComponentProvider(Cmp, X)` to
  replace it — `provideAutoSpy` loses to a provider the component declares, silently.
- **Declare `Spy<T>`, never Vitest's `Mocked<T>`** — `Mocked<T>` keeps the private members, so the
  assignment fails with a list of private field names that says nothing about the declaration being
  the problem.
- **Vitest has no `done` callback.** The first parameter of a test or hook is its `TestContext`;
  calling it throws inside a promise nobody awaits, and the test passes having run almost nothing.
- **A shared fixture is a factory, not a constant.** Under `isolate: false` a module is evaluated
  once per worker, so an exported object holding `vi.fn()`s is one set of spies for every file that
  imports it. A spec file must export nothing at all.
- **`detectChanges()` does not run `afterNextRender`,** and `whenRenderingDone()` is not a stronger
  `whenStable()` — with an animation renderer it degrades to `Promise.resolve()`. Use
  `await stable(fixture)`.

## Finish

```bash
npx vitest run path/to/file.spec.ts   # or the project's own command
npx tsc --noEmit
```

Most of this library's guarantees are type-level, so a green run that does not type-check is not
done. Report failures with their output rather than describing them as passing.
