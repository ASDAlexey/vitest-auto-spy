/**
 * `provideOverlayDouble()` — the CDK `Overlay` a component opens a panel through, without
 * `@angular/cdk` becoming a dependency of this package.
 *
 * A component that opens its own panel calls `overlay.create(…)`, builds a position strategy through
 * the `overlay.position()` chain, picks one of `overlay.scrollStrategies`, then `attach`es a portal
 * and subscribes to `backdropClick()` and `keydownEvents()`. The hand-written double knows `create`
 * and `attach`; the chain answers `undefined` on its first link, and the backdrop stream is an `of()`
 * that fires before anything was opened. Here every link of the chain answers the chain, the streams
 * stay silent until the spec fires them, and each `create()` gets a ref a spec can reach.
 *
 * As with the Material dialog, the class is an argument: nothing here imports `@angular/cdk`, and the
 * spec's own `Overlay` import is the DI token.
 */
import type { AbstractType, FactoryProvider, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { createFunctionSpy } from './function-spy';
import { sourceClassName } from './message-text';
import { getMockAdapter } from './mock-adapter';
import type { AddSpyMethodsByReturnTypes, Func } from './types';

type Spied<F extends Func> = AddSpyMethodsByReturnTypes<F>;

/** The half of the CDK `Overlay` the double stands in for. */
export interface OverlayLike {
  create(config?: never): unknown;
}

/** A stream on the ref, typed without rxjs: `subscribe` is all a spec needs, and the value is an rxjs `Observable`. */
export interface OverlayStream<T> {
  subscribe(
    observerOrNext?: ((value: T) => void) | { next?: (value: T) => void; error?: (error: unknown) => void; complete?: () => void },
  ): { unsubscribe(): void };
}

/** What `attach()` answers: the stand-in for the `ComponentRef` of the attached portal. */
export interface AttachedComponent<C = Record<string, unknown>> {
  readonly instance: C;
  setInput(name: string, value: unknown): void;
  destroy(): void;
}

/** The overlay ref the code under test drives, structurally the CDK `OverlayRef`'s everyday half. */
export interface OverlayRefStub {
  readonly overlayElement: HTMLElement | undefined;
  readonly hostElement: HTMLElement | undefined;
  readonly backdropElement: HTMLElement | null;
  attach(portal: unknown): AttachedComponent;
  detach(): void;
  dispose(): void;
  hasAttached(): boolean;
  backdropClick(): OverlayStream<MouseEvent>;
  keydownEvents(): OverlayStream<KeyboardEvent>;
  outsidePointerEvents(): OverlayStream<MouseEvent>;
  attachments(): OverlayStream<void>;
  detachments(): OverlayStream<void>;
  getConfig(): unknown;
  getDirection(): 'ltr' | 'rtl';
  setDirection(direction: unknown): void;
  updatePosition(): void;
  updateSize(size: unknown): void;
  updatePositionStrategy(strategy: unknown): void;
  updateScrollStrategy(strategy: unknown): void;
  addPanelClass(classes: string[] | string): void;
  removePanelClass(classes: string[] | string): void;
}

/** One opened overlay: the ref handed to the code under test, and the spec's side of it. */
export interface OverlayRefDouble {
  readonly ref: OverlayRefStub;
  readonly config: unknown;
  readonly attach: Spied<(portal: unknown) => AttachedComponent>;
  readonly detach: Spied<() => void>;
  readonly dispose: Spied<() => void>;
  readonly updatePosition: Spied<() => void>;
  readonly addPanelClass: Spied<(classes: string[] | string) => void>;
  readonly removePanelClass: Spied<(classes: string[] | string) => void>;
  emitBackdropClick(event?: MouseEvent): void;
  emitKeydown(event: KeyboardEvent): void;
  emitOutsidePointer(event?: MouseEvent): void;
}

/** One call made on the `overlay.position()` chain, in order. */
export interface PositionCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

/** Where every overlay the double opens starts. */
export interface OverlayDoubleInit {
  /** What `attach(…).instance` answers — the members of the panel component the opener drives. */
  readonly componentInstance?: Record<string, unknown>;
}

/** The spec's handle on the double. */
export interface OverlayDouble<O> {
  /** What the injector hands out for the `Overlay` class. */
  readonly overlay: O;
  readonly create: Spied<(config?: unknown) => OverlayRefStub>;
  /** One per `create()` call, in order. */
  readonly refs: readonly OverlayRefDouble[];
  /** The most recent `create()`; throws by name when nothing was opened yet. */
  lastRef(): OverlayRefDouble;
  /** Every call on the `position()` chain, `position` itself included. */
  positionCalls(): readonly PositionCall[];
}

const doubles = new WeakMap<object, unknown>();

function spyWith<F extends Func>(name: string, implementation: F): Spied<F> {
  const spy = createFunctionSpy<F>(name);

  getMockAdapter().restoreImplementation(spy, implementation);

  return spy;
}

function makeElement(): HTMLElement | undefined {
  return typeof document === 'undefined' ? undefined : document.createElement('div');
}

interface RefStreams {
  readonly backdrop: Subject<MouseEvent>;
  readonly keydown: Subject<KeyboardEvent>;
  readonly outside: Subject<MouseEvent>;
  readonly attached: Subject<void>;
  readonly detached: Subject<void>;
}

interface RefState {
  attached: boolean;
  direction: 'ltr' | 'rtl';
}

type RefSpies = Pick<OverlayRefDouble, 'addPanelClass' | 'attach' | 'detach' | 'dispose' | 'removePanelClass' | 'updatePosition'>;

function createRefSpies(
  name: string,
  streams: RefStreams,
  state: RefState,
  init: OverlayDoubleInit,
  panel: HTMLElement | undefined,
): RefSpies {
  const detach = spyWith(`${name}.detach`, (): void => {
    if (state.attached) {
      state.attached = false;
      streams.detached.next();
    }
  });

  return {
    detach,
    attach: spyWith(`${name}.attach`, (_portal: unknown): AttachedComponent => {
      state.attached = true;
      streams.attached.next();

      return { instance: { ...init.componentInstance }, setInput: (): void => undefined, destroy: (): void => detach() };
    }),
    dispose: spyWith(`${name}.dispose`, (): void => {
      detach();
      Object.values(streams).forEach((subject: Subject<unknown>) => subject.complete());
    }),
    updatePosition: spyWith(`${name}.updatePosition`, (): void => undefined),
    addPanelClass: spyWith(`${name}.addPanelClass`, (classes: string[] | string): void => {
      panel?.classList.add(...[classes].flat());
    }),
    removePanelClass: spyWith(`${name}.removePanelClass`, (classes: string[] | string): void => {
      panel?.classList.remove(...[classes].flat());
    }),
  };
}

function createRef(name: string, config: unknown, init: OverlayDoubleInit): OverlayRefDouble {
  const streams: RefStreams = {
    backdrop: new Subject<MouseEvent>(),
    keydown: new Subject<KeyboardEvent>(),
    outside: new Subject<MouseEvent>(),
    attached: new Subject<void>(),
    detached: new Subject<void>(),
  };
  const state: RefState = { attached: false, direction: 'ltr' };
  const overlayElement = makeElement();
  const spies = createRefSpies(name, streams, state, init, overlayElement);
  const ref: OverlayRefStub = {
    ...spies,
    overlayElement,
    hostElement: makeElement(),
    backdropElement: null,
    hasAttached: (): boolean => state.attached,
    backdropClick: (): OverlayStream<MouseEvent> => streams.backdrop.asObservable(),
    keydownEvents: (): OverlayStream<KeyboardEvent> => streams.keydown.asObservable(),
    outsidePointerEvents: (): OverlayStream<MouseEvent> => streams.outside.asObservable(),
    attachments: (): OverlayStream<void> => streams.attached.asObservable(),
    detachments: (): OverlayStream<void> => streams.detached.asObservable(),
    getConfig: (): unknown => config,
    getDirection: (): 'ltr' | 'rtl' => state.direction,
    setDirection: (next: unknown): void => {
      state.direction = next === 'rtl' ? 'rtl' : 'ltr';
    },
    updateSize: (): void => undefined,
    updatePositionStrategy: (): void => undefined,
    updateScrollStrategy: (): void => undefined,
  };

  return {
    ...spies,
    ref,
    config,
    emitBackdropClick: (event = new MouseEvent('click')): void => streams.backdrop.next(event),
    emitKeydown: (event: KeyboardEvent): void => streams.keydown.next(event),
    emitOutsidePointer: (event = new MouseEvent('click')): void => streams.outside.next(event),
  };
}

/**
 * The `position()` chain: every method answers the chain, so any sequence of `global()`,
 * `flexibleConnectedTo(…)`, `withPositions(…)`, `centerHorizontally()` builds, and each call is kept.
 */
function positionChain(calls: PositionCall[]): unknown {
  const changes = new Subject<unknown>().asObservable();
  const chain: object = new Proxy(
    {},
    {
      get(_target, key): unknown {
        if (key === 'positionChanges') {
          return changes;
        }

        if (typeof key !== 'string' || key === 'then') {
          return undefined;
        }

        return (...args: unknown[]): unknown => {
          calls.push({ method: key, args });

          return chain;
        };
      },
    },
  );

  return chain;
}

function scrollStrategy(kind: string): object {
  return { kind, attach: (): void => undefined, enable: (): void => undefined, disable: (): void => undefined };
}

/**
 * Build the `Overlay` double without a `TestBed`.
 *
 * ```ts
 * const overlay = createOverlayDouble(Overlay);
 * const menu = new ContextMenu(overlay.overlay);
 *
 * menu.open();
 * overlay.lastRef().emitBackdropClick();
 *
 * expect(overlay.lastRef().dispose).toHaveBeenCalled();
 * ```
 */
export function createOverlayDouble<O extends OverlayLike>(OverlayClass: AbstractType<O>, init: OverlayDoubleInit = {}): OverlayDouble<O> {
  const name = sourceClassName(OverlayClass.name);
  const refs: OverlayRefDouble[] = [];
  const calls: PositionCall[] = [];
  const create = spyWith(`${name}.create`, (config?: unknown): OverlayRefStub => {
    const opened = createRef(`OverlayRef#${refs.length + 1}`, config, init);

    refs.push(opened);

    return opened.ref;
  });
  const members = {
    create,
    position: (): unknown => {
      calls.push({ method: 'position', args: [] });

      return positionChain(calls);
    },
    scrollStrategies: {
      noop: (): object => scrollStrategy('noop'),
      close: (): object => scrollStrategy('close'),
      block: (): object => scrollStrategy('block'),
      reposition: (): object => scrollStrategy('reposition'),
    },
  };
  const structural: object = members;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `@angular/cdk` is not a dependency, so the code under test sees the class it passed; the double answers its everyday half, structurally.
  const overlay = structural as O;
  const double: OverlayDouble<O> = {
    overlay,
    create,
    refs,
    lastRef(): OverlayRefDouble {
      const last = refs.at(-1);

      if (last === undefined) {
        throw new Error(`[vitest-auto-spy] OverlayDouble.lastRef(): nothing called ${name}.create() yet.`);
      }

      return last;
    },
    positionCalls: (): readonly PositionCall[] => [...calls],
  };

  doubles.set(overlay, double);

  return double;
}

/**
 * The `Overlay` provider. A factory, so every injector builds its own.
 *
 * ```ts
 * TestBed.configureTestingModule({ providers: [provideOverlayDouble(Overlay)] });
 * ```
 */
export function provideOverlayDouble<O extends OverlayLike>(OverlayClass: AbstractType<O>, init: OverlayDoubleInit = {}): FactoryProvider {
  return { provide: OverlayClass, useFactory: (): O => createOverlayDouble(OverlayClass, init).overlay };
}

/**
 * The handle of the double `provideOverlayDouble()` put in the injector — the `TestBed`'s unless an
 * injector is given.
 */
export function injectOverlayDouble<O extends OverlayLike>(OverlayClass: AbstractType<O>, injector?: Injector): OverlayDouble<O> {
  const name = sourceClassName(OverlayClass.name);
  const overlay: unknown =
    injector === undefined ? TestBed.inject(OverlayClass, null, { optional: true }) : injector.get(OverlayClass, null, { optional: true });
  const double = typeof overlay === 'object' && overlay !== null ? doubles.get(overlay) : undefined;

  if (double === undefined) {
    throw new Error(
      `[vitest-auto-spy] injectOverlayDouble(): the ${name} in the injector given is not one provideOverlayDouble() built. ` +
        `Add provideOverlayDouble(${name}) to its providers, last.`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the registry is keyed by overlay object, so its values cannot carry each double's own `O`; every entry was put there by `createOverlayDouble` for the overlay just injected.
  return double as OverlayDouble<O>;
}
