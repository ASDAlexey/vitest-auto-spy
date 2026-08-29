import { Injectable, InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, ReplaySubject, of } from 'rxjs';
import { take } from 'rxjs/operators';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Public entries: core (`./index`), Angular helpers (`./angular`), and the rxjs
// layer (`./rxjs`) — importing the latter registers observable support (IoC).
import {
  injectSpy,
  mockAccessorsProp,
  mockReadonlyProp,
  mockReadonlyPropGetter,
  mockValueProp,
  provideAutoSpy,
  provideAutoSpyForToken,
  restoreMockedProps,
} from './angular';
import { type Spy, createAutoMock, createFunctionSpy, createSpyFromClass, errorHandler } from './index';
import { createObservableWithValues } from './rxjs';

// ---------------------------------------------------------------------------
// Test subjects
// ---------------------------------------------------------------------------

class BaseService {
  baseMethod(): string {
    return 'base';
  }
}

@Injectable()
class MyService extends BaseService {
  things$: Observable<number> = of(1);
  theme!: string;

  // Instance-assigned callable: the shape of an Angular `signal()` field, an arrow-function
  // property or an ngrx `signalStore()` method. Never reachable through the prototype chain.
  readonly counter = (): number => 0;

  private _userName = 'real';

  syncMethod(_a?: number): string {
    return 'real';
  }

  getPromise(_a?: number): Promise<string> {
    return Promise.resolve('real');
  }

  getObs(_a?: number): Observable<number> {
    return of(1);
  }

  get userName(): string {
    return this._userName;
  }

  set userName(value: string) {
    this._userName = value;
  }
}

/** Subscribe and collect everything a (completing) stream produces. */
function collect<T>(obs: Observable<T>): Promise<{ values: T[]; error?: unknown; completed: boolean }> {
  return new Promise((resolve) => {
    const values: T[] = [];
    obs.subscribe({
      next: (v) => values.push(v),
      error: (error) => resolve({ values, error, completed: false }),
      complete: () => resolve({ values, completed: true }),
    });
  });
}

// ---------------------------------------------------------------------------
// createSpyFromClass
// ---------------------------------------------------------------------------

describe('createSpyFromClass', () => {
  it('spies on all prototype methods, including inherited ones', () => {
    const spy = createSpyFromClass(MyService);

    expect(vi.isMockFunction(spy.syncMethod)).toBe(true);
    expect(vi.isMockFunction(spy.getObs)).toBe(true);
    expect(vi.isMockFunction(spy.baseMethod)).toBe(true);
    // getters are NOT auto-spied as methods
    expect((spy as unknown as Record<string, unknown>)['userName']).toBeUndefined();
  });

  it('returns undefined from a method until configured', () => {
    const spy = createSpyFromClass(MyService);
    expect(spy.syncMethod()).toBeUndefined();
  });

  it('accepts an array of method names', () => {
    const spy = createSpyFromClass(MyService, ['syncMethod']);
    expect(vi.isMockFunction(spy.syncMethod)).toBe(true);
  });

  // Additive semantics, matching `jest-auto-spies`: prototype discovery already finds every method,
  // so a list only ever adds the callables discovery cannot see.
  it('adds the listed names to the auto-discovered prototype methods', () => {
    const spy = createSpyFromClass(MyService, ['syncMethod']);
    expect(vi.isMockFunction(spy.syncMethod)).toBe(true);
    expect(vi.isMockFunction(spy.getObs)).toBe(true);
    expect(vi.isMockFunction(spy.baseMethod)).toBe(true);
  });

  it('onlyMethodsToSpyOn restricts to the listed methods and drops the rest', () => {
    const spy = createSpyFromClass(MyService, { onlyMethodsToSpyOn: ['syncMethod'] });
    expect(vi.isMockFunction(spy.syncMethod)).toBe(true);
    expect(vi.isMockFunction(spy.getObs)).toBe(false);
    expect(vi.isMockFunction(spy.baseMethod)).toBe(false);
  });

  it('onlyMethodsToSpyOn still takes the additive lists on top', () => {
    const spy = createSpyFromClass(MyService, { onlyMethodsToSpyOn: ['syncMethod'], instanceMethodsToSpyOn: ['counter'] });
    expect(vi.isMockFunction(spy.syncMethod)).toBe(true);
    expect(vi.isMockFunction(spy.counter)).toBe(true);
    expect(vi.isMockFunction(spy.getObs)).toBe(false);
  });

  it('accepts a config object', () => {
    const spy = createSpyFromClass(MyService, {
      methodsToSpyOn: ['syncMethod'],
      observablePropsToSpyOn: ['things$'],
      gettersToSpyOn: ['userName'],
      settersToSpyOn: ['userName', 'theme'],
    });
    expect(vi.isMockFunction(spy.syncMethod)).toBe(true);
    expect(spy.things$).toBeInstanceOf(Observable);
    expect(spy.accessorSpies.getters.userName).toBeDefined();
    expect(spy.accessorSpies.setters.theme).toBeDefined();
  });

  it('warns about a name missing from the prototype only when the list restricts', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    createSpyFromClass(MyService, { onlyMethodsToSpyOn: ['syncMethod', 'nope'] as unknown as ['syncMethod'] });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('nope'));

    warn.mockClear();
    createSpyFromClass(MyService, { onlyMethodsToSpyOn: ['syncMethod'] });
    expect(warn).not.toHaveBeenCalled();

    // An additive list naming something off the prototype is the documented way to reach an
    // instance-assigned callable, so it must stay silent.
    createSpyFromClass(MyService, ['syncMethod', 'nope'] as unknown as ['syncMethod']);
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('installs configured return values as the spy is built', () => {
    const spy = createSpyFromClass(MyService, { returns: { syncMethod: 'configured' } });

    expect(spy.syncMethod()).toBe('configured');
  });

  it('warns when returns names something the spy does not have', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    createSpyFromClass(MyService, {
      onlyMethodsToSpyOn: ['syncMethod'],
      returns: { getPromise: Promise.resolve('x') },
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("returns names 'getPromise'"));
    warn.mockRestore();
  });

  it('warns when a named getter/setter would shadow a method of the class', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // The type no longer rejects a name by the type of its value — it cannot, without also
    // rejecting every signal-valued getter — so what is left is checked here.
    createSpyFromClass(MyService, { gettersToSpyOn: ['syncMethod'] });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('are methods of the class: syncMethod'));

    // A real accessor and a plain field are both legitimate, and neither is reported.
    warn.mockClear();
    createSpyFromClass(MyService, { gettersToSpyOn: ['userName'], settersToSpyOn: ['theme'] });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('instanceMethodsToSpyOn spies callables that live on the instance, on top of the prototype ones', () => {
    const spy = createSpyFromClass(MyService, { instanceMethodsToSpyOn: ['counter'] });

    expect(vi.isMockFunction(spy.counter)).toBe(true);
    // the prototype methods are still auto-discovered — the list adds, it does not restrict
    expect(vi.isMockFunction(spy.syncMethod)).toBe(true);
    expect(vi.isMockFunction(spy.baseMethod)).toBe(true);

    spy.counter.mockReturnValue(42);
    expect(spy.counter()).toBe(42);
  });

  it('treats methodsToSpyOn and instanceMethodsToSpyOn as the same additive list', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const spy = createSpyFromClass(MyService, { methodsToSpyOn: ['counter'], instanceMethodsToSpyOn: ['counter'] });

    expect(vi.isMockFunction(spy.counter)).toBe(true);
    expect(vi.isMockFunction(spy.syncMethod)).toBe(true);
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('builds method spies lazily by default, and eagerly when asked', () => {
    const lazy = createSpyFromClass(MyService);

    // Untouched: an accessor placeholder, so nothing has been allocated for this method yet.
    expect(Object.getOwnPropertyDescriptor(lazy, 'syncMethod')?.get).toBeTypeOf('function');
    expect(vi.isMockFunction(lazy.syncMethod)).toBe(true);

    const eager = createSpyFromClass(MyService, { lazySpies: false });
    const descriptor = Object.getOwnPropertyDescriptor(eager, 'syncMethod');

    expect(descriptor && 'value' in descriptor).toBe(true);
  });
  it('lazySpies materializes method spies on first access, keeping enumeration', () => {
    const spy = createSpyFromClass(MyService, { lazySpies: true });

    // enumerable placeholder before first access
    expect(Object.keys(spy)).toContain('syncMethod');

    expect(vi.isMockFunction(spy.syncMethod)).toBe(true);
    spy.syncMethod.calledWith(1).mockReturnValue('lazy');
    expect(spy.syncMethod(1)).toBe('lazy');
    // cached: same reference after materialization
    expect(spy.syncMethod).toBe(spy.syncMethod);
  });

  it('lazySpies placeholders stay assignable (spy.method = fn) before and after materialization', () => {
    const spy = createSpyFromClass(MyService, { lazySpies: true });
    // borrow correctly-typed spies from an eager instance of the same class
    const { syncMethod: replacement, getObs: other } = createSpyFromClass(MyService);

    replacement.mockReturnValue('assigned');

    // assignment before the getter ever ran — the placeholder must not be getter-only
    spy.syncMethod = replacement;
    expect(spy.syncMethod).toBe(replacement);
    expect(spy.syncMethod(1)).toBe('assigned');

    // and once materialized the property is a plain writable one
    expect(vi.isMockFunction(spy.getObs)).toBe(true);
    spy.getObs = other;
    expect(spy.getObs).toBe(other);
  });

  it('autoSpyAccessors auto-discovers and spies every getter/setter', () => {
    const spy = createSpyFromClass(MyService, { autoSpyAccessors: true });

    spy.accessorSpies.getters.userName.mockReturnValue('Auto');
    expect(spy.userName).toBe('Auto');

    spy.userName = 'set';
    expect(spy.accessorSpies.setters.userName).toHaveBeenCalledWith('set');
  });

  it('discovers the accessors once per class and still hands out separate spies', () => {
    const first = createSpyFromClass(MyService, { autoSpyAccessors: true });
    const second = createSpyFromClass(MyService, { autoSpyAccessors: true });

    // The names come from a per-prototype cache, the way method names already do; what the cache
    // must never do is let two spies of the same class share one accessor spy.
    expect(Object.keys(second.accessorSpies.getters)).toEqual(Object.keys(first.accessorSpies.getters));
    expect(second.accessorSpies.setters.userName).not.toBe(first.accessorSpies.setters.userName);

    first.accessorSpies.getters.userName.mockReturnValue('first');
    second.accessorSpies.getters.userName.mockReturnValue('second');

    expect(first.userName).toBe('first');
    expect(second.userName).toBe('second');
  });

  it('calledWith matches asymmetric matchers (expect.any / objectContaining)', () => {
    const spy = createSpyFromClass(MyService);

    spy.syncMethod.calledWith(expect.any(Number)).mockReturnValue('num');
    expect(spy.syncMethod(7)).toBe('num');
    expect(spy.syncMethod('x' as unknown as number)).toBeUndefined();
  });

  it('falls back to the type-driven proxy when the prototype names nothing', () => {
    // An abstract class is the case that matters: `abstract read()` is erased, so the chain ends
    // with an empty method set and the assembled `{}` would fail on the first call in production
    // code rather than in the spec.
    abstract class Storage {
      abstract read(key: string): string | null;
    }

    const storage = createSpyFromClass(Storage);

    storage.read.mockReturnValue('value');

    expect(storage.read('k')).toBe('value');
  });

  it('seeds `returns` on that fallback too', () => {
    abstract class Clock {
      abstract now(): number;
    }

    const clock = createSpyFromClass(Clock, { returns: { now: 42 } });

    expect(clock.now()).toBe(42);
  });

  it('keeps the assembled record when accessors are configured, empty prototype or not', () => {
    // An accessor list asks for something a proxy cannot provide — the `accessorSpies` bag and a
    // real getter/setter pair — so the record wins even with nothing on the prototype. Method lists
    // do not have that effect: the proxy answers every name anyway.
    abstract class Store {
      abstract items: string[];
    }

    const store = createSpyFromClass(Store, { gettersToSpyOn: ['items'] });

    store.accessorSpies.getters.items.mockReturnValue(['a']);

    expect(store.items).toEqual(['a']);
    expect(Object.keys(store)).toContain('accessorSpies');
  });

  it('keeps the assembled record when a restricting list is configured', () => {
    // `onlyMethodsToSpyOn` asks for the opposite of what the proxy provides — "these and no others,
    // so an unexpected call is loud" — and the proxy answers every key. Taking the fallback would
    // discard the whitelist without a word.
    abstract class Storage {
      abstract read(key: string): string | null;
      abstract write(key: string, value: string): void;
    }

    const storage = createSpyFromClass(Storage, { onlyMethodsToSpyOn: ['read'] });

    storage.read.mockReturnValue('value');

    expect(storage.read('k')).toBe('value');
    expect(storage.write).toBeUndefined();
  });

  it('does not report a whitelist as a typo when the prototype names nothing', () => {
    abstract class Storage {
      abstract read(key: string): string | null;
    }

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    createSpyFromClass(Storage, { onlyMethodsToSpyOn: ['read'] });

    // Every name would be "not on the prototype" here, and none of it is evidence of a typo: the
    // whitelist is the only way to describe an abstract class.
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('still reports a typo in a whitelist when the prototype does name something', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    createSpyFromClass(MyService, { onlyMethodsToSpyOn: ['getName', 'noSuchMethod'] as never });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('noSuchMethod'));

    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// `fillMissing` — a partially abstract class
// ---------------------------------------------------------------------------

describe('fillMissing', () => {
  abstract class LocalStorage {
    abstract read(key: string): string | null;
    abstract items: string[];
    clear(): void {}
  }

  it('leaves an abstract member absent by default', () => {
    // The empty-prototype fallback cannot fire here — `clear` is concrete, so discovery found
    // something — and `abstract read()` never reached a prototype to be found.
    const storage = createSpyFromClass(LocalStorage);

    expect(storage.clear).toBeTypeOf('function');
    expect(storage.read).toBeUndefined();
  });

  it('answers an abstract member with a spy when asked to', () => {
    const storage = createSpyFromClass(LocalStorage, { fillMissing: true });

    storage.read.mockReturnValue('value');

    expect(storage.read('k')).toBe('value');
    expect(storage.read).toHaveBeenCalledWith('k');
    expect(storage.clear).toBeTypeOf('function');
  });

  it('caches the spy it minted, so two reads are the same reference', () => {
    const storage = createSpyFromClass(LocalStorage, { fillMissing: true });

    expect(storage.read).toBe(storage.read);
  });

  it('names a filled member in `Object.keys` only once it has been read', () => {
    const storage = createSpyFromClass(LocalStorage, { fillMissing: true });

    expect(Object.keys(storage)).not.toContain('read');

    storage.read.mockReturnValue(null);

    expect(Object.keys(storage)).toContain('read');
  });

  it('leaves the record to answer a member it already has', () => {
    const storage = createSpyFromClass(LocalStorage, { fillMissing: true, returns: { clear: undefined } });

    // Reading through the wrapper must reach the record's own spy, not mint a second one over it.
    expect(storage.clear).toBe(storage.clear);
    expect(Object.keys(storage)).toContain('clear');
  });

  it('never mints a spy for a protocol key', () => {
    const storage = createSpyFromClass(LocalStorage, { fillMissing: true });
    const probed = storage as unknown as Record<string, unknown>;

    // Each of these is how some part of the machinery asks "what kind of object is this?".
    expect(probed['then']).toBeUndefined();
    expect(probed['toJSON']).toBeUndefined();
    expect(probed['asymmetricMatch']).toBeUndefined();
    expect(probed['$$typeof']).toBeUndefined();
    expect(probed['nodeType']).toBeUndefined();
    expect(Reflect.get(probed, Symbol.iterator)).toBeUndefined();
    expect(probed['constructor']).toBe(Object);
    expect(Object.keys(storage)).toEqual(['accessorSpies', 'clear']);
  });

  it('reads an inherited member from the prototype rather than shadowing it', () => {
    const storage = createSpyFromClass(LocalStorage, { fillMissing: true });

    expect(String(storage)).toBe('[object Object]');
    expect(Object.keys(storage)).not.toContain('toString');
  });
});

// ---------------------------------------------------------------------------
// Sync methods
// ---------------------------------------------------------------------------

describe('sync methods', () => {
  let spy: Spy<MyService>;
  beforeEach(() => (spy = createSpyFromClass(MyService)));

  it('supports native mockReturnValue', () => {
    spy.syncMethod.mockReturnValue('fake');
    expect(spy.syncMethod()).toBe('fake');
  });

  it('calledWith returns the configured value only for matching args', () => {
    spy.syncMethod.calledWith(1).mockReturnValue('one');
    expect(spy.syncMethod(1)).toBe('one');
    expect(spy.syncMethod(2)).toBeUndefined();
  });

  // `returnValue` is the `jest-auto-spies` alias of `mockReturnValue` — kept so
  // migrating tests are a pure import swap. Covers both chain entry points.
  it('returnValue alias configures calledWith and mustBeCalledWith', () => {
    spy.syncMethod.calledWith(1).returnValue('one');
    expect(spy.syncMethod(1)).toBe('one');

    spy.syncMethod.mustBeCalledWith(2).returnValue('two');
    expect(spy.syncMethod(2)).toBe('two');
  });

  it('mustBeCalledWith returns value for matching args', () => {
    spy.syncMethod.mustBeCalledWith(1).mockReturnValue('one');
    expect(spy.syncMethod(1)).toBe('one');
  });

  it('mustBeCalledWith throws when called with the wrong args', () => {
    spy.syncMethod.mustBeCalledWith(1).mockReturnValue('one');
    expect(() => spy.syncMethod(2)).toThrow(/actual arguments were/);
  });

  it('mustBeCalledWith throws when called without args', () => {
    spy.syncMethod.mustBeCalledWith(1).mockReturnValue('one');
    expect(() => spy.syncMethod()).toThrow(/without any arguments/);
  });

  // Regression (bug #2): `javascript-stringify` can return `undefined`; the
  // arg-key builder guards that (`?? ''`). An `undefined` argument must still
  // produce a stable, matchable key rather than crashing the key lookup.
  it('calledWith matches an undefined argument via a stable key', () => {
    expect(() => spy.syncMethod.calledWith(undefined).mockReturnValue('ok')).not.toThrow();
    expect(spy.syncMethod(undefined)).toBe('ok');
    expect(spy.syncMethod(1)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Promise methods
// ---------------------------------------------------------------------------

describe('promise methods', () => {
  let spy: Spy<MyService>;
  beforeEach(() => (spy = createSpyFromClass(MyService)));

  it('resolveWith', async () => {
    spy.getPromise.resolveWith('value');
    await expect(spy.getPromise()).resolves.toBe('value');
  });

  it('rejectWith', async () => {
    spy.getPromise.rejectWith('boom');
    await expect(spy.getPromise()).rejects.toBe('boom');
  });

  it('resolveWithPerCall (with and without delay)', async () => {
    spy.getPromise.resolveWithPerCall([{ value: 'a', delay: 1 }, { value: 'b' }]);
    expect(await spy.getPromise()).toBe('a');
    expect(await spy.getPromise()).toBe('b');
  });

  it('calledWith().resolveWith / rejectWith / resolveWithPerCall', async () => {
    spy.getPromise.calledWith(1).resolveWith('one');
    spy.getPromise.calledWith(2).rejectWith('err');
    spy.getPromise.calledWith(3).resolveWithPerCall([{ value: 'p1' }, { value: 'p2' }]);

    await expect(spy.getPromise(1)).resolves.toBe('one');
    await expect(spy.getPromise(2)).rejects.toBe('err');
    expect(await spy.getPromise(3)).toBe('p1');
    expect(await spy.getPromise(3)).toBe('p2');
  });
});

// ---------------------------------------------------------------------------
// Observable methods
// ---------------------------------------------------------------------------

describe('observable methods', () => {
  let spy: Spy<MyService>;
  beforeEach(() => (spy = createSpyFromClass(MyService)));

  it('nextWith', async () => {
    spy.getObs.nextWith(42);
    const r = await collect(spy.getObs().pipe(take(1)));
    expect(r.values).toEqual([42]);
  });

  it('nextOneTimeWith emits once then completes', async () => {
    spy.getObs.nextOneTimeWith(7);
    const r = await collect(spy.getObs());
    expect(r).toEqual({ values: [7], completed: true });
  });

  it('throwWith errors the stream', async () => {
    spy.getObs.throwWith('stream-error');
    const r = await collect(spy.getObs());
    expect(r.error).toBe('stream-error');
  });

  it('complete completes the stream', async () => {
    spy.getObs.complete();
    const r = await collect(spy.getObs());
    expect(r).toEqual({ values: [], completed: true });
  });

  it('returnSubject hands back the underlying subject', async () => {
    const subject = spy.getObs.returnSubject();
    subject.next(99);
    const r = await collect(spy.getObs().pipe(take(1)));
    expect(r.values).toEqual([99]);
  });

  it('nextWithValues emits a sequence of values, errors and completion', async () => {
    spy.getObs.nextWithValues([{ value: 1 }, { value: 2, delay: 1 }, { complete: true }]);
    const r = await collect(spy.getObs());
    expect(r).toEqual({ values: [1, 2], completed: true });
  });

  it('nextWithPerCall returns a subject per call', async () => {
    spy.getObs.nextWithPerCall([
      { value: 1, delay: 1 },
      { value: 2, doNotComplete: true },
    ]);
    const first = await collect(spy.getObs());
    const second = await collect(spy.getObs().pipe(take(1)));
    expect(first.values).toEqual([1]);
    expect(second.values).toEqual([2]);
  });

  it('calledWith().nextWith and nextWithPerCall', async () => {
    spy.getObs.calledWith(1).nextWith(11);
    spy.getObs.calledWith(5).nextWithPerCall([{ value: 1 }, { value: 2 }]);

    const matched = await collect(spy.getObs(1).pipe(take(1)));
    expect(matched.values).toEqual([11]);

    const a = await collect(spy.getObs(5));
    const b = await collect(spy.getObs(5));
    expect(a.values).toEqual([1]);
    expect(b.values).toEqual([2]);
  });

  // Regression (bug #1): a delayed per-call OBSERVABLE value must not be treated
  // as a Promise (the old code called `.then` on the Observable). It must still
  // emit the configured value after the delay instead of throwing.
  it('nextWithPerCall with a delayed observable value emits without calling .then', async () => {
    const subjects = spy.getObs.nextWithPerCall([{ value: 1, delay: 1 }]);
    expect(subjects).toHaveLength(1);
    const r = await collect(spy.getObs());
    expect(r.values).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// Observable properties
// ---------------------------------------------------------------------------

describe('observable properties', () => {
  it('nextWith', async () => {
    const spy = createSpyFromClass(MyService, { observablePropsToSpyOn: ['things$'] });
    spy.things$.nextWith(5);
    const r = await collect(spy.things$.pipe(take(1)));
    expect(r.values).toEqual([5]);
  });

  it('nextWithValues reconfigures the underlying subject', async () => {
    const spy = createSpyFromClass(MyService, { observablePropsToSpyOn: ['things$'] });
    spy.things$.nextWithValues([{ value: 9 }, { complete: true }]);
    const r = await collect(spy.things$);
    expect(r).toEqual({ values: [9], completed: true });
  });

  // Regression (bug #3): after `nextWithValues` swaps in a merged observable, a
  // later `nextWith` must still operate on the real backing Subject (the prop
  // spy keeps the Subject reference separate from the published stream).
  it('nextWith after nextWithValues still emits via the backing subject', async () => {
    const spy = createSpyFromClass(MyService, { observablePropsToSpyOn: ['things$'] });
    spy.things$.nextWithValues([{ value: 9 }]);
    spy.things$.nextWith(42);
    const r = await collect(spy.things$.pipe(take(1)));
    expect(r.values).toEqual([42]);
  });
});

// ---------------------------------------------------------------------------
// Getters / setters
// ---------------------------------------------------------------------------

describe('accessor spies', () => {
  it('spies on getters and setters', () => {
    const spy = createSpyFromClass(MyService, {
      gettersToSpyOn: ['userName'],
      settersToSpyOn: ['userName', 'theme'],
    });

    // unmocked getter calls through to the empty accessor → undefined
    expect(spy.userName).toBeUndefined();

    spy.accessorSpies.getters.userName.mockReturnValue('Fake Name');
    expect(spy.userName).toBe('Fake Name');

    spy.userName = 'New Name';
    expect(spy.accessorSpies.setters.userName).toHaveBeenCalledWith('New Name');

    spy.theme = 'dark';
    expect(spy.accessorSpies.setters.theme).toHaveBeenCalledWith('dark');
  });
});

// ---------------------------------------------------------------------------
// createObservableWithValues
// ---------------------------------------------------------------------------

describe('createObservableWithValues', () => {
  it('builds a completing observable from value configs', async () => {
    const obs = createObservableWithValues<number>([{ value: 1 }, { value: 2, delay: 1 }, { complete: true }]);
    const r = await collect(obs);
    expect(r).toEqual({ values: [1, 2], completed: true });
  });

  it('emits errors (immediate and delayed)', async () => {
    expect((await collect(createObservableWithValues([{ errorValue: 'e1' }]))).error).toBe('e1');
    expect((await collect(createObservableWithValues([{ errorValue: 'e2', delay: 1 }]))).error).toBe('e2');
  });

  it('supports a delayed completion', async () => {
    const r = await collect(createObservableWithValues<number>([{ complete: true, delay: 1 }]));
    expect(r).toEqual({ values: [], completed: true });
  });

  it('treats { complete: false } as a non-completing no-op entry', async () => {
    const obs = createObservableWithValues<number>([{ complete: false }, { value: 1 }, { complete: true }]);
    const r = await collect(obs);
    expect(r).toEqual({ values: [1], completed: true });
  });

  it('can return the underlying subject', async () => {
    const { values$, subject } = createObservableWithValues<number>([{ value: 1 }, { complete: true }], {
      returnSubject: true,
    });
    expect(subject).toBeInstanceOf(ReplaySubject);
    const r = await collect(values$);
    expect(r).toEqual({ values: [1], completed: true });
  });
});

// ---------------------------------------------------------------------------
// Empty-config edge cases (no-ops)
// ---------------------------------------------------------------------------

describe('empty *PerCall / *Values configs are no-ops', () => {
  let spy: Spy<MyService>;
  beforeEach(() => (spy = createSpyFromClass(MyService)));

  it('nextWithValues([])', () => {
    spy.getObs.nextWithValues([]);
    expect(spy.getObs()).toBeUndefined();
  });

  it('nextWithPerCall([]) returns no subjects', () => {
    expect(spy.getObs.nextWithPerCall([])).toEqual([]);
  });

  it('resolveWithPerCall([])', () => {
    spy.getPromise.resolveWithPerCall([]);
    expect(spy.getPromise()).toBeUndefined();
  });

  it('calledWith().resolveWithPerCall([])', () => {
    spy.getPromise.calledWith(1).resolveWithPerCall([]);
    expect(spy.getPromise(1)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createFunctionSpy (standalone)
// ---------------------------------------------------------------------------

describe('createFunctionSpy', () => {
  it('creates a named, configurable spy', () => {
    const fn = createFunctionSpy<(a: number) => string>('myFn');
    fn.calledWith(1).mockReturnValue('x');
    expect(fn(1)).toBe('x');
  });
});

// ---------------------------------------------------------------------------
// errorHandler
// ---------------------------------------------------------------------------

describe('errorHandler', () => {
  it('formats the actual arguments', () => {
    expect(() => errorHandler.throwArgumentsError([1, 'a'], 'fn')).toThrow(/actual arguments were: 1,'a'/);
  });

  it('handles a call without arguments', () => {
    expect(() => errorHandler.throwArgumentsError([], 'fn')).toThrow(/without any arguments/);
  });
});

// ---------------------------------------------------------------------------
// Angular helpers
// ---------------------------------------------------------------------------

describe('provideAutoSpy / injectSpy', () => {
  it('provides and injects a typed spy through TestBed', () => {
    TestBed.configureTestingModule({
      providers: [provideAutoSpy(MyService)],
    });

    const service = injectSpy(MyService);
    service.syncMethod.mockReturnValue('injected');
    expect(service.syncMethod()).toBe('injected');
  });

  it('warns when the injector hands back a real instance instead of a spy', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // The provider is the class itself, so DI builds the real service — the mistake this catches.
    class UnprovidedService {
      load(): string {
        return 'real';
      }
    }

    TestBed.configureTestingModule({ providers: [UnprovidedService] });
    injectSpy(UnprovidedService);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('the injector returned a plain instance'));

    // Once per token: the call sits in a `beforeEach`, and one warning per test would bury it.
    warn.mockClear();
    injectSpy(UnprovidedService);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('names an InjectionToken in that warning too', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const CONFIG = new InjectionToken<{ url: string }>('CONFIG');

    TestBed.configureTestingModule({ providers: [{ provide: CONFIG, useValue: { url: '/api' } }] });
    injectSpy(CONFIG);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('InjectionToken CONFIG'));
    warn.mockRestore();
  });

  it('provides a spy for a token whose type is an interface, with no class to read', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const PASSCODE = new InjectionToken<{ check(code: string): boolean }>('PASSCODE');

    TestBed.configureTestingModule({ providers: [provideAutoSpyForToken(PASSCODE, { check: () => true })] });

    const passcode = injectSpy(PASSCODE);

    expect(passcode.check('1234')).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('stays quiet for a token provided with a type-based auto-mock', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const LOGGER = new InjectionToken<{ log(message: string): void }>('LOGGER');

    TestBed.configureTestingModule({ providers: [{ provide: LOGGER, useValue: createAutoMock<{ log(message: string): void }>() }] });
    injectSpy(LOGGER);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('seeds properties and method results from the provider, in one statement', () => {
    // `returns` configures the spy; `overrides` seeds a member that is not a method result. Without
    // the pair, a double needing both was provided in one statement and finished in another — and
    // the shortcut people take instead is a module-scoped `const` provider, which under
    // `isolate: false` is one set of spies shared by every file that imports it.
    const events$ = new ReplaySubject<number>(1);

    TestBed.configureTestingModule({
      providers: [provideAutoSpy(MyService, { overrides: { things$: events$, theme: 'dark' }, returns: { syncMethod: 'seeded' } })],
    });

    const service = injectSpy(MyService);

    expect(service.syncMethod()).toBe('seeded');
    expect(service.things$).toBe(events$);
    expect(service.theme).toBe('dark');
  });

  it('seeds method results behind an InjectionToken too', async () => {
    const PRODUCTS = new InjectionToken<{ getProducts(): Observable<string[]> }>('PRODUCTS');

    TestBed.configureTestingModule({
      providers: [provideAutoSpyForToken(PRODUCTS, undefined, { returns: { getProducts: of(['a']) } })],
    });

    const products = injectSpy(PRODUCTS);

    // Still a spy — which is what seeding it through `overrides` would have thrown away.
    await expect(collect(products.getProducts())).resolves.toMatchObject({ values: [['a']] });
    expect(products.getProducts).toHaveBeenCalled();
  });

  it('takes an abstract class — the standard Angular DI-token shape', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // Production provides `{ provide: LocalStorage, useClass: BrowserLocalStorage }`, so the token
    // is a class with nothing on its prototype: every member is `abstract`, and `abstract` is
    // erased before emit. Both halves used to fail — the type rejected it, and a spy read off that
    // prototype would have been `{}`.
    abstract class AbstractStorage {
      abstract read(key: string): string | null;
    }

    abstract class LocalStorage extends AbstractStorage {
      abstract write(key: string, value: string): void;
    }

    // The config form is the one that used to be a hard `TS2345 Cannot assign an abstract
    // constructor type to a non-abstract constructor type` — i.e. the bare call compiled and was
    // useless, and the form that fixes it did not compile at all.
    TestBed.configureTestingModule({ providers: [provideAutoSpy(LocalStorage, { instanceMethodsToSpyOn: ['read'] })] });

    const storage = injectSpy(LocalStorage);
    storage.read.calledWith('token').mockReturnValue('abc');
    storage.write('token', 'abc');

    expect(storage.read('token')).toBe('abc');
    expect(storage.write).toHaveBeenCalledWith('token', 'abc');
    // The double is recognisably an auto-spy, so `injectSpy` does not report a missing provider.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns a { provide, useValue } shape', () => {
    const provider = provideAutoSpy(MyService);
    expect(provider.provide).toBe(MyService);
    expect(vi.isMockFunction(provider.useValue.syncMethod)).toBe(true);
  });

  it('defaults to lazy spies (materialized on first access) and honours lazySpies: false', () => {
    const lazy = provideAutoSpy(MyService).useValue;

    // Not yet touched: the method is a lazy accessor placeholder, not a data property.
    expect(Object.getOwnPropertyDescriptor(lazy, 'syncMethod')?.get).toBeTypeOf('function');

    // First access materializes the real spy and caches it as a data property.
    expect(vi.isMockFunction(lazy.syncMethod)).toBe(true);
    const materialized = Object.getOwnPropertyDescriptor(lazy, 'syncMethod');
    expect(materialized && 'value' in materialized).toBe(true);

    // Opt out: eager spies are materialized up-front, before any access.
    const eager = provideAutoSpy(MyService, { lazySpies: false }).useValue;
    const eagerDescriptor = Object.getOwnPropertyDescriptor(eager, 'syncMethod');
    expect(eagerDescriptor && 'value' in eagerDescriptor).toBe(true);
  });

  it('applies the lazy default across every argument form (array and config object)', () => {
    // Array of method names → still lazy.
    const fromArray = provideAutoSpy(MyService, ['syncMethod']).useValue;
    expect(Object.getOwnPropertyDescriptor(fromArray, 'syncMethod')?.get).toBeTypeOf('function');

    // Config object without an explicit lazySpies → default applies (lazy).
    const fromConfig = provideAutoSpy(MyService, { methodsToSpyOn: ['syncMethod'] }).useValue;
    expect(Object.getOwnPropertyDescriptor(fromConfig, 'syncMethod')?.get).toBeTypeOf('function');
  });
});

// ---------------------------------------------------------------------------
// Property mocking helpers
// ---------------------------------------------------------------------------

describe('property mocking helpers', () => {
  it('mockReadonlyProp sets a static value', () => {
    const obj = {} as { isReady: boolean };
    mockReadonlyProp(obj, 'isReady', true);
    expect(obj.isReady).toBe(true);
  });

  it('mockReadonlyPropGetter uses a dynamic getter', () => {
    const obj = {} as { label: string };
    let flag = false;
    mockReadonlyPropGetter(obj, 'label', () => (flag ? 'A' : 'B'));
    expect(obj.label).toBe('B');
    flag = true;
    expect(obj.label).toBe('A');
  });

  it('mockAccessorsProp installs spied get/set accessors', () => {
    const obj = {} as { theme: string };
    mockAccessorsProp(obj, 'theme');
    obj.theme = 'dark';
    void obj.theme;
    expect(obj.theme).toBeUndefined();
  });

  it('mockValueProp installs a plain writable value', () => {
    const obj = { size: 1 };

    mockValueProp(obj, 'size', 42);
    expect(obj.size).toBe(42);

    // unlike mockReadonlyProp, the code under test may assign to it
    obj.size = 7;
    expect(obj.size).toBe(7);
  });

  it('restoreMockedProps puts the original descriptors back, newest patch first', () => {
    const service = {
      label: 'real',
      get computedish(): string {
        return 'from getter';
      },
    };
    const descriptorBefore = Object.getOwnPropertyDescriptor(service, 'computedish');

    mockReadonlyProp(service, 'label', 'first');
    mockValueProp(service, 'label', 'second');
    mockReadonlyProp(service, 'computedish', 'mocked');

    expect(service.label).toBe('second');
    expect(service.computedish).toBe('mocked');

    restoreMockedProps();

    expect(service.label).toBe('real');
    expect(service.computedish).toBe('from getter');
    expect(Object.getOwnPropertyDescriptor(service, 'computedish')?.get).toBe(descriptorBefore?.get);
  });

  it('mockAccessorsProp accepts real get/set implementations and still records the calls', () => {
    const el = { text: 'initial' };

    mockAccessorsProp(el, 'text', {
      get: () => 'from getter',
      set: (value: never) => {
        seen = value;
      },
    });

    let seen: unknown;

    expect(el.text).toBe('from getter');

    el.text = 'written';
    expect(seen).toBe('written');

    const descriptor = Object.getOwnPropertyDescriptor(el, 'text');
    expect(vi.isMockFunction(descriptor?.get)).toBe(true);
    expect(descriptor?.set).toHaveBeenCalledWith('written');
  });

  it('every helper returns an undo for its own patch, without touching the others', () => {
    const service = { a: 'real-a', b: 'real-b' };

    const restoreA = mockReadonlyProp(service, 'a', 'mocked-a');
    mockValueProp(service, 'b', 'mocked-b');

    restoreA();
    expect(service.a).toBe('real-a');
    expect(service.b).toBe('mocked-b');

    // undoing twice is a no-op — the patch is gone from the log
    restoreA();
    expect(service.a).toBe('real-a');

    restoreMockedProps();
    expect(service.b).toBe('real-b');
  });

  it('restoreMockedProps deletes properties the helpers introduced, and is idempotent', () => {
    const host: { added?: string } = {};

    mockReadonlyProp(host, 'added', 'mocked');
    mockAccessorsProp(host, 'added');
    expect('added' in host).toBe(true);

    restoreMockedProps();
    expect('added' in host).toBe(false);

    // a second call has nothing left to undo
    expect(() => restoreMockedProps()).not.toThrow();
    expect('added' in host).toBe(false);
  });
});
