/**
 * The library's own mock function — the spy every double is built from, in place of the runner's.
 *
 * `vi.fn()` assigns some twenty-five closures as own properties of every mock it creates, allocates
 * six arrays of call state up front and registers the mock in a module-level strong `Set`. Measured
 * on Node 24, that is ~1.23 µs per method, paid by every method a double materialises — and a spec
 * that touches three methods of a forty-method service used to pay it three times for the methods it
 * uses and nothing for the rest, which is the only reason the bill was ever bearable.
 *
 * This spy puts the whole `Mock` surface on **one shared prototype**, allocates its call state on
 * the first call rather than at creation, and keeps nothing in a global set. Creating one and
 * calling it once measures ~0.11 µs against the runner's ~1.23 µs, dispatch alone is ~2.6× cheaper,
 * and a materialised method that is never called owns no arrays at all.
 *
 * It is a drop-in for the runner's mock where it counts — `vi.isMockFunction`, every `expect`
 * matcher (`toHaveBeenCalledWith`, `toHaveReturned`, `toHaveResolved`, …) and the whole
 * `mockReturnValue` / `mockResolvedValue` / `mockImplementation` family read `_isMockFunction`,
 * `mock.*` and `getMockName()`, all of which this implements with the same semantics.
 */
import { DISPOSE } from './dispose-symbol';
import { FAST_SPY_BRAND, isThenable } from './spy-probe';
import type { Func } from './types';

/**
 * One entry of `mock.results`, in the runner's own discriminated shape — a union rather than a
 * loose record, because a spy has to be assignable to the runner's `MockInstance` for a matcher's
 * signature to accept it.
 */
export type FastMockResult =
  { type: 'incomplete'; value: undefined } | { type: 'return'; value: unknown } | { type: 'throw'; value: unknown };

/** One entry of `mock.settledResults` — see {@link FastMockResult}. */
export type FastMockSettledResult =
  { type: 'fulfilled'; value: unknown } | { type: 'incomplete'; value: undefined } | { type: 'rejected'; value: unknown };

/**
 * What the spy actually pushes and then fills in.
 *
 * The published entry is a union whose `type` decides its `value`, and an entry is recorded as
 * `incomplete` and completed in place after the call returns — which the union, correctly, does not
 * allow. So the recording side keeps this mutable shape and the accessors publish it as the union.
 */
interface RecordedResult {
  type: FastMockResult['type'] | FastMockSettledResult['type'];
  value: unknown;
}

/** The `mock` property of a fast spy — Vitest's `MockContext`, same fields and same `lastCall`. */
export interface FastMockState {
  calls: unknown[][];
  contexts: unknown[];
  instances: unknown[];
  invocationCallOrder: number[];
  results: FastMockResult[];
  settledResults: FastMockSettledResult[];
  readonly lastCall: unknown[] | undefined;
}

/**
 * How `vi.clearAllMocks()` reaches a spy that is in no registry.
 *
 * The runner's own mocks are cleared by walking a module-level `Set` that holds every one of them
 * for the life of the worker — which is why this library already ships a pruner for it. A fast spy
 * is in no such set, so a sweep cannot walk to it; instead a sweep bumps a counter here, and each
 * spy compares its own stamp against it before it records or reports anything. Clearing every spy
 * in the run is therefore one integer increment, it holds nothing alive, and a spy that is never
 * touched again never pays for it.
 *
 * Two counters, because the two sweeps differ: `mockReset` also puts the creation-time
 * implementation back, and a spy has to be able to tell which sweep it has already answered.
 */
let clearEpoch = 0;
let resetEpoch = 0;

/** `vi.clearAllMocks()` for every fast spy — see {@link clearEpoch}. */
export function clearAllFastSpies(): void {
  clearEpoch += 1;
}

/** `vi.resetAllMocks()` for every fast spy: clears the calls and reinstates the creation-time implementation. */
export function resetAllFastSpies(): void {
  clearEpoch += 1;
  resetEpoch += 1;
}

/** The mutable configuration behind one spy — what it returns and what it is called. */
interface FastSpyConfig {
  implementation: Func | undefined;
  onceImplementations: Func[];
  name: string;
  /** What `mockReset` puts back — the implementation the spy was created with, as `vi.fn(impl)` restores its own. */
  readonly original: Func | undefined;
  /** The sweep counters this spy has already answered — see {@link clearEpoch}. */
  clearSeen: number;
  resetSeen: number;
}

/** The internal fields a fast spy carries, kept under symbols so they never collide with a member name. */
const CONFIG = Symbol('vitest-auto-spy.fastSpy.config');
const STATE = Symbol('vitest-auto-spy.fastSpy.state');

/**
 * A callable this module created — the runner's `Mock` surface, declared here rather than imported.
 *
 * Declaring it is what keeps this module free of any runner import, which is the whole point of
 * having it: the same spy backs the Vitest, Bun and `node:test` entries. The two symbol fields are
 * internal — the symbols are module-private, so nothing outside can reach them.
 */
export interface FastSpy extends Func {
  readonly _isMockFunction: true;
  readonly mock: FastMockState;
  getMockImplementation(): Func | undefined;
  mockImplementation(implementation: Func): FastSpy;
  mockImplementationOnce(implementation: Func): FastSpy;
  withImplementation<Result>(implementation: Func, callback: () => Result): Result extends Promise<unknown> ? Promise<FastSpy> : FastSpy;
  mockReturnThis(): FastSpy;
  mockReturnValue(value: unknown): FastSpy;
  mockReturnValueOnce(value: unknown): FastSpy;
  mockThrow(value: unknown): FastSpy;
  mockThrowOnce(value: unknown): FastSpy;
  mockResolvedValue(value: unknown): FastSpy;
  mockResolvedValueOnce(value: unknown): FastSpy;
  mockRejectedValue(value: unknown): FastSpy;
  mockRejectedValueOnce(value: unknown): FastSpy;
  mockClear(): FastSpy;
  mockReset(): FastSpy;
  mockRestore(): void;
  mockName(name: string): FastSpy;
  getMockName(): string;
  /** `using spy = …` disposes it the way the runner's mock does — a full reset. */
  [DISPOSE](): void;
  [CONFIG]: FastSpyConfig;
  [STATE]: FastMockStateImpl | undefined;
}

/**
 * The call counter, shared by every fast spy so `mock.invocationCallOrder` orders one against
 * another — the scale `toHaveBeenCalledBefore` compares on.
 */
let invocationCallCounter = 1;

/**
 * A spy's call state.
 *
 * Each of the six arrays is exposed through an accessor over a raw field, so that a state object a
 * spec is holding answers with the emptied array after a sweep — which is what the runner's own
 * state does, since its `mockClear` assigns over the same object. A sweep here touches no spy at
 * all, so something has to notice it, and reading is where that has to happen. The spy's own hot
 * path writes to the raw fields, having already noticed.
 */
class FastMockStateImpl implements FastMockState {
  recordedCalls: unknown[][] = [];
  recordedContexts: unknown[] = [];
  recordedInstances: unknown[] = [];
  recordedOrder: number[] = [];
  recordedResults: RecordedResult[] = [];
  recordedSettledResults: RecordedResult[] = [];

  constructor(private readonly owner: FastSpy) {}

  get calls(): unknown[][] {
    syncEpochs(this.owner);

    return this.recordedCalls;
  }

  set calls(value: unknown[][]) {
    this.recordedCalls = value;
  }

  get contexts(): unknown[] {
    syncEpochs(this.owner);

    return this.recordedContexts;
  }

  set contexts(value: unknown[]) {
    this.recordedContexts = value;
  }

  get instances(): unknown[] {
    syncEpochs(this.owner);

    return this.recordedInstances;
  }

  set instances(value: unknown[]) {
    this.recordedInstances = value;
  }

  get invocationCallOrder(): number[] {
    syncEpochs(this.owner);

    return this.recordedOrder;
  }

  set invocationCallOrder(value: number[]) {
    this.recordedOrder = value;
  }

  get results(): FastMockResult[] {
    syncEpochs(this.owner);

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see `RecordedResult`: the entries are completed in place, so they are recorded mutably and published as the union.
    return this.recordedResults as FastMockResult[];
  }

  set results(value: FastMockResult[]) {
    this.recordedResults = value;
  }

  get settledResults(): FastMockSettledResult[] {
    syncEpochs(this.owner);

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see `results`.
    return this.recordedSettledResults as FastMockSettledResult[];
  }

  set settledResults(value: FastMockSettledResult[]) {
    this.recordedSettledResults = value;
  }

  get lastCall(): unknown[] | undefined {
    const calls = this.calls;

    return calls[calls.length - 1];
  }

  /** Drop everything recorded, keeping the object identity a spec may be holding. */
  empty(): void {
    this.recordedCalls = [];
    this.recordedContexts = [];
    this.recordedInstances = [];
    this.recordedOrder = [];
    this.recordedResults = [];
    this.recordedSettledResults = [];
  }
}

/**
 * Bring a spy up to date with the sweeps that happened since it was last touched.
 *
 * Called at the top of every call and of every read — which is what makes a sweep O(1): the work it
 * describes is done here, per spy, and only for a spy something still uses.
 */
function syncEpochs(spy: FastSpy): void {
  const config = spy[CONFIG];

  if (config.resetSeen !== resetEpoch) {
    config.resetSeen = resetEpoch;
    config.implementation = config.original;
    config.onceImplementations = [];
  }

  if (config.clearSeen !== clearEpoch) {
    config.clearSeen = clearEpoch;
    spy[STATE]?.empty();
  }
}

/**
 * The spy's configuration, brought up to date with the sweeps first.
 *
 * Every mutator goes through this rather than reading {@link CONFIG} directly: a sweep is only
 * *described* when it happens, so a `mockReturnValue` applied after one and read before the spy is
 * next called would otherwise be undone by the sweep it never answered.
 */
function configOf(spy: FastSpy): FastSpyConfig {
  syncEpochs(spy);

  return spy[CONFIG];
}

/** The spy's call state, created on demand — an untouched method owns no arrays at all. */
function stateOf(spy: FastSpy): FastMockStateImpl {
  const existing = spy[STATE];

  if (existing) {
    return existing;
  }

  const created = new FastMockStateImpl(spy);
  spy[STATE] = created;

  return created;
}

/** Vitest's error for the shorthand configurators when the mock is called with `new`. */
function throwConstructorError(shorthand: string): never {
  throw new TypeError(
    `Cannot use \`${shorthand}\` when called with \`new\`. Use \`mockImplementation\` with a \`class\` keyword instead. ` +
      'See https://vitest.dev/api/mock#class-support for more information.',
  );
}

/** `this` as the spy the shared prototype methods were called on. */
function self(value: unknown): FastSpy {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- every prototype method here is reached through a fast spy; the cast is the price of sharing one function across all of them.
  return value as FastSpy;
}

/**
 * The whole `Mock` surface, shared by every spy.
 *
 * Its own prototype is `Function.prototype`, so a fast spy keeps `call` / `apply` / `bind` and reads
 * as an ordinary function everywhere — including `typeof`, which is what `isMockFunction` checks
 * first.
 */
const FAST_SPY_PROTOTYPE: Record<PropertyKey, unknown> = Object.create(Function.prototype);

/** Attach one shared method to the prototype, non-enumerable as the runner's own mock methods are not enumerable in a spread. */
function definePrototypeMember(key: PropertyKey, value: unknown): void {
  Object.defineProperty(FAST_SPY_PROTOTYPE, key, { value, writable: true, configurable: true, enumerable: false });
}

definePrototypeMember(FAST_SPY_BRAND, true);
definePrototypeMember('_isMockFunction', true);

Object.defineProperty(FAST_SPY_PROTOTYPE, 'mock', {
  get(this: unknown): FastMockState {
    const spy = self(this);
    syncEpochs(spy);

    return stateOf(spy);
  },
  configurable: true,
  enumerable: true,
});

definePrototypeMember('getMockImplementation', function getMockImplementation(this: unknown): Func | undefined {
  const config = configOf(self(this));

  return config.onceImplementations[0] ?? config.implementation;
});

definePrototypeMember('mockImplementation', function mockImplementation(this: unknown, implementation: Func): unknown {
  configOf(self(this)).implementation = implementation;

  return this;
});

definePrototypeMember('mockImplementationOnce', function mockImplementationOnce(this: unknown, implementation: Func): unknown {
  configOf(self(this)).onceImplementations.push(implementation);

  return this;
});

definePrototypeMember(
  'withImplementation',
  function withImplementation(this: unknown, implementation: Func, callback: () => unknown): unknown {
    const spy = self(this);
    const config = configOf(spy);
    const previousImplementation = config.implementation;
    const previousOnce = config.onceImplementations;

    const restore = (): void => {
      config.implementation = previousImplementation;
      config.onceImplementations = previousOnce;
    };

    config.implementation = implementation;
    config.onceImplementations = [];

    const returned = callback();

    if (isThenable(returned)) {
      return returned.then(() => {
        restore();

        return spy;
      });
    }

    restore();

    return spy;
  },
);

definePrototypeMember('mockReturnThis', function mockReturnThis(this: unknown): unknown {
  configOf(self(this)).implementation = function returnThis(this: unknown): unknown {
    return this;
  };

  return this;
});

definePrototypeMember('mockReturnValue', function mockReturnValue(this: unknown, value: unknown): unknown {
  configOf(self(this)).implementation = function returnValue(this: unknown): unknown {
    if (new.target) {
      throwConstructorError('mockReturnValue');
    }

    return value;
  };

  return this;
});

definePrototypeMember('mockReturnValueOnce', function mockReturnValueOnce(this: unknown, value: unknown): unknown {
  configOf(self(this)).onceImplementations.push(function returnValueOnce(this: unknown): unknown {
    if (new.target) {
      throwConstructorError('mockReturnValueOnce');
    }

    return value;
  });

  return this;
});

definePrototypeMember('mockThrow', function mockThrow(this: unknown, value: unknown): unknown {
  configOf(self(this)).implementation = function throwValue(): never {
    throw value;
  };

  return this;
});

definePrototypeMember('mockThrowOnce', function mockThrowOnce(this: unknown, value: unknown): unknown {
  configOf(self(this)).onceImplementations.push(function throwValueOnce(): never {
    throw value;
  });

  return this;
});

definePrototypeMember('mockResolvedValue', function mockResolvedValue(this: unknown, value: unknown): unknown {
  configOf(self(this)).implementation = function resolvedValue(this: unknown): unknown {
    if (new.target) {
      throwConstructorError('mockResolvedValue');
    }

    return Promise.resolve(value);
  };

  return this;
});

definePrototypeMember('mockResolvedValueOnce', function mockResolvedValueOnce(this: unknown, value: unknown): unknown {
  configOf(self(this)).onceImplementations.push(function resolvedValueOnce(this: unknown): unknown {
    if (new.target) {
      throwConstructorError('mockResolvedValueOnce');
    }

    return Promise.resolve(value);
  });

  return this;
});

definePrototypeMember('mockRejectedValue', function mockRejectedValue(this: unknown, value: unknown): unknown {
  configOf(self(this)).implementation = function rejectedValue(this: unknown): unknown {
    if (new.target) {
      throwConstructorError('mockRejectedValue');
    }

    return Promise.reject(value);
  };

  return this;
});

definePrototypeMember('mockRejectedValueOnce', function mockRejectedValueOnce(this: unknown, value: unknown): unknown {
  configOf(self(this)).onceImplementations.push(function rejectedValueOnce(this: unknown): unknown {
    if (new.target) {
      throwConstructorError('mockRejectedValueOnce');
    }

    return Promise.reject(value);
  });

  return this;
});

/** Drop what the spy recorded, keeping what configured it — `mockClear`, and half of `mockReset`. */
function clearSpy(spy: FastSpy): void {
  syncEpochs(spy);
  spy[STATE]?.empty();
}

/** Clear the spy and put the creation-time implementation back — `mockReset`, and all of `mockRestore`. */
function resetSpy(spy: FastSpy): void {
  const config = configOf(spy);

  spy[STATE]?.empty();
  config.implementation = config.original;
  config.onceImplementations = [];
}

definePrototypeMember('mockClear', function mockClear(this: unknown): unknown {
  clearSpy(self(this));

  return this;
});

definePrototypeMember('mockReset', function mockReset(this: unknown): unknown {
  resetSpy(self(this));

  return this;
});

definePrototypeMember('mockRestore', function mockRestore(this: unknown): unknown {
  resetSpy(self(this));

  return undefined;
});

definePrototypeMember('mockName', function mockName(this: unknown, name: string): unknown {
  if (typeof name === 'string') {
    self(this)[CONFIG].name = name;
  }

  return this;
});

definePrototypeMember('getMockName', function getMockName(this: unknown): string {
  return self(this)[CONFIG].name || 'vi.fn()';
});

// `DISPOSE` rather than `Symbol.dispose`: the realm may not have one (Node 22 under `jsdom`), and
// the shared constant is the shim that stands in for it there — so this needs no branch.
definePrototypeMember(DISPOSE, function dispose(this: unknown): void {
  resetSpy(self(this));
});

/** Fill in a call's settled result — now for a plain value, on settlement for a thenable. */
function settleInto(settled: RecordedResult, returned: unknown): void {
  if (isThenable(returned)) {
    returned.then(
      (value: unknown): void => {
        settled.type = 'fulfilled';
        settled.value = value;
      },
      (reason: unknown): void => {
        settled.type = 'rejected';
        settled.value = reason;
      },
    );

    return;
  }

  settled.type = 'fulfilled';
  settled.value = returned;
}

/**
 * One call of a spy: record it, run whatever is configured, complete the two entries the recording
 * left open.
 *
 * A module-level function rather than the body of the spy itself, because the body is allocated per
 * spy and a wide double allocates forty of them — everything that can be shared is shared.
 */
function invoke(spy: FastSpy, thisArg: unknown, args: unknown[], newTarget: Func | undefined): unknown {
  const config = spy[CONFIG];

  if (config.clearSeen !== clearEpoch || config.resetSeen !== resetEpoch) {
    syncEpochs(spy);
  }

  const state = spy[STATE] ?? stateOf(spy);
  const result: RecordedResult = { type: 'incomplete', value: undefined };
  const settled: RecordedResult = { type: 'incomplete', value: undefined };
  const context = newTarget ? undefined : thisArg;

  // The raw fields, not the accessors: the sweep check above has already run, and the accessors
  // would repeat it six times on the hottest path in the library.
  state.recordedCalls.push(args);
  state.recordedOrder.push(invocationCallCounter++);
  state.recordedResults.push(result);
  state.recordedSettledResults.push(settled);
  state.recordedContexts.push(context);
  state.recordedInstances.push(context);

  const implementation = config.onceImplementations.shift() ?? config.implementation;
  let returned: unknown;

  try {
    // `Object` as the stand-in when nothing is configured: constructed against the spy as its
    // `new.target`, it yields a plain instance of the spy, which is what the runner's mock yields.
    returned = newTarget ? Reflect.construct(implementation ?? Object, args, newTarget) : implementation?.apply(thisArg, args);
  } catch (error) {
    result.type = 'throw';
    result.value = error;
    settled.type = 'rejected';
    settled.value = error;

    throw error;
  }

  result.type = 'return';
  result.value = returned;

  if (newTarget) {
    state.recordedContexts[state.recordedContexts.length - 1] = returned;
    state.recordedInstances[state.recordedInstances.length - 1] = returned;
  }

  settleInto(settled, returned);

  return returned;
}

/**
 * Create a fast spy wrapping `implementation`.
 *
 * @param implementation What the spy calls through to; a spy without one answers `undefined`.
 * @param name The name `getMockName()` reports, and the one every matcher message prints.
 */
export function createFastSpy(implementation?: Func, name?: string): FastSpy {
  const config: FastSpyConfig = {
    implementation,
    onceImplementations: [],
    name: name ?? '',
    original: implementation,
    clearSeen: clearEpoch,
    resetSeen: resetEpoch,
  };

  const callable = function Mock(this: unknown, ...args: unknown[]): unknown {
    return invoke(spy, this, args, new.target);
  };

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the `Mock` surface arrives from the prototype installed on the next line, which no expression type can describe; this is the one place the two views of the same object are joined.
  const spy = callable as FastSpy;

  Object.setPrototypeOf(spy, FAST_SPY_PROTOTYPE);
  spy[CONFIG] = config;
  spy[STATE] = undefined;

  return spy;
}
