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
`Called as: Cart.total()`.

**Two doubles have no class name to print**, and their message is one word shorter — `Nothing
configured read, and strict mode is on. / Called as: read('k')`:

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
| `mockReturnValue` / `mockImplementation` — the host runner's own       | never — see below |
| the `returns:` option, and `overrides` on `createAutoMock`             | never — see below |
| nothing                                                                | **yes**           |

The non-obvious half is the third and fourth rows. `mockReturnValue`, `mockImplementation` and
`returns:` do not _register_ configuration — they **replace the library's dispatch** on the host
mock. A spy configured that way never runs the code the guard lives in, so it is not that strict
mode makes an exception for them; there is nothing to make an exception in.

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

### Precedence

Most specific first, and the resolution stops at the first one that is set:

1. the double's own `onUnstubbedCall`
2. the global `onUnstubbedCall` from `setupAutoSpy`
3. the double's own `strict` — including an explicit **`strict: false`**, which is the only way to
   exempt one collaborator from a suite-wide default
4. the global `strict`

```ts
setupAutoSpy({ strict: true });

createSpyFromClass(Cart).total(); // throws
createSpyFromClass(Cart, { strict: false }).total(); // undefined — opted out
```

A handler beats a `strict` at every level, so `{ strict: true, onUnstubbedCall: record }` on one
double records and does not throw.

## Where it does not reach

The guard is carried by the function spies the two class/type factories build, and handed to them at
construction. Everything below builds its spies elsewhere and is **never** strict, whatever is
configured:

| Double                                                  | Why                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| **accessor spies** (`gettersToSpyOn`, …)                | built as host mocks on a descriptor, not through the spy factory    |
| **observable property spies**                           | built by the rxjs layer's `createPropSpy`                           |
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
`items$`.

## Prior art

`vitest-mock-extended` has `fallbackMockImplementation`, `@golevelup` has `{ strict: true }`, and
testdouble is strict by default. This is off by default: a suite already written against
`undefined`-returning doubles would fail wholesale the day it upgraded, and the reason a method is
unconfigured is often that nothing under test calls it.
