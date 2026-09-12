/**
 * Type-level tests for `settleResource`.
 *
 * The target is duck-typed on `status()` alone, which is what lets one wait cover `httpResource`,
 * `resource`, `rxResource` and a hand-built double. The cases below fail the moment the parameter
 * starts demanding Angular's `ResourceRef`, and the moment `allowIdle` — the option that decides
 * whether a resource that never started fails — stops being checked.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { type ResourceStatusLike, type SettleResourceOptions, settleResource } from '../angular';

declare const products: { status(): string; value(): number[] };

describe('settleResource', () => {
  it('takes anything with a status() and answers a promise of nothing', () => {
    expectTypeOf(settleResource(products)).toEqualTypeOf<Promise<void>>();
    expectTypeOf<ResourceStatusLike>().toExtend<{ status(): string }>();
  });

  it('carries the turn budget, the label and the idle escape hatch', () => {
    expectTypeOf<SettleResourceOptions['turns']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<SettleResourceOptions['label']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<SettleResourceOptions['allowIdle']>().toEqualTypeOf<boolean | undefined>();
  });

  it('checks the options against the declared ones', () => {
    settleResource(products, { turns: 3, label: 'the product resource', allowIdle: true });
    // @ts-expect-error -- allowIdle is a boolean, not a status name
    settleResource(products, { allowIdle: 'idle' });
    // @ts-expect-error -- there is no such option
    settleResource(products, { allowError: true });
    // @ts-expect-error -- a resource is the handle, not its value
    settleResource(products.value());
  });
});
