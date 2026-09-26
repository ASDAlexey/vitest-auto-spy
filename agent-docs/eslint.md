# vitest-auto-spy — ESLint plugin

Part of the agent reference [`AGENTS.md`](../AGENTS.md), which maps every section to its file. Section numbers are shared with it.

## 16. ESLint plugin (flat config only)

```js
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [{ files: ['**/*.spec.ts'], ...autoSpy.configs.recommended }];
```

The `files` glob has no default — too narrow and the plugin is silently inert
(`npx eslint --print-config a.spec.ts` settles it), too wide and `no-object-define-property` starts
reporting on application code that is entitled to it. To override a severity, spread the rule map
too: a bare `rules` key beside the spread config **replaces** it rather than merging, and nothing
reports that.

```js
export default [
  {
    files: ['**/*.spec.ts'],
    ...autoSpy.configs.recommended,
    rules: { ...autoSpy.configs.recommended.rules, 'vitest-auto-spy/prefer-native-spy-api': 'off' },
  },
];
```

`autoSpy.configs.typeErrors` is a second flat config holding the subset whose findings are compile
errors — `prefer-as-spy` (`TS2352`) and `no-mocked-for-spy` (`TS2322`). Spread its `rules` after a
blanket downgrade so those keep their severity; do not copy the two names into a consumer's config.
`autoSpy.configs.strict` is `recommended` with every rule at `error`, instead of mapping
`Object.keys(autoSpy.rules)` by hand.

| Rule | Level | Fix | Flags |
| --- | --- | --- | --- |
| `no-expect-in-subscribe` | `error` | suggest | `expect()` inside `subscribe()` → `expectEmission` / `firstValueFrom` |
| `no-object-define-property` | `error` | suggest | `Object.defineProperty` in a spec → `mockReadonlyProp` / `mockValueProp` |
| `prefer-provide-auto-spy` | `error` | fix | a hand-rolled `useValue`, `useFactory`, `useClass` or `useExisting` (also `useValue: new StubMock()`), in a provider **or** a `TestBed.overrideProvider(X, { … })` → `provideAutoSpy(Class)` / `provideAutoSpyForToken(TOKEN)`. A name in the slot is followed one step, through an initialiser or a single `beforeEach` assignment. `{ provide: X, useValue: createSpyFromClass(X, config) }` — the factory's own body, written out — is reported and **rewritten** to `provideAutoSpy(X, config)`; a double read from a _different_ class (`{ provide: LocalStorage, useValue: createSpyFromClass(BaseLocalStorage) }`) is not, since the abstract token has no prototype for `provideAutoSpy` to read. On the `ActivatedRoute` token — in a provider or in an `overrideProvider` — the advice is `provideActivatedRoute()` from `/angular-router` instead, with a message of its own, so the two route rules agree |
| `prefer-create-spy-from-class` | `error` | — | an object literal of 2+ `vi.fn()`s → `createSpyFromClass` (a factory's own seed is exempt) |
| `no-stub-class-double` | `warn` | — | a class whose fields are `vi.fn()`s → `createSpyFromClass` / `provideAutoSpy` and delete the stub; a decorated, `implements`-ing, `extends`-ing or unnamed class is exempt — option: `{ minRunnerFns }` |
| `no-structural-double` | `warn` | — | an object of `vi.fn()`s bound to a name declared `{ load: Mock }` → `createAutoMock<T>()`; a bare `let fn: Mock` is a callback and never reported — option: `{ minRunnerFns }` |
| `prefer-inject-spy` | `error` | suggest | `vi.spyOn(TestBed.inject(X), 'm')`, inline or via a `const` → `injectSpy(X).m`; `ApplicationRef`, `DestroyRef`, `EnvironmentInjector`, `HttpClient` and `Injector` keep their real instance — option: `{ ignoreTokens }` |
| `no-shared-module-level-mock` | `error` | — | an **exported** value holding `vi.fn()`s → export a factory instead |
| `no-mocked-for-spy` | `error` | `--fix` / suggest | `Mocked<T>` in any type position → `Spy<T>`, import and all — a suggestion where the assigned value is not from a factory of this library |
| `prefer-as-spy` | `error` | `--fix` | `TestBed.inject(X) as Spy<X>` → `asSpy<X>(TestBed.inject(X))`, import and all |
| `no-done-callback` | `error` | — | a first parameter of a test or hook that is **called**, **passed on** as an argument, or never used at all → `async` + an awaited assertion, and `done.fail(…)` at the call site. A parameter read only as `ctx.skip()` / `ctx.task` / `ctx.expect` is Vitest's `TestContext` and is left alone, destructured or not |
| `no-floating-assertion` | `error` | — | `expect()` in a `.then()` nobody awaits → `expect(await promise)` |
| `no-bare-called-with` | `error` | — | `spy.m.calledWith(1);` as a statement — a stub nobody continued, asserting nothing; chai's `expect(fn).to.have.been.calledWith()` exempt |
| `no-overridden-provider` | `error` | suggest | two providers for one token in one array, or one a `TestBed.overrideProvider` in the same hook replaces → the earlier one never runs; the exact duplicate can be deleted |
| `no-inject-before-override` | `error` | — | `TestBed.inject()` / `injectSpy()` / `renderShallow()` in a hook, in a suite that still calls `override*` |
| `no-private-member-access` | `error` | — | `instance['privateMember']`, `(instance as any).privateMember` (and `as unknown as`, and a decoy type), `vi.spyOn(Object.getPrototypeOf(x), 'm')` → drive the member through the public API. **Type-aware**: silent without `parserOptions.project`, and silent on an index signature |
| `no-reflect-member-access` | `error` | on a double | `Reflect.get(component, 'privateField')` / `Reflect.set(service, 'x', v)` on a subject the test holds — the second door out of `no-private-member-access`, and the one no compiler stands in: the key is an ordinary string argument, so a rename leaves the spec reading a property that is no longer there and `Reflect.set` writing a dead one nothing reads. `window` / `globalThis` (or a name declared as `Window` / `typeof globalThis`) and a computed key are never reported; a write onto a double this library built is reported apart and suggests `mockValueProp` |
| `no-dead-schemas` | `error` | — | `schemas` on a testing module with no `declarations` — the schema applies to nothing; the file decides, so a `declarations` in another `configureTestingModule` call silences it |
| `no-import-time-spread` | `error` | suggest | `export const x = [...Imported]` at module scope → a `TypeError`, or a silently empty object, while the bundle loads |
| `no-unregistered-inject-spy` | `error` | — | `injectSpy(X)` for a token this file never registered → the real instance, whose spy helpers exist only for the compiler |
| `prefer-render-shallow` | `warn` | suggest | `TestBed.createComponent` in a file that never reads the template → `renderShallow(X)`; 0.24× the per-test cycle at 100 children |
| `prefer-set-inputs` | `warn` | suggest | a run of `fixture.componentRef.setInput('title', v)` on one fixture → `await setInputs(fixture, { title: v })` — the name is resolved against the compiled definition before the first write (an undeclared one is an `NG0303` and no change) and the value is typed. The run collapses into one call and a `detectChanges()` under it goes; offered, not applied, because `stable()` ticks and a zone.js suite answers that with `NG0101` |
| `prefer-spy-on-own-method` | `warn` | `--fix` / suggest | `createSpyFromInstance(x, { onlyMethodsToSpyOn: ['m'], passthrough: true })` read for `m` alone — `.m` on the call, `const { m } = …`, a bare statement, or a name read only as `v.m` → `spyOnOwnMethod(x, 'm')`; the same whitelist with `returns: { m: undefined }` → `spyOnVoidMethod(x, 'm')`. Both fix, import and all; a `Spy<X>` annotation becomes `Spy<X>['m']` in a suggestion. A bare `returns: { m: undefined }` seed is a suggestion, offered only on a real event or element — `new MouseEvent(…)`, `document.createElement(…)`, `fixture.nativeElement` — never on a double |
| `prefer-observer-stub` | `error` | — | a hand-rolled observer global → `stubIntersectionObserver()` / `stubResizeObserver()` / `stubMutationObserver()`; the manual save-and-restore goes too, `restoreMockedProps()` runs the undo |
| `no-hand-assigned-global` | `error` | `--fix` | a double assigned to a global (`global.fetch = vi.fn()`, `window.matchMedia = vi.fn()`, `window.localStorage = { getItem: vi.fn() }`) with no restore in `afterEach` / `afterAll` / `onTestFinished` → `mockValueProp(globalThis, name, value)` or `vi.stubGlobal` + `unstubGlobals`; `blockNetwork()` for network globals, `stubWebStorage()` for the storages, `stubWorker({ respond })` for `Worker`; the three observers stay with `prefer-observer-stub`; any value written into an imported object (`environment.production = true`) → `mockValueProp(environment, 'production', true)`, fixed in a test or `beforeEach` |
| `prefer-stub-response` | `error` | — | an object literal cast to `Response` (`as Response`, `as unknown as Response`, `<Response>{ … }`) or `createMock<Response>(…)` / `createAutoMock<Response>(…)` → `stubResponse({ body })` from `/setup`; the literal answers `undefined` for every member it does not list (`status`, `headers`, `text()`) and the cast is what makes that compile. `Response` must resolve to the **global**, so an Express handler's or a generated client's `Response` is never reported |
| `prefer-provide-activated-route` | `error` | — | a hand-built `ActivatedRoute` — any `useValue` / `useClass` / `useFactory` / `useExisting`, and `provideAutoSpy(ActivatedRoute)` too → `provideActivatedRoute({ … })`; the double knows either the streams or the snapshot, never both, and `injectActivatedRoute().setParams(…)` moves them together mid-test |
| `no-passthrough-console-spy` | `error` | suggest | `vi.spyOn(console, m)` nothing gives an implementation — it calls through and prints → `installConsoleSpies()` + `consoleXSpy`, or `.mockImplementation(() => undefined)` |
| `no-console-in-spec` | `error` | — | a spec calling `console.x(…)` itself, or `console.x = …`, which nothing restores → absorb the code's output through `vitest-auto-spy/console` |
| `no-import-time-console-spies` | `error` | — | an import of `vitest-auto-spy/console` in a file that never calls `installConsoleSpies()` — the import installs once per worker and silences every later file → `installConsoleSpies()` in `beforeEach`, `restoreConsole()` in `afterEach` |
| `no-mistyped-use-value` | `error` | — | `{ provide: TOKEN, useValue }` whose value is not assignable to the primitive `T` of `InjectionToken<T>` (string, number, boolean, bigint, enum, their literals, `null`, `undefined`) — `useValue` is `any`, so `{}` for a `boolean` token compiles and is truthy. **Type-aware**: silent without `parserOptions.project`; object-typed tokens are `no-unknown-use-value-key`'s |
| `no-unknown-use-value-key` | `error` | — | a key of an object `useValue` literal the provided type does not have — `T` of `InjectionToken<T>`, or the instance type of a `provide:` class; `{ provide: ActivatedRoute, useValue: { queryParams$: … } }` compiles, since `useValue` is `any`. Keys only, never assignability (a partial fixture is fine). **Type-aware**; silent on `any` / `unknown` / `object`, an index signature, a spread's keys, `multi: true` |
| `no-instance-lifecycle-spy` | `warn` | — | `vi.spyOn(instance, 'ngOnInit')` (and `ngOnDestroy`, `ngDoCheck`, `ngAfterContent*`, `ngAfterView*`) — a view calls the hook read off the prototype, so the instance spy is never called and its stub never runs → `vi.spyOn(Cls.prototype, …)` before `createComponent`, or assert the effect. `ngOnChanges` is exempt: Angular calls it through the instance |
| `no-ts-expect-error-on-double` | `error` | — | `@ts-expect-error` / `@ts-ignore` above `nextWith`, `resolveWith`, `mockReturnValue`, `returnValue`, `calledWith(…)` and the other helpers that check a stub against the method's signature → an overloaded method takes `Spy<X, { overload: { m: 'first' } }>`; otherwise the fixture is the wrong shape, checked against `ReturnType<X['m']>`. A reason after the directive does not silence it; a deliberate out-of-type value keeps it under `eslint-disable-next-line … -- <why>` |
| `no-constant-expect` | `error` | — | `expect(true).toBe(true)`, `expect({ … }).toBeDefined()` — a value the spec spelled out, under a matcher whose answer it already fixes (`toBe` / `toEqual` / `toStrictEqual` against a literal; `toBeTruthy`, `toBeDefined`, `toBeNull`… for any literal) → assert on what the code produced, or `expect.fail(…)` for an unreachable branch |
| `no-redundant-smoke-test` | `error` | suggest | `it('should create', () => expect(pipe).toBeTruthy())` — every statement of the body an `expect(x)` under `toBeTruthy` / `toBeDefined` / `toBeInstanceOf` (or their negated twins), weighed against the tests that run the same setup: the rest of the block, and everything the blocks nested in it declare → delete it; the suggestion removes the test and the blank line above it. Silent where that test is the block's only running one, and a skipped sibling does not count as proof |
| `no-self-called-spy` | `error` | — | `vi.spyOn(obj, 'm')`, then `obj.m(…)` written by the test itself, then a positive `toHaveBeenCalled*` — the assertion is satisfied by the test's own line, so the test survives the deletion of the behaviour its title names. Order decides it: a call written **before** the spy is arrangement, and a `mockClear` between the call and the assertion, a negated matcher or arguments the call did not pass all silence it |
| `no-vacuous-absence-assertion` | `error` | — | a test **all** of whose assertions are satisfied by the stream never emitting. The carrier is a `const` / `let` declared in the test whose every write outside the declaration sits in a `subscribe` callback of that test (the assignment and the `push` forms both count), or a `vi.fn()` the test hands to `subscribe` and never calls itself. Silence satisfies an equality matcher repeating the initialiser's source text, `toBeUndefined` / `not.toBeDefined` on a `let` holding `undefined`, `toBeNull` on one holding `null`, `toBeFalsy` / `not.toBeTruthy` on any falsy literal, `toHaveLength(0)` on `[]` or `''`, and `not.toHaveBeenCalled` / `not.toHaveBeenCalledWith` / `toHaveBeenCalledTimes(0)` on any subject — read literally, so `toBeNull()` on a `let` with no initialiser is **not** reported. One `expect()` a silent source could fail silences the rule, which is what exempts the "nothing yet, trigger, now the value" shape; a test asserting through a local helper is skipped entirely → `await expectNoEmission(source$)`, or `expect(await expectEmission(source$))` |
| `prefer-settle-dynamic-import` | `error` | suggest | `await import('./thing')` and `import('./thing').then(…)` inside an `it` / `test` body or a `beforeEach` / `beforeAll` / `afterEach` / `afterAll` hook (the `.only`, `.skip` and `.each` spellings included) → `await settleDynamicImport(() => import('./thing'))`, which is the same load plus `flushEventLoop(1)` and returns the namespace, so the destructured form keeps reading the same way. The bare `await` waits for the **module** and not for the continuation of the code that was loading it, so the assertion runs a turn early and the test is green only while that continuation is short. Syntax only. Silent wherever a function of its own sits between the runner's callback and the import — a `vi.mock` factory, a lazy route's `loadComponent` / `loadChildren`, a callback handed to production code, `settleDynamicImport`'s own `() => import(…)` — and, by the same reading, silent on a spec-local `const load = async () => { await import('…') }`, which is written identically whether the spec calls it or the code under test does |
| `prefer-create-mock` | `warn` | suggest | an object literal under `as SomeType` — `{ id: '1', isOffline: false } as Device`, `<Device>{ … }` too → `createMock<Device>({ … })`. A cast asks whether the two types overlap rather than whether the value is one of them, so it passes a key the type does not declare (the excess-property check is skipped) **and** a required field the fixture never sets; both type gates stay silent, and the same object is then spread into the expected payload of a call assertion. Where the literal already sits in a typed slot the first repair is to delete the cast. Silent on `as const`, `as unknown` / `as any` and the double cast built from them, on a cast of anything but a literal, and on a literal inside one of this library's own factories. `warn`, because accepting the suggestion makes a drifted fixture red on the next type-check — the finding, and a migration taken file by file |
| `no-mock-cast` | `error` | suggest | a cast to Vitest's `Mock` / `MockInstance` over a **member access** — `TestBed.inject(S).m as Mock` → `injectSpy(S).m`, which the suggestion writes whenever the token is in view (directly, or through a `const` the file settled with a `TestBed.inject`). `Mock` with no parameters is `Mock<any>`: `mockReturnValue` takes anything and `toHaveBeenCalledWith` stops comparing arguments. `(spy.m.mockReturnValue as Mock)(…)` gets its own message — the cast is on the member that installs the answer, so neither the value nor the method's return type is checked. The name must resolve to an import from `vitest` / `@rstest/core` / `bun:test` / `jest`, or to nothing at all, so a domain `Mock` is left alone |
| `no-redundant-mock-reset` | `error` | `--fix` / suggest | a mock reset the runner already performs between tests — `vi.clearAllMocks()` / `resetAllMocks()` / `restoreAllMocks()`, `x.mockClear()` / `mockReset()` / `mockRestore()` — standing where nothing the file wrote ran since the runner's own: the first statement of a `beforeEach` no other `beforeEach` precedes, or a clear as the last statement of an `afterEach` → delete it, and the hook with it where that is all it held. A restore or reset in `afterEach` / `afterAll` is never reported: after the last test it is what takes a spy off before the `afterAll` hooks. **Silent** until the flags are known: options `{ clearMocks, restoreMocks, mockReset }` (or `{ configFile }` naming the runner config) first, then a `vitest.config.*` / `vite.config.*` searched upwards from the file and read as text. Flag matches call, never family — `restoreMocks` walks only the spies `vi.spyOn` installed. `--fix` only in a file whose only before-hook it is; a suggestion otherwise; never inside a test body |
| `no-unasserted-argument` | `warn` | — | a bare `expect(spy).toHaveBeenCalled()` on evidence from the file: the same subject asserted with `toHaveBeenCalledWith(…)` in another test, or a title containing `with` over a body whose every assertion is a bare call → `toHaveBeenCalledWith(…)` / `mustBeCalledWith(…)`. `not.toHaveBeenCalled()` and the counting matchers are never reported |
| `no-compile-components` | `error` | suggest | `compileComponents()` under a builder that inlines `templateUrl` / `styleUrls` — a promise already settled → delete it, and the `async` of a hook that awaits nothing else. **Silent until** `['error', { builder: 'inline-resources' }]`: under a JIT setup that loads resources at run time the call is load-bearing. **Keep the call for a component whose template holds a `@defer` block** — that ships async class metadata, which `TestBed` resolves in this very call whatever the builder did, and dropping it fails the test with `has unresolved metadata`; the rule cannot see another file's template, so list those classes in `{ ignoreComponents: ['CardComponent'] }` (a spec naming one is left alone) or keep a `// eslint-disable-next-line vitest-auto-spy/no-compile-components -- @defer: async class metadata` |
| `no-sync-testbed-await` | `error` | suggest | `await` on a TestBed call that answers the TestBed or a fixture — `configureTestingModule`, `override*`, `resetTestingModule`, `createComponent`, `getLastFixture`, through `TestBed`, `getTestBed()`, a chain of those, or a name holding one → drop the `await`, and the `async` of a hook that then awaits nothing else; the suggestion does both. Reads **no types**, so it reports without `parserOptions.project`, where `@typescript-eslint/await-thenable` cannot. `inject` and `runInInjectionContext` are never reported: each answers whatever the token or the callback holds, which can be a promise |
| `jasmine-namespace-without-entry` | `error` | — | `.and` / `.calls` / `.withArgs` on a library spy in a file that installs the compat layer nowhere — option: `{ setupModules: […] }` |
| `no-jasmine-globals` | `error` | — | `jasmine.*`, bare `spyOn(` / `spyOnProperty(` / `spyOnAllFunctions(` / `fail(` / `pending(`, `.withContext(` |
| `no-save-arguments-by-value` | `error` | — | `spy.calls.saveArgumentsByValue()` — a no-op here, so the spec silently asserts on post-mutation state |
| `prefer-native-spy-api` | `error` | `--fix` / suggest | `.and` / `.calls` where the spy's own API says the same thing — turn it on for the last mile off the jasmine shim |

Forty-nine rules, **every one an `error` since 4.0.0 except `prefer-render-shallow`,
`no-stub-class-double`, `no-structural-double`, `prefer-create-mock`, `no-instance-lifecycle-spy`,
`prefer-set-inputs`, `no-unasserted-argument` and `prefer-spy-on-own-method`**; six fix on their own, nineteen offer suggestions. Forty-six are syntactic; `no-private-member-access`, `no-mistyped-use-value` and
`no-unknown-use-value-key` read types, and all three report nothing at all without `parserOptions.project` / `projectService`
rather than guessing. `no-compile-components` waits the same way for a fact no file holds — which
builder the project has — and reports nothing until `{ builder: 'inline-resources' }` states it. The config used to be a graded mix of `error` / `warn` / `off`, which decided for the
consumer how much each finding mattered — a `warn` nothing reads is `off` with extra output. The
eight `warn`s left are not judgements about how much a finding matters. `prefer-render-shallow` is
about the _kind_ of finding: every other rule names something wrong or dead, while this one names a
file that could render more cheaply, and `renderShallow` is a migration a suite either takes or does
not. At `error` the plugin would gate that migration — 491 findings across 398 of one consumer's
1759 spec files — so `recommended` would exist to be overridden. `no-stub-class-double` and
`no-structural-double` (5.5.0) are about the _evidence_: both report the same drift
`prefer-create-spy-from-class` reports at `error`, but neither has a `provide:` beside it to settle
the question, so each decides on a heuristic — and a project that disagrees with the reading has to
be able to switch it off without losing the rule that reads a count. The counts are not the argument
and moved a long way inside the release: measured on the same 1759 files, the two started at 12
reports in 8 files and 115 in 74, and are 10 in 7 and 5 in 4 once `prefer-provide-auto-spy` learnt to
follow a name into a `useValue` — 112 of those doubles are handed to Angular DI one name away, where
a `provide:` settles it. That rule reports **154 times across 87 files** on the same suite, all at
`error`. `no-instance-lifecycle-spy` is on the evidence too: Angular never calls an instance spy on a
hook it read off the prototype, but a spec that calls `component.ngOnInit()` itself does, and so does
the injector for a service's `ngOnDestroy`. `prefer-create-mock` (5.23.0) is graded on what its
repair _costs_: the evidence is exact — the literal and the type it claims are written on the same
line — but accepting the suggestion hands that literal to the compiler, and on a 2 032-file consumer
that is 1 200 findings in 327 files going red on one day. `no-unasserted-argument` (5.23.0) is graded on what its
repair _needs_ rather than on its evidence: both of its readings are facts out of the file — a
subject some other test in the same file pins with `toHaveBeenCalledWith`, a title saying `with` over
a body whose every assertion is a bare call — but the repair is the argument list the test should
have named, which is the one thing the rule cannot supply. Every `error` here names an edit or names
a helper; this one names a question for the author. `prefer-spy-on-own-method` names a shorter spelling of a correct call — the
`createSpyFromInstance` it reports does exactly what the helper does — and its exact shapes carry a fix. Set any of the eight `warn`s to `'error'` once the batch is done. Three of
them can report on a _correct_ project, and only one has an option:
`jasmine-namespace-without-entry` takes `['error', { setupModules: ['./test-setup'] }]`, naming the
file where `enableJasmineCompat()` is called; `prefer-native-spy-api` goes `'off'` for as long as a
suite is still running on the jasmine bridge it reports; and `no-unregistered-inject-spy` has no
option and needs none — it stays silent unless the file calls `provideAutoSpy` and its whole
`providers` array is readable (a spread, an unknown factory, `createWithAutoSpies`, `renderShallow`
or `TestBed.overrideProvider` all silence it), so the residue is a scoped `'off'`. The last four are
for a suite mid-migration off `jasmine-auto-spies` (§20). `no-mocked-for-spy` only ever touches a
**type position**, where a wrong rewrite is a compile error rather than a test that quietly changed
meaning — so `--fix` renames the type, adds `import type { Spy } from 'vitest-auto-spy'` and drops
the orphaned `Mocked` import. Every type position, not only a `let`: a factory's return type, a
helper's parameter, `as unknown as Mocked<T>`. It declines where it cannot prove the rename (a
`Mocked` the file declares itself, a `Spy` that is already something else, `Mocked<{ a: Mock }>`
rather than a named type) and reports without a fix.

**The autofix is narrower than that licence.** A declaration is decidable; what the name is
_assigned_ two lines below is not — `--fix` once renamed a declaration to `Spy<T>` and left an object
literal beneath it that the new type rejects, so `eslint --fix` reported clean and `tsc` failed
afterwards. The plain fix now survives only where the value came out of `createSpyFromClass`,
`createAutoMock`, `createMock`, `mockDeep`, `injectSpy`, `asSpy` and friends, or where the annotation
belongs to no variable (a parameter, a return type, an `as` expression). Everywhere else the same
edit is a **suggestion** — accept it together with the repair at the creation site, usually
`createAutoMock<T>()` in place of the literal. **After any `--fix` run over specs, run
`npx tsc --noEmit`**: a lint pass reporting clean is not evidence that the types still hold.

`no-overridden-provider` is the one that catches a defect rather than a habit. Angular keeps the
**last** provider for a token, so `[provideAutoSpy(X), { provide: X, useValue: mockX }]` is not an
auto-spy with configuration — the auto-spy is dead and the hand-rolled double is what DI hands out
(found on eight tokens of one file). It reads both spellings in either order and compares tokens as
source text. A **verbatim duplicate** was already being ignored by Angular, so it carries a
suggestion to delete the dead copy (a suggestion, never `--fix`: unattended deletions inside a
`providers` array are not something to find in a diff). When
the survivor is the **barer** of the two — `provideAutoSpy(X, { gettersToSpyOn: […] })` above a bare
`provideAutoSpy(X)` — there is no edit, because which one to keep is the question; move the
configuration onto the survivor or delete it. Both messages name the token and the surviving
provider's line. A `multi: true` registration is exempt on both sides:
Angular accumulates multi providers rather than keeping the last, so two of them for one token is
the feature — a spec asserting that two `BEFORE_INIT` hooks run in registration order needs both.
Multi mixed with plain is still reported, because Angular refuses that pair at runtime
(`Cannot mix multi providers and regular providers`). For the same reason `prefer-provide-auto-spy`
says nothing about a multi provider: `provideAutoSpy` takes no registration mode, so the replacement
it would ask for does not exist.

`no-import-time-spread` is the one that fails **while the bundle loads**, on a tree whose every test
passes: `export const events = [...BaseEvents]` at module scope raises
`Spread syntax requires ...iterable[Symbol.iterator] to be a function` when a shared chunk is
evaluated while the binding it re-exports is still `undefined`. Safe under `tsc` and under a
browser's ESM loader, which is why nothing else catches it. A function body and an instance field are
not reported (they run later); a `static` field is. An **object** spread is reported through a second
message, `noImportTimeSpreadObject`, because that half fails without failing: `[...undefined]` and
`f(...undefined)` throw, `{ ...undefined }` is `{}`, so `{ ...SectionItemType, ...Local }` loads
clean and every key it meant to copy reads `undefined` for the rest of the run. One message cannot
carry both: a reader sent looking for `Spread syntax requires …` in an object spread finds no such
error in the log and takes the report for a false positive.

`prefer-as-spy` is the one a migration meets in bulk: a `jest-auto-spies` suite writes
`TestBed.inject(X) as Spy<X>` once per injected double, and that cast fails here with `TS2352`.
`asSpy` is a typed identity function, so `--fix` keeps the assertion, carries the type arguments
across (inference answers `Spy<Service<any>>` for a generic class) and repairs the imports. A cast
that hops through `unknown` is left alone — the hop says the value is not a `T` — except after
`TestBed.inject(X)`, where the container returns `X` by construction and the hop was only silencing
`TS2352`. Neither rule is for the object under test: a service the spec exercises is not a double,
and typing it as the class is the repair there.

`no-expect-in-subscribe` reports one shape and **three different edits**, and says which: the
subscription is the last thing the test does (invert it into `await firstValueFrom`); something
after it is what makes the stream emit (hold the promise — `const p = expectEmission(src$)`, fire
the trigger, `await p` — because inverting deadlocks); or the assertion is in the `error` branch
(`await expect(firstValueFrom(src$)).rejects.toMatchObject(…)`). It also counts assertions the
callback reaches through a helper it calls, which used to make `subscribe((d) => assertShape(d))`
invisible. `prefer-provide-auto-spy` reads `useFactory` as well as `useValue`, through the function
in the first case and not in the second — a factory's body is what DI ends up holding, while a
function inside a `useValue` is a lazily-built double, i.e. the fix. Three rules change behaviour
when applied — whether `injectSpy(X)` finds a spy is decided by a `provideAutoSpy(X)` usually
written in another file, `mockValueProp` leaves the property writable and configurable, and
`no-expect-in-subscribe` rewrites a whole test — so `prefer-inject-spy`,
`no-object-define-property` and `no-expect-in-subscribe` only ever suggest:

```ts
it('maps the products', () =>
  // ❌ flagged, and a suggestion is offered
  new Promise<void>((done) => {
    service.getProducts(id).subscribe((products) => {
      expect(products).toEqual(expected);
      done();
    });
  }));

it('maps the products', async () => {
  // ✅ what accepting it produces
  const products = await firstValueFrom(service.getProducts(id));

  expect(products).toEqual(expected);
});
```

That template was 111 of 133 violations in one migration batch. The suggestion appears only for the
exact frame above — one `subscribe` statement in the executor, one block-bodied callback, `done()`
mentioned once and standing last — and the report itself now counts assertions per `subscribe`
rather than one message per `expect`, which used to double the apparent size of the job.

`prefer-inject-spy` reads both spellings of the same mistake, which is the point of the second one:

```ts
vi.spyOn(TestBed.inject(AppEventsService), 'announce'); // flagged, always was
const appEvents = TestBed.inject(AppEventsService);
const announceSpy = vi.spyOn(appEvents, 'announce'); // flagged now
```

The variable is resolved through the scope manager, so it has to be a `const`/`let` initialised
from `TestBed.inject(...)` and never assigned again — a name bound by an import, a parameter, or a
`let` that is reassigned is left alone.

Five tokens are left alone whatever is spied on them: `ApplicationRef`, `DestroyRef`,
`EnvironmentInjector`, `HttpClient`, `Injector`. Each is a case where this rule's advice is
impossible or self-defeating — `{ provide: DestroyRef, useValue }` is silently ignored, because
`R3Injector.get()` short-circuits on `__NG_ENV_ID__` before it reads its providers; a spied
`ApplicationRef` has no `injector` to build a component with; `HttpClient` under
`provideHttpClientTesting()` is supposed to be real. A project adds its own with
`['error', { ignoreTokens: ['MapRendererService'] }]`, compared as source text, which extends the
five rather than replacing them.

`no-inject-before-override` catches the trap this plugin's own advice sets. `TestBed.inject()` in a
`beforeEach` — the line you write once `provideAutoSpy(X)` has taken away the literal you used to
configure — instantiates the module, and every `TestBed.override*` afterwards throws, including one
written above it inside a `createComponent` helper. Configure the double after the overrides
(`injectSpy(X)` in the test), or keep the access lazy: `const api = () => injectSpy(Api)`. The check
is order-free by design, since a helper declared above the hook still runs after it.

`no-ts-expect-error-on-double` reports the suppression, not the reason written after it. On one
1759-file suite it reports 34 directives in 15 files and **every one carries a reason** — so an
escape for "a directive with a reason" would have silenced all of them. Four sat on overloaded
clients, which `overload` repairs (§5); seven blamed "the collapsed generic" for a fixture the real
instantiation rejects as well; nineteen hid a fixture or a production type that disagrees with the
declared one. Four were deliberate — a value outside the declared type, to reach a default branch —
and that is the case a per-line disable is for:
`// eslint-disable-next-line vitest-auto-spy/no-ts-expect-error-on-double -- <why>` above the
directive. The report sits on the directive's line so that comment reaches it. `rejectWith`,
`failWith` and `throwWith` are not read: their parameter is `unknown`, so a directive there
suppresses something other than the stub.

**What the plugin costs is bounded by the file, not by what is in it.** Three rules used to re-read
the file per finding-site rather than once: over this repository's 173 spec files the whole plugin
takes **56 ms** where it took 93, and on a single 1.7 MB spec **68 ms** where it took 3 263. The
rules answer the same way they did — the ordering rules (`no-inject-before-override`,
`no-overridden-provider`) collect the `override*` and `resetTestingModule` positions in one pass and
decide by range, `prefer-render-shallow` asks the template-read question once per file, and
`no-redundant-smoke-test` indexes identifiers only where a smoke test exists to judge.

**A rule message names what it found and one repair, and ends in `Docs: <url>`** — the rule's own
section of the rules page (`utilities/eslint-rules#<rule-name>`), which is also its `meta.docs.url`.
The reasoning a message leaves out lives in that section; read it before overriding a severity.

The legacy `.eslintrc` `plugins: []` form cannot work — it resolves names to `eslint-plugin-*`
packages, which a subpath export can never be.
