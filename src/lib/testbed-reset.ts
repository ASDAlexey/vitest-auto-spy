import { getTestBed } from '@angular/core/testing';

const WRAPPED_FOR = Symbol.for('vitest-auto-spy.testbed-reset.owner');
const WRAPS = Symbol.for('vitest-auto-spy.testbed-reset.inner');

// Read off the method the TestBed has now, not remembered: a spec that deletes the own
// `resetTestingModule` takes the wrapper with it, and a remembered "wrapped" would keep it off.
function isWrappedBy(method: unknown, owner: object): boolean {
  for (let current = method; typeof current === 'function'; current = Reflect.get(current, WRAPS)) {
    if (Reflect.get(current, WRAPPED_FOR) === owner) {
      return true;
    }
  }

  return false;
}

/**
 * Run `beforeReset` ahead of every reset of the `TestBed` instance — the one the static method,
 * `getTestBed()` and Angular's cleanup hook all go through. `owner` keeps each caller to one wrapper
 * in the chain, whoever wrapped on top of it.
 */
export function beforeTestBedReset(owner: object, beforeReset: () => void): void {
  const testBed = getTestBed();
  const original: unknown = Reflect.get(testBed, 'resetTestingModule');

  if (typeof original !== 'function' || isWrappedBy(original, owner)) {
    return;
  }

  const snapshotting = function snapshotting(this: unknown, ...args: unknown[]): unknown {
    try {
      beforeReset();
    } catch {
      // A snapshot is best-effort; the reset it precedes is not — a throw here used to skip the
      // reset and fail the *next* test with "the test module has already been instantiated".
    }

    return Reflect.apply(original, this, args);
  };

  Object.defineProperties(snapshotting, { [WRAPPED_FOR]: { value: owner }, [WRAPS]: { value: original } });
  Reflect.set(testBed, 'resetTestingModule', snapshotting);
}
