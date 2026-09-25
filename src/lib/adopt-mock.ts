/**
 * `adoptMock`: the library's helpers on a runner mock something else built, most often a `vi.mock`
 * factory. Taken over in place, because the code under test already holds that mock.
 */
import type { MockInstance } from 'vitest';

import { defineHelper } from './define-helper';
import * as DOCS_LINKS from './docs-links';
import { type UnstubbedGuard, adoptFunctionSpy, reinstallDispatch } from './function-spy';
import { withDocs } from './message-link';
import { isRunnerMock } from './module-mocks';
import { isMarkedMock } from './spy-mark';
import type { AddSpyMethodsByReturnTypes, Func } from './types';

/** Options for {@link adoptMock}. */
export interface AdoptMockOptions {
  /** The name this spy's messages use — a `mustBeCalledWith` miss names it. Default: the mock's own name. */
  name?: string;
}

/** What {@link adoptMock} hands back: the same mock, typed as a function spy of the signature it mocks. */
export type AdoptedMock<F extends Func> = AddSpyMethodsByReturnTypes<
  F extends MockInstance<infer Signature> ? Signature : F extends { mock: unknown } ? (...args: Parameters<F>) => ReturnType<F> : F
>;

function isFunction(value: unknown): value is Func {
  return typeof value === 'function';
}

function callOwn(mock: Func, member: string): unknown {
  const method: unknown = Reflect.get(mock, member);

  return isFunction(method) ? Reflect.apply(method, mock, []) : undefined;
}

function nameOf(mock: Func): string {
  const given = callOwn(mock, 'getMockName');

  if (typeof given === 'string' && given !== '') {
    return given;
  }

  return mock.name === '' ? 'mock' : mock.name;
}

// An unconfigured call keeps getting what it got before adoption — the same rule as
// `createSpyFromInstance(…, { passthrough: true })`, where the real method answers until configured.
function answerWithPrevious(previous: Func | undefined): UnstubbedGuard | undefined {
  return previous && { className: undefined, handle: (call): unknown => Reflect.apply(previous, undefined, call.args) };
}

// `vi.resetAllMocks()` and `mockRestore()` go through the mock's own `mockReset`, which drops the dispatch.
// Bun's `mockReset` is read-only, so there the runner wins — as it does for the library's own Bun spies.
function keepDispatchThroughReset(mock: Func): void {
  const reset: unknown = Reflect.get(mock, 'mockReset');

  if (!isFunction(reset)) {
    return;
  }

  Reflect.set(mock, 'mockReset', function mockReset(this: unknown, ...args: unknown[]): unknown {
    const result: unknown = Reflect.apply(reset, this, args);

    reinstallDispatch(mock);

    return result;
  });
}

function notAMockError(value: unknown): Error {
  const text =
    typeof value === 'function'
      ? `was given a plain function (${value.name || 'anonymous'}), not a runner mock, so the vi.mock() that should have ` +
        `replaced it did not apply. Check it with assertMocked(namespace, { exports: ['${value.name || 'name'}'] }).`
      : `was given ${value === null ? 'null' : typeof value}, not a runner mock. Pass the vi.fn() the module mock built — ` +
        'for a spy of your own, call createFunctionSpy() instead.';

  return new Error(withDocs(`[vitest-auto-spy] adoptMock() ${text}`, DOCS_LINKS.adoptMock));
}

function unreadableMockError(): Error {
  return new Error(
    withDocs(
      "[vitest-auto-spy] adoptMock() needs a mock that can report its implementation (getMockImplementation), and this one cannot — node:test's mock.fn() is the case. " +
        'Without it an unconfigured call would lose its answer, and mock.restoreAll() would put the old implementation back over the configuration without a word. ' +
        'Build the double with createFunctionSpy() and hand that to the module mock instead.',
      DOCS_LINKS.adoptMock,
    ),
  );
}

function exposeAsAdopted<F extends Func>(spy: Func): AdoptedMock<F> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- the mock is the spy: helpers were attached to it at runtime, and its concrete signature is known only to the caller.
  return spy as any;
}

/**
 * Give a runner mock the library's helpers without replacing it, keeping what it already recorded.
 *
 * ```ts
 * import { loadUser } from './api';
 *
 * vi.mock('./api', () => ({ loadUser: vi.fn() }));
 *
 * it('shows the user', async () => {
 *   adoptMock(loadUser).calledWith(7).resolveWith({ id: 7, name: 'Ada' });
 *   // …
 * });
 * ```
 *
 * A call nobody configured answers what the mock answered before adoption. Adopting a spy this
 * library built, or the same mock twice, hands it back unchanged.
 *
 * @param mock A `vi.fn()` (or `bun:test` `mock()`, `rstest.fn()`) — typed as the module's function or as the mock.
 * @param options See {@link AdoptMockOptions}.
 * @returns The same mock, typed as a function spy.
 */
export const adoptMock = defineHelper(<F extends Func>(mock: F, options: AdoptMockOptions = {}): AdoptedMock<F> => {
  if (isMarkedMock(mock)) {
    return exposeAsAdopted<F>(mock);
  }

  if (!isRunnerMock(mock)) {
    throw notAMockError(mock);
  }

  if (!isFunction(Reflect.get(mock, 'getMockImplementation'))) {
    throw unreadableMockError();
  }

  const previous = callOwn(mock, 'getMockImplementation');
  const spy = adoptFunctionSpy<F>(mock, options.name ?? nameOf(mock), answerWithPrevious(isFunction(previous) ? previous : undefined));

  keepDispatchThroughReset(mock);

  return exposeAsAdopted<F>(spy);
});
