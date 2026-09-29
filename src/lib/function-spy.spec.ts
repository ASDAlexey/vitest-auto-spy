/**
 * The spy factory hands its dispatch to the adapter *before* the pieces the dispatch needs exist —
 * the `settledResults` recorder can only be installed once the host mock is there, and the host
 * mock is built from the dispatch. Nothing in the three shipped adapters calls the implementation
 * that early, so the ordering is invisible until one does; this spec is the adapter that does.
 */
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FastSpy } from './fast-spy';
import { createFunctionSpy } from './function-spy';
import { setMisconfigurationReaction } from './misconfiguration';
import { type MockAdapter, type MockFn, registerMockAdapter } from './mock-adapter';
import { resetAutoSpy } from './reset-auto-spy';
import { setSpyEngine } from './spy-engine';
import type { Func, UnstubbedCall } from './types';
import { vitestMockAdapter } from './vitest-adapter';

/** An adapter that warms the implementation while the mock is being created. */
function warmingAdapter(): MockAdapter {
  return {
    ...vitestMockAdapter,
    createMockFn(implementation?: Func, name?: string): MockFn {
      const mock = vitestMockAdapter.createMockFn(implementation, name);

      implementation?.();

      return mock;
    },
  };
}

afterEach(() => {
  registerMockAdapter(vitestMockAdapter);
});

describe('createFunctionSpy', () => {
  it('survives an adapter that calls the implementation while the mock is still being created', () => {
    registerMockAdapter(warmingAdapter());

    const load = createFunctionSpy<() => string>('load');

    load.calledWith().mockReturnValue('configured');

    expect(load()).toBe('configured');
  });
});

describe('createFunctionSpy — strict mode', () => {
  /** The shape the guard is exercised against — a Promise return, so every helper bundle is there. */
  type Load = (n?: number) => Promise<string>;

  /** A strict spy whose guard records rather than throws, so a call can be inspected. */
  function strictSpy(): { calls: UnstubbedCall[]; spy: ReturnType<typeof createFunctionSpy<Load>> } {
    const calls: UnstubbedCall[] = [];

    return {
      calls,
      spy: createFunctionSpy<Load>('load', {
        className: 'Repo',
        handle: (call): unknown => {
          calls.push(call);

          return 'unstubbed';
        },
      }),
    };
  }

  it('tells a handler the receiver only when it asks for it', () => {
    const told = vi.fn();
    const plain = createFunctionSpy('load', { className: 'Repo', handle: told });
    const through = createFunctionSpy('save', { className: 'Repo', receiver: true, handle: told });
    const owner = { plain, through };

    owner.plain(1);
    owner.through(2);

    expect(told.mock.calls).toEqual([
      [{ className: 'Repo', method: 'load', args: [1] }],
      [{ className: 'Repo', method: 'save', args: [2] }, owner],
    ]);
  });

  it('fires only while the spy carries no configuration of any kind', async () => {
    const { calls, spy } = strictSpy();

    expect(spy(1)).toBe('unstubbed');
    expect(calls).toEqual([{ className: 'Repo', method: 'load', args: [1] }]);

    // Each of the four things that count as configuration, on its own spy — the guard must stand
    // down for every one of them.
    const configured = [
      (s: typeof spy): void => s.calledWith(1).resolveWith('x'),
      (s: typeof spy): void => s.mustBeCalledWith(1).resolveWith('x'),
      (s: typeof spy): void => s.resolveWith('x'),
      (s: typeof spy): void => s.rejectWith(undefined),
      (s: typeof spy): void => s.resolveWithPerCall([{ value: 'x' }]),
      (s: typeof spy): void => s.failWith(new Error('configured')),
    ];

    for (const configure of configured) {
      const each = strictSpy();
      configure(each.spy);

      // `mustBeCalledWith` answers a mismatch with its own error, which is the point: strict mode
      // is about a method nobody configured, never about a call nobody configured. `failWith`
      // answers with a throw of its own, so the call is made where both outcomes are survivable.
      try {
        await Promise.allSettled([each.spy(1)]);
      } catch {
        // The configured outcome, not a failure of this assertion.
      }

      expect(each.calls).toEqual([]);
    }
  });

  it('fires again once a reset has dropped that configuration', async () => {
    const { calls, spy } = strictSpy();
    spy.calledWith(1).resolveWith('x');

    await expect(spy(1)).resolves.toBe('x');
    expect(calls).toEqual([]);

    resetAutoSpy({ load: spy });

    expect(spy(1)).toBe('unstubbed');
    expect(calls).toHaveLength(1);
  });
});

/**
 * `failWith` — the sync outcome the container could not carry.
 *
 * Two things are being pinned here, and only one of them is "it throws". The other is precedence:
 * a spy owns **one** container for its whole life, so every helper that writes into it has to
 * supersede what the previous one left rather than layer on top of it. Without that, what a call
 * does depends on the order the spec happened to configure it in — the most expensive kind of
 * silent test bug, since both configurations read as correct on their own line.
 */
describe('createFunctionSpy — failWith', () => {
  it('throws the same error on every call', () => {
    const load = createFunctionSpy<() => string>('load');
    const boom = new Error('boom');

    load.failWith(boom);

    expect(() => load()).toThrow(boom);
    expect(() => load()).toThrow(boom);
  });

  it('throws `undefined` when nothing was handed to it, rather than refusing the call', () => {
    const load = createFunctionSpy<() => string>('load');

    load.failWith();

    expect(() => load()).toThrow();
  });

  it('throws for exactly the arguments a chain configured, leaving the rest alone', () => {
    const load = createFunctionSpy<(n: number) => string>('load');

    load.calledWith(1).failWith(new Error('one'));
    load.calledWith(2).mockReturnValue('two');

    expect(() => load(1)).toThrow('one');
    expect(load(2)).toBe('two');
  });

  it('supersedes a promise configuration made before it', () => {
    const load = createFunctionSpy<() => Promise<string>>('load');

    load.resolveWith('value');
    load.failWith(new Error('boom'));

    expect(() => load()).toThrow('boom');
  });

  it('supersedes a per-call batch made before it, instead of draining the queue first', () => {
    const load = createFunctionSpy<() => Promise<string>>('load');

    load.resolveWithPerCall([{ value: 'first' }, { value: 'second' }]);
    load.failWith(new Error('boom'));

    expect(() => load()).toThrow('boom');
  });

  it('is superseded by a promise configuration made after it', async () => {
    const load = createFunctionSpy<() => Promise<string>>('load');

    load.failWith(new Error('boom'));
    load.resolveWith('value');

    await expect(load()).resolves.toBe('value');
  });

  it('is dropped by a reset, like every other configuration', () => {
    const load = createFunctionSpy<() => string>('load');

    load.failWith(new Error('boom'));
    resetAutoSpy({ load });

    expect(load()).toBeUndefined();
  });
});

/**
 * The helpers are shared functions that find their spy through `this` — one set for the run instead
 * of a closure per helper per spy. The one thing that changes for a caller is a *detached* helper:
 * it used to work by accident, and now fails at the call, naming the helper and the two shapes that
 * do work.
 */
describe('createFunctionSpy — helpers are methods of their spy', () => {
  it('refuses a helper destructured off its spy, naming the helper and the shapes that work', () => {
    const load = createFunctionSpy<() => Promise<string>>('load');
    const { resolveWith } = load;

    expect(() => resolveWith('value')).toThrow(/resolveWith was called off its spy/);
    expect(() => resolveWith('value')).toThrow(/spy\.method\.resolveWith/);
  });

  it('refuses a receiver that is not an object at all', () => {
    const load = createFunctionSpy<() => string>('load');

    expect(() => load.failWith.call(undefined, new Error('x'))).toThrow(/failWith was called off its spy/);
    expect(() => load.failWith.call(null, new Error('x'))).toThrow(/failWith was called off its spy/);
  });

  it('refuses a receiver that carries no spy state', () => {
    const load = createFunctionSpy<(n: number) => string>('load');

    expect(() => load.calledWith.call({}, 1)).toThrow(/calledWith was called off its spy/);
  });

  it('works once bound, which is how the jasmine namespaces delegate', async () => {
    const load = createFunctionSpy<() => Promise<string>>('load');
    const resolveWith = load.resolveWith.bind(load);

    resolveWith('value');

    await expect(load()).resolves.toBe('value');
  });
});

/**
 * `mockReturnValue` and `calledWith` configure the same thing through two different doors, and the
 * library's dispatch — the door `calledWith` goes through — *is* the implementation the host family
 * replaces. Whichever is written second therefore wins outright and the other silently decides
 * nothing, which is the shape of a test that stays green on a branch nobody configured. The
 * behaviour is the host's and stays; what is pinned here is that it is said out loud, in both orders.
 */
describe('createFunctionSpy — a host implementation over a configured chain', () => {
  const warnings: string[] = [];
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warnings.length = 0;
    warn = vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('reports a mockReturnValue that erased a calledWith already configured', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    load.calledWith(1).mockReturnValue('configured');
    load.mockReturnValue('flat');

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("mockReturnValue() replaced the dispatch of 'load' after calledWith() was configured on it");
    expect(load(1)).toBe('flat');
  });

  it('names resetAutoSpy as the way to drop a chain, since mockReset() keeps it', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    load.calledWith(1).mockReturnValue('configured');
    load.mockReset();
    load.mockReturnValue('flat');

    expect(warnings[0]).toContain('resetAutoSpy(spy) first: mockReset() leaves the chain in place');
  });

  it('reports a calledWith opened after a mockReturnValue had already replaced the dispatch', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    load.mockReturnValue('flat');
    load.calledWith(1).mockReturnValue('configured');

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("calledWith() was configured on 'load' after mockReturnValue() had replaced its dispatch");
    expect(load(1)).toBe('flat');
  });

  it('does not report a calledWith configured after mockReset put the dispatch back', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    load.mockReturnValue('flat');
    load.mockReset();
    load.calledWith(1).mockReturnValue('configured');

    expect(warnings).toEqual([]);
    expect(load(1)).toBe('configured');
  });

  it('does not report a calledWith configured after a reset sweep put the dispatch back', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    load.mockReturnValue('flat');
    vi.resetAllMocks();
    warn.mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
    load.calledWith(1).mockReturnValue('configured');

    expect(warnings).toEqual([]);
    expect(load(1)).toBe('configured');
  });

  it('reports a calledWith opened after a mockReturnValue that was the first touch since a reset sweep', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    vi.resetAllMocks();
    warn.mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
    load.mockReturnValue('flat');
    load.calledWith(1).mockReturnValue('configured');

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("calledWith() was configured on 'load' after mockReturnValue() had replaced its dispatch");
  });

  it('names mustBeCalledWith, which loses its throw as well as its value', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    load.mustBeCalledWith(1).mockReturnValue('configured');
    load.mockImplementation(() => 'flat');

    expect(warnings[0]).toContain("mockImplementation() replaced the dispatch of 'load' after mustBeCalledWith() was configured on it");
    expect(load(2)).toBe('flat');
  });

  it('reports every member of the family that installs a whole implementation', async () => {
    const promised = createFunctionSpy<() => Promise<string>>('promised');

    promised.calledWith().resolveWith('configured');
    promised.mockResolvedValue('flat');

    const thrower = createFunctionSpy<() => string>('thrower');

    thrower.calledWith().mockReturnValue('configured');
    thrower.mockThrow(new Error('flat'));

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('mockResolvedValue()');
    expect(warnings[1]).toContain('mockThrow()');
    await expect(promised()).resolves.toBe('flat');
  });

  it('says nothing for a spy that has no chain, whichever order the two are written in', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    load.mockReturnValue('first');
    load.mockReturnValue('second');
    load.failWith(new Error('container'));

    expect(warnings).toEqual([]);
  });

  it('says nothing about a `Once` queue, which drains back onto the dispatch instead of taking it away', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    load.calledWith(1).mockReturnValue('configured');
    load.mockReturnValueOnce('once');

    expect(warnings).toEqual([]);
    expect(load(1)).toBe('once');
    expect(load(1)).toBe('configured');
  });

  it('says nothing when the library puts its own dispatch back', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    load.mockReturnValue('flat');
    warnings.length = 0;
    resetAutoSpy({ load });
    load.calledWith(1).mockReturnValue('configured');

    expect(warnings).toEqual([]);
    expect(load(1)).toBe('configured');
  });
});

/**
 * An implementation installed right after `getMockImplementation()` handed out the dispatch wraps it,
 * and every call the wrapper does not answer still reaches the `calledWith` chain. `vi.when` in
 * Vitest 5 is that wrapper, so reporting it as a replacement was false — and a throw under `strict`.
 */
describe('createFunctionSpy — a wrapper that delegates to the dispatch', () => {
  const warnings: string[] = [];
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warnings.length = 0;
    warn = vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
  });

  afterEach(() => {
    warn.mockRestore();
    setMisconfigurationReaction(undefined);
  });

  function wrap(load: (id: number) => string, answered: number, answer: string): void {
    const spy = load as unknown as FastSpy;
    const original = spy.getMockImplementation();

    spy.mockImplementation((id: number) => (id === answered ? answer : original?.(id)));
  }

  it('keeps the chain live when the wrapper goes in after it', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    load.calledWith(2).mockReturnValue('chain');
    wrap(load, 3, 'wrapper');

    expect(warnings).toEqual([]);
    expect([load(2), load(3)]).toEqual(['chain', 'wrapper']);
  });

  it('keeps the chain live when it is configured after the wrapper', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    wrap(load, 3, 'wrapper');
    wrap(load, 4, 'second wrapper');
    load.calledWith(2).mockReturnValue('chain');

    expect(warnings).toEqual([]);
    expect([load(2), load(3), load(4)]).toEqual(['chain', 'wrapper', 'second wrapper']);
  });

  it('still reports a wrapper around an implementation that had already replaced the dispatch', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    load.mockReturnValue('flat');
    wrap(load, 3, 'wrapper');
    load.calledWith(2).mockReturnValue('chain');

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("calledWith() was configured on 'load' after mockReturnValue() had replaced its dispatch");
  });

  it('reports an implementation installed after something else changed the one that was read', () => {
    const load = createFunctionSpy<(id: number) => string>('load');
    const mock = load as unknown as FastSpy;

    load.calledWith(1).mockReturnValue('chain');
    mock.getMockImplementation();
    mock.mockReturnValue('flat');
    warnings.length = 0;
    mock.mockImplementation(() => 'replaced');

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("mockImplementation() replaced the dispatch of 'load'");
  });

  it('reports an implementation installed a microtask after the read', async () => {
    const load = createFunctionSpy<(id: number) => string>('load');
    const mock = load as unknown as FastSpy;

    load.calledWith(1).mockReturnValue('chain');
    mock.getMockImplementation();
    await Promise.resolve();
    mock.mockImplementation(() => 'replaced');

    expect(warnings).toHaveLength(1);
  });

  it('reports an implementation installed on a different spy than the one read', () => {
    const load = createFunctionSpy<(id: number) => string>('load');
    const mock = load as unknown as FastSpy;
    const save = createFunctionSpy<(id: number) => string>('save') as unknown as FastSpy;

    load.calledWith(1).mockReturnValue('chain');
    save.getMockImplementation();
    mock.mockImplementation(() => 'replaced');

    expect(warnings).toHaveLength(1);
  });

  it.runIf('when' in vi)('does not report vi.when, in either order, and neither does the strict preset', () => {
    setMisconfigurationReaction('throw');

    const chainFirst = createFunctionSpy<(id: number) => string>('chainFirst');

    chainFirst.calledWith(2).mockReturnValue('chain');
    vi.when(chainFirst).calledWith(3).thenReturn('when');

    const whenFirst = createFunctionSpy<(id: number) => string>('whenFirst');

    vi.when(whenFirst).calledWith(3).thenReturn('when');
    whenFirst.calledWith(2).mockReturnValue('chain');

    expect(warnings).toEqual([]);
    expect([chainFirst(2), chainFirst(3), whenFirst(2), whenFirst(3)]).toEqual(['chain', 'when', 'chain', 'when']);
  });

  it.runIf('when' in vi)('hands the decision back when vi.when is disposed or the spy is reset', async () => {
    const disposed = createFunctionSpy<(id: number) => string>('disposed');
    const rows = vi.when(disposed).calledWith(3).thenReturn('when');

    disposed.calledWith(2).mockReturnValue('chain');
    await Promise.resolve();
    rows[Symbol.dispose]();

    const reset = createFunctionSpy<(id: number) => string>('reset');

    reset.calledWith(2).mockReturnValue('chain');
    vi.when(reset).calledWith(3).thenReturn('when');
    reset.mockReset();

    expect(warnings).toEqual([]);
    expect([disposed(2), disposed(3), reset(2), reset(3)]).toEqual(['chain', undefined, 'chain', undefined]);

    disposed.mockReturnValue('flat');

    expect(warnings.filter((warning) => warning.includes('replaced the dispatch'))).toHaveLength(1);
  });
});

describe('createFunctionSpy — withImplementation over a configured chain', () => {
  const warnings: string[] = [];
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warnings.length = 0;
    warn = vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
  });

  afterEach(() => {
    warn.mockRestore();
    setMisconfigurationReaction(undefined);
  });

  it('reports the chain it disables for the callback, and hands the dispatch back after', async () => {
    const load = createFunctionSpy<(id: number) => string>('load');
    const mock = load as unknown as FastSpy;

    load.calledWith(1).mockReturnValue('chain');
    mock.withImplementation(
      () => 'swapped',
      () => {
        expect(load(1)).toBe('swapped');
      },
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("withImplementation() replaced the dispatch of 'load' after calledWith() was configured on it");

    load.calledWith(2).mockReturnValue('late');
    await mock.withImplementation(
      () => 'async',
      async () => {
        await Promise.resolve();
      },
    );

    expect(warnings).toHaveLength(2);
    expect([load(1), load(2)]).toEqual(['chain', 'late']);
  });

  it('reports a chain configured inside the callback', () => {
    const load = createFunctionSpy<(id: number) => string>('load');
    const mock = load as unknown as FastSpy;

    mock.withImplementation(
      () => 'swapped',
      () => {
        load.calledWith(1).mockReturnValue('chain');
      },
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("calledWith() was configured on 'load' after withImplementation() had replaced its dispatch");
    expect(load(1)).toBe('chain');
  });

  it('puts back an earlier replacement, so a chain configured after the callback is still reported', () => {
    const load = createFunctionSpy<(id: number) => string>('load');
    const mock = load as unknown as FastSpy;

    mock.mockReturnValue('flat');
    mock.withImplementation(
      () => 'swapped',
      () => undefined,
    );
    load.calledWith(1).mockReturnValue('chain');

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('after mockReturnValue() had replaced its dispatch');
    expect(load(1)).toBe('flat');
  });

  it('leaves the spy as it was when the report throws', () => {
    setMisconfigurationReaction('throw');

    const load = createFunctionSpy<(id: number) => string>('load');
    const mock = load as unknown as FastSpy;
    const callback = vi.fn();

    load.calledWith(1).mockReturnValue('chain');

    expect(() => mock.withImplementation(() => 'swapped', callback)).toThrow('withImplementation() replaced the dispatch');
    expect(callback).not.toHaveBeenCalled();

    setMisconfigurationReaction(undefined);
    load.calledWith(2).mockReturnValue('late');

    expect(warnings).toEqual([]);
    expect(load(1)).toBe('chain');
  });
});

/**
 * Each `calledWith(…)` hands back a handle of its own.
 *
 * The chain object used to be one per spy, decorated in place with helpers closed over the latest
 * argument list — so a handle held in a variable configured whatever the *next* `calledWith` was
 * called with, and the configuration written through it was lost without a word.
 */
describe('createFunctionSpy — calledWith hands back a handle per call', () => {
  it('keeps a stored handle bound to the arguments it was taken for', () => {
    const load = createFunctionSpy<(id: number) => string>('load');
    const one = load.calledWith(1);
    const two = load.calledWith(2);

    one.mockReturnValue('one');
    two.mockReturnValue('two');

    expect(load(1)).toBe('one');
    expect(load(2)).toBe('two');
  });

  it('keeps the promise helpers of a stored handle bound too', async () => {
    const load = createFunctionSpy<(id: number) => Promise<string>>('load');
    const one = load.calledWith(1);

    load.calledWith(2).resolveWith('two');
    one.resolveWith('one');

    await expect(load(1)).resolves.toBe('one');
    await expect(load(2)).resolves.toBe('two');
  });

  it('shares one argument map between the handles of a chain', () => {
    const load = createFunctionSpy<(id: number) => string>('load');
    const older = load.calledWith(1);

    load.calledWith(1).mockReturnValue('newer');
    older.mockReturnValue('older');

    // One map: the older handle's write replaces the newer one's entry for the same arguments.
    expect(load(1)).toBe('older');
  });

  it('keeps mustBeCalledWith handles apart the same way', () => {
    const load = createFunctionSpy<(id: number) => string>('load');
    const one = load.mustBeCalledWith(1);

    load.mustBeCalledWith(2).mockReturnValue('two');
    one.mockReturnValue('one');

    expect(load(1)).toBe('one');
    expect(load(2)).toBe('two');
  });
});

/**
 * `new` on a method spy — the shape a spied SDK factory (`new sdk.Client()`) produces.
 *
 * The dispatch used to be an arrow, which has no `[[Construct]]`, so every such call failed with
 * `(...actualArgs) => {…} is not a constructor`: a message quoting this library's own source and
 * naming neither the method nor what to do about it.
 */
describe('createFunctionSpy — construction', () => {
  it('constructs an instance when nothing is configured', () => {
    const Client = createFunctionSpy<() => object>('Client');

    const instance = new (Client as unknown as new () => object)();

    expect(instance).toBeInstanceOf(Object);
    expect(Client).toHaveBeenCalledTimes(1);
  });

  it('hands back the configured object as the instance', () => {
    const Client = createFunctionSpy<() => object>('Client');
    const configured = { id: 1 };

    Client.calledWith().mockReturnValue(configured);

    expect(new (Client as unknown as new () => object)()).toBe(configured);
  });

  it('constructs the same way on the runner engine', () => {
    setSpyEngine('runner');

    try {
      const Client = createFunctionSpy<() => object>('Client');
      const configured = { id: 1 };

      Client.calledWith().mockReturnValue(configured);

      expect(new (Client as unknown as new () => object)()).toBe(configured);
    } finally {
      setSpyEngine('auto-spy');
    }
  });
});

describe('ownDirectory', () => {
  it('reads the stack on first use rather than at import, once, and resolves to this directory', async () => {
    const original = Error.prepareStackTrace;
    let probes = 0;

    Error.prepareStackTrace = (error, frames) => {
      probes += error.message === 'probe' ? 1 : 0;

      return original === undefined
        ? [String(error), ...frames.map((frame) => `    at ${String(frame)}`)].join('\n')
        : original(error, frames);
    };

    try {
      vi.resetModules();

      const { ownDirectory } = await import('./function-spy');

      expect(probes).toBe(0);

      const here = /((?:file:\/\/)?[^\s()]+):\d+:\d+\)?$/.exec(String(String(new Error().stack).split('\n')[1]))?.[1];

      expect(ownDirectory()).toBe(String(here).replace(/[^/\\]*$/, ''));
      expect(ownDirectory()).toMatch(/[/\\]src[/\\]lib[/\\]$/);
      expect(probes).toBe(1);
    } finally {
      Error.prepareStackTrace = original;
    }
  });
});
