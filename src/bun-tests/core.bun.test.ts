/**
 * The public core API on the real `bun:test` runtime.
 *
 * `src/lib/bun-adapter.spec.ts` proves the adapter *factory* against a stub, which is all Vitest can
 * do — `bun:test` does not resolve outside Bun. This file is the other half: the same helpers a
 * consumer imports from `vitest-auto-spy/bun`, running on Bun's own `mock()`.
 */
import { describe, expect, it } from 'bun:test';

import {
  type Spy,
  asInstance,
  clearAutoSpy,
  createAutoMock,
  createFunctionSpy,
  createMock,
  createSpyFromClass,
  flushEventLoop,
  mockConstructor,
  mockDeep,
  mockValueProp,
  resetAutoSpy,
  restoreMockedProps,
  stubConstructor,
} from '../bun';

class UserService {
  name = 'real';

  getName(id: number): string {
    return `user-${id}`;
  }

  async load(id: number): Promise<string> {
    return `loaded-${id}`;
  }

  get label(): string {
    return 'real-label';
  }

  set label(value: string) {
    this.name = value;
  }
}

describe('createSpyFromClass on bun:test', () => {
  it('spies every method of the class', () => {
    const service: Spy<UserService> = createSpyFromClass(UserService);

    service.getName.mockReturnValue('mocked');

    expect(service.getName(1)).toBe('mocked');
    expect(service.getName.mock.calls).toEqual([[1]]);
    expect(service.getName).toHaveBeenCalledWith(1);
  });

  it('honours calledWith for argument-specific returns', () => {
    const service = createSpyFromClass(UserService);

    service.getName.calledWith(7).mockReturnValue('seven');

    expect(service.getName(7)).toBe('seven');
    expect(service.getName(8)).toBeUndefined();
  });

  it('throws from mustBeCalledWith on the wrong arguments', () => {
    const service = createSpyFromClass(UserService);

    service.getName.mustBeCalledWith(1).mockReturnValue('one');

    expect(service.getName(1)).toBe('one');
    expect((): string => service.getName(2)).toThrow();
  });

  it('resolves and rejects promise-returning methods', async () => {
    const service = createSpyFromClass(UserService);

    service.load.resolveWith('ok');
    await expect(service.load(1)).resolves.toBe('ok');

    service.load.rejectWith('boom');
    await expect(service.load(2)).rejects.toThrow('boom');
  });

  it('spies accessors through the redefine adapter', () => {
    const service = createSpyFromClass(UserService, {
      gettersToSpyOn: ['label'],
      settersToSpyOn: ['label'],
    });

    service.accessorSpies.getters.label.mockReturnValue('fake-label');
    expect(service.label).toBe('fake-label');

    service.label = 'written';
    expect(service.accessorSpies.setters.label).toHaveBeenCalledWith('written');
  });

  it('polyfills mock.settledResults, which bun:test does not track natively', async () => {
    const service = createSpyFromClass(UserService);

    service.load.resolveWith('done');
    await service.load(1);

    expect(service.load.mock.settledResults).toEqual([{ type: 'fulfilled', value: 'done' }]);
  });

  it('resets and clears every spy of an instance', () => {
    const service = createSpyFromClass(UserService);

    service.getName.mockReturnValue('mocked');
    service.getName(1);

    clearAutoSpy(service);
    expect(service.getName.mock.calls).toEqual([]);
    expect(service.getName(2)).toBe('mocked');

    resetAutoSpy(service);
    expect(service.getName(3)).toBeUndefined();
  });

  it('bridges Spy<T> back to T', () => {
    const service = createSpyFromClass(UserService);

    expect(asInstance(service)).toBe(service);
  });
});

describe('type-driven doubles on bun:test', () => {
  interface Repository {
    find(id: number): string;
    nested: { deep: { compute(): number } };
  }

  it('createAutoMock spies a method that only exists in the type', () => {
    const repository = createAutoMock<Repository>();

    repository.find.mockReturnValue('found');

    expect(repository.find(1)).toBe('found');
  });

  it('mockDeep reaches through nested objects', () => {
    const repository = mockDeep<Repository>();

    repository.nested.deep.compute.mockReturnValue(42);

    expect(repository.nested.deep.compute()).toBe(42);
  });

  it('createMock returns a plain, spy-free object', () => {
    const dto = createMock<{ id: number; title: string }>({ id: 7 });

    expect(dto.id).toBe(7);
    expect(dto.title).toBeUndefined();
  });

  it('createFunctionSpy carries the control helpers', async () => {
    const load = createFunctionSpy<(id: number) => Promise<string>>('load');

    load.resolveWith('value');

    await expect(load(1)).resolves.toBe('value');
  });
});

describe('property mocking on bun:test', () => {
  it('replaces and restores a value property', () => {
    const target = { version: 1 };

    mockValueProp(target, 'version', 2);
    expect(target.version).toBe(2);

    restoreMockedProps();
    expect(target.version).toBe(1);
  });
});

describe('constructor doubles on bun:test', () => {
  it('serves `new` and records the construction', () => {
    const Client = mockConstructor<{ url: string }, [string]>((url) => ({ url }));

    const instance = new Client('https://bun.test');

    expect(instance.url).toBe('https://bun.test');
    expect(Client.instances).toEqual([{ url: 'https://bun.test' }]);
    expect(Client).toHaveBeenCalledWith('https://bun.test');
  });

  it('refuses a call without `new`', () => {
    const Client = mockConstructor<{ url: string }>(() => ({ url: '' }), 'Client');

    expect(() => Client()).toThrow(/called without `new`/);
  });

  it('replaces a constructor on an object and is undone by restoreMockedProps', () => {
    const sdk: { Widget?: unknown } = {};
    const Widget = stubConstructor<{ render: () => void }>(sdk, 'Widget', () => ({ render: (): void => undefined }));

    expect(sdk.Widget).toBe(Widget);

    restoreMockedProps();

    expect(sdk.Widget).toBeUndefined();
  });
});

describe('flushEventLoop on bun:test', () => {
  it('lets a task-queue hand-off complete', async () => {
    let settled = false;

    void new Promise<void>((resolve) => {
      const channel = new MessageChannel();

      channel.port1.onmessage = (): void => {
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage(undefined);
    }).then(() => {
      settled = true;
    });

    await flushEventLoop(2);

    expect(settled).toBe(true);
  });
});
