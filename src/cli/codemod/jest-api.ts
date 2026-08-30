/**
 * What `jest.<member>` becomes, in three lists rather than one rename.
 *
 * The mechanical `jest.` → `vi.` that every migration gist performs is right for about thirty
 * members and wrong for a dozen more, and the wrong ones do not fail at the rename — they fail
 * later, as `TypeError: vi.requireMock is not a function`, which reads as "the runner broke". So a
 * member is either in {@link RENAMED} (a `vi` twin exists, possibly under another name), in
 * {@link NO_TWIN} (it does not, and the honest answer is a different design), or in neither — and a
 * member in neither is left alone and reported, because an unknown member is exactly the case where
 * guessing produces a silent wrong rewrite.
 */

/** `jest.<key>` → `vi.<value>`. Same name unless the value says otherwise. */
export const RENAMED: Readonly<Record<string, string>> = {
  advanceTimersByTime: 'advanceTimersByTime',
  advanceTimersByTimeAsync: 'advanceTimersByTimeAsync',
  advanceTimersToNextTimer: 'advanceTimersToNextTimer',
  advanceTimersToNextTimerAsync: 'advanceTimersToNextTimerAsync',
  clearAllMocks: 'clearAllMocks',
  clearAllTimers: 'clearAllTimers',
  doMock: 'doMock',
  dontMock: 'doUnmock',
  fn: 'fn',
  getRealSystemTime: 'getRealSystemTime',
  getTimerCount: 'getTimerCount',
  isMockFunction: 'isMockFunction',
  mock: 'mock',
  mocked: 'mocked',
  resetAllMocks: 'resetAllMocks',
  resetModules: 'resetModules',
  restoreAllMocks: 'restoreAllMocks',
  runAllTimers: 'runAllTimers',
  runAllTimersAsync: 'runAllTimersAsync',
  runOnlyPendingTimers: 'runOnlyPendingTimers',
  runOnlyPendingTimersAsync: 'runOnlyPendingTimersAsync',
  setSystemTime: 'setSystemTime',
  spyOn: 'spyOn',
  unmock: 'unmock',
  useFakeTimers: 'useFakeTimers',
  useRealTimers: 'useRealTimers',
};

/** `jest.<key>` has no `vi` twin. The value is what to do instead, printed in the report. */
export const NO_TWIN: Readonly<Record<string, string>> = {
  createMockFromModule: 'there is no module auto-mock in Vitest; build the double with `createAutoMock<T>()` and provide it.',
  disableAutomock: 'Vitest has no automock mode; the option does not exist to turn off.',
  enableAutomock: 'Vitest has no automock mode; mock the module explicitly or provide a double.',
  genMockFromModule: 'there is no module auto-mock in Vitest; build the double with `createAutoMock<T>()` and provide it.',
  now: 'read the clock through `Date.now()` under `vi.useFakeTimers()`; `vi.getMockedSystemTime()` answers a different question.',
  replaceProperty: 'use `mockValueProp(obj, key, value)` from `vitest-auto-spy` — and it restores itself.',
  requireActual: '`vi.importActual(id)` is asynchronous and only legal inside a `vi.mock` factory; rewriting it changes control flow.',
  requireMock: 'provide the double through the TestBed or the container, or pass it as an argument.',
  retryTimes: 'set the `retry` option on the test or in the Vitest config.',
  runAllTicks: 'there is no `vi` twin; await the promise the code under test returns.',
  setMock: 'provide the double through the TestBed or the container, or pass it as an argument.',
  setTimeout: 'set `testTimeout` in the Vitest config, or `vi.setConfig({ testTimeout: n })` — the argument is not a plain number here.',
};

/**
 * `jest.<key>` is a type, not a value, and moves to a bare `vitest` type import.
 *
 * `Mock` and `SpyInstance` carry the trap. Jest writes the return type first and the argument tuple
 * second; Vitest takes a single call signature. A rename that leaves the type arguments where they
 * were compiles cleanly into the reverse meaning, and nothing fails until a call site disagrees.
 */
export const TYPE_NAMES: Readonly<Record<string, string>> = {
  Mock: 'Mock',
  MockedClass: 'MockedClass',
  MockedFunction: 'MockedFunction',
  MockedObject: 'MockedObject',
  Mocked: 'Mocked',
  SpyInstance: 'MockInstance',
};

/** The type members whose first argument is a return type rather than the whole signature. */
export const RETURN_FIRST = new Set(['Mock', 'SpyInstance']);

/** Jasmine-era globals Jest kept and Vitest does not have. `xit` fails as `TS2304`, not as a skip. */
export const JASMINE_ALIASES: Readonly<Record<string, string>> = {
  fdescribe: 'describe.only',
  fit: 'it.only',
  xdescribe: 'describe.skip',
  xit: 'it.skip',
  xtest: 'test.skip',
};

/** The packages whose `jest-auto-spies`-shaped API this codemod splits across our entry points. */
export const LEGACY_PACKAGES = ['jest-auto-spies', '@bugsplat/vitest-auto-spies'];
