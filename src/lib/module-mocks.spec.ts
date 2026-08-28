/**
 * Both helpers exist for failures that produce no message of their own: a `vi.mock` the bundler
 * dropped, and a factory whose result the interop probe of a dependency does not recognise. The
 * specs therefore assert on what the diagnostics *say*, not only on that they fire.
 */
import { describe, expect, it, vi } from 'vitest';

import { assertMocked, moduleNamespace } from './module-mocks';

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
