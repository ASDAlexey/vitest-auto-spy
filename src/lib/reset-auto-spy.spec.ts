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
import { registerMockAdapter } from './mock-adapter';
import { mockDeep } from './mock-deep';
import { clearAutoSpy, resetAutoSpy } from './reset-auto-spy';
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
