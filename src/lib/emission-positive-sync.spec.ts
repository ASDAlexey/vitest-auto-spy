import { output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EMPTY, Subject, finalize, of, repeat, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { expectEmissionSync, expectEmissionsSync } from './emission-positive-sync';
import type { CallbackSubscribable, SubscribableLike } from './expect-emission';

describe('synchronous positive emissions', () => {
  it('returns a value, including undefined, without awaiting', () => {
    expect(expectEmissionSync(of(3))).toBe(3);
    expect(expectEmissionSync(of(undefined))).toBeUndefined();
    expect(expectEmissionsSync(of(1, 2), 2)).toStrictEqual([1, 2]);
  });

  it('subscribes to Angular outputs before the action and unsubscribes afterwards', () => {
    const changed = TestBed.runInInjectionContext(() => output<number>());

    expect(expectEmissionSync(changed, { advance: () => changed.emit(4) })).toBe(4);
    expect(
      expectEmissionsSync(changed, 2, {
        advance: () => {
          changed.emit(5);
          changed.emit(6);
        },
      }),
    ).toStrictEqual([5, 6]);
    changed.emit(7);
  });

  it('collects the whole action and fails on extra emissions', () => {
    const source = new Subject<number>();
    const finalized = vi.fn();

    expect(() =>
      expectEmissionSync(source.pipe(finalize(finalized)), {
        label: 'saved',
        advance: () => {
          source.next(1);
          source.next(2);
          source.next(3);
        },
      }),
    ).toThrow('expectEmissionSync(saved): expected exactly 1 synchronous emissions, received 2');
    expect(finalized).toHaveBeenCalledOnce();
    expect(source.observed).toBe(false);
  });

  it('stops even an infinite synchronous source after proving the count is wrong', () => {
    const finalized = vi.fn();

    expect(() => expectEmissionsSync(of(1).pipe(repeat(), finalize(finalized)), 2)).toThrow('received 3');
    expect(finalized).toHaveBeenCalledOnce();
  });

  it('reports silence and incomplete sequences and finalizes them', () => {
    const source = new Subject<number>();

    expect(() => expectEmissionSync(source)).toThrow('received 0');
    expect(source.observed).toBe(false);
    expect(() => expectEmissionsSync(of(1), 2)).toThrow('received 1');
    expect(() => expectEmissionSync(EMPTY)).toThrow('received 0');
  });

  it('runs the action even when the source has already completed', () => {
    const advance = vi.fn();

    expect(expectEmissionSync(of(1), { advance })).toBe(1);
    expect(advance).toHaveBeenCalledOnce();
  });

  it('selects matching emissions past skip and tears down the subscription', () => {
    const source = new Subject<number>();

    expect(
      expectEmissionsSync(source, 2, {
        skip: 1,
        until: (value) => value > 2,
        advance: () => {
          [9, 1, 3, 4].forEach((value) => source.next(value));
        },
      }),
    ).toStrictEqual([3, 4]);
    expect(source.observed).toBe(false);
  });

  it('reports source errors even after the expected values arrived', () => {
    const source = new Subject<number>();

    expect(() =>
      expectEmissionSync(source, {
        advance: () => {
          source.next(1);
          source.error('broken');
        },
      }),
    ).toThrow('the stream errored');
    expect(() => expectEmissionSync(throwError(() => new Error('bad')))).toThrow('bad');
    expect(source.observed).toBe(false);
  });

  it('preserves the cause and tears down when the action throws', () => {
    const source = new Subject<number>();
    const cause = new Error('action failed');
    let failure: unknown;

    try {
      expectEmissionSync(source, {
        advance: () => {
          source.next(1);
          throw cause;
        },
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ cause, message: expect.stringContaining('advance') });
    expect(source.observed).toBe(false);
  });

  it('reports a throwing predicate and does not run the action after rejection', () => {
    const advance = vi.fn();

    expect(() =>
      expectEmissionSync(of(1), {
        until: () => {
          throw new Error('predicate');
        },
        advance,
      }),
    ).toThrow('predicate');
    expect(advance).not.toHaveBeenCalled();
  });

  it('supports callback and observer subscriptions without rxjs', () => {
    const unsubscribe = vi.fn();
    const callback: CallbackSubscribable<string> = {
      subscribe: (next) => {
        next('ok');
        return { unsubscribe };
      },
    };
    const observer: SubscribableLike<number> = {
      subscribe: (listener) => {
        listener.next?.(2);
        return { unsubscribe };
      },
    };

    expect(expectEmissionSync(callback)).toBe('ok');
    expect(expectEmissionSync(observer)).toBe(2);
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });

  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid count %s before subscribing', (count) => {
    const subscribe = vi.fn();

    expect(() => expectEmissionsSync({ subscribe }, count)).toThrow('count must be a positive integer');
    expect(subscribe).not.toHaveBeenCalled();
  });
});
