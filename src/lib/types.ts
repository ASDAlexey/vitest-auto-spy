/**
 * Public type surface (mirrors `@hirez_io/auto-spies-core`).
 *
 * These types describe the *shape* of an auto-spy: which helpers get attached
 * to a method spy based on its return type, how accessor spies are exposed, and
 * what the configuration object accepts.
 */
import type { Observable, Subject } from 'rxjs';
import type { Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Any callable. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `Func` is the generic constraint for every spied method; `any[]`/`any` are required so `Parameters`/`ReturnType` inference (used throughout the spy types) accepts arbitrary method signatures.
export type Func = (...args: any[]) => any;

/**
 * A class this library can read: its prototype, its name, its statics.
 *
 * The construct signature is **abstract**, and that is the point of the type rather than a detail.
 * Nothing here ever calls `new` on what it is handed — `createSpyFromClass` walks the prototype
 * chain, `createSpyClass` builds a constructor of its own — so demanding a *concrete* one bought no
 * safety while rejecting the most common Angular DI-token shape there is:
 *
 * ```ts
 * abstract class LocalStorage extends AbstractStorage {}
 * // { provide: LocalStorage, useClass: BrowserLocalStorage } in production
 * provideAutoSpy(LocalStorage) // used to be `Argument of type 'typeof LocalStorage' is not assignable…`
 * ```
 *
 * A concrete constructor is assignable to an abstract one, so this only widens what is accepted —
 * no existing call changes meaning. What an abstract class cannot give is *methods*: they are
 * declared and never emitted, so its prototype is empty. That half is handled at runtime, by
 * {@link ClassType}'s only consumer that cares — see the empty-prototype fallback in
 * `createSpyFromClass`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a class may be invoked with arbitrary constructor args and expose arbitrary static members; both `any`s model that open shape for `createSpyFromClass`.
export type ClassType<T> = (abstract new (...args: any[]) => T) & { [key: string]: any };

// ---------------------------------------------------------------------------
// Key filters — pick keys of `T` whose value matches a given type
// ---------------------------------------------------------------------------

type StringKeysForPropertyType<ObjectType, PropType> = Extract<
  { [Key in keyof ObjectType]: ObjectType[Key] extends PropType ? Key : never }[keyof ObjectType],
  string
>;

/** Keys of `T` that are methods. */
export type OnlyMethodKeysOf<T> = StringKeysForPropertyType<T, Func>;

/** Keys of `T` that are `Observable` properties. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `Observable<any>` matches an observable property of *any* element type; `Observable<unknown>` would not structurally match e.g. `Observable<number>` here.
export type OnlyObservablePropsOf<T> = StringKeysForPropertyType<T, Observable<any>>;

/** Keys of `T` that are *not* methods (plain props, getters, setters). */
export type OnlyPropsOf<ObjectType> = Extract<
  { [Key in keyof ObjectType]: ObjectType[Key] extends Func ? never : Key }[keyof ObjectType],
  string
>;

/**
 * Keys that may name an accessor — every string key of `T`, whatever its value type.
 *
 * Whether a member is a getter is a property of the *descriptor*, not of the value: a getter
 * returning a function is still a getter. Filtering by "not callable" (as {@link OnlyPropsOf} does)
 * therefore rejects exactly the case Angular's signal-based services are made of —
 * `get isCompactMode(): Signal<boolean>`, where `Signal<T>` is `(() => T) & { … }` and so *is* callable.
 * For a service whose readonly state is all signals, that leaves no nameable getter at all and the
 * element type collapses to `never`, reported as `Type 'string' is not assignable to type 'never'`
 * — a message with nothing in it about signals.
 *
 * Naming a member that has no accessor on the prototype is caught at runtime instead, with a
 * warning that says so, in the same place a mistyped `onlyMethodsToSpyOn` name is.
 */
export type AccessorKeysOf<ObjectType> = Extract<keyof ObjectType, string>;

// ---------------------------------------------------------------------------
// Value configs (sequences of emissions for observable/promise spies)
// ---------------------------------------------------------------------------

/** A single value to emit/resolve on a specific call. */
export type ValueConfigPerCall<T> = { value: T; delay?: number; doNotComplete?: boolean };

/** Emit a value (optionally delayed). */
export type NextValueConfig<T> = { value: T; delay?: number };

/** Error the stream (optionally delayed). */
export type ErrorValueConfig = { errorValue: unknown; delay?: number };

/** Complete the stream (optionally delayed). */
export type CompleteValueConfig = { complete?: boolean; delay?: number };

/** One entry in a precise emission sequence. */
export type ValueConfig<T> = CompleteValueConfig | ErrorValueConfig | NextValueConfig<T>;

// ---------------------------------------------------------------------------
// Helper bundles attached to a method spy by its return type
// ---------------------------------------------------------------------------

/** Helpers attached to an `Observable`-returning spy. */
export interface AddObservableSpyMethods<T> {
  /**
   * Emit `value` — buffered, so a subscription taken afterwards still receives it.
   *
   * @remarks
   * Every helper here exists only once the observable layer is registered: `import
   * 'vitest-auto-spy/rxjs'` once, in the setup file. Without it they are absent from a method spy
   * (`… .nextWith is not a function`) and `observablePropsToSpyOn` throws
   * `Observable spies require rxjs`. Prefer {@link returnSubject} when the spec drives the stream
   * itself, {@link nextWithPerCall} when each call needs its own.
   */
  nextWith(value?: T): void;
  /** Emit one value then complete. */
  nextOneTimeWith(value?: T): void;
  nextWithValues(valuesConfigs: ValueConfig<T>[]): void;
  nextWithPerCall(valuesPerCall?: ValueConfigPerCall<T>[]): Subject<T>[];
  throwWith(value: unknown): void;
  complete(): void;
  returnSubject(): Subject<T>;
}

/** Helpers attached to a `Promise`-returning spy. */
export interface AddPromiseSpyMethods<T> {
  resolveWith(value?: T): void;
  rejectWith(value?: unknown): void;
  resolveWithPerCall(valuesPerCall: ValueConfigPerCall<T>[]): void;
}

/**
 * A configured return-value continuation for a `calledWith`/`mustBeCalledWith`
 * chain. `mockReturnValue` is the native name; `returnValue` is the
 * `jest-auto-spies` alias, kept so migrating tests are a pure import swap.
 */
export type WithMockReturnValue<Method extends Func> = {
  mockReturnValue: (value: ReturnType<Method>) => void;
  returnValue: (value: ReturnType<Method>) => void;
};

/** Argument-matching helpers attached to a plain (sync) spy. */
export interface AddCalledWithSpyMethods<Method extends Func> {
  /**
   * Configure what the spy answers for exactly these arguments.
   *
   * @remarks
   * **Lenient on a miss:** a call matching no chain falls through to the spy's default
   * (`mockReturnValue`, `resolveWith`, … — or `undefined`), so a wrong expectation here is silent.
   * {@link mustBeCalledWith} throws instead, printing wanted beside actual. Matching is positional
   * and arity-exact — `calledWith(1)` never answers `load(1, undefined)` — and accepts asymmetric
   * matchers (`expect.any(String)`, `expect.objectContaining({…})`).
   */
  calledWith(...args: Parameters<Method>): WithMockReturnValue<Method>;
  mustBeCalledWith(...args: Parameters<Method>): WithMockReturnValue<Method>;
}

/** Argument-matching helpers that resolve to observable helpers. */
export type AddCalledWithObservable<Method extends Func, O> = {
  /** Argument-matched and lenient on a miss — see {@link AddCalledWithSpyMethods.calledWith}. */
  calledWith(...args: Parameters<Method>): AddObservableSpyMethods<O>;
  mustBeCalledWith(...args: Parameters<Method>): AddObservableSpyMethods<O>;
};

/** Argument-matching helpers that resolve to promise helpers. */
export type AddCalledWithPromise<Method extends Func, P> = {
  /** Argument-matched and lenient on a miss — see {@link AddCalledWithSpyMethods.calledWith}. */
  calledWith(...args: Parameters<Method>): AddPromiseSpyMethods<P>;
  mustBeCalledWith(...args: Parameters<Method>): AddPromiseSpyMethods<P>;
};

/**
 * The zero-argument `mockReturnValue()` a `void` method should accept.
 *
 * The runner's own `Mock` types the argument as `any`, which is not `void`, so
 * `spy.dispose.mockReturnValue()` fails with `TS2554: Expected 1 arguments, but got 0` on a method
 * whose whole point is that it returns nothing. This is an *added* overload, not a replacement: a
 * call that does pass a value still resolves against the runner's signature first and keeps its
 * chainable return type.
 */
export interface AddVoidReturnHelpers {
  mockReturnValue(value?: undefined): void;
  returnValue(value?: undefined): void;
}

/**
 * Wrap a method's spy with the helper bundle chosen by its return type.
 *
 * Two details here are load-bearing rather than stylistic, and both come from the same bug report:
 * a spy member that silently became `never`, reported as
 * `Property 'mockReturnValue' does not exist on type 'never'` with nothing connecting it to the
 * method it came from.
 *
 * 1. **The fallback is the sync bundle, not `never`.** A generic method with a conditional return
 *    type — `get<K extends keyof this>(k: K): this[K] extends Stringified<infer R> ? R : never`, the
 *    shape of every typed configuration service — does *not* match
 *    `(...args: any[]) => infer ReturnType`: the return type cannot be inferred to anything
 *    concrete, so the conditional takes its false branch. Annihilating the member there threw away
 *    every helper it should have had.
 * 2. **Each comparison is on tuples** (`[X] extends [Y]`), which switches distribution off. A bare
 *    `ReturnType extends Promise<…>` distributes over the `infer`-bound parameter, and distributing
 *    over `never` yields `never` — the same collapse by a different route, for a method whose
 *    return type does resolve, to `never`.
 */
export type AddSpyMethodsByReturnTypes<Method extends Func> = Method &
  Mock &
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the `(...args: any[]) => infer ReturnType` conditional only extracts the return type; the parameter shape is irrelevant here and a narrower signature would fail to match arbitrary methods.
  (Method extends (...args: any[]) => infer ReturnType
    ? [ReturnType] extends [Promise<infer P>]
      ? AddCalledWithPromise<Method, P> & AddPromiseSpyMethods<P>
      : [ReturnType] extends [Observable<infer O>]
        ? AddCalledWithObservable<Method, O> & AddObservableSpyMethods<O>
        : [ReturnType] extends [void]
          ? AddCalledWithSpyMethods<Method> & AddVoidReturnHelpers
          : AddCalledWithSpyMethods<Method>
    : AddCalledWithSpyMethods<Method>);

// ---------------------------------------------------------------------------
// Overload selection
// ---------------------------------------------------------------------------

/**
 * Every call signature of `F`, in declaration order.
 *
 * `Parameters<F>` and `ReturnType<F>` read the **last** overload, which for a generated API client
 * is the one nobody calls: `ng-openapi-gen` and `openapi-generator` emit `observe: 'body'` first and
 * `observe: 'events'` last, so `Spy<VenuesService>` types a method against `HttpEvent<T>` and
 * `nextWith(body)` stops compiling — with no hint that overload order is what happened.
 *
 * Four signatures is the practical ceiling (the generated `observe` clients have three or four);
 * a function with fewer matches the same pattern, with the extra slots repeating what it has.
 */
export type Overloads<F> = F extends {
  (...args: infer A1): infer R1;
  (...args: infer A2): infer R2;
  (...args: infer A3): infer R3;
  (...args: infer A4): infer R4;
}
  ? [(...args: A1) => R1, (...args: A2) => R2, (...args: A3) => R3, (...args: A4) => R4]
  : never;

/** One call signature of an overloaded function, by index — `Overload<Client['get'], 0>`. */
export type Overload<F, N extends 0 | 1 | 2 | 3> = Overloads<F>[N];

/** How {@link Spy} should read a method that has more than one call signature. */
export interface SpyOptions {
  /**
   * Which overload the spy's helpers are typed against. Default `'last'`, which is what
   * `Parameters` / `ReturnType` do on their own and therefore what every existing `Spy<T>` means.
   */
  overload?: 'first' | 'last';
}

/** Apply {@link SpyOptions.overload} to one method type. */
type SelectOverload<Method extends Func, Options extends SpyOptions> = Options extends { overload: 'first' }
  ? Overload<Method, 0> extends Func
    ? Overload<Method, 0>
    : Method
  : Method;

// ---------------------------------------------------------------------------
// Accessor spies + the assembled `Spy<T>`
// ---------------------------------------------------------------------------

/**
 * The `[Symbol.dispose]()` every double this package builds carries.
 *
 * It calls `resetAutoSpy(this)`, so `using` releases the double at the end of the block and the
 * `afterEach` that existed only to reset one spy can go:
 *
 * ```ts
 * it('loads', () => {
 *   using users = createSpyFromClass(UserService); // reset when the block ends
 *   users.load.resolveWith([]);
 * });
 * ```
 *
 * Declared here rather than referenced as the global `Disposable`, for the same reason Vitest
 * declares its own: `Disposable` lives in `lib.esnext.disposable`, and a consumer whose `lib` stops
 * at ES2022 and who has no `@types/node` would see the published `.d.ts` fail on the name. A
 * structural declaration needs only `Symbol.dispose` to be typed, which is what a runtime capable of
 * `using` guarantees — and `Spy<T>` stays assignable to `Disposable` wherever that type does exist.
 *
 * A type alias rather than an interface, deliberately: an interface has no implicit index
 * signature, and `Spy<T>` picking one up in its intersection would stop it being assignable to
 * `Record<string, unknown>` — which specs and helpers here do rely on.
 *
 * There is deliberately no `[Symbol.asyncDispose]`. `resetAutoSpy` is synchronous, so an async half
 * would add a microtask and advertise teardown that does not exist; `await using` already accepts a
 * sync-disposable (the spec falls back to `@@dispose` when `@@asyncDispose` is absent), so nothing
 * is lost.
 */
export type SpyDisposable = {
  [Symbol.dispose](): void;
};

/** The `accessorSpies` bag added to every auto-spy. */
export type AddAccessorsSpies<T> = {
  accessorSpies: {
    getters: { [K in keyof T]: Mock };
    setters: { [K in keyof T]: Mock };
  };
};

/**
 * A recursively-mocked `T`: object properties become nested deep mocks (so
 * `mock.repo.user.find()` works without seeding), methods become spies, and
 * primitive properties keep their type (seed them via `overrides`/assignment).
 */
export type DeepMockProxy<T> = SpyDisposable & {
  [K in keyof T]: T[K] extends Func ? AddSpyMethodsByReturnTypes<T[K]> : T[K] extends object ? DeepMockProxy<T[K]> : T[K];
};

/**
 * Fully-typed spy of `T`.
 *
 * ```ts
 * let cart: Spy<CartService>;
 * // a generated client whose useful overload is the first one:
 * let cinemas: Spy<VenuesService, { overload: 'first' }>;
 * ```
 *
 * @remarks
 * A **mapped type**, so it drops `#private` and `private` members and is therefore *not* assignable
 * to `T`. Declare the variable as `Spy<T>` — never as `T`, `Mocked<T>` or `MockedObject<T>` — and
 * call `asInstance(spy)` at the one place a real `T` is wanted. The compiler reports this as missing
 * private fields and says nothing about the real cause, which is why the `no-mocked-for-spy` lint
 * rule exists.
 */
export type Spy<T, Options extends SpyOptions = SpyOptions> = AddAccessorsSpies<T> &
  SpyDisposable & {
    [K in keyof T]: T[K] extends Func
      ? AddSpyMethodsByReturnTypes<SelectOverload<T[K], Options>>
      : T[K] extends Observable<infer O>
        ? AddObservableSpyMethods<O> & T[K]
        : T[K];
  };

/**
 * What a `mock*Prop` helper accepts as the stand-in for a member typed `V`.
 *
 * Exactly `V`, except for two deliberate widenings.
 *
 * A **callable** member also accepts a bare function of the same shape. The reason is `Spy<T>`: the
 * recommended way to reach a service in an Angular spec is `injectSpy(X)` /
 * `asSpy(TestBed.inject(X))`, and on that object a signal-valued member is typed
 * `Signal<T> & Mock & …`. Requiring the exact member type would mean no real signal could ever be
 * written into it — so the spec would have to keep the instance under a second name purely to patch
 * it, which is what this avoids.
 *
 * **Every** member also accepts `null` and `undefined`. "This member is absent in this test" is a
 * normal thing for a spec to say — `mockValueProp(navigation, 'currentFocus', null)` for a service
 * that reads the field as *has focus / has none*, `mockValueProp(window, 'AudioContext', undefined)`
 * for an API a TV platform does not ship — and interface declarations routinely omit the `| null`
 * the runtime has.
 *
 * Be clear about what that buys, because it is less than it looks: such a call *already* compiled,
 * by falling through to the untyped escape-hatch overload each of these helpers carries. Nothing
 * a `mock*Prop` helper is handed is ever rejected, and that is deliberate — the escape hatch is a
 * routine tool, not a last resort (a partial fixture for a fat type, a synthetic DOM event, a
 * `#private` field). What the widening changes is which overload answers: the checked one, whose
 * `K extends keyof T` gives the property name completions and a spelling check. The value is not
 * checked either way.
 */
export type PropStubValue<V> = (V extends (...args: infer Args) => infer Return ? V | ((...args: Args) => Return) : V) | null | undefined;

/**
 * `T` with every `readonly` modifier removed.
 *
 * `Spy<T>` is a homomorphic mapped type, so it *preserves* `readonly` — and an abstract class whose
 * useful members are getters (`abstract get pathname(): string`, the shape `createAutoMock` exists
 * for) therefore produces a double the spec cannot assign to: `TS2540: Cannot assign to 'pathname'
 * because it is a read-only property`, even though the Proxy's `set` trap handles the write
 * perfectly well at runtime.
 *
 * ```ts
 * const location: Mutable<Spy<PlatformLocation>> = createAutoMock<PlatformLocation>();
 *
 * location.pathname = '/movies';
 * ```
 *
 * `mockValueProp(location, 'pathname', '/movies')` is the alternative and needs no type at all —
 * prefer it when the patch should be undone by `restoreMockedProps()`. Reach for this when the spec
 * assigns directly, repeatedly, and does not want the bookkeeping.
 */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * A partial `T` that stays partial all the way down.
 *
 * `Partial<T>` is one level deep, so a fixture for a configuration object, an account token or a
 * route snapshot — a tree the test reads one leaf of — has to name the type of every nested level
 * and build it with its own call. What it buys over `as T` is what must survive: a key that `T` does
 * not have, or that a refactor removed, is still rejected at any depth.
 *
 * **Every level also accepts the real value**, which is the `T |` in the object branch. Without it a
 * deep partial stops accepting the object it is a partial *of*: `{@link BuiltIn}` lists the values
 * that must be handed back untouched, but it can only list types from ECMAScript — naming `Node` or
 * `NodeList` here would put `lib: ["DOM"]` into the published `.d.ts`, and this package is imported
 * from `/node`, `/nestjs` and `/bun` as well. So a host object was mapped over instead, and a real
 * `NodeList` stopped being assignable to the mapping of itself:
 *
 * ```ts
 * createMock<MutationRecord>({ addedNodes: nodeList, target: element });
 * //                           ^ Type 'NodeList' is not assignable to type '{ readonly baseURI?: … }'
 * ```
 *
 * The union costs nothing at the check that matters: excess-property checking against a union
 * accepts a key present in *some* member, and both members here have exactly the keys of `T`, so a
 * key `T` does not have is still rejected — at any depth.
 */
export type DeepPartial<T> = T extends Func
  ? T | ((...args: Parameters<T>) => ReturnType<T>)
  : T extends BuiltIn
    ? T
    : T extends readonly (infer Element)[]
      ? DeepPartial<Element>[]
      : T extends object
        ? T | { [K in keyof T]?: DeepPartial<T[K]> }
        : T;

/**
 * Values {@link DeepPartial} must hand back untouched.
 *
 * Mapping over a `Date` or a `Map` would turn it into an object of optional methods — accepted by
 * the compiler, useless at runtime, and impossible to write a fixture against.
 */
type BuiltIn = Date | Error | Func | Promise<unknown> | ReadonlyMap<unknown, unknown> | ReadonlySet<unknown> | RegExp;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Return values for a spy's methods, keyed by method name.
 *
 * Written as part of the configuration so that a provider needs no second statement — which is what
 * pushes a shared double into module scope in the first place, where under `isolate: false` every
 * importing file then shares its spies.
 */
export type MethodReturns<T> = { [K in OnlyMethodKeysOf<T>]?: T[K] extends Func ? ReturnType<T[K]> : never };

/** Everything the strict-mode handler is told about a call nobody configured. */
export interface UnstubbedCall {
  /** The class the double was built from — `undefined` for a type-driven `createAutoMock`. */
  className: string | undefined;
  /** The method that was called. */
  method: string;
  /** The arguments it was called with. */
  args: unknown[];
}

/**
 * What to do about a call nobody configured.
 *
 * Whatever it returns becomes that call's return value, so a handler can supply a blanket default
 * (`vitest-mock-extended`'s `fallbackMockImplementation`) instead of failing; throwing from it is
 * what `strict: true` does.
 */
export type UnstubbedCallHandler = (call: UnstubbedCall) => unknown;

/**
 * Strict-mode configuration, shared by every factory that builds a double.
 *
 * The failure this exists for is specific to wide services, which is where this library is used
 * most: on a forty-method collaborator with one method left unstubbed, the call returns `undefined`
 * and the test fails three frames later on something that has nothing to do with the omission. The
 * only tool before this was {@link ClassSpyConfiguration.onlyMethodsToSpyOn}, which *removes* the
 * method — so the failure reads `service.load is not a function` and blames the spy rather than the
 * spec.
 *
 * **What counts as stubbed.** Anything that configures the method at all: `mockReturnValue`,
 * `mockImplementation`, `returns:` in the configuration, `resolveWith` / `rejectWith` /
 * `resolveWithPerCall`, `nextWith` / `throwWith` / `complete` / `returnSubject`, or *any*
 * `calledWith` / `mustBeCalledWith` chain.
 *
 * **A `calledWith` chain that does not match the call is still stubbed**, and deliberately so.
 * `calledWith(1)` is a statement that this method is configured, and the argument-level version of
 * strictness already has a name — `mustBeCalledWith`, which throws showing wanted next to actual.
 * Making `strict` throw on an argument miss would silently reclassify every existing `calledWith`
 * into `mustBeCalledWith` and print a worse message than the one that tool already prints. Strict
 * mode answers "nobody configured this method", not "nobody configured this call".
 */
export interface StrictSpyConfiguration {
  /**
   * Throw when a method nobody configured is called, naming the class, the method and the
   * arguments, instead of returning `undefined`.
   *
   * ```ts
   * const users = createSpyFromClass(UserService, { strict: true });
   *
   * users.load.resolveWith([]);
   * users.remove(1); // throws: nothing configured UserService.remove
   * ```
   *
   * Sugar for an {@link onUnstubbedCall} that throws. An explicit `strict: false` also switches off
   * a default installed globally.
   */
  strict?: boolean | undefined;
  /**
   * The general form of {@link strict}: run this instead of returning `undefined`, and use whatever
   * it returns as the call's result.
   *
   * ```ts
   * createSpyFromClass(UserService, {
   *   onUnstubbedCall: ({ className, method }) => {
   *     unstubbed.push(`${className}.${method}`); // record, don't fail
   *   },
   * });
   * ```
   *
   * Wins over {@link strict} when both are given, and over anything installed globally.
   */
  onUnstubbedCall?: UnstubbedCallHandler | undefined;
}

/** Restricts/extends what `createSpyFromClass` spies on. */
export interface ClassSpyConfiguration<T> extends StrictSpyConfiguration {
  /**
   * Extra callables to spy on, **added** to the methods discovered on the prototype.
   *
   * @remarks
   * **Additive, not a whitelist** — `jest-auto-spies`' semantics, and the single most repeated
   * mistake in this API. Discovery already finds every prototype method, so the only names worth
   * passing are the ones it cannot see: an arrow-function property, an Angular `signal()` field, a
   * method of an ngrx `signalStore()`. {@link instanceMethodsToSpyOn} is the same behaviour under a
   * name that says so. The exhaustive whitelist is {@link onlyMethodsToSpyOn}, which skips discovery
   * entirely. Dropping either option usually fixes more than it breaks.
   */
  methodsToSpyOn?: OnlyMethodKeysOf<T>[];
  /**
   * Spy on these methods and no others — prototype discovery is skipped entirely.
   *
   * @remarks
   * Every other method is then absent from the spy, so code under test that calls one fails with
   * `… is not a function`. Occasionally that is the point (a wide collaborator where an unexpected
   * call should be loud); when it is not, {@link methodsToSpyOn} is the additive option. A name here
   * that the prototype does not have is reported as a probable typo, since under a restricting list
   * a misspelling silently un-spies the real method.
   */
  onlyMethodsToSpyOn?: OnlyMethodKeysOf<T>[];
  /**
   * Callables that live on the *instance* rather than on the prototype — an arrow-function
   * property, an Angular `signal()` / `computed()` field, a method of an ngrx `signalStore()` —
   * **added** to whatever prototype discovery produced.
   *
   * @remarks
   * Behaviourally identical to {@link methodsToSpyOn}; prefer this name in new code.
   */
  instanceMethodsToSpyOn?: OnlyMethodKeysOf<T>[];
  observablePropsToSpyOn?: OnlyObservablePropsOf<T>[];
  /**
   * Getters to replace with a spied accessor.
   *
   * Any string key of `T` may be named: whether a member is an accessor is decided by its
   * descriptor on the prototype, not by the type of the value it returns — and a name that has no
   * accessor there is reported at runtime, with the reason. For a **signal-valued** getter prefer
   * `mockSignalProp(service, 'state', initial)` (`/angular`): a spied getter returns `undefined`
   * until it is configured, while a real signal keeps everything downstream of it reactive.
   */
  gettersToSpyOn?: AccessorKeysOf<T>[];
  /** Setters to replace with a spied accessor. See {@link gettersToSpyOn}. */
  settersToSpyOn?: AccessorKeysOf<T>[];
  /** Auto-discover and spy every getter/setter on the prototype chain (merged with the explicit lists). */
  autoSpyAccessors?: boolean;
  /**
   * Answer a member the prototype never named with a spy, instead of leaving it absent.
   *
   * For a **partially abstract** class — `abstract` declarations plus at least one concrete member,
   * the ordinary Angular DI-token shape. `abstract read(): string` is erased before it reaches a
   * prototype, so discovery finds only the concrete members; the empty-prototype fallback that
   * covers a *fully* abstract class does not fire, and every abstract member is missing while
   * `Spy<T>` types it as present. The read yields `undefined` and the failure lands in production
   * code as `… is not a function`.
   *
   * ```ts
   * abstract class LocalStorage {
   *   abstract read(key: string): string | null;
   *   clear(): void {}
   * }
   *
   * provideAutoSpy(LocalStorage, { fillMissing: true });
   * ```
   *
   * Opt-in, and it has to be: TypeScript erases `abstract`, so at runtime this class and a concrete
   * one are indistinguishable, and filling every unknown key by default would silence a genuine
   * typo on every class in the suite. Naming the members in {@link instanceMethodsToSpyOn} stays the
   * alternative when the list is short and worth stating.
   */
  fillMissing?: boolean;
  /**
   * What each named method returns, applied as the spy is built.
   *
   * ```ts
   * providers: [provideAutoSpy(ProductsService, { returns: { getProducts: of([]) } })];
   * ```
   *
   * The alternative is a second statement in every `beforeEach` — `injectSpy(X).m.mockReturnValue(…)`
   * — and the shortcut people take instead is an exported `const` provider carrying the values,
   * which under `isolate: false` is one set of spies shared by every file that imports it.
   *
   * This installs an implementation, exactly as `mockReturnValue` does, so a `calledWith(…)` chain
   * configured **afterwards** on the same method no longer decides the value. Configure one or the
   * other per method, not both.
   */
  returns?: MethodReturns<T>;
  /**
   * Values for members that are **not** method results — an Observable property the code under test
   * subscribes to, a plain field, a signal.
   *
   * The counterpart of {@link returns}, and the symmetry that was missing: `provideAutoSpyForToken`
   * has taken property seeds since it was introduced, while the class-based factory took only
   * method configuration, so a double needing both had to be provided in one statement and finished
   * in another. Seeded last, so a member named here wins over anything discovery or
   * `observablePropsToSpyOn` produced for the same key.
   *
   * ```ts
   * provideAutoSpy(FavoritesService, {
   *   overrides: { favoritesCacheUpdated$: of(undefined), favoriteItems: [] },
   *   returns: { load: of([]) },
   * });
   * ```
   *
   * A seeded key is stored exactly as written and is **not** a spy — that is the difference from
   * `returns`, which configures the spy the factory built. Seed a real `Subject` here when the spec
   * drives the stream itself; name the method in `returns` when it should stay assertable.
   */
  overrides?: DeepPartial<T>;
  /**
   * Materialize each method spy on first access instead of building all of them up front.
   *
   * **On by default.** On a forty-method class where a test touches two, holding two thousand spies
   * costs 27 ms and 35 MB lazily against 257 ms and 425 MB eagerly. The reverse case — a test that
   * calls every method — pays 5% in time and 1% in memory for the accessor indirection, which is why
   * this is a default rather than a choice.
   *
   * Set `false` only when a spec inspects the spy through property descriptors; enumeration
   * (`Object.keys`, spread, snapshots) already works, since the placeholders are enumerable.
   */
  lazySpies?: boolean;
}
