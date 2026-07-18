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
});
