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
});
