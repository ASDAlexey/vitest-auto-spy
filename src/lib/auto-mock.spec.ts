/**
 * `createAutoMock` works from a *type/interface alone* — no class is read at
 * runtime. These specs prove: typed method spies are materialized lazily, cached
 * by key (same ref), expose the same control helpers as class-based spies
 * (`mockReturnValue`/`calledWith` for sync, `resolveWith` for promises),
 * `overrides` seeding wins over spy creation, and plain property access is sane.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createAutoMock } from './auto-mock';
import { registerMockAdapter } from './mock-adapter';
import { vitestMockAdapter } from './vitest-adapter';

// Self-contained: register the default Vitest adapter so the runtime-agnostic
// core can create mock fns regardless of test-file isolation/order.
beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

interface UserService {
  getName(id: number): string;
  getUser(id: number): Promise<{ id: number; name: string }>;
  apiUrl: string;
}

describe('createAutoMock', () => {
  it('lazily materializes a decorated function spy per accessed method', () => {
    const mock = createAutoMock<UserService>();

    expect(vi.isMockFunction(mock.getName)).toBe(true);

    mock.getName(1);
    expect(mock.getName).toHaveBeenCalledWith(1);
  });

  it('caches the spy so repeated access returns the same reference', () => {
    const mock = createAutoMock<UserService>();

    const first = mock.getName;
    const second = mock.getName;

    expect(first).toBe(second);
  });

  it('supports calledWith argument-matching on a sync method spy', () => {
    const mock = createAutoMock<UserService>();

    mock.getName.calledWith(1).mockReturnValue('One');
    mock.getName.calledWith(2).mockReturnValue('Two');

    expect(mock.getName(1)).toBe('One');
    expect(mock.getName(2)).toBe('Two');
  });

  it('supports resolveWith on a Promise-returning method spy', async () => {
    const mock = createAutoMock<UserService>();

    mock.getUser.resolveWith({ id: 1, name: 'Ada' });

    await expect(mock.getUser(1)).resolves.toEqual({ id: 1, name: 'Ada' });
  });

  it('seeds concrete values/implementations via overrides (not turned into spies)', () => {
    const mock = createAutoMock<UserService>({
      apiUrl: 'https://example.test',
      getName: ((id: number) => `seeded-${id}`) as UserService['getName'],
    });

    expect(mock.apiUrl).toBe('https://example.test');
    expect(vi.isMockFunction(mock.getName)).toBe(false);
    expect(mock.getName(7)).toBe('seeded-7');
  });

  it('allows assigning a plain property after creation', () => {
    const mock = createAutoMock<UserService>();

    mock.apiUrl = 'https://assigned.test';

    expect(mock.apiUrl).toBe('https://assigned.test');
  });

  it('does not look like a thenable (then resolves to undefined)', () => {
    const mock = createAutoMock<UserService>();

    expect((mock as unknown as { then: unknown }).then).toBeUndefined();
  });

  it('reflects cached keys via `in`, Object.keys and getOwnPropertyDescriptor', () => {
    const mock = createAutoMock<UserService>({ apiUrl: 'https://seeded.test' });

    // `has` trap: seeded key present, un-accessed key absent
    expect('apiUrl' in mock).toBe(true);
    expect('getName' in mock).toBe(false);

    void mock.getName; // materialize + cache a spy → now an own key

    // `ownKeys` + `getOwnPropertyDescriptor` (enumerable check) via Object.keys
    expect(Object.keys(mock).sort()).toEqual(['apiUrl', 'getName']);

    // `getOwnPropertyDescriptor`: present (value branch) vs missing (undefined branch)
    expect(Object.getOwnPropertyDescriptor(mock, 'apiUrl')).toMatchObject({
      value: 'https://seeded.test',
      enumerable: true,
      configurable: true,
      writable: true,
    });
    expect(Object.getOwnPropertyDescriptor(mock, 'absent')).toBeUndefined();
  });
});
