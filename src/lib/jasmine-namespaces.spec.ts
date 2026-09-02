/**
 * The `.and` / `.calls` / `.withArgs` namespaces exist so a `jasmine-auto-spies` suite runs before
 * it is rewritten, which makes their contract a compatibility one: every assertion here is written
 * the way the jasmine spec that produced it was written, and passes for the same reason.
 *
 * Two behaviours are pinned that upstream does *not* have, and both are deliberate:
 * `callThrough()` restores this library's dispatch (upstream has nothing to call through to, so it
 * silently yields `undefined`), and the namespaces are non-enumerable, so nothing that walks a
 * double's own keys — `resetAutoSpy` included — mistakes one for a member of the class.
 */
import { type Observable, firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createSpyFromClass } from './create-spy-from-class';
import { enableJasmineCompat } from './enable-jasmine';
import { createFunctionSpy } from './function-spy';
import { addJasmineNamespacesToFunctionSpy } from './jasmine-namespaces';
import { toThrownError } from './jasmine-namespaces';
import { resetJasmineSupport } from './jasmine-support';
import type { JasmineAccessorSpy, JasmineMethodSpy } from './jasmine-types';
import { type MockAdapter, type MockFn, registerMockAdapter } from './mock-adapter';
import { addObservableHelpersToCalledWithObject, addObservableHelpersToFunctionSpy, createObservablePropSpy } from './observable-spy';
import { registerObservableSupport } from './observable-support';
import { resetAutoSpy } from './reset-auto-spy';
import { vitestMockAdapter } from './vitest-adapter';

class AccountService {
  balance = 0;

  get owner(): string {
    return 'real';
  }

  set nickname(_value: string) {
    /* real */
  }

  load(id: number): string {
    return `real-${id}`;
  }

  save(id: number): Promise<string> {
    return Promise.resolve(`real-${id}`);
  }

  watch(_id: number): Observable<string> {
    return null as unknown as Observable<string>;
  }
}

/** A method spy seen through the jasmine surface — the cast the `/jasmine` entry does for a whole class. */
function asJasmine<Method extends (...args: never[]) => unknown>(spy: unknown): JasmineMethodSpy<Method> {
  return spy as JasmineMethodSpy<Method>;
}

/** The same, for an accessor spy: the core `Spy<T>` types the bag as plain mocks. */
function asJasmineAccessor(spy: unknown): JasmineAccessorSpy {
  return spy as JasmineAccessorSpy;
}

describe('jasmine namespaces', () => {
  beforeAll(() => {
    registerMockAdapter(vitestMockAdapter);
    registerObservableSupport({
      addToFunctionSpy: addObservableHelpersToFunctionSpy,
      addToCalledWithObject: addObservableHelpersToCalledWithObject,
      createPropSpy: createObservablePropSpy,
    });
    enableJasmineCompat();
  });

  afterAll(() => {
    // The jasmine registry is process-wide, and the shared-env run puts every file in one worker, so
    // a spec that proves a spy carries no `.and` must not inherit this file's registration.
    //
    // The *observable* registry is deliberately left installed. It is the suite-wide convention here
    // — `observable-spy.spec.ts` registers it and never resets — and files like `types.spec.ts` rely
    // on somebody having done so. Emptying it from an `afterAll` broke those with
    // `… .nextWith is not a function`, in a different file, under `isolate: false` only.
    // `core-standalone.spec.ts` is the one file that empties it, and it restores what it found.
    resetJasmineSupport();
  });

  describe('.and — the strategies', () => {
    it('answers with returnValue, callFake, stub and returnValues in turn', () => {
      const service = createSpyFromClass(AccountService);
      const load = asJasmine<AccountService['load']>(service.load);

      load.and.returnValue('stubbed');
      expect(service.load(1)).toBe('stubbed');

      load.and.callFake((id: number) => `faked-${id}`);
      expect(service.load(2)).toBe('faked-2');

      load.and.returnValues('first', 'second');
      expect([service.load(3), service.load(4), service.load(5)]).toEqual(['first', 'second', undefined]);

      load.and.stub();
      expect(service.load(6)).toBeUndefined();
    });

    it('throws a message, an Error and an error class', () => {
      const service = createSpyFromClass(AccountService);
      const load = asJasmine<AccountService['load']>(service.load);

      load.and.throwError('boom');
      expect(() => service.load(1)).toThrow('boom');

      const failure = new TypeError('given');
      load.and.throwError(failure);
      expect(() => service.load(1)).toThrow(failure);

      load.and.throwError(RangeError, 'out of range');
      expect(() => service.load(1)).toThrow(new RangeError('out of range'));
    });

    it('resolves through resolveTo and reports the spy name as identity', async () => {
      const service = createSpyFromClass(AccountService);
      const save = asJasmine<AccountService['save']>(service.save);

      save.and.resolveTo('done');

      await expect(service.save(1)).resolves.toBe('done');
      expect(save.and.identity).toBe('save');
    });

    it('returns the spy, so a strategy can be read back off the call', () => {
      const service = createSpyFromClass(AccountService);
      const load = asJasmine<AccountService['load']>(service.load);

      expect(load.and.returnValue('x')).toBe(service.load);
      expect(load.and.callThrough()).toBe(service.load);
    });

    it('restores the library dispatch on callThrough, so calledWith decides again', () => {
      const service = createSpyFromClass(AccountService);
      const load = asJasmine<AccountService['load']>(service.load);

      load.calledWith(7).returnValue('seven');
      expect(service.load(7)).toBe('seven');

      // A strategy replaces the implementation — in jasmine too, which is where the surprise comes from.
      load.and.returnValue('flat');
      expect(service.load(7)).toBe('flat');

      load.and.callThrough();
      expect(service.load(7)).toBe('seven');
    });

    it('re-publishes the promise and observable helpers the spy already carries', async () => {
      const service = createSpyFromClass(AccountService);
      const save = asJasmine<AccountService['save']>(service.save);
      const watch = asJasmine<AccountService['watch']>(service.watch);

      save.and.resolveWith('saved');
      await expect(service.save(1)).resolves.toBe('saved');

      watch.and.nextWith('watched');
      await expect(firstValueFrom(service.watch(1))).resolves.toBe('watched');
    });

    it('is the same object on every read, so a strategy set through it is not lost', () => {
      const load = createFunctionSpy<AccountService['load']>('load');

      expect(asJasmine<AccountService['load']>(load).and).toBe(asJasmine<AccountService['load']>(load).and);
    });
  });

  describe('.calls — the bookkeeping', () => {
    it('reports counts, arguments and the recorded calls', () => {
      const service = createSpyFromClass(AccountService);
      const load = asJasmine<AccountService['load']>(service.load);

      expect(load.calls.any()).toBe(false);
      expect(load.calls.count()).toBe(0);
      expect(load.calls.first()).toBeUndefined();
      expect(load.calls.mostRecent()).toBeUndefined();

      load.and.returnValue('v');
      service.load(1);
      service.load(2);

      expect(load.calls.any()).toBe(true);
      expect(load.calls.count()).toBe(2);
      expect(load.calls.argsFor(0)).toEqual([1]);
      expect(load.calls.argsFor(9)).toEqual([]);
      expect(load.calls.allArgs()).toEqual([[1], [2]]);
      // `object` is jasmine's `this` for the call, and the double is the receiver — the same value
      // jasmine records for `service.load(1)`.
      expect(load.calls.first()).toEqual({ object: service, args: [1], returnValue: 'v' });
      expect(load.calls.mostRecent()).toEqual({ object: service, args: [2], returnValue: 'v' });
      expect(load.calls.all()).toHaveLength(2);
      expect(load.calls.thisFor(0)).toBe(service);
    });

    it('clears the recorded calls on reset and keeps saveArgumentsByValue callable', () => {
      const service = createSpyFromClass(AccountService);
      const load = asJasmine<AccountService['load']>(service.load);

      service.load(1);
      load.calls.saveArgumentsByValue();
      load.calls.reset();

      expect(load.calls.count()).toBe(0);
    });
  });

  describe('.withArgs — jasmine’s argument-scoped configuration', () => {
    it('configures a sync return under both names', () => {
      const service = createSpyFromClass(AccountService);
      const load = asJasmine<AccountService['load']>(service.load);

      load.withArgs(1).and.returnValue('one');
      load.withArgs(2).and.mockReturnValue('two');

      expect(service.load(1)).toBe('one');
      expect(service.load(2)).toBe('two');
      expect(service.load(3)).toBeUndefined();
    });

    it('configures promise and observable results for exactly those arguments', async () => {
      const service = createSpyFromClass(AccountService);

      asJasmine<AccountService['save']>(service.save).withArgs(1).and.resolveWith('saved-one');
      asJasmine<AccountService['watch']>(service.watch).withArgs(2).and.nextWith('watched-two');

      await expect(service.save(1)).resolves.toBe('saved-one');
      await expect(firstValueFrom(service.watch(2))).resolves.toBe('watched-two');
    });
  });

  describe('accessor spies', () => {
    it('configures a getter through .and and records the setter through .calls', () => {
      const service = createSpyFromClass(AccountService, { gettersToSpyOn: ['owner'], settersToSpyOn: ['nickname'] });

      asJasmineAccessor(service.accessorSpies.getters.owner).and.returnValue('spied');
      expect(service.owner).toBe('spied');

      service.nickname = 'nick';
      expect(asJasmineAccessor(service.accessorSpies.setters.nickname).calls.allArgs()).toEqual([['nick']]);
    });

    it('has no dispatch to restore, so callThrough leaves the strategy in place', () => {
      const service = createSpyFromClass(AccountService, { gettersToSpyOn: ['owner'] });

      const owner = asJasmineAccessor(service.accessorSpies.getters.owner);

      owner.and.returnValue('spied');
      owner.and.callThrough();

      expect(service.owner).toBe('spied');
      expect(owner.and.identity).toBe('');
    });
  });

  describe('the namespaces themselves', () => {
    it('are invisible to anything that walks a double’s own keys', () => {
      const service = createSpyFromClass(AccountService);

      expect(Object.keys(service.load)).not.toContain('and');
      expect(Object.keys(service.load)).not.toContain('calls');
      expect(Object.keys(service.load)).not.toContain('withArgs');
    });

    it('survive resetAutoSpy, which reverts what a strategy configured', () => {
      const service = createSpyFromClass(AccountService);
      const load = asJasmine<AccountService['load']>(service.load);

      load.and.returnValue('before');
      resetAutoSpy(service);

      expect(service.load(1)).toBeUndefined();

      load.and.returnValue('after');
      expect(service.load(1)).toBe('after');
    });
  });

  describe('call bookkeeping the host records differently', () => {
    /**
     * A stand-in adapter that reads calls the way the `node:test` one does — `mock.calls` holds
     * `{ arguments, result }` entries rather than bare tuples, and there is no parallel `results`
     * array. Registering it is the only way to reach that branch from a Vitest run.
     */
    const nodeShapedAdapter: MockAdapter = {
      createMockFn: (): MockFn => (): void => undefined,
      spyOnGetter: (): MockFn => (): void => undefined,
      spyOnSetter: (): MockFn => (): void => undefined,
      getCalls: (mockFn: MockFn): readonly unknown[][] =>
        ((mockFn as unknown as { mock?: { calls?: { arguments: unknown[] }[] } }).mock?.calls ?? []).map((call) => call.arguments),
      reset: (): void => undefined,
      clear: (): void => undefined,
      restoreImplementation: (): void => undefined,
    };

    /** A bare callable wearing the bookkeeping shape under test, plus the namespaces. */
    function spyWithBookkeeping(mock?: unknown): { calls: { first(): unknown; thisFor(index: number): unknown } } {
      const fake = Object.assign(function fake(): void {}, mock === undefined ? {} : { mock });
      addJasmineNamespacesToFunctionSpy(fake, { name: 'fake', restoreDispatch: (): void => undefined });

      return fake as unknown as { calls: { first(): unknown; thisFor(index: number): unknown } };
    }

    afterEach(() => {
      registerMockAdapter(vitestMockAdapter);
    });

    it('reads the result off the call entry, the shape node:test records', () => {
      registerMockAdapter(nodeShapedAdapter);
      const spy = spyWithBookkeeping({ calls: [{ arguments: [1], result: 'from-node' }] });

      expect(spy.calls.first()).toEqual({ object: undefined, args: [1], returnValue: 'from-node' });
    });

    it('reports undefined rather than throwing when the runner records neither shape', () => {
      registerMockAdapter(nodeShapedAdapter);
      const spy = spyWithBookkeeping({ calls: [{ arguments: [1] }] });

      expect(spy.calls.first()).toEqual({ object: undefined, args: [1], returnValue: undefined });
      expect(spyWithBookkeeping().calls.thisFor(0)).toBeUndefined();
      expect(spyWithBookkeeping().calls.first()).toBeUndefined();
    });

    it('reports undefined when the runner keeps a mock record with no call history in it at all', () => {
      registerMockAdapter({ ...nodeShapedAdapter, getCalls: (): readonly unknown[][] => [[1]] });
      const spy = spyWithBookkeeping({ instances: [] });

      expect(spy.calls.first()).toEqual({ object: undefined, args: [1], returnValue: undefined });
    });
  });

  describe('toThrownError', () => {
    it('passes a non-string, non-callable value through untouched', () => {
      const value = { code: 500 };

      expect(toThrownError(value)).toBe(value);
    });
  });
});
