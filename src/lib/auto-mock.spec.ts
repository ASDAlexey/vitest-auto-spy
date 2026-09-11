/**
 * `createAutoMock` works from a *type/interface alone* — no class is read at
 * runtime. These specs prove: typed method spies are materialized lazily, cached
 * by key (same ref), expose the same control helpers as class-based spies
 * (`mockReturnValue`/`calledWith` for sync, `resolveWith` for promises),
 * `overrides` seeding wins over spy creation, and plain property access is sane.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { autoMocked, createAutoMock } from './auto-mock';
import { takeStrictViolations } from './function-spy';
import { registerMockAdapter } from './mock-adapter';
import { mockValueProp, restoreMockedProps } from './prop-mock';
import { resetAutoSpy } from './reset-auto-spy';
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

interface Session {
  readonly accessToken: string;
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

  it('restubs a readonly member of the source type through mockValueProp, seeded or not', () => {
    // `Spy<T>` keeps the `readonly` a homomorphic mapped type inherits, so a plain assignment is
    // rejected — the `@ts-expect-error` lines are the assertion, checked by `npm run typecheck`.
    // `mockValueProp` type-checks against the same member (`readonly` does not take a key out of
    // `keyof T`) and defines the value rather than setting it, which is what also makes it work on
    // a spied accessor. See `src/type-tests/spy.test-d.ts` for the type half.
    const seeded = createAutoMock<Session>({ accessToken: 'first' });
    const bare = createAutoMock<Session>();

    // @ts-expect-error -- TS2540: the seed does not make the member writable
    seeded.accessToken = 'ignored';
    // @ts-expect-error -- TS2540: nor does leaving it unseeded
    bare.accessToken = 'ignored';

    mockValueProp(seeded, 'accessToken', 'second');
    mockValueProp(bare, 'accessToken', 'only');

    expect(seeded.accessToken).toBe('second');
    expect(bare.accessToken).toBe('only');
    restoreMockedProps();
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

  it('takes the configuration createAutoMock takes, so a strict double can say what it answers', () => {
    const logger = autoMocked<LogMethods>(undefined, { strict: true, name: 'LogMethods', returns: { err: undefined } });

    detect(logger);

    expect(logger.err).toHaveBeenCalledTimes(1);
    expect(() => logger.debug('x')).toThrow('Nothing configured LogMethods.debug');
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

  it('is a default that calledWith, resolveWith and failWith configured later build on, not a wall', () => {
    interface Store {
      get(key: string): string | null;
      load(): Promise<number>;
      save(value: string): void;
    }

    const store = createAutoMock<Store>(undefined, { returns: { get: 'default', load: Promise.resolve(0), save: undefined } });

    store.get.calledWith('k').mockReturnValue('v');
    store.load.resolveWith(5);
    store.save.failWith(new Error('disk full'));

    expect(store.get('k')).toBe('v');
    expect(store.get('other')).toBe('default');
    return expect(store.load())
      .resolves.toBe(5)
      .then(() => expect(() => store.save('x')).toThrow('disk full'));
  });

  it('counts as configured under strict, undefined included, until the double is reset', () => {
    const store = createAutoMock<{ save(value: string): void }>(undefined, { strict: true, returns: { save: undefined } });

    expect(store.save('x')).toBeUndefined();

    resetAutoSpy(store);

    expect(() => store.save('x')).toThrow('Nothing configured save');
    takeStrictViolations();
  });

  it('falls back to the host implementation for a callable the library did not build', () => {
    const save = vi.fn(() => 'seeded');
    const store = createAutoMock<{ save(): string }>({ save }, { returns: { save: 'configured' } });

    expect(store.save()).toBe('configured');
  });

  it('says so when `returns` names a member the double never spies', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // `then` is held back on purpose so the mock is not treated as a Promise — which also means a
    // return value configured for it could never be handed back.
    createAutoMock<{ then(): void }>(undefined, { returns: { then: undefined } });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('never turns into a spy'));
    warn.mockRestore();
  });

  it('says so for constructor too, which answers Object rather than a spy', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    createAutoMock<{ constructor: () => void }>(undefined, { returns: { constructor: undefined } });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("returns names 'constructor'"));
    warn.mockRestore();
  });

  it('answers constructor with Object, so an error path reading constructor.name works', () => {
    const users = createAutoMock<UserService>();

    expect(Reflect.get(users, 'constructor')).toBe(Object);
    expect(`${Reflect.get(Object(Reflect.get(users, 'constructor')), 'name')}`).toBe('Object');
  });

  it('still lets a seed or a delete decide constructor', () => {
    const seeded = createAutoMock<{ constructor: string }>({ constructor: 'seeded' });
    const deleted = createAutoMock<UserService>();

    Reflect.deleteProperty(deleted, 'constructor');

    expect(Reflect.get(seeded, 'constructor')).toBe('seeded');
    expect(Reflect.get(deleted, 'constructor')).toBeUndefined();
  });
});

describe('createAutoMock — Symbol.dispose', () => {
  it('resets the double at the end of a `using` block', () => {
    let escaped: ReturnType<typeof createAutoMock<UserService>> | undefined;

    {
      using users = createAutoMock<UserService>();
      users.getName.calledWith(1).mockReturnValue('Ada');

      expect(users.getName(1)).toBe('Ada');
      escaped = users;
    }

    expect(escaped.getName).toHaveBeenCalledTimes(0);
    expect(escaped.getName(1)).toBeUndefined();
  });

  it('answers the key outside the property store, so it never reaches ownKeys or a spread', () => {
    const users = createAutoMock<UserService>();
    users.getName(1);

    expect(Symbol.dispose in users).toBe(true);
    expect(users[Symbol.dispose]).toBe(users[Symbol.dispose]);
    expect(Object.keys(users)).toEqual(['getName']);
    expect(Object.getOwnPropertySymbols({ ...users })).toEqual([]);
  });

  it('lets a member written under the same name win, as every other key does', () => {
    const disposed = vi.fn();
    const users = createAutoMock<UserService>();

    users[Symbol.dispose] = disposed;
    users[Symbol.dispose]();

    expect(disposed).toHaveBeenCalledTimes(1);
  });
});

describe('createAutoMock — strict mode', () => {
  it('throws without a class name, since a type-driven double has none to print', () => {
    const users = createAutoMock<UserService>(undefined, { strict: true });

    expect(() => users.getName(1)).toThrow('[vitest-auto-spy] Nothing configured getName, and strict mode is on.\nCalled as: getName(1)');
  });

  it('names the double in the strict report when it is given a name', () => {
    const users = createAutoMock<UserService>(undefined, { strict: true, name: 'USERS' });

    expect(() => users.getName(1)).toThrow('Nothing configured USERS.getName, and strict mode is on.');
  });

  it('leaves a configured member alone and runs onUnstubbedCall for the rest', () => {
    const seen: (string | undefined)[] = [];
    const users = createAutoMock<UserService>(undefined, {
      onUnstubbedCall: ({ className, method }) => {
        seen.push(className, method);

        return 'noted';
      },
    });

    users.getName.calledWith(1).mockReturnValue('Ada');

    expect(users.getName(1)).toBe('Ada');
    expect(users.getUser(1)).toBe('noted');
    expect(seen).toEqual([undefined, 'getUser']);
  });
});
