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
  /**
   * The init object the code under test passed to the constructor — `{ rootMargin, threshold }`,
   * `{ childList, subtree }`, and so on.
   *
   * A component that builds one observer per configuration is asserting a contract ("one observer
   * per unique root margin"), and without this the only thing a spec can count is constructions.
   */
  readonly options: unknown;
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

/** How an installed stub behaves beyond recording — see {@link stubObserver}. */
export interface ObserverStubOptions<TEntry, TTarget> {
  /**
   * Deliver an entry synchronously from every `observe(target)` call, built by this function.
   *
   * The default (omitted) stub is inert, which is right when the spec wants to choose the moment.
   * It is wrong for a suite ported from Jest, where the hand-written global mock reported
   * everything as visible immediately: with an inert observer those specs quietly assert against a
   * component that never loaded its data, and the fix is one option here rather than a rewrite of
   * every spec.
   */
  autoEmit?: (target: TTarget) => TEntry;
}

interface MutableInstance<TEntry, TTarget> extends ObserverInstance<TEntry, TTarget> {
  options: unknown;
  targets: TTarget[];
  disconnected: boolean;
}

function createInstance<TEntry, TTarget>(
  callback: (entries: TEntry[], observer: unknown) => void,
  options: unknown,
  autoEmit: ((target: TTarget) => TEntry) | undefined,
): MutableInstance<TEntry, TTarget> {
  const adapter = getMockAdapter();
  const targets: TTarget[] = [];

  const instance: MutableInstance<TEntry, TTarget> = {
    options,
    targets,
    disconnected: false,
    observe: adapter.createMockFn((target: TTarget) => {
      targets.push(target);

      if (autoEmit) {
        // Synchronously, from inside `observe` — the browser does deliver a first record for an
        // already-visible target, and the ported suites depend on it having happened by the time
        // `observe()` returns.
        callback([autoEmit(target)], instance);
      }
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
export function stubObserver<TEntry, TTarget = unknown>(
  name: ObserverGlobal,
  options: ObserverStubOptions<TEntry, TTarget> = {},
): ObserverStub<TEntry, TTarget> {
  const instances: MutableInstance<TEntry, TTarget>[] = [];

  class StubObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];

    constructor(callback: (entries: TEntry[], observer: unknown) => void, init?: unknown) {
      const instance = createInstance<TEntry, TTarget>(callback, init, options.autoEmit);

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
export function stubIntersectionObserver(options: IntersectionObserverStubOptions = {}): ObserverStub<IntersectionObserverEntry, Element> {
  return stubObserver<IntersectionObserverEntry, Element>(
    'IntersectionObserver',
    options.autoEmit ? { autoEmit: (target: Element): IntersectionObserverEntry => intersectionEntry(target, true) } : {},
  );
}

/** How {@link stubIntersectionObserver} behaves beyond recording. */
export interface IntersectionObserverStubOptions {
  /**
   * Report every observed target as fully in view, synchronously, from `observe()`.
   *
   * The mode a suite carried over from Jest needs: there the global mock fired its callback with
   * `isIntersecting: true` right away, so lazily-loading sections and cards fetched their data
   * during `detectChanges()`. Against the default inert observer those specs assert on an empty
   * component and fail with something unrelated to intersection.
   */
  autoEmit?: boolean;
}

/** Stand in for `ResizeObserver`. See {@link stubObserver}. */
export function stubResizeObserver(
  options?: ObserverStubOptions<ResizeObserverEntry, Element>,
): ObserverStub<ResizeObserverEntry, Element> {
  return stubObserver<ResizeObserverEntry, Element>('ResizeObserver', options);
}

/** Stand in for `MutationObserver`. See {@link stubObserver}. */
export function stubMutationObserver(options?: ObserverStubOptions<MutationRecord, Node>): ObserverStub<MutationRecord, Node> {
  return stubObserver<MutationRecord, Node>('MutationObserver', options);
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

/**
 * A `NodeList` over `nodes`, without moving them.
 *
 * The obvious construction — append the nodes to a `DocumentFragment` and hand back its
 * `childNodes` — is the one to avoid: appending *moves* a node, so a spec that passes an element it
 * had just rendered silently rips that element out of the fixture, and the assertion that follows
 * fails on a DOM the test itself broke.
 */
function nodeList(nodes: readonly Node[]): NodeList {
  const items = [...nodes];

  const list: NodeList = {
    length: items.length,
    item: (index: number): Node | null => items[index] ?? null,
    forEach(callback: (value: Node, key: number, parent: NodeList) => void, thisArg?: unknown): void {
      items.forEach((node, index) => callback.call(thisArg, node, index, list));
    },
    entries: () => items.entries(),
    keys: () => items.keys(),
    values: () => items.values(),
    [Symbol.iterator]: () => items[Symbol.iterator](),
  };

  // Indexed access (`addedNodes[0]`) is the remaining way production code reads a record, and a
  // numeric index signature cannot be written into the literal above alongside the named members.
  items.forEach((node, index) => Object.defineProperty(list, index, { value: node, enumerable: true }));

  return list;
}

/** The parts of a `MutationRecord` a spec actually chooses. */
export interface MutationRecordInit {
  /** Defaults to `'childList'`, or to `'attributes'` when `attributeName` is given. */
  type?: MutationRecordType;
  addedNodes?: readonly Node[];
  removedNodes?: readonly Node[];
  attributeName?: string;
  oldValue?: string;
}

/**
 * Build one `MutationRecord` without hand-rolling a `NodeList`.
 *
 * The counterpart of {@link intersectionEntry}, and the reason it is needed is sharper: a
 * `MutationRecord` cannot be written as an object literal at all, because `addedNodes` and
 * `removedNodes` are `NodeList`s. Every spec that drives {@link stubMutationObserver} therefore
 * either writes a fragment-based helper of its own or reaches for a double type assertion.
 *
 * ```ts
 * const observers = stubMutationObserver();
 *
 * observers.last.emit([mutationRecord(host, { addedNodes: [span] })]);
 * ```
 *
 * @param target The node the mutation is about.
 * @param init Which nodes moved, and what kind of mutation it was.
 */
export function mutationRecord(target: Node, init: MutationRecordInit = {}): MutationRecord {
  const record: MutationRecord = {
    type: init.type ?? (init.attributeName === undefined ? 'childList' : 'attributes'),
    target,
    addedNodes: nodeList(init.addedNodes ?? []),
    removedNodes: nodeList(init.removedNodes ?? []),
    previousSibling: null,
    nextSibling: null,
    attributeName: init.attributeName ?? null,
    attributeNamespace: null,
    oldValue: init.oldValue ?? null,
  };

  return record;
}

/** The box a {@link resizeEntry} reports. Only the fields a component reads need supplying. */
export interface ResizeEntryRect {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

/**
 * Build one `ResizeObserverEntry` from the size a component reads.
 *
 * `contentRect` and the three box-size arrays are all derived from the same numbers, because a
 * browser never reports them disagreeing — a spec that sets them apart is testing a state that
 * cannot happen.
 */
export function resizeEntry(target: Element, rect: ResizeEntryRect = {}): ResizeObserverEntry {
  const width = rect.width ?? 0;
  const height = rect.height ?? 0;
  const x = rect.x ?? 0;
  const y = rect.y ?? 0;
  const size: readonly ResizeObserverSize[] = [{ blockSize: height, inlineSize: width }];

  const entry: ResizeObserverEntry = {
    target,
    contentRect: {
      x,
      y,
      width,
      height,
      top: y,
      left: x,
      right: x + width,
      bottom: y + height,
      toJSON: (): unknown => ({ x, y, width, height }),
    },
    borderBoxSize: size,
    contentBoxSize: size,
    devicePixelContentBoxSize: size,
  };

  return entry;
}
