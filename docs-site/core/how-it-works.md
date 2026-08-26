---
title: How it works
description: The two ideas behind vitest-auto-spy — a prototype-chain walk at runtime, and conditional types that pick helpers from a method's return type.
---

# How it works

Everything in this library comes down to two ideas. One runs at runtime, the other exists only in
the type system. The rest of the repository is the work that keeps those two honest in real
codebases.

## Why it exists

You are testing a component that calls `UserService`. The real service can't come along — it would
hit the network. So you write a fake, by hand:

```ts
const userService = {
  getUser: vi.fn(),
  saveUser: vi.fn(),
  deleteUser: vi.fn(),
  refresh: vi.fn(),
  // …one line per method, forever
};
```

Three problems, all of them silent:

- add a method to the service and you have to remember to add it here;
- rename one and the test keeps "passing" — it just stops observing the call;
- there are no types: `getUser: vi.fn()` knows nothing about the real signature.

The same fake, assembled for you:

```ts
const userService = createSpyFromClass(UserService);
```

## Idea one — ask the class for its methods

**In one sentence:** a class can be asked which methods it has, and that list is enough to build an
object where every name is a mock.

Class methods don't live on instances, they live on the prototype:

```ts
class UserService {
  getUser(id: number) {
    /* … */
  }
  saveUser(user: User) {
    /* … */
  }
}

Object.getOwnPropertyNames(UserService.prototype);
// → ['constructor', 'getUser', 'saveUser']
```

Drop `constructor`, spread a mock across the remaining names, and you have the engine:

```ts
function createSpyFromClass(SomeClass) {
  const spy = {};

  for (const name of Object.getOwnPropertyNames(SomeClass.prototype)) {
    if (name === 'constructor') continue;

    spy[name] = vi.fn();
  }

  return spy;
}
```

```ts
const service = createSpyFromClass(UserService);
service.getUser; // vi.fn()
service.saveUser; // vi.fn()
```

That's the whole idea. No code generation, no compiler plugin — ask for the method names, build an
object from them.

### What the real implementation adds

The idea is small; the work is in the edges. Each of these is a case where the naive loop above
returns a spy that looks right and behaves wrong.

**Inheritance.** `getOwnPropertyNames` only sees one level: for `class Admin extends UserService`,
none of `UserService`'s methods appear. So the real version walks up the prototype chain, stopping
at the last prototype that still has a parent:

```ts
let current = SomeClass.prototype;

while (Object.getPrototypeOf(current)) {
  // ← Object.prototype has no parent; that's the stop
  collectNamesFrom(current);
  current = Object.getPrototypeOf(current);
}
```

The stop condition is what keeps `toString`, `hasOwnProperty` and the rest of `Object.prototype`
out of your spy.

**Getters.** If the class declares `get isReady()`, reading the property would execute the getter —
on a class that was never constructed, that usually throws. So names are collected from property
*descriptors* rather than by reading:

```ts
const descriptors = Object.getOwnPropertyDescriptors(current);

// a descriptor with `.get` is an accessor, and takes a different path
Object.keys(descriptors).filter((name) => !descriptors[name]?.get);
```

Accessors get their own treatment — see
[accessor spies](/core/create-spy-from-class#accessor-spies-—-accessorspies).

**The mock itself.** In the real version the value is not a bare `vi.fn()` but
`createFunctionSpy(name)`, which attaches `calledWith`, `resolveWith`, `nextWith` and the rest of
the [control helpers](/core/control-helpers). The assembly step is unchanged.

**Cost.** The method list of a class is fixed for the run, but the same class is typically spied
once per `beforeEach`. The walk result is cached in a `WeakMap` keyed by prototype, so it happens
once per class and holds no strong reference to it.

### The consequence: your class never runs

The library only looks at the class from the outside. No instance is created, no constructor is
called. A service that needs five dependencies and a live connection to be constructed is faked
without mocking any of them.

The flip side: anything that lives **on the instance** rather than on the prototype is invisible to
a prototype walk — arrow-function fields (`handle = () => {}`), Angular `signal()` properties, the
methods of an ngrx `signalStore()`. For those there is `instanceMethodsToSpyOn` (names given
explicitly), and when there is no class at all — only an interface —
[`createAutoMock<T>()`](/core/auto-mock-by-type), a `Proxy` that mints a spy the first time a key is
touched.

## Idea two — types read the return type

**In one sentence:** TypeScript looks at what a method returns and offers the helpers that fit it.

```ts
userService.getUser.resolveWith(user); // returns a Promise    → resolveWith
userService.items$.nextWith([1, 2]); // returns an Observable → nextWith
userService.getName.calledWith(1).mockReturnValue('Ann'); // plain → mockReturnValue
```

There is no runtime here at all — only types. The tool is a conditional type:

```ts
type ChooseHelpers<Method> =
  Method extends (...args: any[]) => Promise<infer P> // returns Promise<P>?
    ? { resolveWith(value: P): void; rejectWith(err: unknown): void }
    : Method extends (...args: any[]) => Observable<infer O> // Observable<O>?
      ? { nextWith(value: O): void; complete(): void }
      : { mockReturnValue(value: ReturnType<Method>): void }; // plain method
```

It reads like `if / else if / else`: *if the method returns a Promise give it these helpers, else if
an Observable these, otherwise those.* `infer P` means "remember what the Promise was parameterized
with", so `resolveWith` accepts the right type instead of `any`.

The second half maps that over every key of the class:

```ts
type Spy<T> = {
  [K in keyof T]: T[K] extends Func
    ? T[K] & ChooseHelpers<T[K]> // method: itself, plus its helpers
    : T[K]; // not a method: left alone
};
```

`T[K] & ChooseHelpers<T[K]>` is an intersection: the spy is still callable exactly like the original
method **and** carries the control helpers.

```ts
const service: Spy<UserService> = createSpyFromClass(UserService);

service.getUser.resolveWith(user); // ✅ getUser returns Promise<User>
service.getUser.nextWith(user); // ❌ no such helper — autocomplete won't offer it
```

## Where the two meet

One line, at the end of `createSpyFromClass`:

```ts
return autoSpy as Spy<T>;
```

At runtime an ordinary object of mocks was assembled. TypeScript took no part in assembling it — it
is handed a promise that what came back has the shape of `Spy<T>`.

This is the only assertion in the core, and it is irreducible: the object is built from names known
only at runtime, while `Spy<T>` is computed by the compiler from the class type. Neither can verify
the other. Correctness rests on the fact that the prototype walk and the mapped type look at **the
same class**, and therefore produce the same set of keys.

## What the rest of the repository is

Everything else is scaffolding around those two ideas:

| Layer                                        | What it does                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `createFunctionSpy`                          | implements at runtime what the types promise: `calledWith`, `resolveWith`, `nextWith`, `mustBeCalledWith`                              |
| `ArgsMap`                                    | argument matching: `calledWith(1, 'a')` resolves in O(1) through a prototype-less map, with a predicate path for `expect.any(…)` and friends |
| `MockAdapter`                                | the core never imports a test runner directly — it sits behind an interface, which is why the same library runs on Vitest, Bun and `node:test` |
| `/rxjs`                                      | Observable helpers are a separate entry point; don't import it and not a byte of rxjs enters your bundle                               |
| `resetAutoSpy`                               | resets every spy on an object in one call (`calledWith` configs live in closures, where `mockClear` can't reach)                       |
| `/angular`, `/nestjs`, `/react`, `/vue`, `/svelte` | thin per-framework wrappers — `provideAutoSpy` for the Angular TestBed, and so on                                                  |

## One compatibility note

The API is a drop-in replacement for `jest-auto-spies` — migration is a change of import, and that
includes `methodsToSpyOn`, which is additive here exactly as it is there. Restricting to a list is a
separate option, `onlyMethodsToSpyOn`, so the compatible name cannot quietly mean the opposite of
what a migrated spec expects. See [Migrating](/migrating).

## Next

- [`createSpyFromClass`](/core/create-spy-from-class) — the full configuration surface
- [Control helpers](/core/control-helpers) — what the return-type-aware helpers actually do
- [Bridging `Spy<T>` and `T`](/core/spy-typing) — why `Spy<T>` is not assignable to `T`
- [Auto-mock by type](/core/auto-mock-by-type) — when there is no class to walk
