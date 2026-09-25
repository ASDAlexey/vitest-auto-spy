import { isAutoSpyLike } from './spy-mark';

/** How a value that won over a double reads in the failure: an auto-spy, a class instance, or a plain object. */
export function describeInstance(instance: object): string {
  if (isAutoSpyLike(instance)) {
    return 'an auto-spy';
  }

  const prototype = Reflect.getPrototypeOf(instance);
  const owner: unknown = prototype === null || prototype === Object.prototype ? undefined : Reflect.get(prototype, 'constructor');

  return typeof owner === 'function' ? `an instance of ${owner.name}` : 'a plain object';
}
