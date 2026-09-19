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
  applyConfiguredReturns,
  getCallableMemberNames,
  mergeMethodNames,
  resolveAccessors,
  resolveConfiguration,
} from './create-spy-from-class';
import { DISPOSE } from './dispose-symbol';
import { DOCS_LINKS, withDocs } from './docs-links';
import { type UnstubbedGuard, createFunctionSpy, resolveUnstubbedGuard } from './function-spy';
import { reportMisconfiguration } from './misconfiguration';
import { type RestoreProp, mockAccessorsProp, mockValueProp } from './prop-mock';
import { redefineFailure } from './redefine-failure';
import { warnOnAccessorNamingAMethod, warnOnUnknownMethods } from './spy-config-warnings';
import { mergeAutoSpyDefaults } from './spy-defaults';
import { isMarkedMock } from './spy-mark';
import type { ClassSpyConfiguration, ClassType, InstanceSpyConfiguration, OnlyMethodKeysOf, Spy, SpyOptions } from './types';
import { type ReadGuard, createTrackedPropSpy, resolveReadGuard } from './unconfigured-reads';

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
 * The class whose `registerAutoSpyDefaults` registration applies to this instance, if any.
 *
 * `Object` and `Function` are the constructors a bare literal and a function carry — keys nobody
 * means a per-class configuration for — and a null-prototype object carries none at all; none of
 * them may resolve a registration.
 */
function registeredDefaultsKey<T extends object>(instance: T): ClassType<T> | undefined {
  const constructor: unknown = Reflect.get(instance, 'constructor');

  if (typeof constructor !== 'function' || constructor === Object || constructor === Function) {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- read off a live object at run time; the generic only carries the instance's own type so the merge accepts the caller's configuration unchanged.
  return constructor as ClassType<T>;
}

// A call site that lists its only methods keeps the rest of the object real, so the class's
// registration may configure those methods but not replace any other member.
function onlyMethodsWritten<T>(config: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[] | undefined): string[] | undefined {
  const only = Array.isArray(config) ? undefined : config?.onlyMethodsToSpyOn;

  return only && only.length > 0 ? only : undefined;
}

function isLeftReal(instance: object, name: string): boolean {
  const member: unknown = Reflect.get(instance, name);

  return typeof member === 'function' && !isMarkedMock(member);
}

function withoutRealMembers(instance: object, label: string, config: ResolvedSpyConfiguration): ResolvedSpyConfiguration {
  const real = [...new Set([...Object.keys(config.returns), ...config.selfReturning])].filter((name) => isLeftReal(instance, name));

  if (real.length === 0) {
    return config;
  }

  reportMisconfiguration(
    withDocs(
      `[vitest-auto-spy] ${label}: returns / selfReturning name ${real.join(', ')}, which this call left as the real method. List it in onlyMethodsToSpyOn or drop it.`,
      DOCS_LINKS.createSpyFromClass,
    ),
  );

  const kept = (name: string): boolean => !real.includes(name);

  return {
    ...config,
    returns: Object.fromEntries(Object.entries(config.returns).filter(([name]) => kept(name))),
    selfReturning: config.selfReturning.filter(kept),
  };
}

/**
 * The class path's two misconfiguration reports, read against the live object rather than a
 * prototype chain.
 *
 * The honest "unknown" here includes the object's own callable fields — an arrow property a class
 * factory cannot see is a real member of this object, so naming it is not a typo on this path. The
 * empty-set quiet mirrors the class path's abstract-class judgement: an object with no callable
 * members can only be described by the whitelist, so nothing in it is evidence of a mistake.
 */
function warnOnInstanceMisconfiguration(instance: object, className: string | undefined, config: ResolvedSpyConfiguration): void {
  const label = `createSpyFromInstance(${className ?? 'object'})`;

  if (config.onlyMethodsToSpyOn.length > 0) {
    const available = getCallableMemberNames(instance);

    if (available.length > 0) {
      warnOnUnknownMethods(label, config.onlyMethodsToSpyOn, new Set(available));
    }
  }

  if (config.gettersToSpyOn.length > 0 || config.settersToSpyOn.length > 0) {
    warnOnAccessorNamingAMethod(label, config, new Set(getCallableMemberNames(instance)));
  }
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
function installAccessorSpies(
  instance: object,
  config: ResolvedSpyConfiguration,
  restores: RestoreProp[],
  reads: ReadGuard | undefined,
): void {
  const { getters, setters } = resolveAccessors(instance, config);

  [...new Set([...getters, ...setters])].forEach((name) => restores.push(mockAccessorsProp(instance, name)));
  restores.push(mockValueProp(instance, 'accessorSpies', undefined));

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the shared accessor factory writes string keys onto whatever object it is given; the instance's own type says nothing about the keys being installed.
  createAccessorsSpies(instance as Record<string, unknown>, getters, setters, reads);
}

// The strict guard never fires for these (see function-spy.ts), so a passthrough spy on one would
// skip the real teardown silently. Under passthrough they stay the real methods instead.
const LIFECYCLE_HOOKS: ReadonlySet<PropertyKey> = new Set([
  'ngOnChanges',
  'ngOnInit',
  'ngDoCheck',
  'ngAfterContentInit',
  'ngAfterContentChecked',
  'ngAfterViewInit',
  'ngAfterViewChecked',
  'ngOnDestroy',
]);

/** `passthrough` split off the rest, which is the class factory's configuration unchanged. */
function splitPassthrough<T>(config: InstanceSpyConfiguration<T> | OnlyMethodKeysOf<T>[] | undefined): {
  passthrough: boolean;
  rest: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[] | undefined;
} {
  if (config === undefined || Array.isArray(config)) {
    return { passthrough: false, rest: config };
  }

  const { passthrough, ...rest } = config;

  if (passthrough === true && (rest.strict === true || rest.onUnstubbedCall !== undefined)) {
    throw new Error(
      withDocs(
        `[vitest-auto-spy] createSpyFromInstance() was given 'passthrough: true' together with ${rest.strict === true ? "'strict: true'" : "'onUnstubbedCall'"}. ` +
          'Both decide what an unconfigured call does — run the real method, or refuse it — so one of them would be ignored. ' +
          'Keep the one this test means.',
        DOCS_LINKS.strictMode,
      ),
    );
  }

  return { passthrough: passthrough === true, rest };
}

/** A callable carrying an API of its own — an Angular `signal()` with `set`/`update`, a mock — rather than a plain method. */
function carriesOwnApi(value: object): boolean {
  return Reflect.ownKeys(value).some((key) => key !== 'length' && key !== 'name' && key !== 'prototype');
}

/** A `class` (or a built-in constructor): the one callable whose `prototype` cannot be reassigned, and which cannot be applied without `new`. */
function isClass(value: object): boolean {
  return Object.getOwnPropertyDescriptor(value, 'prototype')?.writable === false;
}

/**
 * The passthrough guard for one member: `undefined` when there is no real method it can run, `'real'`
 * when the member is better left untouched than spied.
 *
 * A spy in place of a signal field hides its `set` and `update`, and one in place of a class cannot
 * construct it; so a discovered callable of either kind stays real, and only a named one is spied.
 */
function passthroughFor(
  instance: object,
  name: PropertyKey,
  className: string | undefined,
  named: ReadonlySet<PropertyKey>,
): UnstubbedGuard | 'real' | undefined {
  const original: unknown = Reflect.get(instance, name);

  if (typeof original !== 'function') {
    return undefined;
  }

  const constructor = isClass(original);

  if (LIFECYCLE_HOOKS.has(name) || (!named.has(name) && (constructor || carriesOwnApi(original)))) {
    return 'real';
  }

  return constructor ? undefined : { className, handle: (call) => Reflect.apply(original, instance, call.args) };
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
 * instance is not an erased `abstract` declaration). A `registerAutoSpyDefaults` registration for
 * the instance's class applies here as it does to the class factory, the caller's own configuration
 * winning over it — while a bare object literal resolves no registration, the class its
 * `constructor` names being `Object`.
 *
 * `passthrough: true` keeps the object working: an unconfigured method runs the real one and is still
 * recorded, until the test configures it. Angular lifecycle hooks are then left unspied, since the
 * framework rather than the test calls them.
 *
 * The returned value **is** the argument. `using spy = createSpyFromInstance(client)` restores the
 * object at the end of the block rather than merely resetting it, which is the only sense `dispose`
 * can have for an object the consumer owns.
 */
export function createSpyFromInstance<T extends object, Options extends SpyOptions = SpyOptions>(
  instance: T,
  methodsToSpyOnOrConfig?: InstanceSpyConfiguration<T> | OnlyMethodKeysOf<T>[],
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

  // The class's registration first, the caller's own configuration merged over it — the same order
  // the class factory merges in, keyed by the class the instance's constructor names.
  const { passthrough, rest } = splitPassthrough(methodsToSpyOnOrConfig);
  const registeredFor = registeredDefaultsKey(instance);
  const config = resolveConfiguration(
    registeredFor === undefined ? rest : mergeAutoSpyDefaults(registeredFor, rest, onlyMethodsWritten(rest)),
  );
  const className = constructorName(instance);
  const unstubbed = resolveUnstubbedGuard(className, config);
  const reads = resolveReadGuard(className, config);
  const restores = installedSpies.get(instance) ?? [];
  installedSpies.set(instance, restores);

  warnOnInstanceMisconfiguration(instance, className, config);

  const methodNames = mergeMethodNames(
    config.onlyMethodsToSpyOn.length > 0 ? config.onlyMethodsToSpyOn : getCallableMemberNames(instance),
    config,
  );

  const named = new Set([...config.onlyMethodsToSpyOn, ...config.methodsToSpyOn, ...config.instanceMethodsToSpyOn]);

  methodNames.forEach((name) => {
    const real = passthrough ? passthroughFor(instance, name, className, named) : undefined;

    if (real !== 'real') {
      installMember(instance, name, createFunctionSpy(String(name), real ?? unstubbed), restores);
    }
  });
  config.observablePropsToSpyOn.forEach((name) => installMember(instance, name, createTrackedPropSpy(name, reads), restores));

  installAccessorSpies(instance, config, restores, reads);
  const label = `createSpyFromInstance(${className ?? 'object'})`;

  applyConfiguredReturns(instance, label, withoutRealMembers(instance, label, config));

  for (const key of Reflect.ownKeys(config.overrides)) {
    installMember(instance, key, Reflect.get(config.overrides, key), restores);
  }

  restores.push(mockValueProp(instance, DISPOSE, disposeSpiedInstance));

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the members were replaced key-by-key from runtime-discovered names; the object's `Spy<T>` shape only exists structurally after that.
  return instance as Spy<T, Options>;
}
