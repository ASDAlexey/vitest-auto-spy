/**
 * The failure this whole entry exists for: without the patch, every one of these dies with
 * `Expected to be running in 'ProxyZone', but it was not found` — a message about zones, in a test
 * that never mentions one.
 */
import { fakeAsync, flush, tick, waitForAsync } from '@angular/core/testing';

describe('fakeAsync under Vitest', () => {
  it('runs a timer synchronously', fakeAsync(() => {
    let fired = false;

    setTimeout(() => {
      fired = true;
    }, 1000);

    expect(fired).toBe(false);
    tick(1000);
    expect(fired).toBe(true);
  }));

  it('flushes what is left', fakeAsync(() => {
    const seen: number[] = [];

    setTimeout(() => seen.push(1), 10);
    setTimeout(() => seen.push(2), 20);
    flush();

    expect(seen).toEqual([1, 2]);
  }));

  it.each([5, 50])('works through it.each, at %i ms', (delay: number) =>
    fakeAsync(() => {
      let fired = false;

      setTimeout(() => {
        fired = true;
      }, delay);
      tick(delay);

      expect(fired).toBe(true);
    })(),
  );

  it('supports waitForAsync too', waitForAsync(() => {
    const resolved = Promise.resolve('ok');

    void resolved.then((value) => expect(value).toBe('ok'));
  }));
});

describe('hooks', () => {
  let prepared = false;

  beforeEach(fakeAsync(() => {
    setTimeout(() => {
      prepared = true;
    }, 1);
    tick(1);
  }));

  it('lets a hook use fakeAsync as well', () => {
    expect(prepared).toBe(true);
  });
});
