/**
 * `createElementStub()` — an `HTMLElement` a directive or a DOM-touching service can be handed through
 * `ElementRef`, with every call it makes on the element recorded.
 *
 * A directive spec usually renders a host and reads the DOM back, which tests the browser as much as
 * the directive. The unit-level alternative every suite writes by hand is `{ nativeElement: { classList:
 * { add: vi.fn() } } }` — typed `any`, knowing only the members its author thought of, and answering
 * `undefined` for the rest. This stub keeps state behind the spies instead (`contains` answers what
 * `add` put in, `getAttribute` what `setAttribute` wrote, `dispatchEvent` reaches the listeners), and
 * a member of `HTMLElement` it does not implement throws by name rather than read `undefined`.
 */
import { type MockFn, getMockAdapter } from './mock-adapter';

/** Where the stub starts. */
export interface ElementStubOptions<T extends HTMLElement = HTMLElement> {
  /** Lower-case tag name; `tagName` answers it upper-cased. Default `'div'`. */
  readonly tagName?: string;
  readonly classes?: readonly string[];
  readonly attributes?: Readonly<Record<string, string>>;
  /** Inline styles by CSS property name — `{ 'background-color': 'red' }` or `{ width: '10px' }`. */
  readonly style?: Readonly<Record<string, string>>;
  /** Any other member the code under test reads — `offsetWidth`, `querySelector`, `dataset`. */
  readonly overrides?: Partial<T>;
}

/** The spies behind `element.classList`. */
export interface ClassListStub {
  readonly add: MockFn;
  readonly remove: MockFn;
  readonly toggle: MockFn;
  readonly contains: MockFn;
  readonly replace: MockFn;
}

/** The spies behind `element.style`; a plain `style.width = '10px'` write is kept too. */
export interface StyleStub {
  readonly setProperty: MockFn;
  readonly getPropertyValue: MockFn;
  readonly removeProperty: MockFn;
}

/** The handle a spec asserts through. `element` is what goes into `new ElementRef(…)`. */
export interface ElementStub<T extends HTMLElement = HTMLElement> {
  readonly element: T;
  readonly classList: ClassListStub;
  readonly style: StyleStub;
  readonly setAttribute: MockFn;
  readonly getAttribute: MockFn;
  readonly removeAttribute: MockFn;
  readonly hasAttribute: MockFn;
  readonly toggleAttribute: MockFn;
  readonly addEventListener: MockFn;
  readonly removeEventListener: MockFn;
  readonly dispatchEvent: MockFn;
  readonly focus: MockFn;
  readonly blur: MockFn;
  readonly click: MockFn;
  /** The classes the element carries now, in insertion order. */
  classes(): string[];
  attributes(): Record<string, string>;
  /** Inline styles by CSS property name, `setProperty` and plain writes alike. */
  styles(): Record<string, string>;
  /** How many listeners are registered for `type`. */
  listenerCount(type: string): number;
  /** Fire an event at the listeners, the way the user would — `dispatchEvent` records nothing. */
  emit(event: Event | string): boolean;
}

interface Registration {
  readonly listener: EventListenerOrEventListenerObject;
  readonly once: boolean;
}

const camelCase = (name: string): string =>
  name.startsWith('--') ? name : name.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
const kebabCase = (name: string): string => (name.startsWith('--') ? name : name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`));

/** The members `HTMLElement` declares in this realm, or none where there is no DOM to ask. */
function declaredMembers(): ReadonlySet<string> {
  const names = new Set<string>();
  let prototype: unknown = Reflect.get(Object(Reflect.get(globalThis, 'HTMLElement')), 'prototype');

  while (typeof prototype === 'object' && prototype !== null && prototype !== Object.prototype) {
    Object.getOwnPropertyNames(prototype).forEach((name) => names.add(name));
    prototype = Reflect.getPrototypeOf(prototype);
  }

  return names;
}

function missingMember(tagName: string, key: string): Error {
  return new Error(
    `[vitest-auto-spy] createElementStub: the code under test read <${tagName}>.${key}, which the stub does not implement. ` +
      `Pass it in: createElementStub({ overrides: { ${key}: … } }).`,
  );
}

function listenerCall(listener: EventListenerOrEventListenerObject, target: object, event: Event): void {
  if (typeof listener === 'function') {
    listener.call(target, event);
  } else {
    listener.handleEvent(event);
  }
}

type SpyMaker = (name: string, implementation: (...args: never[]) => unknown) => MockFn;

function buildClassList(classSet: Set<string>, spy: SpyMaker): ClassListStub {
  const classList: ClassListStub = {
    add: spy('classList.add', (...tokens: string[]): void => tokens.forEach((token) => classSet.add(token))),
    remove: spy('classList.remove', (...tokens: string[]): void => tokens.forEach((token) => classSet.delete(token))),
    toggle: spy('classList.toggle', (token: string, force?: boolean): boolean => {
      const on = force ?? !classSet.has(token);

      if (on) {
        classSet.add(token);
      } else {
        classSet.delete(token);
      }

      return on;
    }),
    contains: spy('classList.contains', (token: string): boolean => classSet.has(token)),
    replace: spy('classList.replace', (token: string, next: string): boolean => {
      if (!classSet.has(token)) {
        return false;
      }

      const order = [...classSet].map((existing) => (existing === token ? next : existing));

      classSet.clear();
      order.forEach((existing) => classSet.add(existing));

      return true;
    }),
  };

  return Object.defineProperties(classList, {
    length: { get: (): number => classSet.size },
    value: { get: (): string => [...classSet].join(' ') },
    [Symbol.iterator]: { value: (): IterableIterator<string> => classSet.values() },
  });
}

/** The spies, and the view `element.style` answers: the spies plus a plain read or write per property. */
function buildStyle(values: Record<string, string>, spy: SpyMaker): { spies: StyleStub; view: StyleStub } {
  const spies: StyleStub = Object.create(null, {
    setProperty: {
      value: spy('style.setProperty', (name: string, value: string | null): void => {
        if (value === null || value === '') {
          Reflect.deleteProperty(values, camelCase(name));
        } else {
          values[camelCase(name)] = value;
        }
      }),
    },
    getPropertyValue: { value: spy('style.getPropertyValue', (name: string): string => values[camelCase(name)] ?? '') },
    removeProperty: {
      value: spy('style.removeProperty', (name: string): string => {
        const previous = values[camelCase(name)] ?? '';

        Reflect.deleteProperty(values, camelCase(name));

        return previous;
      }),
    },
  });
  const view = new Proxy(spies, {
    get: (target, key): unknown => (typeof key === 'string' && !(key in target) ? (values[key] ?? '') : Reflect.get(target, key)),
    set(_target, key, value): boolean {
      values[String(key)] = String(value);

      return true;
    },
  });

  return { spies, view };
}

type AttributeMembers = Pick<ElementStub, 'getAttribute' | 'hasAttribute' | 'removeAttribute' | 'setAttribute' | 'toggleAttribute'> & {
  getAttributeNames(): string[];
};

type EventMembers = Pick<ElementStub, 'addEventListener' | 'click' | 'dispatchEvent' | 'removeEventListener'> & {
  deliver(event: Event): boolean;
};

function buildAttributes(attributes: Map<string, string>, spy: SpyMaker): AttributeMembers {
  return {
    setAttribute: spy('setAttribute', (name: string, value: string): void => {
      attributes.set(name, String(value));
    }),
    getAttribute: spy('getAttribute', (name: string): string | null => attributes.get(name) ?? null),
    removeAttribute: spy('removeAttribute', (name: string): void => {
      attributes.delete(name);
    }),
    hasAttribute: spy('hasAttribute', (name: string): boolean => attributes.has(name)),
    toggleAttribute: spy('toggleAttribute', (name: string, force?: boolean): boolean => {
      const on = force ?? !attributes.has(name);

      if (on) {
        attributes.set(name, attributes.get(name) ?? '');
      } else {
        attributes.delete(name);
      }

      return on;
    }),
    getAttributeNames: (): string[] => [...attributes.keys()],
  };
}

function buildEvents(listeners: Map<string, Registration[]>, spy: SpyMaker, target: () => object): EventMembers {
  const deliver = (event: Event): boolean => {
    const registered = listeners.get(event.type) ?? [];

    listeners.set(
      event.type,
      registered.filter((entry) => !entry.once),
    );
    registered.forEach((entry) => listenerCall(entry.listener, target(), event));

    return !event.defaultPrevented;
  };
  const removeListener = (type: string, listener: EventListenerOrEventListenerObject | null): void => {
    listeners.set(
      type,
      (listeners.get(type) ?? []).filter((entry) => entry.listener !== listener),
    );
  };
  const addListener = (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void => {
    const registered = listeners.get(type) ?? [];

    if (listener === null || registered.some((entry) => entry.listener === listener)) {
      return;
    }

    const settings = typeof options === 'object' ? options : {};

    listeners.set(type, [...registered, { listener, once: settings.once === true }]);
    settings.signal?.addEventListener('abort', () => removeListener(type, listener), { once: true });
  };

  return {
    deliver,
    addEventListener: spy('addEventListener', addListener),
    removeEventListener: spy('removeEventListener', removeListener),
    dispatchEvent: spy('dispatchEvent', deliver),
    click: spy('click', (): void => {
      deliver(new Event('click', { bubbles: true, cancelable: true }));
    }),
  };
}

function defineReflected(members: object, classSet: Set<string>, attributes: Map<string, string>): void {
  Object.defineProperties(members, {
    className: {
      enumerable: true,
      get: (): string => [...classSet].join(' '),
      set: (value: string): void => {
        classSet.clear();
        value
          .split(/\s+/)
          .filter(Boolean)
          .forEach((token) => classSet.add(token));
      },
    },
    id: {
      enumerable: true,
      get: (): string => attributes.get('id') ?? '',
      set: (value: string): void => {
        attributes.set('id', value);
      },
    },
  });
}

function guardMissing<T>(members: object, tag: string): T {
  const declared = declaredMembers();

  const guarded: object = new Proxy(members, {
    get(target, key, receiver): unknown {
      if (typeof key === 'string' && !(key in target) && declared.has(key)) {
        throw missingMember(tag, key);
      }

      return Reflect.get(target, key, receiver);
    },
  });

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the stub answers its own members and throws by name for every other one `HTMLElement` declares, a contract `T` cannot express.
  return guarded as T;
}

/**
 * Build the stub.
 *
 * ```ts
 * const host = createElementStub({ classes: ['card'] });
 * const directive = TestBed.runInInjectionContext(() => new HighlightDirective());
 * // with providers: [{ provide: ElementRef, useValue: new ElementRef(host.element) }]
 *
 * directive.onEnter();
 *
 * expect(host.classList.add).toHaveBeenCalledWith('highlighted');
 * expect(host.classes()).toEqual(['card', 'highlighted']);
 * ```
 *
 * Nothing is patched, so there is nothing to restore; it works without a DOM environment as well,
 * where only the throw-by-name guard is off, having no `HTMLElement` to read the member list from.
 */
export function createElementStub<T extends HTMLElement = HTMLElement>(options: ElementStubOptions<T> = {}): ElementStub<T> {
  const adapter = getMockAdapter();
  const spy: SpyMaker = (name, implementation) => adapter.createMockFn(implementation, name);
  const tag = (options.tagName ?? 'div').toLowerCase();
  const classSet = new Set(options.classes);
  const attributeMap = new Map(Object.entries(options.attributes ?? {}));
  const listeners = new Map<string, Registration[]>();
  const styleValues = Object.fromEntries(Object.entries(options.style ?? {}).map(([name, value]) => [camelCase(name), value]));
  const classList = buildClassList(classSet, spy);
  const style = buildStyle(styleValues, spy);
  const attributes = buildAttributes(attributeMap, spy);
  const { deliver, ...events } = buildEvents(listeners, spy, () => element);
  const members = {
    tagName: tag.toUpperCase(),
    nodeName: tag.toUpperCase(),
    localName: tag,
    nodeType: 1,
    classList,
    style: style.view,
    ...attributes,
    ...events,
    focus: spy('focus', (): void => undefined),
    blur: spy('blur', (): void => undefined),
    contains: (other: unknown): boolean => other === element,
    isEqualNode: (other: unknown): boolean => other === element,
  };

  defineReflected(members, classSet, attributeMap);
  Object.assign(members, options.overrides);

  const element = guardMissing<T>(members, tag);

  return {
    element,
    classList,
    style: style.spies,
    ...attributes,
    ...events,
    focus: members.focus,
    blur: members.blur,
    classes: (): string[] => [...classSet],
    attributes: (): Record<string, string> => Object.fromEntries(attributeMap),
    styles: (): Record<string, string> => Object.fromEntries(Object.entries(styleValues).map(([name, value]) => [kebabCase(name), value])),
    listenerCount: (type: string): number => listeners.get(type)?.length ?? 0,
    emit: (event: Event | string): boolean =>
      deliver(typeof event === 'string' ? new Event(event, { bubbles: true, cancelable: true }) : event),
  };
}
