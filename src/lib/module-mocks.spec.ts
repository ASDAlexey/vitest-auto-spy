/**
 * Both helpers exist for failures that produce no message of their own: a `vi.mock` the bundler
 * dropped, and a factory whose result the interop probe of a dependency does not recognise. The
 * specs therefore assert on what the diagnostics *say*, not only on that they fire.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { adoptMock } from './adopt-mock';
import type { User } from './adopt-mock.fixture';
import { registerMockAdapter } from './mock-adapter';
import { assertMocked, moduleNamespace } from './module-mocks';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

describe('assertMocked', () => {
  it('passes when some export of the namespace is a runner mock', () => {
    expect(() => assertMocked({ createEngine: vi.fn(), VERSION: '4.0.0' })).not.toThrow();
  });

  it('names the specifier when nothing in the namespace is mocked', () => {
    expect(() => assertMocked({ createEngine: (): void => undefined }, { specifier: '@app/pricing-engine' })).toThrow(
      /assertMocked\('@app\/pricing-engine'\): nothing in the module namespace is a mock function/,
    );
  });

  it('falls back to "the imported module" when no specifier is given', () => {
    expect(() => assertMocked({ value: 1 })).toThrow(/assertMocked\(the imported module\)/);
  });

  it('names the exports that stayed real', () => {
    const namespace = { createEngine: vi.fn(), destroyEngine: (): void => undefined };

    expect(() => assertMocked(namespace, { exports: ['createEngine', 'destroyEngine'] })).toThrow(
      /destroyEngine is not a mock, so the code under test is calling the real implementation/,
    );
  });

  it('pluralises the report when several exports stayed real', () => {
    const namespace = { a: (): void => undefined, b: (): void => undefined };

    expect(() => assertMocked(namespace, { exports: ['a', 'b'] })).toThrow(/a, b are not a mock/);
  });

  it('refuses an empty exports list, which could only ever pass', () => {
    // `exports: []` — what `Object.keys(stubs)` or a filtered constant produces when it comes out
    // empty — took the named-exports branch, found nothing to check and returned. The one call in the
    // file whose job is to prove the mock applied proved nothing.
    expect(() => assertMocked({ createEngine: (): void => undefined }, { exports: [], specifier: '@app/pricing-engine' })).toThrow(
      /assertMocked\('@app\/pricing-engine'\): the `exports` list is empty, so this call cannot fail/,
    );
  });

  it('accepts a listed export that is a mock, and hands the namespace back', () => {
    const namespace = { createEngine: vi.fn() };

    expect(assertMocked(namespace, { exports: ['createEngine'] })).toBe(namespace);
  });

  it('does not mistake a plain object property for a mock', () => {
    // The shape check is `typeof value.mock === 'object'`; a non-callable carrying a `mock` field
    // must not satisfy it, or a fixture object would read as a mocked module.
    expect(() => assertMocked({ notAFunction: { mock: { calls: [] } } })).toThrow(/nothing in the module namespace is a mock function/);
  });

  it('does not mistake a plain function for a mock', () => {
    const bare = (): void => undefined;

    expect(() => assertMocked({ bare })).toThrow(/nothing in the module namespace is a mock function/);
  });
});

describe('moduleNamespace', () => {
  it('adds the default export an interop probe looks for', () => {
    const exports = { Player: vi.fn() };
    const namespace = moduleNamespace(exports);

    expect(namespace.Player).toBe(exports.Player);
    expect(namespace.default).toBe(exports);
    expect(namespace.__esModule).toBe(true);
  });

  it('keeps a default the factory spelled out, which is the module shape that fails without it', () => {
    const stub = vi.fn(() => 'formatted');
    const namespace = moduleNamespace({ default: stub, isDayjs: vi.fn() });

    // `vi.mock('dayjs', () => moduleNamespace({ default: dayjsStub }))`: the dependency probes
    // `mod.default ?? mod` and used to be handed the namespace object, so `default(…)` threw.
    expect(namespace.default).toBe(stub);
    expect(namespace.default()).toBe('formatted');
  });

  it('leaves an unknown export absent by default, so a drifted factory is caught', () => {
    const namespace = moduleNamespace({ Player: vi.fn() });

    expect('TextDisplayer' in namespace).toBe(false);
  });

  it('reports an unknown export as present-and-undefined when lenient', () => {
    const namespace = moduleNamespace({ Player: vi.fn() }, { lenient: true });

    // Both halves matter: Vitest's own guard asks `in`, and the code under test then reads the key.
    expect('TextDisplayer' in namespace).toBe(true);
    expect(Reflect.get(namespace, 'TextDisplayer')).toBeUndefined();
    expect(namespace.__esModule).toBe(true);
  });

  it('never claims `then` or a symbol, so the namespace is not mistaken for a promise', async () => {
    const namespace = moduleNamespace({ Player: vi.fn() }, { lenient: true });

    expect('then' in namespace).toBe(false);
    expect(Symbol.iterator in namespace).toBe(false);
    await expect(Promise.resolve(namespace)).resolves.toBe(namespace);
  });
});

describe('moduleNamespace with passthrough', () => {
  class Engine {
    readonly kind = 'real';
  }

  const actual = {
    VERSION: '4.0.0',
    Engine,
    format: (value: number): string => `real ${value}`,
    default: (value: number): number => value * 2,
  };

  it('runs the real function until the test configures it, and records the call', () => {
    const namespace = moduleNamespace(actual, { passthrough: true });

    expect(namespace.format(1)).toBe('real 1');
    expect(namespace.format).toHaveBeenCalledWith(1);

    adoptMock(namespace.format).calledWith(2).mockReturnValue('two');

    expect(namespace.format(2)).toBe('two');
  });

  it('leaves values and classes as they are, and the module it was given untouched', () => {
    const namespace = moduleNamespace(actual, { passthrough: true });

    expect(namespace.VERSION).toBe('4.0.0');
    expect(namespace.Engine).toBe(Engine);
    expect(new namespace.Engine().kind).toBe('real');
    expect(vi.isMockFunction(actual.format)).toBe(false);
  });

  it('spies the default export and hands the interop probe the spy', () => {
    const namespace = moduleNamespace(actual, { passthrough: true });

    expect(namespace.default(3)).toBe(6);
    expect(namespace.default).toHaveBeenCalledWith(3);
  });

  it('passes assertMocked for the exports it spied', () => {
    const namespace = moduleNamespace(actual, { passthrough: true });

    expect(() => assertMocked(namespace, { exports: ['format', 'default'] })).not.toThrow();
    expect(() => assertMocked(namespace, { exports: ['Engine'] })).toThrow(/Engine is not a mock/);
  });

  describe('as a vi.doMock factory over the actual module', () => {
    afterEach(() => {
      vi.doUnmock('./adopt-mock.fixture');
      vi.resetModules();
    });

    it('keeps the real module working until the test configures an argument list', async () => {
      vi.doMock('./adopt-mock.fixture', async (importOriginal) => moduleNamespace(await importOriginal<object>(), { passthrough: true }));

      const api = await import('./adopt-mock.fixture');
      const ada: User = { id: 7, name: 'Ada' };

      await expect(api.loadUser(1)).resolves.toEqual({ id: 1, name: 'real' });

      adoptMock(api.loadUser).calledWith(7).resolveWith(ada);

      await expect(api.loadUser(7)).resolves.toBe(ada);
      // Configured means configured: an argument list nothing matches gets the spy's default, as on every spy.
      expect(api.loadUser(1)).toBeUndefined();
      expect(api.loadUser).toHaveBeenCalledTimes(3);
    });
  });
});
