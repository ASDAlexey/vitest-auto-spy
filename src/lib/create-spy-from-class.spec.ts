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

import { applyReturns, createSpyFromClass } from './create-spy-from-class';
import { setDefaultStrictMode, takeStrictViolations } from './function-spy';
import { registerMockAdapter } from './mock-adapter';
import { resetAutoSpy } from './reset-auto-spy';
import { clearAutoSpyDefaults, registerAutoSpyDefaults } from './spy-defaults';
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
    let escaped: ReturnType<typeof createSpyFromClass<Cart>> | undefined;

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

  it('renders data in full up to a bound, and an instance by its class alone', () => {
    class Session {
      readonly token = 'secret';
    }

    class Till {
      ring(..._args: unknown[]): void {
        /* rings */
      }
    }

    const till = createSpyFromClass(Till, { strict: true });
    const bare = Object.create(Object.create(null));
    let message = '';

    try {
      till.ring(1, 'x'.repeat(300), new Session(), [1], new Date(0), document.createElement('div'), bare);
    } catch (error) {
      message = String(error);
    }

    const called = message.split('\n')[1] ?? '';

    expect(called).toContain(`Till.ring(1,'${'x'.repeat(199)}…,[Session],[1]`);
    expect(called).toContain('[HTMLDivElement],[object])');
    expect(called).not.toContain('secret');
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

  it('keeps a double that opted out with strict: false away from a global handler', () => {
    const handler = vi.fn(() => 'global');
    setDefaultStrictMode({ strict: undefined, onUnstubbedCall: handler });

    expect(createSpyFromClass(Cart, { strict: false }).total()).toBeUndefined();
    expect(createSpyFromClass(Cart, { strict: true }).total()).toBe('global');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('keeps a class registered with strict: false away from a global handler', () => {
    const handler = vi.fn(() => 'global');
    registerAutoSpyDefaults(Cart, { strict: false });
    setDefaultStrictMode({ strict: true, onUnstubbedCall: handler });

    try {
      expect(createSpyFromClass(Cart).total()).toBeUndefined();
      expect(handler).not.toHaveBeenCalled();
    } finally {
      clearAutoSpyDefaults(Cart);
    }
  });
});

describe('createSpyFromClass — returns is a default, not a wall', () => {
  it('leaves room for calledWith and resolveWith configured after it', async () => {
    const cart = createSpyFromClass(Cart, { returns: { checkout: 'default', load: Promise.resolve(0) } });

    cart.checkout.calledWith(1, 'now').mockReturnValue('now');
    cart.load.resolveWith(7);

    expect(cart.checkout(1, 'now')).toBe('now');
    expect(cart.checkout(2, 'later')).toBe('default');
    await expect(cart.load()).resolves.toBe(7);
  });

  it('configures a callable the library did not build through its implementation instead', () => {
    const host = { total: vi.fn(() => 1) };

    applyReturns(host, 'test', { total: 2 });

    expect(host.total()).toBe(2);
  });
});

describe('createSpyFromClass — selfReturning', () => {
  class QueryBuilder {
    where(_field: string): QueryBuilder {
      return this;
    }

    orderBy(_field: string): QueryBuilder {
      return this;
    }

    run(): number[] {
      return [];
    }
  }

  it.each([true, false, 'proxy'] as const)('answers the double itself from each named method (lazySpies: %s)', (lazySpies) => {
    const query = createSpyFromClass(QueryBuilder, { lazySpies, selfReturning: ['where', 'orderBy'], returns: { run: [1] } });

    expect(query.where('a').orderBy('b').run()).toEqual([1]);
    expect(query.where).toHaveBeenCalledWith('a');
    expect(query.orderBy).toHaveBeenCalledWith('b');
  });

  it('counts as configured under strict', () => {
    takeStrictViolations(); // earlier tests in this file leave theirs behind
    const query = createSpyFromClass(QueryBuilder, { strict: true, selfReturning: ['where'] });

    expect(query.where('a')).toBe(query);
    expect(() => query.run()).toThrow('Nothing configured QueryBuilder.run');
    expect(takeStrictViolations()).toHaveLength(1);
  });

  it('answers the fallback proxy for a class whose prototype names nothing', () => {
    const storage = createSpyFromClass(Storage, { selfReturning: ['read'] });

    expect(storage.read('key')).toBe(storage);
  });

  it('unions a registered chain with the call site, and lets the call site take a link out through returns', () => {
    const fixed = createSpyFromClass(QueryBuilder);

    registerAutoSpyDefaults(QueryBuilder, { selfReturning: ['where'] });

    try {
      const query = createSpyFromClass(QueryBuilder, { selfReturning: ['orderBy'], returns: { where: fixed } });

      expect(query.orderBy('b')).toBe(query);
      expect(query.where('a')).toBe(fixed);
    } finally {
      clearAutoSpyDefaults(QueryBuilder);
    }
  });

  it('says so, naming the option, when a name is not a spied method', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    createSpyFromClass(QueryBuilder, { onlyMethodsToSpyOn: ['run'], selfReturning: ['where'] });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("createSpyFromClass(QueryBuilder): selfReturning names 'where'"));
    warn.mockRestore();
  });
});

describe('createSpyFromClass — lazy placeholders', () => {
  it('shares one accessor pair between every double of the class, and still mints a spy per double', () => {
    const first = createSpyFromClass(Cart);
    const second = createSpyFromClass(Cart);

    const firstPlaceholder = Object.getOwnPropertyDescriptor(first, 'total');
    const secondPlaceholder = Object.getOwnPropertyDescriptor(second, 'total');

    expect(firstPlaceholder?.get).toBe(secondPlaceholder?.get);

    first.total.mockReturnValue(1);

    expect(first.total).not.toBe(second.total);
    expect(second.total()).toBeUndefined();
    expect(first.total()).toBe(1);
  });

  it('gives each double its own strict guard, materialised or not', () => {
    takeStrictViolations();
    const strict = createSpyFromClass(Cart, { strict: true });
    const lenient = createSpyFromClass(Cart);

    expect(lenient.total()).toBeUndefined();
    expect(() => strict.total()).toThrow('Nothing configured Cart.total');
    expect(takeStrictViolations()).toHaveLength(1);
  });

  it('materialises a method of a frozen double instead of throwing "Cannot redefine property"', () => {
    const cart = createSpyFromClass(Cart);
    Object.freeze(cart);

    const total = cart.total;

    expect(vi.isMockFunction(total)).toBe(true);
    expect(cart.total).toBe(total);

    cart.total.mockReturnValue(3);

    expect(cart.total()).toBe(3);
    expect(cart.total).toHaveBeenCalledTimes(1);
  });

  it('still writes the spy onto a double that is only non-extensible', () => {
    const cart = createSpyFromClass(Cart);
    Object.preventExtensions(cart);

    const total = cart.total;

    expect(vi.isMockFunction(total)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(cart, 'total')?.value).toBe(total);
  });

  it('keeps an assignment to a sealed double reaching the member it names', () => {
    const cart = createSpyFromClass(Cart);
    Object.seal(cart);
    const replacement = vi.fn(() => 5);

    cart.total = replacement as unknown as typeof cart.total;

    expect(cart.total).toBe(replacement);
  });
});

describe('createSpyFromClass — vi.spyOn on a method nobody has read yet', () => {
  it('wraps it instead of throwing "Invalid value used as weak map key"', () => {
    const cart = createSpyFromClass(Cart);

    const total = vi.spyOn(cart, 'total').mockReturnValue(3);

    expect(cart.total()).toBe(3);
    expect(total).toHaveBeenCalledTimes(1);
  });

  it("forwards an unconfigured call to the double's own spy, strict guard included", () => {
    takeStrictViolations();
    const cart = createSpyFromClass(Cart, { strict: true });
    const checkout = vi.spyOn(cart, 'checkout');

    expect(() => cart.checkout(1, 'now')).toThrow('Nothing configured Cart.checkout');
    expect(takeStrictViolations()).toHaveLength(1);

    checkout.mockRestore();

    expect(cart.checkout).toHaveBeenCalledWith(1, 'now');
    cart.checkout.calledWith(2, 'later').mockReturnValue('queued');
    expect(cart.checkout(2, 'later')).toBe('queued');
  });

  it('keeps one spy per double and per method behind the wrappers', () => {
    const first = createSpyFromClass(Cart);
    const second = createSpyFromClass(Cart);

    vi.spyOn(first, 'total');
    vi.spyOn(first, 'load');
    vi.spyOn(second, 'total');

    first.total();
    first.total();
    second.total();
    vi.restoreAllMocks();

    expect(first.total).toHaveBeenCalledTimes(2);
    expect(second.total).toHaveBeenCalledTimes(1);
    expect(first.load).not.toHaveBeenCalled();
  });

  it('names the problem when the wrapped method is called without its double', () => {
    const cart = createSpyFromClass(Cart);
    vi.spyOn(cart, 'total');
    const detached = cart.total;

    expect(() => Reflect.apply(detached, undefined, [])).toThrow("'total' was called off its double");
  });
});

describe('createSpyFromClass — prototypes the chain used to stop short of', () => {
  class NullRooted {}
  Object.setPrototypeOf(NullRooted.prototype, null);
  Object.defineProperty(NullRooted.prototype, 'send', { value: (): string => 'real', writable: true, configurable: true });

  it('spies the methods of a class whose prototype chain has no Object.prototype', () => {
    const spy = createSpyFromClass(NullRooted as unknown as new () => { send(): string });

    spy.send.mockReturnValue('stubbed');

    expect(spy.send()).toBe('stubbed');
  });

  it('still leaves Object.prototype members alone', () => {
    const cart = createSpyFromClass(Cart);

    expect(Object.keys(cart)).not.toContain('hasOwnProperty');
    expect(vi.isMockFunction(cart.hasOwnProperty)).toBe(false);
  });
});

const SERIALIZE = Symbol('serialize');

class Envelope {
  [SERIALIZE](): string {
    return 'real';
  }

  *[Symbol.iterator](): Generator<number> {
    yield 1;
  }

  size(): number {
    return 1;
  }
}

describe('createSpyFromClass — symbol-keyed methods', () => {
  it('spies a method the class declares under a symbol', () => {
    const envelope = createSpyFromClass(Envelope);

    envelope[SERIALIZE].mockReturnValue('stubbed');

    expect(envelope[SERIALIZE]()).toBe('stubbed');
    expect(envelope[SERIALIZE]).toHaveBeenCalledTimes(1);
  });

  it('resets it with the rest of the double', () => {
    const envelope = createSpyFromClass(Envelope);
    envelope[SERIALIZE].mockReturnValueOnce('once');
    envelope[SERIALIZE]();

    resetAutoSpy(envelope);

    expect(envelope[SERIALIZE]).toHaveBeenCalledTimes(0);
    expect(envelope[SERIALIZE]()).toBeUndefined();
  });

  it('leaves the runtime own symbols to the runtime', () => {
    const envelope = createSpyFromClass(Envelope);

    expect(Object.getOwnPropertyDescriptor(envelope, Symbol.iterator)).toBeUndefined();
  });

  it('answers it eagerly as well, and in proxy mode', () => {
    const eager = createSpyFromClass(Envelope, { lazySpies: false });
    const proxied = createSpyFromClass(Envelope, { lazySpies: 'proxy' });

    expect(vi.isMockFunction(eager[SERIALIZE])).toBe(true);
    expect(vi.isMockFunction(proxied[SERIALIZE])).toBe(true);
    expect(vi.isMockFunction(proxied.size)).toBe(true);
  });
});

describe('createSpyFromClass — overrides on the abstract-class fallback', () => {
  it('seeds the member without materialising an accessorSpies member beside it', () => {
    const storage = createSpyFromClass(Storage, { overrides: { read: () => 'seeded' } });

    expect(storage.read('key')).toBe('seeded');
    expect(Reflect.ownKeys(storage)).not.toContain('accessorSpies');
  });
});
