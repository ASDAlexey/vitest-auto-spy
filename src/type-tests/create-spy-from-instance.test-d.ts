/**
 * Type-level tests for `createSpyFromInstance`.
 *
 * The runtime spec proves the object was patched; only the compiler can prove the *same* object
 * comes back as a `Spy<T>` — the one claim that separates this factory from `vi.mockObject`, whose
 * result is typed as a plain `T` and therefore carries none of the helpers.
 *
 * Imported from `lib/` rather than from the barrel: the export line for `src/auto-spy.ts` is handed
 * to the maintainer with this change and is not written here.
 */
import { describe, expectTypeOf, it } from 'vitest';

import type { Spy } from '../auto-spy';
import { createSpyFromInstance, restoreSpiedInstance } from '../lib/create-spy-from-instance';

class PaymentsClient {
  readonly currency: string = 'EUR';

  charge = (value: number): string => `charged ${value}`;

  refund(id: string): string {
    return id;
  }

  get fees(): number {
    return 0;
  }
}

describe('createSpyFromInstance', () => {
  it('hands the instance back as a Spy<T>, helpers and all', () => {
    const spy = createSpyFromInstance(new PaymentsClient());

    expectTypeOf(spy).toEqualTypeOf<Spy<PaymentsClient>>();
    expectTypeOf(spy.refund).toBeCallableWith('7');
    expectTypeOf(spy.refund('7')).toEqualTypeOf<string>();
    expectTypeOf(spy.charge.mockReturnValue).toBeCallableWith('stubbed');
    expectTypeOf(spy.refund.calledWith('7')).toBeObject();
  });

  it('keeps non-method members at their own type', () => {
    const spy = createSpyFromInstance(new PaymentsClient());

    expectTypeOf(spy.currency).toEqualTypeOf<string>();
    expectTypeOf(spy.fees).toEqualTypeOf<number>();
  });

  it('rejects arguments the real method rejects', () => {
    const spy = createSpyFromInstance(new PaymentsClient());

    // @ts-expect-error -- wrong argument type
    spy.refund(1);
    // @ts-expect-error -- too many arguments
    spy.refund('7', '8');
  });

  it('takes a plain object, not only a class instance', () => {
    const spy = createSpyFromInstance({ send: (body: string): number => body.length });

    expectTypeOf(spy.send).toBeCallableWith('body');
    expectTypeOf(spy.send('body')).toEqualTypeOf<number>();
  });

  it('takes the same configuration as the class factory, and only method keys in the name lists', () => {
    const spy = createSpyFromInstance(new PaymentsClient(), {
      onlyMethodsToSpyOn: ['refund'],
      gettersToSpyOn: ['fees'],
      returns: { refund: 'done' },
      strict: true,
    });

    expectTypeOf(spy.accessorSpies.getters.fees.mockReturnValue).toBeFunction();

    // @ts-expect-error -- `currency` is not a method
    createSpyFromInstance(new PaymentsClient(), { onlyMethodsToSpyOn: ['currency'] });
    // @ts-expect-error -- `refund` returns a string
    createSpyFromInstance(new PaymentsClient(), { returns: { refund: 1 } });
  });

  it('takes the array shorthand as method names', () => {
    expectTypeOf(createSpyFromInstance(new PaymentsClient(), ['refund'])).toEqualTypeOf<Spy<PaymentsClient>>();
  });

  it('is Disposable, so `using` restores the object at the end of the block', () => {
    expectTypeOf<ReturnType<typeof createSpyFromInstance<PaymentsClient>>>().toExtend<Disposable>();
  });
});

describe('restoreSpiedInstance', () => {
  it('takes any object and returns nothing', () => {
    expectTypeOf(restoreSpiedInstance).toBeCallableWith(new PaymentsClient());
    expectTypeOf(restoreSpiedInstance(new PaymentsClient())).toEqualTypeOf<void>();
  });
});
