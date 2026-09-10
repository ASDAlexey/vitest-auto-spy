/**
 * The public core API on the real Rstest runtime.
 *
 * `src/lib/rstest-adapter.spec.ts` proves the adapter *factory* against a stub, which is all
 * Vitest can do — Rstest's registry walk and matchers are not simulated there. This file is the
 * other half: the same helpers a consumer imports from `vitest-auto-spy/rstest`, running on
 * Rstest's own `rstest.fn()` / `rstest.spyOn()`.
 */
import { describe, expect, it, rstest } from '@rstest/core';

import { type Spy, clearAutoSpy, createSpyFromClass, resetAutoSpy } from '../rstest';

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

describe('createSpyFromClass on Rstest', () => {
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

  it('resolves and rejects promise-returning methods', async () => {
    const service = createSpyFromClass(UserService);

    service.load.resolveWith('ok');
    await expect(service.load(1)).resolves.toBe('ok');

    service.load.rejectWith('boom');
    await expect(service.load(2)).rejects.toThrow('boom');
  });

  it('spies accessors, which are installed by redefining the property on every runtime', () => {
    const service = createSpyFromClass(UserService, {
      gettersToSpyOn: ['label'],
      settersToSpyOn: ['label'],
    });

    service.accessorSpies.getters.label.mockReturnValue('fake-label');
    expect(service.label).toBe('fake-label');

    service.label = 'written';
    expect(service.accessorSpies.setters.label).toHaveBeenCalledWith('written');
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

  it('rstest.clearAllMocks sweeps the library spies through the sentinel', () => {
    const service = createSpyFromClass(UserService);

    service.getName(1);
    expect(service.getName).toHaveBeenCalled();

    rstest.clearAllMocks();

    expect(service.getName.mock.calls).toEqual([]);
  });

  it('rstest.resetAllMocks resets the library spies through the sentinel', () => {
    const service = createSpyFromClass(UserService);

    service.getName.mockReturnValue('mocked');
    service.getName(1);

    rstest.resetAllMocks();

    expect(service.getName.mock.calls).toEqual([]);
    expect(service.getName(2)).toBeUndefined();
  });
});
