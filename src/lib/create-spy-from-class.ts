/**
 * `createSpyFromClass` — assemble the full auto-spy from a class: every
 * (inherited) prototype method becomes a function spy, plus any configured
 * observable properties and getter/setter accessors.
 */

import { createAccessorsSpies } from './accessor-spy';
import { createFunctionSpy } from './function-spy';
import { createObservablePropSpy } from './observable-spy';
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
function extractMethodsFromObject(obj: any): string[] {
  const descriptors = Object.getOwnPropertyDescriptors(obj);
  return Object.keys(descriptors).filter((name) => name !== 'constructor' && !descriptors[name].get);
}

/** Walk the prototype chain and collect every method name, including inherited ones. */
function getAllMethodNames(obj: any): string[] {
  let methods: string[] = [];
  while (obj) {
    const parentObj = Object.getPrototypeOf(obj);
    if (parentObj) {
      methods = methods.concat(extractMethodsFromObject(obj));
    }
    obj = parentObj;
  }
  return methods;
}

/** Normalize the overloaded second argument into a single flat configuration. */
function resolveConfiguration<T>(
  methodsToSpyOnOrConfig?: OnlyMethodKeysOf<T>[] | ClassSpyConfiguration<T>,
): ResolvedSpyConfiguration {
  if (!methodsToSpyOnOrConfig) {
    return { ...EMPTY_CONFIGURATION };
  }

  if (Array.isArray(methodsToSpyOnOrConfig)) {
    return { ...EMPTY_CONFIGURATION, methodsToSpyOn: methodsToSpyOnOrConfig as string[] };
  }

  return {
    methodsToSpyOn: (methodsToSpyOnOrConfig.methodsToSpyOn as string[]) || [],
    observablePropsToSpyOn: (methodsToSpyOnOrConfig.observablePropsToSpyOn as string[]) || [],
    settersToSpyOn: (methodsToSpyOnOrConfig.settersToSpyOn as string[]) || [],
    gettersToSpyOn: (methodsToSpyOnOrConfig.gettersToSpyOn as string[]) || [],
  };
}

/** Generate a fully-typed auto-spy from a class. */
export function createSpyFromClass<T>(
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: OnlyMethodKeysOf<T>[] | ClassSpyConfiguration<T>,
): Spy<T> {
  const { methodsToSpyOn, observablePropsToSpyOn, settersToSpyOn, gettersToSpyOn } =
    resolveConfiguration(methodsToSpyOnOrConfig);

  const methodNames = getAllMethodNames(ObjectClass.prototype);
  if (methodsToSpyOn.length > 0) {
    methodNames.push(...methodsToSpyOn);
  }

  const autoSpy: any = {};

  observablePropsToSpyOn.forEach((observablePropName) => {
    autoSpy[observablePropName] = createObservablePropSpy();
  });

  createAccessorsSpies(autoSpy, gettersToSpyOn, settersToSpyOn);

  methodNames.forEach((methodName) => {
    autoSpy[methodName] = createFunctionSpy(methodName);
  });

  return autoSpy as Spy<T>;
}
