import { getTestBed } from '@angular/core/testing';

/**
 * Run `beforeReset` ahead of every reset of the `TestBed` instance — the one the static method,
 * `getTestBed()` and Angular's cleanup hook all go through. `wrapped` keeps each caller to one wrapper.
 */
export function beforeTestBedReset(wrapped: WeakSet<object>, beforeReset: () => void): void {
  const testBed = getTestBed();
  const original: unknown = Reflect.get(testBed, 'resetTestingModule');

  if (typeof original !== 'function' || wrapped.has(testBed)) {
    return;
  }

  wrapped.add(testBed);
  Reflect.set(testBed, 'resetTestingModule', function snapshotting(this: unknown, ...args: unknown[]): unknown {
    beforeReset();

    return Reflect.apply(original, this, args);
  });
}
