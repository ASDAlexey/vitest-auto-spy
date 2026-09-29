import { beforeAll, describe, expect, it } from 'vitest';

import { createAccessorsSpies } from './accessor-spy';
import { registerMockAdapter } from './mock-adapter';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

describe('the accessorSpies bag', () => {
  it('is reachable but stays out of keys, spreads and equality', () => {
    const double: Record<string, unknown> = { load: 'kept' };

    createAccessorsSpies(double, ['name'], ['name']);

    expect(Object.keys(double)).toEqual(['load']);
    expect({ ...double }).toEqual({ load: 'kept' });
    expect(double).toEqual({ load: 'kept' });
    expect(Object.getOwnPropertyDescriptor(double, 'accessorSpies')).toMatchObject({
      enumerable: false,
      writable: true,
      configurable: true,
    });
    expect(double['accessorSpies']).toHaveProperty('getters.name');
  });

  it('stays out of keys on a double with no spied accessors, too', () => {
    const double: Record<string, unknown> = {};

    createAccessorsSpies(double, [], []);

    expect(Object.keys(double)).toEqual([]);
    expect(double['accessorSpies']).toEqual({ getters: {}, setters: {} });
  });
});
