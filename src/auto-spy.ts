/**
 * vitest-auto-spy
 * ===============
 *
 * Create automatic, fully-typed test spies from a class. The core is
 * runtime-agnostic: it talks to the host test runner through a `MockAdapter`,
 * and importing this entry registers the default Vitest adapter (`vi.fn()` /
 * `vi.spyOn()`), so it stays zero-config. A drop-in replacement for
 * [`jest-auto-spies`](https://www.npmjs.com/package/jest-auto-spies), with the
 * exact same API surface.
 *
 * ```ts
 * // framework-agnostic core (sync + promise + accessor spies)
 * import { createSpyFromClass } from 'vitest-auto-spy';
 *
 * // opt-in layers — import only what you use:
 * import 'vitest-auto-spy/rxjs';                       // enables observable spies
 * import { provideAutoSpy } from 'vitest-auto-spy/angular'; // Angular TestBed helpers
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
 * Add extra callables, restrict to a list, or add observable/getter/setter spies:
 *
 * ```ts
 * // added to the discovered prototype methods, as in `jest-auto-spies`
 * createSpyFromClass(MyService, ['reload', 'count']);
 *
 * // nothing but these — prototype discovery is skipped
 * createSpyFromClass(MyService, { onlyMethodsToSpyOn: ['getName', 'getAge'] });
 *
 * createSpyFromClass(MyService, {
 *   methodsToSpyOn: ['reload'],
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
 * ## Optional layers
 * --------------------------------------------------------------------------
 *
 * Observable spies live behind `vitest-auto-spy/rxjs` and Angular TestBed
 * helpers behind `vitest-auto-spy/angular`, so a plain Node / Bun / React / Vue
 * project pulls neither rxjs nor Angular into its runtime bundle unless it opts
 * in — and, since 4.0.0, not into its TypeScript program either: no declaration
 * this package ships names an rxjs type (see `ObservableLike` in `lib/types.ts`):
 *
 * ```ts
 * import 'vitest-auto-spy/rxjs'; // nextWith / nextWithValues / observablePropsToSpyOn / …
 * import { provideAutoSpy, injectSpy } from 'vitest-auto-spy/angular';
 * ```
 *
 * --------------------------------------------------------------------------
 *
 * This file is the public core barrel: the implementation lives in `./lib/*`.
 */

// Public types
export type * from './lib/types';

// Core factories
export { createSpyFromClass } from './lib/create-spy-from-class';
export { autoMocked, createAutoMock, type AutoMockConfiguration } from './lib/auto-mock';
export { createMock } from './lib/create-mock';
export { createFixture, createFixtureFactory, type FixtureFactory } from './lib/fixture';
export { mockDeep, type MockDeepOptions } from './lib/mock-deep';
export { createFunctionSpy } from './lib/function-spy';

// Taking hold of an argument the code under test built, rather than describing its shape
export { captureArg, type ArgCaptor } from './lib/capture-arg';

// Reset helpers
export { clearAutoSpy, resetAutoSpy } from './lib/reset-auto-spy';

// mustBeCalledWith error reporting
export { errorHandler } from './lib/error-handler';

// Property mocking (framework-agnostic; also re-exported from the Angular entry, where it started)
export {
  countMockedProps,
  mockAccessorsProp,
  mockReadonlyProp,
  mockReadonlyPropGetter,
  mockValueProp,
  restoreMockedProps,
  type AccessorImplementations,
  type RestoreProp,
} from './lib/prop-mock';

// Observable assertions that fail when the stream stays silent
export {
  expectCompletion,
  expectEmission,
  expectEmissions,
  expectError,
  expectNoEmission,
  setEmissionTimeout,
  type CallbackSubscribable,
  type EmissionObserver,
  type EmissionOptions,
  type EmissionSource,
  type SubscribableLike,
} from './lib/expect-emission';

// Type bridges between `Spy<T>` and `T`, plus a construction-compatible spy
export { asInstance, asInstances, asSpy, createSpyClass, type AsInstances, type ConstructorSpy } from './lib/spy-typing';

// Saying which branch of a union a test got, so the failure names the shape it actually had
export { narrow } from './lib/narrow';

// A fixture built from a model instance: its getters read once, as data
export { withOverrides } from './lib/with-overrides';

// Doubles for the things production code builds with `new` — a runner mock alone cannot serve them
export { mockConstructor, stubConstructor, type ConstructorMock } from './lib/constructor-spy';

// One real event-loop turn, even under fake timers — for module loading and native async
export { flushEventLoop, flushEventLoopUntil, settleDynamicImport, type FlushUntilOptions } from './lib/event-loop';

// Module mocking: proving a `vi.mock` applied, and giving its factory a shape interop recognises
export {
  assertMocked,
  moduleNamespace,
  type AssertMockedOptions,
  type ModuleNamespace,
  type ModuleNamespaceOptions,
} from './lib/module-mocks';

// Duplicate-install detection (`setupAutoSpy()` turns this into a failed run)
export { describeDuplicateCopies, getPackageCopies } from './lib/package-identity';
