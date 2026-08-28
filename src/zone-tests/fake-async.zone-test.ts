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

/**
 * The shape every Angular spec has, reduced to the mechanism that makes it work.
 *
 * `TestBed.createComponent` in `beforeEach` forks an `NgZone` from whatever `Zone.current` is at that
 * moment, and keeps it for the life of the fixture. `fixture.detectChanges()` in the test then runs
 * inside that fork, so the timers a component schedules are scheduled *through* it.
 *
 * `fakeAsync` works by swapping a `FakeAsyncTestZoneSpec` into the `ProxyZoneSpec` of the zone the
 * test body runs in. If the hook and the test get **different** proxy zones, the fixture's `NgZone`
 * delegates up to the hook's — which nobody patched — and its timers stay real: `tick()` drives a
 * clock that has nothing on it, and the spec fails with an assertion about the value, with no zone
 * anywhere in the message.
 */
interface ForkableZone {
  fork(spec: { name: string }): ForkableZone;
  run<T>(callback: () => T): T;
}

describe('a zone forked by a hook, as Angular forks NgZone', () => {
  let ngZoneLike: ForkableZone;
  let fired: string[];

  beforeEach(() => {
    fired = [];
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `Zone` is a global from zone.js, which this project loads in its setup file rather than importing.
    ngZoneLike = (Reflect.get(globalThis, 'Zone') as { current: ForkableZone }).current.fork({ name: 'NgZone-like' });
  });

  it('schedules into the fake clock the test installed', fakeAsync(() => {
    ngZoneLike.run(() => {
      setTimeout(() => fired.push('from the fixture zone'), 200);
    });

    expect(fired).toEqual([]);

    tick(200);

    expect(fired).toEqual(['from the fixture zone']);
  }));

  it('starts each test with a clock of its own', fakeAsync(() => {
    ngZoneLike.run(() => {
      setTimeout(() => fired.push('from the fixture zone'), 200);
    });

    tick(100);
    expect(fired).toEqual([]);

    tick(100);
    expect(fired).toEqual(['from the fixture zone']);
  }));
});
