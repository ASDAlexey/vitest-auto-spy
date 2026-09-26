/**
 * `createSpyFromInstance` patches an object the test already holds, so everything worth pinning here
 * is about the object rather than about the double: that the caller's reference sees the spies, that
 * `Object.prototype` is left alone, that a member which refuses to be redefined is reported in this
 * library's words, and that the instance can be handed back real.
 */
import { type Observable, firstValueFrom } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createSpyFromInstance, restoreSpiedInstance } from './create-spy-from-instance';
import { setMisconfigurationReaction } from './misconfiguration';
import { registerMockAdapter } from './mock-adapter';
import {
  addObservableHelpersToCalledWithObject,
  addObservableHelpersToFunctionSpy,
  createFunctionSpyStream,
  createObservablePropSpy,
} from './observable-spy';
import { registerObservableSupport } from './observable-support';
import { resetAutoSpy } from './reset-auto-spy';
import { clearAutoSpyDefaults, registerAutoSpyDefaults } from './spy-defaults';
import type { ClassSpyConfiguration, ClassType, OnlyMethodKeysOf, Spy } from './types';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
  registerObservableSupport({
    addToFunctionSpy: addObservableHelpersToFunctionSpy,
    streamForFunctionSpy: createFunctionSpyStream,
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

  it('keeps its accessor spies through vi.restoreAllMocks()', () => {
    // The `restoreMocks: true` shape: the double is built and configured outside a `beforeEach`, and
    // the runner's restore runs before the test body. `mockAccessorsProp` journals the patch and
    // `createAccessorsSpies` redefines on top of it, so neither half is the runner's to undo — but
    // while the accessor spies came from `vi.spyOn` the restore silently put the journalled no-op
    // pair back and the configuration below stopped reaching the property.
    const client = new PaymentsClient();
    const spy = spyOn(client, { gettersToSpyOn: ['fees'] });

    spy.accessorSpies.getters.fees.mockReturnValue(9);

    vi.restoreAllMocks();

    expect(client.fees).toBe(9);
  });

  it('applies returns and seeds overrides', () => {
    const client = new PaymentsClient();
    const spy = spyOn(client, { returns: { refund: 'done' }, overrides: { amount: 42 } });

    expect(spy.refund('7')).toBe('done');
    expect(client.amount).toBe(42);
  });

  it('answers the instance itself from a selfReturning method, the reference the caller holds', () => {
    const client = new PaymentsClient();
    const spy = spyOn(client, { selfReturning: ['charge'] });

    expect(client.charge(1)).toBe(client);
    expect(spy.charge).toHaveBeenCalledWith(1);
  });

  it('names the class in a strict-mode failure', () => {
    const spy = spyOn(new PaymentsClient(), { strict: true });

    expect(() => spy.refund('7')).toThrow('PaymentsClient.refund(');
  });

  it('has no class to name on a null-prototype object', () => {
    const bare: { ping(): string } = Object.assign(Object.create(null) as object, { ping: (): string => 'x' });
    const spy = spyOn(bare, { onlyMethodsToSpyOn: ['ping'], strict: true });

    expect(() => spy.ping()).toThrow('ping(');
  });
});

describe('createSpyFromInstance — misconfiguration reports', () => {
  it('suggests the member a misspelled onlyMethodsToSpyOn entry most likely meant', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      spyOn(new PaymentsClient(), { onlyMethodsToSpyOn: ['refnud'] as unknown as ['refund'] });

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("onlyMethodsToSpyOn names 'refnud' (did you mean 'refund'?), not a method of PaymentsClient."),
      );
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('instanceMethodsToSpyOn'));
    } finally {
      warn.mockRestore();
    }
  });

  it('suggests the member a misspelled returns key most likely meant', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      spyOn(new PaymentsClient(), { returns: { refnd: 'x' } as never });

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "createSpyFromInstance(PaymentsClient): returns names 'refnd', not a method of PaymentsClient — did you mean 'refund'?",
        ),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('warns when onlyMethodsToSpyOn names a member the object does not have', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      spyOn(new PaymentsClient(), { onlyMethodsToSpyOn: ['refund', 'nope'] as unknown as ['refund'] });

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "createSpyFromInstance(PaymentsClient): onlyMethodsToSpyOn names 'nope', not a method of PaymentsClient. " +
            'The spy is there, but the code under test never calls it. If the constructor assigns it',
        ),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('stays quiet when the whitelist names an own callable field the class path cannot see', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const spy = spyOn(new PaymentsClient(), { onlyMethodsToSpyOn: ['charge'] });

      expect(vi.isMockFunction(spy.charge)).toBe(true);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('stays quiet on an object with no callable members, where the whitelist is the only description', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const dictionary: Record<string, () => void> = {};

      spyOn(dictionary, { onlyMethodsToSpyOn: ['nope'] });

      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('warns when a configured accessor names a method of the object', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      spyOn(new PaymentsClient(), { gettersToSpyOn: ['refund'] });

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "createSpyFromInstance(PaymentsClient): gettersToSpyOn/settersToSpyOn names 'refund', a method of PaymentsClient, " +
            "so the spied accessor put over it leaves nothing to call. Name it in methodsToSpyOn instead; for a signal() field read as a property, mockSignalProp(double, 'refund', initial).",
        ),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('warns when a configured accessor names an own callable field, which the class path could not see', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      spyOn(new PaymentsClient(), { settersToSpyOn: ['charge'] });

      expect(warn).toHaveBeenCalledWith(expect.stringContaining("names 'charge', a method of PaymentsClient"));
    } finally {
      warn.mockRestore();
    }
  });

  it('warns when returns or selfReturning name a method the call left real, and leaves it real', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const client = new PaymentsClient();
      const spy = spyOn(client, { onlyMethodsToSpyOn: ['refund'], returns: { ping: 'x', refund: 'done' }, selfReturning: ['charge'] });

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "createSpyFromInstance(PaymentsClient): returns / selfReturning names 'ping', 'charge', which this call left as the real PaymentsClient method",
        ),
      );
      expect(client.ping()).toBe('real-ping');
      expect(client.charge(1)).toBe('real-charge 1');
      expect(spy.refund('7')).toBe('done');
    } finally {
      warn.mockRestore();
    }
  });

  it('stays quiet for names the object carries as accessors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const spy = spyOn(new PaymentsClient(), { gettersToSpyOn: ['fees'], settersToSpyOn: ['limit'] });

      expect(spy.accessorSpies.getters.fees).toBeDefined();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('createSpyFromInstance — non-configurable members', () => {
  it('explains a non-enumerable, non-configurable method instead of failing with a bare TypeError', () => {
    const target: { send?: () => void } = {};
    const method = (): void => undefined;

    Object.defineProperty(target, 'send', { value: method, writable: true, configurable: false, enumerable: false });

    try {
      expect(() => createSpyFromInstance(target, { onlyMethodsToSpyOn: ['send'] })).toThrow(
        "[vitest-auto-spy] Cannot spy on 'send' in place: it is a non-configurable, non-enumerable own property",
      );
      expect(Reflect.get(target, 'send')).toBe(method);
    } finally {
      restoreSpiedInstance(target);
    }
  });

  it('spies a writable, non-configurable method that is already enumerable', () => {
    const target: { send: () => string } = {} as { send: () => string };

    Object.defineProperty(target, 'send', { value: () => 'real', writable: true, configurable: false, enumerable: true });

    const spy = createSpyFromInstance(target, { onlyMethodsToSpyOn: ['send'] });

    spy.send.mockReturnValue('spied');

    expect(target.send()).toBe('spied');

    restoreSpiedInstance(target);

    expect(target.send()).toBe('real');
  });
});

describe('createSpyFromInstance — live DOM/BOM objects', () => {
  afterEach(() => {
    setMisconfigurationReaction(undefined);
  });

  it('warns when discovery runs unrestricted on a live DOM node', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const el = document.createElement('div');

    try {
      createSpyFromInstance(el);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'createSpyFromInstance(HTMLDivElement): no onlyMethodsToSpyOn was given for a live DOM/BOM object, so every ' +
            "method the engine put on its prototype chain gets spied too, not just the class's own.",
        ),
      );
    } finally {
      restoreSpiedInstance(el);
      warn.mockRestore();
    }
  });

  it('stays quiet when onlyMethodsToSpyOn restricts discovery to the named methods', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const el = document.createElement('div');

    try {
      createSpyFromInstance(el, { onlyMethodsToSpyOn: ['addEventListener'] });

      expect(warn).not.toHaveBeenCalled();
    } finally {
      restoreSpiedInstance(el);
      warn.mockRestore();
    }
  });

  it('stays quiet for a plain object, which is never a live host object', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      spyOn(new PaymentsClient());

      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('fails at the call site, before anything is patched, when misconfiguration is set to throw', () => {
    setMisconfigurationReaction('throw');
    const el = document.createElement('div');
    const realAddEventListener = el.addEventListener;

    expect(() => createSpyFromInstance(el)).toThrow('no onlyMethodsToSpyOn was given for a live DOM/BOM object');
    expect(el.addEventListener).toBe(realAddEventListener);
  });

  it('says that a bare array adds to discovery rather than restricting it', () => {
    setMisconfigurationReaction('throw');
    const el = document.createElement('div');

    expect(() => createSpyFromInstance(el, ['focus'])).toThrow(
      'The methods listed (a bare array is methodsToSpyOn) are spied in addition to that discovery, not instead of it.',
    );
  });

  it.each([
    ['the global object', (): object => globalThis],
    ['an engine event target that is not a Node', (): object => new XMLHttpRequest()],
  ])('recognizes %s as a live host object', (_, create) => {
    setMisconfigurationReaction('throw');

    expect(() => createSpyFromInstance(create())).toThrow('no onlyMethodsToSpyOn was given for a live DOM/BOM object');
  });

  it.each([
    ['a user class extending EventTarget', (): object => new (class Emitter extends EventTarget {})()],
    ['a bare EventTarget', (): object => new EventTarget()],
    ['a literal with an addEventListener method', (): object => ({ addEventListener: (): void => undefined })],
    ['an object inheriting addEventListener from a literal', (): object => Object.create({ addEventListener: (): void => undefined })],
  ])('stays quiet for %s', (_, create) => {
    setMisconfigurationReaction('throw');
    const target = create();

    try {
      expect(() => createSpyFromInstance(target)).not.toThrow();
    } finally {
      restoreSpiedInstance(target);
    }
  });
});

describe('createSpyFromInstance — registered defaults', () => {
  it('applies the registration of the class the instance came from', () => {
    registerAutoSpyDefaults(PaymentsClient, { gettersToSpyOn: ['fees'] });

    try {
      const spy = spyOn(new PaymentsClient());

      expect(spy.accessorSpies.getters.fees).toBeDefined();
    } finally {
      clearAutoSpyDefaults();
    }
  });

  it('unions the registration lists and lets the call site win per key', () => {
    registerAutoSpyDefaults(PaymentsClient, { instanceMethodsToSpyOn: ['reload'], returns: { refund: 'registered' } });

    try {
      const spy = spyOn(new PaymentsClient(), { returns: { refund: 'caller' } });

      expect(vi.isMockFunction(spy.reload)).toBe(true);
      expect(spy.refund('7')).toBe('caller');
    } finally {
      clearAutoSpyDefaults();
    }
  });

  it('keeps every other member real when the call site lists its only methods', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    registerAutoSpyDefaults(PaymentsClient, {
      gettersToSpyOn: ['fees'],
      settersToSpyOn: ['limit'],
      instanceMethodsToSpyOn: ['charge'],
      overrides: { amount: 42 },
      returns: { ping: 'registered' },
      selfReturning: ['charge'],
    });

    try {
      const client = new PaymentsClient();
      const spy = spyOn(client, { onlyMethodsToSpyOn: ['refund'] });

      client.limit = 3;

      expect(client.fees).toBe(5);
      expect(client.amount).toBe(3);
      expect(client.charge(1)).toBe('real-charge 1');
      expect(client.ping()).toBe('real-ping');
      expect(spy.refund('7')).toBeUndefined();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      clearAutoSpyDefaults();
      warn.mockRestore();
    }
  });

  it('still lets the registration configure the methods the call site listed', () => {
    registerAutoSpyDefaults(PaymentsClient, { strict: true, returns: { refund: 'registered', ping: 'unused' }, selfReturning: ['ping'] });

    try {
      const client = new PaymentsClient();
      const spy = spyOn(client, { onlyMethodsToSpyOn: ['refund', 'ping', 'charge'], returns: { ping: 'caller' } });

      expect(spy.refund('7')).toBe('registered');
      expect(spy.ping()).toBe('caller');
      expect(() => spy.charge(1)).toThrow('PaymentsClient.charge(');
    } finally {
      clearAutoSpyDefaults();
    }
  });

  it('resolves no registration for a bare literal, a function or a null-prototype object', () => {
    const leak = { instanceMethodsToSpyOn: ['zzz'] } as unknown as ClassSpyConfiguration<object>;

    registerAutoSpyDefaults(Object as unknown as ClassType<object>, leak);
    registerAutoSpyDefaults(Function as unknown as ClassType<object>, leak);

    try {
      const literal = spyOn({ ping: () => 'x' });
      const fn = createSpyFromInstance(() => 'real');
      const rootless = spyOn(Object.create(null) as { send: () => string });

      expect(Object.hasOwn(literal, 'zzz')).toBe(false);
      expect(vi.isMockFunction(literal.ping)).toBe(true);
      expect(Object.hasOwn(fn, 'zzz')).toBe(false);
      expect(Object.hasOwn(rootless, 'zzz')).toBe(false);
    } finally {
      clearAutoSpyDefaults();
    }
  });
});

describe('createSpyFromInstance — members that refuse to be replaced', () => {
  it('explains a frozen instance instead of throwing a bare TypeError', () => {
    expect(() => createSpyFromInstance(Object.freeze(new PaymentsClient()))).toThrow(
      '[vitest-auto-spy] Cannot spy on this instance in place: it is not extensible, so its members cannot be replaced. ' +
        'The target is a frozen object.\n' +
        'A frozen object refuses every change. Hand the code under test a copy ({ ...object }) and spy on that, ' +
        'or a double built with createSpyFromClass.\n' +
        'Docs: https://asdalexey.github.io/vitest-auto-spy/core/create-spy-from-class',
    );
  });

  it('explains a non-configurable member, and leaves the members it did replace restorable', () => {
    const client = new PaymentsClient();
    Object.defineProperty(client, 'refund', { value: (): string => 'locked', configurable: false });
    spied.push(client);

    expect(() => createSpyFromInstance(client)).toThrow(
      "[vitest-auto-spy] Cannot mock the property 'refund': it is not configurable, so it cannot be redefined. " +
        'The target is an instance of PaymentsClient.\n' +
        'Build a double instead of patching the real instance: createSpyFromClass(PaymentsClient).\n' +
        'Docs: https://asdalexey.github.io/vitest-auto-spy/core/create-spy-from-class#accessor-spies-—-accessorspies',
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

describe('createSpyFromInstance — symbol-keyed members', () => {
  const RENDER = Symbol('render');

  it('spies a method the object carries under a symbol', () => {
    const widget = { [RENDER]: (): string => 'real' };

    const spy = createSpyFromInstance(widget);
    spy[RENDER].mockReturnValue('stubbed');

    expect(widget[RENDER]()).toBe('stubbed');
  });
});

describe('createSpyFromInstance — an object with no Object.prototype above it', () => {
  it('spies the methods of a null-prototype dictionary', () => {
    const registry = Object.create(null) as { send(payload: string): string };
    registry.send = (): string => 'real';

    const spy = createSpyFromInstance(registry);
    spy.send.mockReturnValue('stubbed');

    expect(registry.send('x')).toBe('stubbed');
    expect(vi.isMockFunction(registry.send)).toBe(true);
  });

  it('leaves the members of a foreign realm Object.prototype alone', () => {
    const alienObjectPrototype = Object.create(null) as Record<string, unknown>;
    alienObjectPrototype['hasOwnProperty'] = function hasOwnProperty(): boolean {
      return false;
    };

    const instance = Object.create(alienObjectPrototype) as { own(): string };
    instance.own = (): string => 'real';

    createSpyFromInstance(instance);

    expect(vi.isMockFunction(instance.own)).toBe(true);
    expect(vi.isMockFunction(alienObjectPrototype['hasOwnProperty'])).toBe(false);
  });
});
