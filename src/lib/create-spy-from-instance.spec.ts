/**
 * `createSpyFromInstance` patches an object the test already holds, so everything worth pinning here
 * is about the object rather than about the double: that the caller's reference sees the spies, that
 * `Object.prototype` is left alone, that a member which refuses to be redefined is reported in this
 * library's words, and that the instance can be handed back real.
 */
import { type Observable, firstValueFrom } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createSpyFromInstance, restoreSpiedInstance } from './create-spy-from-instance';
import { registerMockAdapter } from './mock-adapter';
import { addObservableHelpersToCalledWithObject, addObservableHelpersToFunctionSpy, createObservablePropSpy } from './observable-spy';
import { registerObservableSupport } from './observable-support';
import { resetAutoSpy } from './reset-auto-spy';
import type { ClassSpyConfiguration, OnlyMethodKeysOf, Spy } from './types';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
  registerObservableSupport({
    addToFunctionSpy: addObservableHelpersToFunctionSpy,
    addToCalledWithObject: addObservableHelpersToCalledWithObject,
    createPropSpy: createObservablePropSpy,
  });
});

class Gateway {
  ping(): string {
    return 'real-ping';
  }
}

class PaymentsClient extends Gateway {
  readonly currency = 'EUR';

  amount = 0;

  /** Assigned by the container after construction, so discovery cannot see it. */
  reload!: () => string;

  charges$!: Observable<string>;

  charge = (value: number): string => `real-charge ${value}`;

  refund(id: string): string {
    return `real-refund ${id}`;
  }

  get fees(): number {
    return 5;
  }

  set limit(value: number) {
    this.amount = value;
  }
}

/** Every instance spied by a test, put back before the next one so the patch journal stays empty. */
const spied: object[] = [];

function spyOn<T extends object>(instance: T, config?: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[]): Spy<T> {
  spied.push(instance);

  return createSpyFromInstance(instance, config);
}

afterEach(() => {
  spied.splice(0).forEach(restoreSpiedInstance);
});

describe('createSpyFromInstance — discovery', () => {
  it('spies own callables, prototype methods and inherited ones on the very object it was given', () => {
    const client = new PaymentsClient();
    const spy = spyOn(client);

    expect(spy).toBe(client);

    spy.charge.mockReturnValue('stubbed');
    spy.refund.calledWith('7').mockReturnValue('reversed');

    // Read back through the caller's own reference: the point of patching in place.
    expect(client.charge(1)).toBe('stubbed');
    expect(client.refund('7')).toBe('reversed');
    expect(client.ping()).toBeUndefined();
    expect(spy.ping).toHaveBeenCalledTimes(1);
  });

  it('leaves non-callable members alone', () => {
    const client = new PaymentsClient();
    const spy = spyOn(client);

    expect(spy.currency).toBe('EUR');
    expect(spy.amount).toBe(0);
  });

  it('stops at Object.prototype', () => {
    const client = new PaymentsClient();
    spyOn(client);

    expect(Object.hasOwn(client, 'hasOwnProperty')).toBe(false);
    expect(Object.hasOwn(client, 'toString')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(client, 'amount')).toBe(true);
  });

  it('spies only the named methods under onlyMethodsToSpyOn', () => {
    const client = new PaymentsClient();
    const spy = spyOn(client, { onlyMethodsToSpyOn: ['refund'] });

    expect(spy.refund('7')).toBeUndefined();
    expect(client.charge(1)).toBe('real-charge 1');
  });

  it('adds a member discovery cannot see, from either additive list or the array form', () => {
    const fromArray = spyOn(new PaymentsClient(), ['reload']);
    const fromList = spyOn(new PaymentsClient(), { instanceMethodsToSpyOn: ['reload'] });

    fromArray.reload.mockReturnValue('again');

    expect(fromArray.reload()).toBe('again');
    expect(fromList.refund).toHaveBeenCalledTimes(0);
    expect(fromList.reload()).toBeUndefined();
  });
});

describe('createSpyFromInstance — configuration', () => {
  it('installs observable prop spies', async () => {
    const spy = spyOn(new PaymentsClient(), { observablePropsToSpyOn: ['charges$'] });

    spy.charges$.nextWith('paid');

    await expect(firstValueFrom(spy.charges$)).resolves.toBe('paid');
  });

  it('spies the accessors the prototype declares, discovered or named', () => {
    const client = new PaymentsClient();
    const discovered = spyOn(client, { autoSpyAccessors: true });

    discovered.accessorSpies.getters.fees.mockReturnValue(9);
    client.limit = 3;

    expect(client.fees).toBe(9);
    expect(discovered.accessorSpies.setters.limit).toHaveBeenCalledWith(3);

    const named = spyOn(new PaymentsClient(), { gettersToSpyOn: ['fees'] });

    expect(named.accessorSpies.getters.fees).toHaveBeenCalledTimes(0);
  });

  it('applies returns and seeds overrides', () => {
    const client = new PaymentsClient();
    const spy = spyOn(client, { returns: { refund: 'done' }, overrides: { amount: 42 } });

    expect(spy.refund('7')).toBe('done');
    expect(client.amount).toBe(42);
  });

  it('names the class in a strict-mode failure', () => {
    const spy = spyOn(new PaymentsClient(), { strict: true });

    expect(() => spy.refund('7')).toThrow('Nothing configured PaymentsClient.refund, and strict mode is on.');
  });

  it('has no class to name on a null-prototype object', () => {
    const bare: { ping(): string } = Object.assign(Object.create(null) as object, { ping: (): string => 'x' });
    const spy = spyOn(bare, { onlyMethodsToSpyOn: ['ping'], strict: true });

    expect(() => spy.ping()).toThrow('Nothing configured ping, and strict mode is on.');
  });
});

describe('createSpyFromInstance — members that refuse to be replaced', () => {
  it('explains a frozen instance instead of throwing a bare TypeError', () => {
    expect(() => createSpyFromInstance(Object.freeze(new PaymentsClient()))).toThrow(
      '[vitest-auto-spy] Cannot spy on this instance in place: it is not extensible, so its members cannot be replaced. ' +
        'The target is a frozen object.',
    );
  });

  it('explains a non-configurable member, and leaves the members it did replace restorable', () => {
    const client = new PaymentsClient();
    Object.defineProperty(client, 'refund', { value: (): string => 'locked', configurable: false });
    spied.push(client);

    expect(() => createSpyFromInstance(client)).toThrow(
      "[vitest-auto-spy] Cannot mock the property 'refund': it is not configurable, so it cannot be redefined. " +
        'The target is an instance of PaymentsClient.',
    );
    expect(() => createSpyFromInstance(client)).toThrow(
      'Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/module-mocks#provide-a-real-seam',
    );
  });
});

describe('createSpyFromInstance — giving the object back', () => {
  it('restores every replaced member, the accessors and the bag included', () => {
    const client = new PaymentsClient();
    createSpyFromInstance(client, { autoSpyAccessors: true });

    restoreSpiedInstance(client);

    expect(client.refund('7')).toBe('real-refund 7');
    expect(client.charge(1)).toBe('real-charge 1');
    expect(client.ping()).toBe('real-ping');
    expect(client.fees).toBe(5);
    expect(Object.hasOwn(client, 'accessorSpies')).toBe(false);
  });

  it('unwinds two rounds of spying in one call', () => {
    const client = new PaymentsClient();
    createSpyFromInstance(client);
    createSpyFromInstance(client, { returns: { refund: 'second' } });

    restoreSpiedInstance(client);

    expect(client.refund('7')).toBe('real-refund 7');
  });

  it('is a no-op on an object that was never spied, and on one already restored', () => {
    const client = new PaymentsClient();
    createSpyFromInstance(client);
    restoreSpiedInstance(client);

    expect(() => restoreSpiedInstance(client)).not.toThrow();
    expect(() => restoreSpiedInstance(new PaymentsClient())).not.toThrow();
    expect(client.refund('7')).toBe('real-refund 7');
  });

  it('restores at the end of a `using` block rather than merely resetting', () => {
    const client = new PaymentsClient();

    {
      using spy = createSpyFromInstance(client);
      spy.refund.mockReturnValue('stubbed');

      expect(client.refund('7')).toBe('stubbed');
    }

    expect(client.refund('7')).toBe('real-refund 7');
  });

  it('is resettable through resetAutoSpy while it is still patched', () => {
    const client = new PaymentsClient();
    const spy = spyOn(client);
    spy.refund.calledWith('7').mockReturnValue('reversed');

    expect(client.refund('7')).toBe('reversed');

    resetAutoSpy(spy);

    expect(spy.refund).toHaveBeenCalledTimes(0);
    expect(client.refund('7')).toBeUndefined();
  });
});
