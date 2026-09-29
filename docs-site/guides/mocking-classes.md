---
title: Mocking classes in Vitest
description: Replace a class in a Vitest spec - createSpyFromClass compared with vi.spyOn on the prototype and a vi.mock factory, arrow-function fields, and classes the code under test creates with new.
---

# Mocking classes in Vitest

`createSpyFromClass` builds a typed spy object from a class. Every method becomes a spy, and the real
class is never touched. Use it when the code under test receives the class instance as a constructor
argument, a function parameter or through dependency injection.

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { type Spy, asInstance, createSpyFromClass } from 'vitest-auto-spy';

import { Checkout } from './checkout';
import { PaymentClient } from './payment-client';

describe('Checkout', () => {
  let payments: Spy<PaymentClient>;
  let checkout: Checkout;

  beforeEach(() => {
    payments = createSpyFromClass(PaymentClient);
    checkout = new Checkout(asInstance(payments));
  });

  it('returns the receipt id', async () => {
    payments.charge.calledWith(5).resolveWith({ id: 'r_1', amount: 5 });

    await expect(checkout.pay(5)).resolves.toBe('r_1');
    expect(payments.refund).not.toHaveBeenCalled();
  });

  it('reports a declined card', async () => {
    payments.charge.rejectWith(new Error('card declined'));

    await expect(checkout.pay(5)).resolves.toBe('declined');
  });

  it('refunds a receipt', async () => {
    payments.refund.resolveWith();

    await checkout.cancel('r_1');

    expect(payments.refund).toHaveBeenCalledWith('r_1');
  });
});
```

The classes in this example:

```ts
// payment-client.ts
export interface Receipt {
  id: string;
  amount: number;
}

export class PaymentClient {
  constructor(readonly apiKey: string) {}

  async charge(amount: number): Promise<Receipt> {
    /* a real HTTP call */
  }

  async refund(id: string): Promise<void> {
    /* a real HTTP call */
  }
}

// checkout.ts
export class Checkout {
  constructor(private readonly payments: PaymentClient) {}
  // pay(amount) calls payments.charge and returns the receipt id, or 'declined' if it rejects
  // cancel(id) calls payments.refund
}
```

What each piece does:

- **`createSpyFromClass(PaymentClient)`** creates a new object for each test. It reads the class's
  methods without running its constructor, so nothing needs restoring afterwards.
- **Every method is a spy**, even one the test never configured. `payments.refund` exists in the
  first test, so `expect(payments.refund).not.toHaveBeenCalled()` works.
- **`Spy<PaymentClient>`** types each method with helpers that fit its return type. `charge` returns a
  `Promise<Receipt>`, so it gets `resolveWith` and `rejectWith`, and `resolveWith` only accepts a
  `Receipt`.
- **`calledWith(5).resolveWith(...)`** answers only when the argument is `5`. A call with other
  arguments gets the method's general answer, the one set without `calledWith` (for example
  `payments.charge.resolveWith(receipt)`). If there is none, it gets `undefined`. So the test fails
  if the code sends the wrong amount. To throw on any other arguments instead, use
  `mustBeCalledWith(5)`. Why this is stronger than `mockResolvedValue`:
  [cause and effect](/core/control-helpers#cause-and-effect-why-calledwith-and-not-mockreturnvalue).
- **`asInstance(payments)`** passes the spy where a `PaymentClient` is expected. You need it only when
  the class has private or protected members: `Spy<T>` drops them, so TypeScript would reject the
  spy as a `PaymentClient`. It does no harm otherwise.
  [Bridging `Spy<T>` and `T`](/core/spy-typing) explains why.

If a method is written as an arrow-function field (`refund = async () => {}`), the spy needs one
option. See [Mock an arrow-function field](#mock-an-arrow-function-field).

## Choose an approach

|                                   | `vi.spyOn(prototype)`                    | `vi.mock` factory                            | `createSpyFromClass`                     |
| --------------------------------- | ---------------------------------------- | -------------------------------------------- | ---------------------------------------- |
| What it replaces                  | every instance of the class              | the module, for the whole file               | one object, for one test                 |
| Needs a restore                   | yes                                      | no                                           | no                                       |
| Methods covered                   | the ones you name                        | the ones you write                           | all of them, configured or not           |
| Typed against the class           | only the stubbed method                  | no                                           | every method and its helpers             |
| A method added to the class later | real in every spec that does not stub it | missing: the call throws `is not a function` | a spy in every spec, with no spec change |
| Sees arrow-function fields        | no                                       | only if you write them                       | when listed in `instanceMethodsToSpyOn`  |
| Code must receive the class       | no                                       | no                                           | yes: by argument or dependency injection |

The last row is the one real limit of `createSpyFromClass`. If the code under test calls
`new PaymentClient()` itself, see [Mock a class the code creates with `new`](#mock-a-class-the-code-creates-with-new).

## Spy on the prototype with `vi.spyOn`

```ts
import { afterEach, expect, it, vi } from 'vitest';

import { Checkout } from './checkout';
import { PaymentClient } from './payment-client';

afterEach(() => vi.restoreAllMocks());

it('returns the receipt id', async () => {
  const charge = vi.spyOn(PaymentClient.prototype, 'charge').mockResolvedValue({ id: 'r_1', amount: 5 });
  const checkout = new Checkout(new PaymentClient('pk_test'));

  await expect(checkout.pay(5)).resolves.toBe('r_1');
  expect(charge).toHaveBeenCalledWith(5);
});
```

This works, but it has three downsides:

- **It changes the real class for everyone.** Every instance uses the stub until something restores
  it. That is why the `afterEach` is required. If you forget it and tests share one environment
  (`isolate: false`), a test in another file fails.
- **One method at a time.** Every other method stays real, and the real constructor runs. A method
  added to the class later is a real call in every spec that does not stub it.
- **It cannot see arrow-function fields.** See [Mock an arrow-function field](#mock-an-arrow-function-field).

## Replace the module with `vi.mock`

```ts
vi.mock('./payment-client', () => ({
  PaymentClient: vi.fn(function () {
    return { charge: vi.fn(), refund: vi.fn() };
  }),
}));
```

The whole module is replaced, so nothing leaks between files. But:

- the fake is not typed: `{ charge: vi.fn() }` is not checked against the class;
- you keep it in sync with the class by hand;
- it must use `function`, not an arrow. Vitest can only call `new` on a constructible
  implementation. With an arrow, every `new PaymentClient()` fails:

```text
TypeError: () => ({ charge: __vite_ssr_import_0__.vi.fn() }) is not a constructor
```

The stack points at production code. Vitest also prints one warning to stderr ("The vi.fn() mock did
not use 'function' or 'class' in its implementation"), which is easy to miss in a large run. More on
this in [Constructor doubles](/utilities/constructor-doubles).

## Mock an arrow-function field

Suppose `refund` is written as an arrow-function field instead of a method:

```ts
export class PaymentClient {
  // ...
  readonly refund = async (id: string): Promise<void> => {
    /* a real HTTP call */
  };
}
```

A prototype spy cannot reach it:

```ts
vi.spyOn(PaymentClient.prototype, 'refund');
// Error: The property "refund" is not defined on the object.
```

`refund = async () => {}` is a field, not a method. TypeScript turns it into an assignment inside the
constructor, so it exists only on instances, after the constructor runs. The prototype has nothing to
spy on. The same applies to anything set in a field initializer: bound handlers, Angular `signal()`
and `computed()` fields, members of an ngrx `signalStore()`.

`createSpyFromClass` reads the prototype too. Unlike `new PaymentClient()`, it never runs the
constructor, which is what makes it safe for a class whose constructor opens a socket. So it cannot
find the field by itself. Name it:

```ts
createSpyFromClass(PaymentClient, { instanceMethodsToSpyOn: ['refund'] });
```

If you forget, the spy has no `refund`. The failure is in your spec, on the line that configures it:
`Cannot read properties of undefined (reading 'resolveWith')`. The code under test never calls
anything real.

If you put the field in `onlyMethodsToSpyOn` instead, the library reports that the name is not on the
class prototype and suggests `instanceMethodsToSpyOn`. It is a warning by default. It becomes an
error when your setup file calls `setupAutoSpy({ preset: 'strict' })` (or
`setupAutoSpy({ misconfiguration: 'throw' })`). Details:
[`instanceMethodsToSpyOn`](/core/create-spy-from-class#instancemethodstospyon-—-callables-that-are-not-on-the-prototype).

If you only have the class as a **type**, or the class is all instance fields, no list is needed:
[`createAutoMock<PaymentClient>()`](/core/auto-mock-by-type) creates every member the spec reads.

## Mock a class the code creates with `new`

When the code under test calls `new PaymentClient()` itself, replace the class in its module. Keep
`vi.mock`, but return an auto-spying constructor from `createSpyClass` instead of a hand-written
object:

```ts
import { expect, it, vi } from 'vitest';
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

[`createSpyClass`](/utilities/constructor-doubles) returns a real constructor, so `new` always works.
Each instance is a full spy of the original class. `calls` holds the arguments of each `new`, and
`instances` holds the spy each `new` created.

Two details matter:

- **Put default answers in `returns`.** The instance does not exist until the code calls `new`, and
  `payOnce` calls `charge` right after. The spec has no moment to configure it in between. `returns`
  sets what every new instance starts with. You can still reconfigure an instance from `instances`
  for later calls.
- **Get the real class from `importOriginal`.** Inside the factory, a normal import of the module
  returns the mock being built. `importOriginal` is the only way to reach the real class that
  `createSpyClass` reads.

The `as unknown as` cast is needed because the module's type still says `PaymentClient`. If you find
this cast in many specs, change the code to receive the class instead: pass it in or inject a
factory. Then the approach at the top of this page applies.

## Related

- [createSpyFromClass](/core/create-spy-from-class): every option, including `onlyMethodsToSpyOn`,
  accessor spies and lazy spies.
- [Constructor doubles](/utilities/constructor-doubles): `createSpyClass`, `mockConstructor` and
  `stubConstructor` for anything the code under test builds with `new`.
- [Module mocks that did nothing](/utilities/module-mocks): `assertMocked`, for a `vi.mock` that
  silently did not apply.
