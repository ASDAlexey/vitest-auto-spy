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
  lazySpies: true, // build each method spy on first access (see below)
  strict: true, // a method nobody configured throws instead of returning undefined
});
```

Passing an array **adds** the listed names to the auto-discovered set, matching `jest-auto-spies`.
Discovery already finds every prototype method, so the only names worth passing are the ones it
cannot see. To spy on _nothing but_ a list, use `onlyMethodsToSpyOn`, which skips discovery.

The `ClassSpyConfiguration` keys are `methodsToSpyOn`, `onlyMethodsToSpyOn`,
`instanceMethodsToSpyOn`, `observablePropsToSpyOn`, `gettersToSpyOn`, `settersToSpyOn`,
`autoSpyAccessors`, `fillMissing`, `lazySpies`, `returns`, `overrides`, `strict` and
`onUnstubbedCall`.

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

## Lazy spies — `lazySpies`

**What it is.** By default `createSpyFromClass` builds a spy for **every** method up front (eager).
With `lazySpies: true`, each method spy is instead created on **first access** (`spy.method`) and
then cached, so methods a test never touches never pay the spy-construction cost.

**Why it matters.** Building a spy is not free: each method gets a host-runner mock plus the
`calledWith` / `resolveWith` / `nextWith` helper surface. On a wide service where a test calls only
a couple of methods, eagerly building all of them is mostly wasted work.

```ts
const spy = createSpyFromClass(WideService, { lazySpies: true });
spy.getName.mockReturnValue('Ada'); // getName is built here, on first access
// the other 18 methods are never built — nothing to construct, nothing to reset
```

**When to use it.** Reach for `lazySpies` when spying **wide services** (many methods) where each
test exercises only a few — the typical unit-test shape. For small classes the difference is
negligible, so the eager default is fine.

::: tip Angular defaults to this
The `vitest-auto-spy/angular` `provideAutoSpy` helper already sets `lazySpies: true` by default —
Angular tests overwhelmingly match this pattern. Pass `{ lazySpies: false }` there to opt back into
eager spies. See [Adapters → Angular](/adapters/angular#lazy-spies-by-default).
:::

**Behaviour is identical either way.** `Object.keys`, `vi.isMockFunction`, `calledWith`,
`resetAutoSpy` / `clearAutoSpy` and enumeration all work the same; lazy only changes _when_ each spy
is constructed, not what it does. The one nuance: a lazy method is an accessor until first touched,
so a never-accessed spy has no recorded calls (which is exactly why `resetAutoSpy` can skip it).

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
esbuild and `tsc`, which is why the specs in this repository use it while CI runs on Node 22, 24 and
26. Executed natively — an untranspiled `.js` on Node 22 — it is a `SyntaxError`; Node 24 runs it. If
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

It installs an implementation, exactly as `mockReturnValue` does, so a `calledWith(…)` chain
configured **afterwards** on the same method no longer decides the value. Use one or the other per
method.

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
