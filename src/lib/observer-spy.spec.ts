/**
 * The observer-spy bridge is a compatibility promise, so these specs are written the way the
 * `@hirez_io/observer-spy` specs they replace are written — subscribe, let it happen, read the spy.
 *
 * The cases that are *not* a copy of upstream are the places this deliberately differs: `getValues()`
 * hands back a copy rather than its own live array, it is typed `T[]` rather than `any[]`, reading
 * past the end throws instead of quietly answering `undefined` from a signature that promised `T`,
 * and an unexpected error surfaces at the reader that asked rather than asynchronously at the
 * subscription — which is where rxjs 7 put upstream's rethrow.
 */
import { EMPTY, Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { ObserverSpy, subscribeSpyTo } from './observer-spy';

describe('subscribeSpyTo', () => {
  it('records values, completion and the subscription itself', () => {
    const spy = subscribeSpyTo(of('a', 'b'));

    expect(spy.getValues()).toEqual(['a', 'b']);
    expect(spy.getValuesLength()).toBe(2);
    expect(spy.getFirstValue()).toBe('a');
    expect(spy.getLastValue()).toBe('b');
    expect(spy.getValueAt(1)).toBe('b');
    expect(spy.receivedNext()).toBe(true);
    expect(spy.receivedComplete()).toBe(true);
    expect(spy.receivedError()).toBe(false);
    expect(spy.subscription.closed).toBe(true);
  });

  it('stops recording once unsubscribed', () => {
    const source$ = new Subject<number>();
    const spy = subscribeSpyTo(source$);

    source$.next(1);
    spy.unsubscribe();
    source$.next(2);

    expect(spy.getValues()).toEqual([1]);
  });

  it('releases the subscription at the end of a using block', () => {
    const source$ = new Subject<number>();
    let captured: { subscription: { closed: boolean } } | undefined;

    {
      using spy = subscribeSpyTo(source$);
      source$.next(1);
      captured = spy;
      expect(spy.subscription.closed).toBe(false);
    }

    expect(captured.subscription.closed).toBe(true);
  });

  describe('errors', () => {
    it('makes an unexpected error loud at the reader, not asynchronously at the subscription', () => {
      // Upstream rethrows from `error()`. Under rxjs 7 that goes through `reportUnhandledError`, so
      // it never reaches the subscribing line and lands as an unattributed unhandled error instead.
      const spy = subscribeSpyTo(throwError(() => new Error('boom')));

      expect(spy.receivedError()).toBe(true);
      expect(() => spy.getValues()).toThrow('was not configured to expect that');
      expect(() => spy.getValues()).toThrow('boom');
      expect(() => spy.getValuesLength()).toThrow('boom');
      expect(() => spy.getFirstValue()).toThrow('boom');
      expect(() => spy.getValueAt(0)).toThrow('boom');
      expect(() => spy.getLastValue()).toThrow('boom');
      expect(() => spy.receivedNext()).toThrow('boom');
      // The error is still readable — that is how a spec inspects what went wrong.
      expect(spy.getError()).toBeInstanceOf(Error);
    });

    it('carries the original error as the cause, so a matcher can still reach it', () => {
      const original = new Error('boom');
      const spy = subscribeSpyTo(throwError(() => original));

      expect(() => spy.getValues()).toThrow(expect.objectContaining({ cause: original }));
    });

    it('records the error instead when expectErrors is configured', () => {
      const spy = subscribeSpyTo(
        throwError(() => new Error('boom')),
        { expectErrors: true },
      );

      expect(spy.receivedError()).toBe(true);
      expect(spy.getError()).toBeInstanceOf(Error);
      expect(spy.receivedComplete()).toBe(false);
    });

    it('takes expectErrors() after construction too', () => {
      const source$ = new Subject<number>();
      const spy = subscribeSpyTo(source$);

      expect(spy.expectErrors()).toBe(spy);

      source$.error(new Error('later'));
      expect(spy.getError()).toBeInstanceOf(Error);
      // Declared expected, so the value readers stay open.
      expect(spy.getValues()).toEqual([]);
    });
  });

  describe('onComplete / onError', () => {
    it('resolves when the stream settles, and immediately when it already had', async () => {
      const source$ = new Subject<number>();
      const spy = subscribeSpyTo(source$);
      const pending = spy.onComplete();

      source$.complete();
      await expect(pending).resolves.toBeUndefined();
      // Already complete — this must not hang.
      await expect(spy.onComplete()).resolves.toBeUndefined();
    });

    it('takes a callback instead of a promise, in both directions', () => {
      const source$ = new Subject<number>();
      const spy = subscribeSpyTo(source$).expectErrors();
      const queued = vi.fn();
      const immediate = vi.fn();

      spy.onComplete(queued);
      expect(queued).not.toHaveBeenCalled();

      source$.complete();
      expect(queued).toHaveBeenCalledOnce();

      spy.onComplete(immediate);
      expect(immediate).toHaveBeenCalledOnce();
    });

    it('settles onError the same way, awaited and queued', async () => {
      const source$ = new Subject<number>();
      const spy = subscribeSpyTo(source$, { expectErrors: true });
      const queued = vi.fn();
      const pending = spy.onError();

      spy.onError(queued);
      source$.error(new Error('boom'));

      await expect(pending).resolves.toBeUndefined();
      expect(queued).toHaveBeenCalledOnce();
      await expect(spy.onError()).resolves.toBeUndefined();

      const immediate = vi.fn();
      spy.onError(immediate);
      expect(immediate).toHaveBeenCalledOnce();
    });
  });

  describe('what this does that upstream does not', () => {
    it('hands back a copy, so mutating what was read cannot corrupt the spy', () => {
      const spy = subscribeSpyTo(of('b', 'a'));

      spy.getValues().sort();

      expect(spy.getValues()).toEqual(['b', 'a']);
    });

    it('throws rather than answering undefined from a signature that promised a value', () => {
      const spy = subscribeSpyTo(EMPTY);

      expect(spy.receivedNext()).toBe(false);
      expect(spy.getLastValue()).toBeUndefined();
      expect(() => spy.getFirstValue()).toThrow('emitted nothing');
      expect(() => spy.getValueAt(0)).toThrow('emitted nothing');
      expect(() => spy.getValueAt(-1)).toThrow('emitted nothing');
    });
  });

  describe('ObserverSpy on its own', () => {
    it('works as a plain rxjs observer, which is how upstream is often used', () => {
      const observer = new ObserverSpy<number>({ expectErrors: true });

      of(1, 2).subscribe(observer);

      expect(observer.getValues()).toEqual([1, 2]);
      expect(observer.receivedComplete()).toBe(true);
      expect(observer.getError()).toBeUndefined();
    });
  });
});
