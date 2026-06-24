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
 * ## Optional layers
 * --------------------------------------------------------------------------
 *
 * Observable spies live behind `vitest-auto-spy/rxjs` and Angular TestBed
 * helpers behind `vitest-auto-spy/angular`, so a plain Node / Bun / React / Vue
 * project pulls neither rxjs nor Angular into its runtime bundle unless it opts
 * in (the core's type surface still references rxjs types):
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
export { createAutoMock } from './lib/auto-mock';
export { createFunctionSpy } from './lib/function-spy';

// mustBeCalledWith error reporting
export { errorHandler } from './lib/error-handler';
