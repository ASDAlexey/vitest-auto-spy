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

describe('the options object', () => {
  it('offers the filter the argument as it arrives, unknown — not the claimed type', () => {
    // The declared parameter is `unknown` (pinned above), but `where` is a *method* signature, and
    // method parameters are bivariant even under `strictFunctionTypes` — a filter narrowed to the
    // claimed type compiles. Pinning that this compiles is the honest pin: it is how a caller
    // writes it, and a switch to property syntax would change the answer this test gives.
    captureArg<RequestInit>({ where: (value: string) => value.length > 0 });

    // What bivariance does not buy is a filter the platform could never call: `where` sees one
    // argument, so a second required parameter is not a filter for this option.
    // @ts-expect-error -- the filter is offered one argument, the value
    captureArg<RequestInit>({ where: (value: unknown, extra: string) => typeof extra === 'string' });
  });

  it('asks the filter for a verdict, not a description', () => {
    // @ts-expect-error -- `where` returns whether to accept the value
    captureArg<RequestInit>({ where: (value) => (typeof value === 'object' ? 'yes' : 'no') });
  });

  it('takes no other shape than the filter', () => {
    // @ts-expect-error -- the options are `{ where }`, not a list of accepted values
    captureArg<RequestInit>({ accepts: 'objects' });
  });
});

describe('the captor a caller must not be able to write', () => {
  it('keeps the captured reads readonly', () => {
    const captor = captureArg<(id: number) => void>();

    // The values exist to be read after the assertion ran; a writable one would let a spec
    // fabricate the capture it meant to assert on.
    // @ts-expect-error -- `value` is what the runner recorded, not a slot to fill
    captor.value = (): void => undefined;
    // @ts-expect-error -- same for the whole list
    captor.values = [];
    // @ts-expect-error -- and for the flag that says anything was seen
    captor.captured = true;
  });

  it('takes exactly one type argument', () => {
    // @ts-expect-error -- a captor claims one type; a second one has nowhere to live
    captureArg<number, string>();
  });
});
