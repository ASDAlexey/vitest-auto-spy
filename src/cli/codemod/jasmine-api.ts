/**
 * What a jasmine spec says, in tables rather than in code — the jasmine half of `jest-api.ts`.
 *
 * Two things about `.and` make this more than a rename list, and both are the kind of mistake that
 * still compiles. `jasmine-auto-spies` parked its own async helpers behind the same namespace
 * jasmine keeps its spy strategies in, so `spy.load.and.nextWith(v)` and `spy.load.and.returnValue(v)`
 * look identical and go to opposite places: the first loses `.and` and keeps its name, the second
 * keeps nothing and becomes `mockReturnValue`. Stripping `.and` everywhere would turn
 * `.and.returnValue(v)` into a call to a method that does not exist; renaming everywhere would turn
 * `.and.nextWith(v)` into one that does something else.
 *
 * And a strategy that has no equivalent is not renamed at all. `.and.callThrough()` on an auto-spy
 * has nothing to call through to, so it is reported and left exactly as written — the codemod's
 * standing rule, because a plausible substitute is the one outcome that would keep the suite green
 * while changing what it proves.
 */

/**
 * The `jasmine-auto-spies` helpers that upstream parked behind `.and`. These, and only these, lose
 * the namespace and keep their name: `spy.load.and.nextWith(v)` → `spy.load.nextWith(v)`.
 */
export const AND_HELPERS: readonly string[] = [
  'complete',
  'nextOneTimeWith',
  'nextWith',
  'nextWithPerCall',
  'nextWithValues',
  'rejectWith',
  'resolveWith',
  'resolveWithPerCall',
  'returnSubject',
  'throwWith',
];

/** Every native jasmine `.and` strategy this codemod knows, whether it rewrites it or reports it. */
export const NATIVE_STRATEGIES: readonly string[] = [
  'callFake',
  'callThrough',
  'resolveTo',
  'returnValue',
  'returnValues',
  'stub',
  'throwError',
];

/** `.and.<key>(…)` → `.<value>(…)`, with the arguments carried across untouched. */
export const STRATEGY_RENAMES: Readonly<Record<string, string>> = {
  callFake: 'mockImplementation',
  resolveTo: 'mockResolvedValue',
  returnValue: 'mockReturnValue',
};

/** `jasmine.<name>(…)` → `expect.<name>(…)`. The asymmetric matchers are named the same on both sides. */
export const ASYMMETRIC_MATCHERS: readonly string[] = [
  'any',
  'anything',
  'arrayContaining',
  'objectContaining',
  'stringContaining',
  'stringMatching',
];

/** `jasmine.clock().<key>(…)` → `vi.<value>(…)`. */
export const CLOCK_MEMBERS: Readonly<Record<string, string>> = {
  install: 'useFakeTimers',
  mockDate: 'setSystemTime',
  tick: 'advanceTimersByTime',
  uninstall: 'useRealTimers',
};

/**
 * `jasmine.<key>` is a type, not a value.
 *
 * `jasmine.Spy` is a bare mock — Vitest's `Mock` — while `jasmine.SpyObj<T>` is the whole double,
 * which is this package's `Spy<T>`. They differ by one word and mean different things, so they are
 * a table rather than a suffix rule.
 */
export const TYPE_TARGETS: Readonly<Record<string, string>> = { Spy: 'Mock', SpyObj: 'Spy' };

/** `expect(…).<key>(…)` → `expect(…).<value>(…)` — the matchers Vitest spells differently. */
export const MATCHER_RENAMES: Readonly<Record<string, string>> = {
  toHaveBeenCalledOnceWith: 'toHaveBeenCalledExactlyOnceWith',
  toHaveSize: 'toHaveLength',
};

/**
 * `jasmine.<key>` has no expression that replaces it. The value is what to do instead, printed in
 * the report — same contract as `NO_TWIN` on the Jest side, and for the same reason: a member that
 * maps onto a *configuration* setting rather than onto a statement cannot be rewritten in place.
 */
export const NO_TWIN: Readonly<Record<string, string>> = {
  DEFAULT_TIMEOUT_INTERVAL:
    'set `testTimeout` and `hookTimeout` in the Vitest config, or `vi.setConfig({ testTimeout: n })` — it is a setting, not a statement.',
  addSpyStrategy: 'Vitest has no pluggable spy strategies; write the behaviour as a `mockImplementation`.',
  empty: 'there is no `expect.empty()`; assert on the value itself, e.g. `toHaveLength(0)` or `toEqual({})`.',
  falsy: 'there is no `expect.falsy()`; assert with `toBeFalsy()` on the value itself.',
  getEnv: 'Vitest has no jasmine env object; configure the run in `vitest.config.ts`.',
  notEmpty: 'there is no `expect.notEmpty()`; assert on the value itself.',
  setDefaultSpyStrategy: 'Vitest has no default spy strategy; configure each double where it is built.',
  truthy: 'there is no `expect.truthy()`; assert with `toBeTruthy()` on the value itself.',
};
