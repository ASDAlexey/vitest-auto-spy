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

## Which error means which direction

The compiler reports the `Spy<T>` / `T` mismatch in four different ways, and none of them contains
both the words "spy" and "instance" — which is why the fix is hard to find from the message alone,
and why the usual repair is a double assertion that also hides real mismatches.

| Message                                                                              | Direction | Fix                               |
| ------------------------------------------------------------------------------------ | --------- | --------------------------------- |
| `TS2352: … 'accessorSpies' is missing in type 'Router'`                              | `T` → spy | `asSpy(TestBed.inject(Router))`   |
| `TS2739` / `TS2740: Type 'Spy<X>' is missing the following properties from type 'X'` | spy → `T` | `asInstance(spy)`                 |
| `TS2345: Argument of type 'Spy<X>' is not assignable to parameter of type 'X'`       | spy → `T` | `asInstance(spy)`                 |
| `is missing the following properties: _modalOpened, body, …` (private names)         | —         | declare `Spy<T>`, not `Mocked<T>` |

`TS2352` is the one a migrated suite hits everywhere at once: `TestBed.inject(X) as Spy<X>` is the
`jest-auto-spies` idiom and is in every guide, and it only starts failing once the specs are
compiled by the same toolchain as production code — a `ts-jest` setup with isolated-module semantics
never type-checked it.

The last row is its own trap. Vitest's own `Mocked<T>` keeps `T`'s **private** members, so the error
lists private field names and reads as "the double is incomplete". It is not; the declaration is
wrong. `Spy<T>` covers the public surface on purpose.

## A generic class needs its type argument

`TestBed.inject` infers from the constructor, so `FeatureFlagService<T = FeatureFlagDefaults>`
comes back as `FeatureFlagService<any>`. The `any` then spreads through `Spy<>` and surfaces as a
mismatch between `AddPromiseSpyMethods<unknown>` and `WithMockReturnValue<…>`, eight levels deep,
with nothing in the message about a missing type parameter.

```ts
const config = asSpy<FeatureFlagService>(TestBed.inject(FeatureFlagService));
const config = injectSpy<FeatureFlagService>(FeatureFlagService); // same, in Angular
```

## `asInstances(...)` — a whole argument list at once

```ts
factory = webSsoAuthCheckFactory(...asInstances(account, authCheck, domainEvents, storage), document);
```

One wrapper per argument is not merely longer, it is *discovered* one argument at a time: TypeScript
stops checking a call at the first argument that does not fit, so a factory taking five spies reports
one `TS2345`, and the next only after the previous is fixed and `tsc` is run again. A non-spy in the
list passes through unchanged, so a call that mixes spies with real values does not have to be split.

## Overloads: `Parameters` reads the **last** signature

```ts
const cinemas = asSpy<VenuesService, { overload: 'first' }>(TestBed.inject(VenuesService));
const client = createSpyFromClass<VenuesService, { overload: 'first' }>(VenuesService);
```

`Parameters<F>` and `ReturnType<F>` — and therefore the helpers a spy attaches — read the last
overload of a method. On a generated API client (`ng-openapi-gen`, `openapi-generator`) that is
`observe: 'events'`, the signature nobody calls: `nextWith(body)` then stops compiling, demanding an
`HttpEvent<T>`, with nothing in the message about overload order.

`{ overload: 'first' }` types the spy against the first signature instead. For a single method there
is also `Overload<Client['get'], 0>`, which is what to put in a `MockInstance<…>` or a `vi.fn<…>()`.

## The only call signature is the method's own

The mock surface on each spied method is `MockInstance` — the same helpers (`mockReturnValue`,
`mockImplementation`, `calls`, …) **without** a call signature of its own. Up to 3.12.1 it was
`Mock`, which with no type argument is `Mock<Procedure>` — `(...args: any[]) => any` — and an
intersection accepts a call matching *either* member: on a double of `read(key: string)` all of
`read(1)`, `read('ok', 'extra')` and `read()` compiled, while none of them compiles on the real
instance, so a spec could call the double a way production code never could and stay green.

Now the only call signature left is the method's own, and a call the real method rejects fails to
compile on the double too. Configuring one is unchanged — `MockInstance` defaults to `Procedure` as
well, so `mockReturnValue` / `mockImplementation` stay as lenient as they were — and a side effect
worth having: `expectTypeOf(spy.method).parameters` and `.returns` resolve, instead of collapsing to
`never` against two competing call signatures.

## `Spy<T>`, not `Mocked<T>`

```ts
let modal: Spy<KdsModalService>; // ✅
let modal: Mocked<KdsModalService>; // ❌
```

`Mocked<T>` is Vitest's own type and it intersects with `T` *completely*, private members included.
Assigning a spy to it fails with `Type 'Spy<…>' is missing the following properties: _modalOpened,
body, rendererFactory, …` — a list of private field names, from which it is impossible to guess that
the **declaration** is what is wrong rather than the spy. The
[`no-mocked-for-spy`](/utilities/eslint-plugin) rule catches it mechanically.
