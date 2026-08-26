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

// 2. only these methods
createSpyFromClass(MyService, ['getName', 'getAge']);

// 3. full config object
createSpyFromClass(MyService, {
  methodsToSpyOn: ['getName'],
  observablePropsToSpyOn: ['products$'], // Observable *properties*
  gettersToSpyOn: ['userName'],
  settersToSpyOn: ['userName'],
  autoSpyAccessors: true, // auto-discover every getter/setter on the prototype chain
  lazySpies: true, // build each method spy on first access (see below)
});
```

Passing an array **restricts** spying to the listed methods (matching `jest-auto-spies`), rather
than augmenting the auto-discovered set.

The `ClassSpyConfiguration` keys are `methodsToSpyOn`, `instanceMethodsToSpyOn`,
`observablePropsToSpyOn`, `gettersToSpyOn`, `settersToSpyOn`, `autoSpyAccessors` and `lazySpies`.

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

Unlike `methodsToSpyOn`, this list **adds** to whatever discovery produced rather than restricting
it, and a name here never triggers the "not found on the class prototype" warning — being absent
from the prototype is the point.

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

**A method the class does not have warns.** Naming an unknown method in `methodsToSpyOn` logs a
"not found on the class prototype" warning — the usual cause of "why isn't my spy called". Use
`instanceMethodsToSpyOn` for the callables that legitimately are not there.

**No class, no problem.** [`createAutoMock<T>()`](./auto-mock-by-type) builds the same surface from a
type alone, `mockDeep<T>()` does it recursively, and `createMock<T>()` returns a plain, spy-free `T`
for a data shape the code only reads.
