/**
 * Stand-ins for the observer APIs a component subscribes to and a test has to drive.
 *
 * `IntersectionObserver`, `ResizeObserver` and `MutationObserver` share a shape that makes them
 * awkward to test: the code under test constructs the observer itself, keeps the instance private,
 * and the only thing a spec can reach is the global constructor. So a spec that wants to assert
 * "the card animates once it scrolls into view" has to intercept the construction, remember the
 * callback, and invoke it with entries it builds by hand — about forty lines that say nothing about
 * the component, and that every project writes again.
 *
 * Two details are what make the hand-rolled version go wrong rather than merely be tedious:
 *
 *  1. **The stub is never taken off.** A spec that assigns `globalThis.IntersectionObserver`
 *     directly leaves it there; with `isolate: false` the next file in the worker inherits it and
 *     fails on something unrelated (`.observe is not a function`, an assertion that never fires),
 *     pointing at innocent code. Installation here goes through {@link mockValueProp}, so
 *     `restoreMockedProps()` — which {@link setupAutoSpy} already runs after every test — puts the
 *     real constructor back.
 *  2. **The instance is reached through a static field.** `MockObserver.last` is the usual trick,
 *     and it is shared mutable state that survives the file just like the stub does. Here the
 *     handle returned by the installer owns the instances, so nothing outlives the spec.
 *
 * The entries themselves stay the caller's business: only the fields a component actually reads are
 * filled in, and anything else can be passed through. Fabricating a complete `DOMRectReadOnly` for
 * an assertion that looks at `isIntersecting` would be ceremony, not fidelity.
 */
import { type MockFn, getMockAdapter } from './mock-adapter';
import { mockValueProp } from './prop-mock';

/** One observer the code under test constructed. */
export interface ObserverInstance<TEntry, TTarget = unknown> {
  /** Everything passed to `observe`, in order, including repeats. */
  readonly targets: TTarget[];
  /** The spy behind `observe` — for asserting *that* something was observed, and with what options. */
  readonly observe: MockFn;
  /** The spy behind `unobserve`. */
  readonly unobserve: MockFn;
  /** The spy behind `disconnect`, which is how a spec checks that teardown ran. */
  readonly disconnect: MockFn;
  /** Whether `disconnect()` has been called — the readable form of the assertion above. */
  readonly disconnected: boolean;
  /**
   * Invoke the observer's callback with `entries`, exactly as the browser would: one call, one
   * batch. A fast scroll or a resize storm delivers several entries at once, and code that assumes
   * one entry per call is a real bug this makes reachable.
   */
  emit(entries: TEntry[]): void;
}

/** The handle an installer returns: the observers built so far, and the newest one. */
export interface ObserverStub<TEntry, TTarget = unknown> {
  /** Every observer constructed since the stub was installed, in construction order. */
  readonly instances: ObserverInstance<TEntry, TTarget>[];
  /**
   * The most recently constructed observer — the usual case, where a component builds exactly one.
   *
   * Throws when the code under test has not constructed any, because the alternative is an
   * assertion failing against `undefined` several lines later with nothing to say about the cause.
   */
  readonly last: ObserverInstance<TEntry, TTarget>;
}

/** Name of a global observer constructor this module can stand in for. */
export type ObserverGlobal = 'IntersectionObserver' | 'MutationObserver' | 'ResizeObserver';

interface MutableInstance<TEntry, TTarget> extends ObserverInstance<TEntry, TTarget> {
  targets: TTarget[];
  disconnected: boolean;
}

function createInstance<TEntry, TTarget>(callback: (entries: TEntry[], observer: unknown) => void): MutableInstance<TEntry, TTarget> {
  const adapter = getMockAdapter();
  const targets: TTarget[] = [];

  const instance: MutableInstance<TEntry, TTarget> = {
    targets,
    disconnected: false,
    observe: adapter.createMockFn((target: TTarget) => {
      targets.push(target);
    }, 'observe'),
    unobserve: adapter.createMockFn((target: TTarget) => {
      const index = targets.indexOf(target);

      if (index !== -1) {
        targets.splice(index, 1);
      }
    }, 'unobserve'),
    disconnect: adapter.createMockFn(() => {
      instance.disconnected = true;
      targets.length = 0;
    }, 'disconnect'),
    emit(entries: TEntry[]): void {
      callback(entries, instance);
    },
  };

  return instance;
}

/**
 * Replace a global observer constructor with one whose instances a spec controls.
 *
 * ```ts
 * const observers = stubObserver<IntersectionObserverEntry>('IntersectionObserver');
 *
 * fixture.detectChanges();                       // the directive constructs its observer
 * observers.last.emit([{ isIntersecting: true } as IntersectionObserverEntry]);
 * ```
 *
 * The replacement is registered with {@link restoreMockedProps}, so a suite running
 * {@link setupAutoSpy} gets the real constructor back after the test without doing anything else.
 *
 * @param name Which global to replace.
 * @returns A handle over the observers the code under test constructs from now on.
 */
export function stubObserver<TEntry, TTarget = unknown>(name: ObserverGlobal): ObserverStub<TEntry, TTarget> {
  const instances: MutableInstance<TEntry, TTarget>[] = [];

  class StubObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];

    constructor(callback: (entries: TEntry[], observer: unknown) => void) {
      const instance = createInstance<TEntry, TTarget>(callback);

      instances.push(instance);

      Object.assign(this, {
        observe: instance.observe,
        unobserve: instance.unobserve,
        disconnect: instance.disconnect,
        takeRecords: getMockAdapter().createMockFn(() => [], 'takeRecords'),
      });
    }
  }

  mockValueProp(globalThis, name, StubObserver);

  return {
    instances,
    get last(): ObserverInstance<TEntry, TTarget> {
      const instance = instances.at(-1);

      if (!instance) {
        throw new Error(
          `[vitest-auto-spy] stubObserver('${name}'): the code under test has not constructed a ${name}. ` +
            'Render the component (or run the effect) before reaching for `last`, and check that the ' +
            'stub was installed before the construction rather than after it.',
        );
      }

      return instance;
    },
  };
}

/**
 * Stand in for `IntersectionObserver`, with the entry shape spelled out.
 *
 * ```ts
 * const observers = stubIntersectionObserver();
 *
 * const fixture = TestBed.createComponent(RevealDirectiveHost);
 * fixture.detectChanges();
 *
 * observers.last.emit([intersectionEntry(element, true)]);
 * await fixture.whenStable();
 *
 * expect(element.classList).toContain('is-visible');
 * ```
 */
export function stubIntersectionObserver(): ObserverStub<IntersectionObserverEntry, Element> {
  return stubObserver<IntersectionObserverEntry, Element>('IntersectionObserver');
}

/** Stand in for `ResizeObserver`. See {@link stubObserver}. */
export function stubResizeObserver(): ObserverStub<ResizeObserverEntry, Element> {
  return stubObserver<ResizeObserverEntry, Element>('ResizeObserver');
}

/** Stand in for `MutationObserver`. See {@link stubObserver}. */
export function stubMutationObserver(): ObserverStub<MutationRecord, Node> {
  return stubObserver<MutationRecord, Node>('MutationObserver');
}

/**
 * Build one `IntersectionObserverEntry` without spelling out the six fields nothing reads.
 *
 * `intersectionRatio` is derived rather than accepted, because the two disagreeing is not a state
 * the browser produces, and a spec that sets them apart is testing something that cannot happen.
 *
 * @param target The element the entry is about.
 * @param isIntersecting Whether it is in view.
 * @param overrides Any field a particular component does read — `boundingClientRect`, `time`, …
 */
export function intersectionEntry(
  target: Element,
  isIntersecting: boolean,
  overrides: Partial<IntersectionObserverEntry> = {},
): IntersectionObserverEntry {
  const entry = {
    target,
    isIntersecting,
    intersectionRatio: isIntersecting ? 1 : 0,
    rootBounds: null,
    time: 0,
    ...overrides,
  };

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the rect fields are left out on purpose: a component reads `isIntersecting` and occasionally `boundingClientRect`, and fabricating four `DOMRectReadOnly`s for every entry would be ceremony rather than fidelity. `overrides` supplies any field a specific component does read.
  return entry as IntersectionObserverEntry;
}
