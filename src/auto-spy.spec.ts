import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, ReplaySubject, of } from 'rxjs';
import { take } from 'rxjs/operators';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Public entries: core (`./index`), Angular helpers (`./angular`), and the rxjs
// layer (`./rxjs`) — importing the latter registers observable support (IoC).
import { injectSpy, mockAccessorsProp, mockReadonlyProp, mockReadonlyPropGetter, provideAutoSpy } from './angular';
import { type Spy, createFunctionSpy, createSpyFromClass, errorHandler } from './index';
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

  // Restriction semantics (matching jest-auto-spies): when `methodsToSpyOn` is
  // given, ONLY those methods are spied — other prototype methods are left out.
  it('restricts spying to the listed methods only', () => {
    const spy = createSpyFromClass(MyService, ['syncMethod']);
    expect(vi.isMockFunction(spy.syncMethod)).toBe(true);
    expect(vi.isMockFunction(spy.getObs)).toBe(false);
    expect(vi.isMockFunction(spy.baseMethod)).toBe(false);
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

  it('warns when a requested method is absent from the prototype (but not when all exist)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    createSpyFromClass(MyService, ['syncMethod', 'nope'] as unknown as ['syncMethod']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('nope'));

    warn.mockClear();
    createSpyFromClass(MyService, ['syncMethod']);
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
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

  it('autoSpyAccessors auto-discovers and spies every getter/setter', () => {
    const spy = createSpyFromClass(MyService, { autoSpyAccessors: true });

    spy.accessorSpies.getters.userName.mockReturnValue('Auto');
    expect(spy.userName).toBe('Auto');

    spy.userName = 'set';
    expect(spy.accessorSpies.setters.userName).toHaveBeenCalledWith('set');
  });

  it('calledWith matches asymmetric matchers (expect.any / objectContaining)', () => {
    const spy = createSpyFromClass(MyService);

    spy.syncMethod.calledWith(expect.any(Number)).mockReturnValue('num');
    expect(spy.syncMethod(7)).toBe('num');
    expect(spy.syncMethod('x' as unknown as number)).toBeUndefined();
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

  it('returns a { provide, useValue } shape', () => {
    const provider = provideAutoSpy(MyService);
    expect(provider.provide).toBe(MyService);
    expect(vi.isMockFunction(provider.useValue.syncMethod)).toBe(true);
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
});
