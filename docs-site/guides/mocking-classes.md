---
title: Mocking classes in Vitest
description: createSpyFromClass against vi.spyOn(Class.prototype) and a vi.mock factory — which one to use, why a prototype spy never sees an arrow-function field, and how to double a class the code under test constructs itself.
---

# Mocking classes in Vitest

There are three ways to replace a class in a Vitest spec, and the one most guides lead with is the
one that leaks. This page puts them side by side on one class, then covers the trap all of them share:
the members that are not on the prototype.

```ts
export class PaymentClient {
  constructor(readonly apiKey: string) {}

  async charge(amount: number): Promise<Receipt> {
    /* a real HTTP call */
  }

  readonly refund = async (id: string): Promise<void> => {
    /* an arrow-function field — lives on the instance, not the prototype */
  };
}

export class Checkout {
  constructor(private readonly payments: PaymentClient) {}
  // pay(amount) calls payments.charge, cancel(id) calls payments.refund
}
```

## 1. `vi.spyOn(Class.prototype, 'method')`

```ts
afterEach(() => vi.restoreAllMocks());

it('returns the receipt id', async () => {
  const charge = vi.spyOn(PaymentClient.prototype, 'charge').mockResolvedValue({ id: 'r_1', amount: 5 });
  const checkout = new Checkout(new PaymentClient('pk_test'));

  await expect(checkout.pay(5)).resolves.toBe('r_1');
  expect(charge).toHaveBeenCalledWith(5);
});
```

It works, and it has three costs:

- **It patches the real class, for everyone.** Every instance in the realm answers the stub until
  something restores it — which is why the `afterEach` is not optional, and why a forgotten restore
  under `isolate: false` fails a test in a different file.
- **One method at a time.** Every other method is the real one, so the real constructor runs and the
  un-stubbed half of the class does real work. A new method on the class is a new real call from
  every spec that did not know about it.
- **It cannot see an instance field.** See [below](#the-trap-arrow-function-fields).

## 2. A `vi.mock` factory

```ts
vi.mock('./payment-client', () => ({
  PaymentClient: vi.fn(function () {
    return { charge: vi.fn(), refund: vi.fn() };
  }),
}));
```

The whole module is replaced, so nothing leaks — but the double is untyped (`{ charge: vi.fn() }`
is checked against nothing), it has to be kept in step with the class by hand, and it has a trap of
its own: Vitest forwards `new` only to an implementation that is itself constructible.
Write the same factory with an arrow and every construction fails:

```text
TypeError: () => ({ charge: __vite_ssr_import_0__.vi.fn() }) is not a constructor
```

with a stack in production code and a single warning on stderr ("The vi.fn() mock did not use
'function' or 'class' in its implementation") that is easy to miss in a large run. The
[constructor doubles](/utilities/constructor-doubles) page has the whole story.

## 3. `createSpyFromClass`

```ts
import { type Spy, asInstance, createSpyFromClass } from 'vitest-auto-spy';

describe('Checkout', () => {
  let payments: Spy<PaymentClient>;
  let checkout: Checkout;

  beforeEach(() => {
    payments = createSpyFromClass(PaymentClient, { instanceMethodsToSpyOn: ['refund'] });
    checkout = new Checkout(asInstance(payments));
  });

  it('returns the receipt id', async () => {
    payments.charge.calledWith(5).resolveWith({ id: 'r_1', amount: 5 });

    await expect(checkout.pay(5)).resolves.toBe('r_1');
  });

  it('reports a declined card', async () => {
    payments.charge.rejectWith(new Error('card declined'));

    await expect(checkout.pay(5)).resolves.toBe('declined');
  });

  it('refunds through the arrow field', async () => {
    payments.refund.resolveWith();

    await checkout.cancel('r_1');

    expect(payments.refund).toHaveBeenCalledWith('r_1');
  });
});
```

The spy is a new object per test, built from the class's prototype without running its constructor:

- **Nothing to restore.** The real `PaymentClient` is never touched, so there is no global state to
  put back and nothing for the next file to inherit.
- **Every method, typed.** `Spy<PaymentClient>` gives each method the helpers its return type earns —
  `resolveWith` / `rejectWith` on `charge` because it returns a `Promise`, and a `resolveWith` whose
  argument must be a `Receipt`. A method added to the class is a spy in every spec on the next run.
- **Answers keyed on arguments.** `calledWith(5)` configures what that call returns, which is a
  stronger contract than a blanket `mockResolvedValue` — see
  [cause and effect](/core/control-helpers#cause-and-effect-why-calledwith-and-not-mockreturnvalue).

`asInstance` is there because `Spy<T>` is a mapped type and drops private members, so it is not
assignable to `PaymentClient` as written; [Bridging `Spy<T>` and `T`](/core/spy-typing) explains the
trade.

|                            | `vi.spyOn(prototype)`       | `vi.mock` factory              | `createSpyFromClass`                      |
| -------------------------- | --------------------------- | ------------------------------ | ----------------------------------------- |
| Scope of the patch         | every instance in the realm | the module, for the whole file | one object, one test                      |
| Restore needed             | yes                         | no                             | no                                        |
| Methods covered            | the ones you name           | the ones you write             | all of them, lazily                       |
| Typed against the class    | the stubbed method only     | no                             | every method and its helpers              |
| Sees arrow-function fields | no                          | only if you write them         | when named                                |
| Needs a seam               | no                          | no                             | yes — the class arrives by argument or DI |

The last row is the honest cost. `createSpyFromClass` needs the code under test to _receive_ the
instance — a constructor argument, a function parameter, a DI provider. Code that runs `new
PaymentClient()` itself is covered [below](#a-class-the-code-under-test-constructs).

## The trap: arrow-function fields

```ts
vi.spyOn(PaymentClient.prototype, 'refund');
// Error: The property "refund" is not defined on the object.
```

`refund = async () => {}` is not a method. TypeScript compiles it into an assignment inside the
constructor, so it exists only on instances, and only once the constructor has run. The same is true
of anything assigned in a field initializer: bound handlers, Angular `signal()` / `computed()` fields,
an ngrx `signalStore()` member. A prototype has nothing to spy.

`createSpyFromClass` builds from the prototype too, and it does not run the constructor either — that
is what makes it safe on a class whose constructor opens a socket — so it cannot discover the field on
its own. Name it:

```ts
createSpyFromClass(PaymentClient, { instanceMethodsToSpyOn: ['refund'] });
```

Forget to, and the spy has no `refund`: the spec's own line fails with `Cannot read properties of
undefined (reading 'resolveWith')`, rather than the code under test quietly calling something real.
Put the field in `onlyMethodsToSpyOn` instead and the library reports that the name is not on the
class prototype — a warning, or a throw under the `strict` preset — and names
`instanceMethodsToSpyOn` as the fix. The reasoning is on
[createSpyFromClass](/core/create-spy-from-class#instancemethodstospyon-—-callables-that-are-not-on-the-prototype).

A class you only have as a **type** — or one that is all instance fields — needs no list at all:
[`createAutoMock<PaymentClient>()`](/core/auto-mock-by-type) builds every member lazily from what the
spec reads.

## A class the code under test constructs

When the constructor call lives inside the code under test, the class has to be replaced where the
code finds it — the module. Keep the module mock, and put an auto-spying constructor in it instead
of a hand-written literal:

```ts
import type { ConstructorSpy } from 'vitest-auto-spy';

import { payOnce } from './checkout';
import * as payments from './payment-client';

vi.mock('./payment-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./payment-client')>();
  const { createSpyClass } = await import('vitest-auto-spy');

  return {
    ...actual,
    PaymentClient: createSpyClass(actual.PaymentClient, {
      returns: { charge: Promise.resolve({ id: 'r_1', amount: 5 }) },
    }),
  };
});

const PaymentClient = payments.PaymentClient as unknown as ConstructorSpy<payments.PaymentClient>;

it('charges through the client it builds', async () => {
  await expect(payOnce(5)).resolves.toBe('r_1');

  expect(PaymentClient.calls[0]).toEqual(['pk_live']);
  expect(PaymentClient.instances[0].charge).toHaveBeenCalledWith(5);
});
```

[`createSpyClass`](/utilities/constructor-doubles) is a real constructor — `new` works whatever the
runner version — and every instance is a full auto-spy of the original class. Two details are
load-bearing:

- **The default goes in `returns`.** The instance does not exist until the code under test calls
  `new`, and `payOnce` calls `charge` in the same breath, so there is no moment for the spec to
  configure it. `returns` is the value every instance starts with; an instance reached through
  `instances` can still be reconfigured for the calls that come later.
- **The real class comes from `importOriginal`.** Inside the factory the module's own import would
  resolve to the mock being built, so `importOriginal` is the one way to reach the class that
  `createSpyClass` reads its prototype from.

The one `as unknown as` is the price of reading a module export as the double it was replaced with;
the module's own type still says `PaymentClient`. If that line appears in many specs, the class wants
a seam — pass it in, or inject a factory — and the section above applies instead.

## Related

- [createSpyFromClass](/core/create-spy-from-class) — every option, including `onlyMethodsToSpyOn`,
  accessor spies and lazy spies.
- [Constructor doubles](/utilities/constructor-doubles) — `createSpyClass`, `mockConstructor` and
  `stubConstructor`, for everything the code under test builds with `new`.
- [Module mocks that did nothing](/utilities/module-mocks) — `assertMocked`, for the `vi.mock` that
  silently did not apply.
