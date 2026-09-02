---
title: Control helpers
description: calledWith, mustBeCalledWith, resolveWith, nextWith and the rest — the helpers each spied method earns from its return type.
---

# Control helpers

Each spied method gets helpers chosen by its return type. `calledWith` / `mustBeCalledWith`
dispatch by argument, and the type-specific helpers configure the result.

::: tip Key order does not matter
Arguments are matched by a serialized key, and object keys are sorted before it is built — so
`calledWith({ id: 1, name: 'a' })` matches a call made with `{ name: 'a', id: 1 }`. The two are
the same argument, and the order a literal happened to be written in is not something a test
should depend on.
:::

## Synchronous methods

```ts
// standard vi.fn() API works as-is
myService.getName.mockReturnValue('Fake Name');

// return a value only for specific arguments
myService.getName.calledWith(1).mockReturnValue('Fake Name');
expect(myService.getName(1)).toBe('Fake Name');
expect(myService.getName(2)).toBeUndefined();

// throw if called with the "wrong" arguments
myService.getName.mustBeCalledWith(1).mockReturnValue('Fake Name');
expect(() => myService.getName(2)).toThrow();
```

### What a `mustBeCalledWith` failure prints

Both sides, the way `td.explain` and sinon do — because the diagnosis is the comparison, not either
half of it:

```
The function 'getName' was configured with 'mustBeCalledWith' and expects to be called with specific arguments.
Wanted: getName(1)
Actual: getName(2)
Docs: https://asdalexey.github.io/vitest-auto-spy/core/control-helpers
```

Every configured call is listed when there is more than one, matchers included, so a config that
never matched is visible rather than inferred:

```
Wanted (3 configured):
  getName(1)
  getName(2,'fast')
  getName(Any<Number>,StringContaining)
Actual: getName(9,'zzz')
```

### Asymmetric matchers in `calledWith`

`calledWith` / `mustBeCalledWith` accept the same asymmetric matchers as `expect`
(`expect.any`, `expect.objectContaining`, `expect.stringMatching`, …). A config that
contains at least one matcher is stored as a predicate and matched against the actual
arguments at call time, instead of by exact serialization.

```ts
myService.getName.calledWith(expect.any(Number)).mockReturnValue('Fake Name');
expect(myService.getName(1)).toBe('Fake Name');
expect(myService.getName(2)).toBe('Fake Name');

myService.save.calledWith(expect.objectContaining({ id: 1 })).mockReturnValue(true);
expect(myService.save({ id: 1, name: 'x' })).toBe(true);
```

An exact argument list is matched before any of them, and the matcher configs are tried in the
order they were registered — a narrow config written before a wide one keeps its calls.

Registering the **same** argument list again replaces the answer it gave before, exactly as it does
for exact arguments:

```ts
myService.getName.calledWith(expect.anything()).mockReturnValue('first');
myService.getName.calledWith(expect.anything()).mockReturnValue('second');
expect(myService.getName(1)).toBe('second');
```

Each `expect.anything()` call builds a new object, so "the same argument" cannot mean the same
instance: two matchers are the same when they accept the same values — same matcher class, same
sample, same inversion. A hand-rolled `{ asymmetricMatch }` object is the exception. Its verdict
lives in a closure that no comparison can read, so two of them are always two configs, and only
that very instance, registered again, overrides.

## Promise-returning methods — `resolveWith`

```ts
myService.getProducts.resolveWith([{ name: 'Product 1' }]);
await expect(myService.getProducts()).resolves.toEqual([{ name: 'Product 1' }]);

myService.getProducts.rejectWith('FAKE ERROR');

// per-call values, and conditional-by-args
myService.getProducts.resolveWithPerCall([{ value: ['a'] }, { value: ['b'] }]);
myService.getProducts.calledWith(1).resolveWith(['one']);
```

### Inspecting promise outcomes — `mock.settledResults` {#settled-results}

Every spied method exposes `mock.settledResults`: one index-aligned entry per call,
recording how that call's returned promise eventually settled. Vitest tracks this
natively; on Bun (`bun:test`) and `node:test` it is provided by a built-in polyfill,
so the surface is identical across all three runtimes.

```ts
myService.getProducts.resolveWith([{ name: 'Product 1' }]);
await myService.getProducts();
expect(myService.getProducts.mock.settledResults).toEqual([{ type: 'fulfilled', value: [{ name: 'Product 1' }] }]);

myService.getProducts.rejectWith('FAKE ERROR');
await myService.getProducts().catch(() => undefined);
expect(myService.getProducts.mock.settledResults).toContainEqual({ type: 'rejected', value: 'FAKE ERROR' });
```

Each entry is `{ type: 'fulfilled' | 'incomplete' | 'rejected', value }`. A call whose
promise is still pending is recorded as `incomplete` until it settles.

## Resetting spies — `clearAutoSpy` / `resetAutoSpy`

Reset every spy inside an assembled spy with one call, instead of reaching for
`mockClear` / `mockReset` on each method by hand. Both work on `createSpyFromClass`
spies and `createAutoMock` proxies, and cover method spies **and** accessor spies.

```ts
import { clearAutoSpy, resetAutoSpy } from 'vitest-auto-spy';

// clears recorded calls only — configured returns are kept
clearAutoSpy(myService);

// clears calls AND reverts configuration to pristine
resetAutoSpy(myService);
```

`resetAutoSpy` reverts both the library config (`calledWith` / `resolveWith` / `nextWith` / …) **and**
a bare return value set directly on a spy (`myService.getName.mockReturnValue('x')`) — after a reset
the method returns `undefined` again until reconfigured.

## Observable methods & properties — `nextWith`

Enabled by importing the rxjs layer once (`import 'vitest-auto-spy/rxjs';`). See
[Runtimes → RxJS](/runtimes/rxjs).

```ts
myService.getProducts$.nextWith([{ name: 'Product 1' }]); // emit, stream stays open
myService.getProducts$.nextOneTimeWith([{ name: 'X' }]); // emit once, then complete
myService.getProducts$.throwWith('FAKE ERROR'); // error the stream
myService.getProducts$.complete(); // complete the stream
```

### A precise sequence — `nextWithValues`

`nextWithValues(configs)` emits the entries **in order**, and stops at the first `{ complete: true }`.
Anything pushed onto the backing subject afterwards is merged in until that completion arrives.

```ts
myService.getProducts$.nextWithValues([
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
| `{ complete?, delay? }`  | complete the stream — `complete: false` emits nothing |

An entry is chosen by the **key it carries**, not by whether its value is truthy: `{ value: false }`,
`{ value: 0 }`, `{ value: '' }` and `{ value: null }` all emit, and so does a falsy `errorValue`. Up to
3.12.1 a truthiness check sat on top of that, so an ordinary boolean or counter stream emitted
nothing at all — and the symptom landed elsewhere, as a timed-out `expectEmission` or a component
still holding its initial state under a green assertion on the default.

`delay` is milliseconds and is applied with RxJS's own `delay()` / `timer()`, so under fake timers
you have to advance the clock: [`advanceTimers(ms)`](/utilities/fake-timers) does that **and**
drains the microtasks the emission queues.

### A fresh stream per call — `nextWithPerCall`

`nextWithPerCall(configs)` hands the **n-th call** the n-th entry, and returns one `ReplaySubject`
per entry so a test can push more values into a specific call later.

```ts
const [first$, second$] = myService.watch$.nextWithPerCall([{ value: 'a' }, { value: 'b', doNotComplete: true }]);

expect(await firstValueFrom(myService.watch$())).toBe('a');

// the second call's stream stays open, so it can be driven further
second$.next('b2');
```

Each per-call stream **completes after its first value** unless the entry sets
`doNotComplete: true`. `ValueConfigPerCall` is `{ value, delay?, doNotComplete? }`.

### Manual control — `returnSubject`

`returnSubject()` hands back the `ReplaySubject` behind the spy, for the cases the helpers do not
cover:

```ts
const subject = myService.getProducts$.returnSubject();

subject.next([{ name: 'Product 1' }]);
subject.error(new Error('boom'));
```

It is a `ReplaySubject`, so a subscriber that arrives late still sees the values already pushed.

Full reference, plus the standalone `createObservableWithValues` builder:
[Runtimes → RxJS](/runtimes/rxjs).
