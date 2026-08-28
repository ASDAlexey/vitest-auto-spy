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
});
```

Passing an array **adds** the listed names to the auto-discovered set, matching `jest-auto-spies`.
Discovery already finds every prototype method, so the only names worth passing are the ones it
cannot see. To spy on *nothing but* a list, use `onlyMethodsToSpyOn`, which skips discovery.

The `ClassSpyConfiguration` keys are `methodsToSpyOn`, `onlyMethodsToSpyOn`,
`instanceMethodsToSpyOn`, `observablePropsToSpyOn`, `gettersToSpyOn`, `settersToSpyOn`,
`autoSpyAccessors` and `lazySpies`.

### `instanceMethodsToSpyOn` — callables that are not on the prototype

Method discovery walks the **prototype chain**, which is where `class` methods live. A callable
assigned to an *instance field* is invisible to it — an arrow-function property, an Angular
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
`resetAutoSpy` / `clearAutoSpy` and enumeration all work the same; lazy only changes *when* each spy
is constructed, not what it does. The one nuance: a lazy method is an accessor until first touched,
so a never-accessed spy has no recorded calls (which is exactly why `resetAutoSpy` can skip it).

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
