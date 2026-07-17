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

/** A constructable class (with arbitrary static members). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a class may be invoked with arbitrary constructor args and expose arbitrary static members; both `any`s model that open shape for `createSpyFromClass`.
export type ClassType<T> = { new (...args: any[]): T; [key: string]: any };

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
  calledWith(...args: Parameters<Method>): WithMockReturnValue<Method>;
  mustBeCalledWith(...args: Parameters<Method>): WithMockReturnValue<Method>;
}

/** Argument-matching helpers that resolve to observable helpers. */
export type AddCalledWithObservable<Method extends Func, O> = {
  calledWith(...args: Parameters<Method>): AddObservableSpyMethods<O>;
  mustBeCalledWith(...args: Parameters<Method>): AddObservableSpyMethods<O>;
};

/** Argument-matching helpers that resolve to promise helpers. */
export type AddCalledWithPromise<Method extends Func, P> = {
  calledWith(...args: Parameters<Method>): AddPromiseSpyMethods<P>;
  mustBeCalledWith(...args: Parameters<Method>): AddPromiseSpyMethods<P>;
};

/** Wrap a method's spy with the helper bundle chosen by its return type. */
export type AddSpyMethodsByReturnTypes<Method extends Func> = Method &
  Mock &
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the `(...args: any[]) => infer ReturnType` conditional only extracts the return type; the parameter shape is irrelevant here and a narrower signature would fail to match arbitrary methods.
  (Method extends (...args: any[]) => infer ReturnType
    ? ReturnType extends Promise<infer P>
      ? AddCalledWithPromise<Method, P> & AddPromiseSpyMethods<P>
      : ReturnType extends Observable<infer O>
        ? AddCalledWithObservable<Method, O> & AddObservableSpyMethods<O>
        : AddCalledWithSpyMethods<Method>
    : never);

// ---------------------------------------------------------------------------
// Accessor spies + the assembled `Spy<T>`
// ---------------------------------------------------------------------------

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
export type DeepMockProxy<T> = {
  [K in keyof T]: T[K] extends Func ? AddSpyMethodsByReturnTypes<T[K]> : T[K] extends object ? DeepMockProxy<T[K]> : T[K];
};

/** Fully-typed spy of `T`. */
export type Spy<T> = AddAccessorsSpies<T> & {
  [K in keyof T]: T[K] extends Func
    ? AddSpyMethodsByReturnTypes<T[K]>
    : T[K] extends Observable<infer O>
      ? AddObservableSpyMethods<O> & T[K]
      : T[K];
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Restricts/extends what `createSpyFromClass` spies on. */
export interface ClassSpyConfiguration<T> {
  methodsToSpyOn?: OnlyMethodKeysOf<T>[];
  observablePropsToSpyOn?: OnlyObservablePropsOf<T>[];
  settersToSpyOn?: OnlyPropsOf<T>[];
  gettersToSpyOn?: OnlyPropsOf<T>[];
  /** Auto-discover and spy every getter/setter on the prototype chain (merged with the explicit lists). */
  autoSpyAccessors?: boolean;
  /** Materialize each method spy lazily, on first access, instead of eagerly up-front (cheaper for large classes). */
  lazySpies?: boolean;
}
