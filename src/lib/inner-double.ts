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
 *
 * A generic method reads back with its type parameters as `unknown`; name the type instead —
 * `innerDouble<SnackBarRef<Comp>>(snackBar, 'openFromComponent')` — which, like a cast, is not
 * checked against the method.
 */
export function innerDouble<T, K extends OnlyMethodKeysOf<T>>(
  outer: Spy<T>,
  method: K,
): Required<T>[K] extends Func ? Spy<ReturnType<Required<T>[K]>> : never;
export function innerDouble<R = never>(outer: [R] extends [never] ? never : object, method: string): Spy<R>;
export function innerDouble(outer: object, method: string): object {
  const double = registry().get(outer)?.get(method);

  if (double === undefined) {
    throw new Error(
      `[vitest-auto-spy] innerDouble: '${method}' has no returnsClass entry on this double, so there is no inner double to read. ` +
        `Name it in the configuration, { returnsClass: { ${method}: SomeClass } }, or read what it answers with asSpy(double.${method}(…)).`,
    );
  }

  return double;
}
