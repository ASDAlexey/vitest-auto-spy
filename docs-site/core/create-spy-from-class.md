---
title: createSpyFromClass
description: Build a typed Spy<T> from a class - every method becomes a spy; options, accessor spies, spying on a real object, and edge cases.
---

# createSpyFromClass

`createSpyFromClass(Class, config?)` takes a class and returns a `Spy<T>`: an object with the same
methods, where every method is a spy with helpers that match its return type. Use it to replace a
class dependency in a test. The class constructor never runs.

```ts
import { of } from 'rxjs';
import { asInstance, createSpyFromClass } from 'vitest-auto-spy';

const users = createSpyFromClass(UserService, {
  returns: { load: of({ id: 1, name: 'Ann' }) }, // load(): Observable<User>, set up front
});
users.save.resolveWith(undefined); // save(user): Promise<void>

const profile = new ProfileStore(asInstance(users)); // the code under test
await profile.rename('Bob');

expect(users.save).toHaveBeenCalledWith({ id: 1, name: 'Bob' });
```

`returns` sets a method's answer at the moment you create the spy ("set up front"), so no separate
`mockReturnValue` line is needed. `asInstance` passes the spy where the real type is expected; see
[Bridging `Spy<T>` and `T`](./spy-typing). In Angular, [`provideAutoSpy`](/adapters/angular) takes the
same options and puts the spy into `TestBed`.

What you can do with each method afterwards (`calledWith`, `resolveWith`, `nextWith` …) is on
[Control helpers](./control-helpers).

## Configuration

The second argument is an options object. Every option is optional.

| Option                   | Type                                                  | Default                                 | Meaning                                                                                                                                   |
| ------------------------ | ----------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `returns`                | `{ method: value }`                                   | none                                    | what a method answers; it stays a spy ([details](#returns-—-the-value-where-the-spy-is-built))                                            |
| `overrides`              | `{ member: value }`                                   | none                                    | replace a member with a value ([details](#returns-or-overrides))                                                                          |
| `returnsUndefined`       | method names                                          | `[]`                                    | these methods answer `undefined` and count as configured ([details](#returns-undefined))                                                  |
| `selfReturning`          | method names                                          | `[]`                                    | these methods return the spy itself, for chains ([details](#self-returning))                                                              |
| `returnsClass`           | `{ method: Class }` or `{ method: [Class, options] }` | none                                    | these methods return a spy of that class ([details](#returns-class))                                                                      |
| `strict`                 | `boolean`                                             | `false`                                 | an unconfigured method throws instead of returning `undefined` ([details](#strict))                                                       |
| `onUnstubbedCall`        | `(call) => unknown`                                   | none                                    | runs instead of returning `undefined` ([Strict mode](./strict-mode#onunstubbedcall-—-the-general-form))                                   |
| `onUnstubbedRead`        | `(read) => void`                                      | none                                    | receives unconfigured getter reads ([Strict mode](./strict-mode#reads-nobody-configured))                                                 |
| `methodsToSpyOn`         | method names                                          | `[]`                                    | spy these **in addition** to the discovered methods                                                                                       |
| `onlyMethodsToSpyOn`     | method names                                          | none                                    | spy **only** these; skip discovery                                                                                                        |
| `instanceMethodsToSpyOn` | member names                                          | `[]`                                    | add callables that live on the instance, not the prototype ([details](#instancemethodstospyon-—-callables-that-are-not-on-the-prototype)) |
| `fillMissing`            | `boolean`                                             | `false` (`true` for ngrx `signalStore`) | answer any undeclared member with a spy ([details](#fill-missing))                                                                        |
| `observablePropsToSpyOn` | property names                                        | `[]`                                    | make these `Observable` properties controllable with `nextWith` …                                                                         |
| `gettersToSpyOn`         | accessor names                                        | `[]`                                    | spy these getters ([details](#accessor-spies-—-accessorspies))                                                                            |
| `settersToSpyOn`         | accessor names                                        | `[]`                                    | spy these setters                                                                                                                         |
| `autoSpyAccessors`       | `boolean`                                             | `false`                                 | spy every getter and setter on the prototype chain                                                                                        |
| `lazySpies`              | `boolean \| 'proxy'`                                  | by class width                          | when each method's spy is built ([details](#lazy-spies-—-lazyspies))                                                                      |

"Discovery" means the library reads every method on the class prototype, including base classes.
Every method it finds becomes a spy.

```ts
// 1. all discovered methods (the default)
createSpyFromClass(UserService);

// 2. the discovered methods PLUS these names (same as methodsToSpyOn)
createSpyFromClass(UserService, ['reload', 'count']);

// 3. only these methods, discovery skipped
createSpyFromClass(UserService, { onlyMethodsToSpyOn: ['getName', 'getAge'] });

// 4. a full options object
createSpyFromClass(UserService, {
  methodsToSpyOn: ['reload'],
  observablePropsToSpyOn: ['users$'],
  gettersToSpyOn: ['userName'],
  settersToSpyOn: ['userName'],
  strict: true,
});
```

**Common mistake:** passing an array to spy on _only_ those methods. An array **adds** names to the
discovered set (as in `jest-auto-spies`), and discovery already finds every prototype method. To spy on
nothing but a list, use `onlyMethodsToSpyOn`. A name in `onlyMethodsToSpyOn` that the class does not have
prints a warning; the additive lists stay silent, because naming members the prototype lacks is their
purpose.

### `strict` — a method nobody configured {#strict}

With `strict: true`, calling a method that the test never configured throws, instead of returning
`undefined`. The error names the class, the method and the arguments:

```ts
const users = createSpyFromClass(UserService, { strict: true });

users.load.resolveWith([]);
users.currentTenant(); // throws: UserService.currentTenant() was called; this strict double has nothing configured for it.
```

Without it, the `undefined` travels on and fails later, somewhere else. `setupAutoSpy({ strict: true })`
turns it on for a whole project, and `{ strict: false }` on one spy opts that spy out. What counts as
configured, and `onUnstubbedCall` for recording instead of failing: [Strict mode](./strict-mode).

### `instanceMethodsToSpyOn` — callables that are not on the prototype

Discovery reads the **prototype**, where `class` methods live. A function stored in an _instance field_
is not there: an arrow-function property, an Angular `signal()` / `computed()` field, a method of an ngrx
`signalStore()` (which [`fillMissing`](#fill-missing) covers by default). Name such members:

```ts
class TaskStore {
  readonly count = signal(0); // instance field, not on the prototype
  readonly reload = (): void => {}; // arrow property, same
  load(): void {} // ordinary method, discovered
}

createSpyFromClass(TaskStore, {
  instanceMethodsToSpyOn: ['count', 'reload'],
});
```

`instanceMethodsToSpyOn` and `methodsToSpyOn` behave the same: both **add** to what discovery found.
Prefer `instanceMethodsToSpyOn` in new code, because the name says why the member is listed. Neither
warns about a name the prototype does not have.

Angular's own classes need it too. `Router.currentNavigation` is an instance field since Angular 20, so
`provideAutoSpy(Router)` alone does not include it:

```ts
provideAutoSpy(Router, { instanceMethodsToSpyOn: ['currentNavigation'] });
```

#### The error you actually see

```
TypeError: Cannot read properties of undefined (reading 'mockReturnValue')
```

**Common mistake:** configuring an instance-field member without listing it. The member is not on the
spy, so it reads `undefined`, and configuring it throws the error above. Add the name to
`instanceMethodsToSpyOn`. (Why the library cannot guess it: the constructor never runs, so instance
fields never exist. See [In depth](#in-depth).)

### `fillMissing` — a partially abstract class {#fill-missing}

`fillMissing: true` answers any member the class never declared at runtime with a spy. You need it for
an abstract class that has at least one concrete member, the usual shape of an Angular DI token:

```ts
abstract class LocalStorage {
  abstract read(key: string): string | null;
  clear(): void {} // one concrete member
}

const storage = createSpyFromClass(LocalStorage);
storage.clear; // a spy
storage.read; // undefined: `abstract read()` does not exist at runtime

createSpyFromClass(LocalStorage, { fillMissing: true }).read; // a spy
// in Angular: providers: [provideAutoSpy(LocalStorage, { fillMissing: true })]
```

Without it, `Spy<T>` types `read` as present, but it is `undefined`, and production code fails with
`storage.read is not a function`.

- A **fully** abstract class (no concrete members) needs nothing: the factory then builds the spy from
  the type, like [`createAutoMock`](./auto-mock-by-type), and every method answers.
- It is off by default. TypeScript removes `abstract` at compile time, so at runtime the library cannot
  tell a partially abstract class from a concrete one. Filling every unknown member by default would
  hide real typos. For a short list, `instanceMethodsToSpyOn` is the alternative.
- A class built on an ngrx `signalStore()` gets `fillMissing: true` by default, because its
  `withMethods` / `withProps` members live on the instance. The library recognises the ngrx base by its
  name, `SignalStore`, and its `ɵprov`. `fillMissing: false` turns it off.
- A member the spy already has is read as usual.
- Keys that other code checks to find out what kind of object it has are never filled: `then`,
  `constructor`, `toJSON`, `asymmetricMatch`, `$$typeof`, `nodeType` and every symbol. A spy on
  `asymmetricMatch` would turn every `toEqual` against the spy into a matcher call; one on `toJSON` would
  change every snapshot.

## `returns` — the value, where the spy is built

`returns` sets what a method answers when you create the spy:

```ts
import { of } from 'rxjs';
import { provideAutoSpy } from 'vitest-auto-spy/angular';

providers: [provideAutoSpy(ProductsService, { returns: { getProducts: of([]) } })];
```

Without it, every test needs `injectSpy(X).m.mockReturnValue(…)` in a `beforeEach`. Do not replace that
with an exported `const` provider that already holds the values: under `isolate: false` every file that
imports it shares one set of spies.

The value is the method's **default**:

- a `calledWith(…)` chain configured later still decides the answer for its arguments;
- a later `resolveWith` / `failWith` replaces it;
- `undefined` counts as configured under `strict`;
- `resetAutoSpy` clears it.

**Common mistake:** a key that is not a spied method. Its value would never be returned, so it is
reported:

- a method `onlyMethodsToSpyOn` left out is named as such;
- a misspelling gets the closest method: `returns names 'lod', not a method of CartService — did you mean 'load'?`;
- a name with nothing close points at `instanceMethodsToSpyOn`, where a callable the constructor assigns
  belongs.

A misspelled `onlyMethodsToSpyOn` entry is reported the same way.

## `returns` or `overrides` {#returns-or-overrides}

`returns` says what a spied method answers and keeps it a spy. `overrides` replaces a member (a field, a
signal, a stream) with a plain value that is no longer a spy. The full comparison is on
[`returns` vs `overrides`](./returns-vs-overrides).

## A function in `overrides` stays a spy {#overrides-function}

A plain function in `overrides` for a method becomes that method's spy, with the function as its
implementation. Use it when the answer depends on the arguments:

```ts
import { SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

providers: [provideAutoSpy(DomSanitizer, { overrides: { sanitize: (_context, value) => String(value) } })];

const sanitizer = injectSpy(DomSanitizer);

sanitizer.sanitize(SecurityContext.URL, 'a'); // 'a': the function ran
expect(sanitizer.sanitize).toHaveBeenCalledOnce(); // and the call was recorded
```

- "Method" here means a prototype method, a name in `methodsToSpyOn`, `instanceMethodsToSpyOn` or
  `onlyMethodsToSpyOn`, or any member of the abstract-class fallback or a `fillMissing` spy.
- Every call is recorded and runs the function with the spy as `this`, until the test configures the
  method: a `calledWith(…)` chain decides for its own arguments, `resolveWith` or `mockReturnValue`
  replaces the function for every call, and `resetAutoSpy` brings the function back.
- Under `strict` the method counts as configured. The function also runs for a framework hook such as
  `ngOnDestroy`.
- The `overrides` value wins over `returns` and `selfReturning` for the same method.
- Each spy gets its own spy function, so a function registered through `registerAutoSpyDefaults` does not
  carry calls from one test into the next.

These are still stored exactly as you pass them:

- a value, a getter, and a function on a member that is not a method (a callback field);
- a class, and any callable with its own API: a `vi.fn()`, a spy from this library, a signal. A `vi.fn()`
  you hold keeps its identity, so `toBe` on it still passes.

On `createAutoMock` and `provideAutoSpyForToken` a function in `overrides` is stored as written and is
not a spy, because a type cannot say which members are methods.

## `returnsUndefined` — a list of `void` commands {#returns-undefined}

The listed methods answer `undefined` and count as configured under `strict`. It is the list form of
`returns: { m: undefined }`, for a store with several `void` commands:

```ts
provideAutoSpy(CartStore, { strict: true, returnsUndefined: ['add', 'remove', 'clear'] });
```

It works for any spied method, including names added with `instanceMethodsToSpyOn`. A method also
named in `returns` answers that value. `createSpyFromInstance`, `createAutoMock`,
`provideAutoSpyForToken` and `registerAutoSpyDefaults` take it too; registrations merge it like every
other list.

## `returnsClass` — a method that returns a spy of another class {#returns-class}

The listed methods return a spy of the class you name. Use it for a factory method whose result the
test configures too:

```ts
import { createSpyFromClass, innerDouble } from 'vitest-auto-spy';

const reports = createSpyFromClass(ReportFactory, { returnsClass: { create: Report } });

innerDouble(reports, 'create').render.mockReturnValue('<p>stub</p>');
```

It replaces two statements: `const report = createSpyFromClass(Report)` and
`returns: { create: asInstance(report) }`.

- Every call to `create()` returns the same `Report` spy. Two `ReportFactory` spies get two separate `Report` spies.
- `innerDouble(reports, 'create')` returns that spy, typed `Spy<Report>`, without calling `create`.
  So a test that counts the calls of `create` can use `returnsClass` too.
  `asSpy(reports.create(…))` also reaches the spy, but that read is a call.
- The method counts as configured under `strict`; a method also named in `returns` answers that value.
- Every factory takes it: `createSpyFromClass`, `createSpyFromInstance`, `createAutoMock`,
  `provideAutoSpy`, `provideAutoSpyForToken`, `registerAutoSpyDefaults`. The inner spy starts from the
  inner class's own registration.

To configure the inner spy, pass a pair: the class and the options `createSpyFromClass` takes for it.
The options are checked against that class.

```ts
provideAutoSpy(MatSnackBar, {
  strict: true,
  returnsClass: { openFromComponent: [MatSnackBarRef, { returnsUndefined: ['dismiss'] }] },
});
```

**Common mistake:** reading the inner spy with `reports.create()` in a test that asserts
`toHaveBeenCalledOnce()` on `create`. That read is a call too, so the count is off by one. Read it
with `innerDouble(reports, 'create')` instead.

## `selfReturning` — a method that answers the double itself {#self-returning}

The listed methods return the spy itself. Use it for chained calls such as
`query.where('a').orderBy('b').run()` or `inject(LOGGER).channel('auth').debug('…')`. Without it the
first unconfigured link returns `undefined`, and the next call throws, often inside a constructor
before the test's first line.

```ts
provideAutoSpy(QueryBuilder, { selfReturning: ['where', 'orderBy'], returns: { run: [] } });
provideAutoSpyForToken(LOGGER, undefined, { selfReturning: ['channel'] });
```

You cannot write this with `returns`, because the spy does not exist yet when you write the options.

- It is a default, like `returns`: it counts as configured under `strict`, and a later `calledWith` /
  `mockReturnValue` still wins.
- A method named in both answers its `returns` value. That is how one test removes a link from a chain
  a [registration](#registerautospydefaults-—-the-composition-lives-with-the-class) set up.
- Every factory takes it: `createSpyFromClass`, `createSpyFromInstance` (where the answer is the instance
  itself), `createAutoMock`, `provideAutoSpy`, `provideAutoSpyForToken`. `mockDeep` has a boolean
  `selfReturning` with the same idea for every level.

A member set in `overrides` wins over both. That is how you replace one registered link with a spy of
your own:

```ts
// vitest-setup.ts
registerAutoSpyDefaults(LOGGER, { returns: { info: undefined, err: undefined }, selfReturning: ['channel'] });

// one spec, which asserts on the channel rather than on the parent
provideAutoSpyForToken(LOGGER, { channel: () => asInstance(channelLogger) });
```

On `createAutoMock` and `provideAutoSpyForToken`, `returns` and `selfReturning` skip a member named in
`overrides`: a value, a plain function and a `vi.fn()` are all left exactly as given.

## Accessor spies — `accessorSpies`

Getters and setters are not methods, so their spies live in a separate object, `spy.accessorSpies`. List
them, or set `autoSpyAccessors: true` to spy every accessor on the prototype chain:

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const settings = createSpyFromClass(SettingsService, {
  gettersToSpyOn: ['theme'],
  settersToSpyOn: ['theme'],
});

settings.accessorSpies.getters.theme.mockReturnValue('dark');
expect(settings.theme).toBe('dark');

settings.theme = 'light';
expect(settings.accessorSpies.setters.theme).toHaveBeenCalledWith('light');
```

- The property itself reads and writes normally, so `settings.theme` stays typed as `string`.
- `accessorSpies` is non-enumerable: it is not in `Object.keys`, spreads, `toEqual` or snapshots.

### Naming one half gets the pair

`gettersToSpyOn: ['theme']` on a class that declares **both** a getter and a setter spies both, and the
other way round. It only adds what the class has, so a read-only member stays read-only.

### Seeding a spied getter

A value in `overrides` for a **spied getter** sets what that getter answers. This works whether the
getter is in `gettersToSpyOn`, found by `autoSpyAccessors`, or spied by a
[`registerAutoSpyDefaults`](#registerautospydefaults-—-the-composition-lives-with-the-class)
registration:

```ts
registerAutoSpyDefaults([[FlagsConfigService, { gettersToSpyOn: ['flagsConfig'] }]]); // setup file

providers: [provideAutoSpy(FlagsConfigService, { overrides: { flagsConfig: { theme: 'dark' } } })];

injectSpy(FlagsConfigService).flagsConfig; // { theme: 'dark' }, and the read is recorded
```

- The getter stays a spy, so a later `accessorSpies.getters.flagsConfig.mockReturnValue(…)` still
  replaces the value.
- A value for a member that has only a setter spy becomes a plain value.
- On the type-based spy of a fully abstract class, setting a member this way adds no `accessorSpies` of
  its own to `Reflect.ownKeys`, spreads, snapshots or `explainSpy`.

## `gettersToSpyOn` accepts a signal-valued getter

```ts
createSpyFromClass(LayoutStateService, { gettersToSpyOn: ['isCompactMode', 'sectionsLoaded'] });
```

A getter that returns a `Signal<T>` can be listed like any other. Any string key is accepted. The one
case that is reported at runtime is naming a **method**: that puts a spied accessor over the method, so
it can no longer be called on the spy.

For a signal, `mockSignalProp` from `vitest-auto-spy/angular` is usually the better tool; see
[Angular](/adapters/angular#patching-a-property-of-a-spy).

## Lazy spies — `lazySpies`

A method's spy is built the **first time the test reads it** (`spy.method`) and then reused. Methods a
test never touches cost nothing. This is the default, and it behaves exactly like eager spies:
`Object.keys`, `vi.isMockFunction`, `calledWith`, `resetAutoSpy` / `clearAutoSpy` and enumeration all
work the same.

```ts
const spy = createSpyFromClass(WideService);
spy.getName.mockReturnValue('Ada'); // getName is built here, on first read
// the other methods are never built
```

| Value     | When it is used                     | How a method waits                                          |
| --------- | ----------------------------------- | ----------------------------------------------------------- |
| `true`    | default for classes below 8 methods | a `get`/`set` placeholder per method                        |
| `'proxy'` | default from 8 methods              | one `Proxy` for the whole class; nothing defined until read |
| `false`   | only when you pass it               | every spy built up front                                    |

The width is the number of methods the spy covers, after `onlyMethodsToSpyOn`, `methodsToSpyOn` and
`instanceMethodsToSpyOn`. `trackInjections` and `createWithAutoSpies` use the same default.

**Common mistake:** turning laziness off "to be safe". Use `lazySpies: false` only when a test enumerates
the spy object itself instead of calling its methods, or touches every method of a small class. Numbers:
[Performance](/core/performance).

Behaviour worth knowing:

- **A never-read method has no recorded calls**, which is why `resetAutoSpy` can skip it.
- **A frozen or sealed spy still works.** `Object.freeze(cart)` cannot stop `cart.total.mockReturnValue(3)`:
  the spy is kept next to the object and every read returns the same spy. An assignment such as
  `cart.total = vi.fn()` is kept the same way. After only `Object.preventExtensions`, the spy lands on
  the object as usual.
- **`vi.spyOn` on a method nobody read yet works, but is not needed**: the member already is a spy, so
  `cart.total.mockReturnValue(3)` does it in one step. On a placeholder spy (below 8 methods, or
  `lazySpies: true`), `vi.spyOn` returns a forwarder: a configured `mockReturnValue` answers, an
  unconfigured call reaches the spy (with its `strict` check), and `mockRestore()` returns that spy with
  its recorded calls. Calling the forwarder detached from its object throws
  `'total' was called off its double after vi.spyOn`. On a proxy spy (8 methods or more), `vi.spyOn`
  returns the spy itself; `mockRestore()` resets it, and a detached call works.
- `Object.create(spy).method` builds the spy on the new object with `lazySpies: true`, and on the
  original spy with `'proxy'`.

### `lazySpies: 'proxy'` — one trap object instead of a placeholder per method

`'proxy'` is the default from 8 methods. Pass it to get it on a narrower class. It keeps a wide spy
light, because nothing is defined on the object until a method is read:

```ts
// a generated API client: 400 operations, a test touches two
const api = createSpyFromClass(GeneratedVenuesClient);

api.findById.resolveWith({ id: 1 }); // built here, like any lazy spy
```

From 8 methods up, a proxy spy uses less memory and builds faster than placeholders; below 8, the gain
is too small to be worth an object that is no longer plain. Measurements:
[Performance](/core/performance).

A test can notice a proxy spy in these places:

- `util.types.isProxy(spy)` is `true`, and a debugger shows `Proxy`;
- `console.log(spy)` / `util.inspect` lists only the methods read so far (Vitest snapshots, `toEqual`,
  `Object.keys` and spread are unchanged);
- `Object.getOwnPropertyDescriptor(spy, 'method')` on an unread method returns a new `get`/`set` pair on
  every call;
- `vi.spyOn(spy, 'method')` returns the spy's own method spy (see above);
- every member read goes through the proxy, which costs a little time in a very hot loop.

In those cases pass `lazySpies: true`, or register it once with
`registerAutoSpyDefaults(Class, { lazySpies: true })`.

Everything else behaves exactly as with placeholders: `Object.keys`, spread, `JSON.stringify`, `in`,
`hasOwnProperty`, `Object.getOwnPropertyDescriptor` (same accessor shape), `delete`, `Object.freeze`, key
order, `returns`, `overrides` and `fillMissing`. Reading a descriptor does **not** build the spy, because
`Object.keys` and teardown read descriptors too. A [symbol-keyed method](#edge-cases) is defined on the
object in this mode as well.

## `using` — reset at the end of the block {#using}

Every spy this package builds has a `[Symbol.dispose]()` method that calls `resetAutoSpy(this)`. Declare
the spy with `using`, and you do not need an `afterEach` just to reset it:

```ts
it('loads', () => {
  using cart = createSpyFromClass(Cart); // reset when the block ends
  cart.total.calledWith().mockReturnValue(42);

  expect(cart.total()).toBe(42);
});
// calls and configuration are gone: cart.total() is undefined again
```

- It is the full `resetAutoSpy`: recorded calls, `calledWith` / `mustBeCalledWith` chains,
  `resolveWith` / `nextWith` values, a plain `mockReturnValue`, a queued `mockReturnValueOnce`, and
  accessor spy configuration.
- You can call it by hand: `cart[Symbol.dispose]()`. The key is the same object on every read, as
  `Disposable` checks and `DisposableStack` expect.
- The key is non-enumerable, so it does not appear in a spread or a snapshot.
- There is no `[Symbol.asyncDispose]`: `resetAutoSpy` is synchronous, and `await using` falls back to
  `Symbol.dispose` anyway.

**Your toolchain must support the `using` syntax.** esbuild and `tsc` compile it down. Node 24 runs it
natively; an uncompiled `.js` file on Node 22 fails with `SyntaxError`. If your setup does not compile
it, call `[Symbol.dispose]()` or `resetAutoSpy()` directly.

- **Types:** the package needs neither `@types/node` nor `lib: ["esnext.disposable"]` to type-check. The
  `using` declaration in your own code still needs a `lib` that knows it.
- **Node 22:** the package defines `Symbol.dispose` where it is missing (for example in a Vitest `jsdom`
  or `happy-dom` environment), using the same `Symbol.for('nodejs.dispose')` symbol Node uses. A realm
  that already has it is left alone.

::: warning `createFunctionSpy` is not covered
A standalone `createFunctionSpy` is a runner mock, and Vitest gives every mock its own
`[Symbol.dispose]`, which calls `mockRestore()` and **restores the original implementation**. That is not
the same as clearing the library's configuration: the `calledWith` chains are not part of it. For a
function spy, `using` means whatever your runner means by it. Call `resetAutoSpy(spy)` to clear the
library configuration.
:::

## `registerAutoSpyDefaults` — the composition lives with the class

Some options belong to the **class**, not to one test: `Router` needs `events` as an Observable property
and `url` as a getter wherever it is spied. Register them once in the setup file, and every spy of that
class gets them:

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

Without a registration, each file writes its own options for the same class, and they drift apart. The
list options never complain about a name they cannot find, so a file that forgot `events` stays green
until production code starts using it. [In depth](#how-often-the-options-drift) shows how often this
happens.

| Call                                         | Effect                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `registerAutoSpyDefaults(Class, cfg)`        | register options for one class; a second call replaces the first                             |
| `registerAutoSpyDefaults([[Class, cfg], …])` | register many at once ([below](#many-at-once))                                               |
| `clearAutoSpyDefaults(Class)`                | remove one registration                                                                      |
| `clearAutoSpyDefaults()`                     | remove all, for a project that registers per project, or a test that needs an empty registry |

**Common mistake:** registering on a base class and expecting subclasses to get it. Registrations match
by exact class, not by inheritance. Otherwise one registration on a widely used base class would change
spies in files nobody was looking at.

### The merge

The registration is the base; the options at the call add to it:

| Key                                                        | Merged how                               |
| ---------------------------------------------------------- | ---------------------------------------- |
| every list (`gettersToSpyOn`, `observablePropsToSpyOn`, …) | combined, registration first, no repeats |
| `returns`, `overrides`                                     | key by key; the call wins                |
| every single value (`lazySpies`, `strict`, `fillMissing`)  | the call wins when it sets the key       |

The array shorthand merges too: `createSpyFromClass(X, ['reload'])` merges as
`{ methodsToSpyOn: ['reload'] }`.

**`createSpyFromInstance` uses registrations too**, found by the class the object's `constructor`
names and merged the same way.

- An object literal or an `Object.create(null)` dictionary finds no registration.
- When the call lists `onlyMethodsToSpyOn`, the rest of the object stays real. The registration then
  adds only `strict`, `onUnstubbedCall`, `onUnstubbedRead`, and the `returns` / `selfReturning`
  entries of the listed methods, never an accessor, another method or an `overrides` value. So
  `router.url` stays real under `createSpyFromInstance(router, { onlyMethodsToSpyOn: ['navigateByUrl'] })`.
- A `returns` or `selfReturning` name at the call for a method it left real is reported and skipped.

### Many classes at once {#many-at-once}

Pass a table instead of a dozen calls:

```ts
// vitest-setup.ts, once
registerAutoSpyDefaults([
  [Router, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] }],
  [AccountService, { gettersToSpyOn: ['isGuest', 'currentProfile'] }],
  [LocalStorage, { instanceMethodsToSpyOn: ['getItem', 'setItem'] }],
]);
```

- **Each row is type-checked against its own class.** A key the class does not have fails on that
  row's line, and the error lists only that class's members:

  ```ts
  registerAutoSpyDefaults([
    // Type '"isGuest"' is not assignable to type '"navigate" | "navigateByUrl" | …'
    [Router, { instanceMethodsToSpyOn: ['isGuest'] }],
    [AccountService, { gettersToSpyOn: ['isGuest'] }],
  ]);
  ```

- **Rows apply in order**, so a later row for the same class replaces an earlier one, as a second call
  would. A table and single calls write to the same registry.
- `AutoSpyDefaultEntry<T>` is the row type, for a row built outside the literal.

### A dependency behind an `InjectionToken` {#token-defaults}

Tokens can be registered too, through the `registerAutoSpyDefaults` from `vitest-auto-spy/angular`. The
core export takes classes only, because it cannot refer to Angular's `InjectionToken`; the `/angular`
export adds tokens to the same registry.

```ts
// vitest-setup.ts, once
import { registerAutoSpyDefaults } from 'vitest-auto-spy/angular';

registerAutoSpyDefaults(LOGGER, { returns: { info: undefined, err: undefined }, selfReturning: ['channel'] });
registerAutoSpyDefaults(NAVIGATION, { overrides: { activeRow$: of({}) }, returns: { setFocus: undefined } });

// every spec, from then on
providers: [provideAutoSpyForToken(LOGGER), provideAutoSpyForToken(NAVIGATION, { activeRow$: rows$ })];
```

- `provideAutoSpyForToken` merges its second argument (values) and third argument (options) over the
  registration by the rules above. A registered `returns` stays a default that a later `calledWith` or
  `resolveWith` replaces.
- A token row takes `AutoSpyTokenDefaults<T>`: the options of [`createAutoMock`](./auto-mock-by-type)
  (`returns`, `selfReturning`, `returnsUndefined`, `observablePropsToSpyOn`, `strict`, `name`) plus
  `overrides`. Every key is checked against the token's `T`, and a table can mix class and token rows.

**Common mistake:** importing `registerAutoSpyDefaults` from `vitest-auto-spy` for a token. It fails with
`TS2345 … 'InjectionToken<AppLogger>' is not assignable to parameter of type 'ClassType<unknown>'`.
Import it from `vitest-auto-spy/angular`.

## `passthrough` — observe a real object without replacing it {#passthrough}

`createSpyFromInstance(obj)` turns the methods of an object you already have into spies. By default each
spy answers `undefined`. With `passthrough: true` the object keeps working: every call is recorded, and
a method you did not configure runs the real one.

```ts
import { createSpyFromInstance } from 'vitest-auto-spy';

const cart = createSpyFromInstance(new CartStore(), { passthrough: true });

cart.add('apple'); // the real add ran: cart.items is ['apple']
expect(cart.add).toHaveBeenCalledWith('apple');

cart.checkout.resolveWith('declined'); // from here on, only checkout is replaced
```

It is Vitest's spy mode (`vi.mock(path, { spy: true })`) for one object, on every runner, and replaces
calling `vi.spyOn` on each method in turn. Only `createSpyFromInstance` has it: a class factory has no
instance, so there is no real method to run.

The rules:

- **A configured method stops calling the real one.** `calledWith`, `mustBeCalledWith`, `resolveWith`,
  `nextWith`, `failWith`, `mockReturnValue`, `mockImplementation`, `returns` and `selfReturning` all
  replace the real method. A `calledWith(1)` chain answers `undefined` for `load(2)`, as on any spy;
  it does not fall back to the real `load`.
- **`resetAutoSpy` brings the real method back.** `clearAutoSpy` keeps the configuration, as always. In
  the jasmine layer, `.and.callThrough()` runs the real method again.
- **The real method runs with the object as `this`**, so its internal calls go through the spies and
  are recorded: `cart.add` calling `this.count()` shows up on `cart.count`.
- **Some members stay real.** Angular lifecycle hooks (`ngOnInit`, `ngOnDestroy`, …), because the
  framework calls them and teardown must run. A discovered callable with its own API (an Angular
  `signal()` field with `set` and `update`, a mock), because a spy would hide that API. Name one in
  `methodsToSpyOn` to spy it anyway. A discovered class stays real too; a named one becomes a plain spy.
- **Accessors and Observable properties you name are replaced.** `gettersToSpyOn`, `settersToSpyOn`
  and `observablePropsToSpyOn` ask for replacement, and get it.
- **A named member the object does not have** has nothing real to run, and answers like any spy:
  `undefined`, or what a suite-wide strict mode says.
- **`strict: true` or `onUnstubbedCall` on the same call is refused**, because both decide what an
  unconfigured call does. A suite-wide `setupAutoSpy({ strict: true })` or a strict
  `registerAutoSpyDefaults` yields to `passthrough`; see [Strict mode](./strict-mode#passthrough).

In Angular, use it to check an interaction without breaking the service: take the real service from
`TestBed.inject` and spy on it in place. Its dependencies, signals and `ɵprov` stay real, and `TestBed`
teardown still calls the real `ngOnDestroy`:

```ts
const cart = createSpyFromInstance(TestBed.inject(CartService), { passthrough: true });
const fixture = TestBed.createComponent(CartComponent);

fixture.componentInstance.addOne();

expect(cart.add).toHaveBeenCalledWith(5); // the real CartService ran, with its real PriceFormatter
```

`restoreSpiedInstance(obj)`, or `using`, puts the real members back. `setupAutoSpy()` does it after every
test.

### One method — `spyOnOwnMethod` {#spy-on-own-method}

`spyOnOwnMethod(sut, 'method')` watches **one** method of the object under test and lets it run:

```ts
import { spyOnOwnMethod } from 'vitest-auto-spy';

const seek = spyOnOwnMethod(player, 'seek');

player.seek(1000); // the real seek ran
expect(seek).toHaveBeenCalledWith(1000);
```

It is `onlyMethodsToSpyOn` plus `passthrough` in one call: every other member stays real, the real
method runs until the test configures the spy, and `restoreSpiedInstance` / `setupAutoSpy()` put it
back. It also replaces a plain `vi.spyOn(component, 'method')` where a lint preset bans `vi.spyOn`.

### A live DOM node is not a collaborator {#live-dom-node}

**Common mistake:** `createSpyFromInstance(el)` on a live DOM node. Past the component's own class, the
prototype chain belongs to the DOM engine. happy-dom's `Node.removeChild`, for example, calls an internal
symbol-keyed method on the child. Once that method is a spy, a strict suite cannot remove the node from
`document.body`, and the leftover node fails later tests in the file.

So `createSpyFromInstance` warns before it changes anything, when it gets a live `Node`, the global
`window` or another engine-provided event target (`XMLHttpRequest`, `AbortSignal`, happy-dom's
`MediaQueryList`) without `onlyMethodsToSpyOn`. Your own class that extends `EventTarget` does not
count. `setupAutoSpy({ misconfiguration: 'throw' })` turns the warning into a failure before the node
is touched.

What to do instead:

- `{ onlyMethodsToSpyOn: ['addEventListener'] }` spies only that method. The array shorthand
  `createSpyFromInstance(el, ['addEventListener'])` does **not** help: it adds to discovery
  ([The merge](#the-merge)), so the whole node is still walked.
- `mockValueProp(el, 'addEventListener', vi.fn())` replaces one property and leaves the node real.
- For a native `void` method the handler should call (`preventDefault`, `stopPropagation`, `focus`), use
  `spyOnVoidMethod`. It combines `onlyMethodsToSpyOn` with `returns: { preventDefault: undefined }`, which
  a strict suite would otherwise need:

```ts
import { spyOnVoidMethod } from 'vitest-auto-spy';

const preventDefault = spyOnVoidMethod(event, 'preventDefault');

handler(event);

expect(preventDefault).toHaveBeenCalledTimes(1);
```

## A single function — `createFunctionSpy`

When there is no class at all, `createFunctionSpy<Fn>(name)` builds one spy with the same helpers. The
`name` appears in failure messages.

```ts
import { createFunctionSpy } from 'vitest-auto-spy';

const load = createFunctionSpy<(id: number) => Promise<string>>('load');

load.calledWith(1).resolveWith('value');

await expect(load(1)).resolves.toBe('value');
```

## The `Spy<T>` shape

`Spy<T>` is a **mapped type** over `T`:

- every **method** becomes a mock plus the helpers its return type allows: `calledWith` /
  `mustBeCalledWith` always, `resolveWith` / `rejectWith` for a `Promise`, `nextWith` / `throwWith` / …
  for an `Observable`;
- every **`Observable` property** gains the Observable helpers and keeps its own type;
- everything else keeps its declared type;
- an `accessorSpies` object is added.

A mapped type **drops `#private` and `private` members**, so `Spy<T>` is not assignable to `T`. Declare
the variable as `Spy<T>`, or convert with [`asInstance` / `asSpy`](./spy-typing):

```ts
let users: Spy<UserService>; // ✅
let users: UserService = createSpyFromClass(UserService); // ❌ private members missing
```

## A method whose return type is `never`

A generic method with a conditional return type, such as
`get<K extends keyof T>(k: K): T[K] extends Stringified<infer R> ? R : never` (the usual shape of a
typed configuration service), keeps a usable spy. Its helpers fall back to the synchronous set
(`mockReturnValue`, `calledWith`, …), so the member does not become `never`.

## Edge cases

**Inherited methods are spied.** Discovery reads the whole prototype chain, so a method from a base
class is spied like the subclass's own. `Object.prototype` is not included.

**A chain that does not end at `Object.prototype` is read too.** A class whose prototype has a `null`
parent, and an `Object.create(null)` dictionary passed to `createSpyFromInstance` (a registry of handlers,
a bag of callbacks), have their functions discovered as usual. Another realm's `Object.prototype` is
recognised and skipped like this realm's.

**Symbol-keyed methods are spied.** A class that declares `[SERIALIZE]()` or
`[Symbol.for('app.render')]()` gets a spy under that key, typed and configured like a named one:

```ts
const envelope = createSpyFromClass(Envelope);

envelope[SERIALIZE].calledWith(payload).mockReturnValue('{}');
```

The runtime's own symbols are left alone: every symbol on `Symbol` (`Symbol.iterator`,
`Symbol.toPrimitive`, `Symbol.asyncIterator`, `Symbol.dispose`, …) plus
`Symbol.for('nodejs.util.inspect.custom')`. A spy there would break the object: `[...spy]` would stop
working on an iterable class, string conversion would return `undefined`, and `Symbol.dispose` is
already used by [`using`](#using). The list is read from `Symbol`, so new runtime symbols are covered
too.

**Abstract classes work at runtime**: an abstract class is still a constructor with a prototype. Only
TypeScript refuses to type it as `ClassType<T>`. Pass a concrete subclass and keep the abstract class as
the DI token:

```ts
providers: [{ provide: PaymentGateway, useValue: createSpyFromClass(StripeGateway) }];
```

`injectSpy` accepts an abstract class as its token, so reading the spy back needs nothing special.

**A `then()` method is left out.** A spy there would make the object "thenable" with a `then` that never
calls back, so `await spy`, or returning the spy from an `async` function, would hang the test. The
factory warns once per class. Name it in `methodsToSpyOn: ['then']` when the test really drives `then`;
`returns: { then }` without that is reported, because there is no spy to answer it.

**Discovery stops at a built-in base class.** `class AppError extends Error` gets spies for its own
methods only, not `toString`. The same holds for `extends Array`, `extends EventTarget`,
`extends HTMLElement`. Name a built-in method in `methodsToSpyOn` to spy it. A built-in spied directly,
such as `createSpyFromClass(WebSocket)`, is discovered whole.

**The constructor never runs.** The spy is built from the prototype, so a constructor that opens a
socket or reads config is not a problem.

**No class?** [`createAutoMock<T>()`](./auto-mock-by-type) builds the same kind of spy from a type,
`mockDeep<T>()` does it for nested objects, and `createMock<T>()` returns a plain `T` for data the code
only reads.

## In depth

### Why an instance field cannot be found

Instance fields exist only after a constructor has run, and this factory never runs the constructor.
That is what makes it safe for a service whose constructor opens a socket. The only alternative would
be to answer every unknown member with _something_. That something would be truthy, so
`if (service.optionalThing)` in the code under test would take the wrong branch, silently, in another
file. The [protocol deny-list](/core/auto-mock-by-type#it-answers-everything-so-it-must-not-answer-these)
exists to avoid exactly that, and a clear `TypeError` on the test's own line is the better failure.

### How often the options drift

In one Angular project, 739 of 2 228 `provideAutoSpy` calls passed options, and the same class
collected many different ones:

| class                   | calls | files | with options | **distinct option sets** |
| ----------------------- | ----: | ----: | -----------: | -----------------------: |
| `Router`                |   122 |   109 |           60 |                   **23** |
| `AccountService`        |    70 |    62 |           43 |                   **27** |
| `CheckoutStateService`  |    53 |    52 |           42 |                   **25** |
| `RemoteSettingsService` |    85 |    70 |           47 |                        8 |

The `*FlagsConfigService` family had 205 calls, 120 of them repeating
`{ gettersToSpyOn: ['flagsConfig'] }` word for word. With 23 different option sets for `Router`, most
files did not spy `events` at all, and none of them would notice when production code started using
it.

### How the placeholders are shared

With `lazySpies: true`, the placeholder a method waits behind is one `get`/`set` pair per method
**name**, shared by every spy that has a method of that name. An untouched spy stays small whatever
the class width. The first method read turns the spy into a property dictionary as wide as the class,
which is why wide classes get `'proxy'` by default.
