/**
 * `lazySpies: 'proxy'` — the parity suite.
 *
 * The mode is only defensible if a double built this way is indistinguishable from one built with
 * accessor placeholders, so almost every case here asserts the two against each other rather than
 * against a hand-written expectation. The exceptions are the two properties the accessor path
 * cannot have: nothing is defined for an untouched method, and reading a descriptor does not build
 * a spy.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createSpyFromClass } from './create-spy-from-class';
import { registerMockAdapter } from './mock-adapter';
import { resetAutoSpy } from './reset-auto-spy';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

class Wide {
  get label(): string {
    return 'real';
  }

  first(): number {
    return 1;
  }

  second(_id: number): string {
    return 'two';
  }

  third(): void {
    /* noop */
  }
}

const proxySpy = (): Record<string, unknown> =>
  createSpyFromClass(Wide, { lazySpies: 'proxy', gettersToSpyOn: ['label'] }) as unknown as Record<string, unknown>;

const accessorSpy = (): Record<string, unknown> =>
  createSpyFromClass(Wide, { lazySpies: true, gettersToSpyOn: ['label'] }) as unknown as Record<string, unknown>;

describe('lazySpies: "proxy"', () => {
  it('answers a method the accessor path had to define, and reports it exactly once', () => {
    expect(Object.getOwnPropertyNames(accessorSpy())).toContain('first');
    expect(Reflect.ownKeys(proxySpy())).toContain('first');
    expect(Reflect.ownKeys(proxySpy()).filter((key) => key === 'first')).toHaveLength(1);
  });

  it('mints a working spy on first read and caches it', () => {
    const spy = proxySpy();
    const first = spy['first'];

    expect(vi.isMockFunction(first)).toBe(true);
    expect(spy['first']).toBe(first);
  });

  it('enumerates exactly what the accessor path enumerates, in the same order', () => {
    expect(Object.keys(proxySpy())).toEqual(Object.keys(accessorSpy()));
    expect(Object.keys(proxySpy())).toEqual(['accessorSpies', 'first', 'second', 'third']);
  });

  it('keeps declaration order after a method has materialised out of order', () => {
    const spy = proxySpy();

    void spy['third'];
    void spy['first'];

    expect(Object.keys(spy)).toEqual(['accessorSpies', 'first', 'second', 'third']);
  });

  it('answers `in` and `hasOwnProperty` for an untouched method', () => {
    const spy = proxySpy();

    expect('second' in spy).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(spy, 'second')).toBe(true);
    expect('nope' in spy).toBe(false);
  });

  it('reports a descriptor without building the spy', () => {
    const spy = proxySpy();
    const descriptor = Object.getOwnPropertyDescriptor(spy, 'first');

    expect(descriptor).toMatchObject({ configurable: true, enumerable: true });
    expect(typeof descriptor?.get).toBe('function');
    expect(vi.isMockFunction(descriptor?.get?.())).toBe(true);
  });

  it('materialises through a descriptor setter, as the placeholder does', () => {
    const spy = proxySpy();
    const replacement = vi.fn();

    Object.getOwnPropertyDescriptor(spy, 'second')?.set?.(replacement);

    expect(spy['second']).toBe(replacement);
  });

  it('spreads and serialises like the accessor path', () => {
    const spread = { ...proxySpy() };

    expect(Object.keys(spread)).toEqual(Object.keys({ ...accessorSpy() }));
    expect(vi.isMockFunction(spread['third'])).toBe(true);
    expect(JSON.stringify(proxySpy())).toBe(JSON.stringify(accessorSpy()));
  });

  it('accepts an assignment over an untouched method', () => {
    const spy = proxySpy();
    const replacement = vi.fn().mockReturnValue(7);

    spy['first'] = replacement;

    expect(spy['first']).toBe(replacement);
    expect(Object.keys(spy)).toEqual(['accessorSpies', 'first', 'second', 'third']);
  });

  it('accepts an assignment to a name the class never had, and reports it last', () => {
    const spy = proxySpy();

    spy['extra'] = 1;

    expect(Object.keys(spy)).toEqual(['accessorSpies', 'first', 'second', 'third', 'extra']);
  });

  it('deletes an untouched method for good', () => {
    const spy = proxySpy();

    expect(delete spy['first']).toBe(true);
    expect('first' in spy).toBe(false);
    expect(Object.keys(spy)).not.toContain('first');
  });

  it('deletes a materialised method for good', () => {
    const spy = proxySpy();

    void spy['first'];

    expect(delete spy['first']).toBe(true);
    expect('first' in spy).toBe(false);
  });

  it('deletes a key that is not one of the class methods', () => {
    const spy = proxySpy();

    expect(delete spy[Symbol.dispose as unknown as string]).toBe(true);
    expect(delete spy['accessorSpies']).toBe(true);
    expect(Object.getOwnPropertySymbols(spy)).toEqual([]);
    expect(Object.keys(spy)).toEqual(['first', 'second', 'third']);
  });

  it('freezes a double that has already materialised part of itself', () => {
    const spy = createSpyFromClass(Wide, { lazySpies: 'proxy' }) as unknown as Record<string, unknown>;
    const first = spy['first'];

    Object.freeze(spy);

    expect(spy['first']).toBe(first);
    expect(Object.keys(spy)).toEqual(['accessorSpies', 'first', 'second', 'third']);
  });

  it('accepts a redefinition through `Object.defineProperty`', () => {
    const spy = proxySpy();

    Object.defineProperty(spy, 'second', { configurable: true, enumerable: true, writable: true, value: 42 });

    expect(spy['second']).toBe(42);
  });

  it('materialises everything before freezing, so enumeration keeps working', () => {
    // Without the getter: `Object.freeze` makes the accessor spy non-configurable, and Vitest's own
    // `restoreAllMocks` then throws at teardown — on either lazy path, so it is not this mode's
    // business and only obscures what the case is about.
    const spy = createSpyFromClass(Wide, { lazySpies: 'proxy' }) as unknown as Record<string, unknown>;

    Object.freeze(spy);

    expect(Object.isFrozen(spy)).toBe(true);
    expect(Object.keys(spy)).toEqual(['accessorSpies', 'first', 'second', 'third']);
    expect(vi.isMockFunction(spy['third'])).toBe(true);
  });

  it('keeps the accessor spies and the dispose symbol on the record', () => {
    const spy = proxySpy();

    expect(spy['accessorSpies']).toBeDefined();
    expect(Object.getOwnPropertySymbols(spy)).toEqual(Object.getOwnPropertySymbols(accessorSpy()));
  });

  it('leaves an untouched method alone when the double is reset', () => {
    const spy = proxySpy();

    const first = spy['first'] as ((argument: string) => void) & { mock: { calls: unknown[] } };

    first('once');
    resetAutoSpy(spy);

    expect(first.mock.calls).toHaveLength(0);
    // The reset read every descriptor to find the mocks, and `second` is still not built.
    expect(Object.getOwnPropertyDescriptor(spy, 'second')?.value).toBeUndefined();
  });

  it('carries `returns` and `overrides` through the traps', () => {
    const seeded = (): void => undefined;
    const spy = createSpyFromClass(Wide, { lazySpies: 'proxy', returns: { first: 9 }, overrides: { third: seeded } }) as unknown as Record<
      string,
      unknown
    >;

    expect((spy['first'] as () => number)()).toBe(9);
    expect(spy['third']).toBe(seeded);
  });

  it('composes with `fillMissing`', () => {
    const spy = createSpyFromClass(Wide, { lazySpies: 'proxy', fillMissing: true }) as unknown as Record<string, unknown>;

    expect(vi.isMockFunction(spy['second'])).toBe(true);
    expect(vi.isMockFunction(spy['neverDeclared'])).toBe(true);
  });
});
