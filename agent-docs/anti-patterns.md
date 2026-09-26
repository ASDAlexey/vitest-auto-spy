# vitest-auto-spy — Do not write this

Part of the agent reference [`AGENTS.md`](../AGENTS.md), which maps every section to its file. Section numbers are shared with it.

## 18. Do not write this

| ❌ | ✅ |
| --- | --- |
| `import … from 'jest-auto-spies'` | `import … from 'vitest-auto-spy'` |
| `vitest-auto-spy` inside a `bun test` file | `vitest-auto-spy/bun` |
| `let s: MyService = createSpyFromClass(MyService)` | `let s: Spy<MyService> = …` |
| `createSpyFromClass(X) as unknown as X` | `asInstance(createSpyFromClass(X))` |
| `{ provide: X, useValue: { a: vi.fn(), b: vi.fn() } }` | `provideAutoSpy(X)` |
| `{ provide: ActivatedRoute, useValue: { snapshot: { params } } }` | `provideActivatedRoute({ params })` — streams and snapshot from one record |
| `createAutoMock<Router>({ events: of(), url: '/' }, { returns: { navigate } })` | `provideRouterDouble({ url })` — one URL behind `url`, `routerState` and `events` |
| `vi.spyOn(TestBed.inject(X), 'method')` | `injectSpy(X).method` |
| `vi.spyOn(component, 'ngOnInit')` after `createComponent` | `vi.spyOn(Cls.prototype, 'ngOnInit')` before it, or assert the effect |
| `{ provide: IS_BROWSER, useValue: {} }` for an `InjectionToken<boolean>` | `useValue: false` — a value of the type the token declares |
| `Object.defineProperty(service, 'ready', { value: true })` | `mockReadonlyProp(service, 'ready', true)` |
| `source$.subscribe(v => expect(v).toBe(1))` | `await expect(expectEmission(source$)).resolves.toBe(1)` |
| `await lastValueFrom(done$, { defaultValue: undefined })` | `await expectCompletion(done$)` |
| `{ timeout: 0 }` on every helper because timers are faked | `setEmissionTimeout(100)` once, in the setup file |
| `{ provide: AbstractToken, useValue: createAutoMock<T>() }` | `provideAutoSpy(AbstractToken)` |
| `mockDeep<T>()` for a chain that goes through a **call** | `mockDeep<T>({}, { selfReturning: true })` |
| `await expect(expectEmission(x$)).rejects.toBe(originalError)` | `await expect(expectError(x$)).resolves.toBe(originalError)` |
| `source$.pipe(skip(1))` / `pipe(filter(p))` in front of the helper | `expectEmission(source$, { skip: 1 })` / `{ until: p }` |
| hold the promise, `vi.runAllTimers()`, then await | `expectEmission(source$, { advance: () => vi.runAllTimers() })` |
| `injectSpy(X)` then a `mockReturnValue` per method in `beforeEach` | `provideAutoSpy(X, { returns: { … }, overrides: { … } })` |
| a local `injectSpy` wrapper with `as never` + `as Spy<T>` | the library's — it also takes an `InjectionToken` |
| a hand-written double for a token with `Observable` members | `provideAutoSpyForToken(T, undefined, { observablePropsToSpyOn: […] })` |
| `mockDeep<T>() as unknown as T` to satisfy an API typed against `T` | `asInstance(mockDeep<T>())` |
| `from([double])` to stop `of(double)` swallowing the double | `of(double)` — `schedule` is no longer answered (§2) |
| `spy.instanceField.mockReturnValue(…)` on a member Angular moved | `provideAutoSpy(X, { instanceMethodsToSpyOn: ['…'] })` (§5) |
| `expect(component.total).toBeTruthy()` (a signal) | `expect(component.total).toHaveSignalValue(3)` |
| `fixture.detectChanges()` then assert signal state | `await stable(fixture)` then assert |
| `onlyMethodsToSpyOn: [...]` "to add a method" | omit it, or use `instanceMethodsToSpyOn` |
| a `vi.fn()` the code calls with `new` | `createSpyClass(Foo)` / `mockConstructor(factory)` |
| an exported `const` fixture holding `vi.fn()`s | an exported **factory** that returns it (§10) |
| `let s: Mocked<MyService>` (Vitest's own type) | `let s: Spy<MyService>` |
| `it('x', (done) => …)` / `beforeEach((done) => …)` | `async` + `await` — Vitest passes a `TestContext`, not `done` |
| `{ ...modelInstance, flag: true }` (drops every getter) | `withOverrides(modelInstance, { flag: true })` |
| `if ('params' in link) … else throw` in every spec | `narrow.byKey(link, 'params')` |
| `const x = a?.b; assert.exists(x); … x …` on every optional read | `narrow.defined(a?.b)` — it returns the value, so the narrowing sits in the expression |
| `expect(body).toBeInstanceOf(FormData); const form = body as FormData` | `narrow.instanceOf(body, FormData)` — the check and the type in one expression |
| five `asInstance(...)` in one call | `...asInstances(a, b, c, d, e)` |
| `vi.stubGlobal('Image', vi.fn(() => ({ src: '' })))` | `stubConstructor(globalThis, 'Image', () => ({ src: '' }))` |
| `Object.defineProperty(document, 'cookie', { value })` | `mockValueProp(document, 'cookie', value)` |
| `vi.spyOn(globalThis, 'Date')` | `mockSystemTime('2025-04-30T00:00:00Z')` |
| ten `await Promise.resolve()` for a dynamic `import()` | `await settleDynamicImport(() => import('…'))` |
| a bare `await import('…')` in a test body | `await settleDynamicImport(() => import('…'))` — `prefer-settle-dynamic-import` reports it |
| a capture whose only assertions are `toEqual([])` / `not.toHaveBeenCalled()` | `await expectNoEmission(source$)` — `no-vacuous-absence-assertion` reports it |
| `{ id: '1', isOffline: false } as Device` (a cast passes an excess key) | `createMock<Device>({ id: '1' })` — `prefer-create-mock` reports it |
| `TestBed.inject(S).m as Mock` (`Mock` is `Mock<any>`) | `injectSpy(S).m` — `no-mock-cast` reports it |
| `await fixture.whenRenderingDone()` | `await stable(fixture)` |
| an exported `const` provider with `vi.fn()` inside | an exported **factory** returning it (§10) |
| `.overrideProvider(X, provideAutoSpy(X))` (works, but says the wrong thing) | `.overrideProvider(X, overrideAutoSpy(X))` |
| `TestBed.overrideComponent` to swap a provider | `overrideComponentProvider(Cmp, X)` |
| `{ target, isIntersecting } as unknown as IntersectionObserverEntry` | `intersectionEntry(target, true)` |
| `@Component({ selector: 'app-chart' }) class MockChartComponent { @Input() … }` | `createComponentStub(ChartComponent)` — the selector cannot drift |
| a `TestingStorage` class assigned to `globalThis.localStorage` | `stubWebStorage('localStorage')`, restored with the other patches |
| an assertion containing a date, with no clock set | `mockSystemTime(iso)` first |
| `configureTestingModule` inside every `it()` | one per `describe` |
| `vi.mock('@angular/core')` to neutralise `effect()` | set the signals, `await stable(fixture)`, assert the result |
| a second `vi.spyOn(console, 'error')` | `consoleErrorSpy` from `vitest-auto-spy/console`, installed with `installConsoleSpies()` |
| `import { consoleErrorSpy } from 'vitest-auto-spy/console'` as the install | `installConsoleSpies()` in `beforeEach`, `restoreConsole()` in `afterEach` — the import installs once per worker |
| a bare `vi.spyOn(console, 'error')` to keep a spec quiet | `.mockImplementation(() => undefined)` — without it the line still prints |
| `mockReadonlyProp(c, 'items', vi.fn(() => []))` | `mockReadonlyProp(c, 'items', signal([]))` — a real signal |
| `spy.m.mockReturnValue(subject$)` for a `vi.fn(() => subject$)` | `spy.m.mockImplementation(() => subject$)` — the variable is re-read |
| `const overrides = { m: vi.fn(() => of(x)) }` hoisted out of the call | `const overrides: DeepPartial<X> = { … }` — checked against `X` where it is written |

**A hand-rolled double trips `rxjs-x/finnish`, and a double from this package does not.** The rule
reports any name whose type is an `Observable` **or whose call signature returns one**
(`couldReturnObservable`). `vi.fn()` and `vi.spyOn()` hand back a callable mock carrying the
signature of the method it stands for, so a double for a method returning an `Observable` reads to
the rule as a stream and it asks for a `$` — on a spy, where the `$` would lie about what the
variable holds. `functions: false` gives no relief: that option is about function _declarations_,
not a variable holding one. A `Spy<T>` from `createSpyFromClass`, `provideAutoSpy` or
`createAutoMock` is an ordinary object instead — the Observable sits on its members, not on the
variable — so nothing is reported, and neither the name nor the assertion has to be bent. Measured
on an Angular workspace of 1771 spec files: the rule named seven sites, every one a hand-rolled
`vi.fn`/`vi.spyOn`, and none on a double built here.

The overrides bag is the one shape worth knowing in detail, because the repair is not a rename.
Written inline, `provideAutoSpy(X, { overrides: { m: vi.fn(() => of(x)) } })` is invisible to the
rule — an object literal inside a call is skipped. Hoisted into a `const` it is reported **per key**,
and the key cannot be renamed: it is the method's name on `X`. What clears it is the annotation the
bag should carry anyway, `const overrides: DeepPartial<X> = { … }` — the rule skips a literal whose
variable is annotated, and the bag starts being checked against `X` where it is written rather than
only at the call. For a spy whose name is genuinely free, `*Spy` plus a `names` exemption in the
rule's own options says the same thing once for the whole repository.

**The one mechanical rename in a migration that is not equivalent.** `vi.fn(() => x)` reads `x`
when the double is _called_; `mockReturnValue(x)` freezes the value `x` had when the double was
_configured_. They are indistinguishable until the test reassigns `x` — and the commonest reason to
do that is a fresh `Subject` after the previous one has been `error()`ed or completed, which is
exactly the case a suite is testing when it reassigns. The double then keeps handing out the dead
one: in one spec the service received a completed subject and silently skipped the modal it was
meant to show, with the test still green. Carry `vi.fn(() => x)` over as
`mockImplementation(() => x)`, and keep `mockReturnValue` for a literal. Worth saying out loud to
anyone writing a codemod, because the rename looks like the safest edit in the file.

### Advice that circulates and is wrong on Vitest

Jest-era tutorials and cheat sheets repeat a handful of lines that fail on Vitest, or pass and leak.
Each was checked on Vitest 5.0.0:

| Circulating advice | What happens | Write instead |
| --- | --- | --- |
| `const load = vi.fn(); vi.mock('./api', () => ({ load }))` | `vi.mock` is hoisted above every import and `const`: `ReferenceError: Cannot access 'load' before initialization`, wrapped in `[vitest] There was an error when mocking a module` | `const mocks = vi.hoisted(() => ({ load: vi.fn() }))`, then `() => ({ load: mocks.load })` |
| "name it `mockLoad` and the factory may read it" | Jest's exemption for `mock`-prefixed names does not exist in Vitest — same `ReferenceError` | `vi.hoisted` |
| `vi.requireActual('./api')` / `jest.requireActual` | `vi.requireActual` is `undefined` | `vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), load: vi.fn() }))` |
| `import { jest } from 'vitest'` | `vitest` exports no `jest`; the binding is `undefined` | `vi` — `vi.fn()`, `vi.spyOn()`, `vi.mock()` |
| `import { userEvent } from '@testing-library/user-event'` | the named export exists only from 14.5.0; the default export works on every 14.x, and every 14.x method returns a promise | `import userEvent from '@testing-library/user-event'`; `const user = userEvent.setup(); await user.click(el)` |
| `vi.restoreAllMocks()` "to undo fake timers" | `restoreAllMocks`, `resetAllMocks` and `clearAllMocks` leave fake timers installed — `vi.isFakeTimers()` is still `true` | `vi.useRealTimers()` in `afterEach` |
| `global.fetch = vi.fn()` in a test | survives `vi.restoreAllMocks()` and `vi.unstubAllGlobals()`, and answers every later test of the file | `mockValueProp(globalThis, 'fetch', …)` or `vi.stubGlobal` + `unstubGlobals: true`; `blockNetwork()` to stay offline; the `no-hand-assigned-global` rule reports the bare form |
