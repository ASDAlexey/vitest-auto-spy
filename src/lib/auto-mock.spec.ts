/**
 * `createAutoMock` works from a *type/interface alone* — no class is read at
 * runtime. These specs prove: typed method spies are materialized lazily, cached
 * by key (same ref), expose the same control helpers as class-based spies
 * (`mockReturnValue`/`calledWith` for sync, `resolveWith` for promises),
 * `overrides` seeding wins over spy creation, and plain property access is sane.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { autoMocked, createAutoMock } from './auto-mock';
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

describe('autoMocked', () => {
  interface LogMethods {
    err(message: string, error: Error): void;
    debug(message: string): void;
  }

  /** Takes the collaborator as a parameter rather than injecting it — the shape the helper is for. */
  function detect(logger: LogMethods): void {
    logger.err('VPN detection failed', new Error('FAKE ERROR'));
  }

  it('is accepted as `T` and asserted on as a spy, with no bridge call', () => {
    const logger = autoMocked<LogMethods>();

    detect(logger);

    expect(logger.err).toHaveBeenCalledWith('VPN detection failed', expect.any(Error));
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('seeds overrides like createAutoMock does', () => {
    const logger = autoMocked<LogMethods>({ debug: (): void => undefined });

    expect(logger.debug('x')).toBeUndefined();
  });
});

describe('the auto-spy brand', () => {
  it('answers to the brand without carrying it into the mock’s own keys', () => {
    const mock = createAutoMock<{ load(): void }>({ load: () => undefined });
    const brand = Symbol.for('vitest-auto-spy.mock');

    // `injectSpy` reads it to tell a provided double from the real instance DI built instead.
    expect(brand in mock).toBe(true);
    expect(Reflect.get(mock, brand)).toBe(true);

    // …and a spread or a snapshot of the mock must not carry it.
    expect(Object.keys(mock)).toEqual(['load']);
  });
});

describe('createAutoMock returns configuration', () => {
  interface Products {
    getProducts(): string[];
    label: string;
  }

  it('configures the spy rather than replacing it, which is what a seed cannot do', () => {
    const products = createAutoMock<Products>(undefined, { returns: { getProducts: ['a'] } });

    expect(products.getProducts()).toEqual(['a']);
    // Still a spy — a seeded `{ getProducts: () => ['a'] }` would have thrown the assertion away.
    expect(products.getProducts).toHaveBeenCalledTimes(1);
  });

  it('says so when `returns` names a member the double never spies', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // `then` is held back on purpose so the mock is not treated as a Promise — which also means a
    // return value configured for it could never be handed back.
    createAutoMock<{ then(): void }>(undefined, { returns: { then: undefined } });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('never turns into a spy'));
    warn.mockRestore();
  });
});
