---
title: RxJS
description: The opt-in observable layer — nextWith, nextWithValues, nextWithPerCall, returnSubject, how delays behave, and why no declaration names rxjs.
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
myService.getProducts$.nextOneTimeWith([{ name: 'X' }]); // emit one value, then complete
myService.getProducts$.throwWith('FAKE ERROR'); // error the stream
myService.getProducts$.complete(); // complete the stream

// emit a precise sequence — values, errors, completion, optional delays
myService.getProducts$.nextWithValues([{ value: [{ name: 'Product 1' }] }, { errorValue: 'FAKE ERROR' }, { complete: true }]);

// a fresh stream per call
myService.getProducts$.nextWithPerCall([{ value: ['a'] }, { value: ['b'] }]);

// grab the underlying Subject for full manual control
const subject = myService.getProducts$.returnSubject();
```

Using an observable spy without importing `vitest-auto-spy/rxjs` throws a clear hint telling you to
add the import. Since **4.0.0** the same is true of the _types_: nothing in the core declarations
names an rxjs type either, so a project without rxjs never loads it — see
[rxjs in the types](#rxjs-in-the-types) below.

## rxjs in the types

Until 4.0.0 the invariant on this page — "rxjs lives behind `/rxjs`" — held at runtime and was
broken at the type level. `dist/types-*.d.ts` opened with `import { Observable, Subject } from
'rxjs'`, which is not something `import type` fixes: TypeScript resolves a type-only import exactly
as it resolves a value one. Measured on the shipped package, against a consumer whose only use of
this library is `createSpyFromClass`:

|                                                           |                     3.18 |     4.0 |
| --------------------------------------------------------- | -----------------------: | ------: |
| files in the consumer's TypeScript program                |                      303 | **114** |
| of those, rxjs `.d.ts` files                              |                      189 |   **0** |
| `TS2307` with `skipLibCheck: false` and no rxjs installed | yes, at `types-*.d.ts:1` |    none |

Every React, Vue, Svelte and Node consumer paid the first column. `scripts/check-dist.mjs` now
fails the build if any declaration but `dist/rxjs.d.ts` and `dist/observer-spy.d.ts` names rxjs
again.

### What replaced it

**Detection is structural.** A method or property counts as observable when its type has both
`subscribe` and a `forEach(next)` returning a promise — which rxjs's `Observable`, every `Subject`,
and Angular's `EventEmitter` all do, and `Promise`, arrays, `Signal` and Angular's
`OutputEmitterRef` all do not. `forEach` rather than `subscribe` carries the element type on
purpose: TypeScript pairs the **trailing** signature of an overloaded method when it infers, and
rxjs 7's last `subscribe` overload is the deprecated positional one, through which `T` infers as
`unknown`.

One thing now matches that did not before: an `Observable` from a **second copy of rxjs** in the
tree. `Subject` is nominal (it has a private field), so a duplicated rxjs used to fall through to
the plain-spy branch with nothing to explain why `nextWith` had disappeared.

**`returnSubject()` follows your import.** It is typed `SubjectOf<T>`, which resolves to rxjs's own
`Subject<T>` as soon as `vitest-auto-spy/rxjs` is in your TypeScript program, and to the structural
`SubjectLike<T>` — everything the helper is used for — when it is not. All four types are exported
from the core, so a spec can name any of them:

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

// the seam: empty here, filled in by `vitest-auto-spy/rxjs`
interface AutoSpyRxjsTypes<T> {}

type SubjectOf<T> = AutoSpyRxjsTypes<T> extends { subject: infer S } ? S : SubjectLike<T>;
```

`AutoSpyRxjsTypes<T>` is a normal augmentable interface, so a project with its own `Subject`
implementation can point `SubjectOf` at that instead:

````ts
declare module 'vitest-auto-spy' {
  interface AutoSpyRxjsTypes<T> {
    subject: MyOwnSubject<T>;
  }
}
``` The one import that makes the helpers *exist* is the one that makes them
rxjs-typed, so the two cannot drift apart.

```ts
import 'vitest-auto-spy/rxjs';
import type { Subject } from 'rxjs';

const subject: Subject<Product[]> = myService.getProducts$.returnSubject(); // ✔ compiles
````

The catch worth knowing: the type follows the **import**, not the installed package. If your only
`import 'vitest-auto-spy/rxjs'` sits in a setup file outside the `tsconfig` your specs are checked
with, you get `SubjectLike<T>` back and an annotation like the one above stops compiling. Move the
import somewhere the compiler sees it — the same place it has to be for the helpers to be
registered at runtime.

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
myService.getProducts$.nextWithValues([{ value: 'a' }, { value: 'b', delay: 20 }, { complete: true, delay: 10 }]);
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
- **The backing subject is a `ReplaySubject`**, so a subscriber that arrives _after_ the emission
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

## `subscribeSpyTo`, for a suite arriving with observer-spy

`@hirez_io/observer-spy` sits beside `jasmine-auto-spies` in almost every suite that has one — same
author, and the larger of the two by downloads — and it was last published in 2022. This entry ships
its surface so a migrating suite runs before its stream assertions are rewritten:

```ts
import { subscribeSpyTo } from 'vitest-auto-spy/observer-spy';

const spy = subscribeSpyTo(service.load());

expect(spy.getValues()).toEqual(['a', 'b']);
expect(spy.receivedComplete()).toBe(true);
```

**It is a bridge, and the assertions above are the destination.** `subscribeSpyTo` is synchronous
inspection: subscribe, let things happen, then read the spy. Its failure mode is silence — a stream
that never emits gives `getValues() === []`, a spec asserts something about that, and the test passes
having observed nothing. `expectEmission` makes the assertion _be_ the await, so silence is a
timeout naming the stream.

Four things behave better here than upstream, and a migrated spec will notice the last one:
`getValues()` hands back a copy rather than the spy's own live array, and is typed `T[]` rather than
`any[]`; `getFirstValue()` and `getValueAt(i)` throw instead of answering `undefined` from a
signature that promised `T`; and an unexpected error is thrown by the value reader that asked,
carrying the original as `cause`, rather than rethrown from the observer. That last one is not a
preference — upstream's rethrow stopped working when rxjs 7 began routing anything thrown out of an
observer callback through `reportUnhandledError`, which reports it asynchronously, so it never
reaches the subscribing line. Pass `{ expectErrors: true }` (or call `.expectErrors()`) when the
error is the point, and read `getError()`.

`SubscriberSpy` is disposable, so the subscription can be scoped to its block instead of to a global
`afterEach`:

```ts
using spy = subscribeSpyTo(service.load());
```

`fakeTime()` has no counterpart here — it is built on rxjs's `TestScheduler` virtual time and on the
`done` callback protocol. Use [fake timers](/utilities/fake-timers), or `TestScheduler` directly.
