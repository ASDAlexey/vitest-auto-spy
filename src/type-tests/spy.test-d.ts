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

import { asInstance, createAutoMock, createSpyFromClass, mockValueProp } from '../auto-spy';
import type { Mutable, ObservableLike, OnlyMethodKeysOf, RestoreProp, Spy, SpyDisposable } from '../auto-spy';

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

describe('readonly reaches the double', () => {
  it('rejects a plain assignment to a readonly member, so the spec reaches for mockValueProp', () => {
    const spy = createSpyFromClass(Storage);

    // Stripping the modifier was tried and reverted. It made this line compile everywhere, and on a
    // member replaced by a spied accessor (`gettersToSpyOn`) the write reaches the setter spy while
    // the getter goes on answering `undefined` — a loud TS2540 traded for a silent runtime no-op.
    // @ts-expect-error -- TS2540: `name` is readonly on the class and stays readonly on the double
    spy.name = 'other';
    expectTypeOf(spy.name).toEqualTypeOf<string>();
  });

  it('accepts that same member on the checked mockValueProp overload', () => {
    const spy = createSpyFromClass(Storage);

    // `readonly` does not take a key out of `keyof T`, so `K extends keyof T` still matches and the
    // checked overload answers — no `Mutable`, no cast. (No negative case beside it: every
    // `mock*Prop` helper carries an untyped escape-hatch overload, so nothing it is handed is ever
    // rejected — see `PropStubValue`.) `Reflect.set` is not the alternative it looks like either:
    // it is the same `[[Set]]`, so it is equally inert on a spied accessor, and it answers `true`
    // while doing nothing.
    expectTypeOf(mockValueProp).toBeCallableWith(spy, 'name', 'other');
    expectTypeOf(mockValueProp(spy, 'name', 'other')).toEqualTypeOf<RestoreProp>();
  });
});

describe('Mutable<Spy<T>>', () => {
  it('is the opt-in way back to a plain assignment on a data member', () => {
    const spy: Mutable<Spy<Storage>> = createSpyFromClass(Storage);

    spy.name = 'other';
    expectTypeOf(spy.name).toEqualTypeOf<string>();
  });

  it('still differs from Spy<T>, which is why a spec reaches for it', () => {
    expectTypeOf<Mutable<Spy<Storage>>>().not.toEqualTypeOf<Spy<Storage>>();
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

  it('keeps a readonly member readonly, and answers with mockValueProp', () => {
    type Session = {
      readonly accessToken: string;
      readonly expiresAt: number;
      refresh(): void;
    };

    const seeded = createAutoMock<Session>({ accessToken: 'first' });

    // The case this comes from is an HTTP interceptor: the retry has to read a token the refresh
    // step replaced, so the second value cannot come from the seed, which is read once at
    // construction. `mockValueProp` supplies it and works on a spied accessor too.
    // @ts-expect-error -- TS2540: the seed does not make the member writable
    seeded.accessToken = 'second';
    expectTypeOf(mockValueProp).toBeCallableWith(seeded, 'accessToken', 'second');
    expectTypeOf(mockValueProp).toBeCallableWith(seeded, 'expiresAt', 1);
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

/**
 * Which call signature the helpers are typed against.
 *
 * The default is the **last** one, because that is what `Parameters` / `ReturnType` do, and it is
 * the wrong one for a generated `observe` client — where the last overload returns `HttpEvent<T>`
 * and `nextWith(body)` therefore stops compiling with no hint that overload order is the cause. It
 * is also not a stable default: `declare global` in a third-party package can append an overload to
 * a global interface, so which signature is "last" depends on which packages are in the program.
 */
describe('Spy<T, { overload }>', () => {
  interface EventOf<T> {
    kind: 'event';
    body: T;
  }

  interface Page {
    items: string[];
  }

  class VenuesService {
    getVenues(id: string, observe?: 'body'): Page;
    getVenues(id: string, observe: 'events'): EventOf<Page>;
    getVenues(id: string, _observe?: string): unknown {
      return id;
    }

    download(id: string): Blob;
    download(id: string, observe: 'events'): EventOf<Blob>;
    download(id: string, _observe?: string): unknown {
      return id;
    }
  }

  // `ReturnType<…>` rather than `.returns`: a decorated member is an intersection carrying every
  // helper's own call signature, and the matcher reads the last of those rather than the method's.
  it('reads the last signature by default', () => {
    expectTypeOf<ReturnType<Spy<VenuesService>['getVenues']>>().toEqualTypeOf<EventOf<Page>>();
  });

  it("moves every overloaded member with the flat 'first'", () => {
    expectTypeOf<ReturnType<Spy<VenuesService, { overload: 'first' }>['getVenues']>>().toEqualTypeOf<Page>();
    expectTypeOf<ReturnType<Spy<VenuesService, { overload: 'first' }>['download']>>().toEqualTypeOf<Blob>();
  });

  /**
   * The map is what a wide type needs. Applying `'first'` to the whole double moves members nobody
   * was fixing — the case this came from put it on `Spy<Response>` for one method and collected five
   * `TS2769`s on `download` — so the choice has to be nameable per member.
   */
  it('moves only the named member with a map, leaving its siblings on the default', () => {
    type Scoped = Spy<VenuesService, { overload: { getVenues: 'first' } }>;

    expectTypeOf<ReturnType<Scoped['getVenues']>>().toEqualTypeOf<Page>();
    expectTypeOf<ReturnType<Scoped['download']>>().toEqualTypeOf<EventOf<Blob>>();
  });

  it('leaves a member the map does not name alone, and a name the type does not have is inert', () => {
    type Absent = Spy<VenuesService, { overload: { noSuchMethod: 'first' } }>;

    expectTypeOf<ReturnType<Absent['getVenues']>>().toEqualTypeOf<EventOf<Page>>();
  });

  /**
   * The half a `ReturnType` assertion does not see, and the one the symptom is reported from: the
   * *helper* is typed against the selected signature too. `nextWith(body)` on the default double
   * demands the `observe: 'events'` payload — `TS2345: Argument of type 'Page' is not assignable to
   * parameter of type 'EventOf<Page>'`, with nothing about overloads in it — and the map is what
   * puts the real response shape back.
   */
  it('types the observable helper against the selected signature', () => {
    class VenuesApi {
      getVenues(id: string, observe?: 'body'): ObservableLike<Page>;
      getVenues(id: string, observe: 'events'): ObservableLike<EventOf<Page>>;
      getVenues(id: string, _observe?: string): unknown {
        return id;
      }
    }

    type Collapsed = Spy<VenuesApi>;
    type Scoped = Spy<VenuesApi, { overload: { getVenues: 'first' } }>;

    expectTypeOf<Parameters<Collapsed['getVenues']['nextWith']>[0]>().toEqualTypeOf<EventOf<Page> | undefined>();
    expectTypeOf<Parameters<Scoped['getVenues']['nextWith']>[0]>().toEqualTypeOf<Page | undefined>();
  });
});

/** The generic-with-a-default shape, at module scope: `declare class` is not legal inside a block. */
interface RemoteConfigDefaults {
  theme: string;
}

declare class RemoteConfigService<T = RemoteConfigDefaults> {
  read(): T;
}

/**
 * A declared default type argument reaches the double.
 *
 * `class RemoteConfigService<T = RemoteConfigDefaults>` handed to a parameter typed as a *union*
 * infers `T` as `unknown`, and every member typed against it then reads as `unknown` — a double
 * that types nothing, on a class that declared exactly what it should be. Two shapes caused it and
 * both are fixed: the index-signature intersection that `ClassType<T>` used to carry, and the union
 * in `injectSpy`'s token parameter.
 */
describe('a generic class with a default type argument', () => {
  it('keeps the declared default through createSpyFromClass', () => {
    expectTypeOf(createSpyFromClass(RemoteConfigService).read).returns.toEqualTypeOf<RemoteConfigDefaults>();
  });

  it('still takes an explicit instantiation', () => {
    expectTypeOf(createSpyFromClass<RemoteConfigService<{ id: number }>>(RemoteConfigService).read).returns.toEqualTypeOf<{
      id: number;
    }>();
  });
});

interface FlagDefaults {
  beta: boolean;
}

declare class FlagService<T extends object = FlagDefaults> {
  get flags(): Readonly<T>;
  isEnabled(key: keyof T): boolean;
}

/**
 * The one combination the core factory cannot infer: an accessor list plus `returns` on a generic
 * class. TypeScript checks a generic class argument after the configuration, reads `T` back from the
 * list as `{ flags: any }`, and rejects the `returns` key before the class is ever read. The
 * `@ts-expect-error` is the ratchet — if a future signature infers this, the directive goes unused
 * and the documentation that says to spell the argument out has to change with it.
 */
describe('a generic class, an accessor list and returns', () => {
  it('is rejected inferred, which is what AGENTS.md §17 names', () => {
    // @ts-expect-error -- 'isEnabled' does not exist in type 'MethodReturns<{ flags: any; }>'
    createSpyFromClass(FlagService, { gettersToSpyOn: ['flags'], returns: { isEnabled: false } });
  });

  it('compiles with the type argument spelled out, and keeps the default', () => {
    const flags = createSpyFromClass<FlagService>(FlagService, { gettersToSpyOn: ['flags'], returns: { isEnabled: false } });

    expectTypeOf(flags.isEnabled).parameter(0).toEqualTypeOf<'beta'>();
  });

  it('infers the default from the class when only one of the two is given', () => {
    expectTypeOf(createSpyFromClass(FlagService, { gettersToSpyOn: ['flags'] }).isEnabled)
      .parameter(0)
      .toEqualTypeOf<'beta'>();
    expectTypeOf(createSpyFromClass(FlagService, { returns: { isEnabled: false } }).isEnabled)
      .parameter(0)
      .toEqualTypeOf<'beta'>();
  });
});

describe('returns on a type that declares toString()', () => {
  interface Named {
    reload(): void;
    toString(): string;
  }

  class NamedService {
    reload(): void {}

    toString(): string {
      return 'named';
    }
  }

  it('accepts a literal that configures another member', () => {
    createAutoMock<Named>(undefined, { returns: { reload: undefined } });
    createSpyFromClass(NamedService, { returns: { reload: undefined } });
  });

  it('still types the declared toString', () => {
    createAutoMock<Named>(undefined, { returns: { toString: 'custom' } });
    // @ts-expect-error -- toString answers a string, not a number
    createAutoMock<Named>(undefined, { returns: { toString: 1 } });
  });
});

describe('optional methods are methods', () => {
  interface Provider {
    announce?(message: string): void;
    load(): number;
  }

  it('can be configured through returns and read as a spy', () => {
    const provider = createAutoMock<Provider>(undefined, { returns: { announce: undefined, load: 1 } });

    provider.announce?.mockReturnValue(undefined);
  });
});

describe('returns on a type with an index signature', () => {
  interface Host {
    [key: string]: unknown;
    open(url: string): Host | null;
    scrollTo(x: number, y: number): void;
  }

  it('accepts what each method returns', () => {
    createAutoMock<Host>(undefined, { returns: { open: null, scrollTo: undefined } });
  });
});

describe('a member whose type failed to resolve does not erase the other keys', () => {
  interface Host {
    // @ts-expect-error -- an undeclared value, so this member's type is the error type
    broken: typeof undeclaredLogger;
    open(url: string): Host | null;
  }

  it('keeps every key a method, and every returns entry typed', () => {
    expectTypeOf<OnlyMethodKeysOf<Host>>().toEqualTypeOf<'broken' | 'open'>();
    createAutoMock<Host>(undefined, { returns: { open: null } });
    // @ts-expect-error -- open answers Host | null, not a number
    createAutoMock<Host>(undefined, { returns: { open: 1 } });
  });
});
