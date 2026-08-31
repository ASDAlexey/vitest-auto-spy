/**
 * Type-level tests for the double factories.
 *
 * Same reason as `emission.test-d.ts`: every helper here exists for the type it hands back, and a
 * runtime test cannot tell a correct one from `any`. The cases below are the ones whose failure
 * modes are already documented in `AGENTS.md` — a `Spy<T>` that stops being assignable where `T` is
 * expected, and a double that silently loses the members it was configured with.
 *
 * A negative case is written as `@ts-expect-error` rather than as a matcher, and deliberately:
 * `expectTypeOf(fn).not.toBeCallableWith(…)` is itself a call, so it fails to compile on the very
 * signature it is meant to reject and reports `Type 'never' has no call signatures` instead of
 * passing. `@ts-expect-error` is a two-way assertion under Vitest's `typecheck` mode — a directive
 * on a line that turns out to compile is reported as `Unused '@ts-expect-error' directive`, so
 * these cases fail if the rejection is ever lost.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { asInstance, createAutoMock, createSpyFromClass } from '../auto-spy';
import type { Spy, SpyDisposable } from '../auto-spy';

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

  it('rejects arguments the real method rejects', () => {
    const spy = createSpyFromClass(Storage);

    // The mock surface used to contribute `(...args: any[]) => any`, and an intersection accepts a
    // call matching *either* member — so all three of these compiled on the double and none of them
    // compiles on an instance. A spec could call the double the way production code never could and
    // stay green.
    // @ts-expect-error -- wrong argument type
    spy.read(1);
    // @ts-expect-error -- too many arguments
    spy.read('key', 'extra');
    // @ts-expect-error -- too few arguments
    spy.read();
    // @ts-expect-error -- wrong argument type on the second parameter
    spy.write('key', 2);
  });

  it('resolves parameters and returns, which an extra call signature used to collapse to never', () => {
    const spy = createSpyFromClass(Storage);

    expectTypeOf(spy.read).parameters.toEqualTypeOf<[key: string]>();
    expectTypeOf(spy.read).returns.toEqualTypeOf<string | null>();
    expectTypeOf(spy.write).parameters.toEqualTypeOf<[key: string, value: string]>();
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

describe('Spy<T> is Disposable', () => {
  it('satisfies the global Disposable, so `using spy = …` type-checks', () => {
    expectTypeOf<Spy<Storage>>().toExtend<Disposable>();
    expectTypeOf<Spy<Storage>>().toExtend<SpyDisposable>();
  });

  it('exposes the dispose method as a zero-argument, void-returning call on both factories', () => {
    const fromClass = createSpyFromClass(Storage);
    const fromType = createAutoMock<Storage>();

    expectTypeOf(fromClass[Symbol.dispose]).toBeCallableWith();
    expectTypeOf(fromClass[Symbol.dispose]()).toEqualTypeOf<void>();
    expectTypeOf(fromType[Symbol.dispose]()).toEqualTypeOf<void>();
  });
});
