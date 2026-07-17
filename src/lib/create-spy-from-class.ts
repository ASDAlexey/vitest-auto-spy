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
  autoSpyAccessors: boolean;
  lazySpies: boolean;
}

/** Getter/setter accessor names discovered along a prototype chain. */
interface AccessorNames {
  getters: string[];
  setters: string[];
}

const EMPTY_CONFIGURATION: ResolvedSpyConfiguration = {
  methodsToSpyOn: [],
  observablePropsToSpyOn: [],
  settersToSpyOn: [],
  gettersToSpyOn: [],
  autoSpyAccessors: false,
  lazySpies: false,
};

/** Own, non-getter method names of a single prototype object (excluding the constructor). */
function extractMethodsFromObject(obj: object): string[] {
  const descriptors = Object.getOwnPropertyDescriptors(obj);

  return Object.keys(descriptors).filter((name) => name !== 'constructor' && !descriptors[name]?.get);
}

/**
 * Visit every prototype in the chain that has a parent — i.e. everything up to
 * but not including `Object.prototype` (whose parent is `null`). Shared by the
 * method- and accessor-name collectors so both stop before `Object`'s own
 * members (`__proto__`, `hasOwnProperty`, …).
 */
function walkOwnPrototypes(prototype: object, visit: (obj: object) => void): void {
  let current: object | null = prototype;

  while (current) {
    const parent: object | null = Object.getPrototypeOf(current);

    if (parent) {
      visit(current);
    }

    current = parent;
  }
}

// A class's method set is immutable for a run, but the same class is typically
// spied once per `beforeEach` — caching by prototype avoids re-walking the chain
// on every spy. `WeakMap` keeps this GC-safe (no retention of unused classes).
const methodNamesCache = new WeakMap<object, string[]>();

/** Walk the prototype chain and collect every method name (de-duplicated), including inherited ones. Cached per prototype. */
function getAllMethodNames(prototype: object): string[] {
  const cached = methodNamesCache.get(prototype);

  if (cached) {
    return cached;
  }

  const methods = new Set<string>();
  walkOwnPrototypes(prototype, (obj) => extractMethodsFromObject(obj).forEach((name) => methods.add(name)));

  const result = [...methods];
  methodNamesCache.set(prototype, result);

  return result;
}

/** Walk the prototype chain and collect every getter/setter name (de-duplicated), excluding the constructor. */
function getAllAccessorNames(prototype: object): AccessorNames {
  const getters = new Set<string>();
  const setters = new Set<string>();

  walkOwnPrototypes(prototype, (obj) => {
    const descriptors = Object.getOwnPropertyDescriptors(obj);

    Object.keys(descriptors).forEach((name) => {
      if (name === 'constructor') {
        return;
      }

      if (descriptors[name]?.get) {
        getters.add(name);
      }

      if (descriptors[name]?.set) {
        setters.add(name);
      }
    });
  });

  return { getters: [...getters], setters: [...setters] };
}

/** Merge explicitly-listed accessors with auto-discovered ones (de-duplicated) when `autoSpyAccessors` is on. */
function resolveAccessors(prototype: object, config: ResolvedSpyConfiguration): AccessorNames {
  if (!config.autoSpyAccessors) {
    return { getters: config.gettersToSpyOn, setters: config.settersToSpyOn };
  }

  const discovered = getAllAccessorNames(prototype);

  return {
    getters: [...new Set([...config.gettersToSpyOn, ...discovered.getters])],
    setters: [...new Set([...config.settersToSpyOn, ...discovered.setters])],
  };
}

/** Warn (without throwing) when a requested method name is absent from the class prototype — a common "why isn't my spy called" source. */
function warnOnUnknownMethods(ObjectClass: ClassType<unknown>, requested: string[]): void {
  const available = new Set(getAllMethodNames(ObjectClass.prototype));
  const unknown = requested.filter((name) => !available.has(name));

  if (unknown.length === 0) {
    return;
  }

  // `console.warn` is the project-sanctioned diagnostic channel (CLAUDE.md); the
  // repo's `no-console` lint rule is stricter than that policy, so disable it here.
  // eslint-disable-next-line no-console -- intentional dev-time misconfiguration warning; console.warn is allowed per CLAUDE.md.
  console.warn(
    `[vitest-auto-spy] createSpyFromClass(${ObjectClass.name}): requested method(s) not found on the class prototype: ` +
      `${unknown.join(', ')}. A spy was still created, but the real code will never call it — check for typos.`,
  );
}

/** Install a lazily-materializing spy under `methodName`: the spy is created on first access, then cached as a data property. */
function defineLazyMethodSpy(autoSpy: Record<string, unknown>, methodName: string): void {
  Object.defineProperty(autoSpy, methodName, {
    configurable: true,
    enumerable: true,
    get(): unknown {
      const spy = createFunctionSpy(methodName);
      Object.defineProperty(autoSpy, methodName, { configurable: true, enumerable: true, writable: true, value: spy });

      return spy;
    },
  });
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
    autoSpyAccessors: methodsToSpyOnOrConfig.autoSpyAccessors ?? false,
    lazySpies: methodsToSpyOnOrConfig.lazySpies ?? false,
  };
}

/** Generate a fully-typed auto-spy from a class. */
export function createSpyFromClass<T>(
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[],
): Spy<T> {
  const config = resolveConfiguration(methodsToSpyOnOrConfig);

  // When an explicit `methodsToSpyOn` list is given, restrict to it (matching
  // `jest-auto-spies`); otherwise auto-discover every prototype method.
  const methodNames = config.methodsToSpyOn.length > 0 ? config.methodsToSpyOn : getAllMethodNames(ObjectClass.prototype);

  if (config.methodsToSpyOn.length > 0) {
    warnOnUnknownMethods(ObjectClass, config.methodsToSpyOn);
  }

  const autoSpy: Record<string, unknown> = {};

  // Routed through the IoC registry so the core never statically imports rxjs;
  // requesting observable props without `vitest-auto-spy/rxjs` throws a clear hint.
  config.observablePropsToSpyOn.forEach((observablePropName) => {
    autoSpy[observablePropName] = requireObservableSupport().createPropSpy();
  });

  const accessors = resolveAccessors(ObjectClass.prototype, config);
  createAccessorsSpies(autoSpy, accessors.getters, accessors.setters);

  // Lazy path materializes each method spy on first access (cheaper for large
  // classes where a test touches few methods); enumeration stays intact because
  // the placeholder is an enumerable accessor. Eager path is the default.
  methodNames.forEach((methodName) => {
    if (config.lazySpies) {
      defineLazyMethodSpy(autoSpy, methodName);
    } else {
      autoSpy[methodName] = createFunctionSpy(methodName);
    }
  });

  // `autoSpy` is assembled key-by-key from the runtime method/accessor names;
  // its concrete `Spy<T>` shape only exists structurally after assembly.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the spy object is built dynamically from runtime-discovered names; its `Spy<T>` shape cannot be expressed before assembly.
  return autoSpy as Spy<T>;
}
