/**
 * The bookkeeping behind the shared helper bundles, pinned against the shape that broke it in
 * 5.4.0: the package is loaded as more than one copy — `dist/index.js` and `dist/angular.js` are
 * built unsplit, so each carries its own `fast-spy` and its own `spy-decoration`, while the mock
 * adapter every spy comes from is pinned to one `dist/shared-state.js`. A spy is therefore handed to
 * the `attachHelpers` of a copy that does not own the prototype the spy inherits from, and a record
 * of "this bundle has been shared" that named no prototype answered about one it had never touched.
 *
 * A second copy of `fast-spy` is stood in for by cloning the real prototype's own descriptors onto a
 * fresh object: same methods, same brand, a different identity — which is exactly what a second copy
 * of the module produces.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type FastSpy, createFastSpy } from './fast-spy';
import { createFunctionSpy } from './function-spy';
import { type MockAdapter, type MockFn, registerMockAdapter } from './mock-adapter';
import { attachHelpers } from './spy-decoration';
import type { Func } from './types';
import { vitestMockAdapter } from './vitest-adapter';

/** A prototype indistinguishable from the one `fast-spy` installs, except in identity. */
function foreignPrototype(): object {
  const real: object = Object.getPrototypeOf(createFastSpy());

  return Object.create(Function.prototype, Object.getOwnPropertyDescriptors(real));
}

/** A fast spy re-parented onto `prototype`, standing in for one another copy of `fast-spy` built. */
function foreignSpy(prototype: object): FastSpy {
  const spy = createFastSpy();

  Object.setPrototypeOf(spy, prototype);

  return spy;
}

/** An adapter whose spies come from a second copy of the engine — the consumer's real arrangement. */
function foreignEngineAdapter(prototype: object): MockAdapter {
  return {
    ...vitestMockAdapter,
    createMockFn(implementation?: Func, name?: string): MockFn {
      const spy = createFastSpy(implementation, name);

      Object.setPrototypeOf(spy, prototype);

      return spy;
    },
  };
}

afterEach(() => {
  registerMockAdapter(vitestMockAdapter);
});

describe('attachHelpers', () => {
  it('gives a spy the whole bundle when the engine that built it is another copy of fast-spy', () => {
    registerMockAdapter(foreignEngineAdapter(foreignPrototype()));

    const load = createFunctionSpy<(id: number) => string>('load');

    load.calledWith(1).mockReturnValue('configured');

    expect(load(1)).toBe('configured');
  });

  it('shares one bundle onto every prototype that asks for it', () => {
    const helpers = { probeShared: (): string => 'shared' };
    const one = foreignSpy(foreignPrototype());
    const two = foreignSpy(foreignPrototype());

    const first = attachHelpers(one, helpers);
    const second = attachHelpers(two, helpers);

    expect(first.probeShared()).toBe('shared');
    expect(second.probeShared()).toBe('shared');
    expect(Object.hasOwn(one, 'probeShared')).toBe(false);
    expect(Object.hasOwn(two, 'probeShared')).toBe(false);
  });

  it('decorates rather than sharing when another bundle already owns the key', () => {
    const prototype = foreignPrototype();
    const owning = { probeOwned: (): string => 'first bundle' };
    const losing = { probeOwned: (): string => 'second bundle' };
    const one = foreignSpy(prototype);
    const two = foreignSpy(prototype);

    const first = attachHelpers(one, owning);
    const second = attachHelpers(two, losing);

    expect(first.probeOwned()).toBe('first bundle');
    expect(second.probeOwned()).toBe('second bundle');
    expect(Object.hasOwn(one, 'probeOwned')).toBe(false);
    expect(Object.hasOwn(two, 'probeOwned')).toBe(true);
  });

  it('decorates a spy whose prototype is not the branded one', () => {
    const spy = createFastSpy();

    Object.setPrototypeOf(spy, Object.create(Object.getPrototypeOf(spy)));

    const decorated = attachHelpers(spy, { probeReparented: (): string => 'own slot' });

    expect(decorated.probeReparented()).toBe('own slot');
    expect(Object.hasOwn(spy, 'probeReparented')).toBe(true);
  });

  it('agrees with a second copy of the engine about one prototype', async () => {
    // A second module instance is what a consumer's node_modules really has: `dist/index.js` and
    // `dist/angular.js` each carry their own `fast-spy` and their own `spy-decoration`, and both are
    // handed spies whose prototype comes from the one pinned adapter. Whatever records "already
    // shared here" has to be visible to a copy that has never run before.
    vi.resetModules();

    const otherEngine = await import('./fast-spy');
    const otherDecoration = await import('./spy-decoration');
    const prototype: object = Object.getPrototypeOf(otherEngine.createFastSpy());
    const theirs = { probeCrossCopy: (): string => 'other copy' };
    const ours = { probeCrossCopy: (): string => 'this copy' };
    const theirSpy = otherEngine.createFastSpy();
    const ourSpy = foreignSpy(prototype);

    const theirDecorated = otherDecoration.attachHelpers(theirSpy, theirs);
    const ourDecorated = attachHelpers(ourSpy, ours);

    expect(otherDecoration.attachHelpers).not.toBe(attachHelpers);
    // Compared as a boolean: `expect` walks the object it is handed, and a bare prototype has no
    // spy behind its `mock` accessor.
    expect(prototype === Object.getPrototypeOf(createFastSpy())).toBe(false);
    expect(theirDecorated.probeCrossCopy()).toBe('other copy');
    expect(ourDecorated.probeCrossCopy()).toBe('this copy');
    expect(Object.hasOwn(theirSpy, 'probeCrossCopy')).toBe(false);
    expect(Object.hasOwn(ourSpy, 'probeCrossCopy')).toBe(true);
  });

  it('decorates when only a later key of the bundle is taken', () => {
    const prototype = foreignPrototype();
    const owning = { probeSecondKey: (): string => 'first bundle' };
    const overlapping = { probeFirstKey: (): string => 'second bundle', probeSecondKey: (): string => 'second bundle' };
    const one = foreignSpy(prototype);
    const two = foreignSpy(prototype);

    const first = attachHelpers(one, owning);
    const second = attachHelpers(two, overlapping);

    expect(first.probeSecondKey()).toBe('first bundle');
    expect(second.probeFirstKey()).toBe('second bundle');
    expect(Object.hasOwn(two, 'probeFirstKey')).toBe(true);
    expect(Object.hasOwn(prototype, 'probeFirstKey')).toBe(false);
  });

  it('decorates when the prototype carries a record it cannot read', () => {
    // The symbol is named here on purpose: it is `Symbol.for`, so it is the cross-copy contract
    // rather than a private detail, and it is the only way to reach a prototype some other writer
    // has already claimed that property on.
    const prototype = foreignPrototype();

    Object.defineProperty(prototype, Symbol.for('vitest-auto-spy.sharedHelpers'), { value: 'not a record', configurable: true });

    const spy = foreignSpy(prototype);
    const decorated = attachHelpers(spy, { probeForeignRecord: (): string => 'own slot' });

    expect(decorated.probeForeignRecord()).toBe('own slot');
    expect(Object.hasOwn(spy, 'probeForeignRecord')).toBe(true);
  });

  it('takes an empty bundle without adding anything to the spy', () => {
    const spy = foreignSpy(foreignPrototype());
    const before = Object.getOwnPropertyNames(spy).length;

    attachHelpers(spy, {});

    expect(Object.getOwnPropertyNames(spy)).toHaveLength(before);
  });

  it('keeps a shared bundle off a spread of the spy', () => {
    const helpers = { probeNonEnumerable: (): string => 'hidden' };
    const spy = foreignSpy(foreignPrototype());

    attachHelpers(spy, helpers);

    expect(Object.keys({ ...spy })).not.toContain('probeNonEnumerable');
  });
});
