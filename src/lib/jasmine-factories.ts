/**
 * The four factories a `jasmine-auto-spies` suite imports, re-typed for this library.
 *
 * Each one is the core factory with the jasmine `Spy<T>` in its return position — the runtime is
 * shared, so nothing here re-implements a double. The two things that are genuinely different are
 * `providedMethodNames` (a jasmine-only deprecated alias) and `createSpyObj` (a jasmine *global*
 * that has no counterpart in this library's own API), and both live here rather than in the core.
 */
import { createSpyFromClass as createCoreSpyFromClass } from './create-spy-from-class';
import { createFunctionSpy as createCoreFunctionSpy } from './function-spy';
import type { JasmineMethodSpy, JasmineSpy } from './jasmine-types';
import type { ClassSpyConfiguration, ClassType, Func, OnlyMethodKeysOf } from './types';

/**
 * `ClassSpyConfiguration` plus the key `jasmine-auto-spies` deprecated but still accepts.
 *
 * Carried here and not in the core configuration: it means exactly what `methodsToSpyOn` means, it
 * has warned on use upstream since v6, and adding a deprecated alias to the type every consumer
 * sees would advertise it to people who have never heard of it.
 */
export interface JasmineClassSpyConfiguration<T> extends ClassSpyConfiguration<T> {
  /**
   * @deprecated The pre-6.x name for {@link ClassSpyConfiguration.methodsToSpyOn}, accepted so a
   *   migrated configuration object still compiles and still works. It is merged into
   *   `methodsToSpyOn`, exactly as upstream merges it. Rename it and the warning goes away.
   */
  providedMethodNames?: OnlyMethodKeysOf<T>[];
}

/** Fold a deprecated `providedMethodNames` into `methodsToSpyOn`, warning once per call as upstream does. */
function normalizeConfiguration<T>(
  methodsToSpyOnOrConfig?: JasmineClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[],
): ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[] | undefined {
  if (methodsToSpyOnOrConfig === undefined || Array.isArray(methodsToSpyOnOrConfig)) {
    return methodsToSpyOnOrConfig;
  }

  // eslint-disable-next-line @typescript-eslint/no-deprecated -- reading the deprecated key is the entire point of this function; deprecating it is how the warning reaches a migrating suite.
  const { providedMethodNames, ...config } = methodsToSpyOnOrConfig;

  if (!providedMethodNames) {
    return config;
  }

  // eslint-disable-next-line no-console -- the same warning, in the same place, that `jasmine-auto-spies` prints; a migrated suite should see no new silence and no new failure.
  console.warn(
    "[vitest-auto-spy] 'providedMethodNames' is deprecated, please use 'methodsToSpyOn' instead. " + 'Both were applied for this double.',
  );

  return { ...config, methodsToSpyOn: [...(config.methodsToSpyOn ?? []), ...providedMethodNames] };
}

/**
 * `createSpyFromClass`, returning a spy typed with `.and` / `.calls` / `.withArgs`.
 *
 * Same two argument forms as upstream — a bare list of method names, or a configuration object —
 * and the same runtime behind them as the core factory, so everything the core offers
 * (`onlyMethodsToSpyOn`, `strict`, `returns`, `fillMissing`, matcher-aware `calledWith`) is
 * available to a migrating suite the day it lands.
 */
export function createSpyFromClass<T>(
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: JasmineClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[],
): JasmineSpy<T> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, no-restricted-syntax -- the runtime object is the one the core builds; the `/jasmine` entry adds the namespaces to it, and they are by design invisible to the core's `Spy<T>`, so the two views cannot be related structurally.
  return createCoreSpyFromClass<T>(ObjectClass, normalizeConfiguration(methodsToSpyOnOrConfig)) as unknown as JasmineSpy<T>;
}

/**
 * `createFunctionSpy<typeof fn>('fn')`, returning a spy typed with the jasmine namespaces.
 *
 * The generic is not inferable from a string, so it is given explicitly — exactly as upstream.
 */
export function createFunctionSpy<FunctionType extends Func>(name: string): JasmineMethodSpy<FunctionType> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, no-restricted-syntax -- as in `createSpyFromClass`: the same runtime spy, seen through the jasmine surface.
  return createCoreFunctionSpy<FunctionType>(name) as unknown as JasmineMethodSpy<FunctionType>;
}

/** What `provideAutoSpy` hands to a DI container. */
export type AngularValueProvider<T> = { provide: ClassType<T>; useValue: JasmineSpy<T> };

/**
 * `{ provide: Class, useValue: createSpyFromClass(Class, …) }`, spelled once.
 *
 * A structural literal with no framework import, so it is accepted by Angular's `TestBed`, NestJS's
 * `Test.createTestingModule` and anything else that reads `{ provide, useValue }` — which is how
 * upstream's helper works too.
 *
 * Getting the double back out is where the two libraries differ. Upstream needs
 * `TestBed.inject<any>(Class)`, losing the type on the way out; `injectSpy(Class)` from
 * `vitest-auto-spy/angular` returns it typed.
 */
export function provideAutoSpy<T>(
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: JasmineClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[],
): AngularValueProvider<T> {
  return { provide: ObjectClass, useValue: createSpyFromClass(ObjectClass, methodsToSpyOnOrConfig) };
}

/** The object `createSpyObj` builds: one jasmine-flavoured spy per name, plus any seeded properties. */
export type SpyObj<Names extends string, Props extends string = never> = {
  [K in Props]: unknown;
} & { [K in Names]: JasmineMethodSpy<Func> };

/** Either upstream form of a name list: bare names, or names mapped to the value each should carry. */
type NameList<Names extends string> = Names[] | Record<Names, unknown>;

/** Split a {@link NameList} into its names and, for the map form, the values to seed. */
function readNameList<Names extends string>(list: NameList<Names>): { names: Names[]; values?: Record<Names, unknown> } {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `Object.keys` widens to `string[]`; the keys of a `Record<Names, unknown>` are exactly `Names`.
  return Array.isArray(list) ? { names: list } : { names: Object.keys(list) as Names[], values: list };
}

/**
 * `jasmine.createSpyObj` — the global a jasmine suite reaches for when there is no class to read.
 *
 * All of upstream's forms work: a list of method names or a map of name to return value, with or
 * without a leading `baseName`, and an optional third argument of properties in either of the same
 * two shapes.
 *
 * ```ts
 * const store = createSpyObj('store', ['load', 'save']);
 * const clock = createSpyObj('clock', { now: 1700000000 });
 * const user = createSpyObj('user', ['save'], { id: 7 });
 * ```
 *
 * The `baseName` is optional exactly as in jasmine, where it names the spies in failure output; the
 * spies here are named `baseName.method` for the same reason. Prefer `createSpyFromClass` where a
 * class exists and `createAutoMock<T>()` where only an interface does — both of those check the
 * names against the type, and this one cannot.
 */
export function createSpyObj<Names extends string, Props extends string = never>(
  baseName: string,
  methodNames: NameList<Names>,
  propertyNames?: NameList<Props>,
): SpyObj<Names, Props>;
export function createSpyObj<Names extends string, Props extends string = never>(
  methodNames: NameList<Names>,
  propertyNames?: NameList<Props>,
): SpyObj<Names, Props>;
export function createSpyObj<Names extends string, Props extends string = never>(
  baseNameOrMethodNames: NameList<Names> | string,
  methodNamesOrPropertyNames?: NameList<Names> | NameList<Props>,
  maybePropertyNames?: NameList<Props>,
): SpyObj<Names, Props> {
  const named = typeof baseNameOrMethodNames === 'string';
  const baseName = named ? baseNameOrMethodNames : '';
  /* eslint-disable @typescript-eslint/consistent-type-assertions -- the two overloads shift every argument by one when the leading `baseName` is omitted, so which parameter holds which list is only known after the `typeof` check above. */
  const methodList = (named ? methodNamesOrPropertyNames : baseNameOrMethodNames) as NameList<Names> | undefined;
  const propertyList = (named ? maybePropertyNames : methodNamesOrPropertyNames) as NameList<Props> | undefined;
  /* eslint-enable @typescript-eslint/consistent-type-assertions -- back to the default for the rest of the function. */

  if (methodList === undefined) {
    throw new Error("[vitest-auto-spy] createSpyObj needs the method names — createSpyObj('store', ['load', 'save']).");
  }

  const methods = readNameList(methodList);
  const properties = propertyList === undefined ? undefined : readNameList(propertyList);

  if (methods.names.length === 0 && !properties?.names.length) {
    throw new Error('[vitest-auto-spy] createSpyObj was given no method names, so the object it built would have no spies on it.');
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the object is filled from the name lists immediately below; there is no literal that could carry the mapped type up front.
  const spyObj = {} as Record<string, unknown>;

  for (const name of methods.names) {
    const spy = createFunctionSpy<Func>(baseName ? `${baseName}.${name}` : name);

    if (methods.values) {
      // `mockReturnValue`, not `.and.returnValue`: this module is reachable without the namespaces
      // installed, and the two do the same thing.
      spy.mockReturnValue(methods.values[name]);
    }

    spyObj[name] = spy;
  }

  for (const name of properties?.names ?? []) {
    spyObj[name] = properties?.values?.[name];
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above: the shape only exists once the names have been walked.
  return spyObj as SpyObj<Names, Props>;
}
