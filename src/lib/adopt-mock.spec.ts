import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { adoptMock } from './adopt-mock';
import { createFunctionSpy, reinstallDispatch } from './function-spy';
import { registerMockAdapter } from './mock-adapter';
import { assertMocked } from './module-mocks';
import { clearAutoSpy, resetAutoSpy } from './reset-auto-spy';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

describe('adoptMock', () => {
  it('hands back the same mock, with what it recorded before adoption', () => {
    const load = vi.fn<(id: number) => string>();

    load(1);

    const adopted = adoptMock(load);

    expect(adopted).toBe(load);
    expect(adopted).toHaveBeenCalledWith(1);
    expect(adopted.mock.calls).toEqual([[1]]);
  });

  it('answers a configured argument list, and records the call on the runner mock', () => {
    const load = vi.fn<(id: number) => string>();

    adoptMock(load).calledWith(7).mockReturnValue('seven');

    expect(load(7)).toBe('seven');
    expect(load).toHaveBeenCalledTimes(1);
    expect(vi.isMockFunction(load)).toBe(true);
  });

  it('keeps answering with the implementation the mock had until the test configures it', () => {
    const load = vi.fn((id: number) => `real ${id}`);

    adoptMock(load);

    expect(load(1)).toBe('real 1');

    load.mockClear();
    adoptMock(load).calledWith(2).mockReturnValue('two');

    expect(load(2)).toBe('two');
    // A configured chain that does not match falls to the spy's default, as on every other spy.
    expect(load(3)).toBeUndefined();
  });

  it('answers undefined for an unconfigured call when the mock had no implementation', () => {
    const load = adoptMock(vi.fn<(id: number) => string>());

    expect(load(1)).toBeUndefined();
  });

  it('gives a promise-returning mock resolveWith and rejectWith', async () => {
    const load = vi.fn<(id: number) => Promise<string>>();
    const adopted = adoptMock(load);

    adopted.calledWith(1).resolveWith('one');
    adopted.rejectWith(new Error('offline'));

    await expect(load(1)).resolves.toBe('one');
    await expect(load(2)).rejects.toThrow('offline');
  });

  it('adopts the same mock only once, and hands back a spy this library built', () => {
    const load = vi.fn<(id: number) => string>();
    const first = adoptMock(load);

    first.calledWith(1).mockReturnValue('one');

    expect(adoptMock(load)).toBe(first);
    expect(load(1)).toBe('one');

    const own = createFunctionSpy<(id: number) => string>('own');

    expect(adoptMock(own)).toBe(own);
  });

  describe('through the runner resetting it', () => {
    it('keeps the configuration through vi.resetAllMocks()', () => {
      const load = vi.fn<(id: number) => string>();

      adoptMock(load).calledWith(1).mockReturnValue('one');
      load(1);
      vi.resetAllMocks();

      expect(load).not.toHaveBeenCalled();
      expect(load(1)).toBe('one');
    });

    it('keeps the configuration through mockRestore()', () => {
      const load = vi.fn<(id: number) => string>();

      adoptMock(load).calledWith(1).mockReturnValue('one');
      load.mockRestore();

      expect(load(1)).toBe('one');
    });

    it('drops the configuration on resetAutoSpy and answers with the previous implementation again', () => {
      const load = vi.fn((id: number) => `real ${id}`);

      adoptMock(load).calledWith(1).mockReturnValue('one');
      resetAutoSpy(load);

      expect(load(1)).toBe('real 1');
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('is reached by resetAutoSpy and clearAutoSpy through the namespace that holds it', () => {
      const api = { load: vi.fn<(id: number) => string>() };

      adoptMock(api.load).calledWith(1).mockReturnValue('one');
      api.load(1);
      clearAutoSpy(api);

      expect(api.load).not.toHaveBeenCalled();
      expect(api.load(1)).toBe('one');

      resetAutoSpy(api);

      expect(api.load(1)).toBeUndefined();
    });

    it('leaves a mock whose mockReset cannot be replaced to the runner', () => {
      const load = vi.fn<(id: number) => string>();
      const reset = load.mockReset;

      Object.defineProperty(load, 'mockReset', { value: reset, writable: false, configurable: true });
      adoptMock(load).calledWith(1).mockReturnValue('one');

      expect(load.mockReset).toBe(reset);
      expect(load(1)).toBe('one');
    });

    it('adopts a mock that has no mockReset at all', () => {
      const load = vi.fn<(id: number) => string>();

      Reflect.deleteProperty(load, 'mockReset');
      adoptMock(load).calledWith(1).mockReturnValue('one');

      expect(load(1)).toBe('one');
    });
  });

  describe('naming', () => {
    const mustBeCalledWithMiss = (spy: (id: number) => string): unknown => {
      try {
        spy(2);
      } catch (error) {
        return error;
      }

      return undefined;
    };

    it('uses the name it is given', () => {
      const load = adoptMock(vi.fn<(id: number) => string>(), { name: 'loadUser' });

      load.mustBeCalledWith(1).mockReturnValue('one');

      expect(mustBeCalledWithMiss(load)).toEqual(expect.objectContaining({ message: expect.stringContaining("'loadUser'") }));
    });

    it("falls back to the runner's mock name", () => {
      const load = adoptMock(vi.fn<(id: number) => string>().mockName('fromRunner'));

      load.mustBeCalledWith(1).mockReturnValue('one');

      expect(mustBeCalledWithMiss(load)).toEqual(expect.objectContaining({ message: expect.stringContaining("'fromRunner'") }));
    });

    it('falls back to the function name, then to "mock", when the runner names nothing', () => {
      const named = vi.fn<(id: number) => string>();
      const anonymous = vi.fn<(id: number) => string>();

      named.getMockName = (): string => '';
      Object.defineProperty(named, 'name', { value: 'fetchUser' });
      Reflect.deleteProperty(anonymous, 'getMockName');
      Object.defineProperty(anonymous, 'name', { value: '' });

      adoptMock(named).mustBeCalledWith(1).mockReturnValue('one');
      adoptMock(anonymous).mustBeCalledWith(1).mockReturnValue('one');

      expect(mustBeCalledWithMiss(named)).toEqual(expect.objectContaining({ message: expect.stringContaining("'fetchUser'") }));
      expect(mustBeCalledWithMiss(anonymous)).toEqual(expect.objectContaining({ message: expect.stringContaining("'mock'") }));
    });
  });

  describe('refusals', () => {
    it('refuses a plain function, pointing at assertMocked', () => {
      expect(() => adoptMock((id: number) => id)).toThrow(
        /adoptMock\(\) was given something that is not a runner mock[\s\S]*assertMocked\(\)/,
      );
    });

    it('refuses a mock that cannot report its implementation', () => {
      // The node:test shape: `mock.fn()` carries its state on `.mock` and has no getMockImplementation.
      const nodeShaped = Object.assign((): undefined => undefined, { mock: { calls: [], resetCalls: (): void => undefined } });

      expect(() => adoptMock(nodeShaped)).toThrow(/needs a mock that can report its implementation[\s\S]*createFunctionSpy\(\)/);
    });
  });

  it('does nothing when asked to reinstall the dispatch of a function it did not build', () => {
    const load = vi.fn(() => 'real');

    reinstallDispatch(load);

    expect(load()).toBe('real');
  });
});

describe('adoptMock after vi.doMock and a dynamic import', () => {
  afterEach(() => {
    vi.doUnmock('./adopt-mock.fixture');
    vi.resetModules();
  });

  it('configures the export the code under test will call', async () => {
    vi.doMock('./adopt-mock.fixture', () => ({ loadUser: vi.fn() }));

    const api = assertMocked(await import('./adopt-mock.fixture'), { specifier: './adopt-mock.fixture', exports: ['loadUser'] });

    adoptMock(api.loadUser).calledWith(7).resolveWith({ id: 7, name: 'Ada' });

    await expect(api.loadUser(7)).resolves.toEqual({ id: 7, name: 'Ada' });
    expect(api.loadUser).toHaveBeenCalledWith(7);
  });

  it('leaves the real module alone once the mock is gone', async () => {
    const api = await vi.importActual<typeof import('./adopt-mock.fixture')>('./adopt-mock.fixture');

    await expect(api.loadUser(1)).resolves.toEqual({ id: 1, name: 'real' });
  });
});
