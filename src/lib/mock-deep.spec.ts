/**
 * `mockDeep` builds a recursive, class-free auto-mock: every node is both a
 * callable spy (same helpers as `createAutoMock`) and a Proxy that auto-creates
 * nested chainable spies. These specs prove the deep chaining, per-key caching,
 * the spy surface at every depth, and the seeding/guard branches.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { registerMockAdapter } from './mock-adapter';
import { mockDeep } from './mock-deep';
import { asInstance, asSpy } from './spy-typing';
import type { DeepMockProxy } from './types';
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

    expect(mock.db.repo.user.find(1)).toBe('bound');
  });
});

describe('mockDeep({ selfReturning: true })', () => {
  /** The fluent shape the option exists for: a factory call, then a method on what it returned. */
  interface AppLogger {
    channel(name: string): AppLogger;
    info(message: string): void;
  }

  interface QueryBuilder {
    where(field: string): QueryBuilder;
    limit(count: number): QueryBuilder;
    all(): string[];
  }

  it('is off by default — a called node returns `undefined`, and that is the trap', () => {
    const logger = mockDeep<AppLogger>();

    // Documented rather than fixed silently: `DeepMockProxy<AppLogger>` types this chain perfectly,
    // so the failure only shows up at runtime.
    expect(logger.channel('app')).toBeUndefined();
  });

  it('chains through calls when it is on', () => {
    const logger = mockDeep<AppLogger>({}, { selfReturning: true });

    logger.channel('app').info('started');

    expect(logger.channel('app').info).toHaveBeenCalledWith('started');
  });

  it('chains as many calls deep as the builder does', () => {
    const query = mockDeep<QueryBuilder>({}, { selfReturning: true });
    const limited = query.where('id').limit(10);

    limited.all();

    // Each hop lands on the node the *read* produced, so the calls are recorded down the same path
    // the chain walked: `where`, then `where.limit`, then `where.limit.all`.
    expect(query.where).toHaveBeenCalledWith('id');
    expect(asSpy<QueryBuilder>(query.where('id')).limit).toHaveBeenCalledWith(10);
    expect(asSpy<QueryBuilder>(limited).all).toHaveBeenCalled();
  });

  it('still answers with whatever the node was configured to return', () => {
    const query = mockDeep<QueryBuilder>({}, { selfReturning: true });

    // What a call hands back is typed as the declared return type (`QueryBuilder`), not as a spy —
    // the node underneath is one, so `asSpy` is the bridge, exactly as it is for a DI-injected spy.
    asSpy<QueryBuilder>(query.where('id')).all.mockReturnValue(['Ada']);

    expect(query.where('id').all()).toEqual(['Ada']);
  });

  it('leaves a configured `calledWith` return in place', () => {
    const logger = mockDeep<AppLogger>({}, { selfReturning: true });

    logger.channel.calledWith('audit').mockReturnValue(logger);

    expect(logger.channel('audit')).toBe(logger);
  });
});

describe('handing a deep mock to something that wants the real type', () => {
  interface AppLogger {
    channel(name: string): AppLogger;
    info(message: string): void;
  }

  /** The API under test: it wants an `AppLogger`, not a double. */
  function boot(logger: AppLogger): void {
    logger.channel('app').info('started');
  }

  it('goes through `asInstance`, the same bridge a class spy uses', () => {
    const logger = mockDeep<AppLogger>({}, { selfReturning: true });

    // `DeepMockProxy<T>` has no `accessorSpies` bag, so it did not fit `asInstance`'s `Spy<T>`
    // parameter — and a deep mock had nowhere to go: the decision tree sends you here when the
    // calls chain, and then the result could not be handed to anything expecting `T`.
    boot(asInstance(logger));

    expect(logger.channel).toHaveBeenCalledWith('app');
    expect(asSpy<AppLogger>(logger.channel('app')).info).toHaveBeenCalledWith('started');
  });
});

describe('mockDeep — Symbol.dispose', () => {
  it('resets the whole tree at the end of a `using` block, children included', () => {
    let escaped: DeepMockProxy<Root> | undefined = undefined;

    {
      using api = mockDeep<Root>();
      api.db.repo.user.find.calledWith(1).mockReturnValue('Ada');

      expect(api.db.repo.user.find(1)).toBe('Ada');
      escaped = api;
    }

    // `resetAutoSpy` walks `DEEP_CHILDREN`, so a `calledWith` seeded three levels down does not
    // outlive the block — which is the whole reason a deep mock needs the hook at all.
    expect(escaped.db.repo.user.find).toHaveBeenCalledTimes(0);
    expect(escaped.db.repo.user.find(1)).toBeUndefined();
  });

  it('answers before the spy surface, with one stable function at every depth', () => {
    const api = mockDeep<Root>();

    // The ordering is the point. Vitest's own `vi.fn()` carries an own `[Symbol.dispose]` that
    // calls `mockRestore`, and that key is therefore part of the spy surface a node forwards to —
    // so without the trap answering first, `using` on a deep mock restored the root node and left
    // every seeded child exactly as it was.
    expect(api[Symbol.dispose]).toBe(api[Symbol.dispose]);
    expect(Reflect.get(api.db.repo, Symbol.dispose)).toBe(api[Symbol.dispose]);
  });

  it('lets a member written under the same name win, as every other key does', () => {
    const disposed = vi.fn();
    const api = mockDeep<Root>();

    api[Symbol.dispose] = disposed;
    api[Symbol.dispose]();

    expect(disposed).toHaveBeenCalledTimes(1);
  });
});
