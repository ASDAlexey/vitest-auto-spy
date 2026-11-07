/**
 * `spy-mark` brands the mocks this library creates and carries their
 * config-reset / clear hooks. Exercised directly so every branch (branded vs
 * plain, hook present vs absent, hook value not a function) is covered without
 * routing through the full spy factory.
 */
import { describe, expect, it, vi } from 'vitest';

import { createAutoMock } from './auto-mock';
import { createSpyFromClass } from './create-spy-from-class';
import { hooksOf, isAutoSpyLike, isMarkedMock, markAsMock, markAsStream, rememberSpyRecord, spyRecordOf, streamHooksOf } from './spy-mark';

describe('spy-mark', () => {
  it('isMarkedMock recognises branded functions only', () => {
    const fn = (): void => undefined;

    expect(isMarkedMock(fn)).toBe(false);

    markAsMock(fn);
    expect(isMarkedMock(fn)).toBe(true);

    expect(isMarkedMock({})).toBe(false);
    expect(isMarkedMock('x')).toBe(false);
  });

  it('hooksOf hands back the reset hook a mark carries, and nothing without one', () => {
    const withHooks = {};
    const reset = vi.fn();
    markAsMock(withHooks, { reset, clear: () => undefined });

    hooksOf(withHooks)?.reset();
    expect(reset).toHaveBeenCalledTimes(1);

    expect(hooksOf({})).toBeUndefined();
  });

  it('hooksOf hands back the clear hook a mark carries, and nothing without one', () => {
    const withHooks = {};
    const clear = vi.fn();
    markAsMock(withHooks, { reset: () => undefined, clear });

    hooksOf(withHooks)?.clear();
    expect(clear).toHaveBeenCalledTimes(1);

    expect(hooksOf({})).toBeUndefined();
  });

  it('treats a plain `true` mark, or an object that is not a pair of hooks, as carrying no hooks', () => {
    const plain = {};
    markAsMock(plain);
    expect(hooksOf(plain)).toBeUndefined();

    // Half a pair is not a pair: both hooks are required, so a stray object under the mark runs nothing.
    const halfway = { [Symbol.for('vitest-auto-spy.mock')]: { reset: vi.fn() } };
    expect(hooksOf(halfway)).toBeUndefined();

    const empty = { [Symbol.for('vitest-auto-spy.mock')]: {} };
    expect(hooksOf(empty)).toBeUndefined();
  });

  it('calls the hooks with the mark as receiver, which is how a function spy reaches its state', () => {
    const state = { count: 0 };
    const hooks = {
      count: 0,
      reset(): void {
        this.count += 1;
        state.count = this.count;
      },
      clear(): void {
        this.count += 10;
        state.count = this.count;
      },
    };
    const spy = {};
    markAsMock(spy, hooks);

    hooksOf(spy)?.reset();
    hooksOf(spy)?.clear();

    expect(state.count).toBe(11);
  });
});

describe('stream marks', () => {
  it('carries the hooks of a prop spy without branding it as a double', () => {
    const stream = {};
    const hooks = { reset: (): void => undefined, clear: (): void => undefined };
    markAsStream(stream, hooks);

    expect(streamHooksOf(stream)).toBe(hooks);
    expect(streamHooksOf({})).toBeUndefined();
    expect(isAutoSpyLike(stream)).toBe(false);
    expect(Object.keys(stream)).toEqual([]);
  });
});

describe('spy records', () => {
  it('answers the record a double was registered with, and the value itself otherwise', () => {
    const record = {};
    const double = new Proxy(record, {});
    rememberSpyRecord(double, record);

    expect(spyRecordOf(double)).toBe(record);
    expect(spyRecordOf(record)).toBe(record);
  });
});

describe('isAutoSpyLike', () => {
  class Cart {
    total(): number {
      return 0;
    }
  }

  it('recognises both factories', () => {
    expect(isAutoSpyLike(createSpyFromClass(Cart))).toBe(true);
    expect(isAutoSpyLike(createAutoMock<Cart>())).toBe(true);
  });

  it('does not mistake a real instance, a hand-rolled double or a primitive for one', () => {
    expect(isAutoSpyLike(new Cart())).toBe(false);
    expect(isAutoSpyLike({ total: vi.fn() })).toBe(false);
    expect(isAutoSpyLike(null)).toBe(false);
    expect(isAutoSpyLike('cart')).toBe(false);
  });

  it('is not fooled by an accessorSpies field that is not the bag', () => {
    expect(isAutoSpyLike({ accessorSpies: 'yes' })).toBe(false);
  });
});
