---
title: Control helpers
description: calledWith, mustBeCalledWith, resolveWith, nextWith and the rest - the helpers that tell a spied method what to answer, picked by its return type.
---

# Control helpers

Every method of a spy gets helpers that tell it what to answer. Which helpers it gets depends on the
method's return type: a `Promise` method gets `resolveWith`, an `Observable` method gets `nextWith`,
and every method gets `calledWith` to answer only for certain arguments.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

import 'vitest-auto-spy/rxjs';

// once per project, for the Observable helpers

const users = createSpyFromClass(UserService);

users.isAdmin.calledWith(7).mockReturnValue(true); // boolean isAdmin(id): true for 7, undefined for others
users.save.resolveWith(undefined); // Promise<void> save(user)
users.load.nextWith({ id: 7, name: 'Ann' }); // Observable<User> load(id)
```

| The method returns | Helpers                                                                                                      | Section                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| anything           | `calledWith`, `mustBeCalledWith`, `failWith`, plus the runner's own `mockReturnValue` etc.                   | [Synchronous methods](#synchronous-methods)                           |
| a value            | `returnValue`, `once()`, `times(n)` on a `calledWith` chain                                                  | [One call, or n](#one-call-or-n-—-once-times)                         |
| a `Promise`        | `resolveWith`, `rejectWith`, `resolveWithPerCall`                                                            | [Promise-returning methods](#promise-returning-methods-—-resolvewith) |
| an `Observable`    | `nextWith`, `nextOneTimeWith`, `nextWithValues`, `nextWithPerCall`, `throwWith`, `complete`, `returnSubject` | [Observable methods](#observable-methods-properties-—-nextwith)       |

To reset everything a test configured, see [`clearAutoSpy` / `resetAutoSpy`](#resetting-spies-—-clearautospy-resetautospy).

## Synchronous methods

The runner's own API works as usual. `calledWith(...args)` answers only for those arguments; any other
call gets `undefined`. `mustBeCalledWith(...args)` throws for any other arguments.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const users = createSpyFromClass(UserService);

// the runner's API: every call answers 'Ann'
users.getName.mockReturnValue('Ann');

// only for these arguments
users.getName.calledWith(1).mockReturnValue('Ann');
expect(users.getName(1)).toBe('Ann');
expect(users.getName(2)).toBeUndefined();

// throw for any other arguments
users.getName.mustBeCalledWith(1).mockReturnValue('Ann');
expect(() => users.getName(2)).toThrow();
```

Arguments match by value, not by reference. Object key order does not matter:
`calledWith({ id: 1, name: 'a' })` matches a call with `{ name: 'a', id: 1 }`. The same goes for the
order of items in a `Map` or a `Set`. Details: [What counts as the same argument](#what-counts-as-the-same-argument).

**Common mistake:** mixing `mockReturnValue` with a `calledWith` chain on one method. Whichever you
write last wins completely. Written after a chain, `mockReturnValue` answers every call. Written
before a chain, it makes the chain unused. The library reports this as a misconfiguration (a warning, or a
throw under [`setupAutoSpy({ misconfiguration: 'throw' })`](/utilities/setup) and the `strict`
preset). For "this value for these arguments, that value for everything else", put the fallback in
[`returns`](/core/create-spy-from-class#returns-—-the-value-where-the-spy-is-built) or use
`resolveWith` / `nextWith` / `failWith`. A `calledWith` chain wins over those:

```ts
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

provideAutoSpy(ProductsService, { returns: { find: FALLBACK } });
injectSpy(ProductsService).find.calledWith(7).mockReturnValue(SPECIFIC); // both work
```

Use `mockReturnValue` only when it is meant to be the whole answer. Not reported as a mix:

- a wrapper that delegates to the chain: `vi.when(spy)` (Vitest 5), or a `mockImplementation` built
  from `spy.getMockImplementation()`;
- the `Once` family (`mockReturnValueOnce` …). Its queue runs out and the chain answers again.

The report comes from the library's own spy engine. You get it on Vitest and Rstest, but not under
`setSpyEngine('runner')`, on Bun or on `node:test`: there the runner installs the implementation where
the library cannot see it.

### A chain kept in a variable

`calledWith` and `mustBeCalledWith` return a handle for **those** arguments. A handle stored in a
variable stays bound to its arguments, however many other chains you open later:

```ts
const one = users.getName.calledWith(1);
const two = users.getName.calledWith(2);

one.mockReturnValue('first');
two.mockReturnValue('second');

expect(users.getName(1)).toBe('first');
expect(users.getName(2)).toBe('second');
```

Use this when one argument list is configured in two places, such as a default in `beforeEach` and
the outcome in the test, or when a helper function opens the chain and returns it. Calling
`users.getName.calledWith(1)` again returns a handle to the same entry as `one`, so whichever of the
two you configure last wins.

### One call, or n — `once` / `times`

`once()` and `times(n)` limit an answer to the next matching calls. `returnValue(x)` on a chain is the
same as `mockReturnValue(x)`. When they are used up, the call
falls back to the previous answer for those arguments, then to the spy's default:

```ts
users.load.calledWith(1).mockReturnValue(cached);
users.load.calledWith(1).once().mockReturnValue(fresh);

users.load(1); // fresh
users.load(1); // cached
```

| Rule                           | Behaviour                                                   |
| ------------------------------ | ----------------------------------------------------------- |
| Several limited answers        | stack up; the last configured is used first                 |
| Helpers on the limited handle  | only `mockReturnValue`, `returnValue` and `failWith`        |
| Same arguments without a limit | replace the whole stack                                     |
| Under `mustBeCalledWith`       | a call past the count throws like any other mismatch        |
| `times(n)`                     | `n` must be a positive whole number, otherwise `RangeError` |

### Making a call throw — `failWith`

`failWith(error)` makes the method throw. It works on a spy of **any** return type and on a
`calledWith` / `mustBeCalledWith` chain.

```ts
import { HttpErrorResponse } from '@angular/common/http';

// every call throws
cart.checkout.failWith(new HttpErrorResponse({ status: 500 }));
expect(() => cart.checkout(1)).toThrow();

// only these arguments throw; the rest answer normally
cart.checkout.calledWith(BAD_ID).failWith(new Error('unknown cart'));
cart.checkout.calledWith(GOOD_ID).mockReturnValue(receipt);
```

The last configured answer wins: `failWith` replaces an earlier `resolveWith`, `nextWith` or per-call
list, and a later one replaces `failWith`. `resetAutoSpy` removes it like any other configuration.

To make a `Promise` reject, use `rejectWith`. To make an `Observable` error, use `throwWith`.

### What a `mustBeCalledWith` failure prints

The first line says which argument broke the match. Below it you see the expected call and the
actual call side by side:

```
[vitest-auto-spy] getName is set up with mustBeCalledWith, and this call matches none of its configs — argument 1: expected 1, got 2.
Wanted: getName(1)
Actual: getName(2)
Fix the value the code under test passes, or configure this call too.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/control-helpers#what-a-mustbecalledwith-failure-prints
```

With more than one configured call, every one is listed, matchers included, so you can see a
configuration that never matched. The first line then leaves out the "expected 1, got 2" part,
because there is no single configuration to compare against:

```
Wanted (3 configured):
  getName(1)
  getName(2,'fast')
  getName(Any<Number>,StringContaining)
Actual: getName(9,'zzz')
```

A matcher inside an object prints where it is, `save({id:Any<Number>,name:'a'})`, so the line looks
like the configuration you wrote.

### Asymmetric matchers in `calledWith`

`calledWith` and `mustBeCalledWith` accept the same asymmetric matchers as `expect`: `expect.any`,
`expect.objectContaining`, `expect.stringMatching` and so on. They work **at any depth**: inside an
object, inside an array, and as a key or a value of a `Map` or a `Set`.

```ts
users.getName.calledWith(expect.any(Number)).mockReturnValue('Ann');
expect(users.getName(1)).toBe('Ann');
expect(users.getName(2)).toBe('Ann');

users.save.calledWith(expect.objectContaining({ id: 1 })).mockReturnValue(true);
expect(users.save({ id: 1, name: 'x' })).toBe(true);

// a matcher one level down
users.save.calledWith({ id: expect.any(Number), name: 'x' }).mockReturnValue(true);
users.saveAll.calledWith([expect.any(String)]).mockReturnValue(true);
users.index.calledWith(new Map([['id', expect.any(Number)]])).mockReturnValue(true);
```

- An exact argument list is checked before any matcher.
- Matcher configurations are tried in the order you registered them, so put a narrow one before a
  wide one.
- Registering the **same** arguments again replaces the earlier answer, as it does for exact
  arguments:

```ts
users.getName.calledWith(expect.anything()).mockReturnValue('first');
users.getName.calledWith(expect.anything()).mockReturnValue('second');
expect(users.getName(1)).toBe('second');
```

Two matchers count as the same when they accept the same values: the same matcher with the same
argument, and both negated or both not (`expect.not.…`). This holds for nested matchers too, so a second `calledWith({ id: expect.any(Number) })`
replaces the first. The exception is a hand-written `{ asymmetricMatch }` object: its logic is hidden
in a function, so two such objects are always two configurations. Only the same instance, registered
again, replaces its answer.

### What counts as the same argument

Anything a matcher does not decide is compared the way the runner's own `equals` compares it:

| Argument      | Compared by                                                                     |
| ------------- | ------------------------------------------------------------------------------- |
| `Map`, `Set`  | their contents, in any order                                                    |
| `Date`        | its time                                                                        |
| `RegExp`      | its source and flags                                                            |
| `Error`       | its name and message, plus the own enumerable fields a subclass adds            |
| a function    | identity: the same function object, never just the same name                    |
| anything else | its own enumerable entries, symbol keys included; the prototype is not compared |

**Common mistake:** configuring an argument whose state is hidden, such as a `URL`, an `ArrayBuffer`
or a component. It has no entries to compare, so two instances of one class look equal. Use a matcher
(`expect.any(URL)`) or the field the code under test really changes.

## Promise-returning methods — `resolveWith`

`resolveWith(value)` makes the method return a resolved `Promise`; `rejectWith(error)` returns a
rejected one. `resolveWithPerCall` gives each call its own value.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const products = createSpyFromClass(ProductsService);

products.getProducts.resolveWith([{ name: 'Product 1' }]);
await expect(products.getProducts()).resolves.toEqual([{ name: 'Product 1' }]);

products.getProducts.rejectWith('FAKE ERROR');

// one value per call, and a value only for certain arguments
products.getProducts.resolveWithPerCall([{ value: ['a'] }, { value: ['b'] }]);
products.getProducts.calledWith(1).resolveWith(['one']);
```

| Helper                     | Argument              | Result                       |
| -------------------------- | --------------------- | ---------------------------- |
| `resolveWith(value?)`      | the resolved value    | every call resolves with it  |
| `rejectWith(error?)`       | the rejection reason  | every call rejects with it   |
| `resolveWithPerCall(list)` | `{ value, delay? }[]` | call n resolves with entry n |

**Common mistake:** `mockResolvedValue` after a `calledWith` chain. It replaces the chain, like
`mockReturnValue` (see [Synchronous methods](#synchronous-methods)). Use `resolveWith` for the default.

### Inspecting promise outcomes — `mock.settledResults` {#settled-results}

Every spied method has `mock.settledResults`: one entry per call, in call order, saying how that
call's promise settled. Vitest tracks this itself. On Bun (`bun:test`) and `node:test` the library
adds it, so it works the same on all three.

```ts
products.getProducts.resolveWith([{ name: 'Product 1' }]);
await products.getProducts();
expect(products.getProducts.mock.settledResults).toEqual([{ type: 'fulfilled', value: [{ name: 'Product 1' }] }]);

products.getProducts.rejectWith('FAKE ERROR');
await products.getProducts().catch(() => undefined);
expect(products.getProducts.mock.settledResults).toContainEqual({ type: 'rejected', value: 'FAKE ERROR' });
```

Each entry is `{ type: 'fulfilled' | 'incomplete' | 'rejected', value }`. While a promise is still
pending, its entry is `incomplete`.

## Observable methods & properties — `nextWith`

These helpers need the RxJS layer. Import it once, for example in the setup file:
`import 'vitest-auto-spy/rxjs';`. See [Runtimes → RxJS](/runtimes/rxjs).

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

import 'vitest-auto-spy/rxjs';

const products = createSpyFromClass(ProductsService);

products.getProducts$.nextWith([{ name: 'Product 1' }]); // emit; the stream stays open
products.getProducts$.nextOneTimeWith([{ name: 'X' }]); // emit once, then complete
products.getProducts$.throwWith('FAKE ERROR'); // error the stream
products.getProducts$.complete(); // complete the stream
```

A property listed in `observablePropsToSpyOn` also counts its open subscriptions:
`x$.subscriberCount()`. A subscription stops counting when it unsubscribes, or when the stream
completes or errors. So `0` after `fixture.destroy()` means the component unsubscribed:

```ts
fixture.destroy();
expect(store.items$.subscriberCount()).toBe(0);
```

### A precise sequence — `nextWithValues`

`nextWithValues(configs)` emits the entries **in order** and stops at the first `{ complete: true }`.
Values you push into the underlying subject in the meantime are merged in until that completion.

```ts
products.getProducts$.nextWithValues([
  { value: [{ name: 'Product 1' }] },
  { value: [{ name: 'Product 2' }], delay: 100 },
  { complete: true },
]);
```

#### `ValueConfig`

| Shape                    | Effect                                                |
| ------------------------ | ----------------------------------------------------- |
| `{ value, delay? }`      | emit `value` (after `delay` ms, if given)             |
| `{ errorValue, delay? }` | error the stream with `errorValue` (after `delay` ms) |
| `{ complete?, delay? }`  | complete the stream; `complete: false` emits nothing  |

The **key** decides what an entry does, not whether its value is truthy. `{ value: false }`,
`{ value: 0 }`, `{ value: '' }` and `{ value: null }` all emit, and so does a falsy `errorValue`.

**Common mistake:** a `delay` under fake timers. `delay` uses RxJS's `delay()` / `timer()`, so the
value does not arrive until you advance the clock. [`advanceTimers(ms)`](/utilities/fake-timers)
advances it **and** runs the microtasks the emission queues.

### A fresh stream per call — `nextWithPerCall`

`nextWithPerCall(configs)` gives the **n-th call** the n-th entry. It returns one `ReplaySubject` per
entry, so the test can push more values into a specific call's stream later.

```ts
import { firstValueFrom } from 'rxjs';

const [first$, second$] = products.watch$.nextWithPerCall([{ value: 'a' }, { value: 'b', doNotComplete: true }]);

expect(await firstValueFrom(products.watch$())).toBe('a');

// the second call's stream stays open, so the test can push more
second$.next('b2');
```

Each per-call stream **completes after its first value**, unless the entry sets `doNotComplete: true`.
`ValueConfigPerCall` is `{ value, delay?, doNotComplete? }`.

### Manual control — `returnSubject`

`returnSubject()` returns the `ReplaySubject` behind the spy, for cases the other helpers do not
cover:

```ts
const subject = products.getProducts$.returnSubject();

subject.next([{ name: 'Product 1' }]);
subject.error(new Error('boom'));
```

It is a `ReplaySubject`, so a subscriber that arrives late still sees the values already pushed.

Full reference, including the standalone `createObservableWithValues` builder:
[Runtimes → RxJS](/runtimes/rxjs).

## Resetting spies — `clearAutoSpy` / `resetAutoSpy`

Reset every method of a spy in one call, instead of calling `mockClear` / `mockReset` on each method.
Both work on spies from `createSpyFromClass` and `createAutoMock`, and cover method spies **and**
accessor spies (spied getters and setters).

```ts
import { clearAutoSpy, resetAutoSpy } from 'vitest-auto-spy';

clearAutoSpy(users); // forget recorded calls; configured answers stay

resetAutoSpy(users); // forget calls AND configured answers
```

Call it in `afterEach` when the spy lives across tests, or create the spy in `beforeEach` and skip the
reset. A spy declared with `using` resets itself ([`using`](./create-spy-from-class#using)).

After `resetAutoSpy` every method returns `undefined` again until you configure it. The reset removes:

- the library's configuration: `calledWith`, `resolveWith`, `nextWith` and the rest;
- a value set with the runner's API, such as `users.getName.mockReturnValue('x')`;
- a queued `mockReturnValueOnce` value;
- what an accessor spy was told to return (`accessorSpies.getters.theme.mockReturnValue('dark')`).

This is what `vi.resetAllMocks()` does, for one spy.

**Common mistake:** queueing a `mockReturnValueOnce` value before `resetAutoSpy` and expecting it
after. The reset drops it; queue it after the reset.

## Cause and effect: why `calledWith` and not `mockReturnValue`

A stub says "given this input, the dependency answers that". `mockReturnValue` keeps the answer and
drops the input: the answer comes back whatever the code sent. That is how a test passes when it
should not:

```ts
function priceIn(rates: Rates, amount: number, currency: string): number {
  return amount * rates.rateFor('EUR'); // the bug: `currency` is ignored
}

rates.rateFor.mockReturnValue(2);
expect(priceIn(rates, 10, 'USD')).toBe(20); // green
```

The usual fix is a `toHaveBeenCalledWith('USD')` at the end of the test. It works, but the answer is
configured at the top and its condition is checked at the bottom. If that last assertion is missing,
or checks the wrong spy, the test stays green.

`calledWith` keeps both on one line. The answer exists only for its input, so the wrong input gets no
answer, and the test fails:

```ts
rates.rateFor.calledWith('USD').mockReturnValue(2);
expect(priceIn(rates, 10, 'USD')).toBe(20); // fails: rateFor('EUR') answered undefined, the price is NaN
```

The first time a `calledWith` misses a call with the same number of arguments as one of its
configurations, on a spy with no default, the library prints a hint that names the call and the
configurations:

```text
[vitest-auto-spy] rateFor('EUR') matched none of its calledWith() configs (['USD']) and answered undefined. …
```

It prints once per test file, never throws, and stays quiet once the spy has a default.

`calledWith` is also the **looser** coupling. An assertion on the call fixes how the code talks to its
dependency: how many times, in which order, with which exact arguments. An answer filtered by
arguments only says that the result depends on the input. The code may call once or three times,
cache or reorder, and the test still passes as long as the right input gives the right output.
Refactors that keep the behaviour keep the test green.

When a call with any other arguments is itself the bug, use `mustBeCalledWith`. The failure then
names the mismatch at the call, instead of a `NaN` somewhere later:

```text
[vitest-auto-spy] rateFor is set up with mustBeCalledWith, and this call matches none of its configs — argument 1: expected 'USD', got 'EUR'.
Wanted: rateFor('USD')
Actual: rateFor('EUR')
```

`mockReturnValue` is still right when there is no input to tie the answer to: a method without
arguments, or one whose arguments the test does not care about. `toHaveBeenCalledWith` is still right
when the call itself is the behaviour: a command sent, an event logged, a request fired with nothing
read back.

## In depth

### Why `failWith` and not `throwWith`

`throwWith` already means "error the stream" on an `Observable` spy. At runtime every spy has every
helper; only the return type in `Spy<T>` decides which ones TypeScript shows. A shared name would let
whichever helper set was attached last win silently, on every spy in the run.

### Compared with the runners

Vitest 4.1 added `mockThrow` / `mockThrowOnce`, which cover the "every call throws" case. Bun and
`node:test` have neither, so `failWith` lets the same test run on all three. No runner has an
equivalent of "throw only for these arguments": `mockImplementation` replaces the whole method, which
is the opposite of configuring one argument list.
