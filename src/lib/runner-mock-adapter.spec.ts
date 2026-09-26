import { describe, expect, it, vi } from 'vitest';

import { type RunnerMock, createRunnerMockAdapter } from './runner-mock-adapter';
import type { Func } from './types';

function makeRunner(): { fn: (implementation?: Func) => RunnerMock; created: RunnerMock[] } {
  const created: RunnerMock[] = [];

  const fn = (implementation?: Func): RunnerMock => {
    const mock = implementation ? vi.fn(implementation) : vi.fn<Func>();

    created.push(mock);

    return mock;
  };

  return { fn, created };
}

describe('createRunnerMockAdapter', () => {
  it('builds no runner mock until the first spy, so importing a runner entry has no side effect', () => {
    const { fn, created } = makeRunner();
    const prepareSentinel = vi.fn();
    const adapter = createRunnerMockAdapter({ fn, prepareSentinel });

    expect(created).toHaveLength(0);
    expect(prepareSentinel).not.toHaveBeenCalled();

    adapter.createMockFn();
    adapter.createMockFn();

    expect(created).toHaveLength(1);
    expect(prepareSentinel).toHaveBeenCalledExactlyOnceWith(created[0]);
  });

  it('builds the sentinel with the adapter when asked to', () => {
    const { fn, created } = makeRunner();

    createRunnerMockAdapter({ fn, eagerSentinel: true });

    expect(created).toHaveLength(1);
  });

  it('a sentinel whose runner rejects a reassigned mockClear surfaces only when a spy is built', () => {
    const frozenFn = (): RunnerMock => Object.freeze(vi.fn<Func>());
    const adapter = createRunnerMockAdapter({ fn: frozenFn });

    expect(() => adapter.createMockFn()).toThrow(TypeError);
  });

  it('routes a run-wide clear and reset through the sentinel to the fast spies', () => {
    const { fn, created } = makeRunner();
    const adapter = createRunnerMockAdapter({ fn });
    const spy = adapter.createMockFn(() => 'original');
    const [sentinel] = created;

    vi.mocked(spy).mockReturnValue('configured');
    spy();

    expect(sentinel?.mockClear()).toBe(sentinel);
    expect(adapter.getCalls(spy)).toEqual([]);
    expect(spy()).toBe('configured');

    expect(sentinel?.mockReset()).toBe(sentinel);
    expect(spy()).toBe('original');
  });
});
