---
title: createSpyFromClass
description: Build a fully-typed Spy<T> from a class — configuration, the Spy<T> shape, accessor spies and the edge cases.
---

# createSpyFromClass

`createSpyFromClass(Class, methodsOrConfig?)` builds a fully-typed `Spy<T>` from a class, turning
every method into a mock with return-type-aware helpers.

## Configuration

```ts
// 1. all methods (default)
createSpyFromClass(MyService);

// 2. the discovered methods PLUS these names
createSpyFromClass(MyService, ['reload', 'count']);

// 3. only these methods, discovery skipped
createSpyFromClass(MyService, { onlyMethodsToSpyOn: ['getName', 'getAge'] });

// 4. full config object
createSpyFromClass(MyService, {
  methodsToSpyOn: ['reload'],
  observablePropsToSpyOn: ['products$'], // Observable *properties*
  gettersToSpyOn: ['userName'],
  settersToSpyOn: ['userName'],
  autoSpyAccessors: true, // auto-discover every getter/setter on the prototype chain
  lazySpies: true, // build each method spy on first access; 'proxy' for very wide classes (see below)
  strict: true, // a method nobody configured throws instead of returning undefined
});
```

Passing an array **adds** the listed names to the auto-discovered set, matching `jest-auto-spies`.
Discovery already finds every prototype method, so the only names worth passing are the ones it
cannot see. To spy on _nothing but_ a list, use `onlyMethodsToSpyOn`, which skips discovery.

The `ClassSpyConfiguration` keys are `methodsToSpyOn`, `onlyMethodsToSpyOn`,
`instanceMethodsToSpyOn`, `observablePropsToSpyOn`, `gettersToSpyOn`, `settersToSpyOn`,
`autoSpyAccessors`, `fillMissing`, `lazySpies`, `returns`, `selfReturning`, `overrides`, `strict`
and `onUnstubbedCall`.

### `strict` — a method nobody configured {#strict}

```ts
const users = createSpyFromClass(UserService, { strict: true });

users.load.resolveWith([]);
users.currentTenant(); // throws: Nothing configured UserService.currentTenant
```

Off by default, so an unconfigured method returns `undefined` — which is a legal value, and so the
failure lands wherever that `undefined` is finally used rather than on the call that produced it.
`onlyMethodsToSpyOn` was the only tool for this before and answers a different question: it _deletes_
the method, so the failure reads `… is not a function` and blames the spy.

`onUnstubbedCall` is the general form — record instead of failing, or return a blanket fallback —
and `setupAutoSpy({ strict: true })` turns it on for a whole suite, with `{ strict: false }` on one
double as the way out. What counts as configured, and where the guard does not reach, are on
[Strict mode](./strict-mode).

### `instanceMethodsToSpyOn` — callables that are not on the prototype

Method discovery walks the **prototype chain**, which is where `class` methods live. A callable
assigned to an _instance field_ is invisible to it — an arrow-function property, an Angular
`signal()` / `computed()` field, a method of an ngrx `signalStore()`. Name those explicitly:

```ts
class TaskStore {
  readonly count = signal(0); // instance field, not on the prototype
  readonly reload = (): void => {}; // arrow property, same story
  load(): void {} // ordinary method — auto-discovered
}

createSpyFromClass(TaskStore, {
  instanceMethodsToSpyOn: ['count', 'reload'],
});
```

This list and `methodsToSpyOn` behave identically — both **add** to whatever discovery produced —
and differ only in what their names tell a reader. Prefer this one in new code; keep
`methodsToSpyOn` in specs carried over from `jest-auto-spies`. Neither warns about a name the
prototype does not have: being absent from the prototype is the point.

Angular's own classes are in this list too. `Router.currentNavigation` became
`currentNavigation = this.navigationTransitions.currentNavigation.asReadonly()` in Angular 20, so
`provideAutoSpy(Router)` alone does not produce it:

```ts
provideAutoSpy(Router, { instanceMethodsToSpyOn: ['currentNavigation'] });
```

#### The error you actually see

```
TypeError: Cannot read properties of undefined (reading 'mockReturnValue')
```

The member is simply not on the spy, so the next line reads `undefined` and configuring it throws.
There is no better message to be had at runtime, and the reason is worth knowing rather than looking
like an oversight: instance fields do not exist until a constructor has run, and this factory never
constructs the class — which is exactly what makes it safe to build a spy from a service whose
constructor opens a socket. The only alternative would be to answer an unknown member with
_something_, and that something would be truthy, so `if (service.optionalThing)` in the code under
test would take the wrong branch — silently, in a different file. That is the failure mode the
[protocol deny-list](/core/auto-mock-by-type) exists to remove, and a loud `TypeError` on the spec's
own line is the better of the two.

### `fillMissing` — a partially abstract class {#fill-missing}

A **fully** abstract class needs nothing: its prototype names nothing at all, so the factory hands
back the [type-driven proxy](/core/auto-mock-by-type) and every method answers. One concrete member
is enough to leave that path — and that is the ordinary Angular DI-token shape:

```ts
abstract class LocalStorage {
  abstract read(key: string): string | null;
  clear(): void {} // one concrete member, and discovery is no longer empty
}

const storage = createSpyFromClass(LocalStorage);

storage.clear; // a spy
storage.read; // undefined — `abstract read()` never reached a prototype
```

`Spy<T>` types `read` as present, the read yields `undefined`, and the failure surfaces as
`storage.read is not a function` **inside production code**, with nothing pointing at the spec.
`fillMissing` answers a name the prototype never carried with a spy:

```ts
createSpyFromClass(LocalStorage, { fillMissing: true });
// or: providers: [provideAutoSpy(LocalStorage, { fillMissing: true })]
```

It is opt-in, and it has to be. TypeScript erases `abstract` entirely, so at runtime a partially
abstract class and a concrete one are the same object — filling every unknown key by default would
silence a genuine typo on every class in the suite, which is the property that separates this
library from the mock-everything proxies. Naming the members in `instanceMethodsToSpyOn` stays the
alternative when the list is short and worth stating.

Two things it does not change. A member the record already has is still read from the record, so a
lazy placeholder materialises exactly as it would without the wrapper. And the protocol keys the
surrounding machinery probes to decide _what kind of object this is_ — `then`, `constructor`,
`toJSON`, `asymmetricMatch`, `$$typeof`, `nodeType`, and every symbol — are never filled: a spy on
`asymmetricMatch` turns every `toEqual` against the double into a matcher invocation, and one on
`toJSON` rewrites every snapshot of it.

## `registerAutoSpyDefaults` — the composition lives with the class

A spy's composition is a fact about the **class**, not about the spec: `Router` needs `events` spied
as an Observable property and `url` as a getter wherever it is doubled. Every file that repeats that
is a file that can get it wrong.

```ts
// vitest-setup.ts, once
import { registerAutoSpyDefaults } from 'vitest-auto-spy';

registerAutoSpyDefaults(Router, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] });
registerAutoSpyDefaults(AccountService, { gettersToSpyOn: ['isGuest', 'currentProfile'] });
```

```ts
// every spec, from then on
provideAutoSpy(Router);
provideAutoSpy(Router, { instanceMethodsToSpyOn: ['currentNavigation'] }); // adds, does not replace
```

**Why this is not only tidiness.** Measured over one Angular suite: 739 of 2228 `provideAutoSpy`
calls carry a configuration, and the same class collects incompatible opinions —

| class                  | calls | files | with a config | **distinct configurations** |
| ---------------------- | ----: | ----: | ------------: | --------------------------: |
| `Router`               |   122 |   109 |            60 |                      **23** |
| `AccountService`       |    70 |    62 |            43 |                      **27** |
| `PurchaseStateService` |    53 |    52 |            42 |                      **25** |
| `SmartRemoteConfigService` | 85 |    70 |            47 |                           8 |

— and the `*RemoteConfigService` family is 205 calls, 120 of them repeating
`{ gettersToSpyOn: ['remoteConfig'] }` word for word. The list options are
[additive and do not complain about a name they cannot find](#configuration), which is deliberate —
they exist to name members no prototype carries — so 23 opinions about `Router` means most of those
files do not spy `events` at all, and the day production grows a subscription to it, not one of them
says so.

### The merge

The registration is the floor, the call site adds to it. Three behaviours, one per kind of key:

| key                                                | merged how                              |
| -------------------------------------------------- | --------------------------------------- |
| every list (`gettersToSpyOn`, `observablePropsToSpyOn`, …) | unioned, registration first, no repeats |
| `returns`, `overrides`                             | key by key, the call site winning       |
| every scalar (`lazySpies`, `strict`, `fillMissing`) | the call site wins when it names the key |

The bare-array form is taken too: `createSpyFromClass(X, ['reload'])` merges as
`{ methodsToSpyOn: ['reload'] }`.

**By class identity, not by inheritance.** A subclass gets nothing from its base class's
registration. That is the conservative half of the design: walking the prototype chain would let a
registration on a widely-extended base change the composition of doubles in files nobody was looking
at, which is the failure this removes rather than relocates.

**A second registration for the same class replaces the first.** Two registrations for one class in
one suite is the drift this exists to remove, and quietly combining them would hide it.

`clearAutoSpyDefaults(Class)` drops one, `clearAutoSpyDefaults()` the lot — for a suite that
registers per project rather than per run, and for a spec that has to prove the registry is empty.

### Many classes at once {#many-at-once}

A setup file registering a dozen classes is a dozen near-identical calls. The same registrations are
also a table, and it says the same thing:

```ts
// vitest-setup.ts, once
registerAutoSpyDefaults([
  [Router, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] }],
  [AccountService, { gettersToSpyOn: ['isGuest', 'currentProfile'] }],
  [LocalStorage, { instanceMethodsToSpyOn: ['getItem', 'setItem'] }],
]);
```

**Every row is checked against its own class.** That is the whole reason the form is typed the way it
is, rather than as an array of `[ClassType<unknown>, ClassSpyConfiguration<unknown>]` — a
configuration names keys _of its class_, so widening the row to one common type gives up the
checking. A key the row's class does not carry fails **on that row's line**, and the diagnostic names
that class's members and nothing else:

```ts
registerAutoSpyDefaults([
  // Type '"isGuest"' is not assignable to type '"navigate" | "navigateByUrl" | …' — Router's
  // own methods, never a union with the members of the row below
  [Router, { instanceMethodsToSpyOn: ['isGuest'] }],
  [AccountService, { gettersToSpyOn: ['isGuest'] }],
]);
```

**Rows apply in order**, so a later row for a class an earlier row already named replaces it —
exactly what a second call does, and for the same reason. The two forms share one registry: a table
and a per-class call in the same setup file are the same registrations, whichever wrote them.

`AutoSpyDefaultEntry<T>` is the row type, exported for a row that has to be built outside the
literal — a helper that returns one, or a list assembled per project.

### A dependency behind an `InjectionToken` {#token-defaults}

A token's double is assembled in every file that provides it just as a class's was, and the same
registry takes it — through the `registerAutoSpyDefaults` that `vitest-auto-spy/angular` exports. The
core entry cannot name Angular's `InjectionToken`, so its signature takes a class only; the `/angular`
one adds the token overload over the very same registry.

```ts
// vitest-setup.ts, once
import { registerAutoSpyDefaults } from 'vitest-auto-spy/angular';

registerAutoSpyDefaults(LOGGER, { returns: { info: undefined, err: undefined }, selfReturning: ['channel'] });
registerAutoSpyDefaults(NAVIGATION, { overrides: { activeRow$: of({}) }, returns: { setFocus: undefined } });

// every spec, from then on
providers: [provideAutoSpyForToken(LOGGER), provideAutoSpyForToken(NAVIGATION, { activeRow$: rows$ })];
```

`provideAutoSpyForToken` reads the registration exactly as `provideAutoSpy` reads a class's: its
seeds (the second argument) and its configuration (the third) are merged over it by the rules above,
and a registered `returns` stays a default a later `calledWith` or `resolveWith` wins over. What a
token row may say is `AutoSpyTokenDefaults<T>` — what [`createAutoMock`](./auto-mock-by-type) takes
(`returns`, `selfReturning`, `observablePropsToSpyOn`, `strict`, `name`) plus `overrides`. Every key is
checked against the token's `T`, and a table may mix class rows and token rows.

Handing a token to the **core** export fails with `TS2345 … 'InjectionToken<AppLogger>' is not
assignable to parameter of type 'ClassType<unknown>'`. The repair is the import.

## Lazy spies — `lazySpies`

**What it is.** A method's spy is built on **first access** (`spy.method`) and then cached, so
methods a test never touches never pay the spy-construction cost. That is the default,
`lazySpies: true`; `lazySpies: false` builds every spy up front instead, and `'proxy'` drops the
per-method placeholder as well — see
[Performance](/core/performance#where-the-remaining-memory-is-and-lazyspies-proxy).

**Why it matters.** Building a spy is not free: each method gets a host-runner mock plus the
`calledWith` / `resolveWith` / `nextWith` helper surface. On a wide service where a test calls only
a couple of methods, eagerly building all of them is mostly wasted work.

```ts
const spy = createSpyFromClass(WideService);
spy.getName.mockReturnValue('Ada'); // getName is built here, on first access
// the other 18 methods are never built — nothing to construct, nothing to reset
```

**When to turn it off.** `lazySpies: false` is worth it only when a spec enumerates the spy object
itself rather than calling methods on it, or when one test really does touch every method of a
small class. [Performance](/core/performance) has the crossover measured.

::: tip It has been the default since 2.0
Until 2.0 only `provideAutoSpy` on the Angular entry turned it on, which made the Angular path
quietly faster than the plain one for no reason a reader could see. See
[Adapters → Angular](/adapters/angular#lazy-spies-by-default).
:::

**Behaviour is identical either way.** `Object.keys`, `vi.isMockFunction`, `calledWith`,
`resetAutoSpy` / `clearAutoSpy` and enumeration all work the same; lazy only changes _when_ each spy
is constructed, not what it does. The one nuance: a lazy method is an accessor until first touched,
so a never-accessed spy has no recorded calls (which is exactly why `resetAutoSpy` can skip it).

### `lazySpies: 'proxy'` — for classes wide enough to end a CI job

`lazySpies: true` still has to _put something_ on the double for every method: one
`Object.defineProperty` accessor each. On a wide class that placeholder is not a detail — it is
almost all of what an untouched double retains. `'proxy'` is the same laziness with one trap object
in place of all of them, so retention stops tracking the width of the class.

```ts
// a generated API client: 400 operations, a test touches two
const api = createSpyFromClass(GeneratedVenuesClient, { lazySpies: 'proxy' });

api.findById.resolveWith({ id: 1 }); // built here, like any lazy spy
```

Measured on Node 24.19, 2 000 doubles held at once, nothing touched:

| Methods on the class | `lazySpies: true` | `lazySpies: 'proxy'` |      Delta |
| -------------------: | ----------------: | -------------------: | ---------: |
|                    5 |           1 634 B |              1 737 B | **+102 B** |
|                   20 |           5 629 B |              2 219 B |   −3 410 B |
|                  100 |          25 597 B |              4 135 B |  −21 463 B |
|                  400 |         101 584 B |             11 813 B |  −89 771 B |

That is 253 B per method against 25 B per method — the placeholder against one entry in a set of
names the prototype already owns. Under `isolate: false`, where every double in a file outlives the
test that made it, this is the difference between a job that finishes and a job that is killed.

Building is cheaper too, because there is nothing to define. Create a double and call two of its
methods five times each:

| Methods on the class | `lazySpies: true` | `lazySpies: 'proxy'` |     Ratio |
| -------------------: | ----------------: | -------------------: | --------: |
|                    5 |          6 515 ns |             8 180 ns | **0.80×** |
|                   20 |          8 938 ns |             6 643 ns |     1.35× |
|                  100 |         20 713 ns |            11 638 ns |     1.78× |
|                  400 |         61 212 ns |            10 798 ns |     5.67× |

**Why it is opt-in, and will stay opt-in.** A `Proxy` cannot remove itself. Once a method has
materialised, the accessor path leaves a plain data property behind and every later read is free;
the proxy still goes through a trap — **+30 ns per read and +43 ns per call, for the life of the
double**. At five methods it also _loses_ 102 B. Both tables cross over somewhere around twenty
methods, which is why the default does not move.

Reach for it on the shapes that are wide by construction — generated API clients (orval,
`ng-openapi-gen`), ngrx facades, a `Store` double — and leave it alone on an ordinary service.

**It is not a different double.** `Object.keys`, spread, `JSON.stringify`, `in`,
`hasOwnProperty`, `Object.getOwnPropertyDescriptor`, `delete`, `Object.freeze`, key order, `returns`,
`overrides` and `fillMissing` all behave exactly as they do on the accessor path — `src/lib/lazy-spy-proxy.spec.ts`
asserts the two against each other rather than against hand-written expectations. Reading a
descriptor deliberately does **not** build the spy, for the same reason `resetAutoSpy` can skip an
untouched method: `Object.keys` and a teardown both read descriptors, and materialising there would
hand back the memory the mode exists to save.

## `using` — reset at the end of the block {#using}

Every double this package builds carries a `[Symbol.dispose]()` that calls `resetAutoSpy(this)`, so
the `afterEach` that exists only to reset one spy can go:

```ts
it('loads', () => {
  using cart = createSpyFromClass(Cart); // reset when the block ends
  cart.total.calledWith().mockReturnValue(42);

  expect(cart.total()).toBe(42);
});
// calls and configuration both gone — cart.total() is undefined again
```

`resetAutoSpy` is what runs, so it is the full reset: recorded calls, `calledWith` /
`mustBeCalledWith` chains, `resolveWith` / `nextWith` values, and a bare `mockReturnValue` set
directly on the host mock. It is also callable by hand — `cart[Symbol.dispose]()` — and the key has
a **stable identity** across reads, which a `Disposable` check and a `DisposableStack` both assume.

**The method is ours; the syntax is your toolchain's.** The `using` _declaration_ is downlevelled by
esbuild and `tsc`, which is why the specs in this repository use it while CI runs on Node 22, 24 and 26. Executed natively — an untranspiled `.js` on Node 22 — it is a `SyntaxError`; Node 24 runs it. If
your setup does not transpile, call `[Symbol.dispose]()` or `resetAutoSpy()` directly; nothing else
changes.

**On Node 22 the package installs `Symbol.dispose` for you.** The downlevelled form needs the symbol
to exist as a _global_: `tslib`'s `__addDisposableResource` reads it off `Symbol` and throws
`TypeError: Symbol.dispose is not defined.` before it ever looks at the double. Node 24 has it
natively in V8, in every realm. Node 22 does not — it patches the symbol in itself, as
`Symbol.for('nodejs.dispose')`, **onto the main realm only**, so under Vitest's `jsdom` /
`happy-dom` environment, whose globals come from a bare `vm` context, it is simply absent and `using`
throws. Importing this package defines it there, with that same registry symbol — shared by every
realm of the process, so the key stays identical to the one Node itself uses — non-enumerable and
`configurable`, and only where it is missing: a realm that already has `Symbol.dispose` is left
exactly as it was.

**The key is non-enumerable**, so it stays out of a spread. That is the one that had to be defended:
`{ ...spy }` copies enumerable own _symbol_ properties, so an enumerable dispose method would follow
the double into every snapshot and every `withOverrides`-style copy. `Object.keys` and
`JSON.stringify` ignore symbols outright and were never at risk.

**There is deliberately no `[Symbol.asyncDispose]`.** `resetAutoSpy` is synchronous, so an async half
would add a microtask and advertise teardown that does not exist — and `await using` already falls
back to `@@dispose` when `@@asyncDispose` is absent, so nothing is lost.

::: warning `createFunctionSpy` is not covered
A standalone `createFunctionSpy` is a host-runner mock, and Vitest puts its own `[Symbol.dispose]`
on every mock it creates — `() => mock.mockRestore()`, which **restores the original
implementation**. That is a different contract from reverting a double's configuration: the
`calledWith` chains this library keeps in a closure are not part of it. `using` on a single function
spy therefore means whatever your runner means by it, not what it means on a `Spy<T>`. Reach for
`resetAutoSpy(spy)` when the library configuration is what should go.
:::

## The `Spy<T>` shape

`Spy<T>` is a **mapped type** over `T`:

- every **method** becomes the mock intersected with the helpers its return type earns —
  `calledWith` / `mustBeCalledWith` always, plus `resolveWith` / `rejectWith` for a `Promise` and
  `nextWith` / `throwWith` / … for an `Observable`;
- every **`Observable` property** gains the observable helpers while keeping its own type;
- everything else keeps its declared type;
- an `accessorSpies` bag is added on top.

Because it is a mapped type, `Spy<T>` **drops `#private` and `private` members** and is therefore
not assignable to `T`. Declare the variable as `Spy<T>`, or cross the gap explicitly with
[`asInstance` / `asSpy`](./spy-typing):

```ts
let users: Spy<UserService>; // ✅
let users: UserService = createSpyFromClass(UserService); // ❌ private members missing
```

## Accessor spies — `accessorSpies`

Getters and setters are not methods, so they get their own bag. List them, or turn on
`autoSpyAccessors` to discover every accessor on the prototype chain:

```ts
const settings = createSpyFromClass(SettingsService, {
  gettersToSpyOn: ['theme'],
  settersToSpyOn: ['theme'],
});

settings.accessorSpies.getters.theme.mockReturnValue('dark');
expect(settings.theme).toBe('dark');

settings.theme = 'light';
expect(settings.accessorSpies.setters.theme).toHaveBeenCalledWith('light');
```

The property itself reads and writes normally — `accessorSpies` is where the mock lives, so
`settings.theme` stays typed as `string`, not as a mock.

### Naming one half gets the pair

`gettersToSpyOn: ['theme']` on a class that declares **both** halves installs both spies, and the
same is true the other way round. Mirroring reads the prototype descriptor, so it only ever adds
what the class already has: a read-only member stays read-only.

Before 3.5.0 only the named half was spied, and the double came out poorer than the original exactly
where the code under test expects symmetry. The assignment `service.manualSwitchKidMode = false`
landed on the no-op setter the spy scaffolding installs, so the write vanished _and_ there was
nothing to assert on — `accessorSpies.setters.manualSwitchKidMode` was `undefined`, and the failure
read `Cannot read properties of undefined` several steps from the configuration that caused it.

### Seeding a spied getter

`overrides` on a member that is a **spied getter** — named in `gettersToSpyOn`, found by
`autoSpyAccessors`, or spied by a [`registerAutoSpyDefaults`](#registerautospydefaults-—-the-composition-lives-with-the-class)
registration the call site never mentions — seeds the getter spy:

```ts
registerAutoSpyDefaults([[RemoteConfigService, { gettersToSpyOn: ['remoteConfig'] }]]); // setup file

providers: [provideAutoSpy(RemoteConfigService, { overrides: { remoteConfig: { theme: 'dark' } } })];

injectSpy(RemoteConfigService).remoteConfig; // { theme: 'dark' }, and the read is recorded
```

Before this release the seed was assigned, the assignment landed in the spied accessor's setter, and
the getter kept answering `undefined` — while the docs said seeded members win, and nothing warned.
The getter stays a spy, so a later `accessorSpies.getters.remoteConfig.mockReturnValue(…)` still
overrides the seed. A seed on a member whose spy has only a setter becomes a plain value instead of a
write the getter never reads back.

## A single function — `createFunctionSpy`

When there is no class at all, `createFunctionSpy<Fn>(name)` builds one spy with the same
return-type-aware helper surface. The `name` is what shows up in failure messages.

```ts
import { createFunctionSpy } from 'vitest-auto-spy';

const load = createFunctionSpy<(id: number) => Promise<string>>('load');

load.calledWith(1).resolveWith('value');

await expect(load(1)).resolves.toBe('value');
```

## Edge cases

**Inherited methods are spied.** Discovery walks the whole prototype chain, so a method declared on
a base class is spied exactly like one declared on the subclass. `Object.prototype` is not included.

**Abstract classes work at runtime**, because an abstract class is still a constructor function with
a prototype — only TypeScript refuses to type it as `ClassType<T>`. Pass the concrete subclass to
`createSpyFromClass` and keep the abstract class as the DI token:

```ts
providers: [{ provide: PaymentGateway, useValue: createSpyFromClass(StripeGateway) }];
```

`injectSpy` already accepts an abstract constructor as its token, so reading it back needs nothing
special.

**Constructor bodies never run.** The spy is assembled from the prototype; the class is never
instantiated, so a constructor that opens a socket or reads config is not a problem.

**Only a restricting list warns.** A name in `onlyMethodsToSpyOn` that the prototype does not have
logs a warning, because there a misspelling leaves the real method unspied and the code under test
calls something that is not there. The additive lists stay silent — naming a callable the prototype
lacks is exactly what they are for.

**No class, no problem.** [`createAutoMock<T>()`](./auto-mock-by-type) builds the same surface from a
type alone, `mockDeep<T>()` does it recursively, and `createMock<T>()` returns a plain, spy-free `T`
for a data shape the code only reads.

## `returns` — the value, where the spy is built

```ts
providers: [provideAutoSpy(ProductsService, { returns: { getProducts: of([]) } })];
```

The alternative is a second statement in every `beforeEach` (`injectSpy(X).m.mockReturnValue(…)`),
and the shortcut people take instead is an exported `const` provider carrying the values — which,
under `isolate: false`, is one set of spies shared by every file that imports it.

It is the method's **default**, kept in the spy's own container: a `calledWith(…)` chain configured
afterwards still decides the value for its arguments, a later `resolveWith` / `failWith` replaces
it, `undefined` counts as configured under `strict`, and `resetAutoSpy` clears it.

## `selfReturning` — a method that answers the double itself {#self-returning}

```ts
provideAutoSpy(QueryBuilder, { selfReturning: ['where', 'orderBy'], returns: { run: [] } });
provideAutoSpyForToken(LOGGER, undefined, { selfReturning: ['channel'] });
```

The `returns` entry a literal cannot spell: the double does not exist yet when the configuration is
written. It is for a call the code under test chains off — `query.where('a').orderBy('b').run()`,
`inject(LOGGER).channel('auth').debug('…')` — where an unconfigured link answers `undefined` and the
next hop throws, often inside a constructor before the spec's first line.

It is the same default `returns` installs, so it counts as configured under `strict` and a later
`calledWith` / `mockReturnValue` still wins. A method named in both answers its `returns` value —
which is how a spec takes one link out of a chain a [registration](#registerautospydefaults-—-the-composition-lives-with-the-class)
set up, since lists only ever union. Every factory takes it: `createSpyFromClass`,
`createSpyFromInstance` (where the answer is the instance itself), `createAutoMock`, `provideAutoSpy`,
`provideAutoSpyForToken`. `mockDeep`'s boolean `selfReturning` is the same idea for every node of a
deep double.

A member the call site **seeded** wins over both, and that is how one registered link is replaced by a
double of your own:

```ts
// vitest-setup.ts
registerAutoSpyDefaults(LOGGER, { returns: { info: undefined, err: undefined }, selfReturning: ['channel'] });

// one spec, which wants to assert on the channel rather than on the parent
provideAutoSpyForToken(LOGGER, { channel: () => asInstance(channelLogger) });
```

`overrides` is stored verbatim and is no longer a spy, so `returns` and `selfReturning` skip a member
named there rather than configuring it — a value, a plain function and a `vi.fn()` are all left exactly
as seeded. That shape used to throw `TypeError: asVitestMock(...).mockImplementation is not a function`
out of the provider for a plain function, and to overwrite a seeded `vi.fn()` without a word.

## `gettersToSpyOn` accepts a signal-valued getter

```ts
createSpyFromClass(LayoutStateService, { gettersToSpyOn: ['isCompactMode', 'sectionsLoaded'] });
```

Whether a member is a getter is a fact about its **descriptor**, not about the type of the value it
returns — and a getter returning `Signal<T>` is callable, so a list filtered by "not callable"
rejected exactly the shape Angular's signal-based services are made of. For a service whose readonly
state is all signals that left no nameable getter at all, and the failure read
`Type 'string' is not assignable to type 'never'`, with nothing in it about signals.

Any string key may now be named. What is checked instead is the case that is unambiguously a mistake:
naming a **method** installs a spied accessor over it, so the method is no longer callable on the
spy, and that is reported at runtime.

For a signal, prefer `mockSignalProp` (`/angular`) over a spied getter — see
[Angular](/adapters/angular#patching-a-property-of-a-spy).

## A method whose return type is `never`

A generic method with a conditional return type — `get<K extends keyof T>(k: K): T[K] extends
Stringified<infer R> ? R : never`, the shape of every typed configuration service — used to turn the
**whole** spy member into `never`, reported as `Property 'mockReturnValue' does not exist on type
'never'` with nothing connecting it to the method it came from. Fixed in the type: the helper bundle
falls back to the synchronous one instead of annihilating the member, and every return-type
comparison is non-distributive.
