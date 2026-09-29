---
title: Bridging Spy<T> and T
description: Why Spy<T> is not assignable to T, the two helpers asInstance and asSpy that convert between them without a cast, and how to read the TypeScript errors spies produce.
---

# Bridging `Spy<T>` and `T`

A spy of `UserService` has the type `Spy<UserService>`: every method keeps its signature and gains the
spy helpers (`resolveWith`, `calledWith`, …). `Spy<T>` leaves out private members, and TypeScript compares classes with private members by
declaration, not by shape. So TypeScript does not accept it where a `UserService` is expected. Two helpers convert between the types:

- `asInstance(spy)`: `Spy<T>` → `T`, to pass the spy into code that expects the real type;
- `asSpy(value)`: `T` → `Spy<T>`, to configure a spy you got back as `T` (for example from `TestBed.inject`).

```ts
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { type Spy, asInstance, asSpy, createSpyFromClass } from 'vitest-auto-spy';

let users: Spy<UserService>;
let store: ProfileStore;

beforeEach(() => {
  users = createSpyFromClass(UserService);
  users.load.mockReturnValue(of({ id: 1, name: 'Ann' })); // checked against Observable<User>
  store = new ProfileStore(asInstance(users)); // Spy<UserService> → UserService
});

it('reads a spy back from DI', () => {
  const cart = asSpy(TestBed.inject(CartService)); // CartService → Spy<CartService>
  cart.total.mockReturnValue(0);
});
```

Both helpers return the same object; only its type changes. Declare your variables as `Spy<T>`
(`injectSpy(X)` in Angular also returns `Spy<T>`), and call `asInstance` only where an API demands the
real type.

**Common mistake:** `TestBed.inject(X) as Spy<X>` or `as unknown as X`. A double cast compiles, but it
also hides real type errors. Use `asSpy` / `asInstance`.

## Which error means which direction

Find your error by its **message text**, not only by its code: `TS2345`, for example, has more than
one cause. None of these messages mentions spies.

| Message                                                                              | Direction | Fix                                                                                                       |
| ------------------------------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------- |
| `TS2352: … 'accessorSpies' is missing in type 'Router'`                              | `T` → spy | `asSpy(TestBed.inject(Router))`                                                                           |
| `TS2739` / `TS2740: Type 'Spy<X>' is missing the following properties from type 'X'` | spy → `T` | `asInstance(spy)`                                                                                         |
| `TS2345: Argument of type 'Spy<X>' is not assignable to parameter of type 'X'`       | spy → `T` | `asInstance(spy)`                                                                                         |
| `is missing the following properties: _modalOpened, body, …` (private names)         | —         | declare `Spy<T>`, not `Mocked<T>`                                                                         |
| `TS2345` on `mockReturnValue(…)`: the value does not match the method's return type  | —         | [The stub is checked too](#the-stub-is-checked-too-not-only-the-call)                                     |
| `Argument of type 'Page' is not assignable to parameter of type 'HttpEvent<Page>'`   | —         | [The stub stops fitting the real response](#the-stub-stops-fitting-the-real-response)                     |
| a mismatch between `AddPromiseSpyMethods<unknown>` and `WithMockReturnValue<…>`      | —         | [A generic class needs its type argument](#a-generic-class-needs-its-type-argument)                       |
| `'x' does not exist in type 'MethodReturns<{ …: any; }>'`                            | —         | [A generic class needs its type argument](#a-generic-class-needs-its-type-argument)                       |
| `TS2540` on an assignment to a spy member                                            | —         | [`readonly` survives onto the double](#readonly-survives-onto-the-double-and-mockvalueprop-is-the-answer) |

`TS2352` often appears in many files at once after a migration from `jest-auto-spies`, whose guides
write `TestBed.inject(X) as Spy<X>`. Replace each one with `asSpy(TestBed.inject(X))`.

The error count does not always drop one by one. TypeScript stops checking a call at the first bad
argument, so "one error left" can hide several more (one file went 40 → 1 → 1 → 1 → 0). If a file
already needed one `asInstance`, look for more in the same file.

## The stub is checked too, not only the call

The configuration helpers are typed against the method, so a wrong stub is a compile error:

```ts
const posters = createSpyFromClass(PosterService); // getPosters(shelfId: string): Poster[][]

posters.getPosters.mockReturnValue(42); // ❌ TS2345
posters.getPosters.mockReturnValue(undefined); // ❌ TS2345
posters.getPosters.mockImplementation(() => of(null)); // ❌ TS2345
posters.getPosters.mockReturnValue([[poster]]); // ✅
posters.getPosters.calledWith('shelf-1').mockReturnValue(42); // ❌
```

| Helper                                                               | Checked against                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| `mockReturnValue`, `mockReturnValueOnce`                             | `ReturnType<Method>`                                  |
| `mockImplementation`, `mockImplementationOnce`, `withImplementation` | `(...args: Parameters<Method>) => ReturnType<Method>` |
| `mockResolvedValue`, `mockResolvedValueOnce`                         | the awaited return type                               |
| `mockRejectedValue`                                                  | `unknown` (a rejection is not the return type)        |
| `mockReturnValue()` with no argument                                 | allowed on a `void` method                            |
| `mock.calls`, `mock.lastCall`, `getMockImplementation()`             | typed, not `any[]`                                    |

On an overloaded method the check uses the signature `{ overload: … }` selected.

When the code under test really handles a value outside the type (for example `undefined` from a method
typed as `Observable`), see [Strict mode → What counts as configured](./strict-mode#what-counts-as-configured)
for `outOfType`.

## Overloads: `Parameters` reads the **last** signature

For an overloaded method, TypeScript's `Parameters<F>` and `ReturnType<F>` read the **last** overload,
and so do the spy helpers. That is the default. Pass `{ overload: 'first' }` to type the spy against
the first signature instead:

```ts
import { TestBed } from '@angular/core/testing';
import { asSpy, createSpyFromClass } from 'vitest-auto-spy';

const cinemas = asSpy<VenuesService, { overload: 'first' }>(TestBed.inject(VenuesService));
const client = createSpyFromClass<VenuesService, { overload: 'first' }>(VenuesService);
```

This matters most on a generated API client (`ng-openapi-gen`, `openapi-generator`). There the last
overload is `observe: 'events'`, the one nobody calls, so `nextWith(body)` stops compiling and demands
an `HttpEvent<T>`.

| Option / type                       | Where                                            | Meaning                                             |
| ----------------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| `{ overload: 'first' }`             | second type argument of a factory or `Spy<T, …>` | type every overloaded method by its first signature |
| `{ overload: { method: 'first' } }` | the same                                         | only the named methods                              |
| `Overload<Client['get'], 0>`        | a `MockInstance<…>` or `vi.fn<…>()`              | one signature of one method (index 0–3)             |
| `OverloadChoice`                    | your own helper's parameter type                 | the type of the `overload` option                   |

### The stub stops fitting the real response

```
TS2345: Argument of type 'Page' is not assignable to parameter of type 'HttpEvent<Page>'.
```

This is the overload problem above: the helper was typed against the last signature. It appears wherever a
helper reads the method's return type: `nextWith(body)`, `resolveWith(body)`,
`calledWith(…).returnValue(body)` and a plain `mockReturnValue(of(body))`. Neither the spy nor the
stub is wrong; both are checked against the signature nobody calls.

Fix it with a type argument on the **declaration**, not with a cast:

```ts
let venues: Spy<VenuesService, { overload: { getVenues: 'first' } }>;

venues = createSpyFromClass(VenuesService); // no second type argument here
venues.getVenues.nextWith(page); // `Page` again
```

**Common mistake:** `@ts-expect-error` on the failing line. The line then stops being checked, so a
later change to `Page` goes unnoticed exactly where the test describes the response.

### Name the method, not the whole double

`'first'` on the whole type changes **every** overloaded method, and on a wide type that breaks the
methods you were not fixing (for example, five `TS2769` errors on `Response.download`). Name the method
instead:

```ts
let perf: Spy<Performance, { overload: { getEntriesByType: 'first' } }>;
```

A name the type does not have never matches, so after a rename the entry is silently dead instead of
failing the build. `instanceMethodsToSpyOn` makes the same choice.

## A generic class needs its type argument

`TestBed.inject` infers the type from the constructor, so `FeatureFlagService<T = FeatureFlagDefaults>`
comes back as `FeatureFlagService<any>`. The error then shows a mismatch between
`AddPromiseSpyMethods<unknown>` and `WithMockReturnValue<…>` deep inside the message. The cause is the
missing type argument, so pass it yourself:

```ts
const config = asSpy<FeatureFlagService>(TestBed.inject(FeatureFlagService));
const config = injectSpy<FeatureFlagService>(FeatureFlagService); // the same, in Angular
```

`createSpyFromClass` needs it too in one combination: an accessor list (or `overrides`) together with
`returns`, on a generic class. TypeScript then infers `T` from `gettersToSpyOn: ['flagsConfig']` as
`{ flagsConfig: any }` and rejects the `returns` key:

```text
'isKeyEnabled' does not exist in type 'MethodReturns<{ flagsConfig: any; }>'
```

```ts
createSpyFromClass(FlagsConfigService, { gettersToSpyOn: ['flagsConfig'], returns: { isKeyEnabled: false } }); // ❌
createSpyFromClass<FlagsConfigService>(FlagsConfigService, { gettersToSpyOn: ['flagsConfig'], returns: { isKeyEnabled: false } }); // ✅
```

- Either option alone infers the declared default, so no type argument is needed.
- In `vitest-auto-spy/angular`, `provideAutoSpy`, `overrideAutoSpy`, `overrideComponentProvider` and
  the class overload of `registerAutoSpyDefaults` take `T` from the class alone, so there the first
  line compiles as written.
- The core factories and the core `registerAutoSpyDefaults` do not, so there you pass the type
  argument. Nothing else is needed.

## `Spy<T>`, not `Mocked<T>`

```ts
let modal: Spy<ModalService>; // ✅
let modal: Mocked<ModalService>; // ❌
```

`Mocked<T>` is Vitest's own type, and it keeps all of `T`, private members included. Assigning a spy
to it fails with `Type 'Spy<…>' is missing the following properties: _modalOpened, body,
rendererFactory, …`. The list of private fields makes the spy look incomplete, but the **declaration**
is what is wrong. `Spy<T>` covers the public members on purpose. The
[`no-mocked-for-spy`](/utilities/eslint-plugin) lint rule catches this.

## `asInstances(...)` — a whole argument list at once

`asInstances` converts several spies at once, for a call that takes many of them:

```ts
import { asInstances } from 'vitest-auto-spy';

factory = authCheckFactory(...asInstances(account, authCheck, appEvents, storage), document);
```

Wrapping each argument separately is not only longer. TypeScript stops checking a call at the first
argument that does not fit, so a factory with five spies reports one `TS2345` at a time. A value in
the list that is not a spy passes through unchanged, so you do not have to split a call that mixes
spies and real values.

## The only call signature is the method's own

Each spied method is typed as the method itself plus `MockInstance<Method>`: `mockReturnValue`,
`mockImplementation`, `mock.calls` and the rest, **without** a second call signature. So a call the
real method rejects does not compile on the spy either:

```ts
const cache = createSpyFromClass(CacheService); // read(key: string): string

cache.read(1); // ❌ TS2345, as on the real CacheService
cache.read('ok', 'extra'); // ❌
```

A side benefit: `expectTypeOf(spy.method).parameters` and `.returns` resolve to the real types.

## A method returning `any` keeps every bundle

A member declared `any` (a legacy service, a wrapper around a JavaScript package) keeps all helpers:
`mockReturnValue` on its `calledWith` chain as well as the `Promise` and `Observable` helpers. That
matches what it can do at runtime:

```ts
import { createAutoMock } from 'vitest-auto-spy';

const legacy = createAutoMock<LegacyApi>(); // request(id: number): any

legacy.request.calledWith(1).mockReturnValue({ ok: true }); // ✅
legacy.request.calledWith(2).resolveWith({ ok: false }); // ✅ also available
```

Nothing narrows it: a member typed `any` can be configured any way its type allows. If that is too
loose, fix the member's declaration, not the spy.

## `accessorSpies` is typed against the member it stands for

Spied getters and setters live in `spy.accessorSpies`. Each one has the type of the member it spies:
`Mock<() => T[K]>` for a getter, `Mock<(value: T[K]) => void>` for a setter.

```ts
const settings = createSpyFromClass(SettingsService, { gettersToSpyOn: ['count'] }); // get count(): number

settings.accessorSpies.getters.count.mockReturnValue(3); // ✅
settings.accessorSpies.getters.count.mockReturnValue('three'); // ❌ TS2345
```

They are `Mock<…>`, not `MockInstance<…>`, so they stay callable: `accessorSpies.setters.theme('dark')`
and `accessorSpies.getters.theme()` compile.

## `accessorSpies` keyed by the configured lists

By default `accessorSpies` has a key for every member of `T`: TypeScript does not know which names you
passed in `gettersToSpyOn` at runtime. So `spy.accessorSpies.setters.name` compiles even where no setter was configured,
and reads `undefined` at runtime. Repeat the lists as a type argument, and `accessorSpies` has exactly
those keys:

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const thermo = createSpyFromClass<Thermo, { gettersToSpyOn: ['level'] }>(Thermo, {
  gettersToSpyOn: ['level'],
});

thermo.accessorSpies.getters.level.mockReturnValue(3); // ✅
thermo.accessorSpies.setters.level(3); // ✅ a getter/setter pair is mirrored into both
thermo.accessorSpies.getters.unit; // ❌ TS2339: `unit` is in no configured list
```

- Both `getters` and `setters` get the union of the two lists, because the runtime also spies the
  other half of a getter/setter pair the class declares.
- It is opt-in. Without a list in the type (the default `Spy<T>`), or with a non-literal `string[]`,
  every key stays.
- The same `Spy<Thermo, { gettersToSpyOn: ['level'] }>` works as a variable's declared type.

## `readonly` survives onto the double, and `mockValueProp` is the answer

A member the source type declares `readonly` is `readonly` on the spy too, so a plain assignment fails
with `TS2540`. Use `mockValueProp`:

```ts
import { createAutoMock, mockValueProp } from 'vitest-auto-spy';

interface Session {
  readonly accessToken: string;
}

const session = createAutoMock<Session>({ accessToken: 'first' });

session.accessToken = 'second'; // ❌ TS2540
mockValueProp(session, 'accessToken', 'second'); // ✅ the retry reads the refreshed token
```

A value in `overrides` cannot express the second value, because it is read once, when the spy is
created. [`mockValueProp` / `mockReadonlyProp`](/utilities/setup) accept a `readonly` member as it is,
and `restoreMockedProps()` undoes the patch.

**Common mistake:** `Reflect.set(spy, 'token', 'x')` as a workaround. It does not change a
spied getter: the write goes to the setter spy, and the getter answers as before. Only `mockValueProp`
works:

| Write                                               | Getter afterwards | Setter spy | Returned |
| --------------------------------------------------- | ----------------- | ---------- | -------- |
| `double.token = 'x'`                                | `undefined`       | recorded   | —        |
| `Reflect.set(double, 'token', 'x')`                 | `undefined`       | recorded   | `true`   |
| `Object.defineProperty` (what `mockValueProp` does) | `'x'`             | —          | —        |

`Mutable<T>` is an opt-in alternative, for a test that prefers plain assignments to plain **data**
members:

```ts
import { type Mutable, type Spy, createSpyFromClass } from 'vitest-auto-spy';

const session: Mutable<Spy<SessionService>> = createSpyFromClass(SessionService);

session.accessToken = 'second';
```

It does not help on a spied accessor: the assignment reaches the setter spy, and the getter keeps
answering `undefined`.

## A spy you can call with `new`

`createSpyClass(Class)` returns a real constructor. Every `new` creates a full spy of the class. Use it
when the code under test calls `new Foo()`: a `Worker`, an `IntersectionObserver`, a client class. A
runner mock (`vi.fn()`) cannot be called with `new` once it has a `mockReturnValue`.

```ts
import { createSpyClass, mockValueProp } from 'vitest-auto-spy';

const WorkerSpy = createSpyClass(BackgroundWorker);
mockValueProp(globalThis, 'BackgroundWorker', WorkerSpy);

service.start();

expect(WorkerSpy.calls[0]).toEqual(['./task.js']);
WorkerSpy.instances[0].postMessage.mockReturnValue(undefined);
```

| Member      | What it holds                                           |
| ----------- | ------------------------------------------------------- |
| `calls`     | the arguments of every `new` (and plain call), in order |
| `instances` | the `Spy<T>` created by each `new`, in order            |

The second argument is the same configuration as
[`createSpyFromClass`](./create-spy-from-class) takes, applied to each instance.

A spy of a **method** also answers `new`. For example, if `sdk` is a spy and its type declares
`sdk.Client` as a class, `new sdk.Client()` returns an instance, or the object you configured with
`calledWith(…).mockReturnValue(…)`. But it does not type the
member as a constructor, and the instance is not a `Spy<T>`. Use `createSpyClass` when the spy must be
a class in its own right; see [Constructor doubles](/utilities/constructor-doubles).

### The class's statics — `{ statics: true }`

Code often reads static members off the class it constructs: a `Worker.isSupported()` check, a
`Client.create()` factory, a `VERSION` constant. Without them the replacement fails inside production
code with `SpyClass.isSupported is not a function`. The third argument copies them over:

```ts
const SdkSpy = createSpyClass(Sdk, undefined, { statics: true }) as unknown as typeof Sdk;

expect(SdkSpy.VERSION).toBe('2.1.0'); // data, copied as it is
expect(vi.isMockFunction(SdkSpy.create)).toBe(true); // a base class's static, spied like its own
```

| Static member                       | Becomes                                                           |
| ----------------------------------- | ----------------------------------------------------------------- |
| function (own or from a base class) | a spy                                                             |
| data (`VERSION`)                    | copied as it is                                                   |
| accessor                            | skipped: running a getter while building the spy is a side effect |
| named `calls` or `instances`        | skipped: the spy's own `calls` and `instances` are kept           |

`statics` is off by default, because it adds members to the spy. The options type is exported as
`SpyClassOptions`.

**Statics have no types yet.** `ConstructorSpy<T>` describes the instances, so reading a static needs a
cast, and configuring one needs a second cast:

```ts
(SdkSpy.isSupported as unknown as { mockReturnValue(value: boolean): void }).mockReturnValue(false);

expect(SdkSpy.isSupported()).toBe(false);
```

## In depth

### Why the default stays `'last'`

The useful signature cannot be decided from the type. On a generated `observe` client it is the first
one; on a four-overload API gateway client it is the last one, and both can live in one project.
Telling them apart would mean naming Angular's `HttpEvent`, which this package's types cannot do. You
do not need to do anything about `HttpEvent` yourself; name the method instead.

This is also why you should name the method rather than trust the default: **overload order is not
always the author's**. A third-party `declare global` appends a signature to a global interface, and
the appended one is last:

```ts
// web-vitals
declare global {
  interface Performance {
    getEntriesByType<K>(type: K): PerformanceEntryMap[K][];
  }
}
```

So which signature `ReturnType` reads depends on which packages are installed, and can change on a
dependency update without any change in your code.

### Why removing `readonly` was reverted

Stripping the `readonly` modifier from `Spy<T>` was tried and reverted. It made the assignment compile
everywhere, including on a member replaced by a **spied accessor** (`gettersToSpyOn: ['accessToken']`).
There the write reaches the setter spy, and the getter keeps answering `undefined`. A clear type error
you can fix in one line became a silent no-op at runtime.
