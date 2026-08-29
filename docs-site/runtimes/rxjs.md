---
title: RxJS
description: The opt-in observable layer — nextWith, nextWithValues, nextWithPerCall, returnSubject, and how delays behave.
---

# RxJS

Observable spying lives behind the `vitest-auto-spy/rxjs` subpath, keeping `rxjs` out of the
runtime bundle of non-rxjs projects. Import it **once** (e.g. in your test setup) to enable
observable helpers:

```ts
import 'vitest-auto-spy/rxjs';
```

Both spied **methods** that return an `Observable` and spied **properties** of type `Observable`
get the same control surface:

```ts
myService.getProducts$.nextWith([{ name: 'Product 1' }]); // emit, stream stays open
myService.getProducts$.nextOneTimeWith([{ name: 'X' }]);  // emit one value, then complete
myService.getProducts$.throwWith('FAKE ERROR');           // error the stream
myService.getProducts$.complete();                        // complete the stream

// emit a precise sequence — values, errors, completion, optional delays
myService.getProducts$.nextWithValues([
  { value: [{ name: 'Product 1' }] },
  { errorValue: 'FAKE ERROR' },
  { complete: true },
]);

// a fresh stream per call
myService.getProducts$.nextWithPerCall([{ value: ['a'] }, { value: ['b'] }]);

// grab the underlying Subject for full manual control
const subject = myService.getProducts$.returnSubject();
```

Using an observable spy without importing `vitest-auto-spy/rxjs` throws a clear hint telling you to
add the import. The core's _type_ surface (`Spy<T>`) still references rxjs types, so keep `rxjs`
available for type-checking; none of it reaches your runtime bundle.

## The backing subject, and how long it lives

Every observable helper writes into one `ReplaySubject(1)` per spied member. Its buffer is
**configuration**, in exactly the sense a `calledWith` chain is, and until 3.5.0 it outlived the test
that filled it. Two silent failures came out of that.

```ts
// test 1
service.createSeamlessTransition.nextWith(uri); // buffered

// test 2 — the failure path is what this test is about
service.createSeamlessTransition.throwWith(error); // the subscriber gets `uri` FIRST, then the error
```

The code under test ran the **success** branch on the previous test's data, and the branch the test
existed for arrived one emission late — with nothing in the failure pointing back. The second is
quieter still: `error()` and `complete()` close a Subject for good, so every later `nextWith` on that
spy pushed into a dead subject and emitted nothing.

Both are fixed: `resetAutoSpy(spy)` drops the subject, and a terminated one is replaced by the next
configuration. Two things follow that are worth knowing.

**`vi.clearAllMocks()` and `clearMocks: true` still cannot reach it.** That is not an oversight — it
is the same boundary that keeps them from clearing a `calledWith` chain: the state lives in this
library's closures, not on the runner's mock object. When a spy outlives a test, reset it yourself:

```ts
beforeEach(() => {
  resetAutoSpy(service); // the TestBed is built in beforeAll, so the spy is shared
});
```

**Inside one test, nothing changed.** `nextWith(a)` followed by `throwWith(e)` still means "emit a,
then fail" — both calls belong to one story, and only a reset or a terminal call starts a new one.
`nextWithValues([{ errorValue: e }])` remains the way to build a stream that fails on subscription
regardless of what came before it.

## Standalone observable builder

```ts
import { createObservableWithValues } from 'vitest-auto-spy/rxjs';

const fake$ = createObservableWithValues([{ value: 1 }, { value: 2 }, { complete: true }]);

// or get the subject too
const { values$, subject } = createObservableWithValues([{ value: 1 }], { returnSubject: true });
```

`ValueConfig` (for `nextWithValues`): `{ value, delay? }` | `{ errorValue, delay? }` | `{ complete?, delay? }`.

`ValueConfigPerCall` (for `nextWithPerCall`) is `{ value, delay?, doNotComplete? }`.

## Reading a sequence as a marble

`nextWithValues` emits its entries in order, so the config list maps one-to-one onto a marble
diagram — `delay` is the only thing that puts space between frames.

```ts
myService.getProducts$.nextWithValues([{ value: 'a' }, { value: 'b' }, { complete: true }]);
// (ab|)   — both values synchronously, then completion
```

```ts
myService.getProducts$.nextWithValues([
  { value: 'a' },
  { value: 'b', delay: 20 },
  { complete: true, delay: 10 },
]);
// a 20ms b 10ms |
```

```ts
myService.getProducts$.nextWithValues([{ value: 'a' }, { errorValue: 'boom', delay: 20 }]);
// a 20ms #
```

A `{ complete: false }` entry emits nothing and does not stop the stream — it is the "leave it open"
form. Everything after the first `{ complete: true }` is dropped.

## Timing

- **`delay` is milliseconds**, applied with RxJS's own `delay()` (values, completion) and `timer()`
  (errors). It is real time, not a virtual scheduler.
- **Without a delay, emission is synchronous.** `nextWith` pushes onto a `ReplaySubject` right away,
  so a subscriber that has already run sees the value in the same tick.
- **The backing subject is a `ReplaySubject`**, so a subscriber that arrives *after* the emission
  still receives it. This is what makes `spy.thing$.nextWith(v)` work regardless of whether the code
  under test subscribed first.
- **Under fake timers**, a delayed entry needs the clock advanced.
  [`advanceTimers(ms)`](/utilities/fake-timers) advances **and** drains the microtasks the emission
  queues — a bare `vi.advanceTimersByTime()` leaves the `await` continuation pending, and the
  assertion then reads state from before the callback finished.

```ts
import { advanceTimers, setupFakeTimers } from 'vitest-auto-spy/setup';

setupFakeTimers();

myService.getProducts$.nextWithValues([{ value: 'a', delay: 100 }]);

const seen: string[] = [];
myService.getProducts$.subscribe((value) => seen.push(value));

await advanceTimers(100);

expect(seen).toEqual(['a']);
```

## Asserting instead of subscribing

For the assertion side of a stream — "it emits", "it emits these three", "it stays silent" — use the
[observable assertions](/core/observable-assertions). They are duck-typed, so they work on any
subscribable and pull in no rxjs of their own:

```ts
import { expectEmission, expectNoEmission } from 'vitest-auto-spy';

const emitted = expectEmission(myService.getProducts$);

myService.getProducts$.nextWith(['x']);

expect(await emitted).toEqual(['x']);
```
