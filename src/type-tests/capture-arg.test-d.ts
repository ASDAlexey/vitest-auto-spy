/**
 * Type-level tests for `captureArg`, and for the filter that makes its `values` a list of matches
 * rather than of candidates.
 *
 * A captor's whole point is that the value comes back **typed** — the reach into `mock.calls` it
 * replaces ends in a cast — so what a call site infers is the feature, and it is what these pin.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { type ArgCaptor, captureArg } from '../auto-spy';

describe('captureArg', () => {
  it('hands back a captor of the claimed type', () => {
    const captor = captureArg<(id: number) => void>();

    expectTypeOf(captor).toEqualTypeOf<ArgCaptor<(id: number) => void>>();
    expectTypeOf(captor.value).toEqualTypeOf<(id: number) => void>();
    expectTypeOf(captor.values).toEqualTypeOf<readonly ((id: number) => void)[]>();
    expectTypeOf(captor.captured).toEqualTypeOf<boolean>();
    expectTypeOf(captor.reset()).toBeVoid();
  });

  it('defaults to unknown, so reading the value asks for a narrowing', () => {
    expectTypeOf(captureArg()).toEqualTypeOf<ArgCaptor<unknown>>();
  });

  it('takes a `where` filter over the raw argument, and keeps the captured type', () => {
    const captor = captureArg<RequestInit>({ where: (value) => typeof value === 'object' });

    expectTypeOf(captor).toEqualTypeOf<ArgCaptor<RequestInit>>();
    // The filter sees the argument as it arrives — unknown — because that is what the runner offers.
    expectTypeOf(captureArg<RequestInit>)
      .parameter(0)
      .toEqualTypeOf<{ where(value: unknown): boolean } | undefined>();
  });
});
