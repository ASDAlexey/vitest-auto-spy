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

One wrapper per argument is not merely longer, it is _discovered_ one argument at a time: TypeScript
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

The mock surface on each spied method is `MockInstance<Method>` — the same helpers
(`mockReturnValue`, `mockImplementation`, `calls`, …) **without** a call signature of its own. Up to
3.12.1 it was `Mock`, which with no type argument is `Mock<Procedure>` — `(...args: any[]) => any` —
and an intersection accepts a call matching _either_ member: on a double of `read(key: string)` all
of `read(1)`, `read('ok', 'extra')` and `read()` compiled, while none of them compiles on the real
instance, so a spec could call the double a way production code never could and stay green.

Now the only call signature left is the method's own, and a call the real method rejects fails to
compile on the double too. A side effect worth having: `expectTypeOf(spy.method).parameters` and
`.returns` resolve, instead of collapsing to `never` against two competing call signatures.

## The stub is checked too, not only the call

That type argument on `MockInstance<Method>` is the second half, and for a while it was missing:
left bare, the parameter defaults to `Procedure` again and every helper that _configures_ a double
took `any`.

```ts
const posters = createSpyFromClass(PosterService); // getPosters(shelfId: string): Poster[][]

posters.getPosters.mockReturnValue(42); // ❌ TS2345 — used to compile
posters.getPosters.mockReturnValue(undefined); // ❌ TS2345 — used to compile
posters.getPosters.mockImplementation(() => of(null)); // ❌ TS2345 — used to compile
posters.getPosters.mockReturnValue([[poster]]); // ✅
```

Stubbing a return value is the most common thing anyone does with a spy, so a spy that could not
check it was not doing the job it exists for — and the asymmetry was visible one line away, because
the `calledWith(…)` continuation has always been typed:

```ts
posters.getPosters.calledWith('shelf-1').mockReturnValue(42); // ❌ — this one always failed
```

What is checked now: `mockReturnValue` / `mockReturnValueOnce` against `ReturnType<Method>`,
`mockImplementation` / `mockImplementationOnce` / `withImplementation` against
`(...args: Parameters<Method>) => ReturnType<Method>`, `mockResolvedValue` /
`mockResolvedValueOnce` against the awaited return. `mock.calls`, `mock.lastCall` and
`getMockImplementation()` come back typed rather than as `any[]`. On an overloaded method it is the
signature `{ overload: … }` selected, so the two options agree.

Two things deliberately did **not** change. `mockReturnValue()` with no argument at all still
compiles on a `void` method — that overload is this package's own, added because the runner's
demands an argument on a method whose point is that it returns nothing. And `mockRejectedValue`
still takes `unknown`, because a rejection is not the method's return type.

## `readonly` survives onto the double, and `mockValueProp` is the answer

`Spy<T>` and `DeepMockProxy<T>` are homomorphic mapped types, so a member the source type declares
`readonly` is `readonly` on the double too, and a plain assignment is `TS2540`:

```ts
interface Session {
  readonly accessToken: string;
}

const session = createAutoMock<Session>({ accessToken: 'first' });

session.accessToken = 'second'; // ❌ TS2540
mockValueProp(session, 'accessToken', 'second'); // ✅ the retry reads what the refresh step replaced
```

A seed cannot express that second value, because a seed is read once, at construction — so
something has to write it, and which write it is matters more than it looks.

Stripping the modifier was tried and reverted. It made the assignment compile everywhere, including
on a member replaced by a **spied accessor** (`gettersToSpyOn: ['accessToken']`), where the write
reaches the setter spy and the getter goes on answering `undefined` — a loud, one-line-fixable type
error traded for a silent runtime no-op, which is the same class of defect the typed mock surface
above exists to remove.

**`Reflect.set` is not the escape hatch it looks like.** It invokes the same `[[Set]]`, so it is
just as inert on a spied accessor, and it returns `true` on top of that — which misleads a caller
that checks the result. Probed against a spied accessor whose getter answers `undefined`:

| Write                                               | Getter afterwards | Setter spy | Returned |
| --------------------------------------------------- | ----------------- | ---------- | -------- |
| `double.token = 'x'`                                | `undefined`       | recorded   | —        |
| `Reflect.set(double, 'token', 'x')`                 | `undefined`       | recorded   | `true`   |
| `Object.defineProperty` — what `mockValueProp` does | `'x'`             | —          | —        |

So [`mockValueProp` / `mockReadonlyProp`](/utilities/setup) is the answer in both cases, and it
needs no type at all: `readonly` does not take a key out of `keyof T`, so the checked overload
`mockValueProp<T, K extends keyof T>(object, property, value)` accepts the member as it stands, and
`restoreMockedProps()` undoes the patch.

`Mutable<T>` is the secondary, opt-in answer, for a spec that would rather write plain assignments
to plain **data** members and does not want the bookkeeping:

```ts
const session: Mutable<Spy<SessionService>> = createSpyFromClass(SessionService);

session.accessToken = 'second';
```

It does not help on a spied accessor — it produces the same `[[Set]]`, and so the same no-op.

## `Spy<T>`, not `Mocked<T>`

```ts
let modal: Spy<KdsModalService>; // ✅
let modal: Mocked<KdsModalService>; // ❌
```

`Mocked<T>` is Vitest's own type and it intersects with `T` _completely_, private members included.
Assigning a spy to it fails with `Type 'Spy<…>' is missing the following properties: _modalOpened,
body, rendererFactory, …` — a list of private field names, from which it is impossible to guess that
the **declaration** is what is wrong rather than the spy. The
[`no-mocked-for-spy`](/utilities/eslint-plugin) rule catches it mechanically.
