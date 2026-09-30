import type { Func, OnlyMethodKeysOf, Spy } from './types';

declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyInnerDoubles__: WeakMap<object, Map<string, object>> | undefined;
}

// On `globalThis`: every entry bundle carries its own copy of the factories, and the double built by
// `provideAutoSpy` from `/angular` has to be readable through `innerDouble` from the root entry.
function registry(): WeakMap<object, Map<string, object>> {
  return (globalThis.__vitestAutoSpyInnerDoubles__ ??= new WeakMap());
}

/** Remember the `returnsClass` doubles an outer double answers, by method name. */
export function recordInnerDoubles(outer: object, doubles: Record<string, object> | undefined): void {
  const entries = Object.entries(doubles ?? {});

  if (entries.length > 0) {
    registry().set(outer, new Map([...(registry().get(outer) ?? []), ...entries]));
  }
}

/**
 * The double a `returnsClass` method answers, read without calling the method — so a spec that counts
 * the factory's calls, or configures the inner double before the code under test runs, records nothing.
 *
 * ```ts
 * const dialog = createSpyFromClass(MatDialog, { returnsClass: { open: MatDialogRef } });
 *
 * innerDouble(dialog, 'open').afterClosed.nextWith(true);
 * ```
 *
 * The same object every call of the method answers. Throws when the method has no `returnsClass`
 * entry on this double, or when `returns` answers it instead.
 */
export function innerDouble<T, K extends OnlyMethodKeysOf<T>>(
  outer: Spy<T>,
  method: K,
): Required<T>[K] extends Func ? Spy<ReturnType<Required<T>[K]>> : never {
  const double = registry().get(outer)?.get(method);

  if (double === undefined) {
    throw new Error(
      `[vitest-auto-spy] innerDouble: '${method}' has no returnsClass entry on this double, so there is no inner double to read. ` +
        `Name it in the configuration, { returnsClass: { ${method}: SomeClass } }, or read what it answers with asSpy(double.${method}(…)).`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- recorded under this name by the factory that built `outer` from the `returnsClass` entry typed against the method's return.
  return double as Required<T>[K] extends Func ? Spy<ReturnType<Required<T>[K]>> : never;
}
