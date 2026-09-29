/**
 * `Spy<T>` takes its mock surface from `VitestAutoSpyMockTypes`; with a Vitest entry in the program
 * that is Vitest's own `MockInstance`, so a spy is assignable to it and carries its newer members.
 */
import type { MockInstance } from 'vitest';
import { describe, expectTypeOf, it } from 'vitest';

import type { Spy } from '../index';
import type { MockInstance as SpyMockInstance } from '../lib/mock-types';

class Service {
  load(id: string): Promise<string> {
    return Promise.resolve(id);
  }
}

declare const spy: Spy<Service>;

describe('mock flavour', () => {
  it('resolves to Vitest mock types where a Vitest entry is in the program', () => {
    expectTypeOf<SpyMockInstance<Service['load']>>().toEqualTypeOf<MockInstance<Service['load']>>();
    expectTypeOf(spy.load).toExtend<MockInstance<(id: string) => Promise<string>>>();
    expectTypeOf(spy.load.mockThrow).toBeFunction();
  });
});
