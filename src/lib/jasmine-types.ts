/**
 * The typed shape of the `.and` / `.calls` / `.withArgs` namespaces, and the `Spy<T>` a suite
 * arriving from `jasmine-auto-spies` imports instead of the core one.
 *
 * These types are **not** folded into the core `Spy<T>`, deliberately. `.and` is a migration
 * surface, not a second way to write new specs, and putting ten jasmine strategy names into the
 * completion list of every spy in every project would tax the ninety-odd percent of users who never
 * touched jasmine. A suite that wants them says so once, in its import.
 *
 * The runtime half lives in `jasmine-namespaces.ts` and is installed only by the
 * `vitest-auto-spy/jasmine` entry.
 */
import type { Observable } from 'rxjs';
import type { Mock } from 'vitest';

import type { JasmineCallInfo } from './jasmine-namespaces';
import type {
  AddObservableSpyMethods,
  AddPromiseSpyMethods,
  AddSpyMethodsByReturnTypes,
  Func,
  SpyDisposable,
  ValueConfig,
  ValueConfigPerCall,
} from './types';

export type { JasmineCallInfo } from './jasmine-namespaces';

/**
 * jasmine's spy **strategies** — the `.and` members that replace what the spy does.
 *
 * Each returns the spy, as jasmine's do. Worth knowing, and true of jasmine as well: every one of
 * these installs an implementation, so a `calledWith` chain configured beforehand stops deciding
 * the value. {@link JasmineStrategies.callThrough} puts the library's own dispatch back.
 */
export interface JasmineStrategies<Method extends Func> {
  /** The spy's name — jasmine's `spy.and.identity`. */
  readonly identity: string;
  /** `spy.mockReturnValue(value)` under jasmine's name. */
  returnValue(value: ReturnType<Method>): AddSpyMethodsByReturnTypes<Method>;
  /** One value per call, in order; `undefined` once the list runs out. */
  returnValues(...values: ReturnType<Method>[]): AddSpyMethodsByReturnTypes<Method>;
  /** `spy.mockImplementation(fake)` under jasmine's name. */
  callFake(fake: Method): AddSpyMethodsByReturnTypes<Method>;
  /**
   * Put the library's own dispatch back, undoing a `returnValue` / `callFake` / `stub` — so
   * `calledWith`, `resolveWith` and `nextWith` decide the value again.
   *
   * @remarks
   * This is **not** jasmine's `callThrough`. There, it calls the real method a `spyOn` replaced; an
   * auto-spy never wrapped a real method, so there is nothing to call through *to* — which is why
   * `callThrough()` on a `jasmine-auto-spies` spy silently produced `undefined`. Restoring the
   * dispatch is the useful reading of the same word.
   */
  callThrough(): AddSpyMethodsByReturnTypes<Method>;
  /** Answer `undefined` and nothing else. */
  stub(): AddSpyMethodsByReturnTypes<Method>;
  /** Throw a message, an `Error`, or an error class constructed with `message`. */
  throwError(message: string): AddSpyMethodsByReturnTypes<Method>;
  throwError(error: Error): AddSpyMethodsByReturnTypes<Method>;
  throwError(errorClass: new (message?: string) => Error, message?: string): AddSpyMethodsByReturnTypes<Method>;
  /**
   * Return a promise resolved with `value`.
   *
   * The blunt form: it replaces the implementation, so `calledWith` no longer applies. Prefer
   * `.and.resolveWith(value)` on a promise-returning method, which routes through the same
   * machinery `calledWith` uses.
   */
  resolveTo(value?: Awaited<ReturnType<Method>>): AddSpyMethodsByReturnTypes<Method>;
}

/** `.and` on a method spy: jasmine's strategies plus whichever helper bundle the return type earns. */
export type JasmineAnd<Method extends Func> = JasmineStrategies<Method> &
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the conditional only extracts the return type; the parameter shape is irrelevant, and a narrower signature would fail to match arbitrary methods.
  (Method extends (...args: any[]) => infer Returned
    ? [Returned] extends [Promise<infer P>]
      ? AddPromiseSpyMethods<P>
      : [Returned] extends [Observable<infer O>]
        ? AddObservableSpyMethods<O>
        : unknown
    : unknown);

/**
 * jasmine's `.calls` bookkeeping.
 *
 * `object` and `returnValue` on a {@link JasmineCallInfo} are read from the host runner's own
 * records and are `undefined` on a runner that keeps none — see `jasmine-namespaces.ts`.
 */
export interface JasmineCalls {
  any(): boolean;
  count(): number;
  argsFor(index: number): unknown[];
  allArgs(): unknown[][];
  all(): JasmineCallInfo[];
  first(): JasmineCallInfo | undefined;
  mostRecent(): JasmineCallInfo | undefined;
  thisFor(index: number): unknown;
  /** Clear the recorded calls — the spy's configuration is untouched. */
  reset(): void;
  /**
   * A no-op, kept callable so a migrated spec still runs.
   *
   * jasmine copies call arguments defensively; no Vitest-family runner does, and snapshotting every
   * argument of every call would slow every spy in the suite for a helper that appears in a handful
   * of specs. Where the code under test mutates an argument afterwards, take the copy yourself.
   */
  saveArgumentsByValue(): void;
}

/** What `spy.withArgs(…).and` offers for a sync method: jasmine's terminal, plus this library's name for it. */
export interface JasmineWithArgsSync<Method extends Func> {
  returnValue(value: ReturnType<Method>): void;
  mockReturnValue(value: ReturnType<Method>): void;
}

/** `spy.withArgs(…).and` — the same object `calledWith(…)` returns, under jasmine's namespace. */
export type JasmineWithArgsAnd<Method extends Func> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see `JasmineAnd`.
  Method extends (...args: any[]) => infer Returned
    ? [Returned] extends [Promise<infer P>]
      ? AddPromiseSpyMethods<P>
      : [Returned] extends [Observable<infer O>]
        ? AddObservableSpyMethods<O>
        : JasmineWithArgsSync<Method>
    : JasmineWithArgsSync<Method>;

/** The three namespaces the jasmine layer adds to a method spy. */
export interface JasmineNamespaces<Method extends Func> {
  and: JasmineAnd<Method>;
  calls: JasmineCalls;
  /**
   * jasmine's argument-scoped configuration — this library's `calledWith` with the namespace moved.
   *
   * The one thing that does not carry over is jasmine's return value: there, `withArgs` hands back
   * a *spy*, so `expect(spy.withArgs(1)).toHaveBeenCalled()` is legal and has no counterpart here.
   * Assert on the spy itself with `toHaveBeenCalledWith(1)`.
   */
  withArgs(...args: Parameters<Method>): { and: JasmineWithArgsAnd<Method> };
}

/** A method spy with the jasmine namespaces on it. */
export type JasmineMethodSpy<Method extends Func> = AddSpyMethodsByReturnTypes<Method> & JasmineNamespaces<Method>;

/** An accessor spy with the jasmine namespaces on it — no `withArgs`, since there is no dispatch behind it. */
export type JasmineAccessorSpy = Mock & { and: JasmineStrategies<Func>; calls: JasmineCalls };

/** The `accessorSpies` bag, typed for jasmine. */
export interface JasmineAccessorSpies<T> {
  accessorSpies: {
    getters: { [K in keyof T]: JasmineAccessorSpy };
    setters: { [K in keyof T]: JasmineAccessorSpy };
  };
}

/**
 * `Spy<T>` for a suite migrating off `jasmine-auto-spies` — the core `Spy<T>` plus `.and`, `.calls`
 * and `.withArgs` on every method.
 *
 * Two differences from the type of the same name in `jasmine-auto-spies`, both of them removals:
 * this one carries Vitest's `MockInstance` rather than `jasmine.Spy`, and it therefore does **not**
 * drag the global `jasmine` namespace into your typecheck. `jasmine-auto-spies` opens its type
 * entry with `/// <reference types="jasmine" />`, so importing its `Spy<T>` requires
 * `@types/jasmine` to be installed even in a project that has no other use for it.
 */
export type JasmineSpy<T> = JasmineAccessorSpies<T> &
  SpyDisposable & {
    [K in keyof T]: T[K] extends Func
      ? JasmineMethodSpy<T[K]>
      : T[K] extends Observable<infer O>
        ? AddObservableSpyMethods<O> & T[K]
        : T[K];
  };

export type { ValueConfig, ValueConfigPerCall };
