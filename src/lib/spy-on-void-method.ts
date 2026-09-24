/**
 * `spyOnVoidMethod` — assert a handler called a native void method on a real event or element.
 *
 * `preventDefault`, `stopPropagation`, `focus`, `click`: a strict suite wants them recorded, and
 * the double-shaped route names the method twice — once in `onlyMethodsToSpyOn`, once in `returns`,
 * because an unconfigured void method otherwise trips the strict guard the moment the handler
 * calls it. This packs both halves: the target keeps every other member real, and the one spy
 * answers `undefined` when the handler calls it, the way the platform method would.
 */
import { createSpyFromInstance } from './create-spy-from-instance';
import type { MethodReturns, OnlyMethodKeysOf, Spy } from './types';

/**
 * Spy one void-returning method of a real event or element, recording calls without running any.
 *
 * @example
 * ```ts
 * const preventDefault = spyOnVoidMethod(event, 'preventDefault');
 *
 * handler(event);
 * expect(preventDefault).toHaveBeenCalledTimes(1);
 * ```
 *
 * @remarks
 * Equivalent to `createSpyFromInstance(target, { onlyMethodsToSpyOn: [method], returns: { [method]: undefined } })[method]`:
 * the seed `returns` value is what keeps a strict suite from throwing on the call this spy exists
 * to observe. For a method whose real behaviour the test needs as well as the record, use
 * {@link spyOnOwnMethod}.
 */
export function spyOnVoidMethod<T extends object, Method extends OnlyMethodKeysOf<T>>(target: T, method: Method): Spy<T>[Method] {
  return createSpyFromInstance(target, {
    onlyMethodsToSpyOn: [method],
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a computed generic key widens to a string index no mapped type accepts; at run time the key is `method` and `undefined` is a value `MethodReturns<T>` takes for every method.
    returns: { [method]: undefined } as MethodReturns<T>,
  })[method];
}
