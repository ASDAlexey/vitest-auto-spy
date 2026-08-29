/**
 * Type-level tests for the double factories.
 *
 * Same reason as `emission.test-d.ts`: every helper here exists for the type it hands back, and a
 * runtime test cannot tell a correct one from `any`. The cases below are the ones whose failure
 * modes are already documented in `AGENTS.md` — a `Spy<T>` that stops being assignable where `T` is
 * expected, and a double that silently loses the members it was configured with.
 *
 * They assert through *calls* rather than through `expectTypeOf(...).parameters` / `.returns`,
 * because a spied method is an intersection of the original signature with the mock surface, and
 * those two matchers resolve to `never` on an intersection. Asserting the call is closer to how a
 * spec uses the double anyway.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { asInstance, createAutoMock, createSpyFromClass } from '../auto-spy';
import type { Spy } from '../auto-spy';

class Storage {
  readonly name: string = 'storage';

  read(key: string): string | null {
    return key.length > 0 ? key : null;
  }

  write(key: string, value: string): void {
    void key;
    void value;
  }

  get size(): number {
    return 0;
  }
}

describe('createSpyFromClass', () => {
  it('keeps every method signature, arguments and return type both', () => {
    const spy = createSpyFromClass(Storage);

    expectTypeOf(spy.read).toBeCallableWith('key');
    expectTypeOf(spy.read('key')).toEqualTypeOf<string | null>();
    expectTypeOf(spy.write('key', 'value')).toEqualTypeOf<void>();
  });

  it('keeps non-method members readable at their own type', () => {
    const spy = createSpyFromClass(Storage);

    expectTypeOf(spy.name).toEqualTypeOf<string>();
    expectTypeOf(spy.size).toEqualTypeOf<number>();
  });

  it('exposes the mock surface on a method, which is the whole point of Spy<T>', () => {
    const spy = createSpyFromClass(Storage);

    expectTypeOf(spy.read.mockReturnValue).toBeFunction();
    expectTypeOf(spy.read.mockReturnValue).toBeCallableWith(null);
  });
});

describe('asInstance', () => {
  it('hands back the plain type, so a Spy<T> can be passed where T is expected', () => {
    const spy: Spy<Storage> = createSpyFromClass(Storage);

    expectTypeOf(asInstance(spy)).toEqualTypeOf<Storage>();
  });

  it('is what makes the double assignable to a parameter typed as the class', () => {
    const spy = createSpyFromClass(Storage);
    const accepts = (storage: Storage): string | null => storage.read('k');

    expectTypeOf(accepts).parameter(0).toEqualTypeOf<Storage>();
    expectTypeOf(accepts(asInstance(spy))).toEqualTypeOf<string | null>();
  });
});

describe('createAutoMock', () => {
  it('builds the double from a type alone, with the signatures intact', () => {
    type Gateway = {
      load(id: number): Promise<string>;
      readonly ready: boolean;
    };

    const mock = createAutoMock<Gateway>();

    expectTypeOf(mock.load).toBeCallableWith(1);
    expectTypeOf(mock.load(1)).toEqualTypeOf<Promise<string>>();
    expectTypeOf(mock.ready).toEqualTypeOf<boolean>();
  });
});
