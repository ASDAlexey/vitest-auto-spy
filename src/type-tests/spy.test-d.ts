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
import type { Mutable, Spy, SpyDisposable } from '../auto-spy';

class Storage {
  readonly name: string = 'storage';

  read(key: string): string | null {
    return key.length > 0 ? key : null;
  }

  write(key: string, value: string): void {
    void key;
    void value;
  }

  load(): Promise<number> {
    return Promise.resolve(0);
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

describe('a spy checks the stub, not only the call', () => {
  it('types what a method is stubbed with, not only what it is called with', () => {
    const spy = createSpyFromClass(Storage);

    spy.read.mockReturnValue('cached');
    spy.read.mockReturnValueOnce(null);
    spy.read.mockImplementation((key: string) => key);
    spy.load.mockResolvedValue(1);

    // The mock surface used to be `MockInstance` with no type argument, which defaults to
    // `Procedure` — `(...args: any[]) => any`. Every configuration helper on it then took `any`, so
    // a double could be told to answer with something its method can never return and the spec
    // stayed green until production code read the value. The call *arguments* were already checked;
    // the stub was not, which is the half a typed spy exists for.
    // @ts-expect-error -- `read` returns `string | null`, never a number
    spy.read.mockReturnValue(42);
    // @ts-expect-error -- and never `undefined` either
    spy.read.mockReturnValue(undefined);
    // @ts-expect-error -- same check on the `Once` variant
    spy.read.mockReturnValueOnce(42);
    // @ts-expect-error -- the implementation's return type is checked too
    spy.read.mockImplementation(() => 42);
    // @ts-expect-error -- and its parameters
    spy.read.mockImplementation((key: number) => String(key));
    // @ts-expect-error -- `load` resolves to a number
    spy.load.mockResolvedValue('one');
  });

  it('still lets a void method be stubbed with no argument at all', () => {
    const spy = createSpyFromClass(Storage);

    // `AddVoidReturnHelpers` exists because the runner's own `mockReturnValue` takes one argument
    // even on a method that returns nothing. Typing the mock surface against the method must not
    // take that overload away again.
    spy.write.mockReturnValue();
    spy.write.returnValue();
    spy.write.mockReturnValue(undefined);
  });

  it('types the recorded calls, which the untyped mock surface reported as any[]', () => {
    const spy = createSpyFromClass(Storage);

    expectTypeOf(spy.read.mock.calls).toEqualTypeOf<[key: string][]>();
    expectTypeOf(spy.read.mock.lastCall).toEqualTypeOf<[key: string] | undefined>();
    expectTypeOf(spy.read.getMockImplementation()).toEqualTypeOf<((key: string) => string | null) | undefined>();
  });
});

describe('readonly does not reach the double', () => {
  it('lets a readonly member of the source type be reassigned on the double', () => {
    const spy = createSpyFromClass(Storage);

    // `Spy<T>` is homomorphic, so it used to inherit `readonly` from the class it describes — and a
    // spec whose whole point is that a value changes between two calls then could not say so
    // without restating the service type as `Mutable<Spy<T>>`. The modifier describes the
    // production object; the runtime has always let a double be written to.
    spy.name = 'other';
    expectTypeOf(spy.name).toEqualTypeOf<string>();
  });
});

describe('Mutable<Spy<T>>', () => {
  it('adds nothing to Spy<T> any more, because Spy<T> already strips readonly', () => {
    // Mutually assignable rather than `toEqualTypeOf`: `Mutable<T>` maps over `keyof T`, which
    // flattens `Spy<T>`'s intersection into one object type. The difference is that flattening, not
    // a modifier — which is the claim.
    expectTypeOf<Mutable<Spy<Storage>>>().toExtend<Spy<Storage>>();
    expectTypeOf<Spy<Storage>>().toExtend<Mutable<Spy<Storage>>>();
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

  it('lets a readonly member be reassigned, seeded or not', () => {
    type Session = {
      readonly accessToken: string;
      readonly expiresAt: number;
      refresh(): void;
    };

    const seeded = createAutoMock<Session>({ accessToken: 'first' });

    // The case this comes from is an HTTP interceptor: the retry has to read a token the refresh
    // step replaced, so the second value is the assertion. Seeding cannot express it — a seed is
    // read once, at construction — and the type has to allow the write.
    seeded.accessToken = 'second';
    seeded.expiresAt = 1;
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
