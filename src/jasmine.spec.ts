/**
 * The `vitest-auto-spy/jasmine` entry is a migration promise: the import line changes and the suite
 * still runs. These specs pin that promise at the four places a `jasmine-auto-spies` suite touches
 * it — the two factories, the DI provider, and `createSpyObj` — plus the one configuration key that
 * exists here only because upstream still accepts it.
 */
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { createFunctionSpy, createSpyFromClass, createSpyObj, jasmine, provideAutoSpy } from './jasmine';
import { resetJasmineSupport } from './lib/jasmine-support';

class AccountService {
  get owner(): string {
    return 'real';
  }

  load(id: number): string {
    return `real-${id}`;
  }
}

describe('vitest-auto-spy/jasmine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    // The entry registers process-wide; the shared-env run puts every file in one worker, and a spec
    // that proves a spy carries no `.and` must not inherit this file's registration.
    resetJasmineSupport();
  });

  it('re-exports the jasmine namespace, so one import restores the global', () => {
    expect({ id: 1 }).toEqual(jasmine.objectContaining({ id: jasmine.any(Number) }));
  });

  it('builds a class spy whose methods carry the jasmine namespaces', () => {
    const service = createSpyFromClass(AccountService);

    service.load.and.returnValue('stubbed');

    expect(service.load(1)).toBe('stubbed');
    expect(service.load.calls.count()).toBe(1);
    expect(service.load.calls.argsFor(0)).toEqual([1]);
  });

  it('accepts the bare method-name list, the other form upstream takes', () => {
    const service = createSpyFromClass(AccountService, ['load']);

    service.load.and.returnValue('listed');

    expect(service.load(1)).toBe('listed');
  });

  it('merges the deprecated providedMethodNames into methodsToSpyOn, warning once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const service = createSpyFromClass(AccountService, { methodsToSpyOn: ['load'], providedMethodNames: ['load'] });

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("'providedMethodNames' is deprecated");
    expect(typeof service.load).toBe('function');
  });

  it('accepts providedMethodNames on its own, with no methodsToSpyOn beside it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const service = createSpyFromClass(AccountService, { providedMethodNames: ['load'] });

    expect(warn).toHaveBeenCalledOnce();
    expect(typeof service.load).toBe('function');
  });

  it('leaves a configuration without providedMethodNames unwarned', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const service = createSpyFromClass(AccountService, { gettersToSpyOn: ['owner'] });
    service.accessorSpies.getters.owner.and.returnValue('spied');

    expect(warn).not.toHaveBeenCalled();
    expect(service.owner).toBe('spied');
  });

  it('builds a standalone function spy under an explicit signature', () => {
    const add = createFunctionSpy<(a: number, b: number) => number>('add');

    add.and.returnValue(7);

    expect(add(1, 2)).toBe(7);
    expect(add.and.identity).toBe('add');
  });

  it('provides a spy through a framework-agnostic { provide, useValue }', () => {
    const provider = provideAutoSpy(AccountService);

    provider.useValue.load.and.returnValue('provided');

    expect(provider.provide).toBe(AccountService);
    expect(provider.useValue.load(1)).toBe('provided');
  });

  describe('createSpyObj', () => {
    it('builds one spy per name, prefixed by the base name', () => {
      const store = createSpyObj('store', ['load', 'save']);

      store.load.and.returnValue('loaded');

      expect(store.load()).toBe('loaded');
      expect(store.load.and.identity).toBe('store.load');
      expect(typeof store.save).toBe('function');
    });

    it('seeds return values from the map form', () => {
      const clock = createSpyObj('clock', { now: 1700000000 });

      expect(clock.now()).toBe(1700000000);
    });

    it('accepts the base name being omitted, as jasmine does', () => {
      const store = createSpyObj(['load']);

      expect(store.load.and.identity).toBe('load');
    });

    it('seeds plain properties from the third argument, in both of its shapes', () => {
      const user = createSpyObj('user', ['save'], { id: 7 });
      const flags = createSpyObj('flags', ['read'], ['enabled']);
      const bare = createSpyObj(['read'], { region: 'eu' });

      expect(user.id).toBe(7);
      expect(flags.enabled).toBeUndefined();
      expect(bare.region).toBe('eu');
      expect(typeof user.save).toBe('function');
    });

    it('builds an object of properties alone, with no methods', () => {
      const config = createSpyObj('config', [], { region: 'eu' });

      expect(config.region).toBe('eu');
    });

    it('refuses to build an object with no spies on it', () => {
      expect(() => createSpyObj('store', [])).toThrow('no method names');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reproducing the untyped call a migrated JavaScript spec can still make.
      expect(() => (createSpyObj as any)('store')).toThrow('needs the method names');
    });
  });
});
