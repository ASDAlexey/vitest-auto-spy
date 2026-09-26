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

No task needs all of it. This file is the core; five long sections live next to it in `agent-docs/`,
each with a stub here that says when to read it. Read by section, not whole:

```bash
D=node_modules/vitest-auto-spy
grep -n '^## ' "$D/AGENTS.md"                                # the map: every section with its line number
sed -n '<start>,<end>p' "$D/AGENTS.md"                       # one section, from its heading to the next one
grep -n '^### ' "$D/agent-docs/angular.md"                   # the map of a topic file
grep -n -F '<text of the error>' "$D/agent-docs/errors.md"   # a failure: its row, with the fix
```

| Read | Sections |
| --- | --- |
| Always, before writing a spec | §1 entry point, §2 factory, §3 the 90% recipe, §18 do not write this, §19 before you report success |
| When the task touches it | §4 return-type helpers, §5 `createSpyFromClass` configuration, §6 `Spy<T>` vs `T`, §7 resetting, §8 observables, §9 patching properties, §10 setup file (`agent-docs/setup.md`), §11 waiting, §12 doubles for what the code builds, §15 other adapters |
| Only for that stack | §13 Angular (`agent-docs/angular.md`), §14 `fakeAsync`, §16 ESLint plugin (`agent-docs/eslint.md`), §20 migrating off `jasmine-auto-spies` (`agent-docs/migration-jasmine.md`) |
| Never front to back | §17 Error → fix (`agent-docs/errors.md`): grep the message instead |

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

`vitest-auto-spy/jasmine` is Vitest-only, because it registers the Vitest adapter. On `bun test` and
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

```
Do you have a real class at runtime?
├── yes → createSpyFromClass(Class, config?)          → Spy<T>
│         (an `abstract class` DI token counts — see below)
└── no  → Is the double CALLED by the code under test?
         ├── yes, and it is INJECTED (DI, a field)  → createAutoMock<T>(overrides?)  → Spy<T>
         ├── yes, and it is an ARGUMENT of the function under test, asserted on
         │                                          → autoMocked<T>(overrides?)      → T & Spy<T>
         ├── yes, and reads chain (a.b.c())         → mockDeep<T>(overrides?)        → DeepMockProxy<T>
         ├── yes, and CALLS chain (a.b().c())       → mockDeep<T>({}, { selfReturning: true })
         └── no, it is only READ (DTO, config, route snapshot)
                 ├── one spec, a couple of fields   → createMock<T>(partial?)        → T   (no spies)
                 └── many specs, one shared model   → createFixtureFactory<T>(defaults) → (overrides?) => T

Object already built, other code already holds it?
                                  → createSpyFromInstance(obj, config?)  → Spy<T>, patched IN PLACE
One standalone function?          → createFunctionSpy<Fn>('name')      → FunctionSpy<Fn>
Code under test does `new Foo()`? → a real class?  createSpyClass(Foo)
                                  → only a shape?  mockConstructor<T>(() => instance)
                                  → on a global?   stubConstructor(globalThis, 'Image', factory)
                                    (a vi.fn() rejects `new` — see §12)
```

`createAutoMock` and `autoMocked` build the same object; they differ only in the type you get back,
and the question that decides it is **how the double travels**. Through DI, it arrives as `Spy<T>`
and is only ever asserted on — `createAutoMock`. Handed to the function under test as an argument
(`checkEndpoint(url, logger)`, `applyPreferences(target, …)`, `setLocalOverrides(storage, …)`),
it has to satisfy `T` at the call site _and_ expose the spy helpers at the assertion, and
`autoMocked<T>()` is that intersection — otherwise every call site needs an `asInstance()` and the
noise scales with the number of them. Both take the same second argument (`returns`, `name`, `strict`,
`observablePropsToSpyOn`). A `let` assigned in `beforeEach` is declared `AutoMocked<T>`,
not with the intersection spelt out. `returns` also takes an optional method written as a property,
`getMinZoom?: (() => number) | undefined` — the way Leaflet and other third-party typings declare
them.

`createMock<T>()` is the one to reach for on data shapes — it returns a plain `T`, so it satisfies a
`no-type-assertion` lint rule without an `eslint-disable` on every fixture. `createMock<T>(undefined)`
is the same call as `createMock<T>()` and answers `{}`, **not** `undefined` — a forwarding helper
with an optional `overrides` parameter relies on that. A fixture that means "no value" passes
`undefined` itself: `getters.profile.mockReturnValue(undefined)`, never
`mockReturnValue(createMock<Profile>(undefined))`.

A fixture **outside** its type on purpose — the `null` or array a backend sends where the type says
object, a payload that has to reach a runtime guard — is `outOfType<T>(value)`: nothing is checked,
the call site says so, and `prefer-create-mock` / `no-ts-expect-error-on-double` accept it where they
would report `as unknown as T` or a `@ts-expect-error`. It takes its type from the slot, so
`mockValueProp(job, 'status', outOfType('UNKNOWN'))` stays on the key-checked overload. Everything else
stays `createMock<T>()`.
On a strict double, `spy.m.mockReturnValue(outOfType(undefined))` reaches a defensive
`?? of(null)` branch of a method typed to return an `Observable`, and counts as configured.

Under `strict`, `returns: { open: undefined }` marks a method configured whose answer nobody reads
(an ngrx `rxMethod` ref, a snack-bar ref) — accepted for any return type. It is also how a
type-only double under `strict` takes its void calls, one key each:
`createAutoMock<CanvasRenderingContext2D>(undefined, { strict: true, returns: { save: undefined, restore: undefined } })`.

**`createSpyFromInstance(instance, config?)` is the one case where nothing is constructed.** Every
factory above builds the double, which is no help once the object exists and other code already
points at it — a service a factory built, a third-party client, a half-real `TestBed.inject(X)`. It
patches that object in place and hands the same object back typed as `Spy<T>`, so a closure, a DI
container or a live subscription that captured it first sees the spies:

```ts
const client = new PaymentsClient(config); // real, already wired into the code under test
const spy = createSpyFromInstance(client);

spy.charge.calledWith(100).resolveWith({ ok: true });
await checkout.pay(100);

restoreSpiedInstance(client); // client.charge is the real method again
```

Discovery is the object's own function-valued fields **plus** every prototype method up to but not
including `Object.prototype` — so an arrow-function property needs no `instanceMethodsToSpyOn` here,
and `hasOwnProperty` / `toString` are never replaced. The configuration is `createSpyFromClass`',
minus the two options that describe a double being built rather than an object being patched:
`lazySpies` (the members already exist) and `fillMissing` (an instance is not an erased `abstract`
declaration). Every write is journaled through the same mechanism as the `mock*Prop` helpers, so
three ways back compose — `restoreSpiedInstance(instance)` for one object mid-test,
`restoreMockedProps()` (which `setupAutoSpy()` already runs) for the sweep, and
`using spy = createSpyFromInstance(client)`, whose dispose **restores** rather than merely resets:
the only sense disposal can have for an object the consumer owns. A frozen or sealed instance, and a
member declared `configurable: false`, come back as this package's diagnostic rather than a bare
`TypeError` (§17) — except a writable, enumerable one, whose value is simply replaced in place. Nothing else in the field does this — `vi.mockObject` is Vitest-only,
`sinon.createStubInstance` builds a new object from a constructor instead of patching the one you
hold, and `bun:test` and `node:test` have nothing.

**`passthrough: true` keeps the patched object working.** Unconfigured methods run the real
implementation (with the instance as `this`) and are still recorded; any configuration takes the
whole method over and `resetAutoSpy` hands it back. The Angular shape is
`createSpyFromInstance(TestBed.inject(CartService), { passthrough: true })` — dependencies, `signal()`
fields, `ɵprov` and the real `ngOnDestroy` keep working. Lifecycle hooks, discovered callables with an
API of their own (signals) and discovered classes are left real rather than spied. Do **not** combine
it with `strict: true` or `onUnstubbedCall` on the same call — that throws; a suite-wide strict yields
to it. A `calledWith(1)` miss answers `undefined`, not the real method: configuring a method hands the
whole method over. Use it to assert an interaction on a real collaborator; use a plain double when
the test must not touch the real one.

**`spyOnOwnMethod(sut, 'method')` is that whitelist-plus-passthrough shape packed into one call.**
`createSpyFromInstance(sut, { onlyMethodsToSpyOn: ['method'], passthrough: true }).method` is
verbose for the most common thing it says — _observe one method of the object under test and let it
run_ — so the helper says exactly that and hands back the single spy. It is also the drop-in for a
bare `vi.spyOn(component, 'method')` where a preset's `no-restricted-properties` bans `vi.spyOn`:
same default semantics, record and call through, and `restoreSpiedInstance` puts it back. It is a
core export — `import { spyOnOwnMethod } from 'vitest-auto-spy'`, or the runner entry on
`bun test` / `node --test` — while `vitest-auto-spy/angular` and `vitest-auto-spy/nestjs` have no
core re-export, so those suites import it from the root; `spyOnVoidMethod` below is the same.

**Do not `createSpyFromInstance` a DOM node that must keep living a DOM life.** Discovery walks the
node's prototype chain, and past the component's own class that chain is the engine's: happy-dom's
`Node.removeChild` calls an internal Symbol-keyed method on the child, and once discovery has
patched it the strict guard refuses that call — the node cannot be removed from `document.body` at
all, and the leak then fails later tests in the file far from the cause. Without `onlyMethodsToSpyOn`
on a live `Node`, the global `window` or another engine-provided event target (`XMLHttpRequest`,
`AbortSignal`; a class of your own that extends `EventTarget` does not count), the call now reports
this itself, before patching anything — `warn` by default, or a throw right there under
`setMisconfigurationReaction('throw')`.
The bare-array shorthand does not silence it: `createSpyFromInstance(el, ['addEventListener'])`
merges as `methodsToSpyOn`, the _additive_ list, so discovery still walks the whole node — only
`{ onlyMethodsToSpyOn: [...] }` skips it. For a still-attached element, spy one property with
`mockValueProp(el, 'addEventListener', vi.fn())` (§9) — the node stays otherwise real and removable.
For a native void method the handler is meant to call (`preventDefault`, `stopPropagation`, `focus`),
`spyOnVoidMethod(event, 'preventDefault')` packs the whitelist and the
`returns: { preventDefault: undefined }` seed a strict suite otherwise needs, naming the method once
instead of twice.

**`createFixture<T>(defaults, overrides?)` / `createFixtureFactory<T>(defaults)` are for the model
that more than one spec builds.** The difference from `createMock` is the `defaults` argument: it is
a **complete** `T`, checked in full, in one place — so a field the model dropped fails there instead
of in eight copies of a hundred-line literal. Overrides are deep-partial-checked and merge leaf by
leaf; an overridden array replaces the default one. Every call hands back a fresh object and the
defaults are copied at build time, which is what keeps one test's mutation out of the next test —
across files, under `isolate: false`. The copy is deep through plain objects and arrays only: a
`Date`, a `Map` or a class instance travels by reference, because rebuilding it would strip its
prototype. Defaults that are a class instance with getters go through `withOverrides()` first.

**`mockDeep` builds depth on property access, not on calls** — the distinction the tree now spells
out, and the one that costs an afternoon otherwise. `mock.repo.user.find()` chains because every hop
but the last is a _read_. A node that is **called** returns what it was configured to return, and by
default that is `undefined`, so `mockDeep<AppLogger>().channel('app').info('x')` is a `TypeError` at
the second call — while `DeepMockProxy<AppLogger>` types it perfectly, so nothing warns. Pass
`{ selfReturning: true }` for a fluent API, or use
`createAutoMock<T>(undefined, { selfReturning: ['channel'] })` when only one method chains:

```ts
const logger = mockDeep<AppLogger>({}, { selfReturning: true });

logger.channel('app').info('started');
expect(logger.channel('app').info).toHaveBeenCalledWith('started');
```

Both bridges exist, and which one you need depends on the direction. What a self-returning **call**
hands back is typed as the _declared_ return type, not as a spy — `asSpy<T>(…)` when the helpers are
needed. The **whole mock** is a `DeepMockProxy<T>`, which is not assignable to `T` for the same
reason `Spy<T>` is not (a mapped type cannot see private members) — `asInstance(…)` when it has to
go somewhere typed against the real thing:

```ts
const logger = mockDeep<AppLogger>({}, { selfReturning: true });

boot(asInstance(logger)); //           → AppLogger, for the API under test
asSpy<AppLogger>(logger.channel('app')).info.mockReturnValue(undefined); // → the helpers
```

**Arrays and unmocked calls on `mockDeep`.** A member read by a numeric index (`api.items[0]`) is a
real `Array` of deep mocks from then on, and `map`, iteration and `toEqual` work on it. Read the
member again after the first index: a handle taken before the first index is still a node. To make a
call nobody configured fail, use `mockDeep<T>({}, { fallbackMockImplementation: () => { throw … } })`.
Options go in the **second** argument, not the first as in vitest-mock-extended. The precedence is
configuration > fallback > `selfReturning`. A `calledWith` miss answers `undefined`, not the
fallback; use `mustBeCalledWith` for "other arguments fail". For a callback API (`$transaction`), use
`method.mockImplementation((run) => run(asInstance(mock)))`; there is no option for it.
`vi.spyOn(mock.repo, 'find')` works on a member nobody has read and returns the node's own spy.

`asInstance` did not take a deep mock before 3.5.0, which left it with nowhere to go: this tree
sends you to `mockDeep` when the calls chain, and the result then fitted nothing that expected `T`.

**A deep node asks what the spy surface is on every read**, rather than remembering the answer from
the first deep mock of the worker. That matters under `isolate: false`, where the surface grows
mid-run: `import 'vitest-auto-spy/rxjs'` in a later file adds `nextWith` and friends, and
`setSpyEngine` swaps the whole prototype. With the answer cached, `deep.feed.items.nextWith(1)` in
every double built after that resolved to a **child node** — callable, recorded, emitting nothing —
while the spec waited on a stream that was never fed.

**`selfReturning: true` chains a factory, not a `return this` builder**, and the difference decides
where the calls are recorded. A called node answers _itself_, not the object the method was read
off, so every hop moves one level deeper: `editor.chain().focus().insertContent('text')` records
`insertContent` on `chain.focus`, while the `chain` handle the spec is holding still has none — and
`expect(chain.insertContent).toHaveBeenCalled()` reports nothing although the chain ran. Either walk
the same path in the assertion, or, for an API where every command answers the **same** object
(tiptap's `ChainedCommands`, a query builder, a `mockReturnThis()` chain), build that object with
`createAutoMock` instead, where `selfReturning` names methods that answer one double:

```ts
const chain = createAutoMock<ChainedCommands>(undefined, { selfReturning: ['focus', 'insertContent'] });
const editor = createAutoMock<Editor>(undefined, { returns: { chain: asInstance(chain) } });

editor.chain().focus().insertContent('text').run();
expect(chain.insertContent).toHaveBeenCalledWith('text'); // one double, so the assertion is the obvious one
```

**An `abstract class` is a class.** `abstract class LocalStorage extends AbstractStorage {}`,
provided in production as `{ provide: LocalStorage, useClass: BrowserLocalStorage }`, is the
standard Angular DI-token idiom, and `provideAutoSpy(LocalStorage)` / `createSpyFromClass(LocalStorage)`
take it — type and runtime both. Abstract members are erased before they reach a prototype, so there
is nothing to read there; when discovery comes back empty the factory hands back the `createAutoMock`
proxy instead of an empty object, and every method answers. Nothing to configure, and no reason to
reach for `{ provide: X, useValue: createAutoMock<X>() }` by hand any more.

That holds while the class is **fully** abstract. One concrete member — a helper, a getter — and
discovery is no longer empty, the fallback does not fire, and every `abstract` member is missing
while `Spy<T>` types it as present: the read is `undefined` and the call dies as
`… is not a function` in production code. Pass `{ fillMissing: true }` there
(`provideAutoSpy(LocalStorage, { fillMissing: true })`), which answers a name the prototype never
carried with a spy. It is opt-in because `abstract` is erased at runtime — filling every unknown key
by default would silence a real typo on every concrete class.

**`overrides: { key: undefined }` is a seed, not an omission**, and the difference is load-bearing.
`createAutoMock` reads its seed with `Reflect.ownKeys`, so a key written out with an explicit
`undefined` **is** in the store: reading it answers `undefined`. Leave it out and the same read
materialises a _function spy_ — which is truthy, and sends `if (this.lastFocus)` down the branch the
spec was trying to close:

```ts
createAutoMock<NavigationService>({ currentFocus: undefined, navRoot: undefined, selectors: 'button, a' });
//                                  ^ "this member is data, and there is none" — not the same as omitting it
```

This is the way to say "the member exists and is empty", and it is worth writing even when it looks
redundant.

**A getter in `overrides` stays a getter.** The seed is kept as a descriptor rather than read once
while the double is assembled, so it runs at every read, with the double as `this` — and a seed
written to **throw** ("this global is missing on this platform") fails where the code under test
reads the member, not where the provider literal is evaluated. A `{ set }` seed is kept the same way
and takes the write. Both used to be flattened as the double was built, which turned a throwing
seed into a failure during `TestBed.configureTestingModule`, three frames from the branch under test.

A **registration** is no exception, and it was the half that stayed broken one release longer: the
merge that puts `registerAutoSpyDefaults` under a call site copied both sides with a spread, so a
seeded getter was flattened on any class or token the registry knows — whether or not the
registration names that key — while the same seed stayed live on one it does not. The merge copies
descriptors now, and the seed behaves the same either way.

### What a Proxy-backed double cannot do

`createAutoMock` and `mockDeep` build a Proxy, not an object, and there is one place where the
difference shows: a Proxy answers only the operations its handler traps. Three of them used to be
missing, and each produced a _silent_ wrong answer rather than an error — the worst failure mode
this library can have, because a checking test becomes a non-checking one and only the proxy's
source says so. Two are fixed; the third cannot be:

| Operation | Before 3.5.0 | Now |
| --- | --- | --- |
| `mockValueProp` & the other three | patch landed on the target; the double ignored it | works, and `restoreMockedProps()` undoes it |
| `delete mock.optionalMethod` | deleted nothing; the next read remade the spy | the member is absent, until something writes to it again |
| `Object.assign(real, mock)` | copies only the keys already **read** | still does — see below |

`ownKeys` cannot be completed: a type has no key list at runtime, which is the whole premise of
these two factories. So a spec that installs a double by **copying it onto a real instance** —
`Object.assign(player, engineDouble)` — gets whichever members happened to be touched first, and
every other call goes to the real implementation, silently. Use `createSpyFromClass` there: it
returns an ordinary object whose method keys are enumerable (lazy accessors, but enumerable), so
the copy is complete.

### It answers everything, so it must not answer _these_

The same premise cuts the other way. A library that is handed an object and has to decide **what
kind of thing it is** asks by probing a key — and a double that answers every property answers the
probe too, at which point it stops being a double of `T` and becomes whatever was being looked for.
Four names are therefore answered with `undefined` unless the spec seeds them, alongside `then` and
every symbol, which always were:

| Key | Probed by | The double became |
| --- | --- | --- |
| `schedule` | `popScheduler` in `of` / `from` / `merge` / … | a scheduler |
| `lift` | `isObservable`, with `subscribe` | an Observable |
| `@@observable` | `isInteropObservable` in `innerFrom` | an interop stream |
| `getReader` | `isReadableStreamLike` in `innerFrom` | a ReadableStream |

The one that cost an afternoon reads like nothing at all:

```ts
of(autoMocked<AnimationItem>()); // an Observable that never emits
```

`of(...)` takes its **last argument** for a scheduler when `typeof x.schedule === 'function'`, so
the whole double was eaten as one, `of()` was left with an empty argument list, and the emission was
scheduled onto a spy that does nothing. The component under test kept its `null`, and what failed
was an assertion about an unrelated `emit()` three concerns away — nothing in the failure mentions
`of`. The workaround people find is `from([double])`; it is not needed any more.

**`subscribe` is deliberately not on that list.** It is an ordinary method name — a store, an
Angular `OutputEmitterRef`, an event bus — and `expect(store.subscribe).toHaveBeenCalledWith(cb)` is
a real assertion. Denying `lift` and `@@observable` already breaks the impersonation, so `subscribe`
on its own fools nothing: `from(double)` now fails with rxjs's own _"You provided an invalid object
where a stream was expected"_, loudly and in the right file.

If your type genuinely has one of the four, say so once and it comes back — the list is consulted
after the seed store:

```ts
createAutoMock<TaskScheduler>({ schedule: vi.fn() });
```

That is the trade the deny-list makes: without a seed the member is absent and the failure is an
immediate `TypeError: … is not a function` at the call site, instead of a silent one in another
file. A key is only added to that list with an observed mechanic behind it — never because the name
sounds protocol-ish — because every entry costs somebody the ability to mock a member of that name
without seeding it.

The tree asks whether the double is _called_, and there is a second question worth asking: whether
the code under test **writes to it**. `createAutoMock` is a proxy with a `set` trap over the same
cache its `get` trap answers from, so an assignment sticks and is read back — which makes it the
double for a DOM-ish object a library drives by assigning handlers, where a hand-written fake is
otherwise the only option:

```ts
const xhr = createAutoMock<XhrLike>({ status: 0, timeout: 0, onload: null, onerror: null });

xhr.send.mockImplementation(() => respond(asInstance(xhr)));
// production does `xhr.onload = () => resolve(xhr.status !== 0)` — the proxy remembers it
```

---

### Cost, so it stops being a question

Building a spy is not a thing to optimise. On a ten-method class, `npm run bench` on Node v24.19.0
and Vitest 4.1.11, measured 2026-09-04: `createSpyFromClass` plus two methods called **2.25 µs**,
plus all ten 5.83 µs, `createAutoMock` plus four members 1.79 µs, a `calledWith` lookup 0.21 µs —
five providers across two thousand tests is about two hundredths of a second. Call the factory in
`beforeEach` and look at `TestBed` instead. The only two settings that cost:
`{ lazySpies: false }` gives up the laziness `provideAutoSpy` defaults to, and
`autoSpyAccessors: true` walks the prototype chain uncached on every call — name the accessors
instead.

Memory used to be the exception, and it no longer is for the default. `lazySpies: true` still
defines one property per method, but the accessor pair behind it is now **shared by method name**
across every double in the process, so the placeholder is no longer what an untouched double
retains: an untouched 100-method double holds **215 B** where it held 25 593, and a 300-method one
284 B where it held 70 165 (`npm run bench:memory`, 2026-09-17, Node 24). The price is paid at
construction on very wide classes — building a 300-method double costs about 28 % more — and
materialising every method of one is about 26 % cheaper in exchange.

That inverts the case for `lazySpies: 'proxy'`, which answers every method from a single trap
object: it now retains **4 090 B** against the default's 215 B at 100 methods — 19× more — and still
pays a trap on every read (53 ns against 7 ns) for the life of the double, because a `Proxy` cannot
remove itself while the default leaves a plain data property behind once a method materialises. What
is left of its advantage is build time on a wide class. The option is unchanged and still supported;
there is no longer a memory reason to reach for it.

A frozen or sealed double is fine now. `Object.freeze(spy)` — a deep-freeze fixture helper, a
dev-mode state guard — used to make the first read of any method throw `Cannot redefine property`
from inside the placeholder's getter; the spy is kept beside the double instead, so the read answers
a stable mock and `mockReturnValue` on it works. On a merely sealed double an assignment still
reaches the member.

`vi.spyOn(double, 'load')` on a method nobody has read yet works again. Vitest reads an accessor by
calling its getter with no receiver, and 5.19.0's shared getter answered that with
`TypeError: Invalid value used as weak map key`. The call now wraps a forwarder: a configured
`mockReturnValue` answers, an unconfigured call reaches the double's own spy (strict guard included),
and `mockRestore()` / `vi.restoreAllMocks()` hand back that same spy with the calls it recorded. It
is still redundant — the member already is a spy, so `double.load.mockReturnValue(…)` is the line to
write — and a wrapped method called off its double (`const { load } = double; load()`) throws a
message saying so.

**Symbol-keyed methods are discovered and spied.** A method under a symbol the project owns —
`[SERIALIZE]()`, `Symbol.for('app.render')` — is a method like any other, resets with the rest and
shows up in `Reflect.ownKeys`. The runtime's own protocol symbols are deliberately left alone
(everything on `Symbol` itself — `Symbol.iterator`, `Symbol.dispose`, `Symbol.toPrimitive` and the
rest — plus `Symbol.for('nodejs.util.inspect.custom')`), because a double that answers those stops
being a double of `T` and starts impersonating an iterable or a disposable. Discovery covers methods
only: a symbol-keyed **getter or setter** is not found by `autoSpyAccessors`, so patch one with
`mockAccessorsProp` (§9).

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

| Return type | Helpers added |
| --- | --- |
| anything | `calledWith(...args)` → `.mockReturnValue(v)` / `.returnValue(v)` / `.failWith(err)`, `mustBeCalledWith(...args)` → same, `failWith(err)`. On a `Promise` or `Observable` method the handle carries that row's helpers instead — `calledWith(id).nextWith(v)`, `.resolveWith(v)`; `.mockReturnValue` there is a `TS2339` |
| `Promise<T>` | `resolveWith(v)`, `rejectWith(v)`, `resolveWithPerCall([{ value }, …])` |
| `Observable<T>` | `nextWith(v)`, `nextOneTimeWith(v)`, `nextWithValues(configs)`, `nextWithPerCall(configs)`, `throwWith(v)`, `complete()`, `returnSubject()` |

`Observable` **properties** (not just methods) get the same helpers — list them in
`observablePropsToSpyOn`. The prop spy is a plain `Observable`: a `BehaviorSubject` member loses
`.value` / `getValue()`, and code that reads them gets `undefined`. Seed a real one instead —
`overrides: { isActive$: new BehaviorSubject(false) }` — and drive it with `.next()`; the same holds
for a stream the test pushes into itself.

**What counts as an `Observable` is structural, and no declaration names rxjs (4.0.0).** A member
earns the observable bundle when its type satisfies the exported `ObservableLike<T>` — `subscribe`
plus a promise-returning `forEach(next)`:
rxjs's `Observable`, every `Subject`, Angular's `EventEmitter` — and, new in 4.0.0, an `Observable`
from a _second copy_ of rxjs in the tree, which used to fall through to the plain-spy branch and
produce `nextWith is not a function` with nothing pointing at the duplicate. `Promise`, arrays,
`Signal` and Angular's `OutputEmitterRef` are not observables and do not earn it.

`returnSubject()` and `nextWithPerCall()` return `SubjectOf<T>` — rxjs's own `Subject<T>` wherever
`import 'vitest-auto-spy/rxjs'` is in the TypeScript program, the structural `SubjectLike<T>`
(`next` / `error` / `complete` / `asObservable` / `closed`) where it is not. The switch is one
augmentable interface, `AutoSpyRxjsTypes<T>`, which `/rxjs` fills in with `subject: Subject<T>`;
augment it yourself only to plug in a different subject type. If
`const s: Subject<T> = spy.m.returnSubject()` fails to compile, the import is missing from the
program the specs are checked in — usually a Vitest `setupFiles` entry that no `tsconfig`
`include` covers, or, from `@angular/build:unit-test` 22.2.0, a plain `.ts` that only the spec
`tsconfig`'s `include` lists: that builder's program is the specs, the setup files and the `.d.ts`
files (angular-cli#34134), so put the import in one of those. That is the _only_ breaking change in
4.0.0; the reason for it is that `dist/types-*.d.ts` used to open with
`import { Observable, Subject } from 'rxjs'` and load 189 rxjs `.d.ts` files into every consumer's
program (303 files against 114 without it), `import type` included — TypeScript resolves a type-only import the same way.

```ts
// argument dispatch — other arguments return undefined
users.getName.calledWith(1).mockReturnValue('Ada');
// argument enforcement — other arguments throw
users.getName.mustBeCalledWith(1).mockReturnValue('Ada');
// asymmetric matchers work in both, at any depth
users.save.calledWith(expect.objectContaining({ id: 1 })).mockReturnValue(true);
users.save.calledWith({ id: expect.any(Number), tags: [expect.any(String)] }).mockReturnValue(true);
// re-registering the same arguments replaces the answer — matcher arguments included
users.save.calledWith(expect.objectContaining({ id: 1 })).mockReturnValue(false);

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

// throwing — `failWith`, on a spy of any return type
cart.checkout.failWith(new HttpErrorResponse({ status: 500 })); // every call throws
cart.checkout.calledWith(BAD_ID).failWith(new Error('unknown cart')); // only these arguments throw
```

`failWith` is the sync counterpart of `rejectWith`, and it is **not** called `throwWith` — that name
belongs to the observable helper above, which errors the stream. At runtime every spy carries every
bundle; only the return type in `Spy<T>` tells them apart, so one name for both would mean whichever
is attached last silently wins.

On Vitest, `mockThrow` / `mockThrowOnce` (4.1) do the spy-level half of this too. `failWith` exists
because Bun and `node:test` ship neither, and because **no** runtime can make one `calledWith` chain
throw while its siblings answer normally — `mockImplementation` replaces the whole dispatch, which is
the opposite of configuring one set of arguments. A `failWith` supersedes a `resolveWith` /
`nextWith` / per-call batch configured before it, and is superseded by one configured after, so the
outcome never depends on the order the spec happens to be written in.

An exact argument list is matched before the asymmetric configs, and those are tried in
registration order — a narrow config written first keeps its calls. Two matchers count as the same
argument when they accept the same values (same matcher class, sample and inversion), which is what
makes a second `calledWith(1, expect.anything())` an override rather than a second config sitting
behind the first. A hand-rolled `{ asymmetricMatch }` object is compared by identity instead: its
verdict is a closure, so only re-registering that same instance overrides.

**A matcher counts wherever it sits, not only at the top level.** A config argument holding a
matcher — or a function — anywhere inside it is compared structurally rather than as data:
`calledWith({ id: expect.any(Number) })`, `calledWith([expect.any(String)])`, a matcher inside a
`Map` value or a `Set` member. The same comparison decides the rest of an argument's shape, so it is
worth knowing what it treats as equal: `Map` and `Set` are compared **without regard to insertion
order**, a `Date` by its time, a `RegExp` by its source and flags, an `Error` by its `name` and
`message` plus its own enumerable fields, a function by identity, and symbol-keyed properties
participate like string ones. Cycles are handled, so a component graph with a back-edge is a legal
argument. `mustBeCalledWith` uses the same map, and its `Wanted:` line renders a matcher as
`Any<Number>` rather than as the object it serialises to. With one config set up, its first line
names the first argument that differs — `argument 2: expected 'eu', got 'us'` — and it names the
class only on a strict double (`UserService.getName`), the method alone otherwise.

Each `calledWith(...)` / `mustBeCalledWith(...)` call hands back **its own** handle, so a chain kept
in a variable stays attached to the arguments it was written with:

```ts
const found = users.load.calledWith(1);
users.load.calledWith(2).mockReturnValue(undefined);

found.mockReturnValue({ id: 1 }); // configures 1, not 2
```

`new` on a method spy works: `new sdk.Client()` — the shape `createAutoMock<{ Client: typeof Client }>()`
and `mockDeep` produce — hands back the instance, or the object a `calledWith(...).mockReturnValue(...)`
configured for those arguments.

`mock.settledResults` is native on Vitest and polyfilled on Bun / `node:test`, so it is identical on
all three. Entries are `{ type: 'fulfilled' | 'incomplete' | 'rejected', value }`.

When the argument worth asserting on is one the **code under test built** — a callback, a config
object, an `AbortSignal` — describing its shape is the wrong tool. `expect.any(Function)` says a
function was passed; `captureArg` hands it to you so the test can call it:

```ts
import { captureArg } from 'vitest-auto-spy';

const onDone = captureArg<() => void>();

expect(notifier.subscribe).toHaveBeenCalledWith('ready', onDone);

onDone.value(); // and now exercise what was passed
expect(component.finished()).toBe(true);
```

`.values` holds every value the captor was **offered**, oldest first — candidates, not matches. A
captor in position 0 of `toHaveBeenCalledWith(captor, 3)` is asked about the first argument of every
call the runner tries, including the ones the `3` then rejects, so `.values` can be longer than the
set of calls the assertion accepted. `.captured` asks whether anything was recorded without
triggering the "nothing was captured" throw that reading `.value` raises; `.reset()` lets one captor
serve two phases.

`captureArg({ where })` narrows both halves at once — the filter decides what is recorded **and**
whether that position matches at all, so a rejected candidate leaves no entry in `.values` and the
whole expectation fails on it:

```ts
const config = captureArg<RequestInit>({ where: (value) => (value as RequestInit)?.method === 'POST' });

expect(fetchSpy).toHaveBeenCalledWith(url, config); // only the POST call satisfies this
expect(config.value.headers).toEqual({ 'x-trace': '1' });
```

The filter receives the raw argument as `unknown`, so narrow it yourself. **Assertions only** — a
captor without `where` matches every value, so putting one in `calledWith` would configure a return
for every call, which is `mockReturnValue` spelled less clearly, and `calledWith` is typed to the
method's own parameters so it will not compile anyway.

**The observable helpers are backed by a `ReplaySubject(1)` that belongs to the spy, and it is
configuration — so it must be reset with the rest of it.** Two failures used to come out of that
buffer outliving the test that filled it, and both were silent:

```ts
// test 1
service.createTransition.nextWith(uri); // buffered

// test 2 — the failure path is the point of this test
service.createTransition.throwWith(error); // subscriber gets `uri` FIRST, then the error
```

The code under test therefore ran the **success** branch on stale data, and the error branch arrived
one emission late. The second: `error()` and `complete()` close a Subject permanently, so a later
`nextWith` on that spy pushed into a dead subject and emitted nothing at all. Both are fixed —
`resetAutoSpy(spy)` now drops the subject, and a terminated one is replaced on the next
configuration. That holds for a subject a spec closed **itself**, too:
`spy.items$.returnSubject().complete()` marks the stream closed, so the next `nextWith` opens a new
one rather than disappearing.

`nextWithValues` on an observable **property** builds a new stream, which a subscriber that already
holds the old one never sees — the spec's values go nowhere and the assertion below reads the
initial state. That case is reported rather than passing silently —
`Feed.items$.nextWithValues() ran after something subscribed to Feed.items$` on a strict double, the
member name alone otherwise — once per property as a warning, and at every such call as a throw under
`setupAutoSpy({ misconfiguration: 'throw' })`. `nextWith` pushes into the subject the current
subscriber is on and is the one to reach for mid-test.

What that does **not** change: `vi.clearAllMocks()` and `clearMocks: true` still cannot reach it,
for the same reason they cannot reach a `calledWith` chain — that state lives in this library's
closures, not on the runner's mock. So when a spy outlives a test — a TestBed built in `beforeAll`,
a spy hoisted to `describe` scope — put `resetAutoSpy(spy)` in `beforeEach`. Inside one test the
sequence `nextWith(a)` then `throwWith(e)` still means "emit a, then fail"; only a reset or a
terminal call starts a new stream.

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
  lazySpies: true, // build each method spy on first access ('proxy' for very wide classes)
  returns: { getProducts: of([]) }, // what a spied METHOD answers
  selfReturning: ['where'], // a method that answers the double itself, for a chained call
  overrides: { products$: subject }, // a member that is not a method result
});
```

| Key | Semantics |
| --- | --- |
| `methodsToSpyOn` | **Additive**, as in `jest-auto-spies`. Same behaviour as `instanceMethodsToSpyOn`. |
| `onlyMethodsToSpyOn` | **Exhaustive whitelist.** Skips discovery; anything not listed is absent. |
| `instanceMethodsToSpyOn` | **Additive.** The name to prefer in new code (see below). |
| `autoSpyAccessors` | Merged with the explicit getter/setter lists. |
| `lazySpies` | Behaviour-identical; only changes _when_ each spy is built. `'proxy'` also changes _what holds the name_. |
| `strict` | Throw on a method nobody configured, instead of answering `undefined` (below). |
| `onUnstubbedCall` | The general form of `strict`; its return value becomes the call's return value. |
| `selfReturning` | The named methods answer the double itself — a default like `returns`; a name in both answers `returns`. |

**`instanceMethodsToSpyOn` is not an edge case — it is a top-5 option** (103 of ~370 spec files in
the reference suite). Method discovery walks the _prototype chain_; a callable assigned to an
**instance field** is invisible to it:

- an Angular `signal()` / `computed()` field — the dominant case in a signals codebase
- an arrow-function property — `readonly reload = (): void => {}`
- anything on an ngrx `signalStore()`, which puts **everything** on the instance
- **members Angular's own classes moved onto the instance** — `Router.currentNavigation` in
  Angular 20 is `currentNavigation = this.navigationTransitions.currentNavigation.asReadonly()`

```ts
createSpyFromClass(TaskStore, { instanceMethodsToSpyOn: ['count', 'reload'] });
provideAutoSpy(ProjectStore, { instanceMethodsToSpyOn: ['current', 'isEmpty'] });
provideAutoSpy(Router, { instanceMethodsToSpyOn: ['currentNavigation'] });
```

**The failure this produces says nothing about any of it.** The member is simply not on the spy, so
the next line reads `undefined` and configuring it throws:

```
TypeError: Cannot read properties of undefined (reading 'mockReturnValue')
```

There is no better message to be had at runtime, and it is worth saying why rather than leaving it
looking like an oversight. Instance fields do not exist until a constructor has run, and this
library never constructs the class — that is what makes a spy safe to build from a service whose
constructor talks to the network. The only alternative would be to answer an unknown member with
_something_, and that something would be truthy: `if (service.optionalThing)` in the code under test
would then take the wrong branch, silently, which is the exact failure mode the protocol deny-list
in §2 exists to remove. A loud `TypeError` on the spec's own line is the better of the two.

For an ngrx `signalStore()`, prefer `createAutoMock<T>()` over listing every member: it mocks from
the type, needs no prototype, and the list cannot fall behind the store. Its **signal** members want
`mockSignalProp`, not a method spy — a store's state is read during the first render, so a method spy
there answers `undefined` to the template.

The symptom of getting this wrong is **a spy that is never called and no warning at all**: the
additive lists exist precisely to name things the prototype does not have, so a typo in one cannot
be told apart from an instance field and stays silent.

Only `onlyMethodsToSpyOn` warns, because only a restricting list can be silently destructive — a
misspelling there leaves the real method unspied, and the code under test then calls something that
is not there:
`[vitest-auto-spy] createSpyFromClass(CartService): onlyMethodsToSpyOn names 'lod' (did you mean 'load'?), not a method of CartService.`
A name with nothing close gets `instanceMethodsToSpyOn: ['x']` as the fix instead.

Also true, and worth not re-deriving:

- **Inherited methods are spied** — discovery walks the whole chain (`Object.prototype` excluded).
- **Constructor bodies never run.** The spy is assembled from the prototype.
- **Abstract classes are accepted**, type and runtime both — `ClassType<T>` carries an abstract
  construct signature, and when the prototype turns out to be empty (abstract members are erased
  before emit) the factory hands back the `createAutoMock` proxy instead of an empty object. Do
  **not** pass a concrete subclass instead; this file used to say so, and it was wrong twice over.
- **An overloaded method is not collapsed.** The worry that `Spy<T>` types every generated
  `api-gateway` client against its last signature does not hold: a four-overload
  `ContentApiService.getItemsBySlug` types as it should, and hand-written `{ m: vi.fn() }` doubles
  for those services convert with no changes to the assertions. When the _first_ signature is the
  useful one, name it on the **declaration only** — the factory's result assigns to it, so the type
  argument is not written twice:

  ```ts
  let mapping: Spy<ContentMappingService, { overload: 'first' }>;

  mapping = createSpyFromClass(ContentMappingService); // no second type argument here
  ```

  **The symptom that leads here says nothing about overloads**, which is why the option is hard to
  find from the error. A stub of the real response shape is rejected on the spec's own line —
  `TS2345: Argument of type 'Page' is not assignable to parameter of type 'HttpEvent<Page>'` — on
  `nextWith(body)`, `resolveWith(body)`, `calledWith(…).returnValue(body)` or
  `mockReturnValue(of(body))` against a generated `observe` client. Neither the double nor the stub
  is wrong; both are being checked against the signature nobody calls. Reach for `overload`, never
  for `@ts-expect-error`: one migration wrote sixty of those across twenty-five files before anyone
  found this option, and each one stops checking the response shape that line exists to describe.

  **Name the method rather than the whole double.** `'first'` on the type moves _every_ overloaded
  member, and on a wide type that breaks the ones nobody was fixing — `Spy<Response, { overload:
'first' }>` for one method collected five `TS2769`s on `download`. `overload` also takes a map:

  ```ts
  let perf: Spy<Performance, { overload: { getEntriesByType: 'first' } }>;
  ```

  A name the type does not have never matches, so a rename leaves a dead entry rather than a red
  build. The default stays `'last'` because "the useful signature" is not decidable from the type: on
  a generated `observe` client it is the first, on a four-overload `api-gateway` client the last, and both
  live in one suite. And **overload order is not always the author's** — `declare global` in a
  third-party package appends to a global interface (`web-vitals` does exactly this to
  `Performance.getEntriesByType`), so which signature is last depends on which packages are in the
  program and can move on a dependency bump.

**A getter that returns a `Signal<T>` goes in `instanceMethodsToSpyOn`**, not in `gettersToSpyOn`.
`get isSafeMode(): Signal<boolean> { return this._isSafeMode.asReadonly(); }` is read as a property
and called as a function, and the accessor route makes you write
`accessorSpies.getters.isSafeMode.mockReturnValue(signal(false))` — two levels deeper than the value
in question. Naming it as an instance method puts a plain spy at that key (the spy object has no
class prototype, so nothing is being shadowed), and
`service.isSafeMode.mockReturnValue(false)` reads like every other member. `mockSignalProp` is the
other answer when the value has to change during the test.

### The composition belongs to the class — `registerAutoSpyDefaults`

A class is doubled the same way in every file that doubles it, so register that once instead of
repeating it:

```ts
// vitest.setup.ts, once
registerAutoSpyDefaults(Router, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] });

// every spec, from then on
provideAutoSpy(Router);
provideAutoSpy(Router, { instanceMethodsToSpyOn: ['currentNavigation'] }); // ADDS to the registration
```

The call site is **merged** into the registration, not substituted for it: lists unioned
(registration first, no repeats), `returns` / `overrides` merged key by key with the call site
winning, scalars decided by the call site when it names the key. The bare-array form counts as
`{ methodsToSpyOn: [...] }`. Registration is by class identity, so a subclass inherits nothing —
walking the prototype chain would let one registration change doubles in files nobody was looking at.
A second registration for the same class replaces the first, because two of them in one suite is the
drift this removes rather than a merge to perform. `clearAutoSpyDefaults(Class)` drops one,
`clearAutoSpyDefaults()` the lot. `createSpyFromInstance(obj)` reads the registration of the class
`obj.constructor` names, merged the same way; an object literal resolves none. One exception, because
an instance is real: when the call site lists `onlyMethodsToSpyOn`, the rest of the object stays real,
so the registration contributes only `strict`, `onUnstubbedCall`, `onUnstubbedRead` and the
`returns` / `selfReturning` entries of the listed methods — not its accessor lists, its other method
lists or its `overrides`. `registerAutoSpyDefaults(Router, { gettersToSpyOn: ['url'] })` therefore
leaves `router.url` live under `createSpyFromInstance(router, { onlyMethodsToSpyOn: ['navigateByUrl'] })`.
A `returns` or `selfReturning` name the call site itself wrote for a method it left real is reported
as a misconfiguration and skipped.

A setup file that registers more than a handful of classes can say them as one table instead of one
call each. Rows apply in order, and each is checked against **its own** class — a key `Router` does
not carry fails on that row, naming `Router`'s members and nothing else:

```ts
registerAutoSpyDefaults([
  [Router, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] }],
  [AppEventsService, { instanceMethodsToSpyOn: ['announce'] }],
  [BaseLocalStorage, { instanceMethodsToSpyOn: ['getItem', 'setItem'] }],
]);
```

A later row for a class an earlier row already named replaces it, exactly as a second call would.
`AutoSpyDefaultEntry<T>` is the row type, for a row built outside the literal.

**An `InjectionToken` is a key too — import `registerAutoSpyDefaults` from `vitest-auto-spy/angular`
for it.** Same registry, same merge; the core export takes a class only, because the core entry may
not mention Angular's types. `provideAutoSpyForToken(TOKEN)` reads the registration exactly as
`provideAutoSpy(Class)` reads a class's — both of its arguments are merged over it, and a registered
`returns` stays a default a later `calledWith` / `resolveWith` wins over:

```ts
import { registerAutoSpyDefaults } from 'vitest-auto-spy/angular';

registerAutoSpyDefaults(LOGGER, { returns: { info: undefined, err: undefined }, selfReturning: ['channel'] });
registerAutoSpyDefaults(NAVIGATION, { overrides: { activeRow$: of({}) }, returns: { setFocus: undefined } });

providers: [provideAutoSpyForToken(LOGGER), provideAutoSpyForToken(NAVIGATION, { activeRow$: rows$ })];
```

A token row holds `AutoSpyTokenDefaults<T>`: what `createAutoMock` takes (`returns`, `selfReturning`,
`observablePropsToSpyOn`, `strict`, `name`) plus `overrides`, the seeds `provideAutoSpyForToken` takes
second. Keys are checked against the token's `T`; a table may mix class rows and token rows;
`clearAutoSpyDefaults(TOKEN)` from the same entry drops one. Handing a token to the **core**
`registerAutoSpyDefaults` fails with `TS2345 … 'InjectionToken<X>' is not assignable to parameter of
type 'ClassType<unknown>'` — the fix is the import, not a cast.

**`selfReturning` names the methods that answer the double itself.** `returns` cannot say it — the
double does not exist when the literal is written — and without it a chained call dies on
`undefined`. It works on every factory and in a registration; a registered chain takes a link back out
through the call site's `returns`, since lists only ever union.

### `strict` — a method nobody configured throws instead of answering `undefined`

```ts
const users = createSpyFromClass(UserService, { strict: true });

users.load.resolveWith([]);
users.currentTenant(); // throws here, not four frames later inside the component
```

```
[vitest-auto-spy] Cart.checkout(1, 'now') was called; this strict double has nothing configured for it.
Called from src/app/cart.component.ts:41:12
Configure it in the test: cart.checkout.calledWith(1, 'now').mockReturnValue(…) for these arguments, or .mockReturnValue(…) for any — .resolveWith(…) / .nextWith(…) when it returns a Promise / Observable.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/strict-mode#the-message
```

Also on `createAutoMock`, `provideAutoSpy`, and suite-wide as `setupAutoSpy({ strict: true })` — which
reaches a double whichever bundle of the package built it: the default lives on `globalThis`. Before
this release it lived in module scope, and a setup file's `strict: true` reached no double a spec built.
Precedence, first one set wins: the double's `onUnstubbedCall` → the double's explicit **`strict: false`**
(the only way to exempt one double from a suite-wide default, a global handler included) → the global
`onUnstubbedCall` → the double's `strict: true` → the global `strict`.

- **It is not argument-level.** A `calledWith(1, 'now')` chain says the method is stubbed, so
  `checkout(9, 'later')` still answers `undefined`. Use `mustBeCalledWith` for that.
- **`returns:` is a default in the spy's own container**: a `calledWith` / `resolveWith` / `failWith`
  configured later wins for its arguments or supersedes it, every other call still gets it, and
  `undefined` counts as configured. `returns: { save: undefined }` is how a `void` call is expected.
  `selfReturning: ['channel']` is the same kind of default, and counts as configured too.
- **`mockReturnValue` / `mockImplementation` replace the dispatch**, so they never reach the guard —
  and a `calledWith` configured after them is never consulted. After the last `mockReturnValueOnce`
  the queue empties back onto the library dispatch and the next call **is** reported as unstubbed —
  seed `mockReturnValue(...)` too when a `Once` sequence is meant to run out.
- **That pair is reported, in both orders.** `mockReturnValue` after a `calledWith` erases it;
  `calledWith` after a `mockReturnValue` is dead on arrival. Neither fails on its own — the spec goes
  green on a branch nobody configured — so the library says so as a misconfiguration (warn, or throw
  under the `strict` preset). The whole family replaces: `mockImplementation`, `mockReturnValue`,
  `mockReturnThis`, `mockThrow`, `mockResolvedValue`, `mockRejectedValue`. When both a fallback and a
  per-argument value are wanted, the fallback goes in the spy's container — `returns:` where the
  double is built, or `resolveWith` / `nextWith` / `failWith` — which a `calledWith` still wins over.
  The report is this library's own spy engine's, so Vitest and Rstest have it; Bun, `node:test` and
  `setSpyEngine('runner')` do not. The `Once` family is never reported.
- **A throw something swallowed still fails the test.** Under `setupAutoSpy({ strict: true })` every
  strict throw is recorded, and one that a `try`/`catch` in the code under test or an RxJS error with
  no handler (its rethrow waits on a fake clock) kept from the test fails it after the test
  (`swallowedStrictCalls`, `'throw'` by default with `strict: true`). The report quotes each call
  with its arguments and the line that made it, and says what swallowed it — a `catch` in the code
  under test, or an RxJS subscriber with no error callback. Provoking one on purpose:
  `expect(() => cart.total()).toThrow(…)` then `expect(takeStrictViolations()).toHaveLength(1)`.
- **It does not reach** accessor spies, observable-property spies, `mockDeep` nodes, `console-spy`,
  `mockResourceProp`'s `reload` or a standalone `createFunctionSpy`. A strict double still answers
  `undefined` for an unconfigured getter or `items$`. `fillMissing` members **are** covered.
- **The getter and the stream are reported after the test instead** — a read cannot throw, because a
  failure diff that prints the double reads it. `setupAutoSpy({ unconfiguredReads: 'warn' | 'throw' })`
  (default `'off'`, not in the preset) reports a strict double's getter read that reached no
  configuration and a subscription to a stream nothing fed **by the end of the test** — subscribe in
  `beforeEach`, `nextWith` in the test is fine. Counted from setup's `beforeEach` to its `afterEach`,
  so the spec's own hooks count. Configured means `accessorSpies.getters.x.mockReturnValue(…)` /
  `mockImplementation`, `overrides: { x }` (call site or registration — a registered _list_ alone is
  not), `mockReadonlyProp`; for a stream any of `nextWith` / `throwWith` / `complete` /
  `returnSubject`. `undefined` meant: `mockReturnValue(undefined)`. `onUnstubbedRead({ className,
member, kind, count })` — suite-wide or per double, same precedence as `onUnstubbedCall` — takes the
  findings instead of the report, from every double not `strict: false`: survey with it first.
- **Angular lifecycle hooks are exempt.** `ngOnDestroy`, `ngOnInit`, `ngOnChanges`, `ngDoCheck` and the
  `ngAfter…` hooks answer `undefined` on a strict double: Angular calls `ngOnDestroy` itself on every
  provided value at teardown (a `createAutoMock` / `provideAutoSpyForToken` double always has one), and
  a throw there broke the teardown for every test after it. The calls are still recorded.
- A class instance or DOM node in the call the message quotes prints as `[ClassName]`, data up to 200
  characters per argument; `provideAutoSpyForToken` names the token (`createAutoMock` takes `name`).
- Use `onUnstubbedCall` to survey a suite before turning the throw on — it is handed
  `{ className, method, args }` and whatever it returns is what the call answers, so a handler that
  pushes to an array records the gap without failing anything.

### Getters and setters live in `accessorSpies`

```ts
const settings = createSpyFromClass(SettingsService, { gettersToSpyOn: ['theme'], settersToSpyOn: ['theme'] });

settings.accessorSpies.getters.theme.mockReturnValue('dark');
expect(settings.theme).toBe('dark'); // the property itself stays typed as `string`

settings.theme = 'light';
expect(settings.accessorSpies.setters.theme).toHaveBeenCalledWith('light');
```

**Naming one half gets you the pair, when the class declares a pair.** `gettersToSpyOn: ['theme']`
on a class with both a getter and a setter installs both spies — mirroring reads the prototype
descriptor, so it only ever adds what the class already has, and a read-only member stays read-only.
Before 3.5.0 the assignment landed on the no-op setter the scaffolding installs: the write vanished,
`accessorSpies.setters.theme` was `undefined`, and the failure read
`Cannot read properties of undefined` three steps from the configuration behind it.

The bag is typed over every key of `T` unless the lists are repeated in the options type argument —
`createSpyFromClass<Settings, { gettersToSpyOn: ['theme'] }>(Settings, { gettersToSpyOn: ['theme'] })`
keys both halves by exactly the configured names, so `accessorSpies.setters.other` is a compile error
instead of an `undefined` at run time. Use it when a spec reaches into the bag by name; a
non-literal `string[]` falls back to the every-key bag.

Only spy a getter when the spec asserts that it was **read**. To make one _answer_ something, on a
spy that already exists, the pair above is one line — and it needs no `gettersToSpyOn` at the
factory, which is the part that is otherwise found by trial:

```ts
mockReadonlyProp(settings, 'theme', 'dark'); // no gettersToSpyOn, no accessorSpies
```

For a signal-valued property that is not merely convenience: a spied getter answers `undefined`
until it is configured, while `mockReadonlyProp(component, 'items', signal([]))` keeps every
`computed()` and `effect()` downstream of it reactive (§9).

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

`expect()` inside a `subscribe()` callback is the classic green-but-empty test: if the stream never
emits, the callback never runs and nothing is asserted. Invert it — **the assertion is the `await`**:

```ts
import { expectAllEmissions, expectCompletion, expectEmission, expectEmissions, expectError, expectNoEmission } from 'vitest-auto-spy';

await expect(expectEmission(component.visible$)).resolves.toBe(true); // the first VALUE, not a list
await expect(expectEmission(tasks$)).resolves.toEqual({ id: 1 }); // the task itself, not `[task]`
await expect(expectEmissions(source$, 3)).resolves.toEqual([1, 2, 3]); // the list is this one
await expectNoEmission(source$, { timeout: 50 });
await expectCompletion(service.purgeCache()); // "it finished" — the value is not the point
await expect(expectAllEmissions(source$)).resolves.toEqual([1, 2]); // every value, and none after
```

Options: `{ timeout, label }`. `timeout` defaults to `1000` ms (`0` for `expectNoEmission`, whose
wait is a quiet window rather than a watchdog). `0` and `Infinity` both mean **no watchdog** — the
wait then runs to the runner's own test timeout, which is the trade. The source is duck-typed, so rxjs `Observable`s,
`Subject`s, Angular `toObservable()` results, Angular `output()` (`OutputEmitterRef`, whose
`subscribe` takes a bare callback) and hand-rolled subscribables all work — and every helper infers
the emitted type, so `expectEmission(of(1))` is a `Promise<number>`.

**A `void` stream calls its listener with one argument, `undefined`.** `output<void>().emit()` and
`Subject<void>.next()` both do, so a `vi.fn()` subscribed to one records `[undefined]`, and
`expect(listener).toHaveBeenCalledExactlyOnceWith()` fails on `[] vs [undefined]` — the form a
`prefer-called-with` autofix used to write. The assertion is the emission itself:
`await expect(expectEmission(component.closed)).resolves.toBeUndefined()`, or
`subscribeSpyTo(subject$).getValuesLength()` to count. A listener kept anyway is typed
`vi.fn<() => void>()` (`(value: void) => void` trips `no-invalid-void-type`) and asserted
`toHaveBeenCalledExactlyOnceWith(undefined)`.

`expectCompletion` is the one to reach for on a stream whose value is not the point — a save, a
purge, an `Observable<void>`, a `Subject` a teardown closes. `firstValueFrom` rejects such a stream
with rxjs's `EmptyError`, and the workaround people arrive at,
`lastValueFrom(x, { defaultValue: undefined })`, reads as though the default were the interesting
part. Emissions do not fail it: it asserts termination, nothing about what came before.

**To assert that production code pushed into a stream, do not use `observablePropsToSpyOn`.** That
option points the other way: it gives the spec `nextWith` so it can _feed_ the double. When the
question is whether the code under test called `next` on a property, the double needs a real
`Subject` and a spy on its method:

```ts
const forceRequery$ = new Subject<number>();

mockValueProp(state, 'reloadAndSeekTo$', forceRequery$);
const next = spyOnOwnMethod(forceRequery$, 'next');

service.seek(1000);
expect(next).toHaveBeenCalledWith(1000);
```

`spyOnOwnMethod` is the same record-and-call-through a bare `vi.spyOn` gives, and it is the form to
reach for when a preset bans `vi.spyOn` outright (`no-restricted-properties`): the emission still
reaches subscribers, because the real `next` runs.

`Spy<T>` types an Observable property as `AddObservableSpyMethods<O> & T[K]`, so `next` is there on
the type either way — which is exactly why this is worth saying: the code compiles against the spy
surface and asserts nothing.

**When the error _is_ the assertion, use `expectError`.** The other helpers wrap a stream failure in
a new `Error` whose message names the stream — right for reporting an unexpected failure, useless
when the failure is the subject. `expectError` resolves _with_ the error, exactly as it was thrown:

```ts
await expect(expectError(service.load())).resolves.toBe(originalError);
expect(await expectError(process$)).toBeInstanceOf(UpstreamStatusError);
expect((await expectError(account$)) as Error).toHaveProperty('message', 'websso fail');
```

It waits for the error however late it arrives, and fails — naming the stream — if the stream
completes or stays quiet instead. The wrapped failures of the other helpers now also carry the
original on `cause`, so `rejects.toMatchObject({ cause: original })` works; prefer `expectError`,
which needs no unwrapping. `firstValueFrom(source$).rejects` remains fine too.

**Which emission counts** — `skip` and `until`, for the stream whose first value is always stale:

```ts
await expect(expectEmission(isXl$, { skip: 1 })).resolves.toBe(true); // a shareReplay / BehaviorSubject
await expect(expectEmission(currentParams$, { until: (p) => p.channelId === expected })).resolves.toEqual(…);
```

Both say in the assertion what `source$.pipe(skip(1))` / `pipe(filter(…))` say in the source, and
they keep the diagnosis: emissions that do not match are still counted, so a failure reads
`4 emission(s) received` rather than `0` and tells "the wrong thing fired" apart from "nothing
fired".

**`advance` closes the window between subscribing and awaiting.** A stream driven by a
`debounceTime`, a retry or a poll needs the clock moved _after_ something is listening, and `await`
gives control away before the next statement runs:

```ts
await expect(expectEmission(purchased$, { advance: () => vi.runAllTimers() })).resolves.toBe(false);
```

That replaces the fragile shape people arrive at — hold the promise, advance, then await — which
breaks silently the moment somebody adds an `await` one line above it. It is a callback rather than
an `advanceTimers: true` flag because these helpers are in the core entry, which contains no test
runner: only the spec knows whether it is on `vi`, `bun:test` or `node:test`. A throw out of
`advance` — or out of an `until` predicate — is reported as itself and tears the subscription down,
rather than being lost while the wait runs on to the timeout.

**These helpers subscribe as a subscriber, so a synchronous source stops at the value that settles
the wait.** `expectEmission(from([1, 2, 3]).pipe(tap(spy)))` calls `tap` once, not three times, so
`expect(spy).toHaveBeenCalledTimes(1)` is honest and a `finalize` runs at the stop; before, the
producer ran to completion before anything could unsubscribe, and an endless synchronous source
(`of(1).pipe(repeat())`) hung the worker instead of resolving. `expectEmissions(source$, 3)` stops
at the third. A source that cannot be subscribed to at all is reported by name now, with a separate
hint when what was passed is a promise.

`expectEmissions(source$, 0)` throws at the call — a count below 1 is not something a stream can
satisfy, and the message names `expectNoEmission` instead. A suite that wrote
`expectEmissions(s, expected.length)` with an empty expectation is the one this changes.

**The watchdog runs on real time, on purpose — even under fake timers, and even under zone.js.** A
virtual one would race the timers the spec advances: `expectEmission(source$, { timeout: 200 })`
followed by `vi.advanceTimersByTime(5_000)` would fire at 200 virtual ms and reject the stream the
spec was about to advance into. Inside `fakeAsync` that used to happen anyway, because zone.js
patches the global `setTimeout` and the watchdog was scheduled onto the virtual queue: a
`tick(1_500)` towards a `debounceTime(2_000)` rejected the wait it was advancing. The timer is taken
from `__zone_symbol__setTimeout` now, so it is outside the zone and `tick()` cannot reach it.

The cost is that in a suite with global fake timers a _failing_ assertion spends a real second. Do
**not** answer that with `{ timeout: 0 }` at every call site — that disables the watchdog, and the
next silent stream hangs to the runner's own timeout with nothing useful in the message. Lower the
default once instead:

```ts
// vitest.setup.ts
import { setEmissionTimeout } from 'vitest-auto-spy';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ globalFakeTimers: true });
setEmissionTimeout(100); // the clock is frozen; a real second buys nothing
```

`setEmissionTimeout` takes `0` (no watchdog) and `Infinity` (the same), and **throws** on `NaN` and
on a negative number rather than installing a default that fails every wait. The commonest way to
reach it is arithmetic: `setEmissionTimeout(Number(process.env.EMISSION_TIMEOUT))` with the variable
unset.

**The code frame these failures open is the spec line, not this package.** The helpers build their
error inside a `subscribe` or timer callback, so the stack is captured at helper entry and pinned on
when the failure is finally built; only errors these helpers make themselves are re-anchored, and
the error `expectError` resolves with keeps the stack of the code under test. Do not wrap them in
`vi.defineHelper` — its `__VITEST_HELPER__` frame lands last and Vitest then drops the stack whole.

**`expectEmission` subscribes when you call it, not when you await it**, and that is load-bearing
rather than an implementation detail. It is what converts the test whose source has to be poked
_after_ somebody is listening — a router event, a `Subject` the spec pushes into, anything that
does not replay:

```ts
const breadcrumbs = expectEmission(service.buildDynamicBreadcrumbs({ root })); // subscribed already

router.events.nextWith(navigationEnd); // …so this emission is not missed

await expect(breadcrumbs).resolves.toEqual([…]);
```

`firstValueFrom` cannot do this half: it also subscribes eagerly, but there is nowhere to put the
line that triggers the source, because the `await` is the same statement as the subscription — so
the test deadlocks against a source that only emits once something pokes it. Hold the promise
first, poke, then await.

### `createLog()` — the order between the spies

```ts
const log = createLog<'drop-cache' | 'flush-telemetry' | 'stop-engine'>();

engine.onShutdown(log.fn('drop-cache'));
engine.onShutdown(log.fn('stop-engine'));
engine.onShutdown(log.fn('flush-telemetry'));

engine.shutdown();

expect(log.result()).toBe('drop-cache; flush-telemetry; stop-engine'); // fails with the real order
```

Emission helpers answer a sequence _within one source_. The order of calls **across** collaborators
is the gap `toHaveBeenCalled` papers over — three green checks that would accept the sequence
backwards — and `toHaveBeenCalledBefore` covers pairwise. One journal the code under test writes into
(`add`, `fn(value)` for a labelled callback, `clear`, `items`, `result()`) makes the sequence a
single comparable value; `T` is a string union so a step nobody declared is a compile error. In
Angular, provide it and let the component report its own lifecycle:
`providers: [{ provide: PANEL_LOG, useValue: log }]`. Ported from Angular's own `Log`, which the
framework keeps three copies of.

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

**They work on `createAutoMock` and `mockDeep` doubles too** — which they did not until 3.5.0.
Both are Proxies, all four helpers are built on `Object.defineProperty`, and neither Proxy trapped
it: the patch landed on the Proxy's own target, the `get` trap never looked there, nothing threw,
and the test carried on reading the old value. If you have seen a spec build a double by hand —
real getters plus a `createFunctionSpy` per method — this is usually why.

**The second overload is a normal tool, not a last resort.** Each helper has a checked overload
(`K extends keyof T`) and a `(object, property: PropertyKey, value: unknown)` one behind it, and
the JSDoc calls the latter the one for members the public type does not describe. In practice it
carries about half of the real calls, all of them legitimate. It cannot reach a JS `#private` field —
no property key can — and `'x' as keyof T` over one patches a new, unrelated key that nothing reads:

```ts
mockValueProp(router, 'routerState', { snapshot: { url: '/home' } }); // a partial fixture of a fat type
mockValueProp(window, 'AudioContext', undefined); // "this platform does not ship the API"
mockValueProp(transitionEvent, 'propertyName', 'opacity'); // a field a synthetic DOM event lacks
mockValueProp(spy, 'products$', new Subject()); // a member the double does not have at all
```

The last one is worth knowing on its own: patching a key the object never had **works and is undone
correctly** — the journal records the _absence_ of a descriptor and puts it back by deleting the
property. That is how you add an Observable member that `provideAutoSpy` did not create because
`observablePropsToSpyOn` was not passed.

What the second overload costs is the property-name check, so a typo in the name compiles. Nothing
checks the _value_ on either overload; that is deliberate, and the partial fixture above is why.

**A read the constructor does cannot be seeded by any of these.** They patch an object that already
exists, so the earliest they can run is after the double is built — and a component that reads
`service.paymentParams.offer` in a field initializer or in its constructor has already read it by the
time `TestBed.createComponent` returns:

```ts
fixture = TestBed.createComponent(PaymentComponent); // ← TypeError thrown here, inside the component
mockReadonlyProp(paymentService, 'paymentParams', params); // never reached
```

Nothing warns, because nothing of this library runs: the throw is a plain `TypeError` from the
component's own line, and the stack names the component rather than the seeding that is missing. The
only place early enough is the registration:

```ts
providers: [provideAutoSpy(PaymentService, { overrides: { paymentParams: params } })];
providers: [provideAutoSpyForToken(STATE_TOKEN, { snapshot })]; // a token's second argument does the same
```

Three migration shards found this independently, each of them after the failure had pointed at the
service. A `mock*Prop` after the render is right for everything a template or a method reads later —
which is most of them — and wrong only for a constructor-time read.

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

Under Jest these were hard to tell apart; under Vitest with a real bundler they are four separate
mechanisms, and a test that waits on the wrong one fails with a message that names none of them.

| What is pending | What drives it | What does **not** |
| --- | --- | --- |
| change detection | `fixture.detectChanges()` | anything `await`ed |
| effects + `afterNextRender` + CD | `await stable(fixture)` (`…/angular`) | `detectChanges()` alone |
| timers, debounces, polling | `await advanceTimers(ms)` (`…/setup`) | `await Promise.resolve()` |
| a dynamic `import()`, native `async` in a dep | `await flushEventLoop()` / `settleDynamicImport()` | `tick()`, `flushMicrotasks()`, microtasks |
| an `httpResource()` / `resource()` / `rxResource` | `await settleResource(r)` (`…/angular`) | `flushEventLoopUntil` — it never ticks |

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

**`stable()` and `flushEffects()` are not zoneless-only, and their tick runs inside the `NgZone` so
that they are not.** `TestBed.createComponent` builds the component inside `ngZone.run(…)`, so an
`effect()` its constructor registers records the zone's inner zone as its own. A bare `TestBed.tick()`
from a test body runs in the runner's zone, so Angular hops back into the recorded one to run a
**dirty** effect, and leaving that hop takes the zone from unstable to stable.
`provideZoneChangeDetection()` — which `@angular/build:unit-test` installs for every suite that loads
zone.js — answers `NgZone.onMicrotaskEmpty` with `ApplicationRef._tick()`, guarded against its own
scheduler but not against `ApplicationRef._runningTick`, so the tick already on the stack is
re-entered: `NG0101: ApplicationRef.tick is called recursively`. Angular hands that to `ErrorHandler`
instead of throwing it at the call site, so a suite that does not fail on console output stays green
with the change detection it asked for unfinished. Measured on an Angular 22 suite of 1771 spec files:
451 `componentRef.setInput` calls rewritten to `setInputs` turned **57 green files red** on `NG0101`,
and none of them after the tick moved inside the zone. Under zoneless `NgZone` is a `NoopNgZone` whose
`run` is a straight call, so it costs nothing there. One thing is genuinely new for a zone-based
consumer: leaving the zone reports it stable, so the same subscriber ticks once more — counted on
`ApplicationRef.afterTick`, one `flushEffects()` is 1 → 2 application ticks, which is what
`fixture.detectChanges()` has always done in the same position. Do not "simplify" either helper back
to a bare `TestBed.tick()`; `src/zone-tests/stable.zone-test.ts` is the guard.

`flushEventLoopUntil(isDone, { turns, label })` is the same thing with a condition and a budget —
for a chunk becoming reachable, an SDK reporting itself ready, a queue draining. Use it instead of a
hand-tuned turn count: the count depends on the dependency, not on the spec, and a condition that
never holds fails naming the `label` rather than hanging until the runner's timeout. For real I/O —
a socket round-trip, a child process — pass `{ timeoutMs, label }` instead of `turns`: it polls the
real clock every 10 ms, unaffected by fake timers, and replaces a hand-rolled `waitFor(predicate, ms)`.

**Not for an Angular `resource()` / `httpResource()`.** Those need a change-detection _tick_, and
this helper only takes event-loop turns — a resource awaited through it finishes the whole budget
having issued zero requests. `settleResource(resource, { turns, label, allowIdle })` from
`vitest-auto-spy/angular` is that wait.

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

**Static members are opt-in — `createSpyClass(Class, config, { statics: true })`.** Production code
that reaches the class rather than an instance (`BackgroundWorker.isSupported()`,
`Client.fromToken(t)`, a `VERSION` constant) finds nothing on the double otherwise, and the failure
is a `TypeError` on the class, not on the spy:

```ts
const WorkerSpy = createSpyClass(BackgroundWorker, undefined, { statics: true });

WorkerSpy.isSupported.mockReturnValue(true); // needs a cast — see below
```

What the option copies, walking the class's own prototype chain so inherited statics come too: a
static **function** becomes a full spy of its own, a static **data member** is copied by value, and a
static **accessor** is skipped and never evaluated — a getter that reads configuration or touches the
network must not run because a double was built. `prototype`, `length`, `name`, `caller`,
`arguments` and the double's own `calls` / `instances` are never overwritten. It is off by default
for that last reason: a class with a static named `calls` would otherwise shadow the construction
log. **The statics are not typed** — the return type is still `ConstructorSpy<T>`, so reading one
needs a cast at the spec; type them and this note goes.

For the three observers, prefer the purpose-built stubs (§13). For a `Worker` the code builds with
`new Worker(new URL(…, import.meta.url))`, prefer `stubWorker({ respond })` from `/dom-stubs`: an
`EventTarget` whose listeners all receive the reply, answered on a microtask after `postMessage`
returns, with `last.messages`, `last.emit(data)` and `last.fail(error)` on the handle. For `AbortController` — which breaks
in a jsdom run for a reason involving none of the three parties in the stack trace — use
`stubAbortController()`.

The stub carries `AbortSignal.abort()`, `AbortSignal.timeout()` and `AbortSignal.any()` as well —
the three statics are how modern code makes a signal without a controller, `fetch(url, { signal:
AbortSignal.timeout(5_000) })` most of all. `timeout()` aborts through `setTimeout`, so
`vi.useFakeTimers()` drives it exactly as it drives the platform's, and it aborts with a
`TimeoutError` rather than an `AbortError` because that is the distinction the platform draws. A
signal's `reason` is the platform's `DOMException`, so code branching on
`signal.reason.name === 'AbortError'` takes the same branch it takes in a browser.

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
media.set(video, { ended: true }); // → pause, then ended — and the element is paused
expect(media.play).toHaveBeenCalledTimes(1);
```

State is per element, so an ad and the content report different durations — and per **install**, so
an element held in module scope or left in the document under `isolate: false` takes the new
install's `duration` rather than the previous one's. `set({ ended: true })` pauses the element and
fires `pause` before `ended`, as the platform does: an element that is both ended and playing is a
state no browser produces, and a player listening for `pause` was never told.

`currentTime` is a get/set pair, so a player restarting itself with `video.currentTime = 0` reaches
the record and fires `timeupdate` too — `media.set()` is not the only way in, and the component's own
handler runs where it used to stay unrun while the assertion read the new value.

### `localStorage` and `sessionStorage`

Do not write a `TestingStorage` class per project. `stubWebStorage()` installs an in-memory `Storage`
for this test — `getItem` / `setItem` / `removeItem` / `clear` / `key` / `length`, string coercion
as the platform does it — and `snapshot()` is the plain record to assert on:

```ts
import { type WebStorageStub, stubWebStorage } from 'vitest-auto-spy/dom-stubs';

let local: WebStorageStub;

beforeEach(() => {
  local = stubWebStorage('localStorage', { items: { token: 'abc' } }); // or 'sessionStorage'
});

it('forgets the token on logout', () => {
  session.logout();
  expect(local.snapshot()).toEqual({});
});
```

Writes in the middle of a test go through `.storage`, the installed `Storage` itself:
`local.storage.setItem('token', 'xyz')`. The stub is not a `Storage`; `local.setItem` is a `TS2339`.

It goes through `mockValueProp`, so `restoreMockedProps()` (and `setupAutoSpy()` between tests) puts
the previous storage back; install it in `beforeEach`. It also lands on `document.defaultView` when
that is a separate object. It is not `restoreWebStorage()`: that one repairs a broken environment
once and leaves a working storage alone; this one replaces whatever is there, for one test, and
installs even in a `node` environment because the spec asked for it. Named-property access
(`localStorage.token`, `Object.keys(localStorage)`) does not see the items — read through the API.

### Animation frames and element boxes

Do not assign `window.requestAnimationFrame` by hand, and do not stub `getBoundingClientRect` with a
partial literal. Both have a stub on `/dom-stubs`:

```ts
import { stubAnimationFrame, stubElementRect } from 'vitest-auto-spy/dom-stubs';

beforeEach(() => {
  stubAnimationFrame(); // 'immediate': the callback runs before requestAnimationFrame returns
  stubElementRect(container, { width: 800, height: 600 }); // x / y default to 0
});

it('scrolls after the next frame', () => {
  const frames = stubAnimationFrame({ mode: 'queued' });

  list.scrollToSelected();
  expect(frames.pending).toBe(1);

  frames.flush(); // one frame; the timestamp defaults to performance.now()
  expect(list.scrolled).toBe(true);
});
```

`stubAnimationFrame` stubs `cancelAnimationFrame` too, and hands both spies back as
`frames.requestAnimationFrame` / `frames.cancelAnimationFrame`. A frame requested from inside a
running frame is queued in either mode, so a loop that requests its own next frame advances one step
per `flush()`. A callback that throws stops `flush()` (or propagates out of `requestAnimationFrame`
in `'immediate'` mode); pass `onError: (error) => { … }` to intercept it instead — rethrow from
inside to keep the default for an error you did not mean to swallow. `stubElementRect` returns a real
`DOMRect` per call, edges derived, plus the installed spy as `.getBoundingClientRect` for
`expect(stub.getBoundingClientRect).toHaveBeenCalled()`, and the return value is still callable as the
undo. The box is the spy's creation implementation, so `vi.resetAllMocks()` / `mockReset()` mid-test
keeps it on both spy engines; Bun's `mockReset()` drops it (re-stub after a reset there). Both go through `mockValueProp`, so `restoreMockedProps()` (and `setupAutoSpy()` between tests)
takes them off; `frames.restore()` does it sooner.

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

A factory that spells out its own `default` **keeps it** — `moduleNamespace({ default: dayjsStub, utc })`
gives the probing dependency `dayjsStub`, where it used to be replaced by the namespace itself and
the default export silently became the wrong object. Only a factory without one gets
`default: <the namespace>`, which is the interop shape it was there for; the return type follows.

A factory's `vi.fn()` comes back typed as the real function, without `calledWith` or `resolveWith`.
`adoptMock` takes it over in place — same object, history kept, typed from the export's signature —
and an unconfigured call keeps answering what the mock answered before:

```ts
import { loadUser } from './api';

vi.mock('./api', () => ({ loadUser: vi.fn() }));
adoptMock(loadUser).calledWith(7).resolveWith({ id: 7, name: 'Ada' });
```

To keep the real module and configure one case, spy it through:
`vi.mock('./api', async (importOriginal) => moduleNamespace(await importOriginal(), { passthrough: true }))`.
Every function export runs for real and is recorded until configured; classes and values stay real;
calls one export makes to another inside the module are not recorded. A `vi.spyOn` / `{ spy: true }`
mock calls an original it does not report, so adopting it makes an unconfigured call answer
`undefined`; `node:test`'s `mock.fn()` is refused.

There is no `mockModule(…)` helper here, and there cannot be: Vitest hoists the literal `vi.mock`
call, so a wrapper around it would be hoisted as a call to a function that does not exist yet. Share
a fixture between the factory and the tests with `vi.hoisted()`.

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

```ts
// NestJS
import { createNestUnit, injectSpy, provideAutoSpy } from 'vitest-auto-spy/nestjs';
const moduleRef = await Test.createTestingModule({ providers: [provideAutoSpy(MyService)] }).compile();
const spy = injectSpy(moduleRef, MyService);
// or no module at all: the unit built from its DI metadata, every unprovided token spied
const { unit, spies } = createNestUnit(CartService, { expose: [PricingService], providers: [{ provide: 'CONFIG', useValue: cfg }] });
spies.get(TaxService).rate.mockReturnValue(0.2); // spies.get refuses a token the unit never asked for, and an exposed class
spies.autoSpiedTokens(); // what nothing provided — the list the refusal message prints; spies.exposedTokens() is what `expose` actually built
// needs what Nest needs: emitDecoratorMetadata (tsc / SWC, not esbuild) and reflect-metadata loaded first

// Vue / Pinia — provideAutoSpy(token, Class, methodsOrConfig?) returns a `global.provide` map
import { provideAutoSpy } from 'vitest-auto-spy/vue';
const provide = provideAutoSpy(UserServiceKey, UserService);
provide[UserServiceKey].getName.mockReturnValue('Ada');
mount(Greeting, { global: { provide } });
// a setup-store (`defineStore('x', () => …)`) is not a class — use createAutoMock<T>() there

// React / Svelte — the core API, re-exported with the right adapter registered
import { createSpyFromClass } from 'vitest-auto-spy/react';
```

Console spies — `installConsoleSpies()` replaces `console.debug` / `error` / `info` / `log` / `time` /
`timeEnd` / `trace` / `warn` with silent typed spies, named `console<Method>Spy`. Install them per test
and take them off after it:

```ts
import { type ConsoleSpies, installConsoleSpies, restoreConsole } from 'vitest-auto-spy/console';

let consoleSpies: ConsoleSpies;

beforeEach(() => {
  consoleSpies = installConsoleSpies();
});
afterEach(() => restoreConsole());

expect(consoleSpies.consoleInfoSpy).toHaveBeenCalledWith('done'); // the output is silenced, not printed
```

The exported `consoleInfoSpy` & co. are the same objects; `restoreConsole()` keeps them and clears
their calls. **Do not rely on the import to install them**: it does so once per worker, so under
`isolate: false` the spies go on in whichever file imported them first and silence every later file
(`no-import-time-console-spies` reports it). Under `setupAutoSpy({ strayConsole })` the import installs
nothing at all.

The spies survive `vi.resetModules()`. A fresh copy of the module used to record the previous copy's
spy as "the real `console.warn`", after which `restoreConsole()` installed that dead spy for the rest
of the worker and every log from then on went nowhere. The real methods are kept on one shared table
and a spy of another copy is refused as an original.

Import your runtime entry (`…/bun`, `…/node`) **before** `…/console`, or it registers the Vitest
adapter. Prefer not to touch the real global? `createAutoMock<Console>()` gives a detached one.

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

---

## 19. Before you report success

Run what the project actually has — check its `package.json` first.

```bash
npx vitest run path/to/file.spec.ts   # or: bun test path/to/file.test.ts
npx tsc --noEmit                      # Spy<T> mistakes are compile errors, not runtime ones
npx vitest-auto-spy doctor            # suite-level defects that never fail a run
```

**If you are an agent, add `--reporter=agent`** (Vitest 4.1). It is Vitest's own reporter, added for
exactly this: the same failures, without the passing-test roll call and the repeated banners that
make a run's output expensive to read and expensive to carry.

```bash
npx vitest run --reporter=agent path/to/file.spec.ts
```

Type errors matter here more than usual: most of this library's guarantees are type-level, so a
suite that runs green but does not type-check is not done.

`doctor` is read-only and finds what a green run cannot: a `tsconfig` `include` pattern that
matches no file (so it type-checks nothing while `tsc --noEmit` still reports success), a
production module importing a `*.spec.ts`, a spec importing another spec, a `@jest-environment`
pragma the runner never reads, configuration left behind for a runner that is gone, and a setup
file an Angular or Nx unit-test target never runs because the target does not name it. Three of
its checks are about coverage, where the run is green and the report is simply not the one the
config describes — `coverage.all` on a Vitest that stopped reading the key, a source-only
`coverage.include` in a runner config over a bundle, and a scope so large that `picomatch`
recompiling it per file costs more than collecting the coverage does. Two are about the Angular
builder's version: `@angular/build` in `[22.1.5, 22.1.7)` (`angular-build-splitting-off`), and an
`@analogjs/vite-plugin-angular` below 2.7.5 next to `@angular/build` 22.2 or newer
(`analog-behind-angular-build`), which dies at startup with `TypeError: cache.has is not a function`.
Five are about Vitest 5. On Vitest 5, `vitest-5-removed` reports what it took away and the run now
trips over — an import from `vitest/reporters`, `vitest/coverage`, `vitest/environments`,
`vitest/snapshot`, `vitest/runners`, `vitest/suite` or `vitest/mocker`, a `.sequential` chain,
`--outputJson`/`--compare` in a script — as errors; on Vitest 4 the same lines are upgrade notes.
`poolOptions` on Vitest 4 or newer is a warning, because Vitest runs without every option inside it.
`vitest-5-deprecated` names the two renamed programmatic calls nothing warns about. `vitest-5-clear-mocks`
says `clearMocks: true` restates the Vitest 5 default, and tells a Vitest 4 suite that never set it
to price the change with `npx vitest run --clearMocks` first. `vitest-5-available` tells a Vitest 4
repository what the upgrade buys — or names what holds it back: `@angular/build` below 22.2.0 beside
a unit-test target, Analog below 2.7.5, `vite` below 6.4, or Node below 22.12 in `.nvmrc`,
`.node-version`, CI or a private package's `engines`. `fs-module-cache-not-persisted` warns when
`fsModuleCache` is on and no CI config caches its directory. Renamed config keys Vitest 5 still
honours (`experimental.fsModuleCache`, `browser.isolate`, `cache.dir`, …) are left to Vitest's own
deprecation line.
It is worth one run after any large edit to a test suite — especially after a codemod, which is where
the eaten glob below came from.

Two of its checks are about this package's own names. `helper-from-wrong-entry` catches a named
import taken from an entry that does not export it — `provideAutoSpy` from the root rather than
`/angular` or `/nestjs`, `expectRequest` from anywhere but `/angular-http`. It reads both directions
of the 5.21.0 Angular split — one of the thirty-two moved names still taken from `/angular`, and a
core name taken from `/angular/diagnostics`, `/angular/doubles` or `/angular/matchers`, which export
none of them — which makes it what fails that upgrade rather than a compiler: a repository green on
5.20.0 exits 1 here with no test run, and the fix line names the companion to move to.
`no-unawaited-helper`
catches an `expectEmission` / `expectError` / `stable` / `flushEventLoop` called as a bare statement
and dropped, so the promise settles after the test ended and its assertion reports into a later test
or nowhere. Both resolve the name against a table **generated from this package's own `exports`
map**, which is why they are `doctor` checks and not lint rules: a per-file linter has none. Both
are conservative — the callee must have been imported from this package in that same file (a rename
with `as` still counts), the call must both begin and end a statement, and the pair goes quiet when
the installed major differs from the table's. Neither has a fixer; `doctor` still never writes.
Full reference: <https://asdalexey.github.io/vitest-auto-spy/utilities/cli>.

**Three things about the CLI that decide whether its answer means anything:**

- **An unknown flag is refused, exit 2, nothing runs.** `init --dryrun` used to write the files and
  `perf --gat` used to pass with no gate at all — a typo in CI that read as a clean result. The two
  stderr lines name the flag and list what the command accepts; `--cwd`, `--help` and `--version`
  work everywhere.
- **The scan does not descend into a nested repository or a git worktree.** A tree carrying
  worktrees under it listed every file twice, so `doctor` reported each import graph in duplicate and
  `codemod --write` would have rewritten specs on another branch. A `.git` entry is a stop, whether
  it is a directory (a nested clone) or a file (a worktree). Directories git ignores are skipped too
  — every `.gitignore` from the scan root down, `.git/info/exclude` and the per-user
  `core.excludesFile`, directories only, so an ignored file is still listed. Past 50 000 files the scan still
  truncates, and `doctor` reports that as a `scan-cap-reached` warning (exit 1) rather than a clean
  result; `VITEST_AUTO_SPY_SCAN_CAP` raises the cap.
- **A path that matches no file is an error, exit 2.** _Nothing left to migrate_ off a path nobody
  read is not a clean result. Absolute paths and `./`-style ones resolve against `--cwd`.

Exit codes, as the commands implement them: **0** is "ran, nothing to report"; **1** is "ran, and
here is the finding" — `doctor` with an error, `init --check` with a stale block, `codemod` with any
note, `perf --gate` over budget; **2** is "there was nothing to judge" — no command, an unknown
command, an unknown flag, a flag value it cannot use (an `--min-severity` word it does not know, a
number flag given a word or a negative number, a value flag with nothing after it, an `--ignore` id
`doctor` has no check for), an unreadable `--only` / `--from` value, a path matching no file, and a
`perf` run that measured nothing (including a red suite, which the gate will not judge at all). An
invalid flag value stops the command before it does anything: the message says so (`Nothing ran.`),
and a typo in a command, a flag, `--only` or `--ignore` gets a `Did you mean`.

**Reading the output from a script: `--format json`**, on `doctor` and on `perf`. One JSON document
on stdout — `schema`, `exitCode`, `tally` (`errors`, `warnings`, `notes`), every finding with
`check`, `severity`, `file`, `message`, `fix`; `perf` adds `run` (with `slowestFiles`, the `--top` slowest files per phase), `budgets` and `gate.verdicts` (one row
per candidate, `outcome` one of `confirmed`, `not reproduced`, `unconfirmed`, `single reading`,
`over budget`). Parse that rather than the text: the text is wrapped to the terminal (80 columns in a
pipe), groups one cause found in many files into one block, and ends in a tally line that starts
with `N errors, N warnings, N notes`. In the text, every finding ends in a `Docs:` line — its own
section of the CLI page (`utilities/cli#<check-id>`), or of the codemod page for a codemod note. `--format markdown` renders the same document as tables — for a
merge request note or a job summary, not for parsing.

**`doctor --ignore <check,…>`** leaves the named checks out of the report, the tally, the exit code
and the `--code-quality` file. Use it only for a finding the repository has answered in a way
`doctor` cannot see — `no-agent-instructions` in CI where the instruction files are kept out of git,
`angular-build-splitting-off` under a patched builder. An id `doctor` has no check for is exit 2,
with the closest id suggested. `--min-severity` hides findings from the text
only; `--ignore` removes them.

### If you were asked why a suite is slow

```bash
npx vitest-auto-spy perf              # runs the suite once and reports; exits 0 without --gate
npx vitest-auto-spy perf src/some/dir # a path is passed through to Vitest as a file filter
```

It reads Vitest's own per-file phase timings through `TestModule.diagnostic()` — nothing here
parses terminal output — and reports six phases: `environment`, `import`, `tests`, `setup`,
`prepare` (all measured per file) and `transform` (measured once for the whole run before Vitest 5,
per file on 5, where it is the wait for Vite's transforms and `import`/`setup` are net of it). **The phase
totals are CPU time summed across every worker, not wall clock** — a report showing `20.29s of CPU
time` under `986ms wall clock` is not a bug, it is the work spread over workers.

When `environment` dominates, the `perf-environment` finding names spec files that could run under
the `node` environment instead — but only the ones it could _prove_ reach no DOM: the spec, its
configured setup files, and every repository module any of them imports were all read, none
mentions a DOM name, and every package they import is on a short allowlist (`vitest`, `rxjs`,
`date-fns`, `lodash`, `zod`, …). Anything it could not resolve is reported **undecided**, never
assumed safe — do not treat an undecided file as a candidate, and do not add packages to that list
yourself; a false positive breaks someone's suite on `document is not defined`. When `import`
dominates, `perf-import` names specs that reach their subject through a barrel (`index`/`public-api`
re-exporting a whole directory). When `environment` + `setup` + `prepare` together dominate,
`perf-isolation` suggests `isolate: false` in the config it names, kept only if peak memory stays
acceptable; its `Docs:` line leads to the check's section of the CLI page, which links this
package's own memory measurements of that trade — read them before recommending the flag, since it
raises peak memory.

Two more findings are about settings rather than files. `perf-environment-engine` fires when
`environment` dominates and a `vite(st).config.*` names `jsdom` while nothing in those configs
mentions `happy-dom`: measured on this package's own 117-file Angular suite, `happy-dom` is 23.2 s of
user CPU against jsdom's 26.5 s, and on a spec that builds a DOM and does nothing else the gap is
253 ms against 119 ms per file. It is a swap, not a flag — `happy-dom` implements less of the
platform — so take one project at a time; the finding names the config that sets `jsdom`, and the
numbers stay in the docs section. `perf-workers` fires on a run over a minute of summed CPU
that declares no `maxWorkers`, and it is the one finding here about **memory**: one worker per core
is the default, resident memory measured at 1.42 GB plus ~155 MB per worker, and a cap of four costs
about 2.8 % of wall clock. The finding itself counts this machine's cores
(`os.availableParallelism()`) and suggests half of them as `maxWorkers` in the config it names; the
figures above are in the docs section, not in the message. Do not quote a worker count as
universally right — it is a property of the machine.

**On Vitest 5, `perf` reads what Vitest 5 reports; an older Vitest prints exactly what it did before.**
The advice reads the configuration Vitest resolved (`isolate`, `pool`, `maxWorkers`, `environment`,
`fsModuleCache`) rather than the config text, and never advises against an option you set
explicitly. `perf-transform` fires when the wait for Vite's transforms is 30 % or more of the CPU time
with the module cache off, and advises `fsModuleCache: true` — kept between CI pipelines, or it only
helps locally. `perf-long-pole` names the file still running alone after every other lane went idle,
when that tail is at least 2 s and 30 % of the span. `perf-isolation` adds the workers spawned and
their summed start-up, with an "at least" wall-clock saving; `perf-workers` counts the lanes the run
used rather than the machine's cores; under `isolate: false`, `perf-heap` lists what each file added
to its lane's heap. Environment time is counted once per lane (`concurrencyId`) and value — not per
`workerId`, which Vitest 5 renews for every file even in a reused worker. A finding about a switch
also prints `perf-vitest-doctor`: confirm it with `npx vitest doctor`, Vitest's own A/B runner, not
this package's `doctor`. A bare run on Vitest 5 passes `--experimental.diagnostics=false` so Vitest's
own hints do not repeat these. The reporter rewrites a `partial: true` report every ~2 s while the run
goes, so a killed or timed-out run still leaves one: `perf` prints it under a warning and the gate
refuses it like a red run.

**A bare `vitest run` is not every repository's suite, and `perf` refuses to pretend otherwise.**
Where the suite is assembled by something else — an Angular builder, an Nx target, a script that
generates a config per project — there is no root `vite(st).config.*`, the Vitest defaults sweep up
every `*.spec.*` in the tree with no globals and no aliases, and every file fails to collect. The
phase table that comes out of that is real seconds spent on nothing: measured on one such workspace,
1 830 files, 29 s of wall clock and **zero** test bodies executed. `perf` checks for that shape
before it runs anything, and refuses any report in which no body finished (exit 2). Measure the
repository's own command instead:

```bash
npx vitest-auto-spy perf --command 'npm test'                          # measure that command
npx vitest-auto-spy perf --command 'npm test -- {paths:--include=}' --gate
```

`--command` puts `VITEST_AUTO_SPY_PERF_OUT` and `VITEST_AUTO_SPY_PERF_REPORTER` in that command's
environment; the configuration it reaches attaches the reporter itself (`reporters: perf ===
undefined ? ['default'] : ['default', perf]`), and the reporter writes nothing at all when the first
variable is unset, so it can be declared permanently — by name, `vitest-auto-spy/perf-reporter`. `{paths}` / `{paths:<prefix>}` is where the
files of a confirmation pass go.

**`--gate` is the only part of this command that fails anything**, and three rules keep it honest.
It judges the `tests` phase alone, because the other five are the harness and the machine rather than
anybody's code. A file budget is counted in the median test **of the same run** — the largest of
`--max-file-tests` (2 000) median tests, `--factor` (10) × the median test for each test in the file,
and a `--max-file-ms` (5 000) floor that can only spare a file — which is what makes the verdict the
same on a loaded CI runner and on an idle laptop, and what keeps a large file of ordinary tests out of
it: the rule it replaced, `--factor` × the median **file**, flagged 0 files of a 2 023-file consumer
suite at ×1 slowdown and 19 at ×9, a 209-test service spec at 5 ms a test among them. A confirmed finding
also says why: the confirmation pass records a CPU profile of each suspect file and every one of its
test bodies, and the gate prints the slowest tests, the share in hooks against bodies, and where the
time went in the spec, in your code and by package. The report ends in two tables of what is over
budget and nothing else. And every candidate is re-measured on its own before it may fail anything: a
file that is fast when it has the machine to itself is reported as _not reproduced_, an `info` rather
than a finding. Without a way to re-measure, findings are warnings that fail nothing unless
`--no-confirm` says one reading is enough. Exit `1` is "over budget", exit `2` is "there was nothing
to judge" — including a red or unfinished (`partial`) suite, which the gate will not judge at all, since a failed test is
measured until its timeout and 30 s of timeout looks exactly like 30 s of slow code.

`--json <path>` re-analyses a report an earlier `--out <path>` run wrote, instead of running Vitest
again. Full reference: <https://asdalexey.github.io/vitest-auto-spy/utilities/cli>.

### Migrating a suite off `jest-auto-spies` — run the codemod, then verify it

```bash
npx vitest-auto-spy codemod            # dry run: prints the diff, writes nothing
npx vitest-auto-spy codemod --write    # apply
npx vitest-auto-spy codemod --verify   # exits 1 on anything the transforms should have removed
```

Do not hand-edit a suite of migrated imports; the codemod knows which entry point exports each name
(it reads the installed package's export map) and it transposes `jest.Mock<R, [A]>` into the single
call signature Vitest takes — a plain rename compiles into the **reverse** meaning and nothing fails
until a call site disagrees. It leaves a `jest.*` member with no `vi` twin (`requireMock`,
`replaceProperty`, `createMockFromModule`, `jest.setTimeout`, `requireActual`) exactly as it was and
reports what to do instead, rather than guessing.

`--verify` matches the **result** against the patterns the codemod removes, so it also catches what
the transforms declined to enter (a template literal, an unbalanced bracket) and a file somebody
migrated by hand. Run it after `--write`, and again after any manual clean-up. `--only` / `--skip`
select transforms by id, `--list` prints them. Full reference:
<https://asdalexey.github.io/vitest-auto-spy/utilities/codemod>.

**Every rewrite is parsed before it is written.** The result goes through the project's own
`typescript` and its diagnostics are compared with the original's; a file the run would have broken
is reported as `codemod-broke-syntax` and **left exactly as it was**, so the run exits 1 with one
file named rather than a tree that no longer compiles. Where `typescript` is not installed the check
is skipped silently — it is a safety net, not an install instruction.

It visits JavaScript specs too — `*.spec.js`, `*.test.jsx`, the `.cjs` / `.mjs` forms — because a
Jest suite that was never TypeScript is the suite with the most `jest.` in it. Two things it now
reports instead of rewriting into something wrong: `jest.fn<R, [A]>()` / `jest.spyOn<…>()` in a file
that imports from `@jest/globals` (`jest-mock-type-arguments` — `jest-mock` 29 already takes the
whole function type, so transposing a second time produces a return type of a return type), and
`.withArgs(…)` on a `vi.spyOn` chain (`jasmine-with-args-on-spy-on` — `vi.spyOn` has no
`calledWith`, and renaming it onto one produces a method that does not exist).

Past 50 000 files the repository scan truncates and the run says so — _Nothing left to migrate_ off a
truncated list is a claim about a tree the tool never looked at. `VITEST_AUTO_SPY_SCAN_CAP` raises
the cap.

### If you are writing a codemod over specs

Two traps, both found the hard way on rxjs-heavy code.

**`String.prototype.replace` interprets `$` in the replacement.** `$&`, `` $` ``, `$'` and `$n` are
substitution patterns, and `$'` — "everything after the match" — is one character away from every
observable name in the codebase. A replacement containing `reloadAndSeekTo$'`
inserted the entire remainder of the file into itself and left an unterminated string; the only
thing that caught it was ESLint's `Parsing error`. Pass a function, which is never interpreted:

```ts
source.replace(from, () => to); // not source.replace(from, to)
```

**`node.getStart()` excludes leading comments.** A codemod that replaces a range starting there
silently eats the `// eslint-disable-next-line` above the node. Use `node.getFullStart()`, or count
the comments before and after and compare against `HEAD`.

---

## 20. Migrating a suite off `jasmine-auto-spies`

In [`agent-docs/migration-jasmine.md`](./agent-docs/migration-jasmine.md). Read it when moving a suite off `jasmine-auto-spies`.

<!-- agents-outline: agent-docs/migration-jasmine.md -->

- The renames, once the suite is green
- Four traps, all of them silent
- `@hirez_io/observer-spy` comes with it

<!-- /agents-outline -->
