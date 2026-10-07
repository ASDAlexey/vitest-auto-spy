import { createFunctionSpy } from './function-spy';
import type { FunctionSpy } from './types';

type Levels = [never, 0, 1, 2, 3];
type VoidMethodKeys<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => infer R ? (R extends void ? K : never) : never;
}[keyof T];

/** Select void methods at each object level; only named methods become spies. */
export type WindowSpySelection<T = Window, Depth extends number = 3> =
  | readonly VoidMethodKeys<T>[]
  | (Depth extends 0
      ? never
      : {
          [K in keyof T as T[K] extends object ? (T[K] extends (...args: never[]) => unknown ? never : K) : never]?: WindowSpySelection<
            NonNullable<T[K]>,
            Levels[Depth]
          >;
        });

/** The selected methods, with their original call signatures and the auto-spy helpers. */
export type WindowSpies<T, Selection> = Selection extends readonly (infer K)[]
  ? { [P in Extract<K, keyof T>]: T[P] extends (...args: never[]) => unknown ? FunctionSpy<T[P]> : never }
  : { [P in keyof Selection & keyof T]: WindowSpies<NonNullable<T[P]>, Selection[P]> };

type ValidSelection<T, Selection> = Selection extends readonly unknown[]
  ? readonly VoidMethodKeys<T>[]
  : {
      [K in keyof Selection]: K extends keyof T
        ? T[K] extends (...args: never[]) => unknown
          ? never
          : ValidSelection<NonNullable<T[K]>, Selection[K]>
        : never;
    };

function buildSpies(selection: object, path: string): object {
  const result = {};

  if (Array.isArray(selection)) {
    for (const key of selection) {
      Object.defineProperty(result, key, {
        value: createFunctionSpy<(...args: never[]) => void>(`${path}.${String(key)}`).mockReturnValue(undefined),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  } else {
    for (const key of Reflect.ownKeys(selection)) {
      Object.defineProperty(result, key, {
        value: buildSpies(Reflect.get(selection, key), `${path}.${String(key)}`),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return result;
}

/**
 * Build typed, already configured no-op spies for selected void window methods.
 *
 * ```ts
 * const spies = createWindowSpies({ location: ['reload'], parent: ['postMessage'] });
 * provideWindowDouble(WINDOW, { ...spies, location: { ...spies.location, hostname: 'tv.kion.ru' } });
 * expect(spies.location.reload).toHaveBeenCalledOnce();
 * ```
 *
 * No global is read or patched. Pass the result to `createWindowDouble` or `provideWindowDouble`;
 * unnamed members still use the real window. Use `createFunctionSpy` for methods returning values.
 */
export function createWindowSpies<const Selection extends WindowSpySelection>(
  selection: Selection & ValidSelection<Window, Selection>,
): WindowSpies<Window, Selection>;
export function createWindowSpies(selection: WindowSpySelection): object {
  return buildSpies(selection, 'window');
}
