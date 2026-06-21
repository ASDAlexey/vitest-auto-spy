/**
 * vitest-auto-spy
 * ===============
 *
 * Create automatic, fully-typed test spies from a class — powered by Vitest's
 * `vi.fn()`. A drop-in replacement for [`jest-auto-spies`](https://www.npmjs.com/package/jest-auto-spies),
 * with the exact same API surface but spying only on Vitest.
 *
 * ```ts
 * import { createSpyFromClass, provideAutoSpy } from 'vitest-auto-spy';
 * ```
 *
 * --------------------------------------------------------------------------
 * ## createSpyFromClass — the core
 * --------------------------------------------------------------------------
 *
 * ```ts
 * let myService: Spy<MyService>;
 *
 * beforeEach(() => {
 *   // every method of MyService becomes a vi.fn()
 *   myService = createSpyFromClass(MyService);
 * });
 * ```
 *
 * Restrict what gets spied, or add observable/getter/setter spies:
 *
 * ```ts
 * createSpyFromClass(MyService, ['getName', 'getAge']);
 *
 * createSpyFromClass(MyService, {
 *   methodsToSpyOn: ['getName'],
 *   observablePropsToSpyOn: ['products$'],
 *   gettersToSpyOn: ['userName'],
 *   settersToSpyOn: ['userName'],
 * });
 * ```
 *
 * --------------------------------------------------------------------------
 * ## Synchronous methods
 * --------------------------------------------------------------------------
 *
 * ```ts
 * // standard vi.fn() API
 * myService.getName.mockReturnValue('Fake Name');
 *
 * // conditional return by arguments
 * myService.getName.calledWith(1).mockReturnValue('Fake Name');
 *
 * // throw if called with the "wrong" arguments
 * myService.getName.mustBeCalledWith(1).mockReturnValue('Fake Name');
 * ```
 *
 * --------------------------------------------------------------------------
 * ## Promise-returning methods
 * --------------------------------------------------------------------------
 *
 * ```ts
 * myService.getProducts.resolveWith([{ name: 'Product 1' }]);
 * myService.getProducts.rejectWith('FAKE ERROR');
 *
 * myService.getProducts.calledWith(1).resolveWith([{ name: 'Product 1' }]);
 * ```
 *
 * --------------------------------------------------------------------------
 * ## Observable-returning methods / observable properties
 * --------------------------------------------------------------------------
 *
 * ```ts
 * myService.getProducts$.nextWith([{ name: 'Product 1' }]); // emit, stays open
 * myService.getProducts$.nextOneTimeWith([{ name: 'X' }]);  // emit + complete
 * myService.getProducts$.throwWith('FAKE ERROR');           // error the stream
 * myService.getProducts$.complete();                        // complete the stream
 *
 * // emit a precise sequence (values, errors, completion, delays)
 * myService.getProducts$.nextWithValues([
 *   { value: [{ name: 'Product 1' }] },
 *   { errorValue: 'FAKE ERROR' },
 *   { complete: true },
 * ]);
 *
 * // grab the underlying Subject for manual control
 * const subject = myService.getProducts$.returnSubject();
 * ```
 *
 * --------------------------------------------------------------------------
 * ## Getters & setters
 * --------------------------------------------------------------------------
 *
 * ```ts
 * const spy = createSpyFromClass(MyService, {
 *   gettersToSpyOn: ['userName'],
 *   settersToSpyOn: ['userName'],
 * });
 *
 * spy.accessorSpies.getters.userName.mockReturnValue('Fake Name');
 * expect(spy.userName).toBe('Fake Name');
 *
 * spy.userName = 'New Name';
 * expect(spy.accessorSpies.setters.userName).toHaveBeenCalledWith('New Name');
 * ```
 *
 * --------------------------------------------------------------------------
 * ## Angular helpers (bonus)
 * --------------------------------------------------------------------------
 *
 * ```ts
 * TestBed.configureTestingModule({
 *   providers: [provideAutoSpy(MyService)],
 * });
 *
 * const service = injectSpy(MyService);
 *
 * // signals / readonly / accessor property mocking
 * mockReadonlyProp(service, 'isReady', true);
 * mockReadonlyPropGetter(service, 'label', () => 'A');
 * mockAccessorsProp(service, 'theme');
 * ```
 */

import { defer, EMPTY, from, merge, Observable, of, ReplaySubject, Subject, throwError, timer } from 'rxjs';
import { concatMap, delay, switchMap, take, takeUntil, takeWhile } from 'rxjs/operators';
import { TestBed } from '@angular/core/testing';
import { stringify } from 'javascript-stringify';
import { type Mock, type MockInstance, vi } from 'vitest';

// ===========================================================================
// Shared types (mirrors @hirez_io/auto-spies-core)
// ===========================================================================

export type Func = (...args: any[]) => any;

export type ClassType<T> = { new (...args: any[]): T; [key: string]: any };

type StringKeysForPropertyType<ObjectType, PropType> = Extract<
  { [Key in keyof ObjectType]: ObjectType[Key] extends PropType ? Key : never }[keyof ObjectType],
  string
>;

export type OnlyMethodKeysOf<T> = StringKeysForPropertyType<T, (...args: any[]) => any>;
export type OnlyObservablePropsOf<T> = StringKeysForPropertyType<T, Observable<any>>;
export type OnlyPropsOf<ObjectType> = Extract<
  { [Key in keyof ObjectType]: ObjectType[Key] extends Func ? never : Key }[keyof ObjectType],
  string
>;

export type ValueConfigPerCall<T> = { value: T; delay?: number; doNotComplete?: boolean };

export type NextValueConfig<T> = { value: T; delay?: number };
export type ErrorValueConfig = { errorValue: any; delay?: number };
export type CompleteValueConfig = { complete?: boolean; delay?: number };
export type ValueConfig<T> = NextValueConfig<T> | ErrorValueConfig | CompleteValueConfig;

export interface AddObservableSpyMethods<T> {
  nextWith(value?: T): void;
  /** emit one value then complete */
  nextOneTimeWith(value?: T): void;
  nextWithValues(valuesConfigs: ValueConfig<T>[]): void;
  nextWithPerCall(valuesPerCall?: ValueConfigPerCall<T>[]): Subject<T>[];
  throwWith(value: any): void;
  complete(): void;
  returnSubject(): Subject<T>;
}

export interface AddPromiseSpyMethods<T> {
  resolveWith(value?: T): void;
  rejectWith(value?: any): void;
  resolveWithPerCall(valuesPerCall: ValueConfigPerCall<T>[]): void;
}

export interface AddCalledWithSpyMethods<Method extends Func> {
  calledWith(...args: Parameters<Method>): { mockReturnValue: (value: ReturnType<Method>) => void };
  mustBeCalledWith(...args: Parameters<Method>): { mockReturnValue: (value: ReturnType<Method>) => void };
}

type AddCalledWithObservable<O> = {
  calledWith(...args: any[]): AddObservableSpyMethods<O>;
  mustBeCalledWith(...args: any[]): AddObservableSpyMethods<O>;
};
type AddCalledWithPromise<P> = {
  calledWith(...args: any[]): AddPromiseSpyMethods<P>;
  mustBeCalledWith(...args: any[]): AddPromiseSpyMethods<P>;
};

/** Wrap a method's spy with helpers chosen by its return type. */
export type AddSpyMethodsByReturnTypes<Method extends Func> = Method &
  Mock &
  (Method extends (...args: any[]) => infer ReturnType
    ? ReturnType extends Promise<infer P>
      ? AddPromiseSpyMethods<P> & AddCalledWithPromise<P>
      : ReturnType extends Observable<infer O>
        ? AddObservableSpyMethods<O> & AddCalledWithObservable<O>
        : AddCalledWithSpyMethods<Method>
    : never);

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

export interface ClassSpyConfiguration<T> {
  methodsToSpyOn?: OnlyMethodKeysOf<T>[];
  observablePropsToSpyOn?: OnlyObservablePropsOf<T>[];
  settersToSpyOn?: OnlyPropsOf<T>[];
  gettersToSpyOn?: OnlyPropsOf<T>[];
}

// ===========================================================================
// ArgsMap — serialize argument lists into stable keys
// ===========================================================================

class ArgsMap {
  private map: { [key: string]: any } = {};

  // `stringify` always serializes an argument array to a string, so the cast is safe.
  set(key: unknown, value: unknown): void {
    this.map[stringify(key) as string] = value;
  }

  get(key: unknown): any {
    return this.map[stringify(key) as string];
  }
}

// ===========================================================================
// Error handler — used by mustBeCalledWith
// ===========================================================================

export const errorHandler = {
  throwArgumentsError(actualArgs: any[], functionName: string): void {
    let errorMessage =
      `The function '${functionName}' was configured with 'mustBeCalledWith' ` +
      `and expects to be called with specific arguments. `;

    if (actualArgs.length === 0) {
      errorMessage += `But the function was called without any arguments.`;
    } else {
      let formattedArgs = stringify(actualArgs) as string;
      formattedArgs = formattedArgs.substring(1, formattedArgs.length - 1);
      errorMessage += `But the actual arguments were: ${formattedArgs}`;
    }

    throw new Error(errorMessage);
  },
};

// ===========================================================================
// Internal value containers
// ===========================================================================

interface ReturnValueContainer {
  value: any;
  _isRejectedPromise?: boolean;
  valuesPerCalls?: { wrappedValue: Promise<any> | Observable<any>; delay?: number }[];
}

interface CalledWithObject {
  wasConfigured: boolean;
  argsToValuesMap: ArgsMap;
  [extra: string]: any;
}

// ===========================================================================
// Observable helpers
// ===========================================================================

function createReplaySubject<T>(): ReplaySubject<T> {
  return new ReplaySubject<T>(1);
}

function mergeSubjectWithDefaultValues<T>(
  subject: ReplaySubject<T>,
  valuesConfigs: ValueConfig<T>[],
): Observable<T> {
  const onCompleteSubject = new ReplaySubject<void>(1);
  const results$ = from(valuesConfigs).pipe(
    concatMap((valueConfig) => {
      if ('complete' in valueConfig && valueConfig.complete && valueConfig.delay) {
        return of(valueConfig).pipe(delay(valueConfig.delay));
      }
      return of(valueConfig);
    }),
    takeWhile((valueConfig) => {
      if (!('complete' in valueConfig)) {
        return true;
      }
      if (valueConfig.complete) {
        onCompleteSubject.next();
        return false;
      }
      return true;
    }),
    concatMap((valueConfig) => {
      if ('value' in valueConfig && valueConfig.value) {
        if (valueConfig.delay) {
          return of(valueConfig.value).pipe(delay(valueConfig.delay));
        }
        return of(valueConfig.value);
      }
      if ('errorValue' in valueConfig && valueConfig.errorValue) {
        if (valueConfig.delay) {
          return timer(valueConfig.delay).pipe(switchMap(() => throwError(() => valueConfig.errorValue)));
        }
        return throwError(() => valueConfig.errorValue);
      }
      return EMPTY;
    }),
  );
  return merge(results$, subject.pipe(takeUntil(onCompleteSubject)));
}

function addObservableHelpers<T>(
  objectToDecorate: any,
  providedSubject: ReplaySubject<T>,
  onSubjectConfigured: (subject: Observable<T>) => void,
): void {
  objectToDecorate.nextWith = (value: T): void => {
    providedSubject.next(value);
    onSubjectConfigured(providedSubject);
  };
  objectToDecorate.nextOneTimeWith = (value: T): void => {
    providedSubject.next(value);
    providedSubject.complete();
    onSubjectConfigured(providedSubject);
  };
  objectToDecorate.nextWithValues = (valuesConfigs: ValueConfig<T>[]): void => {
    if (valuesConfigs.length === 0) {
      return;
    }
    onSubjectConfigured(mergeSubjectWithDefaultValues(providedSubject, valuesConfigs));
  };
  objectToDecorate.throwWith = (value: any): void => {
    providedSubject.error(value);
    onSubjectConfigured(providedSubject);
  };
  objectToDecorate.complete = (): void => {
    providedSubject.complete();
    onSubjectConfigured(providedSubject);
  };
  objectToDecorate.returnSubject = (): ReplaySubject<T> => {
    onSubjectConfigured(providedSubject);
    return providedSubject;
  };
}

function addNextWithPerCall(
  objectToDecorate: any,
  returnValueContainer: ReturnValueContainer,
  onConfigured: (c: ReturnValueContainer) => void = () => undefined,
): void {
  objectToDecorate.nextWithPerCall = (valueConfigsPerCall: ValueConfigPerCall<any>[]): ReplaySubject<any>[] => {
    const returnedSubjects: ReplaySubject<any>[] = [];
    if (valueConfigsPerCall.length === 0) {
      return returnedSubjects;
    }
    returnValueContainer.valuesPerCalls = [];
    valueConfigsPerCall.forEach((valueConfiguration) => {
      const replaySubject = new ReplaySubject<any>(1);
      replaySubject.next(valueConfiguration.value);
      returnedSubjects.push(replaySubject);

      let returnedObservable: Observable<any> = replaySubject.asObservable();
      if (valueConfiguration.delay) {
        returnedObservable = returnedObservable.pipe(delay(valueConfiguration.delay));
      }
      if (!valueConfiguration.doNotComplete) {
        returnedObservable = returnedObservable.pipe(take(1));
      }
      returnValueContainer.valuesPerCalls!.push({ wrappedValue: returnedObservable });
    });
    onConfigured(returnValueContainer);
    return returnedSubjects;
  };
}

function addObservableHelpersToFunctionSpy(spyFunction: any, valueContainer: ReturnValueContainer): void {
  const subject = createReplaySubject();
  addObservableHelpers(spyFunction, subject, (configuredSubject) => {
    valueContainer.value = configuredSubject;
  });
  addNextWithPerCall(spyFunction, valueContainer);
}

function addObservableHelpersToCalledWithObject(calledWithObject: CalledWithObject, calledWithArgs: any[]): void {
  const subject = createReplaySubject();
  const returnValueContainer: ReturnValueContainer = { value: undefined };
  addObservableHelpers(calledWithObject, subject, (configuredSubject) => {
    returnValueContainer.value = configuredSubject;
    calledWithObject.argsToValuesMap.set(calledWithArgs, returnValueContainer);
  });
  addNextWithPerCall(calledWithObject, returnValueContainer, (configured) => {
    calledWithObject.argsToValuesMap.set(calledWithArgs, configured);
  });
}

/** Build a standalone Observable that emits the provided value configs. */
export function createObservableWithValues<T>(valuesConfigs: ValueConfig<T>[]): Observable<T>;
export function createObservableWithValues<T>(
  valuesConfigs: ValueConfig<T>[],
  config: { returnSubject: true },
): { values$: Observable<T>; subject: ReplaySubject<T> };
export function createObservableWithValues<T>(
  valuesConfigs: ValueConfig<T>[],
  config?: { returnSubject: boolean },
): Observable<T> | { values$: Observable<T>; subject: ReplaySubject<T> } {
  const subject = createReplaySubject<T>();
  const values$ = mergeSubjectWithDefaultValues(subject, valuesConfigs);
  if (config && config.returnSubject) {
    return { values$, subject };
  }
  return values$;
}

/** Create an observable property spy (deferred subscription to a controllable subject). */
function createObservablePropSpy<T>(): Observable<T> & AddObservableSpyMethods<T> {
  let subject = createReplaySubject<T>();
  const observableSpy: any = defer(() => subject);
  addObservableHelpers(observableSpy, subject, (configuredSubject) => {
    subject = configuredSubject as ReplaySubject<T>;
  });
  return observableSpy;
}

// ===========================================================================
// Promise helpers
// ===========================================================================

function addPromiseHelpersToFunctionSpy(spyFunction: any, valueContainer: ReturnValueContainer): void {
  spyFunction.resolveWith = (value?: any): void => {
    valueContainer.value = Promise.resolve(value);
  };
  spyFunction.rejectWith = (value?: any): void => {
    valueContainer.value = value;
    valueContainer._isRejectedPromise = true;
  };
  spyFunction.resolveWithPerCall = (valueConfigsPerCall: ValueConfigPerCall<any>[]): void => {
    if (valueConfigsPerCall.length === 0) {
      return;
    }
    valueContainer.valuesPerCalls = [];
    valueConfigsPerCall.forEach((valueConfiguration) => {
      valueContainer.valuesPerCalls!.push({
        wrappedValue: Promise.resolve(valueConfiguration.value),
        delay: valueConfiguration.delay,
      });
    });
  };
}

function addPromiseHelpersToCalledWithObject(calledWithObject: CalledWithObject, calledWithArgs: any[]): void {
  calledWithObject.resolveWith = (value?: any): void => {
    calledWithObject.argsToValuesMap.set(calledWithArgs, { value: Promise.resolve(value) });
  };
  calledWithObject.rejectWith = (value?: any): void => {
    calledWithObject.argsToValuesMap.set(calledWithArgs, { value, _isRejectedPromise: true });
  };
  calledWithObject.resolveWithPerCall = (valueConfigsPerCall: ValueConfigPerCall<any>[]): void => {
    if (valueConfigsPerCall.length === 0) {
      return;
    }
    const valueContainer: ReturnValueContainer = { value: undefined, valuesPerCalls: [] };
    valueConfigsPerCall.forEach((valueConfiguration) => {
      valueContainer.valuesPerCalls!.push({
        wrappedValue: Promise.resolve(valueConfiguration.value),
        delay: valueConfiguration.delay,
      });
    });
    calledWithObject.argsToValuesMap.set(calledWithArgs, valueContainer);
  };
}

// ===========================================================================
// Function spy factory
// ===========================================================================

function getNextCallValue(valueContainer: ReturnValueContainer): any {
  const wrapped = valueContainer.valuesPerCalls!.shift();
  let returnedValue = wrapped?.wrappedValue;
  if (wrapped && wrapped.delay) {
    returnedValue = (returnedValue as Promise<any>).then(
      (value) => new Promise((resolve) => setTimeout(() => resolve(value), wrapped.delay)),
    );
  }
  return returnedValue;
}

function returnTheCorrectFakeValue(
  calledWithObject: CalledWithObject,
  mustBeCalledWithObject: CalledWithObject,
  valueContainer: ReturnValueContainer,
  actualArgs: any[],
  functionName: string,
): any {
  if (calledWithObject.wasConfigured) {
    const configured = calledWithObject.argsToValuesMap.get(actualArgs);
    if (configured) {
      return unwrapContainer(configured);
    }
  }

  if (mustBeCalledWithObject.wasConfigured) {
    const configured = mustBeCalledWithObject.argsToValuesMap.get(actualArgs);
    if (configured) {
      return unwrapContainer(configured);
    }
    errorHandler.throwArgumentsError(actualArgs, functionName);
  }

  return unwrapContainer(valueContainer);
}

function unwrapContainer(container: ReturnValueContainer): any {
  if (container._isRejectedPromise) {
    return Promise.reject(container.value);
  }
  if (container.valuesPerCalls?.length) {
    return getNextCallValue(container);
  }
  return container.value;
}

function addMethodsToCalledWith(calledWith: CalledWithObject, calledWithArgs: any[]): CalledWithObject {
  calledWith.wasConfigured = true;
  calledWith.mockReturnValue = (value: any): void => {
    calledWith.argsToValuesMap.set(calledWithArgs, { value });
  };
  addPromiseHelpersToCalledWithObject(calledWith, calledWithArgs);
  addObservableHelpersToCalledWithObject(calledWith, calledWithArgs);
  return calledWith;
}

/** Create a single Vitest-backed function spy with all return-type helpers attached. */
export function createFunctionSpy<FunctionType extends Func>(name: string): AddSpyMethodsByReturnTypes<FunctionType> {
  const calledWithObject: CalledWithObject = { wasConfigured: false, argsToValuesMap: new ArgsMap() };
  const mustBeCalledWithObject: CalledWithObject = { wasConfigured: false, argsToValuesMap: new ArgsMap() };
  const valueContainer: ReturnValueContainer = { value: undefined };

  const functionSpy = vi.fn((...actualArgs: any[]) =>
    returnTheCorrectFakeValue(calledWithObject, mustBeCalledWithObject, valueContainer, actualArgs, name),
  );
  functionSpy.mockName(name);

  addPromiseHelpersToFunctionSpy(functionSpy, valueContainer);
  addObservableHelpersToFunctionSpy(functionSpy, valueContainer);

  (functionSpy as any).calledWith = (...calledWithArgs: any[]) =>
    addMethodsToCalledWith(calledWithObject, calledWithArgs);
  (functionSpy as any).mustBeCalledWith = (...calledWithArgs: any[]) =>
    addMethodsToCalledWith(mustBeCalledWithObject, calledWithArgs);

  return functionSpy as unknown as AddSpyMethodsByReturnTypes<FunctionType>;
}

// ===========================================================================
// Accessor (getter / setter) spies
// ===========================================================================

function defineWithEmptyAccessors(obj: any, prop: string): void {
  Object.defineProperty(obj, prop, {
    get() {
      return undefined;
    },
    set(_value: unknown) {
      /* noop */
    },
    configurable: true,
  });
}

function accessorSpyFactory(autoSpy: any, accessorName: string, accessorType: 'getter' | 'setter'): MockInstance {
  if (accessorType === 'setter') {
    return vi.spyOn(autoSpy, accessorName as never, 'set');
  }
  return vi.spyOn(autoSpy, accessorName as never, 'get');
}

function createAccessorsSpies(autoSpy: any, gettersToSpyOn: string[], settersToSpyOn: string[]): void {
  autoSpy.accessorSpies = { getters: {}, setters: {} };

  gettersToSpyOn.forEach((getterName) => {
    defineWithEmptyAccessors(autoSpy, getterName);
    autoSpy.accessorSpies.getters[getterName] = accessorSpyFactory(autoSpy, getterName, 'getter');
  });

  settersToSpyOn.forEach((setterName) => {
    if (!Object.prototype.hasOwnProperty.call(autoSpy, setterName)) {
      defineWithEmptyAccessors(autoSpy, setterName);
    }
    autoSpy.accessorSpies.setters[setterName] = accessorSpyFactory(autoSpy, setterName, 'setter');
  });
}

// ===========================================================================
// createSpyFromClass — assemble the full auto-spy
// ===========================================================================

function extractMethodsFromObject(obj: any): string[] {
  const descriptors = Object.getOwnPropertyDescriptors(obj);
  return Object.keys(descriptors).reduce<string[]>((names, name) => {
    if (name !== 'constructor' && !descriptors[name].get) {
      names.push(name);
    }
    return names;
  }, []);
}

function getAllMethodNames(obj: any): string[] {
  let methods: string[] = [];
  while (obj) {
    const parentObj = Object.getPrototypeOf(obj);
    if (parentObj) {
      methods = methods.concat(extractMethodsFromObject(obj));
    }
    obj = parentObj;
  }
  return methods;
}

/** Generate a fully-typed auto-spy from a class. */
export function createSpyFromClass<T>(
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: OnlyMethodKeysOf<T>[] | ClassSpyConfiguration<T>,
): Spy<T> {
  const methodNames = getAllMethodNames(ObjectClass.prototype);

  let methodsToSpyOn: string[] = [];
  let observablePropsToSpyOn: string[] = [];
  let settersToSpyOn: string[] = [];
  let gettersToSpyOn: string[] = [];

  if (methodsToSpyOnOrConfig) {
    if (Array.isArray(methodsToSpyOnOrConfig)) {
      methodsToSpyOn = methodsToSpyOnOrConfig as string[];
    } else {
      methodsToSpyOn = (methodsToSpyOnOrConfig.methodsToSpyOn as string[]) || [];
      observablePropsToSpyOn = (methodsToSpyOnOrConfig.observablePropsToSpyOn as string[]) || [];
      settersToSpyOn = (methodsToSpyOnOrConfig.settersToSpyOn as string[]) || [];
      gettersToSpyOn = (methodsToSpyOnOrConfig.gettersToSpyOn as string[]) || [];
    }
  }
  if (methodsToSpyOn.length > 0) {
    methodNames.push(...methodsToSpyOn);
  }

  const autoSpy: any = {};

  observablePropsToSpyOn.forEach((observablePropName) => {
    autoSpy[observablePropName] = createObservablePropSpy();
  });

  createAccessorsSpies(autoSpy, gettersToSpyOn, settersToSpyOn);

  methodNames.forEach((methodName) => {
    autoSpy[methodName] = createFunctionSpy(methodName);
  });

  return autoSpy as Spy<T>;
}

// ===========================================================================
// Angular helpers
// ===========================================================================

export type AngularValueProvider<T> = { provide: ClassType<T>; useValue: Spy<T> };

/** Shorthand Angular provider: `{ provide, useValue: createSpyFromClass(...) }`. */
export function provideAutoSpy<T>(
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: OnlyMethodKeysOf<T>[] | ClassSpyConfiguration<T>,
): AngularValueProvider<T> {
  return {
    provide: ObjectClass,
    useValue: createSpyFromClass(ObjectClass, methodsToSpyOnOrConfig),
  };
}

// ===========================================================================
// Bonus: TestBed + property mocking helpers
// ===========================================================================

/** Inject a service from Angular's `TestBed`, already typed as `Spy<T>`. */
export function injectSpy<T>(token: ClassType<T> | (abstract new (...args: never[]) => T)): Spy<T> {
  return TestBed.inject(token as never) as Spy<T>;
}

/** Override a readonly property (incl. `signal()` / `computed()`) with a static value. */
export function mockReadonlyProp<T, K extends keyof T>(object: T, property: K, value: unknown): void {
  Object.defineProperty(object, property, { get: () => value, configurable: true });
}

/** Override a readonly property with a dynamic getter. */
export function mockReadonlyPropGetter<T, K extends keyof T>(object: T, property: K, getter: () => unknown): void {
  Object.defineProperty(object, property, { get: getter, configurable: true });
}

/** Replace a property with spied `get`/`set` accessors (`vi.fn()`). */
export function mockAccessorsProp<T, K extends keyof T>(object: T, property: K): void {
  Object.defineProperty(object, property, { get: vi.fn(), set: vi.fn(), configurable: true });
}
