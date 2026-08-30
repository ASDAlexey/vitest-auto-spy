/**
 * The mock-adapter registry.
 *
 * The registry is process-wide, and under `isolate: false` every spec file shares it, so this file
 * cannot assume it is the first to touch it — nor may it leave a fake adapter behind for whatever
 * runs next. Each test empties the registry itself and restores whatever was there before, which is
 * what makes the "no adapter registered" path testable regardless of file order or isolation.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type MockAdapter,
  getMockAdapter,
  guardAccessorSpies,
  hasMockAdapter,
  registerMockAdapter,
  resetMockAdapter,
} from './mock-adapter';

const fakeAdapter: MockAdapter = {
  createMockFn: () => () => undefined,
  spyOnGetter: () => () => undefined,
  spyOnSetter: () => () => undefined,
  getCalls: () => [],
  reset: () => undefined,
  clear: () => undefined,
  restoreImplementation: () => undefined,
};

describe('mock adapter registry', () => {
  let installedAdapter: MockAdapter | undefined;

  beforeEach(() => {
    installedAdapter = hasMockAdapter() ? getMockAdapter() : undefined;
    resetMockAdapter();
  });

  afterEach(() => {
    resetMockAdapter();

    if (installedAdapter) {
      registerMockAdapter(installedAdapter);
    }
  });

  it('reports an empty registry before any entry has registered an adapter', () => {
    expect(hasMockAdapter()).toBe(false);
  });

  it('throws an actionable hint when no entry has registered an adapter', () => {
    expect(() => getMockAdapter()).toThrow(/no mock adapter registered/i);
  });

  it('returns the adapter installed by a runtime entry', () => {
    registerMockAdapter(fakeAdapter);

    expect(hasMockAdapter()).toBe(true);
    expect(getMockAdapter()).toBe(fakeAdapter);
  });
});

/**
 * The diagnostic every adapter wears.
 *
 * A property that refuses to be redefined is the loud half of "the bundler already inlined this
 * module": `vi.spyOn`, Bun's redefine and `node:test`'s redefine all end in the same
 * `Object.defineProperty` and all report `TypeError: Cannot redefine property: x` — a message that
 * names neither the object nor the way out. These cover what the replacement says, and that it
 * stays out of the way of every other failure.
 */
describe('guardAccessorSpies', () => {
  const cannotRedefine = (): never => {
    throw new TypeError('Cannot redefine property: injectDomainMetrics');
  };

  /** An adapter whose accessor spies always hit a non-configurable property. */
  const refusing: MockAdapter = { ...fakeAdapter, spyOnGetter: cannotRedefine, spyOnSetter: cannotRedefine };

  it('passes a working accessor spy straight through', () => {
    const mock = (): undefined => undefined;
    const adapter = guardAccessorSpies({ ...fakeAdapter, spyOnGetter: () => mock, spyOnSetter: () => mock });

    expect(adapter.spyOnGetter({}, 'value')).toBe(mock);
    expect(adapter.spyOnSetter({}, 'value')).toBe(mock);
  });

  it('names the property, the accessor and the way out, keeping the original as the cause', () => {
    const namespace = Object.freeze({ [Symbol.toStringTag]: 'Module', injectDomainMetrics: (): undefined => undefined });

    let thrown: unknown;

    try {
      guardAccessorSpies(refusing).spyOnGetter(namespace, 'injectDomainMetrics');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      "[vitest-auto-spy] Cannot spy on the 'get' accessor of 'injectDomainMetrics': the property is not configurable, " +
        'so it cannot be redefined. The target is an ES module namespace.\n' +
        'An ES module namespace is what a bundler leaves behind once it has inlined a barrel or a workspace alias ' +
        '(`@angular/build:unit-test`, a pre-bundled `vite-node` entry): the export is a live binding, not a writable ' +
        'property, and no spy library — this one, `vi.spyOn`, `jest.spyOn` — can replace it. `vi.mock()` of the same ' +
        'module is the silent version of this failure, not the fix.\n' +
        'Give the code under test a real seam and spy on that: inject the dependency, pass it in as an argument, or ' +
        'reach it through a class or object your own code owns.\n' +
        'Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/module-mocks#provide-a-real-seam',
    );
    expect((thrown as Error).cause).toBeInstanceOf(TypeError);
  });

  it('names the setter when that is the half that failed', () => {
    expect(() => guardAccessorSpies(refusing).spyOnSetter({}, 'value')).toThrow(/Cannot spy on the 'set' accessor of 'value'/);
  });

  it.each([
    ['an ES module namespace', { [Symbol.toStringTag]: 'Module' }],
    ['a frozen object', Object.freeze({ value: 1 })],
    ['an instance of Service', new (class Service {})()],
    ['a plain object', { value: 1 }],
    ['a plain object', Object.create(null)],
  ])('describes the target as %s', (description, target: object) => {
    expect(() => guardAccessorSpies(refusing).spyOnGetter(target, 'value')).toThrow(new RegExp(`The target is ${description}\\.`));
  });

  it('leaves every other failure exactly as it was', () => {
    const boom = new TypeError('target is not an object');
    const exploding: MockAdapter = {
      ...fakeAdapter,
      spyOnGetter: (): never => {
        throw boom;
      },
    };

    expect(() => guardAccessorSpies(exploding).spyOnGetter({}, 'value')).toThrow(boom);
  });
});
