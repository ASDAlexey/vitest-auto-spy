/**
 * `fallbackMockImplementation`: what a call answers on a node nobody configured. The precedence is
 * the contract — configuration, then the fallback, then `selfReturning` — and nothing suite-wide
 * joins it.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { setDefaultStrictMode } from './function-spy';
import { registerMockAdapter } from './mock-adapter';
import { mockDeep } from './mock-deep';
import { resetAutoSpy } from './reset-auto-spy';
import { asInstance } from './spy-typing';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

interface User {
  id: number;
}

interface Db {
  user: {
    findUnique(where: { id: number }): Promise<User | null>;
    count(): number;
  };
  rows: { read(): string }[];
}

function notMocked(): never {
  throw new Error('not mocked');
}

describe('mockDeep({ fallbackMockImplementation })', () => {
  it('answers a call nobody configured, at any depth', () => {
    const db = mockDeep<Db>({}, { fallbackMockImplementation: notMocked });

    expect(() => db.user.count()).toThrow('not mocked');
    expect(() => (db as unknown as () => unknown)()).toThrow('not mocked');
    expect(() => db.rows[0]?.read()).toThrow('not mocked');
  });

  it('records the call it answered', () => {
    const db = mockDeep<Db>({}, { fallbackMockImplementation: notMocked });

    expect(() => db.user.count()).toThrow();
    expect(db.user.count).toHaveBeenCalledTimes(1);
  });

  it('hands the fallback the call arguments and returns what it returns', () => {
    const fallback = vi.fn((...args: unknown[]) => args.length);
    const db = mockDeep<Db>({}, { fallbackMockImplementation: fallback });

    expect(db.user.findUnique({ id: 1 })).toBe(1);
    expect(fallback).toHaveBeenCalledWith({ id: 1 });
  });

  it('changes nothing on a tree built without one', () => {
    expect(mockDeep<Db>().user.count()).toBeUndefined();
  });

  it('never reaches a configured node', async () => {
    const db = mockDeep<Db>({}, { fallbackMockImplementation: notMocked });

    db.user.count.mockReturnValue(2);
    db.user.findUnique.calledWith({ id: 1 }).resolveWith({ id: 1 });
    db.rows[0]?.read.mockReturnValue('row');

    expect(db.user.count()).toBe(2);
    await expect(db.user.findUnique({ id: 1 })).resolves.toEqual({ id: 1 });
    expect(db.rows[0]?.read()).toBe('row');
  });

  it('is per node, not per call: a calledWith miss answers undefined', () => {
    const db = mockDeep<Db>({}, { fallbackMockImplementation: notMocked });

    db.user.findUnique.calledWith({ id: 1 }).resolveWith({ id: 1 });

    expect(db.user.findUnique({ id: 2 })).toBeUndefined();
  });

  it('leaves "any other arguments fail" to mustBeCalledWith', () => {
    const db = mockDeep<Db>({}, { fallbackMockImplementation: notMocked });

    db.user.findUnique.mustBeCalledWith({ id: 1 }).resolveWith({ id: 1 });

    expect(() => db.user.findUnique({ id: 2 })).toThrow(/findUnique/);
  });

  it('applies again once resetAutoSpy has dropped the configuration', () => {
    const db = mockDeep<Db>({}, { fallbackMockImplementation: notMocked });

    db.user.count.mockReturnValue(2);
    resetAutoSpy(db);

    expect(() => db.user.count()).toThrow('not mocked');
  });
});

describe('mockDeep — fallbackMockImplementation next to selfReturning', () => {
  interface Query {
    where(field: string): Query;
    all(): string[];
  }

  it('chains when the fallback answers undefined', () => {
    const fallback = vi.fn();
    const query = mockDeep<Query>({}, { selfReturning: true, fallbackMockImplementation: fallback });

    expect(query.where('id')).toBe(query.where);
    expect(fallback).toHaveBeenCalledWith('id');
  });

  it('answers with the fallback when it returns a value', () => {
    const query = mockDeep<Query>({}, { selfReturning: true, fallbackMockImplementation: () => 'fallback' });

    expect(query.where('id')).toBe('fallback');
  });

  it('throws when the fallback throws, instead of chaining past it', () => {
    const query = mockDeep<Query>({}, { selfReturning: true, fallbackMockImplementation: notMocked });

    expect(() => query.where('id')).toThrow('not mocked');
  });
});

describe('mockDeep — suite-wide strict mode', () => {
  afterEach(() => {
    setDefaultStrictMode(undefined);
  });

  it('does not reach a deep tree, with or without a fallback', () => {
    const handler = vi.fn(() => 'suite-wide');

    setDefaultStrictMode({ strict: true, onUnstubbedCall: handler });

    expect(mockDeep<Db>().user.count()).toBeUndefined();
    expect(mockDeep<Db>({}, { fallbackMockImplementation: () => 7 }).user.count()).toBe(7);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('mockDeep — a method that runs a callback with the client', () => {
  interface Client {
    user: { count(): Promise<number> };
    transaction<R>(run: (tx: Client) => Promise<R>): Promise<R>;
  }

  it('hands the mock to the callback once mockImplementation says so, and the fallback guards the rest', async () => {
    const client = mockDeep<Client>({}, { fallbackMockImplementation: notMocked });

    client.transaction.mockImplementation((run) => run(asInstance(client)));
    client.user.count.resolveWith(3);

    await expect(client.transaction((tx) => tx.user.count())).resolves.toBe(3);
    await expect(client.transaction(async (tx) => tx.transaction(async () => 0))).resolves.toBe(0);
    expect(client.transaction).toHaveBeenCalledTimes(3);
  });
});
