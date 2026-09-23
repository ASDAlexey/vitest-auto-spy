/**
 * `returns: { m: undefined }` says "configured, the caller ignores the answer" — for a strict double
 * whose method returns something nobody reads. Under `exactOptionalPropertyTypes` that was refused for
 * every return type that did not already include `undefined`.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { type Spy, createAutoMock, createSpyFromClass } from '../auto-spy';

class Snacks {
  open(message: string): { dismiss(): void } {
    return { dismiss: () => message.length };
  }
}

describe('returns: undefined', () => {
  it('is accepted for a method of any return type, and the value type is still checked', () => {
    expectTypeOf(createSpyFromClass(Snacks, { strict: true, returns: { open: undefined } })).toEqualTypeOf<Spy<Snacks>>();
    createAutoMock<Snacks>({}, { returns: { open: undefined } });

    // @ts-expect-error -- anything else still has to be what the method returns
    createSpyFromClass(Snacks, { returns: { open: 42 } });
  });
});
