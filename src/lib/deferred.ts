/** A promise whose outcome the test controls after the application starts awaiting it. */
export interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: PromiseLike<T> | T) => void;
  readonly reject: (reason?: unknown) => void;
}

/**
 * Keep an async collaborator pending until the test has checked the intermediate state.
 * Uses the Promise constructor, so it also works without `Promise.withResolvers`.
 */
export function createDeferred<T = void>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
