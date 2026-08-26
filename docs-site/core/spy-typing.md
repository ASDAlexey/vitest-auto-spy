---
title: Bridging Spy<T> and T
description: Why Spy<T> is not assignable to T, and the two named views — asInstance and asSpy — that cross the gap without an `as`.
---

# Bridging `Spy<T>` and `T`

`Spy<T>` is a mapped type. It drops `#private` / `private` members, so it is **not** assignable to
`T` — which is correct (a spy is not the class) and a constant nuisance when an API asks for `T`.
The fix is a named, documented view instead of an `as any` scattered through a suite:

```ts
import { asInstance, asSpy } from 'vitest-auto-spy';

asInstance(cartSpy); // Spy<CartService> → CartService, for APIs typed against the class
asSpy(TestBed.inject(CartService)); // CartService → Spy<CartService>, for the helpers
```

Both are the same object at runtime; only the view changes.

```ts
const store = createSpyFromClass(CartStore);

renderShallow(CartComponent, {
  providers: [{ provide: CartStore, useValue: asInstance(store) }],
});
```

Declare the variable as `Spy<T>` (which is what `injectSpy(X)` returns) rather than as `T`, and the
bridges stay at the boundaries where an external API forces the other view.

## A spy you can call with `new`

A runner mock (`vi.fn()`) rejects `new` as soon as it carries a `mockReturnValue`, so code under
test that does `new Foo()` — a `Worker`, an `IntersectionObserver`, a hand-rolled client — cannot
be served by one. `createSpyClass` returns a real constructor function whose instances are full
auto-spies:

```ts
import { createSpyClass } from 'vitest-auto-spy';
import { mockValueProp } from 'vitest-auto-spy';

const WorkerSpy = createSpyClass(BackgroundWorker);
mockValueProp(globalThis, 'BackgroundWorker', WorkerSpy);

service.start();

expect(WorkerSpy.calls[0]).toEqual(['./task.js']);
WorkerSpy.instances[0].postMessage.mockReturnValue(undefined);
```

| Member      | What it holds                                           |
| ----------- | ------------------------------------------------------- |
| `calls`     | The arguments of every `new` (and plain call), in order |
| `instances` | The `Spy<T>` produced by each construction, in order    |

It takes the same optional second argument as
[`createSpyFromClass`](./create-spy-from-class), so each instance can be configured the usual way.
