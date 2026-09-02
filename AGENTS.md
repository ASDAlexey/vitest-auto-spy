# vitest-auto-spy — instructions for AI coding agents

You are looking at the agent-facing reference for **`vitest-auto-spy`**: typed test spies generated
from a class, a type, or nothing at all, on Vitest / `bun:test` / `node:test`.

This file is written for an agent **using** the library in someone's test suite. It is shipped
inside the npm package, so it is readable with no network:

```
node_modules/vitest-auto-spy/AGENTS.md
```

Working on the library's own source instead? Read `CONTRIBUTING.md` in the repository.

Setting this up for a team? `npx vitest-auto-spy init` writes a pointer to this file into the
instruction files this repository's agents actually read — `AGENTS.md` (Codex, Cursor, Copilot and
most of the field), `CLAUDE.md` (Claude Code) and `GEMINI.md` (Gemini CLI), plus the glob-scoped
rule file of any tool whose own directory already exists. `--check` is the CI form. Full table:
<https://asdalexey.github.io/vitest-auto-spy/agents>.

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

Five add-ons, orthogonal to the runner:

| Add-on            | Import                          | Needed for                                                                                                |
| ----------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Observable spies  | `import 'vitest-auto-spy/rxjs'` | `nextWith` & friends. **Side-effect import, once.**                                                       |
| observer-spy shim | `vitest-auto-spy/observer-spy`  | `subscribeSpyTo` — the `@hirez_io/observer-spy` surface (§20). Its own entry so `/rxjs` does not carry it |
| Console spies     | `vitest-auto-spy/console`       | silent typed spies over the global `console`                                                              |
| Setup helpers     | `vitest-auto-spy/setup`         | `setupAutoSpy()`, `setupFakeTimers()`                                                                     |
| Zone patch        | `import 'vitest-auto-spy/zone'` | `fakeAsync` / `waitForAsync` on Vitest (§14)                                                              |
| jasmine compat    | `vitest-auto-spy/jasmine`       | `.and` / `.calls` / `.withArgs`, the `jasmine` namespace (§20)                                            |

`vitest-auto-spy/jasmine` is Vitest-only, because it registers the Vitest adapter. On `bun test` and
`node --test` call `enableJasmineCompat()` from `vitest-auto-spy/jasmine-compat` instead.

The package is **ESM**. Only `vitest-auto-spy/node` and `vitest-auto-spy/eslint-plugin` also ship a
CommonJS build; every other subpath is ESM-only (a `require()` of a Vitest-backed entry always threw —
Vitest refuses to be required).

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

One standalone function?          → createFunctionSpy<Fn>('name')
Code under test does `new Foo()`? → a real class?  createSpyClass(Foo)
                                  → only a shape?  mockConstructor<T>(() => instance)
                                  → on a global?   stubConstructor(globalThis, 'Image', factory)
                                    (a vi.fn() rejects `new` — see §12)
```

`createAutoMock` and `autoMocked` build the same object; they differ only in the type you get back,
and the question that decides it is **how the double travels**. Through DI, it arrives as `Spy<T>`
and is only ever asserted on — `createAutoMock`. Handed to the function under test as an argument
(`detectVpnClient(url, logger)`, `applyPreferredTracks(target, …)`, `setLocalConfigEnabled(storage, …)`),
it has to satisfy `T` at the call site _and_ expose the spy helpers at the assertion, and
`autoMocked<T>()` is that intersection — otherwise every call site needs an `asInstance()` and the
noise scales with the number of them.

`createMock<T>()` is the one to reach for on data shapes — it returns a plain `T`, so it satisfies a
`no-type-assertion` lint rule without an `eslint-disable` on every fixture.

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
`{ selfReturning: true }` for a fluent API, or use `createAutoMock<T>()` with
`channel.mockReturnThis()` when only one method chains:

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

`asInstance` did not take a deep mock before 3.5.0, which left it with nowhere to go: this tree
sends you to `mockDeep` when the calls chain, and the result then fitted nothing that expected `T`.

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

### What a Proxy-backed double cannot do

`createAutoMock` and `mockDeep` build a Proxy, not an object, and there is one place where the
difference shows: a Proxy answers only the operations its handler traps. Three of them used to be
missing, and each produced a _silent_ wrong answer rather than an error — the worst failure mode
this library can have, because a checking test becomes a non-checking one and only the proxy's
source says so. Two are fixed; the third cannot be:

| Operation                         | Before 3.5.0                                      | Now                                                      |
| --------------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| `mockValueProp` & the other three | patch landed on the target; the double ignored it | works, and `restoreMockedProps()` undoes it              |
| `delete mock.optionalMethod`      | deleted nothing; the next read remade the spy     | the member is absent, until something writes to it again |
| `Object.assign(real, mock)`       | copies only the keys already **read**             | still does — see below                                   |

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

| Key            | Probed by                                     | The double became |
| -------------- | --------------------------------------------- | ----------------- |
| `schedule`     | `popScheduler` in `of` / `from` / `merge` / … | a scheduler       |
| `lift`         | `isObservable`, with `subscribe`              | an Observable     |
| `@@observable` | `isInteropObservable` in `innerFrom`          | an interop stream |
| `getReader`    | `isReadableStreamLike` in `innerFrom`         | a ReadableStream  |

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

Building a spy is not a thing to optimise. On a ten-method class: `provideAutoSpy` ~8 µs,
`createSpyFromClass` ~29 µs, `createAutoMock` ~33 µs, a `calledWith` lookup ~0.7 µs — five providers
across two thousand tests is under a tenth of a second. Call the factory in `beforeEach` and look at
`TestBed` instead. The only two settings that cost: `{ lazySpies: false }` gives up the laziness
`provideAutoSpy` defaults to, and `autoSpyAccessors: true` walks the prototype chain uncached on
every call — name the accessors instead.

Memory is the exception, and only on classes wide enough for it to matter. `lazySpies: true` still
defines one accessor per method, and that placeholder is nearly all of what an untouched double
retains: 101.6 kB on a 400-method class against 11.8 kB with `lazySpies: 'proxy'`, which answers
every method from a single trap object instead (25 B per method against 253 B). It is opt-in because
a `Proxy` cannot remove itself — +30 ns per read and +43 ns per call, forever — and it loses on a
five-method service. Reach for it on generated API clients and ngrx facades under `isolate: false`,
where the doubles of a whole file are alive at once; leave the default everywhere else.

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
| anything        | `calledWith(...args)` → `.mockReturnValue(v)` / `.returnValue(v)` / `.failWith(err)`, `mustBeCalledWith(...args)` → same, `failWith(err)`   |
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

`.values` holds every match, oldest first; `.captured` asks without triggering the "nothing was
captured" throw; `.reset()` lets one captor serve two phases. **Assertions only** — a captor matches
every value, so putting one in `calledWith` would configure a return for every call, which is
`mockReturnValue` spelled less clearly, and `calledWith` is typed to the method's own parameters so
it will not compile anyway.

**The observable helpers are backed by a `ReplaySubject(1)` that belongs to the spy, and it is
configuration — so it must be reset with the rest of it.** Two failures used to come out of that
buffer outliving the test that filled it, and both were silent:

```ts
// test 1
service.createSeamlessTransition.nextWith(uri); // buffered

// test 2 — the failure path is the point of this test
service.createSeamlessTransition.throwWith(error); // subscriber gets `uri` FIRST, then the error
```

The code under test therefore ran the **success** branch on stale data, and the error branch arrived
one emission late. The second: `error()` and `complete()` close a Subject permanently, so a later
`nextWith` on that spy pushed into a dead subject and emitted nothing at all. Both are fixed —
`resetAutoSpy(spy)` now drops the subject, and a terminated one is replaced on the next
configuration.

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
  overrides: { products$: subject }, // a member that is not a method result
});
```

| Key                      | Semantics                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `methodsToSpyOn`         | **Additive**, as in `jest-auto-spies`. Same behaviour as `instanceMethodsToSpyOn`. |
| `onlyMethodsToSpyOn`     | **Exhaustive whitelist.** Skips discovery; anything not listed is absent.          |
| `instanceMethodsToSpyOn` | **Additive.** The name to prefer in new code (see below).                          |
| `autoSpyAccessors`       | Merged with the explicit getter/setter lists.                                      |
| `lazySpies`              | Behaviour-identical; only changes _when_ each spy is built. `'proxy'` also changes _what holds the name_. |
| `strict`                 | Throw on a method nobody configured, instead of answering `undefined` (below).     |
| `onUnstubbedCall`        | The general form of `strict`; its return value becomes the call's return value.    |

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
- **Abstract classes are accepted**, type and runtime both — `ClassType<T>` carries an abstract
  construct signature, and when the prototype turns out to be empty (abstract members are erased
  before emit) the factory hands back the `createAutoMock` proxy instead of an empty object. Do
  **not** pass a concrete subclass instead; this file used to say so, and it was wrong twice over.
- **An overloaded method is not collapsed.** The worry that `Spy<T>` types every generated
  `api-mgw` client against its last signature does not hold: a four-overload
  `MgwContentsService.getMoviesBySlug` types as it should, and hand-written `{ m: vi.fn() }` doubles
  for those services convert with no changes to the assertions. When the _first_ signature is the
  useful one, name it on the **declaration only** — the factory's result assigns to it, so the type
  argument is not written twice:

  ```ts
  let mapping: Spy<MgwMappingService, { overload: 'first' }>;

  mapping = createSpyFromClass(MgwMappingService); // no second type argument here
  ```

**A getter that returns a `Signal<T>` goes in `instanceMethodsToSpyOn`**, not in `gettersToSpyOn`.
`get isKidMode(): Signal<boolean> { return this._isKidMode.asReadonly(); }` is read as a property
and called as a function, and the accessor route makes you write
`accessorSpies.getters.isKidMode.mockReturnValue(signal(false))` — two levels deeper than the value
in question. Naming it as an instance method puts a plain spy at that key (the spy object has no
class prototype, so nothing is being shadowed), and
`service.isKidMode.mockReturnValue(false)` reads like every other member. `mockSignalProp` is the
other answer when the value has to change during the test.

### `strict` — a method nobody configured throws instead of answering `undefined`

```ts
const users = createSpyFromClass(UserService, { strict: true });

users.load.resolveWith([]);
users.currentTenant(); // throws here, not four frames later inside the component
```

```
[vitest-auto-spy] Nothing configured Cart.checkout, and strict mode is on.
Called as: Cart.checkout(1,'now')
```

Also on `createAutoMock`, `provideAutoSpy`, and suite-wide as `setupAutoSpy({ strict: true })`.
Precedence, first one set wins: the double's `onUnstubbedCall` → the global `onUnstubbedCall` → the
double's `strict` (**including `strict: false`**, the only way to exempt one double from a suite-wide
default) → the global `strict`.

- **It is not argument-level.** A `calledWith(1, 'now')` chain says the method is stubbed, so
  `checkout(9, 'later')` still answers `undefined`. Use `mustBeCalledWith` for that.
- **`mockReturnValue` / `mockImplementation` / the `returns:` option replace the dispatch**, so they
  never reach the guard. Consequence: after the last `mockReturnValueOnce` the queue empties back
  onto the library dispatch and the next call **is** reported as unstubbed — seed
  `mockReturnValue(...)` too when a `Once` sequence is meant to run out.
- **It does not reach** accessor spies, observable-property spies, `mockDeep` nodes, `console-spy`,
  `mockResourceProp`'s `reload` or a standalone `createFunctionSpy`. A strict double still answers
  `undefined` for an unconfigured getter or `items$`. `fillMissing` members **are** covered.
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
import { expectCompletion, expectEmission, expectEmissions, expectError, expectNoEmission } from 'vitest-auto-spy';

await expect(expectEmission(component.visible$)).resolves.toBe(true); // the first VALUE, not a list
await expect(expectEmission(tasks$)).resolves.toEqual({ id: 1 }); // the task itself, not `[task]`
await expect(expectEmissions(source$, 3)).resolves.toEqual([1, 2, 3]); // the list is this one
await expectNoEmission(source$, { timeout: 50 });
await expectCompletion(service.purgeCache()); // "it finished" — the value is not the point
```

Options: `{ timeout, label }`. `timeout` defaults to `1000` ms (`0` for `expectNoEmission`, whose
wait is a quiet window rather than a watchdog). The source is duck-typed, so rxjs `Observable`s,
`Subject`s, Angular `toObservable()` results, Angular `output()` (`OutputEmitterRef`, whose
`subscribe` takes a bare callback) and hand-rolled subscribables all work — and every helper infers
the emitted type, so `expectEmission(of(1))` is a `Promise<number>`.

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

mockValueProp(state, 'forceRequeryAndStartPlaybackAt$', forceRequery$);
const next = vi.spyOn(forceRequery$, 'next');

service.seek(1000);
expect(next).toHaveBeenCalledWith(1000);
```

`Spy<T>` types an Observable property as `AddObservableSpyMethods<O> & T[K]`, so `next` is there on
the type either way — which is exactly why this is worth saying: the code compiles against the spy
surface and asserts nothing.

**When the error _is_ the assertion, use `expectError`.** The other helpers wrap a stream failure in
a new `Error` whose message names the stream — right for reporting an unexpected failure, useless
when the failure is the subject. `expectError` resolves _with_ the error, exactly as it was thrown:

```ts
await expect(expectError(service.load())).resolves.toBe(originalError);
expect(await expectError(process$)).toBeInstanceOf(UdmsStatusError);
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
runner: only the spec knows whether it is on `vi`, `bun:test` or `node:test`.

**The watchdog runs on real time, on purpose — even under fake timers.** A virtual one would race
the timers the spec advances: `expectEmission(source$, { timeout: 200 })` followed by
`vi.advanceTimersByTime(5_000)` would fire at 200 virtual ms and reject the stream the spec was
about to advance into. The cost is that in a suite with global fake timers a _failing_ assertion
spends a real second. Do **not** answer that with `{ timeout: 0 }` at every call site — that
disables the watchdog, and the next silent stream hangs to the runner's own timeout with nothing
useful in the message. Lower the default once instead:

```ts
// vitest.setup.ts
import { setEmissionTimeout } from 'vitest-auto-spy';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ globalFakeTimers: true });
setEmissionTimeout(100); // the clock is frozen; a real second buys nothing
```

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
the JSDoc calls the latter an escape hatch for `#private` fields. In practice it carries about half
of the real calls, all of them legitimate:

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

**The restore also runs from an `onTestFinished` net**, because the `afterEach` is not guaranteed
to. Vitest calls `afterEach` hooks in _reverse_ registration order, so the setup file's is the last
one, and a hook the spec file registered takes the chain down with it when it throws — the patches
then travel into the next test and the failure surfaces somewhere that never touched them. One spec
kept `afterEach(() => vi.restoreAllMocks())`; migrating it to `gettersToSpyOn` made the restored
getter return `undefined`, `ngOnDestroy` called it as a signal, the `TypeError` aborted the hook,
and a template error about a null profile appeared in a different `describe`. The net puts the
properties back and warns with the count and the cause. `countMockedProps()` is exported if you
would rather assert it: `afterEach(() => expect(countMockedProps()).toBe(0))`.

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
fail rather than be tidied away, or take the per-file count from the sweep itself:

```ts
setupAutoSpy({ strayTimers: true, onStrayTimers: ({ cancelled }) => expect(cancelled).toBe(0) });
```

**With Vitest 4.1's `--detect-async-leaks`, run one or the other — not both silently.** The two
arrive at the same timer from opposite ends and the quiet one wins: the sweep cancels in `afterAll`,
Vitest collects its leaks afterwards, and a cancelled timeout is no longer referenced, so the run
reports **no leaks** for a file that leaks. Cancelling is still the right default — a callback firing
during a later file is the more expensive failure — so when both are on and no `onStrayTimers` is
given, the sweep prints one line to stderr saying how many it took away. To see _where_ each one was
scheduled, re-run that file with `strayTimers` off and read Vitest's report; the code frame points
at the `setTimeout` in the spec, because the library's own scheduler wrappers go through
`vi.defineHelper` and are dropped from the stack.

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

**`onUnhandledError` is not this.** Vitest 4.0 added a config callback for errors the _runner_ hears
about, and under zone.js the runner never hears about these at all — zone.js drains the rejection
into `console.error` before `process.on('unhandledRejection')` would fire, so there is nothing for
that callback to filter. Use `onUnhandledError` to triage the native failures Vitest already reports;
use `strayRejections` to find the ones it never sees.

A rejection the runner has **already** blamed the finished test for is not reported again. An
`async` test that fails an assertion leaves its own `AssertionError` in both places, so a red run
used to print two messages per failure and the second one sent the reader hunting for a defect that
was not there. What is left is what the check is for: the rejections that fail no test at all.

**The one that gets slower the longer the run goes on:** every `vi.fn()` and `vi.spyOn()` is added
to one `Set` inside `@vitest/spy`, because that is what `vi.clearAllMocks()` walks, and nothing takes
anything out of it again. With `isolate: false` the set is created once per worker and only grows:
`clearMocks: true` then walks every mock of every file already run **before every single test**, and
the worker holds all of them at once — their recorded arguments included, and through those whole
component trees.

```ts
setupAutoSpy({ pruneMockRegistry: true }); // keep only the mocks that outlive a file
```

The part to understand before turning it on is what must **not** be pruned. A pruned mock is one
`clearMocks` can no longer see, so its calls accumulate silently — harmless for a mock that dies with
its file, a bug for the module-level `vi.fn()` in a shared `*.mock.ts` that six spec files import.
The split is therefore drawn where it is observable: what is already in the registry when a file's
hooks start was created while the module graph was evaluated and is kept; everything added after that
belongs to the file and goes when it ends. One case lands on the wrong side — a module first loaded
by a dynamic `import()` inside a test — and says so explicitly:

```ts
export const navigation = { setFocus: keepMockRegistered(vi.fn()) };
```

The mocks it keeps, it also guards. Staying registered means `vi.resetAllMocks()` reaches them too —
it walks the same set and calls `mockReset()`, which puts an implementation back only when it was
passed to `vi.fn(implementation)`; behaviour chained on with `.mockReturnValue(…)` or
`.mockReturnThis()` is simply lost. Under `isolate: false` that surfaces in a _different_ file later
in the same worker, inside application code, as `Cannot read properties of undefined` against a
shared double that spec never touched — and `vi.restoreAllMocks()` does not cause it (Vitest 4 walks
`MOCK_RESTORE` there, which only `vi.spyOn` writes to), so probing with that one comes back green and
sends the search the wrong way. The implementation a long-lived mock carried when it was classified
is therefore remembered and put back, in `beforeEach`, but only when it has gone missing.

`trackMockRegistry()` installs the hooks on its own, `pruneMockRegistry()` is the one-shot sweep (it
returns how many went), `restoreLongLivedImplementations()` is that repair (it returns how many it
put back) and `getMockRegistrySize()` reports what is left.

Two more switches, both about the environment rather than the spies:

```ts
setupAutoSpy({ blockNetwork: true }); // fetch rejects, XHR fails, sendBeacon answers false
```

Both DOMs leak, through different holes. happy-dom implements `fetch`, so a component pulling a
remote asset really fetches it, nothing asserts on the response, and the aborts at teardown fail the
run with **no test named** — a green run exiting 1 with `DOMException [AbortError]`. jsdom
implements `XMLHttpRequest` in full, and the libraries that never left XHR (a VAST player pinging
every tracker through a hand-rolled one) reach the internet once per ping per test, printing jsdom's
`AggregateError at Object.dispatchError` for each connection that failed — so what a green run
prints depends on whether the machine has a route out.

Every channel is closed by default; the object is for narrowing it:

| option   | default    | what it does                                                                                                                    |
| -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `fetch`  | `true`     | `fetch` rejects, naming what was requested                                                                                      |
| `xhr`    | `'reject'` | `'reject'` fails the request (`status` 0, an `error` event); `'empty'` answers 200 with an empty body; `false` leaves XHR alone |
| `beacon` | `true`     | `navigator.sendBeacon` answers `false` — only where the environment has one                                                     |

`'reject'` is the default because it is what `fetch` does: the code takes its failure branch, which
is the branch a unit test should be asserting on. `'empty'` is for a request whose response nobody
reads — a tracker ping, an analytics beacon — where failing it only trades one kind of noise for
another:

```ts
setupAutoSpy({ blockNetwork: { xhr: 'empty' } }); // the ad-player suite's setting
```

A `data:` URL is always let through, and it is the only thing that is: that is the scheme a spec
serves its own fixtures from (`xhr.open('GET', \`data:application/xml,\${encodeURIComponent(vast)}\`)`),
and the only one a DOM answers without a socket. A **relative** URL is not exempt either — the DOM
resolves it against the document origin, so a spec that reaches `/config`and passes is resting on
nothing listening on that port.`WebSocket`and`EventSource`are left alone: their failure is an
event on an object the code keeps and reconnects, so there is no blanket answer that is not itself
a behaviour change —`stubConstructor(globalThis, 'WebSocket', …)` is the tool for a spec with one.

`restoreTimerGlobals` is on by default and needs no thought unless you turn it off: uninstalling
fake timers under happy-dom **deletes** `Date` instead of restoring it (the global is inherited from
the realm, not owned by `globalThis`), and with `isolate: false` the next file dies inside Vitest's
own `useFakeTimers` with `Cannot read properties of undefined (reading 'now')`. If you see that,
the file in the stack is not the cause.

`hookTimeoutHint` is on by default too, and it is the one that pays off on the day a suite lands in
CI. Jest resolves **one** budget — `hook.timeout || getState().testTimeout` for a hook,
`test.timeout || getState().testTimeout` for a body — while Vitest resolves `hookTimeout` on its
own and defaults it to 10 000 ms. Carry a preset's `testTimeout: 30000` into the runner config and
stop there, and every hook in the suite silently runs on a third of what its tests get. Worse, the
failure is filed against the wrong thing: a `beforeEach` timeout is attributed to the **test**, with
the test's duration pinned at the limit, so the report reads `× should create 10045ms` and sends the
reader looking for ten seconds of work inside a body that never ran. The hint appends both numbers
and the field to set. It says nothing when the budgets agree — then the hook really is slow — and
nothing for `beforeEach(fn, 300)`, which chose its own limit. `beforeAll` is out of reach by
construction: its timeout is reported as a failed _suite_, every test is skipped and no `afterEach`
runs.

**When migrating a runner config off Jest, set both timeouts side by side**, and treat the single
Jest number as belonging to both fields:

```ts
test: {
  testTimeout: 30_000,
  // Jest had one budget for both; Vitest defaults this to 10_000 on its own.
  hookTimeout: 30_000,
}
```

`frozenClockHint` is the same seam aimed at the other half of a timeout. A frozen clock turns
waiting into waiting forever — `await new Promise(r => setTimeout(r, 10))` never resolves unless
something advances it — and the runner's own advice ("pass a timeout value as the last argument") is
the one repair that cannot work: the callback is not late, it is never scheduled to run. Under
`globalFakeTimers` nothing in the spec says the clock is fake at all, so the timeout lands in a file
that never mentions a timer. The hint reports `vi.isFakeTimers()` and `vi.getTimerCount()` — facts,
not a guess — and stays silent when the clock is real or its queue is empty.

The shape that reaches this with no timer in sight is an HTTP spec. `setImmediate` is among the
globals `vi.useFakeTimers()` replaces by default, and Express ends a request that matched no route
through `finalhandler`, which schedules on `setImmediate`. So the 404 is never written and the test
dies on its timeout: in such a file, "the test hung" means _the route did not match_, not "the
server is slow". One thing this cannot see through — a spec whose own `afterEach` calls
`vi.useRealTimers()`, because hooks run in reverse registration order and the clock is real again by
the time the hint reads it. Nothing is reported then, rather than something wrong.

One more field of the same family differs quietly and changes only the report:
`slowTestThreshold` is `5` in Jest (**seconds**) and `300` in Vitest (**milliseconds**), so a
migrated suite starts marking most of its files slow. That is a unit change, not a regression.

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

| What is pending                                   | What drives it                                     | What does **not**                         |
| ------------------------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| change detection                                  | `fixture.detectChanges()`                          | anything `await`ed                        |
| effects + `afterNextRender` + CD                  | `await stable(fixture)` (`…/angular`)              | `detectChanges()` alone                   |
| timers, debounces, polling                        | `await advanceTimers(ms)` (`…/setup`)              | `await Promise.resolve()`                 |
| a dynamic `import()`, native `async` in a dep     | `await flushEventLoop()` / `settleDynamicImport()` | `tick()`, `flushMicrotasks()`, microtasks |
| an `httpResource()` / `resource()` / `rxResource` | `await settleResource(r)` (`…/angular`)            | `flushEventLoopUntil` — it never ticks    |

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
for a chunk becoming reachable, an SDK reporting itself ready, a queue draining. Use it instead of a
hand-tuned turn count: the count depends on the dependency, not on the spec, and a condition that
never holds fails naming the `label` rather than hanging until the runner's timeout.

**Not for an Angular `resource()` / `httpResource()`.** Those need a change-detection _tick_, and
this helper only takes event-loop turns — a resource awaited through it finishes the whole budget
having issued zero requests. `settleResource(resource, { turns, label })` from
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

### The same thing as fixtures — `extendWithAutoSpies` (Vitest 4.1+)

The block above, written once instead of once per dependency, with the types inferred rather than
declared:

```ts
import { test as base } from 'vitest';
import { extendWithAutoSpies } from 'vitest-auto-spy/angular';

const test = extendWithAutoSpies(base, {
  cart: CartService,
  api: [ApiService, { returns: { get: of([]) } }],
  passcode: PASSCODE_TOKEN,
});

test('checks out', async ({ cart }) => {
  cart.checkout.resolveWith(true);

  await expect(cart.checkout(1)).resolves.toBe(true);
});
```

No `let cart: Spy<CartService>` that is `undefined` between tests, and a test that never destructures
`api` never builds it. Entries are a class, `[Class, config]` with whatever `provideAutoSpy` takes,
or an `InjectionToken` (built from the token's own type, like `provideAutoSpyForToken`). Extra
providers — the component under test, a real service, `provideHttpClient()` — go in the third
argument and are registered in the same call, ahead of the generated ones, so a token named there
wins.

**It takes the whole map at once, and that is a `TestBed` constraint rather than a typing one.** The
composing form — `base.extend('cart', …).extend('api', …)` — cannot work: fixtures resolve
independently, so `cart` would configure the testing module _and_ inject, which instantiates it, and
`api` would then reach `configureTestingModule` after instantiation and fail with Angular's own
"Cannot configure the test module when the test module has already been instantiated". A `beforeEach`
that configures the module further still composes, because it runs before any fixture resolves and
repeated `configureTestingModule` calls merge right up until the first injection. A `beforeEach` that
**injects** does not, and nothing can repair that from here.

The token may be an **abstract class** — `abstract class LocalStorage extends AbstractStorage {}`,
the shape production provides with `useClass`. Its members are erased before they reach a prototype,
so there is nothing to discover; the factory notices and returns the `createAutoMock` proxy, which
answers every method of the declared type. `injectSpy(LocalStorage)` recognises it as an auto-spy
and stays quiet.

**Seed the double in the provider, not in the `beforeEach` under it.** Both factories take both
halves — `returns` for what a spied method answers, `overrides` for a member that is not a method
result:

```ts
provideAutoSpy(FavoritesService, {
  returns: { load: of([]) },
  overrides: { favoritesCacheUpdated$: of(undefined), favoriteItems: [] },
});

provideAutoSpyForToken(PRODUCTS, undefined, { returns: { getProducts: of([]), getById: of(null) } });
```

A seeded `overrides` member is stored verbatim and is **no longer a spy**, so seed data there and
name methods in `returns` when they must stay assertable. The reason to prefer this over a second
statement is not brevity: the shortcut people take instead is an exported `const` provider carrying
the values, and under `isolate: false` that is one set of spies shared by every file that imports
it.

**`observablePropsToSpyOn` works on a token too**, and matters more there than on a class. A class
tells the factory which members are methods; a type does not, so _every_ unnamed key of a
token-driven double is a function spy — including an `Observable` property, which the code under
test then subscribes to as if it were a function, failing far from the double:

```ts
provideAutoSpyForToken(FAVORITES, undefined, { observablePropsToSpyOn: ['favorites$'] });
// …
injectSpy(FAVORITES).favorites$.nextWith([{ id: 1 }]);
```

A member also named in `overrides` keeps its seed — hand the double a real `Subject` there when the
spec drives the stream itself, and name it here when `nextWith` is what the spec wants. That is the
same precedence the class-based factory uses. Before 3.5.0 this option existed only on the class
path, and reaching a token with observable members meant going back to a hand-written double —
which is exactly what `prefer-provide-auto-spy` and `prefer-create-spy-from-class` exist to prevent.

**Do not write a local `injectSpy`.** A wrapper of the shape
`TestBed.inject(token as never) as Spy<T>` — a double assertion, typed
`<T>(token: abstract new (...args: never[]) => T)` — is a common thing to find already in a
repository, and the library's is strictly wider: it takes `ClassType<T>`, an `InjectionToken<T>` and
an abstract constructor, warns when the injector hands back something that is not a spy, and has no
assertion for the project's lint rules to argue with. Two functions with the same name and different
signatures means the import order decides which one a file gets. Delete the local one, or re-export
the library's under that name.

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

### A component's own `providers` win, and the symptom is nowhere near the cause

Worth reading before the rest of this section: it has now come up twice in one migration wave, and
both times the failure landed in a different file from its cause.

`@Component({ providers: [DeleteAccountService] })` declares the provider on the **element**
injector, and a module-level `provideAutoSpy(DeleteAccountService)` in `configureTestingModule`
loses to it — so the component builds the **real** service. Nothing warns. What fails is whatever
the real service touches first: in the observed case a logger, with
`TypeError: Cannot read properties of undefined (reading 'pipe')`, which names neither the component
nor the provider nor the spy.

Two things fix it, and which one depends on whether the double is wanted:

```ts
// keep a double, but put it where the component will look
const menu = overrideComponentProvider(CatalogPageComponent, NavigationBuilderService);

// or take the component's own provider away, so the module-level one is reached again
TestBed.overrideComponent(ProfileComponent, { remove: { providers: [DeleteAccountService] } });
```

`overrideComponentProvider` is the one to reach for by default — it also queues the component with
the TestBed compiler, which `overrideProvider` alone does not do. Reach for the `remove` form when
the module already provides the spy and the component's declaration is simply in the way.

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

`overrideProvider(X, provideAutoSpy(X))` is **not** broken, contrary to what this section used to
say: `provideAutoSpy` returns `{ provide, useValue }`, `overrideProvider` reads the `useValue` off
it and ignores the extra `provide`, and the spy is installed. `overrideAutoSpy` is the right call
because it says what it does and hands the spy back directly — not because the other form is a
no-op.

The failure that is real: `overrideProvider` only reaches a component the TestBed compiler knows
about, so a standalone component instantiated through a parent's template needs to be in `imports`
first; `overrideComponentProvider` queues it.

**`overrideComponentProvider` verifies itself**, always — not behind a diagnostics flag. On the next
`TestBed.createComponent` it asks the component's **own** injector for the token and throws when the
answer is not the spy it created, naming the component, the token and what was resolved instead. It
checks the **first** fixture only and stays silent when the component was not rendered (behind an
`@if`, a different host), so a throwaway fixture created first means "not checked", not "wrong". A
later `TestBed.overrideProvider(Token, …)` still wins; the check reports that but cannot prevent it.
`overrideAutoSpy` carries no verification of its own.

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

### A component whose own definition has a hole in it

The same bundle, one level down. A component's `providers`, `viewProviders` and compiled scope are
**baked into `ɵcmp` when its module executes**, not read at `createComponent` time — so a barrel
split into a chunk that has not run yet produces a definition with `undefined` in those lists.
Angular finds out much later, from inside itself, with a stack that names neither the barrel nor the
component:

```
TypeError: Cannot read properties of undefined (reading 'provide')
  ❯ resolveProvider render3/di_setup.ts:95
```

Both obvious cures fail: `await import('@scope/lib')` at the top of `beforeEach` is already too late,
and a static import at the top of the spec does not fix the order this bundler emits. Worse, the spec
that breaks is one nobody touched — chunk boundaries move with file _contents_, so editing a type
next door is enough.

```ts
import { assertComponentDefIntact } from 'vitest-auto-spy/angular';

assertComponentDefIntact(HoverMenuComponent); // HoverMenuComponent.ɵcmp.providers[0] is undefined
const fixture = TestBed.createComponent(HoverMenuComponent);
```

It walks the three lists, nested arrays and forward-reference thunks included, and answers the
related `Cannot read properties of undefined (reading 'ɵcmp')` from `imports: [Cmp]` as well — there
the class reference itself never arrived, and the message names the argument position. Directives
(`ɵdir`) are checked the same way. Neither this nor `assertNgModuleScopes` fixes the build; both
replace a stack inside `@angular/core` with a line naming what is missing.

### Four silent failures, as one setup line

```ts
// vitest.setup.ts — AFTER getTestBed().initTestEnvironment(…), because Vitest runs
// afterEach hooks in reverse registration order and this one must run before the teardown.
import { enableAngularDiagnostics } from 'vitest-auto-spy/angular';

enableAngularDiagnostics(); // { ngModuleScopes, deadSchemas, unspiedProviders, pendingRequests }
```

| Member             | Fails when                                                                       |
| ------------------ | -------------------------------------------------------------------------------- |
| `ngModuleScopes`   | a testing module imports an NgModule that contributes nothing at runtime         |
| `deadSchemas`      | `schemas` sit next to a standalone component (`declarations` empty) — a no-op    |
| `unspiedProviders` | `injectSpy` got a real instance; a `console.warn` alone, a throw under the group |
| `pendingRequests`  | the test ended with unflushed `HttpTestingController` requests, named one by one |

Every member defaults to `true`, takes `false` to opt out, and a second call **replaces** the
selection (safe from anywhere, including inside a test). `disableAngularDiagnostics()` turns the
group off and leaves the TestBed timing instrumentation alone. `assertNoPendingRequests()` is the
HTTP check on its own, for use mid-test — reading takes the requests, so the group will not
re-report what you inspected.

Nothing here imports `@angular/common/http/testing`: the token is read out of the spec's own
`provideHttpClientTesting()` / `HttpClientTestingModule`, and a project using neither is inert.
`ngModuleScopes` only fires on a module that contributes **nothing at all** — a providers-only module
is legitimately scope-empty, so a stripped scope that still has providers passes silently; hand-call
`assertNgModuleScopes(...)` where you know what the module was supposed to bring. `deadSchemas` does
not fire when `declarations` is non-empty.

### Which collaborators the code asked for — `trackInjections`

Do **not** reach for `vi.mock('@app/services')` to answer "was this collaborator used". Register the
collaborators as provider factories and read back which ones DI constructed; a factory runs exactly
when something injects its token, and DI is a seam the bundler cannot remove.

```ts
import { trackInjections } from 'vitest-auto-spy/angular';

// the same function on /nestjs

const collaborators = trackInjections([FeatureFlagService, ANALYTICS_TOKEN]);

TestBed.configureTestingModule({ providers: [CheckoutFacade, ...collaborators.providers] });
collaborators.get(FeatureFlagService).isOn.mockReturnValue(true);

TestBed.inject(CheckoutFacade).start();

expect(collaborators.names()).toEqual(['FeatureFlagService']); // analytics was never asked for
```

`providers`, `injectedTokens()` (in factory-run order), `names()`, `wasInjected(token)`,
`get<D>(token)` → `Spy<D>`, `reset()` (the record only — the doubles survive). A class token gets a
class spy, anything else a `createAutoMock()`; pass `{ double: () => … }` when a collaborator has to
be a real object. Doubles are built eagerly, so stub before the entry point runs; a factory runs once
per injector, so a token appears once per injector, not once per injection site.

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
await stable(fixture); // flush effects, then await the fixture; fails at 2000 ms naming the cause
await stable(fixture, { timeout: 5000, label: 'the products fixture' });
flushEffects(); // the no-fixture half: services, stores, runInInjectionContext

// resources — one wait for httpResource(), resource() and rxResource()
flushEffects(); // an httpResource issues NO request until something ticks
httpTesting.expectOne('/api/products').flush([product]);
await settleResource(products, { label: 'the product resource' });

// ...or skip the request entirely when it is not what the spec is about
const products = mockResourceProp(service, 'products', []);
products.set([product]); // 'resolved'   products.loading()   products.fail('offline')
expect(products.reload).toHaveBeenCalled(); // reload is spied, and re-issues nothing

// signal assertions
registerSignalMatchers(); // once, in the setup file
expect(component.total).toHaveSignalValue(3);

// resource assertions — value AND status, which is the whole point
registerResourceMatchers(); // once, in the setup file
expect(component.products).toBeLoading();
expect(component.products).toHaveResourceValue([product]);
expect(component.products).toHaveResourceError(/503/);
```

Two zoneless traps:

- `fixture.detectChanges()` runs **one** change-detection pass and does **not** flush pending
  effects. Asserting right after it reads state that has not finished computing. Use `await stable(fixture)`.
- `expect(someSignal).toBeTruthy()` passes for **every** signal ever created — a signal is a
  function. Use `toHaveSignalValue`, which also rejects the missing-parentheses mistake.

And one resource trap, which is the same shape one level up: an `httpResource()` reports `loading`
with its **default** value until a tick _and_ a microtask after its response is flushed, so a spec
that asserts too early asserts the default and passes. `settleResource` fails instead of passing
emptily. Note the order — `flushEffects()` first (the request is issued there, not on creation),
then the flush, then the wait.

`toHaveResourceValue` is the matcher form of that trap and the reason to prefer it over
`expect(products.value()).toEqual(...)`: it **fails an unresolved resource even when the default
value matches**, and names the status it was in. And when the request is not what the spec is about
at all, do not arrange one — `mockResourceProp(service, 'products', [])` replaces the property with
a double whose `set` / `fail` / `loading` move it directly, built from real `signal()`s so a
`computed()` downstream still recomputes. Nothing is in flight, so there is nothing to await.

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

It re-exports everything in this section except `registerSignalMatchers`,
`registerResourceMatchers`, `mockSignalProp` / `mockResourceProp` and the TestBed diagnostics — the
matchers and diagnostics need the runner's `expect.extend` and suite-level hooks, and the `mock*Prop`
family is not re-exported there either.

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
`TestBed.inject<any>(TOKEN)`; both of these accept a token. And it is `provideAutoSpyForToken`, not
`provideAutoSpy`: the latter reads a class prototype, which a token does not have.

**The second argument is not optional as often as it looks.** A spy answers `undefined` until it is
told otherwise, and that is fatal the moment the code under test _chains_ off it — a constructor
doing `inject(LOGGER).channel('auth').debug('…')` dies on the `.debug` of `undefined` before the
spec's first line runs, because nothing in production wrote `?.` there. Seed the link:

```ts
provideAutoSpyForToken(LOGGER, { channel: vi.fn().mockReturnThis() });
```

For a chain more than one link long, `mockDeep<T>()` is the double that answers every level (§2).

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

| Rule                              | Level   | Fix               | Flags                                                                                                                                     |
| --------------------------------- | ------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `no-expect-in-subscribe`          | `error` | suggest           | `expect()` inside `subscribe()` → `expectEmission` / `firstValueFrom`                                                                     |
| `no-object-define-property`       | `error` | suggest           | `Object.defineProperty` in a spec → `mockReadonlyProp` / `mockValueProp`                                                                  |
| `prefer-provide-auto-spy`         | `warn`  | —                 | a hand-rolled `useValue` **or** `useFactory` → `provideAutoSpy(Class)` / `provideAutoSpyForToken(TOKEN)`                                  |
| `prefer-create-spy-from-class`    | `warn`  | —                 | an object literal of 2+ `vi.fn()`s → `createSpyFromClass` (a factory's own seed is exempt)                                                |
| `prefer-inject-spy`               | `warn`  | suggest           | `vi.spyOn(TestBed.inject(X), 'm')`, inline or via a `const` → `injectSpy(X).m`                                                            |
| `no-shared-module-level-mock`     | `error` | —                 | an **exported** value holding `vi.fn()`s → export a factory instead                                                                       |
| `no-mocked-for-spy`               | `warn`  | `--fix` / suggest | `Mocked<T>` in any type position → `Spy<T>`, import and all — a suggestion where the assigned value is not from a factory of this library |
| `prefer-as-spy`                   | `warn`  | `--fix`           | `TestBed.inject(X) as Spy<X>` → `asSpy<X>(TestBed.inject(X))`, import and all                                                             |
| `no-done-callback`                | `error` | —                 | `it('x', (done) => …)` → `async` + an awaited assertion, and `done.fail(…)` at the call site                                              |
| `no-floating-assertion`           | `error` | —                 | `expect()` in a `.then()` nobody awaits → `expect(await promise)`                                                                         |
| `no-bare-called-with`             | `error` | —                 | `spy.m.calledWith(1);` as a statement — a stub nobody continued, asserting nothing; chai's `expect(fn).to.have.been.calledWith()` exempt  |
| `no-overridden-provider`          | `error` | suggest           | two providers for one token in one array → the earlier one never runs; the exact duplicate can be deleted                                 |
| `no-inject-before-override`       | `warn`  | —                 | `TestBed.inject()` in a hook, in a suite that still calls `override*`                                                                     |
| `no-import-time-spread`           | `error` | suggest           | `export const x = [...Imported]` at module scope → a `TypeError` while the bundle loads                                                   |
| `no-unregistered-inject-spy`      | `warn`  | —                 | `injectSpy(X)` for a token this file never registered → the real instance, whose spy helpers exist only for the compiler                  |
| `jasmine-namespace-without-entry` | `warn`  | —                 | `.and` / `.calls` / `.withArgs` on a library spy in a file that installs the compat layer nowhere — option: `{ setupModules: […] }`       |
| `no-jasmine-globals`              | `error` | —                 | `jasmine.*`, bare `spyOn(` / `spyOnProperty(` / `spyOnAllFunctions(` / `fail(` / `pending(`, `.withContext(`                              |
| `no-save-arguments-by-value`      | `error` | —                 | `spy.calls.saveArgumentsByValue()` — a no-op here, so the spec silently asserts on post-mutation state                                    |
| `prefer-native-spy-api`           | `off`   | `--fix` / suggest | `.and` / `.calls` where the spy's own API says the same thing — turn it on for the last mile off the jasmine shim                         |

Nineteen rules; three fix on their own, seven offer suggestions. The last four are for a suite
mid-migration off `jasmine-auto-spies` (§20); `prefer-native-spy-api` is **off** in the recommended
config because it reports working code — the compatibility layer is what a suite runs on while it is
being migrated. `no-mocked-for-spy` only ever touches a
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
not reported (they run later); a `static` field is.

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
vi.spyOn(TestBed.inject(DomainEventsService), 'announce'); // flagged, always was
const domainEvents = TestBed.inject(DomainEventsService);
const announceSpy = vi.spyOn(domainEvents, 'announce'); // flagged now
```

The variable is resolved through the scope manager, so it has to be a `const`/`let` initialised
from `TestBed.inject(...)` and never assigned again — a name bound by an import, a parameter, or a
`let` that is reassigned is left alone.

`no-inject-before-override` catches the trap this plugin's own advice sets. `TestBed.inject()` in a
`beforeEach` — the line you write once `provideAutoSpy(X)` has taken away the literal you used to
configure — instantiates the module, and every `TestBed.override*` afterwards throws, including one
written above it inside a `createComponent` helper. Configure the double after the overrides
(`injectSpy(X)` in the test), or keep the access lazy: `const api = () => injectSpy(Api)`. The check
is order-free by design, since a helper declared above the hook still runs after it.

The legacy `.eslintrc` `plugins: []` form cannot work — it resolves names to `eslint-plugin-*`
packages, which a subpath export can never be.

---

## 17. Error → fix

| Message contains                                                                             | Cause                                                                                                                                                | Fix                                                                                                                               |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `No mock adapter registered`                                                                 | no runtime entry was imported, or the wrong one                                                                                                      | import `vitest-auto-spy` (Vitest) / `…/bun` / `…/node` once before creating spies                                                 |
| `Observable spies require rxjs`                                                              | the rxjs layer was never loaded                                                                                                                      | `import 'vitest-auto-spy/rxjs';` once, in the setup file                                                                          |
| `Cannot read properties of undefined (reading 'returnValue')` on `spy.m.and.…`               | the jasmine namespaces are not installed — the spy was built before them, or nothing installed them at all                                           | import from `vitest-auto-spy/jasmine`; on Bun / `node:test`, `enableJasmineCompat()` in the setup file (§20)                      |
| `spy.withArgs is not a function`                                                             | the same, seen from the argument-matching side                                                                                                       | the same — or write `spy.m.calledWith(a).mockReturnValue(v)`, which needs no layer (§20)                                          |
| `jasmine is not defined`                                                                     | jasmine's global is the runner's, and Vitest declares none                                                                                           | `import { jasmine } from 'vitest-auto-spy/jasmine'`, then `codemod --from jasmine` to rewrite the members (§20)                   |
| `done.fail is not a function`                                                                | Vitest passes a `TestContext`, not jasmine's `done`; the line usually sits in an `error` callback nobody awaits, so the run stays **green**          | assert on the failure — `await expect(firstValueFrom(src$)).rejects.toMatchObject({ … })`, or `expect.fail(message)`              |
| a `.withContext('…')` message that never appears in the failure output                       | Vitest's chai layer has an `@internal` `withContext(flags)`; handed a string it walks the character indices, sets nonsense flags and returns `this`  | `expect(actual, 'message').toBe(expected)` — the second argument of `expect` is the label. Nothing throws, so nothing warns (§20) |
| `requested method(s) not found on the class prototype`                                       | typo, or an instance-field callable                                                                                                                  | fix the name, or move it to `instanceMethodsToSpyOn`                                                                              |
| `was configured with 'mustBeCalledWith'`                                                     | the code called the spy with other arguments                                                                                                         | that is the assertion firing — fix the code, or relax to `calledWith`                                                             |
| `extendWithAutoSpies needs Vitest 4.1 or newer`                                              | the `test` handed in has only the object-form `extend` (Vitest ≤ 4.0); the builder form the helper is written against arrived in 4.1                 | upgrade Vitest, or keep `provideAutoSpy` + `injectSpy` in a `beforeEach` until then                                               |
| `advanceTimers() requires fake timers`                                                       | no fake timers installed                                                                                                                             | `setupFakeTimers()` or `vi.useFakeTimers()` first                                                                                 |
| `Nothing configured X.method, and strict mode is on`                                         | a strict double was asked for a method no line configured                                                                                            | configure it (`mockReturnValue` / `resolveWith` / `nextWith` / `calledWith`), or `{ strict: false }` on that double (§5)          |
| `Cannot redefine property: …` from a library accessor spy                                    | the target is an ES module namespace a bundler inlined                                                                                               | no spy library can win this — give the code a real seam (inject it, pass it in) and spy on that                                   |
| `overrideComponentProvider(…): the override did not apply`                                   | the component injects a different token, or a later `overrideProvider` won                                                                           | pass the token the component actually injects (a base class, an `InjectionToken`), and override after nothing else re-configures  |
| `the test ended with N unflushed HttpTestingController request(s)`                           | `enableAngularDiagnostics({ pendingRequests })` — nothing answered them                                                                              | flush each (`controller.expectOne(url).flush(body)`), or `controller.verify()` where absence is the assertion (§13)               |
| `NgModule(s) with an empty runtime scope: …`                                                 | `ngModuleScopes` (or `assertNgModuleScopes`) — an AOT test bundle stripped `ɵɵsetNgModuleScope`, so the import contributes nothing                   | declare what the spec needs in the TestBed module directly; pass only modules expected to bring declarations (§13)                |
| `Cannot read properties of undefined (reading 'provide')`, stack inside `render3/di_setup`   | a barrel chunk had not run when the component's definition was built, so a provider slot is `undefined`                                              | `assertComponentDefIntact(Cmp)` before `createComponent` — it names the list and the index (§13)                                  |
| `assertComponentDefIntact(): argument N is undefined, which carries no ɵcmp or ɵdir`         | the class reference itself never arrived — the `Cannot read properties of undefined (reading 'ɵcmp')` case                                           | the same split barrel; import the component from its own module, not the barrel (§13)                                             |
| `TS1117: An object literal cannot have multiple properties with the same name`, in a fixture | a hundred-line model literal copied into eight specs and edited independently                                                                        | one `createFixtureFactory<T>(defaults)`; note the runtime keeps the **second** key, so do not auto-fix by dropping one (§12)      |
| `configureTestingModule was given N schema(s) that can never apply`                          | `enableAngularDiagnostics({ deadSchemas })` — `schemas` next to a standalone component, with `declarations` empty                                    | drop the `schemas` entry and put the missing directive/pipe in the component's own `imports`, or use `createDirectiveHost` (§13)  |
| `injectSpy(X): the injector returned a plain instance, not an auto-spy`                      | the token is provided for real; a `console.warn` on its own, a **throw** under `enableAngularDiagnostics({ unspiedProviders })`                      | `provideAutoSpy(X)` / `provideAutoSpyForToken(TOKEN)`, or `TestBed.inject(X)` if the real thing is what the spec wants            |
| `trackInjections(...).get(X): that token is not tracked by this log`                         | `get` only answers for tokens whose providers the log created                                                                                        | add the token to the `trackInjections([...])` list, or read it from the injector directly (§13)                                   |
| `Spread syntax requires ...iterable[Symbol.iterator] to be a function`, at load time         | a module-scope spread of an imported binding, inside a bundle                                                                                        | build the array in a function or a getter — `no-import-time-spread` (§16)                                                         |
| `the timers APIs are not mocked` in a nested `describe`'s `beforeAll`                        | fakes armed in `beforeEach` only; Jest armed them for the whole file                                                                                 | `setupFakeTimers(cfg, { betweenTests: true })` / `setupAutoSpy({ globalFakeTimers: true })`                                       |
| setup-file hooks reaching only the first spec file of a worker                               | the setup module stayed cached (Angular unit-test builder + coverage)                                                                                | run coverage with `--isolate`, or call `setupAutoSpy()` from a per-file module                                                    |
| `no DOM could be installed`                                                                  | `bun-angular` preload with no DOM package                                                                                                            | `bun add -d @happy-dom/global-registrator` (or `jsdom`)                                                                           |
| `cannot read "…" referenced by …`                                                            | a `templateUrl` / `styleUrls` path does not resolve                                                                                                  | fix the path, relative to the component file                                                                                      |
| duplicate-copy report from `setupAutoSpy()`                                                  | two installs, or one loaded as both ESM and CJS                                                                                                      | dedupe the dependency; `setupAutoSpy({ duplicateCopies: 'warn' })` to downgrade                                                   |
| `Type 'Spy<T>' is not assignable to type 'T'`                                                | `Spy<T>` drops private members — by design                                                                                                           | declare as `Spy<T>`, or use `asInstance()` / `asSpy()` (§6)                                                                       |
| a spy is never called, no warning                                                            | the method is an instance field, not on the prototype                                                                                                | `instanceMethodsToSpyOn`, or `createAutoMock<T>()`                                                                                |
| `Cannot access '__vi_import_N__' before initialization`                                      | `vi.mock()` on `@angular/core` or a relative path                                                                                                    | you cannot mock it — the specs are bundled. Assert the result instead                                                             |
| `AggregateError at Object.dispatchError`, for a request nothing asserts on                   | jsdom really served an `XMLHttpRequest` — `blockNetwork` used to cover only `fetch`                                                                  | `setupAutoSpy({ blockNetwork: true })`, or `{ xhr: 'empty' }` for tracker pings (§10)                                             |
| `Schedulers cannot synchronously execute watches while scheduling`                           | a timer from a **previous** file, under `isolate: false`                                                                                             | track and cancel pending timers/frames in the setup file (§10)                                                                    |
| `signal read during notification phase`                                                      | same — a stray `requestAnimationFrame` callback                                                                                                      | same                                                                                                                              |
| an assertion error printed to stderr, every test green and the run exiting 0                 | zone.js swallowed a rejection nobody handled                                                                                                         | `setupAutoSpy({ strayRejections: true })` fails the test it surfaced in (§10)                                                     |
| an `expect()` inside a `.then()` that never seems to run                                     | nothing awaits the chain, so the test ended first                                                                                                    | `await` the promise and assert the settled value — `no-floating-assertion` (§16)                                                  |
| `trackStrayRejections() found no zone.js on the host`                                        | `strayRejections` turned on where zone.js is not loaded                                                                                              | `import 'zone.js';` in the setup file, or drop the option                                                                         |
| `… .destroy is not a function`                                                               | an ngrx `rxMethod` replaced with a bare mock                                                                                                         | `Object.assign(vi.fn(), { destroy: vi.fn() })`                                                                                    |
| `NullInjectorError` for a service you did provide                                            | it is a component-level provider, not a module one                                                                                                   | `asSpy(fixture.debugElement.injector.get(X))`, not `injectSpy(X)`                                                                 |
| `runEffect(): … not an EffectRef returned by effect()`                                       | passed the callback, a signal, or an unassigned field                                                                                                | pass what `effect()` returned; a field may need its lifecycle hook to run first                                                   |
| `X is not a constructor`, stack in production code                                           | a `vi.fn(() => …)` where the code does `new X()`                                                                                                     | `mockConstructor` / `stubConstructor` / `createSpyClass` (§12)                                                                    |
| `Date is not a constructor`                                                                  | `vi.spyOn(globalThis, 'Date')` — the fakes own it                                                                                                    | `mockSystemTime(date)` / `vi.setSystemTime`                                                                                       |
| `TS2352: … 'accessorSpies' is missing in type 'X'`                                           | `TestBed.inject(X) as Spy<X>`                                                                                                                        | `asSpy(TestBed.inject(X))` — never a double assertion (§6)                                                                        |
| `TS2739` / `TS2740` / `TS2345` with `Spy<X>` on the left                                     | a spy handed to an API typed against the class                                                                                                       | `asInstance(spy)` (§6)                                                                                                            |
| `is missing the following properties: _private, …`                                           | declared as Vitest's `Mocked<T>`                                                                                                                     | declare `Spy<T>` (§6)                                                                                                             |
| `AddPromiseSpyMethods<unknown>` vs `WithMockReturnValue<…>`                                  | a generic class inferred as `Service<any>`                                                                                                           | `asSpy<Service>(…)` / `injectSpy<Service>(…)` (§6)                                                                                |
| `'addEventListener' called on an object that is not a valid instance of EventTarget`         | Node's `AbortSignal` under jsdom + zone.js                                                                                                           | `stubAbortController()` (§12)                                                                                                     |
| `vi.requireMock is not a function`                                                           | a mechanical `jest.` → `vi.` rename                                                                                                                  | there is no equivalent — provide the double through the TestBed instead                                                           |
| a `vi.mock()` factory that never applies, only sometimes                                     | under `isolate: false` the module was already in the worker's graph                                                                                  | do not mock it; inject the dependency, or `vi.hoisted()` + a real seam                                                            |
| a `vi.mock()` of a workspace alias that never applies at all                                 | a bundler inlined the module before the mock could be installed                                                                                      | `assertMocked(ns, { specifier })` to prove it, then inject instead of mocking                                                     |
| `No "default" export is defined on the mock`, thrown inside a dependency                     | a factory returning bare named exports; the dep probes `default`                                                                                     | `vi.mock('x', () => moduleNamespace({ … }))`                                                                                      |
| `Not implemented: HTMLMediaElement.play`, or `duration` is `NaN` and cannot be set           | jsdom implements the media elements as a shell                                                                                                       | `stubMediaElement({ duration })`, then `media.set(el, …)` to fire the events                                                      |
| `Cannot set base providers because it has already been called`                               | zone and zoneless spec files sharing one worker                                                                                                      | `setupAngularTestEnv({ zoneless, initZone, initZoneless })` (§13)                                                                 |
| a stub that works in the first test of the file and in no other                              | installed at `describe` level or in `beforeAll`, then restored away                                                                                  | install it in `beforeEach`, or `installPerTest(() => stub…())`                                                                    |
| a third-party library failing every other run, no test named                                 | a test sealed a global with `Object.defineProperty` (non-configurable)                                                                               | `setupAutoSpy({ guardGlobals: 'throw' })` names the file; then `mockValueProp`                                                    |
| `expected [ { at: 1, …(5) }, …(8) ] to deeply equal [ { …(6) }, … ]`                         | one field moved in every element — usually a frozen clock or an id                                                                                   | `expect(diffByField(actual, expected)).toBeUndefined()`                                                                           |
| a hand-tuned number of turns waiting for a `resource()` to load                              | a resource needs a change-detection **tick**, not event-loop turns; `flushEventLoopUntil` never ticks and the resource never even issues its request | `flushEffects()`, flush the request, then `await settleResource(r, { label })`                                                    |
| a `resource()` assertion that passes but reads the **default** value                         | the spec asserted before the resource left `loading`                                                                                                 | `await settleResource(r, { label })` — it fails loudly instead                                                                    |
| a spec dying on the runner's 5 s file timeout right after `await stable(fixture)`            | the fixture never stabilised — an unflushed request, a real `setInterval`                                                                            | `stable` now fails at 2000 ms naming the cause; raise `{ timeout }` only once neither is true                                     |
| `flushEventLoopUntil` timing out on the **first** such test only, the rest green             | a cold dynamic `import()` outran the turn budget; later tests hit the module cache                                                                   | `await settleDynamicImport(() => import('…'))` — await the module, do not count turns                                             |
| `Expected to be running in 'ProxyZone', but it was not found`                                | `zone.js/testing` patches jasmine/mocha/jest, not Vitest                                                                                             | `import 'vitest-auto-spy/zone'` after zone.js, with `globals: true` (§14)                                                         |
| `nextWith` demanding `HttpEvent<T>` on a generated API client                                | `Parameters`/`ReturnType` read the **last** overload                                                                                                 | `asSpy<Client, { overload: 'first' }>(…)`, or `Overload<M, 0>`                                                                    |
| `NG0303` / `NG0304` / nothing at all, from a directive spec                                  | the host is `standalone: false`, or the module is in the TestBed                                                                                     | `createDirectiveHost({ template, scope: [Module] })` (§13)                                                                        |
| `TS2540: Cannot assign to 'X' because it is a read-only property`                            | a `readonly` field of an object under test                                                                                                           | `mockValueProp(obj, 'X', value)` — on a class **getter**, `mockReadonlyProp`                                                      |
| `TypeError: Cannot read properties of undefined (reading 'mockReturnValue')`                 | the member is an **instance field**, not on the prototype — `Router.currentNavigation` since Angular 20                                              | `provideAutoSpy(Router, { instanceMethodsToSpyOn: ['currentNavigation'] })` (§5)                                                  |
| `throwWith` reaching the success branch first, with the previous test's value                | the spy's `ReplaySubject(1)` outlived the test that filled it                                                                                        | upgrade; and `resetAutoSpy(spy)` in `beforeEach` when the TestBed is built in `beforeAll`                                         |
| `TS2540` on a `Spy<T>` / `createAutoMock` member, which the runtime writes fine              | `Spy<T>` is homomorphic, so it keeps the `readonly` of an abstract getter                                                                            | `Mutable<Spy<T>>` for direct assignment, or `mockValueProp` for a patch that is undone                                            |
| `delete mock.optionalMethod` leaving the member present and truthy                           | the Proxy had no `deleteProperty` trap before 3.5.0                                                                                                  | upgrade; before that, `mock.optionalMethod = undefined`                                                                           |
| half a double's methods reaching the real implementation after `Object.assign`               | `ownKeys` on a type-driven Proxy lists only the keys already read                                                                                    | `createSpyFromClass(X)` — a real object, with enumerable method keys                                                              |
| `let s: MockInstance<() => unknown>` not matching anything                                   | `MockInstance<F>` is invariant in `F`; Jest's `SpyInstance` was not                                                                                  | `MockInstance<T['method']>`, or better `injectSpy(X).method`                                                                      |
| two runs with the same totals, one of them missing a suite                                   | a lost `describe` and a fixed flake cancel out in the counters                                                                                       | `compareTestRuns(before, after)` — compare the set of names, not the numbers                                                      |
| a 30 s timeout, in a different file each run                                                 | module-level `vi.fn()` in a fixture shared by files                                                                                                  | make the fixture a factory (§10)                                                                                                  |
| a component's `afterNextRender` state is empty                                               | `detectChanges()` does not run the after-render phase                                                                                                | `await stable(fixture)` (§11)                                                                                                     |
| a green test whose only line about a call is `spy.m.calledWith(1);`                          | that is a **stub**, not an assertion — chai's `expect(fn).to.have.been.calledWith(x)` is the one that checks                                         | continue the chain, or `expect(spy.m).toHaveBeenCalledWith(1)` — `no-bare-called-with` (§16)                                      |
| `--detect-async-leaks` reporting no leaks in a suite that visibly leaks timers               | `setupAutoSpy({ strayTimers: true })` cancelled them before Vitest collected                                                                         | re-run that file with `strayTimers` off; the warning on stderr says how many were taken (§10)                                     |

**Seven of these are library defects, not spec ones.** On anything below 3.8.0, upgrade and change
nothing in the spec: `of(double)` never emitting; `accessorSpies.setters.X` still `undefined` after
`gettersToSpyOn: ['X']`; a `mock*Prop` on a `createAutoMock` double changing nothing;
`gettersToSpyOn` rejecting a `Signal` key; `mockReadonlyProp` rejecting a real `signal()`;
`mockReturnValue` missing on a generic method; a `mock*Prop` patch surfacing in a `describe` that
never patched anything.

---

## 18. Do not write this

| ❌                                                                          | ✅                                                                      |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `import … from 'jest-auto-spies'`                                           | `import … from 'vitest-auto-spy'`                                       |
| `vitest-auto-spy` inside a `bun test` file                                  | `vitest-auto-spy/bun`                                                   |
| `let s: MyService = createSpyFromClass(MyService)`                          | `let s: Spy<MyService> = …`                                             |
| `createSpyFromClass(X) as unknown as X`                                     | `asInstance(createSpyFromClass(X))`                                     |
| `{ provide: X, useValue: { a: vi.fn(), b: vi.fn() } }`                      | `provideAutoSpy(X)`                                                     |
| `vi.spyOn(TestBed.inject(X), 'method')`                                     | `injectSpy(X).method`                                                   |
| `Object.defineProperty(service, 'ready', { value: true })`                  | `mockReadonlyProp(service, 'ready', true)`                              |
| `source$.subscribe(v => expect(v).toBe(1))`                                 | `await expect(expectEmission(source$)).resolves.toBe(1)`                |
| `await lastValueFrom(done$, { defaultValue: undefined })`                   | `await expectCompletion(done$)`                                         |
| `{ timeout: 0 }` on every helper because timers are faked                   | `setEmissionTimeout(100)` once, in the setup file                       |
| `{ provide: AbstractToken, useValue: createAutoMock<T>() }`                 | `provideAutoSpy(AbstractToken)`                                         |
| `mockDeep<T>()` for a chain that goes through a **call**                    | `mockDeep<T>({}, { selfReturning: true })`                              |
| `await expect(expectEmission(x$)).rejects.toBe(originalError)`              | `await expect(expectError(x$)).resolves.toBe(originalError)`            |
| `source$.pipe(skip(1))` / `pipe(filter(p))` in front of the helper          | `expectEmission(source$, { skip: 1 })` / `{ until: p }`                 |
| hold the promise, `vi.runAllTimers()`, then await                           | `expectEmission(source$, { advance: () => vi.runAllTimers() })`         |
| `injectSpy(X)` then a `mockReturnValue` per method in `beforeEach`          | `provideAutoSpy(X, { returns: { … }, overrides: { … } })`               |
| a local `injectSpy` wrapper with `as never` + `as Spy<T>`                   | the library's — it also takes an `InjectionToken`                       |
| a hand-written double for a token with `Observable` members                 | `provideAutoSpyForToken(T, undefined, { observablePropsToSpyOn: […] })` |
| `mockDeep<T>() as unknown as T` to satisfy an API typed against `T`         | `asInstance(mockDeep<T>())`                                             |
| `from([double])` to stop `of(double)` swallowing the double                 | `of(double)` — `schedule` is no longer answered (§2)                    |
| `spy.instanceField.mockReturnValue(…)` on a member Angular moved            | `provideAutoSpy(X, { instanceMethodsToSpyOn: ['…'] })` (§5)             |
| `expect(component.total).toBeTruthy()` (a signal)                           | `expect(component.total).toHaveSignalValue(3)`                          |
| `fixture.detectChanges()` then assert signal state                          | `await stable(fixture)` then assert                                     |
| `onlyMethodsToSpyOn: [...]` "to add a method"                               | omit it, or use `instanceMethodsToSpyOn`                                |
| a `vi.fn()` the code calls with `new`                                       | `createSpyClass(Foo)` / `mockConstructor(factory)`                      |
| an exported `const` fixture holding `vi.fn()`s                              | an exported **factory** that returns it (§10)                           |
| `let s: Mocked<MyService>` (Vitest's own type)                              | `let s: Spy<MyService>`                                                 |
| `it('x', (done) => …)` / `beforeEach((done) => …)`                          | `async` + `await` — Vitest passes a `TestContext`, not `done`           |
| `{ ...modelInstance, flag: true }` (drops every getter)                     | `withOverrides(modelInstance, { flag: true })`                          |
| `if ('params' in link) … else throw` in every spec                          | `narrow.byKey(link, 'params')`                                          |
| five `asInstance(...)` in one call                                          | `...asInstances(a, b, c, d, e)`                                         |
| `vi.stubGlobal('Image', vi.fn(() => ({ src: '' })))`                        | `stubConstructor(globalThis, 'Image', () => ({ src: '' }))`             |
| `Object.defineProperty(document, 'cookie', { value })`                      | `mockValueProp(document, 'cookie', value)`                              |
| `vi.spyOn(globalThis, 'Date')`                                              | `mockSystemTime('2025-04-30T00:00:00Z')`                                |
| ten `await Promise.resolve()` for a dynamic `import()`                      | `await settleDynamicImport(() => import('…'))`                          |
| `await fixture.whenRenderingDone()`                                         | `await stable(fixture)`                                                 |
| an exported `const` provider with `vi.fn()` inside                          | an exported **factory** returning it (§10)                              |
| `.overrideProvider(X, provideAutoSpy(X))` (works, but says the wrong thing) | `.overrideProvider(X, overrideAutoSpy(X))`                              |
| `TestBed.overrideComponent` to swap a provider                              | `overrideComponentProvider(Cmp, X)`                                     |
| `{ target, isIntersecting } as unknown as IntersectionObserverEntry`        | `intersectionEntry(target, true)`                                       |
| an assertion containing a date, with no clock set                           | `mockSystemTime(iso)` first                                             |
| `configureTestingModule` inside every `it()`                                | one per `describe`                                                      |
| `vi.mock('@angular/core')` to neutralise `effect()`                         | set the signals, `await stable(fixture)`, assert the result             |
| a second `vi.spyOn(console, 'error')`                                       | `consoleErrorSpy` from `vitest-auto-spy/console`                        |
| `mockReadonlyProp(c, 'items', vi.fn(() => []))`                             | `mockReadonlyProp(c, 'items', signal([]))` — a real signal              |
| `spy.m.mockReturnValue(subject$)` for a `vi.fn(() => subject$)`             | `spy.m.mockImplementation(() => subject$)` — the variable is re-read    |

**The one mechanical rename in a migration that is not equivalent.** `vi.fn(() => x)` reads `x`
when the double is _called_; `mockReturnValue(x)` freezes the value `x` had when the double was
_configured_. They are indistinguishable until the test reassigns `x` — and the commonest reason to
do that is a fresh `Subject` after the previous one has been `error()`ed or completed, which is
exactly the case a suite is testing when it reassigns. The double then keeps handing out the dead
one: in one spec the service received a completed subject and silently skipped the modal it was
meant to show, with the test still green. Carry `vi.fn(() => x)` over as
`mockImplementation(() => x)`, and keep `mockReturnValue` for a literal. Worth saying out loud to
anyone writing a codemod, because the rename looks like the safest edit in the file.

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
pragma the runner never reads, and configuration left behind for a runner that is gone. It is
worth one run after any large edit to a test suite — especially after a codemod, which is where
the eaten glob below came from. Full reference:
<https://asdalexey.github.io/vitest-auto-spy/utilities/cli>.

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

### If you are writing a codemod over specs

Two traps, both found the hard way on rxjs-heavy code.

**`String.prototype.replace` interprets `$` in the replacement.** `$&`, `` $` ``, `$'` and `$n` are
substitution patterns, and `$'` — "everything after the match" — is one character away from every
observable name in the codebase. A replacement containing `forceRequeryAndStartPlaybackAt$'`
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

`jasmine-auto-spies` and `jest-auto-spies` are the same library twice — both thin layers over
`@hirez_io/auto-spies-core`, with identical configuration keys (`methodsToSpyOn`,
`observablePropsToSpyOn`, `gettersToSpyOn`, `settersToSpyOn`) and identical helper names.
**Exactly one thing differs**: upstream parks its async helpers behind `.and`, because that is where
jasmine keeps its own spy strategies.

```ts
spy.load.and.nextWith(account); // jasmine-auto-spies
spy.load.nextWith(account); // jest-auto-spies, and this library
```

**Land it green first, rewrite second.** `vitest-auto-spy/jasmine` puts `.and`, `.calls` and
`.withArgs` back on every spy, so the import specifier is the only edit needed to get the suite
running — and the first red run then has one candidate cause instead of two:

```diff
- import { createSpyFromClass, provideAutoSpy, type Spy } from 'jasmine-auto-spies';
+ import { createSpyFromClass, provideAutoSpy, type Spy } from 'vitest-auto-spy/jasmine';
```

```bash
npx vitest-auto-spy codemod --from jasmine            # dry run
npx vitest-auto-spy codemod --from jasmine --write    # apply, then drop the import
npx vitest-auto-spy codemod --from jasmine --verify   # match the result, not the diff
```

`import { jasmine } from 'vitest-auto-spy/jasmine'` restores the whole `jasmine` namespace
(`objectContaining`, `any`, `createSpyObj`, `clock()`, `addMatchers`, and the eight asymmetric
matchers Vitest has no twin for) for the specs that never touched auto-spies. Nothing is installed
on `globalThis` — it is one explicit line per file, which the codemod later deletes.

### The renames, once the suite is green

| jasmine                                    | here                                                       |
| ------------------------------------------ | ---------------------------------------------------------- |
| `spy.m.and.returnValue(v)`                 | `spy.m.mockReturnValue(v)`                                 |
| `spy.m.and.callFake(fn)`                   | `spy.m.mockImplementation(fn)`                             |
| `spy.m.and.stub()`                         | `spy.m.mockImplementation(() => undefined)`                |
| `spy.m.and.returnValues(a, b)`             | `.mockReturnValueOnce(a).mockReturnValueOnce(b)`           |
| `spy.m.and.throwError('boom')`             | `.mockImplementation(() => { throw new Error('boom'); })`  |
| `spy.m.and.resolveTo(v)`                   | `spy.m.mockResolvedValue(v)`                               |
| `spy.m.and.nextWith(v)` / `resolveWith(v)` | `spy.m.nextWith(v)` / `spy.m.resolveWith(v)` — drop `.and` |
| `spy.m.withArgs(a).and.returnValue(v)`     | `spy.m.calledWith(a).mockReturnValue(v)`                   |
| `spy.m.calls.count()` / `argsFor(i)`       | `spy.m.mock.calls.length` / `spy.m.mock.calls[i]`          |
| `spy.m.calls.reset()`                      | `spy.m.mockClear()`                                        |
| `jasmine.createSpy('n')`                   | `vi.fn()` — or `createFunctionSpy<F>('n')`, which is typed |
| `jasmine.any(X)` / `objectContaining({…})` | `expect.any(X)` / `expect.objectContaining({…})`           |
| `jasmine.clock().tick(n)`                  | `vi.advanceTimersByTime(n)` — or `await advanceTimers(n)`  |
| `jasmine.SpyObj<T>` / `jasmine.Spy`        | `Spy<T>` from this package / `Mock` from `vitest`          |
| `expect(x).toBeTrue()` / `toHaveSize(n)`   | `.toBe(true)` / `.toHaveLength(n)`                         |
| `expect(spy).toHaveBeenCalledOnceWith(a)`  | `.toHaveBeenCalledExactlyOnceWith(a)`                      |
| `fail(msg)`                                | `expect.fail(msg)` — there is no `vi.fail`                 |

### Four traps, all of them silent

1. **`spyOn(o, 'm')` inverts.** jasmine's `spyOn` installs a **stub**; `vi.spyOn` **calls through**.
   A bare rename compiles, passes, and starts running the real implementation inside every spec that
   installed the spy in order to stop it. Write
   `vi.spyOn(o, 'm').mockImplementation(() => undefined)` — the codemod appends exactly that, and a
   file whose only jasmine construct is `spyOn(` is deliberately **not** auto-detected: that suite
   has to say `--from jasmine` out loud.
2. **`.withContext('msg')` does not throw — it loses the message.** Vitest's chai layer ships an
   `@internal` method of that name expecting a _flags object_; handed a string it walks the string's
   character indices, sets nonsense flags and returns the assertion. The chain runs, the failure
   reads `AssertionError: expected 2 to be 3`, and the label is gone. Write
   `expect(actual, 'msg').toBe(expected)`.
3. **`.calls.saveArgumentsByValue()` is a no-op here.** No runner in this family copies call
   arguments. The call still runs, nothing fails, and a spec that relied on it silently starts
   asserting on post-mutation state. Take the copy at call time, inside a `mockImplementation`.
4. **`.and.callThrough()` means something different.** Upstream had no original to call through to
   and silently answered `undefined`; here it restores **this library's own dispatch**, so a
   `calledWith` chain decides the value again. The codemod leaves it byte-for-byte and names the
   line, because there is no expression it could become.

`jasmine.DEFAULT_TIMEOUT_INTERVAL` is a config setting, not a statement: set **both**
`testTimeout` (default 5 000 ms) and `hookTimeout` (default 10 000 ms), or
`vi.setConfig({ testTimeout: n, hookTimeout: n })` per file. Assigning to it on the namespace warns
once naming both rather than silently swallowing the write.

`it('x', (done) => …)` is **not** rewritten by anything — a callback signature is a control-flow
shape, not a name. Use `async` + `await`; `no-done-callback` reports both the parameter and any
`done.fail(…)`.

On Bun and `node:test` the entry cannot be imported (it registers the Vitest adapter, which means
importing `vitest`). Call `enableJasmineCompat()` from `vitest-auto-spy/jasmine-compat` once, in a
setup file — spies built **before** the call do not get the namespaces. Observables still come from
`vitest-auto-spy/rxjs`. A project that never imports the entry pays one `undefined` check per spy
and ships none of the code.

### `@hirez_io/observer-spy` comes with it

That package sits beside `jasmine-auto-spies` in almost every suite that has one, and is the larger
of the two by an order of magnitude. `vitest-auto-spy/rxjs` exports the same surface —
`subscribeSpyTo(source$, config?)`, `SubscriberSpy<T>`, `ObserverSpy<T>`, `ObserverSpyConfig` — so a
migration does not have to rewrite every stream assertion in the same commit:

```ts
import { subscribeSpyTo } from 'vitest-auto-spy/observer-spy';

const spy = subscribeSpyTo(service.load());

expect(spy.getValues()).toEqual(['a', 'b']);
expect(spy.receivedComplete()).toBe(true);
```

Four departures from upstream, each closing a defect: `getValues()` returns a **copy** (upstream
hands back its live array) and is typed `T[]` (upstream: `any[]`); `getFirstValue()` /
`getValueAt(i)` **throw** on an empty spy rather than returning `undefined` from a `T` signature;
and an **unexpected** error is thrown by the value readers, carrying the original as `cause`, rather
than rethrown out of the observer — under rxjs 7 that rethrow goes through `reportUnhandledError`
and never reaches the subscribing line. `{ expectErrors: true }` keeps the readers open, as upstream.

`autoUnsubscribe()`, `queueForAutoUnsubscribe()` and `fakeTime()` are **not implemented**. Use
`using spy = subscribeSpyTo(source$)` — `SubscriberSpy` is disposable — and `setupFakeTimers()` with
`await advanceTimers(ms)`, or rxjs's `TestScheduler` directly.

**It is a bridge, and the destination differs in kind.** observer-spy is synchronous inspection:
subscribe, let things happen, then read. A stream that never emits leaves a spy with no values, so a
spec reading `getValues()` gets `[]`, asserts about it, and passes having observed nothing. §8's
`expectEmission` / `expectEmissions` invert that — the assertion _is_ the await, and silence is a
failure with a watchdog. Land the suite green on `subscribeSpyTo`, then move the assertions over.

Full mapping, including what upstream cannot do at all:
<https://asdalexey.github.io/vitest-auto-spy/migrating-jasmine>.
