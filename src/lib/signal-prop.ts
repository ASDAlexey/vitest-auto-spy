/**
 * Driving a service's signal from a spec.
 *
 * `createSpyFromClass` discovers methods by walking the prototype, and a `signal()` / `computed()`
 * field is not there — it is assigned on the instance. Listing it in `methodsToSpyOn` is not the
 * answer either: that would make it a function spy, and a function spy returns `undefined` until
 * configured, so a component reading `service.count()` gets `undefined` where it expects a value.
 *
 * What a spec actually wants is the signal to be real and writable, so the component reacts the way
 * it does in the application — a `computed()` downstream recomputes, an `effect()` runs, a template
 * binding updates. That is two lines every time:
 *
 * ```ts
 * const count = signal(0);
 * mockReadonlyProp(service, 'count', count);
 * ```
 *
 * and the reason it is two is that the spec needs the writable handle while the service exposes a
 * readonly one. {@link mockSignalProp} is the same pair with the handle returned rather than
 * declared, which also removes the temptation to reach for `service.count` and call `.set` on it —
 * `Signal<T>` has no `set`, so that only type-checks after an assertion.
 *
 * Reactivity is genuine: the signal comes from `@angular/core`, not from a stand-in. A stub with a
 * `set` method would satisfy `service.count()` and silently fail to notify anything downstream,
 * which is the failure this helper exists to avoid rather than cause.
 *
 * Which is also why it replaces as little as it can. Angular's graph is built out of links made at
 * **read time**, and a link points at the signal node, not at the property the node arrived through:
 * swap the property and every `computed()`, `effect()` and template binding that has already read
 * the member stays on the old node for the rest of the test, returning its cached value with nothing
 * to say about it. So a member with a node to write — `signal()`, `model()`, `linkedSignal()`, and
 * the `asReadonly()` view of one, which shares the very same node — is **written through** rather
 * than replaced, which keeps every edge of the graph valid, keeps a `model()`'s output half alive,
 * and leaves nothing to restore. The swap is kept for the two shapes that have no node to write: a
 * `computed()` the class declares, and a member a spy does not have yet. Those still have to be
 * patched before anything reads them, and the helper says so rather than letting the spec find out
 * three assertions later.
 */
import { type Signal, type WritableSignal, isSignal, signal, ɵSIGNAL } from '@angular/core';
import { type SignalNode, signalGetFn, signalSetFn, signalUpdateFn } from '@angular/core/primitives/signals';

import { assertAngularInternals } from './angular-internals';
import { DOCS_LINKS, withDocs } from './docs-links';
import { mockReadonlyProp } from './prop-mock';

/** The three members of Angular's reactive node this helper reads, all optional across versions. */
interface ReactiveNode {
  /** Present on an `input()` and a `model()` node: how Angular writes an input, bypassing `set`. */
  applyValueToInputSignal?: unknown;
  /** The head of the live-consumer list — a rendered template, an `effect()`, a live `computed()`. */
  consumers?: unknown;
  /** `'signal'` for a node that holds a value, `'computed'` for one that derives it. */
  kind?: unknown;
}

/** Whether the member is already the writable half — `signal()`, `model()`, `linkedSignal()`. */
function isWritableMember<TValue>(candidate: unknown): candidate is WritableSignal<TValue> {
  const maybe: { set?: unknown } = Object(candidate);

  return isSignal(candidate) && typeof maybe.set === 'function';
}

/** `Object()` rather than a shape check: a version that moved the node lands on an empty one. */
function readNode(candidate: Signal<unknown>): ReactiveNode {
  const node: ReactiveNode = Object(Reflect.get(candidate, ɵSIGNAL));

  return node;
}

/**
 * An `input()`, which Angular writes through `applyValueToInputSignal` on the node rather than
 * through the property. A `model()` node carries the same method and is writable, so it never
 * reaches here — it is driven through its own `set`, output half included.
 */
function isInput(candidate: Signal<unknown>): boolean {
  return typeof readNode(candidate).applyValueToInputSignal === 'function';
}

/** Whether something live is already attached to the node, which the swap can no longer reach. */
function hasLiveConsumers(candidate: Signal<unknown>): boolean {
  return readNode(candidate).consumers !== undefined;
}

/**
 * The node behind a read-only member that is a plain `signal()` underneath — what `asReadonly()`
 * returns, and by far the most common way a service publishes one.
 *
 * It is the *same* node the writable half holds, so writing through it is what `signal()` and
 * `model()` members already get: every consumer stays on the node it linked to, live or not.
 */
function writableNode<TValue>(candidate: Signal<unknown>): SignalNode<TValue> | undefined {
  const node = readNode(candidate);

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `kind: 'signal'` is precisely the node `signalSetFn` writes; the value type is the property's own, which the signature already states.
  return node.kind === 'signal' ? (node as SignalNode<TValue>) : undefined;
}

/**
 * `WritableSignal` minus the brand Angular declares and never exports as a value.
 *
 * The brand is a `unique symbol` with no value binding, so a handle cannot be *built* as a
 * `WritableSignal` — but a real one satisfies this shape, which is what makes the one assertion in
 * {@link writableView} a narrowing rather than a guess.
 */
type WritableView<TValue> = Signal<TValue> & {
  asReadonly(): Signal<unknown>;
  set(value: TValue): void;
  update(updater: (value: TValue) => TValue): void;
};

/**
 * A writable handle over a node the spec does not own the setter for.
 *
 * `set` / `update` go through the node rather than through a replacement signal, so the object keeps
 * the member it published and the graph keeps every edge it had. `asReadonly()` hands back that same
 * member, which is what the service exposes anyway.
 */
function writableView<TValue>(existing: Signal<unknown>, node: SignalNode<TValue>): WritableSignal<TValue> {
  const read: Signal<TValue> = Object.assign((): TValue => signalGetFn(node), { [ɵSIGNAL]: node });
  const view: WritableView<TValue> = Object.assign(read, {
    asReadonly: (): Signal<unknown> => existing,
    set: (value: TValue): void => signalSetFn(node, value),
    update: (updater: (value: TValue) => TValue): void => signalUpdateFn(node, updater),
  });

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `WritableSignal` carries a brand Angular declares but never exports as a value; every member of its surface is above, over the node the property already holds.
  return view as WritableSignal<TValue>;
}

function describeInput(property: PropertyKey): string {
  return withDocs(
    `[vitest-auto-spy] mockSignalProp: '${String(property)}' is an input() signal, and replacing it breaks the host's ` +
      'next write — Angular sets an input through the input node, not through the property, so `setInput` dies with ' +
      '`inputSignalNode.applyValueToInputSignal is not a function`. Drive it the supported way instead: ' +
      `fixture.componentRef.setInput('${String(property)}', value) during the test, or ` +
      'renderShallow(Component, { inputs: { … } }) for the value it starts at.',
    DOCS_LINKS.angular,
  );
}

function describeLiveConsumers(property: PropertyKey): string {
  return withDocs(
    `[vitest-auto-spy] mockSignalProp: '${String(property)}' is a computed() something has already read — a rendered ` +
      'template, an effect(), or a computed() behind one. A computed() derives its value and has nothing to write, so ' +
      'the property has to be replaced; Angular links a consumer to the signal it read rather than to the property it ' +
      'read it through, and all of them would stay on the old one for the rest of the test, cached value and all. ' +
      'Patch before the first detectChanges() / stable(fixture), or drive the signal the computed() reads — a ' +
      'signal() or an asReadonly() view of one is written through in place, whenever it was read.',
    DOCS_LINKS.angular,
  );
}

/**
 * Put a value behind a signal-valued property, and hand back the writable handle.
 *
 * ```ts
 * const service = injectSpy(CounterService);
 * const count = mockSignalProp(service, 'count', 0);
 *
 * expect(component.label()).toBe('0 items');
 *
 * count.set(42);
 * await fixture.whenStable();
 *
 * expect(component.label()).toBe('42 items');
 * ```
 *
 * A member with a node behind it — a `signal()`, a `model()`, or the `asReadonly()` view a service
 * publishes — is written through, so the order does not matter and there is nothing to undo: the
 * value stays where the spec left it, which is the object's own business for anything that outlives
 * the test. A `computed()` or a member the spy does not have yet is replaced instead, and that patch
 * is undone by `restoreMockedProps()` like every other one.
 *
 * @param object The spy (or real instance) whose property to drive.
 * @param property The signal-valued property.
 * @param initialValue The value the signal starts at.
 * @returns The writable signal behind that property — `set()` and `update()` drive the test.
 *
 * @throws When the property is an `input()`, whose writes Angular routes around the property, or when
 *   it is a `computed()` a live consumer has already read — both with the repair in the message.
 */
export function mockSignalProp<T, K extends keyof T>(
  object: T,
  property: K,
  initialValue: T[K] extends Signal<infer TValue> ? TValue : never,
): WritableSignal<T[K] extends Signal<infer TValue> ? TValue : never> {
  type TValue = T[K] extends Signal<infer TInner> ? TInner : never;

  const holder: Record<PropertyKey, unknown> = Object(object);
  const existing = holder[property];

  if (isWritableMember<TValue>(existing)) {
    existing.set(initialValue);

    return existing;
  }

  if (isSignal(existing)) {
    assertAngularInternals();

    if (isInput(existing)) {
      throw new Error(describeInput(property));
    }

    const node = writableNode<TValue>(existing);

    if (node) {
      signalSetFn(node, initialValue);

      return writableView<TValue>(existing, node);
    }

    if (hasLiveConsumers(existing)) {
      throw new Error(describeLiveConsumers(property));
    }
  }

  const writable = signal(initialValue);

  mockReadonlyProp(object, property, writable);

  return writable;
}
