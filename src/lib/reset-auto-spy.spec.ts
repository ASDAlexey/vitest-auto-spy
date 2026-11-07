/**
 * `resetAutoSpy` / `clearAutoSpy` reset every spy inside an assembled auto-spy.
 * These specs cover both helpers across the spy shapes they must handle: eager
 * class spies, accessor spies (collected from the bag, not by triggering them),
 * lazy method spies (materialized vs un-accessed), and `createAutoMock` proxies
 * (which have no accessor bag).
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { createAutoMock } from './auto-mock';
import { createSpyFromClass } from './create-spy-from-class';
import { createFunctionSpy } from './function-spy';
import { createLazySpyProxy } from './lazy-spy-proxy';
import { registerMockAdapter } from './mock-adapter';
import { mockDeep } from './mock-deep';
import { clearAutoSpy, resetAutoSpy } from './reset-auto-spy';
import { rememberSpyRecord } from './spy-mark';
import { asInstance } from './spy-typing';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

class Svc {
  a(_n?: number): string {
    return 'a';
  }

  b(): string {
    return 'b';
  }

  get g(): string {
    return 'real';
  }

  set g(_value: string) {
    /* noop */
  }
}

describe('clearAutoSpy', () => {
  it('clears recorded calls while keeping configured return values', () => {
    const spy = createSpyFromClass(Svc);
    spy.a.calledWith(1).mockReturnValue('one');
    spy.a(1);

    clearAutoSpy(spy);

    expect(spy.a).toHaveBeenCalledTimes(0);
    expect(spy.a(1)).toBe('one');
  });

  it('works on a createAutoMock proxy (which has no accessor bag)', () => {
    const mock = createAutoMock<{ f(): number }>();
    mock.f();

    clearAutoSpy(mock);

    expect(mock.f).toHaveBeenCalledTimes(0);
  });

  it('keeps a native mockReturnValue (clear preserves configured return values)', () => {
    const spy = createSpyFromClass(Svc);
    spy.a.mockReturnValue('native');

    clearAutoSpy(spy);

    expect(spy.a()).toBe('native');
  });
});

describe('resetAutoSpy', () => {
  it('clears recorded calls and reverts configured return values', () => {
    const spy = createSpyFromClass(Svc);
    spy.a.calledWith(1).mockReturnValue('one');
    spy.a(1);

    resetAutoSpy(spy);

    expect(spy.a).toHaveBeenCalledTimes(0);
    expect(spy.a(1)).toBeUndefined();
  });

  it('reverts a native mockReturnValue set directly on the spy (not just calledWith config)', () => {
    const spy = createSpyFromClass(Svc);
    spy.a.mockReturnValue('native');
    expect(spy.a()).toBe('native');

    resetAutoSpy(spy);

    expect(spy.a()).toBeUndefined();
  });

  it('resets accessor spies collected from the bag (without triggering them)', () => {
    const spy = createSpyFromClass(Svc, { gettersToSpyOn: ['g'], settersToSpyOn: ['g'] });
    spy.g = 'x';
    void spy.g;
    expect(spy.accessorSpies.setters.g).toHaveBeenCalledTimes(1);

    resetAutoSpy(spy);

    expect(spy.accessorSpies.setters.g).toHaveBeenCalledTimes(0);
    expect(spy.accessorSpies.getters.g).toHaveBeenCalledTimes(0);
  });

  it('resets materialized lazy spies and skips un-accessed placeholders', () => {
    const spy = createSpyFromClass(Svc, { lazySpies: true });
    spy.a(1); // materialize + call `a`; `b` stays a lazy placeholder

    expect(() => resetAutoSpy(spy)).not.toThrow();
    expect(spy.a).toHaveBeenCalledTimes(0);
  });

  it('resets a spy reachable under two names once, rather than twice', () => {
    const spy = createSpyFromClass(Svc, { lazySpies: false });
    // An alias is how the same mock ends up reachable twice — a spec that hands one method around
    // under a second name, or a factory that seeds one. Visiting it twice is harmless for a reset
    // and would not be for a shape that closed a loop, which is what the visitor's guard is for.
    const aliased: Record<string, unknown> = spy;
    aliased['alias'] = spy.a;

    spy.a(1);

    resetAutoSpy(spy);

    expect(spy.a).toHaveBeenCalledTimes(0);
  });

  it('resets a spy a spec wrapped in a Proxy of its own', () => {
    const inner = createFunctionSpy<(n: number) => number>('inner');
    const wrapped = new Proxy(inner, {});
    inner.calledWith(1).mockReturnValue(2);

    resetAutoSpy({ wrapped });

    expect(inner(1)).toBeUndefined();
  });

  it('reaches a nested mockDeep child, not just the root node', () => {
    const api = mockDeep<{ repo: { user: { find(id: number): string } } }>();
    api.repo.user.find.calledWith(1).mockReturnValue('found');

    expect(api.repo.user.find(1)).toBe('found');

    resetAutoSpy(api);

    // Both halves matter: the call history of a node three levels down, and the `calledWith`
    // configuration that only this library's own reset hook can revert.
    expect(api.repo.user.find).toHaveBeenCalledTimes(0);
    expect(api.repo.user.find(1)).toBeUndefined();
  });

  it('clears a nested mockDeep child while keeping its configuration', () => {
    const api = mockDeep<{ repo: { load(): string } }>();
    api.repo.load.mockReturnValue('cached');
    api.repo.load();

    clearAutoSpy(api);

    expect(api.repo.load).toHaveBeenCalledTimes(0);
    expect(api.repo.load()).toBe('cached');
  });
});

describe('resetAutoSpy — configuration the host mock holds', () => {
  it('drops a pending mockReturnValueOnce, as vi.resetAllMocks() does', () => {
    const spy = createSpyFromClass(Svc);
    spy.a.mockReturnValueOnce('once');

    resetAutoSpy(spy);

    expect(spy.a(1)).toBeUndefined();
  });

  it('drops what an accessor spy was configured with', () => {
    const spy = createSpyFromClass(Svc, { gettersToSpyOn: ['g'] });
    spy.accessorSpies.getters.g.mockReturnValue('configured');

    expect(asInstance(spy).g).toBe('configured');

    resetAutoSpy(spy);

    expect(spy.accessorSpies.getters.g).toHaveBeenCalledTimes(0);
    expect(asInstance(spy).g).toBeUndefined();
  });

  it('leaves a getter spy usable after the reset', () => {
    const spy = createSpyFromClass(Svc, { gettersToSpyOn: ['g'] });

    resetAutoSpy(spy);
    spy.accessorSpies.getters.g.mockReturnValue('after');

    expect(asInstance(spy).g).toBe('after');
  });

  it('leaves a method spy answering its library dispatch, so calledWith still configures it', () => {
    const spy = createSpyFromClass(Svc);
    spy.a.calledWith(1).mockReturnValue('before');

    resetAutoSpy(spy);
    spy.a.calledWith(2).mockReturnValue('after');

    expect(spy.a(1)).toBeUndefined();
    expect(spy.a(2)).toBe('after');
  });
});

describe('resetAutoSpy on a registered proxy double', () => {
  it('walks the record behind the proxy instead of its traps', () => {
    const record: Record<string, unknown> = { kept: createFunctionSpy('kept') };
    const double = new Proxy(record, {
      ownKeys: (): never => {
        throw new Error('the walk went through the trap');
      },
    });
    rememberSpyRecord(double, record);
    (record['kept'] as () => void)();

    resetAutoSpy(double);

    expect(record['kept']).toHaveBeenCalledTimes(0);
  });

  it('resets the same spies a walk through the lazy traps reaches', () => {
    const record: Record<string, unknown> = {};
    const double = createLazySpyProxy(record, ['a', 'b', 'c', 'd'], undefined, false);
    rememberSpyRecord(double, record);
    const call = (key: string): void => (Reflect.get(double, key) as () => void)();
    const replaced = createFunctionSpy('replaced');

    call('a');
    call('b');
    double['c'] = replaced;
    call('c');
    Reflect.deleteProperty(double, 'b');
    Reflect.defineProperty(double, 'extra', { value: createFunctionSpy('extra'), enumerable: true, configurable: true });
    call('extra');

    resetAutoSpy(double);

    expect(double['a']).toHaveBeenCalledTimes(0);
    expect(replaced).toHaveBeenCalledTimes(0);
    expect(double['extra']).toHaveBeenCalledTimes(0);
    expect(Object.keys(record)).toEqual(['a', 'c', 'extra']);
  });
});
