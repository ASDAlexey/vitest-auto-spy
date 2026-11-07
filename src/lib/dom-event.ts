import { type ElementStubOptions, createElementStub } from './element-stub';
import { type MockFn, getMockAdapter } from './mock-adapter';
import type { Mock } from './mock-types';

/** Native event flags plus targets supplied when calling a handler directly. */
export interface DomEventInit extends EventInit {
  readonly target?: EventTarget | null;
  readonly currentTarget?: EventTarget | null;
  /** Replace `preventDefault`, `stopPropagation` and `stopImmediatePropagation` with spies that still act. */
  readonly spy?: boolean;
}

/** The three methods a `{ spy: true }` event carries as spies. */
const SPIED_EVENT_METHODS = ['preventDefault', 'stopPropagation', 'stopImmediatePropagation'] as const;

/** An Event whose cancelling methods are runner mocks; `defaultPrevented` and propagation still change. */
export type SpiedDomEvent = Event & {
  readonly preventDefault: Mock<() => void>;
  readonly stopPropagation: Mock<() => void>;
  readonly stopImmediatePropagation: Mock<() => void>;
};

/**
 * A native Event for a direct handler call, with optional readonly targets.
 * Without targets it can be dispatched normally. Supplied targets stay fixed;
 * use the real dispatch target instead when testing DOM propagation.
 */
export function createDomEvent(type: string, init: DomEventInit & { readonly spy: true }): SpiedDomEvent;
export function createDomEvent(type: string, init?: DomEventInit): Event;
export function createDomEvent(type: string, init: DomEventInit = {}): Event | SpiedDomEvent {
  const { target, currentTarget, spy, ...flags } = init;
  const event = new Event(type, { bubbles: true, cancelable: true, ...flags });

  if (target !== undefined) {
    Object.defineProperty(event, 'target', { value: target, enumerable: true });
  }

  if (currentTarget !== undefined) {
    Object.defineProperty(event, 'currentTarget', { value: currentTarget, enumerable: true });
  }

  if (spy === true) {
    spyOnCancellation(event);
  }

  return event;
}

function spyOnCancellation(event: Event): void {
  const adapter = getMockAdapter();

  for (const name of SPIED_EVENT_METHODS) {
    const native = Event.prototype[name];
    const mock: MockFn = adapter.createMockFn(() => {
      native.call(event);
    }, name);

    Object.defineProperty(event, name, { value: mock, enumerable: true });
  }
}

/** Options for the input stub behind an input event's target. */
export interface InputValueEventInit extends EventInit {
  readonly element?: ElementStubOptions<HTMLInputElement>;
}

/** A native Event whose target is an input stub carrying the supplied value. */
export type InputValueEvent = Omit<Event, 'target'> & { readonly target: HTMLInputElement };

/**
 * Call an input/change handler without creating or attaching a real DOM input.
 * The target passes `instanceof HTMLInputElement` where that class is available.
 * `value` takes precedence over `element.overrides.value`. This is an Event,
 * not the browser's InputEvent with `data` or `inputType`.
 */
export function createInputEvent(value: string, init: InputValueEventInit = {}): InputValueEvent {
  const { element: options, ...flags } = init;
  const element = createElementStub<HTMLInputElement>({
    ...(typeof HTMLInputElement === 'undefined' ? {} : { elementClass: HTMLInputElement }),
    tagName: 'input',
    ...options,
    overrides: { ...options?.overrides, value },
  }).element;

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- createDomEvent defines the supplied readonly target on the native Event.
  return createDomEvent('input', { ...flags, target: element }) as InputValueEvent;
}
