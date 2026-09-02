---
name: vitest-auto-spy
description: Write or fix tests that use vitest-auto-spy — typed spies generated from a class or a type on Vitest, bun:test and node:test. Use when a spec imports `vitest-auto-spy` or any of its subpaths (`/angular`, `/bun-angular`, `/bun`, `/node`, `/rxjs`, `/nestjs`, `/jasmine`, `/jasmine-compat`, `/observer-spy`, `/setup`, `/zone`, `/eslint-plugin`), when the user mentions createSpyFromClass, createAutoMock, createMock, createFixture, createFixtureFactory, mockDeep, createFunctionSpy, createSpyObj, enableJasmineCompat, subscribeSpyTo, provideAutoSpy, provideAutoSpyForToken, injectSpy, renderShallow, createWithAutoSpies, createDirectiveHost, overrideComponentProvider, enableAngularDiagnostics, assertNgModuleScopes, assertComponentDefIntact, trackInjections, runEffect, settleResource, mockResourceProp, mockSignalProp, mockReadonlyProp, captureArg, expectEmission, expectError, setupAutoSpy, stubIntersectionObserver, stubConstructor, mockSystemTime, assertMocked, Spy<T>, calledWith, mustBeCalledWith, onlyMethodsToSpyOn, instanceMethodsToSpyOn, observablePropsToSpyOn, strict, onUnstubbedCall, resolveWith or nextWith, when migrating a suite off jest-auto-spies or jasmine-auto-spies (`npx vitest-auto-spy codemod --from jasmine`), or when a test fails with "No mock adapter registered", "Observable spies require rxjs", "not found on the class prototype", "strict mode is on", "the override did not apply", "is not a constructor", "Expected to be running in 'ProxyZone'", "jasmine is not defined" or "Spy<T> is not assignable".
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
…and many specs share it?       → createFixtureFactory<T>(defaults)     → (overrides?) => T
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
test, `await stable(fixture)` before asserting zoneless state, `renderShallow` for components. For an
`httpResource()` / `resource()`: `flushEffects()` (the request is issued there, not on creation),
flush it, then `await settleResource(r)` — asserting earlier reads the resource's default value and
passes emptily. When the request is not what the spec is about, skip it: `mockResourceProp(service,
'products', [])` gives a double whose `set` / `fail` / `loading` move it directly, with nothing in
flight to await.

## Migrating a suite off `jest-auto-spies`

Run the codemod; do not hand-edit the imports.

```bash
npx vitest-auto-spy codemod            # dry run — prints the diff, writes nothing
npx vitest-auto-spy codemod --write    # apply
npx vitest-auto-spy codemod --verify   # exits 1 on anything still matching what it removes
```

It splits the legacy import across the entry points that actually export each name (read off the
installed package's export map), rewrites `TestBed.inject(X) as Spy<X>` into
`asSpy<X>(TestBed.inject(X))`, and transposes `jest.Mock<R, [A]>` into the single call signature
Vitest takes — a plain rename compiles into the reverse meaning and fails nowhere near the line. A
`jest.*` member with no `vi` twin is left alone and reported instead of guessed at. Run `--verify`
after `--write` and after any manual clean-up: it matches the _result_, so it also covers files
edited by hand.

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

| Situation                                                           | Helper                                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| a `signal()` / `computed()` field on the class under test           | `mockSignalProp(obj, prop, initial)` — returns the writable                                          |
| a resource field, when the HTTP round trip is not the point         | `mockResourceProp(obj, prop, initial)` — `set` / `fail` / `loading`                                  |
| asserting a resource's value _and_ status together                  | `registerResourceMatchers()` → `toHaveResourceValue` / `toBeLoading`                                 |
| a callback or config object the code under test built               | `captureArg<T>()` in the assertion, then read `.value`                                               |
| an `effect()` whose trigger is now a static signal                  | `runEffect(effectRef)`                                                                               |
| the component constructs its own `IntersectionObserver`             | `stubIntersectionObserver()` (+ `Resize` / `Mutation`)                                               |
| a green run exiting 1 with `AbortError` under happy-dom             | `setupAutoSpy({ blockNetwork: true })`                                                               |
| a real request going out of a unit run (`fetch`, XHR, `sendBeacon`) | `setupAutoSpy({ blockNetwork: true })` — `{ xhr: 'empty' }` for pings                                |
| timers or frames from a previous file failing this one              | `setupAutoSpy({ strayTimers: true })`                                                                |
| an assertion error in stderr, every test green and the run at 0     | `setupAutoSpy({ strayRejections: true })` — zone.js swallowed it                                     |
| a run getting slower the longer it goes, on `isolate: false`        | `setupAutoSpy({ pruneMockRegistry: true })` — the mock registry                                      |
| `Cannot read properties of undefined (reading 'now')`               | `restoreTimerGlobals` — on by default                                                                |
| a spy handed to an API typed against the real class                 | `asInstance()` / `asSpy()`                                                                           |
| the code under test does `new X()` (a global, a vendor SDK)         | `mockConstructor(factory)` / `stubConstructor(obj, key, factory)`                                    |
| `X is not a constructor`, with a stack in production code           | same — a `vi.fn(() => …)` cannot serve `new`                                                         |
| waiting for a dynamic `import()` under fake timers                  | `settleDynamicImport(() => import('…'))` / `flushEventLoop()`                                        |
| `addEventListener(…, { signal })` throwing about `EventTarget`      | `stubAbortController()`                                                                              |
| a suite ported from Jest's `fakeTimers.enableGlobally`              | `setupAutoSpy({ globalFakeTimers: true })`                                                           |
| a nested `describe`'s `beforeAll` landing on real timers            | `setupFakeTimers(cfg, { betweenTests: true })`                                                       |
| setup hooks applying to the first spec file of a worker only        | the setup module is cached — run coverage with `--isolate`                                           |
| `fakeAsync` inside `test.concurrent`                                | `installProxyZonePatch({ scope: 'callback' })`                                                       |
| an assertion containing a date                                      | `mockSystemTime(iso)` — never `vi.spyOn(globalThis, 'Date')`                                         |
| a spec asserting on tick _order_ under a frozen clock               | `useCountingClock()`                                                                                 |
| a dependency declared in the component's own `providers`            | `overrideComponentProvider(Cmp, Token)` — it verifies on the first fixture that the override applied |
| a double answering `undefined` for a method nobody configured       | `{ strict: true }`, or `setupAutoSpy({ strict: true })` suite-wide                                   |
| an `afterEach` that exists only to reset one spy                    | `using spy = createSpyFromClass(X)` — `[Symbol.dispose]` resets it                                   |
| a dead NgModule import, dead `schemas`, an unflushed HTTP request   | `enableAngularDiagnostics()` in the setup file, after `initTestEnvironment`                          |
| "which collaborators did this actually inject?"                     | `trackInjections([A, TOKEN])` — providers plus the record, not `vi.mock`                             |
| `NG0303` / `NG0301` / `NG0304` from an imported NgModule            | `assertNgModuleScopes(Module)` — an AOT bundle stripped its scope                                    |
| `Cannot read properties of undefined (reading 'provide')` in `di_setup` | `assertComponentDefIntact(Cmp)` — a barrel chunk left a hole in `ɵcmp`                            |
| a focus assertion failing as `expected false to deeply equal true`  | `registerFocusMatchers()` + `expect(el).toHaveFocus()`                                               |
| a collaborator passed as an argument, then asserted on              | `autoMocked<T>()` — typed `T & Spy<T>`                                                               |
| a `<video>` / `<audio>`: `play()` throws, `duration` is `NaN`       | `stubMediaElement({ duration })`, then `media.set(el, …)`                                            |
| a `vi.mock()` that silently did nothing under a bundler             | `assertMocked(ns, { specifier, exports })`                                                           |
| `No "default" export is defined on the mock`                        | `vi.mock('x', () => moduleNamespace({ … }))`                                                         |
| waiting for a `resource()` / an SDK to become ready                 | `flushEventLoopUntil(() => …, { label })` — budgeted, not tuned                                      |
| `expected [ { at: 1, …(5) }, …(8) ] to deeply equal …`              | `expect(diffByField(actual, expected)).toBeUndefined()`                                              |
| a stub that works only in the first test of the file                | `installPerTest(() => stub…())` — or install it in `beforeEach`                                      |
| a library failing every other run after a `defineProperty` on DOM   | `setupAutoSpy({ guardGlobals: 'throw' })` names the file                                             |
| `Cannot set base providers because it has already been called`      | `setupAngularTestEnv({ zoneless, initZone, initZoneless })`                                          |
| a dependency behind an `InjectionToken`, with no class to spy       | `provideAutoSpyForToken(TOKEN)` + `injectSpy(TOKEN)`                                                 |
| `Expected to be running in 'ProxyZone', but it was not found`       | `import 'vitest-auto-spy/zone'` (needs `globals: true`)                                              |
| `Property 'mockReturnValue' does not exist on type 'never'`         | upgrade — the spy no longer collapses on an unreadable return type                                   |
| a signal-valued getter that `gettersToSpyOn` will not accept        | it accepts any key now; for a signal prefer `mockSignalProp`                                         |
| five `asInstance(…)` in one call, found one per `tsc` run           | `...asInstances(a, b, c, d, e)`                                                                      |
| `nextWith` demanding `HttpEvent<T>` on a generated client           | `asSpy<Client, { overload: 'first' }>(…)` / `Overload<M, 0>`                                         |
| a fixture that needs a nested object built by its own call          | `createMock<T>({ a: { b: 1 } })` — deep partial, still exact                                         |
| the same 100-line model literal copied into eight specs (`TS1117`)  | one `createFixtureFactory<T>(defaults)`; specs call it with what they change          |
| `'params' in link` ladders, or a cast, to pick a union branch       | `narrow.byKey(link, 'params')` / `narrow.observable(x)`                                              |
| `{ ...modelInstance, flag: true }` losing every getter              | `withOverrides(modelInstance, { flag: true })`                                                       |
| `NG0303` / `NG0304` / silence from a directive spec                 | `createDirectiveHost({ template, scope: [Module] })`                                                 |
| "did the migration lose a test?" with matching counters             | `compareTestRuns(before, after)`                                                                     |

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
  Measured: the same false assertion written four ways against four streams leaves **every**
  `subscribe` form green — see `core/observable-assertions#measured-four-forms-against-four-streams`.
  `firstValueFrom` fixes three of the four; only `expectEmission` names the stream in the fourth.
  `expectCompletion` is the one for a stream whose value is not the point (an `Observable<void>`,
  a save, a purge) — `firstValueFrom` rejects that one with rxjs's `EmptyError`. For the **error**
  branch use `firstValueFrom(...).rejects` instead: these helpers wrap the failure in a new `Error`,
  so `rejects.toBe(originalError)` cannot pass.
- **Never leave an `expect()` in a `.then()` nobody awaits** — a promise chain that is a statement
  of its own runs its callback after the test has finished, so the assertion cannot fail it, and
  under zone.js the rejection is swallowed into `console.error` rather than reported.
  `await` the promise and assert the settled value; `setupAutoSpy({ strayRejections: true })` turns
  the ones already in a suite into failures.
- **`strict` answers "nobody configured this method", never "nobody configured this call."** A
  `calledWith` chain for other arguments does not trip it — that is `mustBeCalledWith`. It does not
  reach accessor spies, observable-property spies, `mockDeep` nodes, `console-spy`,
  `mockResourceProp`'s `reload` or a standalone `createFunctionSpy`, and `mockReturnValue` /
  `mockImplementation` / `returns:` bypass it by replacing the dispatch.
- **Never assert a signal with `toBeTruthy()`** — every signal is truthy. Use
  `toHaveSignalValue(v)` after `registerSignalMatchers()`.
- **Never assert a resource with `expect(r.value()).toEqual(...)` alone** — an unresolved resource
  still holds its _default_, so that passes while proving nothing. `toHaveResourceValue(v)` after
  `registerResourceMatchers()` fails unless the resource actually resolved.
- **`calledWith` matches exact arguments first, then the matcher configs in registration order** —
  so put the narrow `expect.any(Number)` before the wide `expect.anything()` when both can match.
  Re-registering the same arguments replaces the previous answer, matcher arguments included: two
  `calledWith(1, expect.anything())` lines are an override, not two configs.
- **On Bun (`bun:test`), an asymmetric matcher inside `calledWith` matches nothing** — Bun's
  `expect.any()` / `expect.objectContaining()` are native objects carrying no `asymmetricMatch`, so
  the config is kept as an ordinary argument and the call falls through to `undefined` instead of
  failing. Dispatch on exact arguments there, or use `mockImplementation`.
- **Never put `captureArg()` in `calledWith`** — it matches every value, so it configures a return
  for every call. It belongs in `toHaveBeenCalledWith`; the types enforce this.
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

## A suite arriving from `jasmine-auto-spies`

`jasmine-auto-spies` and `jest-auto-spies` are the same library over the same core; every
configuration key and helper name is identical. **One thing differs**: upstream parks its async
helpers behind `.and`, so `spy.load.and.nextWith(v)` is `spy.load.nextWith(v)` here.

Land it green before rewriting anything — change only the import specifier:

```ts
import { createSpyFromClass, provideAutoSpy, type Spy } from 'vitest-auto-spy/jasmine';
```

That entry registers the Vitest adapter and installs `.and`, `.calls` and `.withArgs` on every spy.
`import { jasmine } from 'vitest-auto-spy/jasmine'` restores the whole `jasmine` namespace
(`objectContaining`, `any`, `createSpyObj`, `clock()`, the eight matchers Vitest has no twin for);
nothing is put on `globalThis`. On `bun test` / `node --test` that entry cannot load — call
`enableJasmineCompat()` from `vitest-auto-spy/jasmine-compat` once, in a setup file, before any spy
is built.

Then `npx vitest-auto-spy codemod --from jasmine` does the rewriting and the import goes.

**Three things that fail silently, and are worth checking by hand:**

- `spyOn(o, 'm')` → `vi.spyOn(o, 'm')` **inverts the default**. jasmine stubs, Vitest calls through.
  Write `vi.spyOn(o, 'm').mockImplementation(() => undefined)` where the line meant "stub it".
- `.withContext('msg')` does **not** throw under Vitest — chai has an internal method of that name
  that swallows a string — so the label vanishes from the failure output. Write
  `expect(actual, 'msg').toBe(expected)`.
- `.calls.saveArgumentsByValue()` is a **no-op** here, so the spec starts asserting on post-mutation
  state. Take the copy at call time in a `mockImplementation`.

`.and.callThrough()` also means something different: here it restores this library's own dispatch,
so `calledWith` decides the value again.

**`@hirez_io/observer-spy` comes with it.** `vitest-auto-spy/observer-spy` exports `subscribeSpyTo`,
`SubscriberSpy` and `ObserverSpy`, so stream assertions do not have to be rewritten in the same
commit. `autoUnsubscribe()` and `fakeTime()` are **not** implemented — use
`using spy = subscribeSpyTo(source$)` and `setupFakeTimers()` + `await advanceTimers(ms)`. In new
specs prefer `expectEmission` / `expectEmissions`: observer-spy passes on silence, those fail on it.

Full mapping:
<https://asdalexey.github.io/vitest-auto-spy/migrating-jasmine>.

## Finish

```bash
npx vitest run path/to/file.spec.ts   # or the project's own command
npx tsc --noEmit
npx vitest-auto-spy doctor            # after a large edit: defects a green run cannot show
npx vitest-auto-spy codemod --verify  # after a migration: anything the transforms should have removed
```

Most of this library's guarantees are type-level, so a green run that does not type-check is not
done. Report failures with their output rather than describing them as passing.

**After any `eslint --fix` over specs, run `npx tsc --noEmit`.** The eighteen rules in
`vitest-auto-spy/eslint-plugin` are lint, not typecheck: `no-mocked-for-spy` rewrites a declaration
to `Spy<T>` and cannot see what the name is assigned two lines below, so a clean lint pass is not
evidence that the types still hold. Where it cannot prove the rename it downgrades to a suggestion —
accept those together with the repair at the creation site, usually `createAutoMock<T>()` in place of
an object literal.

Four of those rules are for a suite mid-migration off `jasmine-auto-spies`:
`jasmine-namespace-without-entry`, `no-jasmine-globals`, `no-save-arguments-by-value`, and
`prefer-native-spy-api` — the last one is **`off`** in the recommended config on purpose, because it
reports working code. Turn it on for the last mile, once the suite is green, and not before.

`doctor` is read-only. It reports what neither the runner nor the compiler can: a `tsconfig`
`include` pattern that matches no file, a production module importing a spec, a spec importing
another spec, a foreign runner's `@jest-environment` pragma, and config left behind for a runner
that is gone.
