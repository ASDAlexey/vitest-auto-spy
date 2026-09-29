---
title: Strict mode
description: strict and onUnstubbedCall - a spy method nobody configured throws and names the class, the method and the arguments, instead of returning undefined.
---

# Strict mode

With `strict: true`, a spy method that the test never configured throws when it is called, instead of
returning `undefined`. Turn it on when a test fails far from the real cause, or passes on an empty
answer.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const users = createSpyFromClass(UserService, { strict: true });

users.load.resolveWith([]); // configured
users.currentTenant(); // throws: UserService.currentTenant() was called; this strict double has nothing configured for it.
```

Without `strict`, `users.currentTenant()` returns `undefined`. The code under test then fails a few
calls later, in another file: `TypeError: Cannot read properties of undefined (reading 'id')`. Strict
mode moves the failure to the line that made the call and names the method you forgot.

"Configured" means the test told the method what to answer: `resolveWith`, `calledWith`, the `returns`
option and so on. The full list is in [What counts as configured](#what-counts-as-configured).

| Option                 | Where                       | Type                                             | Default                                     | Meaning                                                          |
| ---------------------- | --------------------------- | ------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------- |
| `strict`               | any factory, `setupAutoSpy` | `boolean` (`setupAutoSpy` also takes `'survey'`) | `false`                                     | an unconfigured call throws                                      |
| `onUnstubbedCall`      | any factory, `setupAutoSpy` | `({ className, method, args }) => unknown`       | none                                        | runs instead of returning `undefined`; its result is the answer  |
| `name`                 | `createAutoMock`            | `string`                                         | none                                        | the name the message prints for a spy built from a type          |
| `swallowedStrictCalls` | `setupAutoSpy`              | `'throw' \| 'warn' \| 'off'`                     | `'throw'` with `strict: true`, else `'off'` | fail a test whose strict throw was caught by the code under test |
| `unconfiguredReads`    | `setupAutoSpy`              | `'off' \| 'warn' \| 'throw'`                     | `'off'`                                     | report getters read and streams never fed on a strict spy        |
| `onUnstubbedRead`      | any factory, `setupAutoSpy` | `({ className, member, kind, count }) => void`   | none                                        | receive those reads instead of the report                        |

## Turning it on for a whole suite

Add one line to the setup file. Every spy created after it is strict.

```ts
// vitest.setup.ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ strict: true });
```

The setup file is the one listed in `test.setupFiles` of `vitest.config.ts`; see
[Installation](./installation).

- **Try it first.** `setupAutoSpy({ strict: 'survey' })` throws nothing. It counts every call strict
  mode would refuse and prints the list at the end of each file. For one run without editing the file,
  set `VITEST_AUTO_SPY_STRICT=survey` (`true`/`1` and `false`/`0` also work).
- **Exempt one spy** with `strict: false` on that spy: `createSpyFromClass(Cart, { strict: false })`.
- **The setting stays in its file.** `setupAutoSpy` turns the default on only when you pass the option,
  and turns it off in `afterAll` of the file that turned it on. With `isolate: false` several files
  share one module, so a default left on would fail a spec that never asked for it.

More setup switches: [Test-run hygiene → strict doubles](/utilities/setup#_10-strict-doubles-for-the-whole-suite).

### A throw that never reached the test

The code under test can swallow a strict throw. A `try`/`catch` turns it into an error branch. An RxJS
operator without an error handler rethrows it inside a `setTimeout`, and a fake clock never runs that
timer. The test then goes on without the answer it needed, and may pass.

So `setupAutoSpy({ strict: true })` records every strict throw. After each test it fails the test with
the throws the runner never saw. The option is `swallowedStrictCalls`: `'throw'` (the default with
`strict: true` and the strict preset), `'warn'` or `'off'`.

If a test triggers a strict throw on purpose, take it with `takeStrictViolations()`. That also works
as an assertion:

```ts
import { takeStrictViolations } from 'vitest-auto-spy/setup';

expect(() => cart.total()).toThrow('Cart.total() was called');
expect(takeStrictViolations()).toHaveLength(1);
```

### Precedence

The most specific setting wins. The library checks them in this order and stops at the first one that
is set:

1. the spy's own `onUnstubbedCall`
2. the spy's own `strict: false` (the only way to exempt one spy from a suite-wide default)
3. the global `onUnstubbedCall` from `setupAutoSpy`
4. the spy's own `strict: true`
5. the global `strict`

```ts
import { createSpyFromClass } from 'vitest-auto-spy';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ strict: true });

createSpyFromClass(Cart).total(); // throws
createSpyFromClass(Cart, { strict: false }).total(); // undefined: this spy opted out
```

In short: a handler, global or the spy's own, always beats `strict: true`. So
`{ strict: true, onUnstubbedCall: record }` on one spy records the call and does not throw. The spy's
own `strict: false` beats the global handler.

### `passthrough` sits above all five {#passthrough}

[`createSpyFromInstance(obj, { passthrough: true })`](./create-spy-from-class#passthrough) gives an
unconfigured call a third answer: run the real method. For every member with a real method,
`passthrough` wins over the whole list above. That includes a suite-wide `strict: true`, a global
handler and a strict `registerAutoSpyDefaults` for the class. Otherwise turning strict on for a suite
would silently turn every passthrough spy into a throwing one.

```ts
import { createSpyFromInstance } from 'vitest-auto-spy';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ strict: true });

createSpyFromInstance(new Cart(), { passthrough: true }).total(); // the real total
createSpyFromInstance(new Cart()).total(); // throws: Cart.total() was called; …
```

Two rules keep this explicit:

- **You cannot combine them on one call.** `{ passthrough: true, strict: true }` and
  `{ passthrough: true, onUnstubbedCall }` throw when the spy is created. Both decide what an
  unconfigured call does, so one of them would never run. `strict: false` next to `passthrough` is
  fine: it says the same thing.
- **A member with no real method stays strict.** A name from `methodsToSpyOn` that the object does not
  have has nothing to run, so a suite-wide `strict` still throws for it.

## The message

This is the exact text for a `Cart` whose `checkout(id, when)` nobody configured, called from
`cart.component.ts`:

```
[vitest-auto-spy] Cart.checkout(1, 'now') was called; this strict double has nothing configured for it.
Called from src/app/cart.component.ts:41:12
Configure it in the test: cart.checkout.calledWith(1, 'now').mockReturnValue(…) for these arguments, or .mockReturnValue(…) for any — .resolveWith(…) / .nextWith(…) when it returns a Promise / Observable.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/strict-mode#the-message
```

How to read it:

- **The first line shows the whole call with its arguments.** A service often calls one method several
  times, and the arguments tell you which call is missing.
- **`Called from`** is the first line of your code on the stack. It skips the spy, the library and
  `node_modules`, and the path is relative to the project root. If there is no such line, the message
  leaves it out.
- **The suggested `calledWith(…)` repeats the call's arguments**, so you can paste it as it is. A call
  without arguments suggests only `.mockReturnValue(…)`.
- **`cart` is a guess at your variable name**: the class name in lower camel case. If the class name
  is not a valid identifier, the message says `double`.

Plain data prints in full, up to 200 characters per argument. A class instance or a DOM node prints as
its class name: `[HTMLDivElement]`, `[Session]`. Printing such objects in full could run a worker out
of memory when a run has hundreds of strict failures.

**A spy built from a type has no class name.** It is named after the line that created it:
`createAutoMock(users.spec.ts:12).getName(1) was called`. That keeps two unnamed spies in one file
apart. To choose the name yourself, pass `name`:

```ts
import { createAutoMock } from 'vitest-auto-spy';

const users = createAutoMock<UserApi>(undefined, { strict: true, name: 'USERS' });
```

`provideAutoSpyForToken` uses the token's description on its own:
`InjectionToken CAROUSEL_RESIZE_OBSERVER.observe(…) was called`.

`createSpyFromClass` on a **fully abstract class** (a class whose members are all `abstract`) builds the
spy from the type instead. It still prints the class name, `Storage.read('k') was called`, and it
still supports strict mode.

## What counts as configured

A method counts as configured if the test configured it **in any way**. The check asks about the
method, not about the arguments, and runs before any argument matching.

| Configured by                                                                 | Unconfigured-call check runs |
| ----------------------------------------------------------------------------- | ---------------------------- |
| `calledWith(…)` / `mustBeCalledWith(…)`: **any** chain, any arguments         | no                           |
| `resolveWith` / `rejectWith` / `resolveWithPerCall`                           | no                           |
| `nextWith` / `throwWith` / `complete` / `returnSubject`                       | no                           |
| the `returns:` option (a default stored in the spy)                           | no                           |
| the `selfReturning:` / `returnsUndefined:` lists (the same kind of default)   | no                           |
| `mockReturnValue` / `mockImplementation` from your test runner                | never runs (see below)       |
| `overrides` on `createAutoMock` (the member is a plain value, not a spy)      | never runs (see below)       |
| a function in `overrides` for a `createSpyFromClass` method (the spy runs it) | no                           |
| nothing                                                                       | **yes**                      |

**`mockReturnValue` and `mockImplementation` replace the library's own handling of the call.** The
check lives in that handling, so strict mode never fires for that method. A `calledWith` added to the
same method afterwards is ignored too.

**`vi.when` (Vitest 5) works together with the library.** It wraps the spy's implementation: calls that
match a `vi.when` row get its answer, and every other call reaches the library. So a `calledWith` on
the same method keeps working, in either order, with no warning. After `vi.when(spy)[Symbol.dispose]()`
or `mockReset()`, the library answers alone again. A `vi.when` on top of a `mockReturnValue` is still
reported, because the `mockReturnValue` already replaced the library's handling.
`vi.when(spy, { onUnmatched: 'throw' })` is the per-method version of `strict: true`.

**Common mistake:** a `mockReturnValueOnce` sequence that runs out. Each `Once` value is used once.
When the queue is empty, the next call reaches the check and throws:

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const cart = createSpyFromClass(Cart, { strict: true });

cart.total.mockReturnValueOnce(5);
cart.total(); // 5
cart.total(); // throws: Cart.total() was called; this strict double has nothing configured for it.
```

If the sequence is meant to run out, also set a standing value: `cart.total.mockReturnValue(0)`.

`returns:` sets a default. A later `calledWith` wins for its arguments, and a later `resolveWith` or
`failWith` replaces the default. To say that a `void` call is expected, write
`returns: { save: undefined }`.

Sometimes the code under test has a defensive branch for `undefined`, such as
`camera.translate(…) ?? of(null)`, on a method typed to return an `Observable`.
`mockReturnValue(undefined)` is a type error there. Use `returns: { translate: undefined }`, or after
creation `camera.translate.mockReturnValue(outOfType(undefined))`, which marks the value as outside
the type on purpose. Both count as configured, so the spy can stay strict.

A reset makes the method unconfigured again. After `resetAutoSpy(users)`, or at the end of a
[`using` block](./create-spy-from-class#using), the check fires again, because the configuration is
really gone.

## What it deliberately does not do

**A `calledWith` for other arguments does not make it throw.**

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const cart = createSpyFromClass(Cart, { strict: true });

cart.checkout.calledWith(1, 'now').mockReturnValue('one');

cart.checkout(9, 'later'); // undefined, no throw
```

Strict mode answers "nobody configured this method", not "nobody configured this call". To fail on
unexpected arguments, use [`mustBeCalledWith`](./control-helpers#what-a-mustbecalledwith-failure-prints):
it throws and prints the expected arguments next to the actual ones.

**Angular lifecycle hooks never throw.** `ngOnInit`, `ngOnChanges`, `ngDoCheck`, `ngOnDestroy` and the
four `ngAfter…` hooks answer `undefined` on a strict spy, configured or not. Angular calls `ngOnDestroy`
itself on every provided value when `TestBed` is torn down, and no test asked for that call. A throw
there would break the teardown and fail the tests that follow. The calls are still recorded, so
`expect(spy.ngOnDestroy).toHaveBeenCalled()` works.

## `onUnstubbedCall` — the general form

`strict: true` is a shortcut for a handler that throws. With `onUnstubbedCall` you write the handler
yourself. Whatever it returns becomes the call's return value.

```ts
type UnstubbedCallHandler = (call: { className: string | undefined; method: string; args: unknown[] }) => unknown;
```

**Record instead of failing.** Use this to see how many calls are unconfigured before you turn strict
on for a whole suite:

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const unstubbed: string[] = [];

const users = createSpyFromClass(UserService, {
  onUnstubbedCall: ({ className, method }) => void unstubbed.push(`${className}.${method}`),
});
```

**Return one fallback value for every unconfigured call** (the same idea as `fallbackMockImplementation`
in `vitest-mock-extended`):

```ts
import { createAutoMock } from 'vitest-auto-spy';

createAutoMock<Api>(undefined, { onUnstubbedCall: () => null }); // never undefined, never a throw
```

For a spy built from a type, `className` is the name the message prints: its `name`, or
`createAutoMock(file:line)` if it has none.

## Reads nobody configured

The check above runs on a **call**. Two kinds of member on a strict spy are not calls:

- a spied getter (from `gettersToSpyOn`) that nobody configured still answers `undefined`;
- an observable property (from `observablePropsToSpyOn`) that nobody fed is a stream that never emits.

Both let the code under test take its "no data" branch while the test stays green. A read cannot throw
on the spot: when a spy appears in a failure diff, the diff reads its getters, and a throw there would
break the message. So `setupAutoSpy` counts such reads during the test and reports them after it:

```ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ strict: true, unconfiguredReads: 'throw' }); // 'off' (default) | 'warn' | 'throw'
```

```
[vitest-auto-spy] Router.url was read 3 times on a strict double and nothing configured it, so the code under test got undefined.
Configure it in the test: accessorSpies.getters.url.mockReturnValue(…), or mockReturnValue(undefined) when undefined is the answer meant.
[vitest-auto-spy] Router.events was subscribed to 1 time on a strict double and never emitted.
Feed it in the test: events.nextWith(…), or seed overrides: { events: new Subject() } and drive that Subject; overrides: { events: NEVER } when this test never fires it.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/strict-mode#reads-nobody-configured
```

The details:

- **What counts.** A read of a getter from `gettersToSpyOn`, `settersToSpyOn` or `autoSpyAccessors`
  that nothing configured. A subscription to an `observablePropsToSpyOn` stream that nothing fed **by
  the end of the test**. Subscribing in `beforeEach` and calling `nextWith` in the test is normal and is
  not reported. A getter read is judged when it happens: configuring the getter after the code read it
  does not undo the read.
- **When.** From the `beforeEach` of `setupAutoSpy`, which runs before the spec's own hooks, to its
  `afterEach`, which runs after them. The spec's own `beforeEach` is included, because many tests run
  the code under test there. Test collection, `beforeAll` and `afterAll` are not included.
- **How to configure a getter:** `accessorSpies.getters.x.mockReturnValue(…)` or
  `mockImplementation(…)`, `overrides: { x: … }` (at the call or in a `registerAutoSpyDefaults` entry),
  or `mockReadonlyProp(spy, 'x', …)`. A `mockReturnValueOnce` counts until its queue runs out. If
  `undefined` is the answer you mean, say so: `accessorSpies.getters.x.mockReturnValue(undefined)`.
- **How to feed a stream:** `nextWith`, `nextOneTimeWith`, `nextWithValues` with at least one value,
  `throwWith`, `complete`, `returnSubject`, or a real stream in `overrides`. Listing a member in a
  registered default configures nothing by itself.
- **Which spies.** Strict ones (`strict: true` on the spy or for the whole suite) built by
  `createSpyFromClass`, `provideAutoSpy`, `createSpyFromInstance`, and, for their observable
  properties, `createAutoMock` and `provideAutoSpyForToken`. `strict: false` on a spy exempts it.
  `mockDeep` nodes are not covered ([Where it does not reach](#where-it-does-not-reach)).
- **Under `test.concurrent`.** Each concurrent test has its own window. A read does not say which test
  made it. A read made while only one test was running is charged to that test. A read made while
  several were running waits for the last of them, is judged once, and names all of them:

  ```text
  [vitest-auto-spy] Router.url was read 1 time on a strict double and nothing configured it, so the code under test got undefined.
  Configure it in the test: accessorSpies.getters.url.mockReturnValue(…), or mockReturnValue(undefined) when undefined is the answer meant.
  It happened while 2 concurrent tests were in flight ("Cart > loads", "Cart > saves"), and a read does not say which test made it; it is reported once, as the last of them finishes.
  ```

  Under `'throw'`, the last of those tests to finish is the one that fails.

- **Not part of `preset: 'strict'`.** It extends `strict` itself, and on an existing suite you should
  survey first (next section).

### Surveying first — `onUnstubbedRead`

`onUnstubbedRead` receives the same findings the report would print, instead of the report. It sees
every spy not built with `strict: false`, strict or not, so the numbers predict what the report will
fail once you turn it on.

```ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

const unread = new Map<string, number>();

setupAutoSpy({
  onUnstubbedRead: ({ className, member, kind, count }) => {
    const key = `${className}.${member} (${kind})`;

    unread.set(key, (unread.get(key) ?? 0) + count);
  },
});
```

- It is called after each test, once per member. The read itself still answers `undefined`.
- One spy can have its own handler: `createSpyFromClass(X, { onUnstubbedRead })`.
- The order is the same as for `onUnstubbedCall`: the spy's own handler, the spy's `strict: false`, the
  suite-wide handler, then `strict`.
- Both handlers need `setupAutoSpy` in the setup file, because it marks where each test starts and
  ends.

## Where it does not reach

The unconfigured-call check lives in the method spies that `createSpyFromClass` and `createAutoMock`
build. Spies built elsewhere are **never** strict, whatever you configure:

| Spy                                                     | Why                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **accessor spies** (`gettersToSpyOn`, …)                | a read cannot throw; it is reported after the test, [above](#reads-nobody-configured) |
| **observable property spies**                           | the same: a subscription nothing fed is reported after the test                       |
| **`mockDeep<T>()` nodes**                               | `mockDeep` takes no strict option at all                                              |
| **`console-spy`** and **`mockResourceProp`'s `reload`** | the library's own spies, not spies of your dependency                                 |
| **standalone `createFunctionSpy(name)`**                | the check is its optional second argument, and nothing passes it                      |

**`fillMissing` members are strict.** A member the class never declared is, by definition, one nobody
configured. So `createSpyFromClass(X, { strict: true, fillMissing: true })` throws for a filled-in member
just as it does for a declared one.

**The first two rows apply even on a strict spy.**
`createSpyFromClass(X, { strict: true, gettersToSpyOn: ['theme'], observablePropsToSpyOn: ['items$'] })`
throws for an unconfigured **method** but still answers `undefined` for `theme` and `items$`.
`setupAutoSpy({ unconfiguredReads })` reports those after the test.

## In depth

### Why not `onlyMethodsToSpyOn`

[`onlyMethodsToSpyOn`](/core/create-spy-from-class#configuration) answers a different question. It
_removes_ every method not on the list, so the failure reads `users.currentTenant is not a function`
and blames the spy rather than the test. Strict mode keeps the method and says that nobody configured
it.

### Why reads matter

A registered default makes unconfigured reads common. `registerAutoSpyDefaults(Router, {
gettersToSpyOn: ['url'], observablePropsToSpyOn: ['events'] })` puts both members on every `Router`
spy in the suite. In one consumer suite of about 1 760 spec files, 77 of the 119 files that spied on
`Router` never configured `url`, and 100 never fed `events`.

### Prior art

`vitest-mock-extended` has `fallbackMockImplementation`, `@golevelup` has `{ strict: true }`, and
testdouble is strict by default. Here strict mode is off by default. A suite written against spies
that return `undefined` would fail everywhere on the day it upgraded, and a method is often
unconfigured simply because nothing under test calls it.
