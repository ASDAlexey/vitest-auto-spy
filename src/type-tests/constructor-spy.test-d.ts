import { describe, expectTypeOf, it, vi } from 'vitest';

import { mockConstructor } from '../index';

class Client {
  static readonly protocol = 'https';

  constructor(
    readonly host: string,
    readonly port?: number,
  ) {}
}

declare const clientModule: Promise<{ Client: typeof Client }>;

describe('mockConstructor', () => {
  it('infers the argument tuple, instance and call history from the class', () => {
    const ClientMock = mockConstructor(Client, (...args) => {
      expectTypeOf(args).toEqualTypeOf<ConstructorParameters<typeof Client>>();

      return new Client(...args);
    });

    expectTypeOf(new ClientMock('logs.test')).toEqualTypeOf<Client>();
    expectTypeOf(ClientMock.instances).toEqualTypeOf<Client[]>();
    expectTypeOf(ClientMock.mock.calls).toEqualTypeOf<ConstructorParameters<typeof Client>[]>();

    // @ts-expect-error — the host must be a string
    new ClientMock(443);
    // @ts-expect-error — the factory must return a Client
    mockConstructor(Client, () => ({ host: 443 }));
  });

  it('returns a typed class export in a Vitest module factory without a cast', () => {
    const registerMock = vi.mock;

    registerMock(clientModule, async (importOriginal) => {
      const { Client: OriginalClient } = await importOriginal();

      return { Client: mockConstructor(OriginalClient, (...args) => new Client(...args)) };
    });
  });
});
