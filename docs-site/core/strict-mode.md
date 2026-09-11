---
title: Strict mode
description: strict and onUnstubbedCall — fail on a method nobody configured, naming the class, the method and the arguments instead of returning undefined.
---

# Strict mode

A double answers every method it has. A method nobody configured answers `undefined` — which is a
legal value, so nothing fails there. It fails wherever `undefined` is finally used, which on a wide
collaborator is several frames away and in a different file:

```ts
const users = createSpyFromClass(UserService); // 40 methods

users.load.resolveWith([]); // one configured
// … the component under test also calls users.currentTenant()
// TypeError: Cannot read properties of undefined (reading 'id')   ← in production code
```

The only tool for this before was
[`onlyMethodsToSpyOn`](/core/create-spy-from-class#configuration), and it answers a different
question: it _removes_ every method not on the list, so the failure reads
`users.currentTenant is not a function` and blames the spy rather than the spec. Strict mode leaves
the method in place and makes the omission say so:

```ts
const users = createSpyFromClass(UserService, { strict: true });

users.load.resolveWith([]);
users.currentTenant(); // throws, on the line that called it
```

## The message

Verbatim, from a `Cart` whose `checkout(id, when)` nothing configured:

```
[vitest-auto-spy] Nothing configured Cart.checkout, and strict mode is on.
Called as: Cart.checkout(1,'now')
Configure it — .mockReturnValue(…), .mockImplementation(…), .resolveWith(…), .nextWith(…) or .calledWith(…), or seed it through the 'returns' option — or drop 'strict' from this double.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/strict-mode
```

It prints the call, not just the name, because on a wide service the same method is called several
times with different arguments and _which_ call is half the diagnosis. A no-argument call renders as
`Called as: Cart.total()`. Plain data prints in full up to 200 characters per argument; a class
instance or a DOM node prints as its class — `[HTMLDivElement]`, `[Session]` — because rendering
one in full walks everything it can reach, and a run with hundreds of strict failures could take a
worker's heap through the message strings alone.

**Two doubles have no class name to print**, and their message is one word shorter — `Nothing
configured read, and strict mode is on. / Called as: read('k')` — unless they are given one:
`createAutoMock<T>(undefined, { strict: true, name: 'USERS' })`, and `provideAutoSpyForToken` passes
the token's description on its own (`Nothing configured InjectionToken CAROUSEL_RESIZE_OBSERVER.observe`):

- [`createAutoMock<T>()`](./auto-mock-by-type), which is built from a type and never read a class;
- the **fully abstract class** fallback in `createSpyFromClass`, which hands back that same proxy
  when the prototype named nothing. Strict mode travels into the fallback rather than being dropped
  there — a DI token whose members are all `abstract` is exactly the wide-collaborator shape this
  exists for.

## What counts as configured

Anything that configures the method **at all**. The guard is a question about the _method_, asked
once per call before any argument matching happens:

| Configured by                                                          | Reaches the guard |
| ---------------------------------------------------------------------- | ----------------- |
| `calledWith(…)` / `mustBeCalledWith(…)` — **any** chain, any arguments | no                |
| `resolveWith` / `rejectWith` / `resolveWithPerCall`                    | no                |
| `nextWith` / `throwWith` / `complete` / `returnSubject`                | no                |
| the `returns:` option — a default in the spy's own container           | no                |
| `mockReturnValue` / `mockImplementation` — the host runner's own       | never — see below |
| `overrides` on `createAutoMock` — a seed, no longer a spy              | never — see below |
| nothing                                                                | **yes**           |

The non-obvious half is the fifth and sixth rows. `mockReturnValue` and `mockImplementation` do
not _register_ configuration — they **replace the library's dispatch** on the host mock. A spy
configured that way never runs the code the guard lives in, so it is not that strict mode makes an
exception for them; there is nothing to make an exception in. It also means a `calledWith` added
after them is never consulted.

That has one visible edge. `mockReturnValueOnce` installs a one-shot implementation that is
_shifted off a queue_, and Vitest falls back to the standing implementation — the library dispatch —
once the queue is empty. So the call after the last `Once` reaches the guard and is reported as
unstubbed:

```ts
const cart = createSpyFromClass(Cart, { strict: true });

cart.total.mockReturnValueOnce(5);
cart.total(); // 5
cart.total(); // throws: Nothing configured Cart.total
```

Seed the standing value too (`cart.total.mockReturnValue(0)`) when a `Once` sequence is meant to run
out.

`returns:` is different since it stopped doing the same: the value is the spy's default, so a
`calledWith` configured later wins for its arguments, a later `resolveWith` or `failWith` replaces
it, and `returns: { save: undefined }` is how a `void` call is declared expected.

A reset puts the method back to unconfigured, so the guard fires again after `resetAutoSpy(users)`
or at the end of a [`using` block](./create-spy-from-class#using) —
which is the correct answer, not a wrinkle: the configuration really is gone.

## What it deliberately does not do

**A `calledWith` chain configured for other arguments does not trip it.**

```ts
const cart = createSpyFromClass(Cart, { strict: true });

cart.checkout.calledWith(1, 'now').mockReturnValue('one');

cart.checkout(9, 'later'); // undefined — no throw
```

`calledWith(1, 'now')` is a statement that this method is stubbed. Argument-level strictness already
has a name — [`mustBeCalledWith`](./control-helpers#what-a-mustbecalledwith-failure-prints), which
throws printing wanted next to actual. Making `strict` throw on an argument miss would silently
reclassify every existing `calledWith` in a suite into `mustBeCalledWith`, and print a worse message
than the tool that already does that job. Strict mode answers _"nobody configured this method"_,
never _"nobody configured this call"_.

**Angular's lifecycle hooks never trip it.** `ngOnDestroy`, `ngOnInit`, `ngOnChanges`, `ngDoCheck` and
the four `ngAfter…` hooks answer `undefined` on a strict double, configured or not. Angular calls
`ngOnDestroy` itself on every provided value that has one when the testing module is torn down — a
`createAutoMock` proxy has every member, so a token double always does — and no spec asked for that
call. Throwing there broke the teardown, which skipped every `afterEach` after it and failed the tests
that followed; under a suite-wide `strict: true` that was hundreds of failures from one source. The
calls are still recorded: `expect(double.ngOnDestroy).toHaveBeenCalled()` works.

## `onUnstubbedCall` — the general form

`strict: true` is sugar for a handler that throws. The handler itself is the option, and whatever it
returns becomes the call's return value:

```ts
type UnstubbedCallHandler = (call: { className: string | undefined; method: string; args: unknown[] }) => unknown;
```

Two uses earn it. **Record, don't fail** — for finding out how big the gap is before turning the
throw on across a suite:

```ts
const unstubbed: string[] = [];

const users = createSpyFromClass(UserService, {
  onUnstubbedCall: ({ className, method }) => void unstubbed.push(`${className}.${method}`),
});
```

And a **blanket fallback value**, which is `vitest-mock-extended`'s `fallbackMockImplementation`
under another name:

```ts
createAutoMock<Api>(undefined, { onUnstubbedCall: () => null }); // never undefined, never a throw
```

`className` is `undefined` on a type-driven double for the same reason the message is shorter there:
no class was read, so there is nothing truthful to put in it.

## Turning it on for a whole suite

```ts
// vitest.setup.ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ strict: true });
```

Every double built afterwards is strict, so adopting it is one line rather than an edit per factory
call. The default is armed only when the option is actually passed, and released in `afterAll` of the
file that armed it — under `isolate: false` the module holding it is shared by every file in the
worker, and a default left armed would fail a spec that never opted in. See
[Test-run hygiene → strict doubles](/utilities/setup#_10-strict-doubles-for-the-whole-suite).

### A throw that never reached the test

A strict throw is only as loud as the code between it and the test. A `try`/`catch` in the code
under test turns it into that code's error branch; an RxJS operator with no error handler rethrows
it through a `setTimeout` that a fake clock never runs. Either way the test goes on without the
answer it depended on, and may well pass.

So `setupAutoSpy({ strict: true })` also records every strict throw and, after each test, fails the
test with the ones the runner was never told about (`swallowedStrictCalls`: `'throw'` by default
with `strict: true` and the strict preset, `'warn'`, `'off'`). A test that provokes one on purpose
takes it, which doubles as the assertion:

```ts
expect(() => cart.total()).toThrow('Nothing configured Cart.total');
expect(takeStrictViolations()).toHaveLength(1); // from 'vitest-auto-spy/setup'
```

### Precedence

Most specific first, and the resolution stops at the first one that is set:

1. the double's own `onUnstubbedCall`
2. the double's explicit **`strict: false`** — the only way to exempt one collaborator from a
   suite-wide default, whether that default is `strict: true` or a handler
3. the global `onUnstubbedCall` from `setupAutoSpy`
4. the double's own `strict: true`
5. the global `strict`

```ts
setupAutoSpy({ strict: true });

createSpyFromClass(Cart).total(); // throws
createSpyFromClass(Cart, { strict: false }).total(); // undefined — opted out
```

A handler beats `strict: true` at every level, so `{ strict: true, onUnstubbedCall: record }` on one
double records and does not throw; `strict: false` beats every handler but the double's own.

## Reads nobody configured

The guard above fires on a **call**. A strict double's spied getter nobody configured still answers
`undefined`, and its observable property nobody fed is a stream that never emits — the same class of
failure strict mode exists for, since the code under test goes down its "no data" branch and the test
stays green. A registration makes it common: `registerAutoSpyDefaults(Router, { gettersToSpyOn: ['url'],
observablePropsToSpyOn: ['events'] })` puts both members on every `Router` double in the suite, and on
a consumer suite of ~1 760 spec files 77 of the 119 files doubling `Router` never configured `url` and
100 never fed `events`.

A read cannot throw where it happens: when a double lands in a failure diff the formatter reads it, and
a throw there would break the message it belongs to. So reads are counted while the test runs and
reported after it:

```ts
setupAutoSpy({ strict: true, unconfiguredReads: 'throw' }); // 'off' (default) | 'warn' | 'throw'
```

```
[vitest-auto-spy] Router.url was read 3 times and nothing configured it, and strict mode is on.
[vitest-auto-spy] Router.events was subscribed to 1 time and nothing fed it, and strict mode is on.
```

- **What counts.** A read of a getter from `gettersToSpyOn` / `settersToSpyOn` / `autoSpyAccessors`
  that reached the scaffold nothing replaced, and a subscription to an `observablePropsToSpyOn` stream
  that nothing had fed **by the end of the test** — subscribing in `beforeEach` and calling `nextWith`
  in the test is the ordinary way to drive a stream and is not a finding. A getter read is judged
  when it happens: configuring the getter after the code under test read it does not take the read
  back.
- **When.** From `setupAutoSpy`'s `beforeEach`, which runs before any hook of the spec file, to its
  `afterEach`, which runs after them. The spec's own `beforeEach` is inside on purpose — that is where
  most suites run the code under test — and collection, `beforeAll` and `afterAll` are outside.
- **Configured by** `accessorSpies.getters.x.mockReturnValue(…)` / `mockImplementation(…)` (a
  `mockReturnValueOnce` counts until its queue runs out, as for a method), `overrides: { x: … }` — on
  the call site or in a `registerAutoSpyDefaults` row — and `mockReadonlyProp(double, 'x', …)`; a
  stream by `nextWith`, `nextOneTimeWith`, `nextWithValues` with at least one entry, `throwWith`,
  `complete`, `returnSubject`, or a real stream seeded through `overrides`. A registered _list_ alone
  configures nothing. `undefined` meant as the answer is said out loud, like `returns: { save:
  undefined }` for a method: `accessorSpies.getters.x.mockReturnValue(undefined)`.
- **Which doubles.** Strict ones — `strict: true` on the double or suite-wide — built by
  `createSpyFromClass`, `provideAutoSpy`, `createSpyFromInstance`, and `createAutoMock` /
  `provideAutoSpyForToken` for their observable properties. `strict: false` on a double exempts it.
  `mockDeep` nodes are not covered, for the reason [below](#where-it-does-not-reach).
- **Not in `preset: 'strict'`.** It extends `strict` — a decision about how a suite writes its
  doubles — rather than grading a report of something already broken, and turning it on across an
  existing suite is a survey first.

### Surveying first — `onUnstubbedRead`

```ts
const unread = new Map<string, number>();

setupAutoSpy({
  onUnstubbedRead: ({ className, member, kind, count }) => {
    const key = `${className}.${member} (${kind})`;

    unread.set(key, (unread.get(key) ?? 0) + count);
  },
});
```

The handler receives exactly what the report would print, from **every** double not built with
`strict: false`, strict or not — so the numbers predict what turning the report on will fail. It is
called after each test, once per member, and takes those findings instead of the report. A double
can carry its own: `createSpyFromClass(X, { onUnstubbedRead })`. Precedence mirrors
`onUnstubbedCall`: the double's own handler, the double's `strict: false`, the suite-wide handler,
then `strict`. Both handlers need `setupAutoSpy` in the setup file — a test is what it marks out —
and the read itself still answers `undefined`.

## Where it does not reach

The guard is carried by the function spies the two class/type factories build, and handed to them at
construction. Everything below builds its spies elsewhere and is **never** strict, whatever is
configured:

| Double                                                  | Why                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| **accessor spies** (`gettersToSpyOn`, …)                | a read cannot throw — reported after the test instead, [above](#reads-nobody-configured) |
| **observable property spies**                           | the same — a subscription nothing fed is reported after the test    |
| **`mockDeep<T>()` nodes**                               | `mockDeep` takes no strict configuration at all                     |
| **`console-spy`** and **`mockResourceProp`'s `reload`** | internal spies, not doubles of your collaborator                    |
| **standalone `createFunctionSpy(name)`**                | the guard is its optional second argument, and no caller passes one |

`fillMissing` members are the exception that had to be closed rather than documented: a member the
prototype never named is by definition one nobody configured, so leaving it lenient would have
excused exactly the case strict mode exists for. The guard is threaded through, and
`createSpyFromClass(X, { strict: true, fillMissing: true })` throws for a filled-in member the same
way it throws for a declared one.

The first two are worth stating twice, because they sit on a double that _is_ strict:
`createSpyFromClass(X, { strict: true, gettersToSpyOn: ['theme'], observablePropsToSpyOn: ['items$'] })`
throws for an unconfigured **method** and still answers `undefined` for an unconfigured `theme` or
`items$` — which `setupAutoSpy({ unconfiguredReads })` reports once the test is over.

## Prior art

`vitest-mock-extended` has `fallbackMockImplementation`, `@golevelup` has `{ strict: true }`, and
testdouble is strict by default. This is off by default: a suite already written against
`undefined`-returning doubles would fail wholesale the day it upgraded, and the reason a method is
unconfigured is often that nothing under test calls it.
