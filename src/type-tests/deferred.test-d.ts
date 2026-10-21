import { expectTypeOf, test } from 'vitest';

import { type Deferred, createDeferred } from '../index';

test('preserves the promise value and resolver input types', () => {
  const deferred = createDeferred<boolean>();
  expectTypeOf(deferred).toEqualTypeOf<Deferred<boolean>>();
  expectTypeOf(deferred.promise).toEqualTypeOf<Promise<boolean>>();
  expectTypeOf(deferred.resolve).parameter(0).toEqualTypeOf<PromiseLike<boolean> | boolean>();
  expectTypeOf(deferred.reject).parameter(0).toEqualTypeOf<unknown>();
  const done = createDeferred();
  expectTypeOf(done.promise).toEqualTypeOf<Promise<void>>();
  done.resolve();
  // @ts-expect-error — the resolver preserves the requested value type
  deferred.resolve('true');
  // @ts-expect-error — a nonvoid promise needs its value
  deferred.resolve();
});
