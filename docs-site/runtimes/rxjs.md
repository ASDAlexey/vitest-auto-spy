---
title: RxJS
description: Make a spied method or property return an Observable you control - nextWith, nextWithValues, nextWithPerCall, returnSubject, delays and resets.
---

# RxJS

The `vitest-auto-spy/rxjs` entry lets a spy return an `Observable` you control from the test. Use
it when the code under test subscribes to a service method or a `$` property.

Import it once in a setup file, and list that file in the Vitest config:

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

Then a spec creates the spy, passes it to the class under test, and sets what the stream emits:

```ts
// product-list.spec.ts
import { expect, it } from 'vitest';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy';

import { ProductList } from './product-list';
// calls products.getProducts().subscribe(...) in load()
import { ProductService } from './product.service';

// getProducts(): Observable<Product[]>

it('shows the products the service returns', () => {
  const products: Spy<ProductService> = createSpyFromClass(ProductService);
  const list = new ProductList(products);

  products.getProducts.nextWith([{ name: 'Tea' }]);
  list.load();

  expect(list.names).toEqual(['Tea']);
});
```

If the setup import is missing, the first observable helper throws `Observable spies require rxjs`
and names the import to add. The rest of the library never imports rxjs, so projects without rxjs
do not need it installed.

## Observable properties

A property like `items$` is not a method, so you name it in `observablePropsToSpyOn`. It then gets
the same helpers as a method.

```ts
const store = createSpyFromClass(CartStore, { observablePropsToSpyOn: ['items$'] });

store.items$.nextWith([{ id: 1 }]);
```

## Helpers

Every spied method that returns an `Observable`, and every property in `observablePropsToSpyOn`, has
these helpers.

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

The entries of the two list helpers:

| Type                                     | Shape                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `ValueConfig` (for `nextWithValues`)     | `{ value, delay? }` or `{ errorValue, delay? }` or `{ complete?, delay? }`        |
| `ValueConfigPerCall` (`nextWithPerCall`) | `{ value, delay?, doNotComplete? }`; each stream completes unless `doNotComplete` |

## `nextWith` pushes; `nextWithValues` republishes

The two look interchangeable. On an observable **property** they are not. On a **method** spy they
behave the same, because each call reads the current stream.

| Helper                                                    | What it does to the stream                   | A subscriber that is already on it |
| --------------------------------------------------------- | -------------------------------------------- | ---------------------------------- |
| `nextWith` / `nextOneTimeWith` / `throwWith` / `complete` | pushes into the subject everybody shares     | receives it                        |
| `nextWithValues` (on a property spy)                      | publishes a **new** stream over the property | stays on the old one               |

A component usually subscribes to a property once, in `ngOnInit`. It keeps the stream it got then.
If you call `nextWithValues` after that, the component never sees the values. The library warns
once:

```text
[vitest-auto-spy] Feed.items$.nextWithValues() ran after something subscribed to Feed.items$, and it
publishes a new stream that subscriber never sees — these values will not reach it. Call
nextWithValues() before the code under test subscribes, or push into the stream it holds with nextWith().
Docs: https://asdalexey.github.io/vitest-auto-spy/runtimes/rxjs#nextwith-pushes-nextwithvalues-republishes
```

Fix it one of two ways:

- Call `nextWithValues` in the arrange step, before you create the component.
- Or push into the live stream:

```ts
service.items$.nextWith(['a']); // reaches the component that subscribed in ngOnInit
service.items$.returnSubject().error(new Error('offline')); // so does this
```

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

## Reset streams between tests

Each spied member keeps one `ReplaySubject(1)`. Its buffered value is configuration, like a
`calledWith` rule (an answer set up for specific arguments). If a spy lives across tests, reset it,
or the next test sees the old value first.

```ts
import { beforeEach } from 'vitest';
import { resetAutoSpy } from 'vitest-auto-spy';

beforeEach(() => {
  resetAutoSpy(service); // the TestBed is built in beforeAll, so the spy is shared
});
```

- **`vi.clearAllMocks()` and `clearMocks: true` do not reset the stream.** The stream is library
  state, not part of the runner's mock. Call `resetAutoSpy(spy)`.
- **A finished stream is replaced.** The stream is finished after `throwWith()` or `complete()` on the
  spy, or after `complete()` or `error()` on the subject from `returnSubject()`. Then the next
  `nextWith` starts a new stream:

```ts
const subject = service.load$.returnSubject();

subject.complete(); // the spec closes it by hand

service.load$.nextWith(page); // a fresh stream, not a value nobody can receive
```

- **Inside one test, calls add up.** `nextWith(a)` then `throwWith(e)` means "emit `a`, then fail".
  To get a stream that fails on subscription no matter what came before, use
  `nextWithValues([{ errorValue: e }])`. On a property spy, call it before the code subscribes: see
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

`vitest-auto-spy/observer-spy` provides the API of `@hirez_io/observer-spy`. Use it when you migrate
tests that already use that package: they run before you rewrite their stream assertions.

```ts
import { subscribeSpyTo } from 'vitest-auto-spy/observer-spy';

const spy = subscribeSpyTo(service.load());

expect(spy.getValues()).toEqual(['a', 'b']);
expect(spy.receivedComplete()).toBe(true);
```

Treat it as a bridge. For new tests, use [`expectEmission`](/core/observable-assertions) and its
siblings. With `subscribeSpyTo`, a stream that never emits gives `getValues() === []`, and a test can
pass having seen nothing. `expectEmission` waits for the value, so silence becomes a timeout that
names the stream.

Differences from `@hirez_io/observer-spy`:

- `getValues()` returns a copy, typed `T[]` instead of `any[]`.
- `getFirstValue()` and `getValueAt(i)` throw when there is no such value, instead of returning
  `undefined`.
- An unexpected stream error is thrown by the next value reader (`getValues()` and the like), with
  the original error as `cause`. When the error is what you test, pass `{ expectErrors: true }` (or
  call `.expectErrors()`) and read `getError()`.
- Awaited `onComplete()` rejects when the stream errored, and awaited `onError()` rejects when it
  completed. Otherwise the test would hang until the file timeout. It does not matter whether the stream ended before or after you called `onComplete()` / `onError()`.
  The callback form (`onComplete(() => …)`) behaves as in the original: the callback never runs.

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
