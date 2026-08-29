/**
 * Type-level tests for the emission helpers.
 *
 * These exist because `npm run typecheck` cannot catch what they catch. `tsc --noEmit` over the
 * sources proves the library *compiles*; it says nothing about what a caller *infers*. The
 * distinction is not theoretical: `expectEmission` shipped for several versions with a single
 * signature that TypeScript paired with rxjs 7's trailing positional `subscribe` overload, so every
 * call inferred `Promise<unknown>`. Every runtime test still passed — `resolves.toBe(1)` passes on a
 * `Promise<unknown>` too — and the loss surfaced only in a consumer, as 48 `TS2339`/`TS2488` errors
 * that failed their CI. A single `expectTypeOf` line here would have failed the release instead.
 *
 * The rule these follow: assert the type a *call site* sees, never the type of an internal symbol.
 */
import { Subject, of, throwError, timer } from 'rxjs';
import { map } from 'rxjs/operators';
import { describe, expectTypeOf, it } from 'vitest';

import { expectCompletion, expectEmission, expectEmissions, expectError, expectNoEmission } from '../auto-spy';

describe('expectEmission', () => {
  it('carries the emitted type through, rather than widening it to unknown', () => {
    expectTypeOf(expectEmission(of(1))).toEqualTypeOf<Promise<number>>();
    expectTypeOf(expectEmission(of('a'))).toEqualTypeOf<Promise<string>>();
  });

  it('keeps the type through an operator chain, where the regression actually bit', () => {
    const source$ = of({ product: { id: 1 } }).pipe(map((value) => value.product));

    expectTypeOf(expectEmission(source$)).resolves.toEqualTypeOf<{ id: number }>();
    // The shape the consumer wrote: read a field off the awaited value. Under `Promise<unknown>`
    // this is TS2339 at the call site, and nothing here would have failed.
    expectTypeOf(expectEmission(source$)).resolves.toHaveProperty('id');
  });

  it('infers from a Subject as well as from a cold source', () => {
    expectTypeOf(expectEmission(new Subject<boolean>())).toEqualTypeOf<Promise<boolean>>();
  });

  it('accepts the options object without losing the inference', () => {
    expectTypeOf(expectEmission(of(1), { timeout: 10 })).toEqualTypeOf<Promise<number>>();
  });
});

describe('expectEmissions', () => {
  it('resolves an array of the emitted type', () => {
    expectTypeOf(expectEmissions(of(1, 2), 2)).toEqualTypeOf<Promise<number[]>>();
  });

  it('survives destructuring, the other half of the regression', () => {
    // Destructuring an `unknown` is TS2488; this is the assertion that would have caught it.
    expectTypeOf(expectEmissions(of('a', 'b'), 2)).resolves.items.toEqualTypeOf<string>();
  });
});

describe('the helpers whose result is deliberately not the emitted value', () => {
  it('expectNoEmission and expectCompletion resolve void', () => {
    expectTypeOf(expectNoEmission(of(1))).toEqualTypeOf<Promise<void>>();
    expectTypeOf(expectCompletion(timer(0))).toEqualTypeOf<Promise<void>>();
  });

  it('expectError resolves the thrown value, which is unknown by design', () => {
    expectTypeOf(expectError(throwError(() => new Error('x')))).toEqualTypeOf<Promise<unknown>>();
  });
});
