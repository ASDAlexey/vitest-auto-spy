/**
 * `toBeLoading` / `toHaveResourceValue` / `toHaveResourceError` — assert a resource, not its parts.
 *
 * This is the {@link registerSignalMatchers} argument one level up. A resource carries a value *and*
 * a status, and the two are only meaningful together: `expect(component.products.value()).toEqual([])`
 * passes just as happily against a resource that is still `loading` with its default value as
 * against one that genuinely resolved to nothing. The repair people reach for is a second
 * expectation on `status()`, which is the one everybody forgets — and when the first assertion does
 * fail, the message is about an array, naming neither the resource nor the state it was in.
 *
 * These three read both halves and say both in the failure. Duck-typed on `{ status, value, error }`
 * exactly as {@link settleResource} is on `status`, so they work against `httpResource`, `resource`,
 * `rxResource` and a {@link mockResourceProp} double alike, and `@angular/core` stays an optional
 * peer.
 */
import { expect } from 'vitest';

/** The slice of a resource these matchers read. `error` is absent on some hand-built doubles. */
export interface ResourceLike<TValue = unknown> {
  status(): string;
  value(): TValue;
  error?(): Error | undefined;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- declaration merging requires the type parameter list (defaults included) to match Vitest's own `interface Matchers<T = any>` exactly.
  interface Matchers<T = any> {
    /** The resource is still in flight — `status()` is `'loading'` or `'reloading'`. */
    toBeLoading(): T;
    /** The resource has resolved *and* its value deep-equals the expected one. */
    toHaveResourceValue(expected: unknown): T;
    /** The resource has failed; with an argument, its error message matches too. */
    toHaveResourceError(expected?: RegExp | string): T;
  }
}

/** What a matcher hands back to the runner. */
interface MatcherResult {
  pass: boolean;
  message: () => string;
  actual?: unknown;
  expected?: unknown;
}

/** The two statuses that mean work is in flight — the same pair {@link settleResource} waits on. */
const LOADING_STATUSES: ReadonlySet<string> = new Set(['loading', 'reloading']);

/** The statuses in which `value()` holds something worth comparing. */
const VALUE_STATUSES: ReadonlySet<string> = new Set(['local', 'resolved']);

/** Whether `received` exposes enough of a resource to be worth reading. */
function isResourceLike(received: unknown): received is ResourceLike {
  if (typeof received !== 'object' || received === null) {
    return false;
  }

  return 'status' in received && typeof received.status === 'function' && 'value' in received && typeof received.value === 'function';
}

/**
 * The failure every matcher here shares: it was handed something that is not a resource.
 *
 * Worth its own message rather than a `TypeError` out of the call, because the two ways to get here
 * are both common and both silent — passing the *value* (`products.value()`) instead of the
 * resource, and passing a service property that was never a resource in the first place.
 */
function notAResource(received: unknown, printReceived: (value: unknown) => string): MatcherResult {
  return {
    pass: false,
    message: (): string => `expected a resource (an object with \`status()\` and \`value()\`), received ${printReceived(received)}`,
  };
}

/** Renders the error side of a resource for a failure message. */
function describeError(resource: ResourceLike): string {
  const error = resource.error?.();

  return error === undefined ? 'no error' : `\`${error.message}\``;
}

/**
 * The slice of the runner's matcher context these three read.
 *
 * Declared locally rather than imported from `@vitest/expect` for the same reason the ESLint rules
 * declare their own ESTree slice: it keeps a published `.d.ts` from putting another package in
 * every consumer's way, and these are the only two members any matcher here touches.
 */
interface MatcherContext {
  utils: {
    printExpected(value: unknown): string;
    printReceived(value: unknown): string;
  };
  equals(actual: unknown, expected: unknown): boolean;
}

/** The resource is still in flight — `status()` is `'loading'` or `'reloading'`. */
function toBeLoading(this: MatcherContext, received: unknown): MatcherResult {
  if (!isResourceLike(received)) {
    return notAResource(received, this.utils.printReceived);
  }

  const status = received.status();
  const pass = LOADING_STATUSES.has(status);

  return {
    pass,
    message: (): string => `expected the resource ${pass ? 'not ' : ''}to be loading, status was ${this.utils.printReceived(status)}`,
  };
}

/** The resource has resolved *and* its value deep-equals the expected one. */
function toHaveResourceValue(this: MatcherContext, received: unknown, expected: unknown): MatcherResult {
  if (!isResourceLike(received)) {
    return notAResource(received, this.utils.printReceived);
  }

  const status = received.status();

  // Checked before the value, and the reason this matcher exists: a resource that has not resolved
  // is still holding its *default*, and comparing that against the expected value is how a test
  // passes while proving nothing.
  if (!VALUE_STATUSES.has(status)) {
    return {
      pass: false,
      message: (): string =>
        `expected the resource to have resolved before comparing its value, but status was ${this.utils.printReceived(status)}` +
        ` (${describeError(received)}). Flush the request and \`await settleResource(...)\` first.`,
    };
  }

  const actual: unknown = received.value();
  const pass = this.equals(actual, expected);

  return {
    pass,
    actual,
    expected,
    message: (): string =>
      `expected the resource ${pass ? 'not ' : ''}to have value ${this.utils.printExpected(expected)}, got ${this.utils.printReceived(actual)}`,
  };
}

/** The resource has failed; with an argument, its error message matches too. */
function toHaveResourceError(this: MatcherContext, received: unknown, expected?: RegExp | string): MatcherResult {
  if (!isResourceLike(received)) {
    return notAResource(received, this.utils.printReceived);
  }

  const status = received.status();

  if (status !== 'error') {
    return {
      pass: false,
      message: (): string => `expected the resource to have failed, status was ${this.utils.printReceived(status)}`,
    };
  }

  if (expected === undefined) {
    return {
      pass: true,
      message: (): string => `expected the resource not to have failed, but it failed with ${describeError(received)}`,
    };
  }

  const message = received.error?.()?.message ?? '';
  const pass = typeof expected === 'string' ? message.includes(expected) : expected.test(message);

  return {
    pass,
    actual: message,
    expected,
    message: (): string =>
      `expected the resource error ${pass ? 'not ' : ''}to match ${this.utils.printExpected(expected)}, got ${this.utils.printReceived(message)}`,
  };
}

/**
 * Register the resource matchers with the runner. Call once, from your setup file.
 *
 * @example
 * ```ts
 * registerResourceMatchers(); // once, in the setup file
 *
 * expect(component.products).toBeLoading();
 *
 * httpTesting.expectOne('/api/products').flush([product]);
 * await settleResource(component.products);
 *
 * expect(component.products).toHaveResourceValue([product]);
 * ```
 *
 * `toHaveResourceValue` deliberately fails a resource that is still loading even when its default
 * value happens to match, because that is the assertion this whole family exists to stop passing.
 */
export function registerResourceMatchers(): void {
  expect.extend({ toBeLoading, toHaveResourceError, toHaveResourceValue });
}
