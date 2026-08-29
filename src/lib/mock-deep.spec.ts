/**
 * `mockDeep` builds a recursive, class-free auto-mock: every node is both a
 * callable spy (same helpers as `createAutoMock`) and a Proxy that auto-creates
 * nested chainable spies. These specs prove the deep chaining, per-key caching,
 * the spy surface at every depth, and the seeding/guard branches.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { registerMockAdapter } from './mock-adapter';
import { mockDeep } from './mock-deep';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

interface UserRepo {
  find(id: number): string;
}

interface Db {
  repo: { user: UserRepo };
}

interface Root {
  db: Db;
  getName(): string;
  apiUrl: string;
}

/** An API whose member names collide with what every function carries — `name` in particular is not exotic. */
interface Account {
  name(): string;
  call(payload: string): boolean;
  length: number;
}

describe('mockDeep', () => {
  it('auto-creates nested chainable spies without seeding', () => {
    const mock = mockDeep<Root>();

    mock.db.repo.user.find.calledWith(1).mockReturnValue('Ada');

    expect(vi.isMockFunction(mock.db.repo.user.find)).toBe(true);
    expect(mock.db.repo.user.find(1)).toBe('Ada');
  });

  it('caches child nodes so repeated access returns the same reference', () => {
    const mock = mockDeep<Root>();

    expect(mock.db).toBe(mock.db);
    expect(mock.db.repo).toBe(mock.db.repo);
  });

  it('every node is itself a callable spy (including the root)', () => {
    const mock = mockDeep<Root>();

    mock.getName.mockReturnValue('n');
    expect(mock.getName()).toBe('n');

    // The root node is callable too (default no-op return).
    expect((mock as unknown as () => unknown)()).toBeUndefined();
  });

  it('is not thenable and ignores symbol access', () => {
    const mock = mockDeep<Root>();

    expect((mock as unknown as { then: unknown }).then).toBeUndefined();
    expect((mock as unknown as Record<symbol, unknown>)[Symbol.iterator]).toBeUndefined();
  });

  it('seeds concrete values via overrides and assignment', () => {
    const mock = mockDeep<Root>({ apiUrl: 'https://seeded.test' });

    expect(mock.apiUrl).toBe('https://seeded.test');

    mock.apiUrl = 'https://assigned.test';
    expect(mock.apiUrl).toBe('https://assigned.test');
  });

  it('materialises members whose names collide with the function surface', () => {
    const account = mockDeep<Account>();

    account.name.calledWith().mockReturnValue('Ada');
    account.call.mockReturnValue(true);

    expect(vi.isMockFunction(account.name)).toBe(true);
    expect(account.name()).toBe('Ada');
    expect(account.call('payload')).toBe(true);
    // Still one cached child per key, not a fresh node per read.
    expect(account.name).toBe(account.name);
  });

  it('keeps the whole bare-function surface out of the way, not just `name`', () => {
    // `length`, `prototype`, `toString`, `constructor`, `bind` and `apply` all answered on the
    // underlying `vi.fn()` before, so none of them could be a member of the mocked type.
    const account = mockDeep<Account>() as unknown as Record<string, unknown>;

    ['length', 'prototype', 'toString', 'constructor', 'bind', 'apply'].forEach((key) => {
      expect(vi.isMockFunction(account[key])).toBe(true);
    });
  });

  it('keeps the spy helpers of the node itself, which is what the surface is for', () => {
    const account = mockDeep<Account>();

    account.name.mockReturnValue('Grace');
    account.name();

    expect(account.name.mock.calls).toHaveLength(1);
  });

  it('hands back the same bound spy method on every read', () => {
    // `bind` per read allocated a fresh function each time, so `api.log.info !== api.log.info`.
    const mock = mockDeep<Root>();

    expect(mock.getName.mockReturnValue).toBe(mock.getName.mockReturnValue);
  });

  it('hands back spy methods bound to the spy, not to the Proxy', () => {
    // Bun's `mock()` asserts `this instanceof Mock` inside `mockReturnValue`, so a method read off a
    // deep node with `this` still pointing at the Proxy makes every node unusable on `bun:test`.
    const mock = mockDeep<Root>();
    const { mockReturnValue } = mock.db.repo.user.find;

    mockReturnValue('bound');

    expect(mock.db.repo.user.find()).toBe('bound');
  });
});
