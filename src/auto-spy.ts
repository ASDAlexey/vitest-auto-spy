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
 *
 * --------------------------------------------------------------------------
 *
 * This file is the public barrel: the implementation lives in `./lib/*`.
 */

// Public types
export type * from './lib/types';

// Core factories
export { createSpyFromClass } from './lib/create-spy-from-class';
export { createFunctionSpy } from './lib/function-spy';
export { createObservableWithValues } from './lib/observable-spy';

// mustBeCalledWith error reporting
export { errorHandler } from './lib/error-handler';

// Angular helpers (bonus)
export {
  injectSpy,
  mockAccessorsProp,
  mockReadonlyProp,
  mockReadonlyPropGetter,
  provideAutoSpy,
  type AngularValueProvider,
} from './lib/angular';
