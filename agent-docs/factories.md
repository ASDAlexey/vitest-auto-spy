# vitest-auto-spy — Pick the factory

Part of the agent reference [`AGENTS.md`](../AGENTS.md), which maps every section to its file. Section numbers are shared with it.

## 2. Pick the factory

```
Do you have a real class at runtime?
├── yes → createSpyFromClass(Class, config?)          → Spy<T>
│         (an `abstract class` DI token counts — see below)
└── no  → Is the double CALLED by the code under test?
         ├── yes, and a DI container INJECTS it     → createAutoMock<T>(overrides?)  → Spy<T>
         ├── yes, and the spec PASSES it (an argument, `new X(double)`), asserted on
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

Every factory in the tree is imported from the runner's entry (`vitest-auto-spy` on Vitest), and
the `Spy`, `AutoMocked` and `DeepMockProxy` types come from the same line:

```ts
import { type AutoMocked, type Spy, asInstance, autoMocked, createSpyFromClass } from 'vitest-auto-spy';

const repo: Spy<InvoiceRepository> = createSpyFromClass(InvoiceRepository); // a real class
const logger: AutoMocked<Logger> = autoMocked<Logger>(); // an interface, passed as an argument

const service = new InvoiceService(asInstance(repo), logger); // Spy<T> needs asInstance; AutoMocked<T> is already a T
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

**Options alone go in the first argument** when nothing is seeded:
`createAutoMock<EventSource>({ returnsUndefined: ['close'] })`. The single argument is read as options
only when every key is an option and at least one is `returnsUndefined`, `selfReturning`,
`returnsClass`, `observablePropsToSpyOn`, `onUnstubbedCall` or `onUnstubbedRead`; `autoMocked` reads
it the same way. `{ strict: true }`, `{ name }` or `{ returns }` alone could be members of `T`, so the
compiler rejects them there — pass them second, `createAutoMock<T>(undefined, { strict: true })`. Any
second argument (`{}` included) keeps the first a seed.

**A method that returns another class's double is one entry:** `returnsClass: { create: Report }` on
any factory that takes `returns` builds `createSpyFromClass(Report)` once per outer double and makes
`create()` answer it. Reach it with `innerDouble(factory, 'create')` — typed `Spy<Report>`, and it
records no call, so a spec asserting `create`'s call count uses it too (`asSpy(factory.create('a'))`
is a recorded call). `innerDouble` throws for a method with no `returnsClass` entry. When the inner
double needs options of its own — a `void` method under `strict` — pass a pair:
`returnsClass: { open: [SnackBarRef, { returnsUndefined: ['dismiss'] }] }`; the options are typed
against `SnackBarRef`. A preset double goes in as a builder, called once per outer double:
`returnsClass: { open: { build: () => createMatDialogRef(MatDialogRef, { closedWith: 'ok' }).ref } }`.
A generic method reads back with its type parameters as `unknown` (`Spy<MatDialogRef<unknown>>`);
name the type, `innerDouble<MatDialogRef<SaveDialog>>(dialog, 'open')` — unchecked, like a cast.

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
`createAutoMock<T>({ selfReturning: ['channel'] })` when only one method chains:

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

**A deep node asks what the spy surface is on every read**, so under `isolate: false` a later
`import 'vitest-auto-spy/rxjs'` or `setSpyEngine` reaches doubles built earlier:
`deep.feed.items.nextWith(1)` emits.

**`selfReturning: true` chains a factory, not a `return this` builder**, and the difference decides
where the calls are recorded. A called node answers _itself_, not the object the method was read
off, so every hop moves one level deeper: `editor.chain().focus().insertContent('text')` records
`insertContent` on `chain.focus`, while the `chain` handle the spec is holding still has none — and
`expect(chain.insertContent).toHaveBeenCalled()` reports nothing although the chain ran. Either walk
the same path in the assertion, or, for an API where every command answers the **same** object
(tiptap's `ChainedCommands`, a query builder, a `mockReturnThis()` chain), build that object with
`createAutoMock` instead, where `selfReturning` names methods that answer one double:

```ts
const chain = createAutoMock<ChainedCommands>({ selfReturning: ['focus', 'insertContent'] });
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
reach for `{ provide: X, useValue: createAutoMock<X>() }` by hand.

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
and takes the write. The same holds for a seed that comes through `registerAutoSpyDefaults`.

**On `createSpyFromClass` / `provideAutoSpy`, a function in `overrides` for a method stays a spy.**
`provideAutoSpy(DomSanitizer, { overrides: { sanitize: (_c, v) => String(v) } })` makes `sanitize` a
spy whose implementation is the function: `expect(spy.sanitize).toHaveBeenCalledOnce()`, `mock.calls`
and `calledWith` all work, and the function runs (with the double as `this`) until the test configures
the spy. It counts as configured under `strict`, `resetAutoSpy` brings the function back, and it wins
over `returns` / `selfReturning` for the same method. Kept exactly as seeded: a value, a getter, a
function on a non-method field, a class, and a callable with its own API — a `vi.fn()` keeps its
identity. `createAutoMock` / `provideAutoSpyForToken` still store a seed
verbatim: there, name the method in `returns` to keep it assertable.

### What a Proxy-backed double cannot do

`createAutoMock` and `mockDeep` build a Proxy, not an object, and there is one place where the
difference shows: a Proxy answers only the operations its handler traps.

| Operation | Result |
| --- | --- |
| `mockValueProp` & the other three | works, and `restoreMockedProps()` undoes it |
| `delete mock.optionalMethod` | the member is absent, until something writes to it again |
| `Object.assign(real, mock)` | copies only the keys already **read**, silently (below) |

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

The one that is hardest to spot:

```ts
of(autoMocked<AnimationItem>()); // an Observable that never emits
```

`of(...)` takes its **last argument** for a scheduler when `typeof x.schedule === 'function'`, so
the whole double was eaten as one, `of()` was left with an empty argument list, and the emission was
scheduled onto a spy that does nothing. The component under test kept its `null`, and what failed
was an assertion about an unrelated `emit()` three concerns away — nothing in the failure mentions
`of`. The workaround `from([double])` is not needed.

**`subscribe` is deliberately not on that list.** It is an ordinary method name — a store, an
Angular `OutputEmitterRef`, an event bus — and `expect(store.subscribe).toHaveBeenCalledWith(cb)` is
a real assertion. Denying `lift` and `@@observable` already breaks the impersonation, so `subscribe`
on its own fools nothing: `from(double)` fails with rxjs's own _"You provided an invalid object
where a stream was expected"_, loudly and in the right file.

If your type genuinely has one of the four, say so once and it comes back — the list is consulted
after the seed store:

```ts
createAutoMock<TaskScheduler>({ schedule: vi.fn() });
```

`toString` and `valueOf` answer `Object.prototype`'s own members instead of a fresh spy, so printing
or interpolating the double adds no keys to it and reads `'[object Object]'`, not `'undefined'`. Seed
or assign either to mock it; `returns: { toString }` is reported.

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

Building a spy is not a thing to optimise: it costs microseconds, so call the factory in
`beforeEach` and look at `TestBed` instead. Two settings do cost:

- `{ lazySpies: false }` gives up the laziness `provideAutoSpy` defaults to.
- `autoSpyAccessors: true` spies every accessor the chain declares on every double. Discovery is
  cached per class, but each accessor still costs a spy; name the ones the spec reads instead.

An unset `lazySpies` depends on width: below 8 methods, accessor placeholders; from 8, `'proxy'`
(lighter once touched, faster to build). A spec on a wide class that needs a plain object
(`util.types.isProxy`, `console.log` of an unread double, `vi.spyOn` wrapping an unread method)
passes `lazySpies: true`. Numbers: <https://asdalexey.github.io/vitest-auto-spy/core/performance>.

A frozen or sealed double works. After `Object.freeze(spy)` (a deep-freeze fixture helper, a
dev-mode state guard) a read answers a stable mock and `mockReturnValue` on it works. On a merely sealed double an assignment still
reaches the member.

`vi.spyOn(double, 'load')` on a method nobody has read yet wraps a forwarder: a configured
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
