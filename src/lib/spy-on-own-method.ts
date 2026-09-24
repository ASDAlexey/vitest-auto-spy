/**
 * `spyOnOwnMethod` — observe one method of the object under test while it keeps working.
 *
 * The shape this replaces is the common one a spec reaches for when `vi.spyOn` is off the table:
 * `createSpyFromInstance(sut, { onlyMethodsToSpyOn: ['method'], passthrough: true })` plus a
 * destructuring, written out to say nothing more than "record calls to this method and still run
 * it". That is all this does — the rest of the object is left real, the named method calls
 * through until the test configures it, and the single spy comes back directly.
 */
import { createSpyFromInstance } from './create-spy-from-instance';
import type { OnlyMethodKeysOf, Spy } from './types';

/**
 * Spy one method of an object the test already holds, calling the real method through.
 *
 * @example
 * ```ts
 * const seek = spyOnOwnMethod(player, 'seek');
 *
 * player.seek(1000); // runs the real seek
 * expect(seek).toHaveBeenCalledWith(1000);
 * ```
 *
 * @remarks
 * Equivalent to `createSpyFromInstance(instance, { onlyMethodsToSpyOn: [method], passthrough: true })[method]`:
 * every other member stays the real one, and the real method runs until the test configures the
 * spy. Restore with {@link restoreSpiedInstance} on the instance, as for the factory this wraps.
 */
export function spyOnOwnMethod<T extends object, Method extends OnlyMethodKeysOf<T>>(instance: T, method: Method): Spy<T>[Method] {
  return createSpyFromInstance(instance, { onlyMethodsToSpyOn: [method], passthrough: true })[method];
}
