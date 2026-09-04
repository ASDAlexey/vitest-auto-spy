/**
 * `createSpyFromInstance` — spy an object the test already holds, in place.
 *
 * Every other factory here *constructs* the double, which is no help when the object already exists
 * and other code already points at it: a service a factory built, a third-party client, a half-real
 * `TestBed.inject(X)`. `vi.mockObject` is Vitest-only, `sinon.createStubInstance` builds a new
 * object from a constructor rather than patching the one you have, and `bun:test` and `node:test`
 * have nothing at all — so this walks the same discovery and configuration the class factory does
 * and writes the result onto the instance through the `mock*Prop` journal, which is what makes it
 * restorable and what makes it work on all three runtimes.
 *
 * Mutating rather than copying is the whole point: anything that captured the object before the
 * spec ran — a closure, a DI container, a subscription — sees the doubles.
 */
import { createAccessorsSpies } from './accessor-spy';
import {
  type ResolvedSpyConfiguration,
  applyReturns,
  getCallableMemberNames,
  mergeMethodNames,
  resolveAccessors,
  resolveConfiguration,
} from './create-spy-from-class';
import { DISPOSE } from './dispose-symbol';
import { createFunctionSpy, resolveUnstubbedGuard } from './function-spy';
import { requireObservableSupport } from './observable-support';
import { type RestoreProp, mockAccessorsProp, mockValueProp } from './prop-mock';
import { redefineFailure } from './redefine-failure';
import type { ClassSpyConfiguration, OnlyMethodKeysOf, Spy, SpyOptions } from './types';

/**
 * The undos of every member this factory replaced, per instance.
 *
 * A `WeakMap` rather than a property on the object, so a spied instance carries nothing the code
 * under test can trip over, and so nothing is retained once the test drops it. Spying the same
 * instance twice appends, and the reverse walk in {@link restoreSpiedInstance} then puts every layer
 * back in the order it was applied.
 */
const installedSpies = new WeakMap<object, RestoreProp[]>();

/** The class this object came from, for the strict-mode message — `undefined` for a bare object. */
function constructorName(instance: object): string | undefined {
  const constructor: unknown = Reflect.get(instance, 'constructor');

  return typeof constructor === 'function' ? constructor.name : undefined;
}

/**
 * Write one member, journaled, and make it enumerable.
 *
 * `mockValueProp` defines a member that was only inherited as a *non-enumerable* own property, and
 * `resetAutoSpy` / `clearAutoSpy` find a double's spies through `Object.keys`. Without the second
 * step every inherited method would be spied and none of them resettable.
 */
function installMember(instance: object, name: PropertyKey, value: unknown, restores: RestoreProp[]): void {
  restores.push(mockValueProp(instance, name, value));
  Object.defineProperty(instance, name, { enumerable: true });
}

/**
 * Install the spied accessors and the `accessorSpies` bag that goes with them.
 *
 * `mockAccessorsProp` runs first on every name, and not for the accessors it installs: it is the
 * step that records the original descriptor and that turns a non-configurable member into this
 * library's diagnostic. `createAccessorsSpies` then redefines what is by now a configurable pair.
 */
function installAccessorSpies(instance: object, config: ResolvedSpyConfiguration, restores: RestoreProp[]): void {
  const { getters, setters } = resolveAccessors(instance, config);

  [...new Set([...getters, ...setters])].forEach((name) => restores.push(mockAccessorsProp(instance, name)));
  restores.push(mockValueProp(instance, 'accessorSpies', undefined));

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the shared accessor factory writes string keys onto whatever object it is given; the instance's own type says nothing about the keys being installed.
  createAccessorsSpies(instance as Record<string, unknown>, getters, setters);
}

/** Put the instance back the way it was, dropping every spy this factory installed on it. */
function disposeSpiedInstance(this: object): void {
  restoreSpiedInstance(this);
}

/**
 * Undo every {@link createSpyFromInstance} patch on `instance`, newest first. A no-op on an object
 * that was never spied, or that has already been restored.
 *
 * `restoreMockedProps()` (and therefore `setupAutoSpy()`) undoes the same patches as part of its
 * sweep — this is the targeted form, for an object that has to be real again inside the same test.
 *
 * @example
 * ```ts
 * restoreSpiedInstance(client); // client.send is the real method again
 * ```
 */
export function restoreSpiedInstance(instance: object): void {
  const restores = installedSpies.get(instance);

  if (!restores) {
    return;
  }

  installedSpies.delete(instance);
  [...restores].reverse().forEach((restore) => restore());
}

/**
 * Replace an existing object's methods with this library's spies, in place, and hand it back typed
 * as a double.
 *
 * @example
 * ```ts
 * const client = new PaymentsClient(config); // a real object the test already holds
 * const spy = createSpyFromInstance(client);
 *
 * spy.charge.calledWith(100).resolveWith({ ok: true });
 * await service.pay(); // the code under test still holds `client`, and sees the spy
 *
 * restoreSpiedInstance(client);
 * ```
 *
 * @remarks
 * Discovery takes the object's own function-valued fields *and* every prototype method up to but not
 * including `Object.prototype`, so an arrow-function property needs no `instanceMethodsToSpyOn` here
 * and `hasOwnProperty` is never replaced. The configuration is {@link createSpyFromClass}', minus
 * the two options that describe a double being built rather than an object being patched:
 * `lazySpies` (the members already exist, so there is nothing to defer) and `fillMissing` (an
 * instance is not an erased `abstract` declaration).
 *
 * The returned value **is** the argument. `using spy = createSpyFromInstance(client)` restores the
 * object at the end of the block rather than merely resetting it, which is the only sense `dispose`
 * can have for an object the consumer owns.
 */
export function createSpyFromInstance<T extends object, Options extends SpyOptions = SpyOptions>(
  instance: T,
  methodsToSpyOnOrConfig?: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[],
): Spy<T, Options> {
  // A sealed or frozen object rejects a *new* own property with "object is not extensible", which is
  // a different sentence from the "Cannot redefine property" the journal translates — so the same
  // explanation has to be raised here, before the first define.
  if (!Object.isExtensible(instance)) {
    throw redefineFailure(
      'Cannot spy on this instance in place: it is not extensible, so its members cannot be replaced.',
      instance,
      undefined,
    );
  }

  const config = resolveConfiguration(methodsToSpyOnOrConfig);
  const className = constructorName(instance);
  const unstubbed = resolveUnstubbedGuard(className, config);
  const restores = installedSpies.get(instance) ?? [];
  installedSpies.set(instance, restores);

  const methodNames = mergeMethodNames(
    config.onlyMethodsToSpyOn.length > 0 ? config.onlyMethodsToSpyOn : getCallableMemberNames(instance),
    config,
  );

  methodNames.forEach((name) => installMember(instance, name, createFunctionSpy(name, unstubbed), restores));
  config.observablePropsToSpyOn.forEach((name) => installMember(instance, name, requireObservableSupport().createPropSpy(), restores));

  installAccessorSpies(instance, config, restores);
  applyReturns(instance, `createSpyFromInstance(${className ?? 'object'})`, config.returns);

  for (const key of Reflect.ownKeys(config.overrides)) {
    installMember(instance, key, Reflect.get(config.overrides, key), restores);
  }

  restores.push(mockValueProp(instance, DISPOSE, disposeSpiedInstance));

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the members were replaced key-by-key from runtime-discovered names; the object's `Spy<T>` shape only exists structurally after that.
  return instance as Spy<T, Options>;
}
