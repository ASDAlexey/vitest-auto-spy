/**
 * `createSpyFromClass` — assemble the full auto-spy from a class: every
 * (inherited) prototype method becomes a function spy, plus any configured
 * observable properties and getter/setter accessors.
 */
import { createAccessorsSpies } from './accessor-spy';
import { createFunctionSpy } from './function-spy';
import { requireObservableSupport } from './observable-support';
import type { ClassSpyConfiguration, ClassType, OnlyMethodKeysOf, Spy } from './types';

/** All names to spy on, flattened from either form of the config argument. */
interface ResolvedSpyConfiguration {
  methodsToSpyOn: string[];
  observablePropsToSpyOn: string[];
  settersToSpyOn: string[];
  gettersToSpyOn: string[];
}

const EMPTY_CONFIGURATION: ResolvedSpyConfiguration = {
  methodsToSpyOn: [],
  observablePropsToSpyOn: [],
  settersToSpyOn: [],
  gettersToSpyOn: [],
};

/** Own, non-getter method names of a single prototype object (excluding the constructor). */
function extractMethodsFromObject(obj: object): string[] {
  const descriptors = Object.getOwnPropertyDescriptors(obj);

  return Object.keys(descriptors).filter((name) => name !== 'constructor' && !descriptors[name]?.get);
}

/** Walk the prototype chain and collect every method name (de-duplicated), including inherited ones. */
function getAllMethodNames(prototype: object): string[] {
  const methods = new Set<string>();
  let current: object | null = prototype;

  while (current) {
    const parentObj: object | null = Object.getPrototypeOf(current);

    if (parentObj) {
      extractMethodsFromObject(current).forEach((name) => methods.add(name));
    }

    current = parentObj;
  }

  return [...methods];
}

/** Normalize the overloaded second argument into a single flat configuration. */
function resolveConfiguration<T>(methodsToSpyOnOrConfig?: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[]): ResolvedSpyConfiguration {
  if (!methodsToSpyOnOrConfig) {
    return { ...EMPTY_CONFIGURATION };
  }

  if (Array.isArray(methodsToSpyOnOrConfig)) {
    return { ...EMPTY_CONFIGURATION, methodsToSpyOn: methodsToSpyOnOrConfig };
  }

  return {
    methodsToSpyOn: methodsToSpyOnOrConfig.methodsToSpyOn ?? [],
    observablePropsToSpyOn: methodsToSpyOnOrConfig.observablePropsToSpyOn ?? [],
    settersToSpyOn: methodsToSpyOnOrConfig.settersToSpyOn ?? [],
    gettersToSpyOn: methodsToSpyOnOrConfig.gettersToSpyOn ?? [],
  };
}

/** Generate a fully-typed auto-spy from a class. */
export function createSpyFromClass<T>(
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[],
): Spy<T> {
  const { methodsToSpyOn, observablePropsToSpyOn, settersToSpyOn, gettersToSpyOn } = resolveConfiguration(methodsToSpyOnOrConfig);

  // When an explicit `methodsToSpyOn` list is given, restrict to it (matching
  // `jest-auto-spies`); otherwise auto-discover every prototype method.
  const methodNames = methodsToSpyOn.length > 0 ? methodsToSpyOn : getAllMethodNames(ObjectClass.prototype);

  const autoSpy: Record<string, unknown> = {};

  // Routed through the IoC registry so the core never statically imports rxjs;
  // requesting observable props without `vitest-auto-spy/rxjs` throws a clear hint.
  observablePropsToSpyOn.forEach((observablePropName) => {
    autoSpy[observablePropName] = requireObservableSupport().createPropSpy();
  });

  createAccessorsSpies(autoSpy, gettersToSpyOn, settersToSpyOn);

  methodNames.forEach((methodName) => {
    autoSpy[methodName] = createFunctionSpy(methodName);
  });

  // `autoSpy` is assembled key-by-key from the runtime method/accessor names;
  // its concrete `Spy<T>` shape only exists structurally after assembly.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the spy object is built dynamically from runtime-discovered names; its `Spy<T>` shape cannot be expressed before assembly.
  return autoSpy as Spy<T>;
}
