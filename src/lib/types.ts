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
export type Func = (...args: any[]) => any;

/** A constructable class (with arbitrary static members). */
export type ClassType<T> = { new (...args: any[]): T; [key: string]: any };

// ---------------------------------------------------------------------------
// Key filters — pick keys of `T` whose value matches a given type
// ---------------------------------------------------------------------------

type StringKeysForPropertyType<ObjectType, PropType> = Extract<
  { [Key in keyof ObjectType]: ObjectType[Key] extends PropType ? Key : never }[keyof ObjectType],
  string
>;

/** Keys of `T` that are methods. */
export type OnlyMethodKeysOf<T> = StringKeysForPropertyType<T, (...args: any[]) => any>;

/** Keys of `T` that are `Observable` properties. */
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
export type ErrorValueConfig = { errorValue: any; delay?: number };

/** Complete the stream (optionally delayed). */
export type CompleteValueConfig = { complete?: boolean; delay?: number };

/** One entry in a precise emission sequence. */
export type ValueConfig<T> = NextValueConfig<T> | ErrorValueConfig | CompleteValueConfig;

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
  throwWith(value: any): void;
  complete(): void;
  returnSubject(): Subject<T>;
}

/** Helpers attached to a `Promise`-returning spy. */
export interface AddPromiseSpyMethods<T> {
  resolveWith(value?: T): void;
  rejectWith(value?: any): void;
  resolveWithPerCall(valuesPerCall: ValueConfigPerCall<T>[]): void;
}

/** A configured `mockReturnValue` continuation for a `calledWith`/`mustBeCalledWith` chain. */
export type WithMockReturnValue<Method extends Func> = {
  mockReturnValue: (value: ReturnType<Method>) => void;
};

/** Argument-matching helpers attached to a plain (sync) spy. */
export interface AddCalledWithSpyMethods<Method extends Func> {
  calledWith(...args: Parameters<Method>): WithMockReturnValue<Method>;
  mustBeCalledWith(...args: Parameters<Method>): WithMockReturnValue<Method>;
}

/** Argument-matching helpers that resolve to observable helpers. */
export type AddCalledWithObservable<O> = {
  calledWith(...args: any[]): AddObservableSpyMethods<O>;
  mustBeCalledWith(...args: any[]): AddObservableSpyMethods<O>;
};

/** Argument-matching helpers that resolve to promise helpers. */
export type AddCalledWithPromise<P> = {
  calledWith(...args: any[]): AddPromiseSpyMethods<P>;
  mustBeCalledWith(...args: any[]): AddPromiseSpyMethods<P>;
};

/** Wrap a method's spy with the helper bundle chosen by its return type. */
export type AddSpyMethodsByReturnTypes<Method extends Func> = Method &
  Mock &
  (Method extends (...args: any[]) => infer ReturnType
    ? ReturnType extends Promise<infer P>
      ? AddPromiseSpyMethods<P> & AddCalledWithPromise<P>
      : ReturnType extends Observable<infer O>
        ? AddObservableSpyMethods<O> & AddCalledWithObservable<O>
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

/** Fully-typed spy of `T`. */
export type Spy<T> = {
  [K in keyof T]: T[K] extends Func
    ? AddSpyMethodsByReturnTypes<T[K]>
    : T[K] extends Observable<infer O>
      ? T[K] & AddObservableSpyMethods<O>
      : T[K];
} & AddAccessorsSpies<T>;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Restricts/extends what `createSpyFromClass` spies on. */
export interface ClassSpyConfiguration<T> {
  methodsToSpyOn?: OnlyMethodKeysOf<T>[];
  observablePropsToSpyOn?: OnlyObservablePropsOf<T>[];
  settersToSpyOn?: OnlyPropsOf<T>[];
  gettersToSpyOn?: OnlyPropsOf<T>[];
}
