/**
 * The spy factory hands its dispatch to the adapter *before* the pieces the dispatch needs exist —
 * the `settledResults` recorder can only be installed once the host mock is there, and the host
 * mock is built from the dispatch. Nothing in the three shipped adapters calls the implementation
 * that early, so the ordering is invisible until one does; this spec is the adapter that does.
 */
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFunctionSpy } from './function-spy';
import { type MockAdapter, type MockFn, registerMockAdapter } from './mock-adapter';
import { resetAutoSpy } from './reset-auto-spy';
import { setSpyEngine } from './spy-engine';
import type { Func, UnstubbedCall } from './types';
import { vitestMockAdapter } from './vitest-adapter';

/** An adapter that warms the implementation while the mock is being created. */
const warmingAdapter: MockAdapter = {
  ...vitestMockAdapter,
  createMockFn(implementation?: Func, name?: string): MockFn {
    const mock = vitestMockAdapter.createMockFn(implementation, name);

    implementation?.();

    return mock;
  },
};

afterEach(() => {
  registerMockAdapter(vitestMockAdapter);
});

describe('createFunctionSpy', () => {
  it('survives an adapter that calls the implementation while the mock is still being created', () => {
    registerMockAdapter(warmingAdapter);

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
    const mapOf = (handle: object): unknown => Reflect.get(handle, 'argsToValuesMap');

    expect(mapOf(load.calledWith(1))).toBe(mapOf(load.calledWith(2)));
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
