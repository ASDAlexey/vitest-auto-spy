/**
 * The two behaviours a `createSpyFromClass` double gained on top of its members: it is
 * `Disposable`, so `using` resets it at the end of the block, and it can be **strict**, so a method
 * nobody configured fails naming itself instead of answering `undefined` three frames from the
 * omission.
 *
 * The rest of the factory (discovery, accessors, `returns`, `fillMissing`, the abstract-class
 * fallback) is exercised from `src/auto-spy.spec.ts`; this file stays on the two new seams.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createSpyFromClass } from './create-spy-from-class';
import { setDefaultStrictMode } from './function-spy';
import { registerMockAdapter } from './mock-adapter';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

afterEach(() => {
  setDefaultStrictMode(undefined);
});

class Cart {
  checkout(_id: number, _when: string): string {
    return 'done';
  }

  total(): number {
    return 0;
  }

  load(): Promise<number> {
    return Promise.resolve(0);
  }
}

/** Fully abstract: the prototype names nothing, so the factory falls back to `createAutoMock`. */
abstract class Storage {
  abstract read(key: string): string | null;
}

describe('createSpyFromClass — Symbol.dispose', () => {
  it('resets the double at the end of a `using` block, calls and configuration both', () => {
    let escaped: ReturnType<typeof createSpyFromClass<Cart>> | undefined = undefined;

    {
      using cart = createSpyFromClass(Cart);
      cart.total.calledWith().mockReturnValue(42);

      expect(cart.total()).toBe(42);
      expect(cart.total).toHaveBeenCalledTimes(1);

      escaped = cart;
    }

    expect(escaped.total).toHaveBeenCalledTimes(0);
    expect(escaped.total()).toBeUndefined();
  });

  it('is callable directly, and stays out of Object.keys, spread and JSON.stringify', () => {
    const cart = createSpyFromClass(Cart);
    cart.total.calledWith().mockReturnValue(7);

    expect(Object.keys(cart)).not.toContain('dispose');
    expect(Object.getOwnPropertySymbols({ ...cart })).not.toContain(Symbol.dispose);
    expect(JSON.stringify(cart)).not.toContain('dispose');
    // Stable identity: a `DisposableStack` and every `Disposable` check read the key twice.
    expect(cart[Symbol.dispose]).toBe(cart[Symbol.dispose]);

    cart[Symbol.dispose]();

    expect(cart.total()).toBeUndefined();
  });
});

describe('createSpyFromClass — strict mode', () => {
  it('throws naming the class, the method and the arguments', () => {
    const cart = createSpyFromClass(Cart, { strict: true });

    expect(() => cart.checkout(1, 'now')).toThrow(
      '[vitest-auto-spy] Nothing configured Cart.checkout, and strict mode is on.\n' +
        "Called as: Cart.checkout(1,'now')\n" +
        'Configure it — .mockReturnValue(…), .mockImplementation(…), .resolveWith(…), .nextWith(…) or .calledWith(…), ' +
        "or seed it through the 'returns' option — or drop 'strict' from this double.\n" +
        'Docs: https://asdalexey.github.io/vitest-auto-spy/core/strict-mode',
    );
  });

  it('renders a no-argument call as an empty argument list', () => {
    const cart = createSpyFromClass(Cart, { strict: true });

    expect(() => cart.total()).toThrow('Called as: Cart.total()');
  });

  it('counts every form of configuration as stubbed', async () => {
    const cart = createSpyFromClass(Cart, { strict: true, lazySpies: false });

    cart.total.mockReturnValue(1);
    cart.load.resolveWith(2);
    // Configured for *other* arguments: `calledWith` is a statement that the method is stubbed, and
    // the argument-level version of strictness is `mustBeCalledWith`, which reports both sides.
    cart.checkout.calledWith(1, 'now').mockReturnValue('one');

    expect(cart.total()).toBe(1);
    await expect(cart.load()).resolves.toBe(2);
    expect(cart.checkout(9, 'later')).toBeUndefined();
  });

  it('treats a rejected promise and a per-call sequence as configuration too', async () => {
    const rejecting = createSpyFromClass(Cart, { strict: true });
    rejecting.load.rejectWith('boom');
    await expect(rejecting.load()).rejects.toBe('boom');

    const perCall = createSpyFromClass(Cart, { strict: true });
    perCall.load.resolveWithPerCall([{ value: 5 }]);
    await expect(perCall.load()).resolves.toBe(5);
  });

  it('carries strict mode into the abstract-class fallback, which has no class name to print', () => {
    const storage = createSpyFromClass(Storage, { strict: true });

    expect(() => storage.read('k')).toThrow("Nothing configured read, and strict mode is on.\nCalled as: read('k')");
  });

  it('runs onUnstubbedCall instead of throwing, and uses what it returns', () => {
    const seen: string[] = [];
    const cart = createSpyFromClass(Cart, {
      onUnstubbedCall: ({ className, method, args }) => {
        seen.push(`${className}.${method}(${args.length})`);

        return 'fallback';
      },
    });

    expect(cart.checkout(1, 'now')).toBe('fallback');
    expect(seen).toEqual(['Cart.checkout(2)']);
  });

  it('prefers onUnstubbedCall over strict when both are given', () => {
    const handler = vi.fn();
    const cart = createSpyFromClass(Cart, { strict: true, onUnstubbedCall: handler });

    expect(() => cart.total()).not.toThrow();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('is off by default — an unconfigured method still answers undefined', () => {
    expect(createSpyFromClass(Cart).total()).toBeUndefined();
  });

  it('can be switched on globally, and switched off again per double', () => {
    setDefaultStrictMode({ strict: true, onUnstubbedCall: undefined });

    expect(() => createSpyFromClass(Cart).total()).toThrow('Nothing configured Cart.total');
    expect(createSpyFromClass(Cart, { strict: false }).total()).toBeUndefined();

    const handler = vi.fn(() => 'global');
    setDefaultStrictMode({ strict: undefined, onUnstubbedCall: handler });

    expect(createSpyFromClass(Cart).total()).toBe('global');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
