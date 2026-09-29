---
title: How it works
description: The two ideas behind vitest-auto-spy - reading a class's methods at run time, and types that pick each method's helpers from its return type.
---

# How it works

This page explains what `createSpyFromClass` does under the hood. The library rests on two ideas:

1. At run time, it asks the class for its method names and builds a spy for each one.
2. At compile time, TypeScript reads each method's return type and offers the helpers that fit it.

You do not need this page to write tests. Read it when you want to know why the constructor never
runs, or why a method gets `resolveWith` but not `nextWith`.

## Why it exists

You are testing a component that calls `UserService`. The real service would hit the network, so
the test cannot use it. So you write a stand-in by hand:

```ts
const userService = {
  getUser: vi.fn(),
  saveUser: vi.fn(),
  deleteUser: vi.fn(),
  refresh: vi.fn(),
  // …one line per method, forever
};
```

It has three problems, and none of them shows up as a failure:

- when you add a method to the service, you have to remember to add it here;
- when you rename a method, the test keeps passing but stops checking the call;
- there are no types: `getUser: vi.fn()` knows nothing about the real signature.

The library builds the same stand-in for you:

```ts
const userService = createSpyFromClass(UserService);
```

## Idea one — ask the class for its methods

**In one sentence:** you can ask a class which methods it has, and that list is enough to build an
object where every name is a spy.

Class methods do not live on instances. They live on the class's prototype, the object that all
instances share:

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

Skip `constructor`, put a mock function on every other name, and you have the core of the library:

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

That is the whole idea. There is no code generation and no compiler plugin: the library asks for the
method names and builds an object from them.

### What the real implementation adds

The idea is small; the work is in the edge cases. In each case below, the simple loop above returns a
spy that looks right but behaves wrong.

**Inheritance.** `getOwnPropertyNames` sees only one level. For `class Admin extends UserService`,
none of `UserService`'s methods appear. So the library walks up the chain of parent prototypes and stops before `Object.prototype`, the
only one without a parent:

```ts
let current = SomeClass.prototype;

while (Object.getPrototypeOf(current)) {
  // ← Object.prototype has no parent; that's the stop
  collectNamesFrom(current);
  current = Object.getPrototypeOf(current);
}
```

That stop keeps `toString`, `hasOwnProperty` and the rest of `Object.prototype` out of your spy.

**Getters.** If the class declares `get isReady()`, reading the property runs the getter. On a class
that was never constructed, that usually throws. So the library reads property _descriptors_, which
describe a property without running it:

```ts
const descriptors = Object.getOwnPropertyDescriptors(current);

// a descriptor with `.get` is an accessor, and takes a different path
Object.keys(descriptors).filter((name) => !descriptors[name]?.get);
```

Accessors get their own treatment — see
[accessor spies](/core/create-spy-from-class#accessor-spies-—-accessorspies).

**The mock itself.** Each name gets a spy from `createFunctionSpy(name)` instead of a bare `vi.fn()`.
It adds `calledWith`, `resolveWith`, `nextWith` and the rest of the
[control helpers](/core/control-helpers). See [Which mock function the spies use](#which-mock-function-the-spies-use).

**Cost.** A class's method list does not change during a run, but a spec usually spies the same class
in every `beforeEach`. So the library caches the list per class. The cache does not keep the class
alive after the tests stop using it.

### The consequence: your class never runs

The library only reads the class. It creates no instance and calls no constructor. So a service
that needs five dependencies and a live connection is replaced without mocking any of them.

The other side: the prototype does not show what the constructor puts **on the instance**. That
includes arrow-function fields (`handle = () => {}`), Angular `signal()` properties and the methods
of an ngrx `signalStore()`. For those, list the names in `instanceMethodsToSpyOn`:

```ts
const service = createSpyFromClass(UserService, { instanceMethodsToSpyOn: ['handle'] });
```

A name you do not list stays missing, and calling it throws a `TypeError` on your spec's line. The
library does not invent a placeholder for it: a placeholder would be truthy, so
`if (service.optionalThing)` in the code under test would take the wrong branch without a word. See
[why an instance field cannot be found](/core/create-spy-from-class#why-an-instance-field-cannot-be-found).

When there is no
class at all, only an interface, use [`createAutoMock<T>()`](/core/auto-mock-by-type). It returns a
`Proxy` that creates a spy the first time you read a key.

## Idea two — types read the return type

**In one sentence:** TypeScript looks at what a method returns and offers the helpers that fit it.

```ts
userService.getUser.resolveWith(user); // returns a Promise    → resolveWith
userService.items$.nextWith([1, 2]); // returns an Observable → nextWith
userService.getName.calledWith(1).mockReturnValue('Ann'); // plain → mockReturnValue
```

Nothing here runs; it is all types. The tool is a conditional type:

```ts
type ChooseHelpers<Method> = Method extends (...args: any[]) => Promise<infer P> // returns Promise<P>?
  ? { resolveWith(value: P): void; rejectWith(err: unknown): void }
  : Method extends (...args: any[]) => Observable<infer O> // Observable<O>?
    ? { nextWith(value: O): void; complete(): void }
    : { mockReturnValue(value: ReturnType<Method>): void }; // plain method
```

Read it like `if / else if / else`: _if the method returns a Promise, give it these helpers; if an
Observable, these; otherwise those._ `infer P` captures the type inside the Promise, so `resolveWith`
accepts `User` instead of `any`.

The second half maps that over every key of the class:

```ts
type Spy<T> = {
  [K in keyof T]: T[K] extends Func
    ? T[K] & ChooseHelpers<T[K]> // method: itself, plus its helpers
    : T[K]; // not a method: left alone
};
```

`T[K] & ChooseHelpers<T[K]>` combines both types. The spy is callable exactly like the original method,
**and** it has the control helpers.

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

At run time the library built an ordinary object of mocks. TypeScript did not check how it was built;
the cast tells it the object has the shape of `Spy<T>`.

This is the only cast of its kind in the core, and it cannot be removed. The object is built from
names known only at run time, while the compiler computes `Spy<T>` from the class type. Neither side
can check the other. It works because both look at **the same class**, so for the methods on the prototype both produce
the same keys. Instance fields are the exception described above.

## Which mock function the spies use

By default each method spy is the library's own mock function. It is lighter than `vi.fn()` and
behaves the same in everything a spec can check: `mock.calls`, `mockReturnValue`,
`toHaveBeenCalledWith` and the rest. It has been the default since 4.1. A recorded call holds about
100 bytes, against about 200 for a `vi.fn()` call ([numbers](/core/performance#retained-memory-per-double)).

To build the spies on your runner's own function instead (`vi.fn()` on Vitest, the equivalents on
Bun, `node:test` and Rstest), call `setSpyEngine('runner')` from `vitest-auto-spy/setup`. Spies built
earlier keep the function they were built with.

The library never imports your test runner directly. Each entry point, such as `vitest-auto-spy` or
`vitest-auto-spy/bun`, connects the runner's mock function when you import it. That is why the same
code runs on Vitest, Bun, `node:test` and Rstest.

## What else is in the package

Everything else builds on those two ideas:

| Part                                               | What it does                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `createFunctionSpy`                                | a single spy with the helpers the types promise: `calledWith`, `resolveWith`, `nextWith`, `mustBeCalledWith` |
| `calledWith`                                       | returns different values for different arguments; accepts matchers such as `expect.any(…)`                   |
| runner entry points                                | connect the runner's mock function, so the same library runs on Vitest, Bun, `node:test` and Rstest          |
| `vitest-auto-spy/rxjs`                             | the Observable helpers, in their own entry point; without it, no rxjs code enters your tests                 |
| `resetAutoSpy`                                     | resets every spy on an object in one call, including `calledWith` answers that `mockClear` cannot reach      |
| `/angular`, `/nestjs`, `/react`, `/vue`, `/svelte` | small per-framework layers, such as `provideAutoSpy` for Angular's `TestBed`                                 |

## One compatibility note

The API is a drop-in replacement for `jest-auto-spies`: migration is a change of import. That
includes `methodsToSpyOn`, which adds names to the spy here exactly as it does there. To spy on
**only** a list of methods, use the separate option `onlyMethodsToSpyOn`. That way the familiar name
never means the opposite of what a migrated spec expects. See [Migrating](/migrating). Version
requirements are on [Compatibility](./compatibility).

## Next

- [`createSpyFromClass`](/core/create-spy-from-class) — every option
- [Control helpers](/core/control-helpers) — what each helper does
- [Bridging `Spy<T>` and `T`](/core/spy-typing) — why `Spy<T>` is not assignable to `T`
- [Auto-mock by type](/core/auto-mock-by-type) — when there is no class to walk
- [How the Angular helpers work](/adapters/angular-how-it-works) — the reasons behind the Angular entry
  points
- [In depth](#in-depth) — below: why individual helpers behave as they do

## In depth

Each section answers one "why" about a helper. You do not need them to write tests.

### Why a stubbed return value is type-checked

Setting a return value is the most common thing a spec does with a spy. So `mockReturnValue` accepts
only the method's own return type, as the `calledWith(…)` chain always has. A spy that accepted any
value there would miss the drift it exists to catch.

When a stub stops fitting, the usual workaround is `@ts-expect-error` on the failing line. It costs
more than the stub: the line is no longer checked at all, so a later change to the response type goes
unnoticed exactly where the response is described. One migration collected sixty of these across
twenty-five files before anyone found the option that fixes the stub. The fix is in
[The stub stops fitting the real response](/core/spy-typing#the-stub-stops-fitting-the-real-response).

### How an observable member is detected

A member gets `nextWith` when its type has `subscribe` and a `forEach(next)` that returns a promise.
The check reads the element type from `forEach`, not from `subscribe`. When TypeScript infers from an
overloaded method, it uses the last signature. rxjs 7's last `subscribe` overload is the deprecated
positional one, and through it the element type comes out as `unknown`.

The check is structural, so an `Observable` from a second copy of rxjs in `node_modules` matches too.
`Subject` has a private field, so a check against the class itself would reject that copy, and
`nextWith` would disappear with nothing to explain why.

The import that adds the helpers at run time, `vitest-auto-spy/rxjs`, is also the one that types them.
So the runtime and the types cannot drift apart.

### Why the Observable helpers stop a synchronous source

`expectEmission` and its siblings subscribe with a subscriber they control, not with a plain observer.
rxjs wraps a plain observer and returns the subscription only after `subscribe` has returned. For
`of`, `from`, `range` and anything with `repeat()`, that happens after the whole sequence has run.
The helper would then collect every value although it asked for one. Every side effect after the
accepted value would run, and an endless synchronous source would spin inside `subscribe`, where no
timeout can reach it. With its own subscriber, the helper stops the source once it has what it asked
for.

### Why the timeout ignores fake timers and `fakeAsync`

Each wait has a watchdog: a timer that fails the wait if the value never comes. The watchdog uses the
`setTimeout` the package captured on import. `vi.useFakeTimers()` replaces the global later, so it
cannot freeze the watchdog. A watchdog that the code under test can freeze would not protect anything.

zone.js is different. It replaces `setTimeout` while it loads, long before this package, and its
version picks a scheduler from the current zone at call time. Inside `fakeAsync` the watchdog would
land in the virtual queue. Then `tick(1_500)` towards a `debounceTime(2_000)` would fail the very wait
it was advancing. So the watchdog uses the original `setTimeout` that zone.js keeps aside. Inside
`fakeAsync` it stays on real time, and `tick()` cannot fire it.

### Why a failure points at your spec line

The Observable helpers build their failure later, inside a subscribe or timer callback. By then your
spec's line is no longer on the stack, so the report would point into this package. Each helper
therefore records the stack when you call it and attaches it to the failure. The code frame in the
report is then the `await expectEmission(…)` line in your spec.

Vitest's `vi.defineHelper` does not fit here. It covers a helper that throws while the caller is
still on the stack. In this case its marker frame would end up last, and Vitest then drops the whole
stack, code frame included.

### Why an auto-mock does not answer `schedule`

A `Proxy` double answers every key with a spy, so it looks like anything that checks for a method.
The case that exposed this: `of(...)` treats its last argument as a scheduler when
`typeof x.schedule === 'function'`. So `of(double)` took the whole double for a scheduler. It emitted
nothing and scheduled the work onto a spy that does nothing. The component kept its `null`, and the
failing assertion was about an unrelated `emit()`; nothing in it mentioned `of`.

The usual workaround was `from([double])`. It is no longer needed: the double answers `undefined` for
such protocol keys. The list is in
[Auto-mock by type](/core/auto-mock-by-type#it-answers-everything-so-it-must-not-answer-these).

### How property patches are undone, and what they hold in memory

`mockValueProp` and its siblings record each patch in a journal: the patched object and the property
descriptor it replaced. The journal holds strong references. An undone entry is marked rather than
removed, because removing entries one by one would make a test set that patches thousands of
properties quadratic. So only `restoreMockedProps()` empties the journal.

The per-patch undo releases what it held: an undone entry keeps neither the object nor the
descriptor. It empties its slot rather than splicing it out, and the journal compacts itself, in
order, once the empty slots outnumber the live ones. `countMockedProps()` is a subtraction, not a
walk over the journal.

Under `isolate: true` the journal belongs to one spec file and goes away with it. Under
`isolate: false` it belongs to the worker. Without a `restoreMockedProps()` between tests, every
object any spec patched stays in memory for the whole run. `setupAutoSpy()` calls it for you, which is
the reason to use it rather than remember the undo by hand.

### Why `node:test` spies are named when they are created

`mock.fn()` in `node:test` takes no name and has no `mockName()`. Its mock takes its `name` from the
function it wraps. So the library names each method's implementation when it creates it, and the mock
carries that name; `displayName` is set too. Without this, every spy printed as the library's
internal dispatcher.

The name comes from the language: a function expression under a computed key takes the key as its
name. Unlike a method shorthand, it can still be called with `new`, which `mockConstructor` needs.
Redefining `name` afterwards with `Object.defineProperty` also works, but it moves the function off
V8's fast path and costs about three times the memory per mock. The numbers are in
[Performance](/core/performance#on-node-test).

### How Rstest's `clearMocks` reaches the library's spies

The library builds method spies with its own mock function, so Rstest has never seen them. Rstest's
`clearMocks` and `resetMocks` walk every mock Rstest created, called or not. So the Rstest entry
creates one hidden Rstest mock whose `mockClear` and `mockReset` also clear the library's spies.

### Why a missing Vitest fails before the library can explain

Most entry points import `vitest` with a static `import`. ESM links the whole module graph before any
code runs, so without Vitest installed the run stops with Node's own `Cannot find package 'vitest'`.
The library has no chance to print a better message there. `npx vitest-auto-spy doctor` reports such
an import as [`vitest-entry-without-vitest`](/utilities/cli#vitest-entry-without-vitest) and names the
entry to use.

### Where some helpers came from

These helpers exist because the same problem kept showing up in real test sets:

- **`narrow.defined`.** `expect(value).toBeDefined()` and `assert.exists(value)` assert but return
  nothing. Under strict type-checking every optional read then costs two statements and a local
  variable. One test set had that shape fifteen times across four files, and twice grew a helper
  function per stub member just to carry the narrowing.
- **`flushEventLoopUntil`.** `await vi.advanceTimersByTimeAsync(0)` also flushes pending work, but it
  reads as "move the timers" in a test that has none. The next reader deletes it as noise, which is
  what happened to the hand-written version of this helper in the test set that motivated it.
- **`trackInjections`.** Written by hand it is the same nine lines every time: a
  `providers.map(token => ({ provide: token, useFactory: … }))` pushing into an array declared above
  it. In one test set it was written twice in a single afternoon and wanted a third time. The
  hand-written version also stops at the record, so the spec needs a second mechanism to stub the
  answers. The helper builds both: the providers carry auto-spies, and the log says which of them DI
  created.
- **Console spies without the import-time install.** Importing `vitest-auto-spy/console` installs
  the spies once per module evaluation, which under `isolate: false` is once per worker. The spies go
  on in whichever file imports them first and silence every later file of the worker. In one
  1759-file Angular project, 32 of the 39 files importing the entry relied on that. When three files
  started calling `restoreConsole()` in an `afterEach`, 12 tests in 5 other files failed, and output
  the silence had hidden appeared in 7 files. That is why [`useConsoleSpies()`](/utilities/console)
  exists and why the
  [`no-import-time-console-spies`](/utilities/eslint-rules#no-import-time-console-spies) rule
  reports the pattern. Under the stray-console guard the import installs nothing.

### Why `setImmediate` matters to fake timers

Vitest's default `toFake` fakes every timer the environment has except `process.nextTick` and
`queueMicrotask` (checked on Vitest 4.1.9). In Node that includes `setImmediate`. Express's router
ends an unmatched request with `setImmediate(done, layerError)` (line 203 of `router/index.js` in the
version checked). With the clock frozen, a request that should return `404` hangs until the test
times out. The fix is on [Fake timers](/utilities/fake-timers#taking-setimmediate-out-of-tofake).
