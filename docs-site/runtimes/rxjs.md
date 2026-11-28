---
title: RxJS
description: Make a spied method or property return an Observable you control - nextWith, nextWithValues, nextWithPerCall, returnSubject, delays and resets.
---

# RxJS

Use `vitest-auto-spy/rxjs` to control what an `Observable` emits in a test. Here, `ProductList.load()`
subscribes to `ProductService.getProducts()`, which returns `Observable<Product[]>`. Use `nextWith`
on the spy to return a product list without calling the real service. This also works for properties like `items$`.

```ts
// product-list.spec.ts
import { expect, it } from 'vitest';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy';

import 'vitest-auto-spy/rxjs';

import { ProductList } from './product-list';
import { ProductService } from './product.service';

it('shows the products the service returns', () => {
  const products: Spy<ProductService> = createSpyFromClass(ProductService);
  const list = new ProductList(products);

  products.getProducts.nextWith([{ name: 'Tea' }]);
  list.load();

  expect(list.names).toEqual(['Tea']);
});
```

If several tests use the helpers, move `import 'vitest-auto-spy/rxjs';` to a shared setup file:

```ts
// vitest.setup.ts
import 'vitest-auto-spy/rxjs';
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { setupFiles: ['./vitest.setup.ts'] },
});
```

Without the import, the first Observable helper throws `Observable spies require rxjs` and tells
you what to import. Projects without RxJS can use the rest of the library without installing it.

## Observable properties

List a property like `items$` in `observablePropsToSpyOn` to give it the same helpers as a method.

```ts
const store = createSpyFromClass(CartStore, { observablePropsToSpyOn: ['items$'] });

store.items$.nextWith([{ id: 1 }]);
```

## Helpers

Use these helpers on a spied method that returns an `Observable` or a property listed in
`observablePropsToSpyOn`.

| Helper                    | What it does                                                    |
| ------------------------- | --------------------------------------------------------------- |
| `nextWith(value)`         | emits `value`; the stream stays open                            |
| `nextOneTimeWith(value)`  | emits `value`, then completes                                   |
| `throwWith(error)`        | errors the stream                                               |
| `complete()`              | completes the stream                                            |
| `nextWithValues(configs)` | emits a sequence: values, an error, completion, optional delays |
| `nextWithPerCall(list)`   | gives each call its own stream; returns their subjects          |
| `returnSubject()`         | returns the `Subject` behind the spy, for full manual control   |
| `subscriberCount()`       | number of open subscriptions (properties only)                  |

```ts
products.getProducts.nextWith([{ name: 'Tea' }]); // emit, stream stays open
products.getProducts.nextOneTimeWith([{ name: 'Tea' }]); // emit one value, then complete
products.getProducts.throwWith(new Error('offline')); // error the stream
products.getProducts.complete(); // complete the stream

// a precise sequence
products.getProducts.nextWithValues([{ value: [{ name: 'Tea' }] }, { errorValue: 'offline' }, { complete: true }]);

// a fresh stream per call: the first call gets ['a'], the second ['b']
products.getProducts.nextWithPerCall([{ value: ['a'] }, { value: ['b'] }]);

// the Subject itself
const subject = products.getProducts.returnSubject();
subject.next([{ name: 'Coffee' }]);
```

What each list entry accepts:

| Type                                     | Shape                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `ValueConfig` (for `nextWithValues`)     | `{ value, delay? }` or `{ errorValue, delay? }` or `{ complete?, delay? }`        |
| `ValueConfigPerCall` (`nextWithPerCall`) | `{ value, delay?, doNotComplete? }`; each stream completes unless `doNotComplete` |

## `nextWith` pushes; `nextWithValues` republishes

On a property, use `nextWith` to reach anyone already listening. Use `nextWithValues` to set up a
sequence before they subscribe. On a method, each call returns the current stream.

| Helper                                                    | What it does to the stream          | A subscriber that is already on it |
| --------------------------------------------------------- | ----------------------------------- | ---------------------------------- |
| `nextWith` / `nextOneTimeWith` / `throwWith` / `complete` | updates the shared subject          | sees the update                    |
| `nextWithValues` (on a property spy)                      | replaces the stream on the property | stays on the old one               |

If a component subscribes in `ngOnInit`, it keeps that stream. A later `nextWithValues` replaces the
stream on the property, so the component misses the new values. The library warns once:

```text
[vitest-auto-spy] Feed.items$.nextWithValues() ran after something subscribed to Feed.items$, and it
publishes a new stream that subscriber never sees — these values will not reach it. Call
nextWithValues() before the code under test subscribes, or push into the stream it holds with nextWith().
Docs: https://asdalexey.github.io/vitest-auto-spy/runtimes/rxjs#nextwith-pushes-nextwithvalues-republishes
```

Call `nextWithValues` before you create the component, or update the stream it already holds:

```ts
service.items$.nextWith(['a']); // reaches the component that subscribed in ngOnInit
service.items$.returnSubject().error(new Error('offline')); // so does this
```

## A request method answers once: `nextOneTimeWith`

Use `nextOneTimeWith` for a request that emits once and completes, like an HTTP call, a Tauri
`invoke`, or a database query.

On Angular CLI's `@angular/build:unit-test` builder, put `import 'vitest-auto-spy/rxjs';` in the file
that `setupFiles` lists in `angular.json` (see [Angular unit-test builder](/guides/angular-unit-test-builder)):

```json
"test": {
  "builder": "@angular/build:unit-test",
  "options": { "setupFiles": ["src/test-setup.ts"] }
}
```

In this Angular example, the component calls `OrderService.load()` once. It stores the result or
error message in signals:

```ts
// order-list.component.ts
import { Component, type OnInit, inject, signal } from '@angular/core';

import { type Order, OrderService } from './order.service';

@Component({ selector: 'app-order-list', template: '' })
export class OrderListComponent implements OnInit {
  private readonly orderService = inject(OrderService);
  readonly orders = signal<Order[]>([]);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.orderService.load().subscribe({
      next: (orders) => this.orders.set(orders),
      error: (err: Error) => this.error.set(err.message),
    });
  }
}
```

```ts
// order-list.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Spy, injectSpy, provideAutoSpy, stable } from 'vitest-auto-spy/angular';

import { OrderListComponent } from './order-list.component';
// load(): Observable<Order[]>, one HTTP request
import { OrderService } from './order.service';

describe('OrderListComponent', () => {
  let orderService: Spy<OrderService>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OrderListComponent],
      providers: [provideAutoSpy(OrderService)], // TestBed injects a spy instead of the real service
    });
    orderService = injectSpy(OrderService); // the same spy the component gets
    orderService.load.nextOneTimeWith([{ id: 1 }]); // emits one list, then completes
  });

  it('shows the orders', async () => {
    const fixture = TestBed.createComponent(OrderListComponent);
    await stable(fixture); // runs ngOnInit and change detection

    expect(fixture.componentInstance.orders()).toEqual([{ id: 1 }]);
  });

  it('shows the error', async () => {
    orderService.load.throwWith(new Error('offline')); // replaces the completed stream from beforeEach
    const fixture = TestBed.createComponent(OrderListComponent);
    await stable(fixture);

    expect(fixture.componentInstance.error()).toBe('offline');
  });
});
```

More on `provideAutoSpy` and `injectSpy`: [Angular](/adapters/angular#replace-a-service-provideautospy-and-injectspy).

After `nextOneTimeWith` completes the stream, the next helper call on that method creates a new
one. In the second test, `throwWith` starts a stream with only the error, not the list from
`beforeEach`. See [Reset streams between tests](#reset-streams-between-tests).

**Why not `nextWith`.** It leaves the stream open. The stream replays its last value to new
subscribers until you reset the spy. For requests, this causes two problems:

- **Loading never finishes.** `forkJoin`, `lastValueFrom`, `toArray()` and `expectAllEmissions`
  wait for completion. Without it, they neither return a result nor fail. For example, a component's
  `loading` signal can stay `true`.
- **Old data arrives before the error.** If you call `throwWith` after `nextWith` in `beforeEach`, a
  new subscriber gets the old value first. The code runs its success branch before handling the error.

Use `nextWith` for streams that stay open in real code, like a store's `state$`, a WebSocket, or
router events.

**The library warns about `throwWith` after `nextWith`.** The warning doesn't apply to
`nextOneTimeWith`. It fires only when all three conditions hold:

- the method was seeded with `nextWith`;
- the stream has not completed or errored since;
- nothing is subscribed to it at that moment.

By default it prints a warning, once per spy. With
[`setupAutoSpy({ misconfiguration: 'throw' })`](/utilities/setup#misconfiguration-reports-that-fail-at-the-call),
every such `throwWith` call throws instead:

```text
[vitest-auto-spy] BondApi.getBonds.throwWith() ran on a stream that still holds a value from an
earlier nextWith() and has no subscriber, so the next one gets that value first and the error after
it — the code under test runs its success branch on stale data. …
```

To avoid the warning:

- seed the method with `nextOneTimeWith` instead of `nextWith`;
- call `resetAutoSpy(api.getBonds)` (from `vitest-auto-spy`) before `throwWith`;
- to test "emit, then fail", set up both events in one call:
  `nextWithValues([{ value: BONDS }, { errorValue: error }])`.

If the code under test is already subscribed when `throwWith` runs, there is no warning. That
subscriber got the value when `nextWith` ran, and it gets the error now.

**Keeping a call pending.** To test a loading state, return a stream that never emits. After
`nextWith`, `returnSubject()` gives you the same stream, which still replays its last value. Reset
the spy and return `NEVER` from RxJS instead:

```ts
import { NEVER } from 'rxjs';
import { resetAutoSpy } from 'vitest-auto-spy';

resetAutoSpy(api.getBonds); // drops the seeded value
api.getBonds.mockReturnValue(NEVER); // every call stays pending
```

`mockReturnValue` switches the stream helpers off for this spy (see the end of
[Where a `throwWith` error goes](#where-a-throwwith-error-goes)). To use `nextWith` or `throwWith` on
it again, call `api.getBonds.mockReset()` first.

On a spy with no value set, `returnSubject()` also works. Its stream stays silent until you call
`next` on it.

## Where a `throwWith` error goes

`throwWith` ends the stream with an error, even if nobody has subscribed. Later subscribers still
get the error. Angular's `toSignal` and `rxResource` store it instead of passing it straight to
`ErrorHandler`. Check the result where your code handles the error:

| The code under test                                                     | Where the error ends up                                        | Assert it with                                                                                                                                                                                                |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.subscribe({ next, error })` or `catchError`, into state               | your error callback, synchronously, when the code subscribes   | the state it wrote: `expect(component.error()).toBe('offline')`                                                                                                                                               |
| `toSignal(api.load())`, and the test reads the signal itself            | the signal: it throws when read, and only then                 | `expect(() => service.bonds()).toThrow('offline')`                                                                                                                                                            |
| `rxResource({ stream: () => api.load() })`                              | the resource: `status()` is `'error'`, `value()` throws        | [`await settleResource(service.bonds)`](/adapters/angular#resources-httpresource-and-resource) (from `vitest-auto-spy/angular`), then read `error()`                                                          |
| any signal read in an `effect` or a template, a `toSignal` one included | `ErrorHandler`, during change detection; TestBed rethrows it   | `expect(() => TestBed.tick()).toThrow('offline')`                                                                                                                                                             |
| `.subscribe(next)` with no error callback                               | rxjs rethrows it from a `setTimeout`, after the test has ended | the [`strayTimers`](/utilities/setup#an-observable-error-nothing-handled) option of `setupAutoSpy` fails the test. To expect the error, call `expectUnhandledObservableErrors()` from `vitest-auto-spy/setup` |

The first row is the one in the [complete example above](#a-request-method-answers-once-nextonetimewith).
The `toSignal` case:

```ts
it('shows the error', () => {
  api.load.throwWith(new Error('offline'));
  const service = TestBed.inject(BondsService); // bonds = toSignal(api.load())

  expect(() => service.bonds()).toThrow('offline'); // nothing fails until something reads it
});
```

If an `effect` or a template reads the signal, the error surfaces during change detection. Just
injecting the service or creating the component won't expose it. Run change detection and expect
it to fail:

```ts
expect(() => TestBed.tick()).toThrow('offline');
// or, through the fixture
await expect(fixture.whenStable()).rejects.toThrow('offline');
```

**Stream helpers stop working after `mockImplementation` or `mockReturnValue`.** They replace the
part of the spy that returns the stream (called "dispatch" in the warning). A later `throwWith`
won't change what the spy returns. The library reports this as a warning
(`throwWith() was configured on 'load' after mockImplementation() had replaced its dispatch`), or
as an error with `misconfiguration: 'throw'`. Call `api.load.mockReset()` first, or set the default
with `nextOneTimeWith` instead of `mockReturnValue`.

## Reading a sequence as a marble

`nextWithValues` emits its entries in order. Only `delay` puts time between them. The comments show
each example as a marble diagram (`|` is completion, `#` is an error).

```ts
products.getProducts.nextWithValues([{ value: 'a' }, { value: 'b' }, { complete: true }]);
// (ab|)   both values at once, then completion
```

```ts
products.getProducts.nextWithValues([{ value: 'a' }, { value: 'b', delay: 20 }, { complete: true, delay: 10 }]);
// a 20ms b 10ms |
```

```ts
products.getProducts.nextWithValues([{ value: 'a' }, { errorValue: 'boom', delay: 20 }]);
// a 20ms #
```

- `{ complete: false }` emits nothing and leaves the stream open.
- Entries after the first `{ complete: true }` are dropped.

## Timing

- **`delay` is in milliseconds of real time.** It uses RxJS's `delay()` for values and completion,
  and `timer()` for errors. There is no virtual scheduler.
- **Without a delay, emission is synchronous.** A subscriber sees the value in the same tick.
- **A late subscriber still gets the last value.** The stream behind a spy is a `ReplaySubject(1)`.
  So `nextWith(v)` works whether the code under test subscribes before or after it.
- **Under fake timers, advance the clock for a delayed entry.** Use
  [`advanceTimers(ms)`](/utilities/fake-timers): it also runs the pending promise callbacks. A bare
  `vi.advanceTimersByTime()` does not, so the assertion can run too early.

```ts
import { expect, it } from 'vitest';
import { advanceTimers, setupFakeTimers } from 'vitest-auto-spy/setup';

setupFakeTimers();

it('emits after 100 ms', async () => {
  products.getProducts.nextWithValues([{ value: 'a', delay: 100 }]);

  const seen: string[] = [];
  products.getProducts().subscribe((value) => seen.push(value));

  await advanceTimers(100);

  expect(seen).toEqual(['a']);
});
```

## Standalone observable builder

`createObservableWithValues` builds the same kind of stream without a spy. It takes the same entries
as `nextWithValues`.

```ts
import { createObservableWithValues } from 'vitest-auto-spy/rxjs';

const fake$ = createObservableWithValues([{ value: 1 }, { value: 2 }, { complete: true }]);

// the Subject too
const { values$, subject } = createObservableWithValues([{ value: 1 }], { returnSubject: true });
```

## Check for a missing unsubscribe: `subscriberCount()`

`items$.subscriberCount()` returns how many subscriptions to a spied property are open now. A
subscription stops counting when it unsubscribes, or when the stream completes or errors. Check
for `0` after destroying a component to catch a leak:

```ts
fixture.destroy();
expect(store.items$.subscriberCount()).toBe(0);
```

**Did the second request cancel the first?** Wrap the Observable returned by `load` with `log.track(key, source$)`.
Check `log.events` before calling `view.unsubscribe()` so cleanup cannot hide a missed cancellation.
Replacing `switchMap` with `mergeMap` leaves A open, so the assertion fails.

```ts
import { NEVER, Subject, switchMap } from 'rxjs';
import { expect, vi } from 'vitest';
import { createSubscriptionLog } from 'vitest-auto-spy/rxjs';

const log = createSubscriptionLog<string>();
const load = vi.fn((id: string) => log.track(id, NEVER));
const ids = new Subject<string>();
const view = ids.pipe(switchMap(load)).subscribe();
ids.next('A');
ids.next('B');

expect(log.events.map(({ type, key }) => `${type}:${key}`)).toEqual(['subscribe:A', 'unsubscribe:A', 'subscribe:B']);
view.unsubscribe();
```

Calling the method does not log an event. Each subscription gets its own numeric `subscription` ID, starting at 1.
The matching `unsubscribe` event records teardown after cancellation, completion, or error. Tracking adds no timers or independent subscriptions.

## Reset streams between tests

If tests share a spy, reset it before each test. Each spied member keeps one `ReplaySubject(1)`,
which replays the last value to new subscribers. Without a reset, the next test can receive that
old value first:

```ts
import { beforeEach } from 'vitest';
import { resetAutoSpy } from 'vitest-auto-spy';

beforeEach(() => {
  resetAutoSpy(service); // the TestBed is built in beforeAll, so the spy is shared
});
```

- **`vi.clearAllMocks()` and `clearMocks: true` do not reset the stream.** The stream is library
  state, not part of the runner's mock. Call `resetAutoSpy(spy)`.
- **A finished stream is replaced.** The stream is finished after `nextOneTimeWith()`, `throwWith()` or
  `complete()` on the spy, or after `complete()` or `error()` on the subject from `returnSubject()`.
  Then the next stream helper (`nextWith`, `throwWith` and the rest) starts a new stream:

```ts
const subject = service.load$.returnSubject();

subject.complete(); // the spec closes it by hand

service.load$.nextWith(page); // a fresh stream, not a value nobody can receive
```

- **Inside one test, calls add up.** `nextWith(a)` then `throwWith(e)` means "emit `a`, then fail".
  With nobody subscribed in between, that is reported: see
  [A request method answers once](#a-request-method-answers-once-nextonetimewith). To get a stream
  that fails on subscription no matter what came before, use `nextWithValues([{ errorValue: e }])`. On a property spy, call it before the code subscribes: see
  [`nextWith` pushes; `nextWithValues` republishes](#nextwith-pushes-nextwithvalues-republishes).

## Asserting instead of subscribing

To check what a stream emits ("it emits", "it emits these three", "it stays silent"), use the
[observable assertions](/core/observable-assertions). They work on any object with `subscribe` and
do not need rxjs:

```ts
import { expectEmission } from 'vitest-auto-spy';

const emitted = expectEmission(products.getProducts());

products.getProducts.nextWith(['x']);

expect(await emitted).toEqual(['x']);
```

## rxjs in the types

The core type declarations never import rxjs. React, Vue, Svelte and Node projects without rxjs
type-check with `skipLibCheck: false` and load no rxjs `.d.ts` files. Only the `vitest-auto-spy/rxjs`
and `vitest-auto-spy/observer-spy` declarations name rxjs.

Neither of the two names `vitest`, so a Bun or `node:test` project type-checks them with
`skipLibCheck: false` and no Vitest installed. On Bun and `node:test`, `returnSubject()` is typed as
rxjs's `Subject` once this entry is imported, as on Vitest.

Any rxjs `Observable` or `Subject` gets the observable helpers, and so does Angular's `EventEmitter`.
How the type is detected is described in [In depth](#in-depth).

### Naming the subject type

`returnSubject()` returns `SubjectOf<T>`:

- rxjs's own `Subject<T>`, when `vitest-auto-spy/rxjs` is imported somewhere your TypeScript program
  sees;
- otherwise `SubjectLike<T>`, a plain interface with everything the helper is used for.

```ts
import type { Subject } from 'rxjs';

import 'vitest-auto-spy/rxjs';

const subject: Subject<Product[]> = products.getProducts.returnSubject(); // ✔ compiles
```

**Common mistake:** the annotation above stops compiling because the only `import 'vitest-auto-spy/rxjs'`
sits in a setup file your spec `tsconfig` does not include. Put the import in a file the compiler
checks:

- works: a spec, a file in `setupFiles`, a `.d.ts` file, and (with `@angular/build:unit-test`) the
  `providersFile`;
- does not work: a plain `.ts` file that is only listed in `tsconfig.spec.json`'s `include`. This
  applies to `@angular/build:unit-test` 22.2 and later.

All four types are exported from the core, so a spec can name any of them:

```ts
interface ObservableLike<T> {
  subscribe(...args: never[]): { unsubscribe(): void };
  forEach(next: (value: T) => void, ...rest: never[]): Promise<void>;
}

interface SubjectLike<T> extends ObservableLike<T> {
  next(value: T): void;
  error(err: unknown): void;
  complete(): void;
  unsubscribe(): void;
  asObservable(): ObservableLike<T>;
  readonly closed: boolean;
}

// empty here, filled in by `vitest-auto-spy/rxjs`
interface AutoSpyRxjsTypes<T> {}

type SubjectOf<T> = AutoSpyRxjsTypes<T> extends { subject: infer S } ? S : SubjectLike<T>;
```

If your project has its own `Subject` class, point `SubjectOf` at it with a type extension
(`declare module`):

```ts
declare module 'vitest-auto-spy' {
  interface AutoSpyRxjsTypes<T> {
    subject: MyOwnSubject<T>;
  }
}
```

Put it in a `.d.ts` file (with an `import` or `export {}` so it stays an extension), a spec or a
setup file. The rule is the same as above. A plain `.ts` listed only in `include` does not work with
`@angular/build:unit-test` 22.2 and later.

## `subscribeSpyTo`, for a suite arriving with observer-spy

If your tests use `@hirez_io/observer-spy`, change the import to `vitest-auto-spy/observer-spy`.
You can keep your existing assertions while you migrate:

```ts
import { subscribeSpyTo } from 'vitest-auto-spy/observer-spy';

const spy = subscribeSpyTo(service.load());

expect(spy.getValues()).toEqual(['a', 'b']);
expect(spy.receivedComplete()).toBe(true);
```

For new tests, use [`expectEmission`](/core/observable-assertions) and related assertions. With
`subscribeSpyTo`, a stream that never emits gives you `getValues() === []`, so the test can pass
without seeing a value. `expectEmission` waits for a value and names the stream if it times out.

Differences from `@hirez_io/observer-spy`:

- `getValues()` returns a copy, typed `T[]` instead of `any[]`.
- `getFirstValue()` and `getValueAt(i)` throw when there is no such value, instead of returning
  `undefined`.
- If the stream fails unexpectedly, the next value reader (such as `getValues()`) throws. The
  original error is available as `cause`. To test an error, pass `{ expectErrors: true }` or call
  `.expectErrors()`, then read `getError()`.
- The promise from `onComplete()` rejects if the stream errors. The promise from `onError()`
  rejects if it completes. This avoids a file timeout whether the stream ends before or after the
  call. The callback form (`onComplete(() => …)`) still behaves as before: it never calls back in
  that case.

```text
[vitest-auto-spy] this spy's observable errored (Error: offline), so the promise from onComplete() can never resolve:
completion is not coming. Read receivedComplete() / receivedError(), or await
`expectCompletion(source$)` / `expectError(source$)`, which fail with a message naming the stream.
Docs: https://asdalexey.github.io/vitest-auto-spy/runtimes/rxjs
```

`SubscriberSpy` is disposable, so you can scope the subscription to a block instead of a global
`afterEach`:

```ts
using spy = subscribeSpyTo(service.load());
```

There is no `fakeTime()`: it relies on rxjs's `TestScheduler` and the `done` callback. Use
[fake timers](/utilities/fake-timers), or `TestScheduler` directly.

## In depth

A member counts as observable when its type has `subscribe` and a `forEach(next)` that returns a
promise. rxjs `Observable`, every `Subject` and Angular's `EventEmitter` match. `Promise`, arrays,
`Signal` and Angular's `OutputEmitterRef` do not. An `Observable` from a second copy of rxjs in
`node_modules` matches too, so it still gets `nextWith`.
