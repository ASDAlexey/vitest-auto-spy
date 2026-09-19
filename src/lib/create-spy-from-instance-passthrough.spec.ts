/**
 * `passthrough: true` is a third answer to "what does an unconfigured call do", next to `undefined`
 * and strict mode's refusal, so most of what is pinned here is precedence: which answer wins when
 * more than one is in play, and that the two that contradict each other on one call are refused.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createSpyFromInstance, restoreSpiedInstance } from './create-spy-from-instance';
import { enableJasmineCompat } from './enable-jasmine';
import { setDefaultStrictMode, takeStrictViolations } from './function-spy';
import { resetJasmineSupport } from './jasmine-support';
import type { JasmineMethodSpy } from './jasmine-types';
import { registerMockAdapter } from './mock-adapter';
import { clearAutoSpy, resetAutoSpy } from './reset-auto-spy';
import { clearAutoSpyDefaults, registerAutoSpyDefaults } from './spy-defaults';
import type { InstanceSpyConfiguration, OnlyMethodKeysOf, Spy } from './types';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

class BaseStore {
  describe(): string {
    return `store of ${this.name()}`;
  }

  name(): string {
    return 'base';
  }
}

class CartStore extends BaseStore {
  items: string[] = [];

  label = (prefix: string): string => `${prefix}:${this.items.length}`;

  add(item: string): number {
    this.items.push(item);

    return this.count();
  }

  count(): number {
    return this.items.length;
  }

  load(id: number): Promise<string> {
    return Promise.resolve(`real-${id}`);
  }

  fail(): never {
    throw new Error('real failure');
  }

  get total(): number {
    return this.items.length * 10;
  }

  ngOnDestroy(): void {
    this.items = [];
  }
}

/** Declares a method no instance carries, so passthrough has nothing real to run for it. */
class PhantomStore extends CartStore {
  declare extra: () => string;
}

const spied: object[] = [];

function spyOn<T extends object>(instance: T, config?: InstanceSpyConfiguration<T> | OnlyMethodKeysOf<T>[]): Spy<T> {
  spied.push(instance);

  return createSpyFromInstance(instance, config);
}

afterEach(() => {
  spied.splice(0).forEach(restoreSpiedInstance);
  setDefaultStrictMode(undefined);
  clearAutoSpyDefaults();
  takeStrictViolations();
});

describe('createSpyFromInstance — passthrough', () => {
  it('runs the real method for every unconfigured member and records the call', async () => {
    const cart = spyOn(new CartStore(), { passthrough: true });

    expect(cart.add('apple')).toBe(1);
    expect(cart.items).toEqual(['apple']);
    expect(cart.label('n')).toBe('n:1');
    expect(cart.describe()).toBe('store of base');
    await expect(cart.load(7)).resolves.toBe('real-7');

    expect(cart.add).toHaveBeenCalledWith('apple');
    expect(cart.label).toHaveBeenCalledWith('n');
    expect(cart.load.mock.results[0]?.type).toBe('return');
  });

  it('runs the real method with the instance as this, so its internal calls are recorded too', () => {
    const cart = spyOn(new CartStore(), { passthrough: true });
    const { add } = cart;

    expect(add('detached')).toBe(1);
    expect(cart.count).toHaveBeenCalledTimes(1);
    expect(cart.describe()).toBe('store of base');
    expect(cart.name).toHaveBeenCalledTimes(1);
  });

  it('lets the real method throw, and records the throw', () => {
    const cart = spyOn(new CartStore(), { passthrough: true });

    expect(() => cart.fail()).toThrow('real failure');
    expect(cart.fail.mock.results[0]?.type).toBe('throw');
  });

  it('hands a configured method over entirely, whichever helper configured it', async () => {
    const cart = spyOn(new CartStore(), { passthrough: true, returns: { count: 42 } });

    cart.load.resolveWith('fake');
    cart.name.mockReturnValue('fake-name');
    cart.add.calledWith('pear').mockReturnValue(99);

    expect(cart.count()).toBe(42);
    await expect(cart.load(1)).resolves.toBe('fake');
    expect(cart.describe()).toBe('store of fake-name');
    expect(cart.add('pear')).toBe(99);
    // A calledWith chain configures the method, not one argument list: the rest answers undefined.
    expect(cart.add('plum')).toBeUndefined();
    expect(cart.items).toEqual([]);
  });

  it('hands the real method back on resetAutoSpy, and keeps it through clearAutoSpy', () => {
    const cart = spyOn(new CartStore(), { passthrough: true });

    cart.count.mockReturnValue(5);
    cart.add('a');
    clearAutoSpy(cart);

    expect(cart.count()).toBe(5);
    expect(cart.add).not.toHaveBeenCalled();

    resetAutoSpy(cart);

    expect(cart.count()).toBe(1);
    expect(cart.add('b')).toBe(2);
  });

  it('puts the real methods back on restoreSpiedInstance', () => {
    const store = new CartStore();
    const original = store.label;

    spyOn(store, { passthrough: true });
    restoreSpiedInstance(store);

    expect(store.label).toBe(original);
    expect(Object.prototype.hasOwnProperty.call(store, 'add')).toBe(false);
  });

  it('leaves Angular lifecycle hooks real and unspied, so the framework teardown still runs', () => {
    const cart = spyOn(new CartStore(), { passthrough: true });

    cart.add('a');
    cart.ngOnDestroy();

    expect(cart.items).toEqual([]);
    expect(Object.prototype.hasOwnProperty.call(cart, 'ngOnDestroy')).toBe(false);
  });

  it('leaves a discovered callable with an API of its own real, and spies it only when named', () => {
    let value = 0;
    const counter = Object.assign(() => value, {
      set: (next: number): void => {
        value = next;
      },
    });
    const discovered = spyOn({ counter, bump: (): number => (counter.set(counter() + 1), counter()) }, { passthrough: true });

    expect(discovered.bump()).toBe(1);
    expect(discovered.counter).toBe(counter);

    const named = spyOn({ counter }, { passthrough: true, methodsToSpyOn: ['counter'] });

    expect(named.counter()).toBe(1);
    expect(named.counter).toHaveBeenCalledTimes(1);
  });

  it('leaves a discovered class real, and makes a named one a plain double, having no way to construct it', () => {
    class Worker {
      readonly kind = 'real';
    }

    const discovered = spyOn({ Worker }, { passthrough: true });

    expect(new discovered.Worker().kind).toBe('real');

    // A constructor typed as callable, as a legacy factory declaration is: its prototype is locked like a class's.
    const legacyFactory = Object.defineProperty((): string => 'real', 'prototype', { value: {}, writable: false });
    const named = spyOn({ legacyFactory }, { passthrough: true, methodsToSpyOn: ['legacyFactory'] });

    expect(named.legacyFactory()).toBeUndefined();
  });

  it('spies a copy of a module namespace, the form a module mock factory hands back', async () => {
    const real = await import('./plain-record');
    const mocked = spyOn({ ...real }, { passthrough: true });

    expect(mocked.isPlainRecord({})).toBe(true);
    expect(mocked.isPlainRecord).toHaveBeenCalledTimes(1);
  });

  it('keeps named accessors as plain doubles', () => {
    const cart = spyOn(new CartStore(), { passthrough: true, gettersToSpyOn: ['total'] });

    cart.add('a');

    expect(cart.total).toBeUndefined();

    cart.accessorSpies.getters.total.mockReturnValue(3);

    expect(cart.total).toBe(3);
  });

  it('answers undefined from a named member the object does not carry, having no real method to run', () => {
    const cart = spyOn(new PhantomStore(), { passthrough: true, methodsToSpyOn: ['extra'] });

    expect(cart.extra()).toBeUndefined();
  });

  it('is off for the array form and for passthrough: false', () => {
    expect(spyOn(new CartStore(), ['label']).count()).toBeUndefined();
    expect(spyOn(new CartStore(), { passthrough: false }).count()).toBeUndefined();
  });
});

describe('createSpyFromInstance — passthrough against strict mode', () => {
  it('refuses an explicit strict: true on the same call', () => {
    expect(() => spyOn(new CartStore(), { passthrough: true, strict: true })).toThrow(
      /'passthrough: true' together with 'strict: true'[\s\S]*core\/strict-mode/,
    );
  });

  it('refuses an explicit onUnstubbedCall on the same call', () => {
    expect(() => spyOn(new CartStore(), { passthrough: true, onUnstubbedCall: () => 'handled' })).toThrow(
      /'passthrough: true' together with 'onUnstubbedCall'/,
    );
  });

  it('accepts strict: false beside it, which says the same thing', () => {
    expect(spyOn(new CartStore(), { passthrough: true, strict: false }).count()).toBe(0);
  });

  it('wins over a suite-wide strict default for the members it can run', () => {
    setDefaultStrictMode({ strict: true, onUnstubbedCall: undefined });

    const cart = spyOn(new PhantomStore(), { passthrough: true, methodsToSpyOn: ['extra'] });

    expect(cart.count()).toBe(0);
    // Nothing real to run, so the suite-wide policy still decides this one.
    expect(() => cart.extra()).toThrow(/Nothing configured PhantomStore\.extra/);
  });

  it('wins over a suite-wide handler for the members it can run', () => {
    const handler = vi.fn(() => 'handled');

    setDefaultStrictMode({ strict: undefined, onUnstubbedCall: handler });

    expect(spyOn(new CartStore(), { passthrough: true }).count()).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it('wins over a strict registration for the instance class', () => {
    registerAutoSpyDefaults(CartStore, { strict: true });

    expect(spyOn(new CartStore(), { passthrough: true }).count()).toBe(0);
    expect(() => spyOn(new CartStore()).count()).toThrow(/Nothing configured CartStore\.count/);
  });
});

describe('createSpyFromInstance — passthrough with the jasmine namespaces', () => {
  beforeAll(() => {
    enableJasmineCompat();
  });

  afterAll(() => {
    resetJasmineSupport();
  });

  it('goes back to the real method on and.callThrough()', () => {
    const cart = spyOn(new CartStore(), { passthrough: true });
    const count = cart.count as unknown as JasmineMethodSpy<() => number>;

    count.and.returnValue(7);

    expect(cart.count()).toBe(7);

    count.and.callThrough();

    expect(cart.count()).toBe(0);
  });
});
