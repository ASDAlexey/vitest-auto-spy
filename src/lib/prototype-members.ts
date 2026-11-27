export interface AccessorNames {
  getters: string[];
  setters: string[];
}

const PROTOCOL_SYMBOLS = new Set<PropertyKey>([
  ...Object.getOwnPropertyNames(Symbol)
    .map((name) => Reflect.get(Symbol, name))
    .filter((value): value is symbol => typeof value === 'symbol'),
  Symbol.for('nodejs.util.inspect.custom'),
]);

function isObjectPrototype(level: object): boolean {
  return (
    level === Object.prototype || (Object.getPrototypeOf(level) === null && typeof Reflect.get(level, 'hasOwnProperty') === 'function')
  );
}

const NATIVE_SOURCE = /{\s*\[native code]\s*}\s*$/;

function isNativePrototype(level: object): boolean {
  const constructor: unknown = Object.getOwnPropertyDescriptor(level, 'constructor')?.value;

  return (
    typeof constructor === 'function' &&
    // The tail only: unanchored at the start, the pattern retried from every `{` of a large class's source.
    (NATIVE_SOURCE.test(Function.prototype.toString.call(constructor).slice(-64)) || globalBinding(constructor.name) === constructor)
  );
}

function globalBinding(name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);

  return descriptor?.get ? descriptor.get.call(globalThis) : descriptor?.value;
}

function visitMembers(prototype: object, ownOnly: boolean, visit: (key: string | symbol, descriptor: PropertyDescriptor) => void): void {
  const stopAtNative = ownOnly && !isNativePrototype(prototype);
  const seen = new Set<PropertyKey>();
  let current: object | null = prototype;

  while (current && !(stopAtNative && isNativePrototype(current))) {
    if (!isObjectPrototype(current)) {
      for (const key of Reflect.ownKeys(current)) {
        if (key === 'constructor' || PROTOCOL_SYMBOLS.has(key) || seen.has(key)) {
          continue;
        }

        const descriptor = Object.getOwnPropertyDescriptor(current, key);

        if (descriptor) {
          seen.add(key);
          visit(key, descriptor);
        }
      }
    }

    current = Object.getPrototypeOf(current);
  }
}

export function getCallableMemberNames(target: object): PropertyKey[] {
  const methods: PropertyKey[] = [];
  visitMembers(target, false, (key, descriptor) => {
    if (typeof descriptor.value === 'function') {
      methods.push(key);
    }
  });

  return methods;
}

interface PrototypeMembers {
  methods: PropertyKey[];
  accessors: AccessorNames;
  constants: [PropertyKey, unknown][];
  hasThen: boolean;
}

const membersCache = new WeakMap<object, PrototypeMembers>();

function getMembers(prototype: object): PrototypeMembers {
  const cached = membersCache.get(prototype);

  if (cached) {
    return cached;
  }

  const members: PrototypeMembers = { methods: [], accessors: { getters: [], setters: [] }, constants: [], hasThen: false };
  visitMembers(prototype, true, (key, descriptor) => {
    if (typeof descriptor.value === 'function') {
      if (key === 'then') {
        members.hasThen = true;
      } else {
        members.methods.push(key);
      }
    } else if ('value' in descriptor) {
      members.constants.push([key, descriptor.value]);
    } else if (typeof key === 'string') {
      if (descriptor.get) {
        members.accessors.getters.push(key);
      }

      if (descriptor.set) {
        members.accessors.setters.push(key);
      }
    }
  });
  membersCache.set(prototype, members);

  return members;
}

export function getAllMethodNames(prototype: object): PropertyKey[] {
  return getMembers(prototype).methods;
}

export function declaresThen(prototype: object): boolean {
  return getMembers(prototype).hasThen;
}

export function getDeclaredMethodNames(prototype: object): PropertyKey[] {
  const { methods, hasThen } = getMembers(prototype);

  return hasThen ? [...methods, 'then'] : methods;
}

export function getPrototypeConstants(prototype: object): readonly (readonly [PropertyKey, unknown])[] {
  return getMembers(prototype).constants;
}

export function getAllAccessorNames(prototype: object): AccessorNames {
  return getMembers(prototype).accessors;
}
