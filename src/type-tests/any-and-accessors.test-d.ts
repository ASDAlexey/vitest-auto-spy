/**
 * Two holes in `Spy<T>` that only a type-level test can see, both reported from migrations off
 * `jest-auto-spies`: a method returning `any` typed as a promise spy and nothing else, and the
 * `accessorSpies` bag typed so loosely that a getter accepted a value of the wrong type.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { createSpyFromClass } from '../auto-spy';

declare class Legacy {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the point of the fixture: a legacy service whose members are typed `any`.
  read(id: number): any;
  count(): number;
  get size(): number;
  set size(value: number);
}

describe('a method returning any', () => {
  it('keeps the sync configuration helpers on the calledWith chain', () => {
    const spy = createSpyFromClass(Legacy);

    expectTypeOf(spy.read.calledWith(1).mockReturnValue).toBeFunction();
    expectTypeOf(spy.read.calledWith(1).returnValue).toBeFunction();
    expectTypeOf(spy.read.mustBeCalledWith(1).mockReturnValue).toBeFunction();
  });

  it('keeps the promise and observable helpers too, since the runtime carries all of them', () => {
    const spy = createSpyFromClass(Legacy);

    expectTypeOf(spy.read.resolveWith).toBeFunction();
    expectTypeOf(spy.read.nextWith).toBeFunction();
    expectTypeOf(spy.read.calledWith(1).resolveWith).toBeFunction();
    expectTypeOf(spy.read.calledWith(1).nextWith).toBeFunction();
  });
});

describe('the accessorSpies bag', () => {
  it('types each half against the member it stands for', () => {
    const spy = createSpyFromClass(Legacy, { gettersToSpyOn: ['size'] });

    expectTypeOf(spy.accessorSpies.getters.size.mockReturnValue).toBeCallableWith(7);
    expectTypeOf(spy.accessorSpies.setters.size).toBeCallableWith(7);
  });

  it('rejects a stub of the wrong type', () => {
    const spy = createSpyFromClass(Legacy, { gettersToSpyOn: ['size'] });

    // @ts-expect-error -- `get size(): number` cannot answer a string
    spy.accessorSpies.getters.size.mockReturnValue('not a number');
    // @ts-expect-error -- the setter takes the member's own type
    spy.accessorSpies.setters.size('not a number');
  });

  it('keeps the recorded calls of a method-valued key readable', () => {
    const spy = createSpyFromClass(Legacy);

    expectTypeOf(spy.count).toBeCallableWith();
    expectTypeOf(spy.count()).toEqualTypeOf<number>();
  });
});
