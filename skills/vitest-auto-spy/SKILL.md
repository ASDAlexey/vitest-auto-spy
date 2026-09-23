---
name: vitest-auto-spy
description: Typed spies on Vitest, bun:test, node:test and Rstest. Use when a spec imports vitest-auto-spy or a subpath (/angular, /angular/diagnostics, /angular/doubles, /angular/matchers, /signal-forms, /bun-angular, /bun, /node, /rstest, /rxjs, /diagnostics, /nestjs, /jasmine, /setup, /zone, /eslint-plugin), naming createSpyFromClass, createAutoMock, createMock, mockDeep, subscribeSpyTo, provideAutoSpy, provideHttpTesting, expectRequest, injectSpy, createNestUnit, extendWithAutoSpies, renderShallow, createWithAutoSpies, enableAngularDiagnostics, trackInjections, runEffect, settleResource, mockResourceProp, mockSignalProp, mockReadonlyProp, registerAutoSpyDefaults, provideActivatedRoute, provideLocationDouble, collectRouterEvents, createLog, createComponentStub, createForm, toHaveFieldErrors, stubWebStorage, assertNoShadowedProviders, createSpyFromInstance, explainSpy, compareTestRuns, expectEmission, setupAutoSpy, setSpyEngine, assertMocked, calledWith, mustBeCalledWith, captureArg, ArgumentCaptor, onlyMethodsToSpyOn, onUnstubbedCall, resolveWith or nextWith, migrating off jest-auto-spies, jasmine-auto-spies or @ngneat/spectator (createSpyObject, mockProvider), or a test fails with "No mock adapter registered", "Observable spies require rxjs", "not on the class prototype", "strict mode is on", "the override did not apply", "is not a constructor", "Expected to be running in 'ProxyZone'", "jasmine is not defined", "no HttpTestingController", "localStorage.setItem is not a function" or "Spy<T> is not assignable".
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

1. **Identify the runner.** `package.json` scripts plus the config file: Vitest, `bun test`,
   `node --test`, or `rstest run`. The import path depends on it — `vitest-auto-spy` / `…/bun` /
   `…/node` / `…/rstest` — and the wrong one leaves the wrong mock adapter registered.
2. **Check the setup file** for `import 'vitest-auto-spy/rxjs'` and `setupAutoSpy()`. Observable
   helpers (`nextWith`, `observablePropsToSpyOn`) throw without the rxjs import, and since 4.0.0
   that file has to be inside the spec `tsconfig` too — `returnSubject()` is typed as rxjs's
   `Subject<T>` only where the compiler sees the import, and as the structural `SubjectLike<T>`
   otherwise (`Type 'SubjectLike<T>' is not assignable to type 'Subject<T>'`).
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
A vi.mock factory's vi.fn()?    → adoptMock(fn).calledWith(…)          → same mock, typed spy
Code does `new Foo()`?          → createSpyClass(Foo)  ─ statics too? { statics: true } (3rd arg)
An object you ALREADY hold?      → createSpyFromInstance(obj, config?) → Spy<T>, patched in place
…and it must keep working?      → createSpyFromInstance(obj, { passthrough: true })
```

In an Angular app the DI path dominates: across a ~370-file suite `provideAutoSpy` appears in 371
files and bare `createSpyFromClass` in 41. Write the DI shape unless the class is constructed by
hand.

## Advice that is wrong on Vitest

Jest-era tutorials and cheat sheets repeat these; each was checked on Vitest 5.0.0.

- A `vi.mock` factory cannot read a top-level `const` — the call is hoisted above it
  (`Cannot access 'x' before initialization`), and a `mock` prefix does not exempt a name as it does
  in Jest. Use `const mocks = vi.hoisted(() => ({ load: vi.fn() }))`.
- Partial module mock: `vi.mock(path, async (importOriginal) => ({ ...(await importOriginal<typeof import('./x')>()), load: vi.fn() }))`.
  `vi.requireActual` does not exist.
- `import { jest } from 'vitest'` is `undefined` — the namespace is `vi`.
- `import userEvent from '@testing-library/user-event'` (the named export exists only from 14.5),
  then `const user = userEvent.setup(); await user.click(el)`.
- `vi.restoreAllMocks()` does not uninstall fake timers — `vi.useRealTimers()` does.
- Never `global.fetch = vi.fn()`: it outlives the test. `mockValueProp(globalThis, 'fetch', …)`,
  `vi.stubGlobal` with `unstubGlobals: true`, or `blockNetwork()`; `no-hand-assigned-global` reports it.

## Skeleton — Angular

The `/angular` and `/bun-angular` entries need **Angular >= 20** — `@angular/core`,
`@angular/common`, `@angular/platform-browser` and `@angular/router` are optional peers on that one range. Below it the
entry does not link (`ɵSIGNAL` is Angular 18+, `provideZonelessChangeDetection` Angular 20+), so the
error arrives at import, not at a helper call.

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
        // NOT { provide: X, useValue: createSpyFromClass(X, config) } — that IS provideAutoSpy(X, config),
        // and `prefer-provide-auto-spy` rewrites it
      ],
    });

    projects = injectSpy(ProjectStore);
    projects.save.mockReturnValue(of(true)); // seed defaults once
    service = TestBed.inject(TaskService);
  });
});
```

One `configureTestingModule` per `describe` — reconfiguring per `it()` recompiles the module every
test. Use `mockSignalProp(service, 'count', 0)` for a signal on a collaborator — a member that already is
a `signal()`, `model()`, `linkedSignal()` **or a `signal().asReadonly()` view** is written through rather
than replaced, so patching after the first render is no longer a silent no-op; only a `computed()` a live
consumer has already read is refused, and an `input()` is refused by name (change one with
`await setInputs(fixture, { … })`, which resolves an alias by its class-field name and accepts an input a
`hostDirectives` entry exposes — `renderShallow({ inputs })` resolves the same way, and either refuses a
name the component does not declare at the call). `await stable(fixture)` before asserting zoneless state, `renderShallow` for components — `prefer-render-shallow` reports the `TestBed.createComponent` in a file that reads no markup back, and the rewrite is a suggestion rather than a `--fix` because `renderShallow` configures the module itself. For an
`httpResource()`, `await expectRequest(url).flush(body)` from `vitest-auto-spy/angular-http` is the
whole dance — the request is issued by `flushEffects()`, not on creation, and the value is settled
before the promise resolves; by hand it is six steps and asserting early reads the resource's
default value and passes emptily. For a `resource()` with no single request behind it, drive it and
`await settleResource(r)`. When the request is not what the spec is about, skip it: `mockResourceProp(service,
'products', [])` gives a whole `ResourceRef` double — `set` / `fail` / `loading` / `idle` move it
directly, `value` is writable, `hasValue()` follows Angular's value-based rule, and there is nothing
in flight to await. It is no more forgiving than the real thing: `value()` read after `fail()`
**throws** (branch on `hasValue()` / `status()`, or assert with `toHaveResourceError()`), and
`reload()` answers `false` while `idle` or `loading`. `settleResource` refuses a resource that is still
`idle`, because an idle one never ran its loader and every assertion below it would read the default.

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

Every rewrite is parsed with the project's own `typescript` before it is written, so a file the run
would have broken is reported as `codemod-broke-syntax` and left byte for byte as it was; JavaScript
specs are visited too. An unknown flag for a known command, and a path matching no file, are errors
with **exit 2** and nothing runs — `init --dryrun` used to write the files.

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

| Situation                                                                                         | Helper                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a `signal()` / `computed()` field on the class under test                                         | `mockSignalProp(obj, prop, initial)` — writes through a writable one, `asReadonly()` included; an `input()` is refused                                                            |
| a resource field, when the HTTP round trip is not the point                                       | `mockResourceProp(obj, prop, initial)` — `set` / `fail` / `loading`; `value()` after `fail()` throws                                                                              |
| the HTTP round trip _is_ the point                                                                | `expectRequest(url).flush(body)` — `/angular-http`, settling included                                                                                                             |
| a component or service that reads `ActivatedRoute`                                                | `provideActivatedRoute({ params })`, then `injectActivatedRoute().setParams(…)` — `/angular-router`                                                                               |
| a guard or a class built with `new` that takes the route                                          | `createActivatedRoute({ params })` — the same handle, no `TestBed`                                                                                                                |
| a node:test suite whose heap grows all run                                                        | `trackNodeMocks()` — `/node`, a private MockTracker                                                                                                                               |
| a Nest provider whose constructor keeps changing                                                  | `createNestUnit(Target, { expose })` — built from its DI metadata                                                                                                                 |
| asserting a resource's value _and_ status together                                                | `registerResourceMatchers()` (`/angular/matchers`) → `toHaveResourceValue` / `toBeLoading`                                                                                        |
| a callback or config object the code under test built                                             | `captureArg<T>()` in the assertion, then read `.value`; `{ where }` records only what it accepts                                                                                  |
| an object the test already holds — a real service, a client, `TestBed.inject(X)`                  | `createSpyFromInstance(obj, config?)` — patches it in place, `restoreSpiedInstance` undoes it                                                                                     |
| assert calls on a real object or service but keep it working                                      | `createSpyFromInstance(obj, { passthrough: true })` — real method runs until configured; not with `strict: true` on the same call                                                 |
| a `vi.mock` factory's `vi.fn()` needs `calledWith` / `resolveWith`                                | `adoptMock(api.load).calledWith(7).resolveWith(…)` — same object, history kept                                                                                                    |
| real module, one case configured                                                                  | `vi.mock('x', async (orig) => moduleNamespace(await orig(), { passthrough: true }))`                                                                                              |
| feeding a stubbed `fetch`                                                                         | `vi.fn(async () => stubResponse({ body: data }))` from `/setup` — a real `Response`, no `as Response`; a body reads once                                                          |
| a backend that answers the JSON literal `null`                                                    | `stubResponse({ body: null })` — the literal, not "no body"; `undefined` or an omitted `body` is the way to send none                                                             |
| the code under test lazy-loads on a click and the spec has no promise                             | `await settleDynamicImport(() => import('./thing'))` — a bare `await import(…)` waits for the module, not for the handler's continuation                                          |
| MSW handlers not answering under `setupAutoSpy({ blockNetwork: true })`                           | upgrade — `blockNetwork` now leaves `fetch` to MSW's interceptor; end the handlers with `http.all('*', () => HttpResponse.error())`                                               |
| `mockDeep` member read by index, or an unmocked call that should fail                             | `mock.items[0].x = 1` makes a real array (re-read `mock.items` after); `mockDeep<T>({}, { fallbackMockImplementation: () => { throw … } })` — options are the **second** argument |
| mocking `PrismaClient`                                                                            | `mockDeep<PrismaClient>()` + `resolveWith` / `rejectWith` / `resolveWithPerCall`; `$transaction.mockImplementation((run) => run(asInstance(prisma)))`                             |
| `[Function] is not a spy or a call to a spy!` inside a Storybook `play`                           | import `expect` from `vitest` in that story file, or `setSpyEngine('runner')` from `/setup`                                                                                       |
| `vi.spyOn(Class.prototype, 'x')` → `The property "x" is not defined on the object.`               | `x` is an instance field (arrow, signal) — `createSpyFromClass(C, { instanceMethodsToSpyOn: ['x'] })`                                                                             |
| a spy or a `mock*Prop` patch leaking into the next `bun test` test                                | `/setup` is Vitest-only — preload `afterEach(() => { restoreMockedProps(); mock.restore(); })`                                                                                    |
| a `calledWith` that is not matching and you cannot see why                                        | `explainSpy(spy, 'method')` from `/diagnostics` — configs, calls, which hit which                                                                                                 |
| a method that has to throw — for all calls, or for some arguments                                 | `spy.m.failWith(err)` / `spy.m.calledWith(x).failWith(err)` — **not** `throwWith`                                                                                                 |
| a `TestBed` spec on Vitest 4.1+, to drop `let` + `beforeEach`                                     | `extendWithAutoSpies(test, { cart: CartService })` (`/angular`)                                                                                                                   |
| an `effect()` whose trigger is now a static signal                                                | `runEffect(effectRef)`                                                                                                                                                            |
| the component constructs its own `IntersectionObserver`                                           | `stubIntersectionObserver()` (+ `Resize` / `Mutation`) — `last.host` is the callback’s 2nd argument                                                                               |
| a green run exiting 1 with `AbortError` under happy-dom                                           | `setupAutoSpy({ blockNetwork: true })`                                                                                                                                            |
| a real request going out of a unit run (`fetch`, XHR, `sendBeacon`)                               | `setupAutoSpy({ blockNetwork: true })` — `{ xhr: 'empty' }` for pings                                                                                                             |
| timers or frames from a previous file failing this one                                            | `setupAutoSpy({ strayTimers: true })` — mutes `--detect-async-leaks`; blind under fake timers                                                                                     |
| an assertion error in stderr, every test green and the run at 0                                   | `setupAutoSpy({ strayRejections: true })` — zone.js swallowed it                                                                                                                  |
| a run getting slower the longer it goes, on `isolate: false`                                      | `setupAutoSpy({ pruneMockRegistry: true })` — the mock registry                                                                                                                   |
| a listener or a replaced global from a previous file answering in this one, on `isolate: false`   | `setupAutoSpy({ strayListeners: true, restoreGlobals: true })`                                                                                                                    |
| the same, piece by piece                                                                          | `trackStrayListeners` / `baselineStrayListeners` / `removeStrayListeners` / `countStrayListeners` / `describeStrayListeners`; `captureGlobalBaseline` / `restoreGlobals`          |
| a storage spy still recording after `vi.restoreAllMocks()` under happy-dom                        | `restoreStorageSpies` — on by default; `restoreStorageSpies()` alone                                                                                                              |
| a stream that must emit exactly these values and complete                                         | `await expectAllEmissions(source$)`                                                                                                                                               |
| a fixture outside its type on purpose (the `null` a backend sends)                                | `outOfType<T>(value)` — no cast                                                                                                                                                   |
| one setup file for the Angular unit-test builder and plain Vitest                                 | `if (!isAngularUnitTestBuilder()) TestBed.initTestEnvironment(…)`                                                                                                                 |
| `JavaScript heap out of memory` on a suite of wide generated clients                              | nothing to configure — the default shares one placeholder per method name (215 B per untouched 100-method double); `lazySpies: 'proxy'` retains 19× more now                      |
| `Cannot read properties of undefined (reading 'now')`                                             | `restoreTimerGlobals` — on by default                                                                                                                                             |
| `localStorage.setItem is not a function`, or it is `undefined`                                    | `restoreWebStorage` — on by default; Vitest's global filter, Node 25+                                                                                                             |
| a spy handed to an API typed against the real class                                               | `asInstance()` / `asSpy()`                                                                                                                                                        |
| the code under test does `new X()` (a global, a vendor SDK)                                       | `mockConstructor(factory)` / `stubConstructor(obj, key, factory)`                                                                                                                 |
| `X is not a constructor`, with a stack in production code                                         | same — a `vi.fn(() => …)` cannot serve `new`                                                                                                                                      |
| waiting for a dynamic `import()` under fake timers                                                | `settleDynamicImport(() => import('…'))` / `flushEventLoop()`                                                                                                                     |
| `addEventListener(…, { signal })` throwing about `EventTarget`                                    | `stubAbortController()`                                                                                                                                                           |
| `codemod` reporting a truncated repository scan                                                   | `VITEST_AUTO_SPY_SCAN_CAP=<n>` — raises the 50 000-file cap                                                                                                                       |
| a suite ported from Jest's `fakeTimers.enableGlobally`                                            | `setupAutoSpy({ globalFakeTimers: true })`                                                                                                                                        |
| `toHaveBeenCalledBefore` across an auto-spy and a hand-written `vi.fn()`                          | `setSpyEngine('runner')` / `getSpyEngine()` — `/setup`, Vitest only                                                                                                               |
| a nested `describe`'s `beforeAll` landing on real timers                                          | `setupFakeTimers(cfg, { betweenTests: true })`                                                                                                                                    |
| setup hooks applying to the first spec file of a worker only                                      | the setup module is cached — run coverage with `--isolate`                                                                                                                        |
| `fakeAsync` inside `test.concurrent`                                                              | `installProxyZonePatch({ scope: 'callback' })`                                                                                                                                    |
| an assertion containing a date                                                                    | `mockSystemTime(iso)` — never `vi.spyOn(globalThis, 'Date')`                                                                                                                      |
| a spec asserting on tick _order_ under a frozen clock                                             | `useCountingClock()`                                                                                                                                                              |
| a dependency declared in the component's own `providers`                                          | `overrideComponentProvider(Cmp, Token)` — it verifies on the first fixture that the override applied                                                                              |
| a double answering `undefined` for a method nobody configured                                     | `{ strict: true }`, or `setupAutoSpy({ strict: true })` suite-wide                                                                                                                |
| a strict throw caught by a `try`/`catch` or an operator, the test still green                     | `setupAutoSpy({ swallowedStrictCalls: 'throw' })`; provoked on purpose — `takeStrictViolations()` from `/setup`                                                                   |
| a strict double's getter answering `undefined`, or its `items$` never emitting                    | `setupAutoSpy({ unconfiguredReads: 'throw' })` reports it after the test; survey first with `onUnstubbedRead`                                                                     |
| an `afterEach` that exists only to reset one spy                                                  | `using spy = createSpyFromClass(X)` — `[Symbol.dispose]` runs `resetAutoSpy`, which is `vi.resetAllMocks()` for one double                                                        |
| a dead NgModule import, dead `schemas`, an unflushed HTTP request                                 | `enableAngularDiagnostics()` (`/angular/diagnostics`) in the setup file, after `initTestEnvironment`                                                                              |
| the spy is provided but the component resolves its own, so the test runs the real service         | `enableAngularDiagnostics({ shadowedProviders })` or `assertNoShadowedProviders(Component, fixture)` — `/angular/diagnostics`                                                     |
| "which collaborators did this actually inject?"                                                   | `trackInjections([A, TOKEN])` — providers plus the record, not `vi.mock`                                                                                                          |
| `NG0303` / `NG0301` / `NG0304` from an imported NgModule                                          | `assertNgModuleScopes(Module)` — an AOT bundle stripped its scope                                                                                                                 |
| `Cannot read properties of undefined (reading 'provide')` in `di_setup`                           | `assertComponentDefIntact(Cmp)` — a barrel chunk left a hole in `ɵcmp`                                                                                                            |
| a focus assertion failing as `expected false to deeply equal true`                                | `registerFocusMatchers()` + `expect(el).toHaveFocus()`                                                                                                                            |
| a collaborator passed as an argument, then asserted on                                            | `autoMocked<T>()` — typed `T & Spy<T>`                                                                                                                                            |
| a `<video>` / `<audio>`: `play()` throws, `duration` is `NaN`                                     | `stubMediaElement({ duration })`, then `media.set(el, …)`                                                                                                                         |
| a `vi.mock()` that silently did nothing under a bundler                                           | `assertMocked(ns, { specifier, exports })`                                                                                                                                        |
| `No "default" export is defined on the mock`                                                      | `vi.mock('x', () => moduleNamespace({ … }))` — a `default` you spell out is kept                                                                                                  |
| waiting for a `resource()` / an SDK to become ready                                               | `flushEventLoopUntil(() => …, { label })` — budgeted, not tuned                                                                                                                   |
| `expected [ { at: 1, …(5) }, …(8) ] to deeply equal …`                                            | `expect(diffByField(actual, expected)).toBeUndefined()`                                                                                                                           |
| a stub that works only in the first test of the file                                              | `installPerTest(() => stub…())` — or install it in `beforeEach`                                                                                                                   |
| a library failing every other run after a `defineProperty` on DOM                                 | `setupAutoSpy({ guardGlobals: 'throw' })` names the file — it sees an added name, not an existing one redefined                                                                   |
| a block of files failing to collect, with no stack and zero failing tests                         | `setupAutoSpy()` names the file that left a key on `Object.prototype` (`prototypePollution`, on by default)                                                                       |
| the same check in a suite that does not call `setupAutoSpy()`                                     | `guardPrototypePollution('throw')` from `/setup`                                                                                                                                  |
| a spec failing only in a full run on an attribute of `<body>` / `<html>` another file left        | `setupAutoSpy({ documentPollution: 'throw' })` names the test and puts the document back (in `preset: 'strict'`)                                                                  |
| the same document check without `setupAutoSpy()`                                                  | `guardDocumentPollution('throw')` from `/setup`                                                                                                                                   |
| `A metric with the name … has already been registered` / `customElements.define` twice, at import | a module scope evaluated once per spec file under the Angular builder — guard the registration (`getSingleMetric`, `customElements.get`)                                          |
| console output a test never asserted on (a `'warn'` from this library does not count)             | `setupAutoSpy({ strayConsole: 'throw' })` fails that test; absorb with `installConsoleSpies()` in `beforeEach`                                                                    |
| every guard at its strictest grade in one line                                                    | `setupAutoSpy({ preset: 'strict' })` — plus `enableAngularDiagnostics()` from `/angular/diagnostics` for Angular                                                                  |
| an `onlyMethodsToSpyOn` typo or `injectSpy` on a real instance that only warned                   | `setupAutoSpy({ misconfiguration: 'throw' })` throws at the call                                                                                                                  |
| which file and call scheduled a timer that outlived its file                                      | `onStrayTimers: ({ timers }) => expect(timers).toEqual([])`, or `describeStrayTimers()` from `/setup`                                                                             |
| stray timers charged to a file that only writes `localStorage` (jsdom)                            | `withoutStrayTimerTracking(() => seed())` from `/setup` — its timers are neither counted nor cancelled                                                                            |
| `import { consoleErrorSpy }` silencing other files under `isolate: false`                         | `installConsoleSpies()` in `beforeEach`, `restoreConsole()` in `afterEach` — the import installs once per worker                                                                  |
| `Cannot set base providers because it has already been called`                                    | `setupAngularTestEnv({ zoneless, initZone, initZoneless })`                                                                                                                       |
| a dependency behind an `InjectionToken`, with no class to spy                                     | `provideAutoSpyForToken(TOKEN)` + `injectSpy(TOKEN)`; a chained call → `{ selfReturning: ['channel'] }` as the third argument                                                     |
| `Expected to be running in 'ProxyZone', but it was not found`                                     | `import 'vitest-auto-spy/zone'` (needs `globals: true`)                                                                                                                           |
| `Property 'mockReturnValue' does not exist on type 'never'`                                       | upgrade — the spy no longer collapses on an unreadable return type                                                                                                                |
| `TS2345` inside `mockReturnValue` / `mockImplementation` / `mockResolvedValue`                    | the stub is checked against the method's return type now — fix the stub, not the spy                                                                                              |
| `TS2540: Cannot assign to 'x'` on a double whose runtime write works                              | `Spy<T>` keeps `readonly` on purpose — `mockValueProp(spy, 'x', v)`, which a spied **accessor** also needs                                                                        |
| a signal-valued getter that `gettersToSpyOn` will not accept                                      | it accepts any key now; for a signal prefer `mockSignalProp`                                                                                                                      |
| five `asInstance(…)` in one call, found one per `tsc` run                                         | `...asInstances(a, b, c, d, e)`                                                                                                                                                   |
| `nextWith` demanding `HttpEvent<T>` on a generated client                                         | `asSpy<Client, { overload: 'first' }>(…)` / `Overload<M, 0>`                                                                                                                      |
| `not assignable to parameter of type 'HttpEvent<…>'` in a stub of the real body                   | same thing — the helpers read the **last** overload; `{ overload: { m: 'first' } }`, not `@ts-expect-error`                                                                       |
| a fixture that needs a nested object built by its own call                                        | `createMock<T>({ a: { b: 1 } })` — deep partial, still exact                                                                                                                      |
| the same 100-line model literal copied into eight specs (`TS1117`)                                | one `createFixtureFactory<T>(defaults)`; specs call it with what they change                                                                                                      |
| `'params' in link` ladders, or a cast, to pick a union branch                                     | `narrow.byKey(link, 'params')` / `narrow.observable(x)`                                                                                                                           |
| `{ ...modelInstance, flag: true }` losing every getter                                            | `withOverrides(modelInstance, { flag: true })`                                                                                                                                    |
| `NG0303` / `NG0304` / silence from a directive spec                                               | `createDirectiveHost({ template, scope: [Module] })`                                                                                                                              |
| a hand-written `class MockChartComponent` restating a child's selector                            | `createComponentStub(ChartComponent)` (`/angular`) — selector, inputs, outputs read from `ɵcmp`                                                                                   |
| a `TestingStorage` class for `localStorage` / `sessionStorage`                                    | `stubWebStorage('localStorage', { items })` from `/dom-stubs` — `snapshot()` to assert                                                                                            |
| a hand-written `MockWorker` whose `addEventListener` sets `onmessage`                             | `stubWorker({ respond })` from `/dom-stubs` — `last.emit(data)`, `last.messages`                                                                                                  |
| `'x' does not exist in type 'MethodReturns<{ y: any; }>'` on a generic class                      | spell out the type argument — `createSpyFromClass<Config>(Config, …)`; `provideAutoSpy` infers it                                                                                 |
| `injectSpy(ModalRef)` reads a generic class at its constraint, not its default                    | `injectSpy<ModalRef<Data>>(ModalRef)` — a constructor taking `T` hides the default                                                                                                |
| "did the migration lose a test?" with matching counters                                           | `compareTestRuns(before, after)` — `counts` reports `name (×2 → ×1)`                                                                                                              |
| an input that has to change after the first render                                                | `await setInputs(fixture, { … })` — aliases and `hostDirectives` inputs resolve, unknown names refused                                                                            |
| a component that navigates, or reads `router.url`                                                 | `provideRouterDouble({ url })` + `injectRouterDouble()` — `/angular-router`                                                                                                       |
| a component that reads `router.currentNavigation()` for `extras.state` or `trigger`               | `setCurrentNavigation({ extras: { state } })` on the same handle — no `instanceMethodsToSpyOn`                                                                                    |
| the sequence of router events, not just the final URL                                             | `collectRouterEvents(router.events)` — `expect([[NavigationStart, '/checkout'], [NavigationEnd, '/checkout']])`                                                                   |
| a component that reads `location.back()`, or asserts where a redirect landed                      | `provideLocationDouble()` + `injectLocationDouble()` — Angular's own `SpyLocation`; without the provider, `Location` is `providedIn: 'root'` and the real one answers             |
| "did A run before B?" across three collaborators                                                  | `createLog<'drop-cache' \| 'flush'>()` — hand `log.fn('drop-cache')` to each, assert `log.result()` once                                                                          |
| a `window` or `document` behind a DI token                                                        | `provideWindowDouble(WINDOW, { screen })` / `provideDocumentDouble({ … })` — `/angular/doubles`                                                                                   |
| `MAT_DIALOG_DATA` and `MatDialogRef` provided by hand                                             | `provideMatDialogData(TOKEN, data)` / `provideMatDialogRef(MatDialogRef)` + `injectMatDialogRef(Ref)` — `/angular/doubles`                                                        |
| asserting a `computed()` did **not** recompute                                                    | `trackRecomputations(sig)` / `trackEffectRuns(ref)` — `{ count, stop() }`                                                                                                         |
| `form()` in a spec, or `errors()` read by hand                                                    | `createForm(model, schema)` + `registerFormMatchers()` — then `toHaveFieldErrors([…])` (`/signal-forms`)                                                                          |
| any of those doubles without a `TestBed`                                                          | `createRouterDouble` (`/angular-router`) / `createWindowDouble` / `createDocumentDouble` / `createMatDialogRef` (`/angular/doubles`)                                              |

## Rules that prevent most of the mistakes

- Declare the variable as **`Spy<T>`, never as `T`** — `Spy<T>` is a mapped type and drops private
  members. Bridge with `asInstance()` / `asSpy()`, never with `as unknown as T`.
- **`methodsToSpyOn` **adds** to the discovered prototype methods**, as in `jest-auto-spies`;
  `onlyMethodsToSpyOn` is the exhaustive whitelist. Omitting both is usually right. For a callable
  that is an instance field (arrow property, `signal()`, ngrx `signalStore()`), use
  `instanceMethodsToSpyOn` — prototype discovery cannot see it.
- **A method spy is this library's own mock, not a `vi.fn()`.** Every matcher, `vi.isMockFunction`,
  the `mockReturnValue` family, `spy.method.mock.*` and `vi.clearAllMocks()` behave identically —
  the one exception is `toHaveBeenCalledBefore` / `toHaveBeenCalledAfter` **between an auto-spy and a
  hand-written `vi.fn()`**, which compares two unrelated counters. Compare two auto-spies, or put the
  run on the runner's factory with `setSpyEngine('runner')` from `vitest-auto-spy/setup`.
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
  so `rejects.toBe(originalError)` cannot pass. They subscribe as a subscriber, so a synchronous
  source stops at the value that settles the wait — a `tap` spy is called once, not once per element.
  `{ timeout: 0 }` and `{ timeout: Infinity }` both mean "no watchdog"; `setEmissionTimeout` throws
  on `NaN` or a negative number, and `expectEmissions(src$, 0)` throws naming `expectNoEmission`.
- **Never leave an `expect()` in a `.then()` nobody awaits** — a promise chain that is a statement
  of its own runs its callback after the test has finished, so the assertion cannot fail it, and
  under zone.js the rejection is swallowed into `console.error` rather than reported.
  `await` the promise and assert the settled value; `setupAutoSpy({ strayRejections: true })` turns
  the ones already in a suite into failures.
- **`strict` answers "nobody configured this method", never "nobody configured this call."** A
  `calledWith` chain for other arguments does not trip it — that is `mustBeCalledWith`. It does not
  reach accessor spies, observable-property spies, `mockDeep` nodes, `console-spy`,
  `mockResourceProp`'s `reload` or a standalone `createFunctionSpy`, and `mockReturnValue` /
  `mockImplementation` bypass it by replacing the dispatch — while `returns:` is a default a later
  `calledWith` or `resolveWith` builds on.
- **`mockReturnValue` and `calledWith` on one method do not layer — the later line wins outright.**
  The family that installs an implementation (`mockImplementation`, `mockReturnValue`,
  `mockReturnThis`, `mockThrow`, `mockResolvedValue`, `mockRejectedValue`) replaces the very dispatch
  a chain is read by, so one of the two silently decides nothing and the spec goes green on a branch
  nobody configured. Both orders are reported (warn, or throw under the `strict` preset). Want a
  fallback **and** a per-argument value? Put the fallback in the container — `returns:` where the
  double is built, or `resolveWith` / `nextWith` / `failWith` — which a `calledWith` still wins over.
- **`calledWith(x);` on its own is a stub, not an assertion.** It configures "answer `undefined`
  for these arguments" and checks nothing, so the test passes whether or not the call happened.
  Vitest 4.1's chai-style `expect(fn).to.have.been.calledWith(x)` is the one that asserts — the same
  word, the opposite meaning. Continue the chain, or use `toHaveBeenCalledWith`. The
  `no-bare-called-with` lint rule catches it.
- **`setupAutoSpy({ strayTimers: true })` empties Vitest 4.1's `--detect-async-leaks` report.** The
  sweep cancels in `afterAll`, Vitest collects afterwards, and a cancelled timer is no longer
  referenced — so a leaking file is reported as clean. When both are on, the sweep prints the count
  it took to stderr, with where the first three were scheduled; `onStrayTimers` receives every one's
  file and frames in `timers` instead of the warning.
- **Never assert a signal with `toBeTruthy()`** — every signal is truthy. Use
  `toHaveSignalValue(v)` after `registerSignalMatchers()` from `vitest-auto-spy/angular/matchers`.
- **Never assert a resource with `expect(r.value()).toEqual(...)` alone** — an unresolved resource
  still holds its _default_, so that passes while proving nothing. `toHaveResourceValue(v)` after
  `registerResourceMatchers()`, from the same `/angular/matchers` entry, fails unless the resource
  actually resolved.
- **`calledWith` matches exact arguments first, then the matcher configs in registration order** —
  so put the narrow `expect.any(Number)` before the wide `expect.anything()` when both can match.
  Re-registering the same arguments replaces the previous answer, matcher arguments included: two
  `calledWith(1, expect.anything())` lines are an override, not two configs. A matcher counts at
  **any depth** — `calledWith({ id: expect.any(Number) })`, `calledWith([expect.any(String)])`, one
  inside a `Map` value — and the comparison around it treats a `Map` / `Set` as unordered, a `Date`
  by time, an `Error` by name and message, a function by identity. Each `calledWith(...)` call hands
  back its own handle, so a chain kept in a variable stays attached to its own arguments.
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
  Reading it as a context — `(ctx) => ctx.skip()`, `ctx.task`, destructured or not — is legal and
  `no-done-callback` leaves it alone; what it reports is a parameter that is called, passed on as an
  argument, or never used at all.
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
import { type Spy, createSpyFromClass, provideAutoSpy } from 'vitest-auto-spy/jasmine';
```

That entry registers the Vitest adapter and installs `.and`, `.calls` and `.withArgs` on every spy.
`import { jasmine } from 'vitest-auto-spy/jasmine'` restores the whole `jasmine` namespace
(`objectContaining`, `any`, `createSpyObj`, `clock()`, the eight matchers Vitest has no twin for);
nothing is put on `globalThis`. On `bun test` / `node --test` / `rstest run` that entry cannot load — call
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
- `jasmine.clock().install()` leaves `Date` **real**, exactly as jasmine's does — `mockDate()` is
  what takes the clock over, and it must be called right after `install()`, before anything
  schedules a timer. `spy.withArgs(…).and` carries `stub()` / `throwError()` / `resolveTo()` /
  `returnValue()`; `callFake`, `callThrough` and `returnValues` throw there, because an
  implementation answers every call rather than one argument list.

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

**After any `eslint --fix` over specs, run `npx tsc --noEmit`.** The forty-eight rules in
`vitest-auto-spy/eslint-plugin` are lint, not typecheck: `no-mocked-for-spy` rewrites a declaration
to `Spy<T>` and cannot see what the name is assigned two lines below, so a clean lint pass is not
evidence that the types still hold. Where it cannot prove the rename it downgrades to a suggestion —
accept those together with the repair at the creation site, usually `createAutoMock<T>()` in place of
an object literal.

**`no-private-member-access`, `no-mistyped-use-value` and `no-unknown-use-value-key` are the three
rules here that need type information.** The first reports
`instance['privateMember']` (bracket access, which TypeScript does not visibility-check),
`(instance as any).privateMember` and its `as unknown as { … }` / decoy-interface variants (the
access is checked — against a type the spec substituted), and
`vi.spyOn(Object.getPrototypeOf(x), 'm')`. Without `parserOptions.project` / `projectService` it
reports nothing rather than falling back to the syntax, because the same brackets are how an index
signature is read (`process.env['KEY']`, `queryParams['id']`). The repair is never a helper: drive
the member through the public API, or — on a component — through the rendered template, where a
`protected` member really is reachable. The second reports `{ provide: TOKEN, useValue }` whose value
does not fit a primitive `InjectionToken<T>` — `useValue` is `any`, so `{}` for a `boolean` token
compiles and is truthy; write a value of the declared type. The third reports each key of an object
`useValue` literal the provided type does not have (`queryParams$` on `ActivatedRoute`) — keys only,
never the values, so a partial fixture passes; rename the key to the real member or drop it.

**`no-instance-lifecycle-spy` (`warn`) reports `vi.spyOn(component, 'ngOnInit')`** and the other
hooks a view reads off the prototype: Angular never calls the instance spy, so its stub never runs.
Spy on `Cls.prototype` before `TestBed.createComponent`, or assert what the hook does.

**Never put `@ts-expect-error` / `@ts-ignore` above a double's `nextWith`, `resolveWith`,
`mockReturnValue`, `returnValue` or `calledWith(…)`** — `no-ts-expect-error-on-double` reports it,
whatever reason follows. An overloaded client takes `Spy<X, { overload: { m: 'first' } }>`; anything
else is a fixture of the wrong shape — check it against `ReturnType<X['m']>` and build a partial one
with `createMock<…>()`. A value outside the declared type on purpose keeps the directive under
`// eslint-disable-next-line vitest-auto-spy/no-ts-expect-error-on-double -- <why>`.
`no-constant-expect` reports `expect(true).toBe(true)` and its relatives — assert on what the code
produced, or `expect.fail(…)` for a branch the test must not reach.
`no-redundant-smoke-test` reports the generated `it('should create', () => expect(x).toBeTruthy())`
where the block — its nested `describe`s counted — already has tests that run the same `beforeEach`:
they fail first on a subject that came back nullish, and say what they were doing. Delete it; keep it
only where it is the block's one running test, or make it assert the construction itself. **Move a rendered component’s inputs with `setInputs(fixture, { name: value })`**, not with
`fixture.componentRef.setInput('name', value)` — `prefer-set-inputs` (`warn`, suggestion) reports the
raw call, because Angular answers a name the component does not declare with an `NG0303` on the
console and no change at all, while `setInputs` resolves every key against the compiled definition
before the first write and types the value. It awaits the fixture, so the callback becomes `async` and
a `detectChanges()` directly under the call goes with it. Accept the suggestion per call and run the
file: `setInputs` **renders** where the raw call only writes, so a spec that never drove change
detection at all can meet a required input nobody set, a provider nobody registered or a pipe the
testing module never declared. `no-compile-components` is silent
until `['error', { builder: 'inline-resources' }]`; with it, drop `compileComponents()` and the
`async` it forced — except for a component whose template holds a `@defer` block, which ships async
class metadata that the call resolves whatever the builder did. Keep that one behind
`// eslint-disable-next-line vitest-auto-spy/no-compile-components -- @defer: async class metadata`;
without it the test dies on `has unresolved metadata`. **Never `await` the TestBed itself** —
`no-sync-testbed-await` reports it: `configureTestingModule`, every `override*`, `resetTestingModule`,
`createComponent` and `getLastFixture` answer the TestBed or the fixture, never a promise, so the
`await` waits for nothing and the `async` it forced on the hook awaits nothing either. Drop both; the
suggestion does. `TestBed.inject(TOKEN)` and `runInInjectionContext(fn)` are not reported, because
either can genuinely hold a promise, and `compileComponents()` / `whenStable()` /
`whenRenderingDone()` / `getDeferBlocks()` keep their `await`.

**Never provide a hand-built `ActivatedRoute`** — `prefer-provide-activated-route` reports every
`useValue` / `useClass` / `useFactory` / `useExisting` on that token, and `provideAutoSpy(ActivatedRoute)`
with a message of its own, because a double of it knows either the streams or the snapshot and never
both. `provideActivatedRoute({ params })` and `createActivatedRoute({ params })` are the two shapes it
stays silent on, by shape rather than by import. `prefer-provide-auto-spy` agrees now: on that one
token — in a provider or in a `TestBed.overrideProvider` — it points at `provideActivatedRoute()`
from `vitest-auto-spy/angular-router` rather than at `provideAutoSpy`.

**`prefer-observer-stub` reports an observer global replaced by hand** — `globalThis.IntersectionObserver = class { … }`, `vi.stubGlobal('ResizeObserver', …)`, `vi.spyOn(globalThis, 'MutationObserver')` — and names `stubIntersectionObserver()` / `stubResizeObserver()` / `stubMutationObserver()` instead. Take the `let original = globalThis.X` and the `afterEach` that assigns it back out with the block: the helper installs through `mockValueProp`, so `restoreMockedProps()` already owns the undo, and a restore written inside an `it` never runs once a test above it goes red.

**`prefer-settle-dynamic-import` reports a bare `await import('./thing')` in a test body or a hook** — and `import('./thing').then(…)` — where the code under test lazy-loads the same module. Awaiting the specifier waits for the **module**; the handler's own continuation, the lines after _its_ `await`, is still queued behind it, so the assertion reads the state one turn early and the test is green only while that continuation is short. Replace it with `await settleDynamicImport(() => import('./thing'))`, which adds the `flushEventLoop(1)` that continuation needs and returns the namespace, so `const { Thing } = await import(…)` keeps reading the same way. Nothing is reported where a function of its own sits between the runner's callback and the import — a `vi.mock` factory, a lazy route's `loadComponent`, a callback the spec hands to production code — nor on a spec-local `const load = async () => { await import('…') }`, which is written identically whether the spec calls it or the code under test does.

**`no-vacuous-absence-assertion` reports a test whose every assertion holds when the stream never emits** — a `const` / `let` declared in the test and written only by its `subscribe` callback (or a `vi.fn()` handed to `subscribe`), asserted with a matcher that repeats the declaration (`let chips = []` … `expect(chips).toEqual([])`) or asserts absence (`toBeUndefined`, `toBeNull`, `toBeFalsy`, `not.toHaveBeenCalled`, `toHaveBeenCalledTimes(0)`), with no assertion in the test that a silent source could fail. Such a test cannot tell "the result is empty" from "there is no result" — proved by mutation twice on a 2 030-file suite. Write the claim you mean: `await expectNoEmission(source$)` for the silence, `expect(await expectEmission(source$)).toEqual([])` for the empty value. Nothing is reported where the test also asserts something positive — the "nothing yet, trigger, now the value" shape is left alone — nor where it reaches its assertions through a helper of its own.
**`prefer-create-mock` reports an object literal under `as SomeType`** — `{ id: '1', isOffline: false } as Device`, and the `<Device>{ … }` spelling. A cast is not an assignment: it asks whether the two types overlap, so the excess-property check is skipped and a key the type does not declare goes through, along with a required field the fixture never sets. Both type gates stay silent, and the fixture is then spread into an expected payload — the spec pins a key the contract does not have. Where the literal already sits in a typed slot (a call argument, a `nextWith`, a typed `const`) the repair is to delete the cast; what is left is `createMock<Device>({ … })`, which takes a `DeepPartial<Device>` and answers a `Device`. It is a `warn` in `recommended`, because accepting the suggestion hands the literal to the compiler and a drifted fixture goes red — the finding, and a migration taken file by file. Silent on `as const`, on `as unknown` / `as any` and the double cast built from them, on a cast of anything but a literal, and on a literal inside one of this library's own factories.

**`no-mock-cast` reports a cast to Vitest's `Mock` / `MockInstance` over a member access** — `(TestBed.inject(S).m as Mock)` and, with a message of its own, `(spy.m.mockReturnValue as Mock)(…)`, where the cast sits on the member that installs the answer. `Mock` with no parameters is `Mock<any>`: the cast does not add the spy surface, it removes the signature, so `mockReturnValue` takes anything and `toHaveBeenCalledWith` stops comparing arguments. The member already is a spy typed from the real signature — read it as `injectSpy(S).m`, which the suggestion writes whenever the token is in view. The name has to resolve to an import from the runner, so a domain type called `Mock` is left alone.

**`no-reflect-member-access` reports `Reflect.get(subject, 'member')` and `Reflect.set(subject, 'member', value)`** on a value the spec holds — a component, a service, a fixture, a double. It is the second door out of `no-private-member-access`, and the one no compiler stands in: the key is an ordinary string argument typed `any`, so nothing checks it, and `Reflect.set` installs an **own** property over the prototype rather than writing the member — rename the field in production and the spec writes a dead property nothing reads while every assertion under it goes on passing. Drive the member through the public API and assert the effect; on a component the rendered template is the other public surface. A write onto a double this library built is reported apart and suggests `mockValueProp(double, 'prop', value)`, which performs the same write and registers the undo with `restoreMockedProps()`. Nothing is reported for `window` / `globalThis` or any name the file does not declare (that is what the idiom is for), for a name an `import` introduced, for a computed key, or for `Reflect.apply` / `has` / `deleteProperty` / `construct`.

**`no-self-called-spy` reports a test that calls the spied method itself and then asserts that it was called** — `vi.spyOn(obj, 'm')`, then `obj.m(…)` written by the test body after it, then a positive `toHaveBeenCalled*`. Such a test proves that `emit` calls `emit`: delete the template binding or subscription its title names and it stays green. Drive the real trigger instead and keep the assertion. Order decides it, so a call written **before** the spy is arrangement and is never reported; neither is a negated matcher or `toHaveBeenCalledTimes(0)`, a call whose record a `mockClear` / `vi.clearAllMocks()` drops before the assertion reads it, an assertion whose arguments the call did not pass, a spy installed in a hook, or a call made from inside a callback.

**`no-redundant-mock-reset` reports a mock reset in a hook that the runner already performs** — `vi.clearAllMocks()` / `vi.resetAllMocks()` / `vi.restoreAllMocks()` and the per-mock `mockClear()` / `mockReset()` / `mockRestore()` — as the first statement of a `beforeEach` that no other `beforeEach` precedes, or a clear as the last statement of an `afterEach`. Vitest resets in `onBeforeTryTask`, ahead of every `beforeEach` chain and never after a test, so a reset that anything ran before, or a restore in `afterEach` / `afterAll` (the only thing that takes the last test's spies off before the `afterAll` hooks), is left alone. **It is silent until it knows the configuration**: options first — `['error', { clearMocks: true, restoreMocks: true }]`, or `{ configFile: 'path/to/runner.config.ts' }` for a runner config the search cannot find — then a `vitest.config.*` / `vite.config.*` searched upwards from the file and read as text; with neither, it reports nothing. The flag has to match the call, not the family: `restoreMocks` walks only the spies `vi.spyOn` installed, so it makes a `vi.clearAllMocks()` dead only where the receiver is such a spy. `--fix` deletes the line only in a file whose only before-hook it is, and offers a suggestion everywhere else; a reset in the middle of a test body is never reported, because there it separates two arrangements inside one test.

**`no-unasserted-argument` reports a bare `expect(spy).toHaveBeenCalled()` where the file itself says the arguments are the point** — either the same subject is pinned with `toHaveBeenCalledWith(…)` in another test of the file, or the test's title says `with` and its body asserts nothing but bare calls. Narrower than `vitest/prefer-called-with` on purpose: on one 2032-file suite that reports 1941 times in 360 files and this one 175 in 90. `not.toHaveBeenCalled()` and the counting matchers are never reported. `warn` rather than `error`, because the repair is the argument list the test should have named — `toHaveBeenCalledWith(…)`, `toHaveBeenCalledExactlyOnceWith(…)`, or `mustBeCalledWith(…)` where the double is configured — and that is the one thing the rule cannot write.

**`no-hand-assigned-global` reports a double assigned straight to a global** — `global.fetch = vi.fn(…)`, `window.matchMedia = vi.fn()`, `window.localStorage = { getItem: vi.fn() }` — unless the file puts it back in `afterEach` / `afterAll` / `onTestFinished`. Replace the assignment with `mockValueProp(globalThis, 'fetch', vi.fn(…))` (undone by `restoreMockedProps()`, which `setupAutoSpy()` runs), use `blockNetwork()` when the spec only has to stay offline, and `stubWebStorage('localStorage')` for the storages. Do not "fix" it by adding a restore as the last line of the `it`: that form is reported too, because a red assertion skips it.

**`registerAutoSpyDefaults(Class, config)` puts a spy's composition with the class, once.** Call it
from the setup file for a class every suite doubles the same way (`Router` with
`observablePropsToSpyOn: ['events']`, a remote-config service with its one getter); `provideAutoSpy(X)`
and `createSpyFromClass(X)` then merge it under whatever the call site adds — lists unioned, `returns`
and `overrides` merged per key, scalars won by the call site. It is by class identity, not by
inheritance, and `clearAutoSpyDefaults(Class)` — or `clearAutoSpyDefaults()` for the lot — drops a
registration again. Several classes at once are one table — `registerAutoSpyDefaults([[Router, { … }], [AccountService, { … }]])` — rows applying in order, each checked against its own class (`AutoSpyDefaultEntry<T>` is that row's type).
An `InjectionToken` registers the same way through the `registerAutoSpyDefaults` of
`vitest-auto-spy/angular` (the core one takes a class only — a token there is `TS2345 … not assignable
to 'ClassType<unknown>'`), and `provideAutoSpyForToken(TOKEN)` merges its arguments over it:
`registerAutoSpyDefaults(LOGGER, { returns: { info: undefined }, selfReturning: ['channel'] })`.
`selfReturning` names methods that answer the double itself — a default like `returns`, configured
under `strict`, on every factory.
Reach for it when the same class carries different configurations in different specs:
the list options are additive and never complain about a name they cannot find, so the file that
forgot one is silent about it.

**Landing the plugin on an existing suite: downgrade `configs.recommended` to `warn`, then spread
`...autoSpy.configs.typeErrors.rules` after it.** Those two rules — `prefer-as-spy` and
`no-mocked-for-spy` — report findings that fail `tsc` (`TS2352`, `TS2322`) by construction, so
"fix them in batches" does not describe them; both are `--fix`, so keeping them at `error` costs one
`eslint --fix` run. Nothing in `recommended` changes.

Four of those rules are for a suite mid-migration off `jasmine-auto-spies`:
`jasmine-namespace-without-entry`, `no-jasmine-globals`, `no-save-arguments-by-value`, and
`prefer-native-spy-api` — the last one ships at `error` like the rest, and it is the one rule to set
to **`'off'`** yourself while the migration lasts, because it reports working bridge code. Turn it
back on for the last mile, once the suite is green, and not before.

**Four rules in `recommended` are `warn`, each for a reason of its own.** `prefer-render-shallow`
names a spec that could render more cheaply rather than something wrong or dead: moving onto
`renderShallow` is a suite's decision, not a repair, so it shows up in the output without holding a
build — set it to `'error'` once the project has taken that decision. `no-stub-class-double` (a
class whose fields are `vi.fn()`s) and `no-structural-double` (an object of `vi.fn()`s bound to a
name typed `{ m: Mock }`) decide on a heuristic with no `provide:` beside them to settle it, so a
project that reads the shape differently can switch either off; a double behind DI is
`prefer-provide-auto-spy`'s, at `error`. `no-instance-lifecycle-spy` (`vi.spyOn(component, 'ngOnInit')`)
decides on a heuristic too: a spec that calls the hook itself does reach the instance spy.

`doctor` is read-only. It reports what neither the runner nor the compiler can: a `tsconfig`
`include` pattern that matches no file, a production module importing a spec, a spec importing
another spec, a foreign runner's `@jest-environment` pragma, and config left behind for a runner
that is gone.
