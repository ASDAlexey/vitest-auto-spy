/**
 * The `accessorSpies` bag keyed by the configured accessor lists.
 *
 * The runtime builds the bag from `gettersToSpyOn` / `settersToSpyOn` alone, so the total bag
 * `Spy<T>` used to offer a callable `Mock` for every member of `T`: on `createSpyFromClass(Storage)`
 * with no `settersToSpyOn`, `spy.accessorSpies.setters.name` compiled and read `undefined` at
 * runtime. `SpyOptions` now carries the configured lists through to the bag, and these tests pin
 * every shape it can take — narrowed, mirrored, empty, and both fallbacks.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type { Mock } from 'vitest';

import { createSpyFromClass } from '../auto-spy';
import type { AddAccessorsSpies, Spy } from '../auto-spy';

declare class Thermo {
  read(): number;
  get level(): number;
  set level(value: number);
  get unit(): string;
}

describe('a bag narrowed by the configured lists', () => {
  it('types a configured getter against its member', () => {
    const spy = createSpyFromClass<Thermo, { gettersToSpyOn: ['level'] }>(Thermo, { gettersToSpyOn: ['level'] });

    expectTypeOf(spy.accessorSpies.getters.level).toEqualTypeOf<Mock<() => number>>();
    expectTypeOf(spy.accessorSpies.getters.level.mockReturnValue).toBeCallableWith(7);
    // @ts-expect-error -- `get level(): number` cannot answer a string
    spy.accessorSpies.getters.level.mockReturnValue('boiling');
  });

  it('types a configured setter with the member as its parameter', () => {
    const spy = createSpyFromClass<Thermo, { settersToSpyOn: ['level'] }>(Thermo, { settersToSpyOn: ['level'] });

    expectTypeOf(spy.accessorSpies.setters.level).toEqualTypeOf<Mock<(value: number) => void>>();
    expectTypeOf(spy.accessorSpies.setters.level).toBeCallableWith(7);
    // @ts-expect-error -- the setter takes the member's own type
    spy.accessorSpies.setters.level('boiling');
  });

  it('mirrors a configured getter into the setters bag and back', () => {
    // The runtime promotes one half of a pair the prototype declares into the other list, so both
    // bags are keyed by the union of the two configured lists.
    const fromGetter = createSpyFromClass<Thermo, { gettersToSpyOn: ['level'] }>(Thermo, { gettersToSpyOn: ['level'] });
    expectTypeOf(fromGetter.accessorSpies.setters.level).toEqualTypeOf<Mock<(value: number) => void>>();

    const fromSetter = createSpyFromClass<Thermo, { settersToSpyOn: ['level'] }>(Thermo, { settersToSpyOn: ['level'] });
    expectTypeOf(fromSetter.accessorSpies.getters.level).toEqualTypeOf<Mock<() => number>>();
  });

  it('rejects a member neither list configured', () => {
    const spy = createSpyFromClass<Thermo, { gettersToSpyOn: ['level'] }>(Thermo, { gettersToSpyOn: ['level'] });

    // @ts-expect-error -- `unit` is in no configured list
    void spy.accessorSpies.getters.unit;
    // @ts-expect-error -- `unit` is in no configured list, the setters bag included
    void spy.accessorSpies.setters.unit;
  });

  it('rejects every member when the configured list is empty', () => {
    const spy = createSpyFromClass<Thermo, { gettersToSpyOn: [] }>(Thermo, { gettersToSpyOn: [] });

    // @ts-expect-error -- nothing was configured, so no bag has any key
    void spy.accessorSpies.getters.level;
    // @ts-expect-error -- nothing was configured, so no bag has any key
    void spy.accessorSpies.setters.level;
  });
});

describe('the bag without narrowing', () => {
  it('falls back to every string key when the list is not literal', () => {
    const spy = createSpyFromClass<Thermo, { gettersToSpyOn: string[] }>(Thermo);

    expectTypeOf(spy.accessorSpies.getters.unit).toEqualTypeOf<Mock<() => string>>();
    expectTypeOf(spy.accessorSpies.setters.level).toEqualTypeOf<Mock<(value: number) => void>>();
  });

  it('keeps the every-key bag for options that name no list', () => {
    const spy = createSpyFromClass<Thermo, { overload: 'last' }>(Thermo);

    expectTypeOf(spy.accessorSpies.getters.unit).toEqualTypeOf<Mock<() => string>>();
  });

  it('keeps a default Spy<T> on the bag it always had', () => {
    const spy: Spy<Thermo> = createSpyFromClass(Thermo, { gettersToSpyOn: ['level'] });

    expectTypeOf(spy.accessorSpies.getters.unit).toEqualTypeOf<Mock<() => string>>();
    expectTypeOf(spy.accessorSpies.setters.unit).toEqualTypeOf<Mock<(value: string) => void>>();
  });

  it('keeps the bare AddAccessorsSpies<T> exactly as it was', () => {
    const spy = createSpyFromClass(Thermo);

    expectTypeOf(spy.accessorSpies).toEqualTypeOf<AddAccessorsSpies<Thermo>['accessorSpies']>();

    const widened: AddAccessorsSpies<Thermo>['accessorSpies'] = spy.accessorSpies;
    const narrowed: Spy<Thermo>['accessorSpies'] = widened;
    void narrowed;
  });
});
