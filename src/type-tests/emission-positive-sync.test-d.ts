import type { OutputEmitterRef } from '@angular/core';
import { of } from 'rxjs';
import { expectTypeOf, it } from 'vitest';

import { expectEmissionSync as angularEmissionSync } from '../angular';
import { expectEmissionSync, expectEmissionsSync } from '../auto-spy';
import type { CallbackSubscribable } from '../lib/expect-emission';

declare const output: OutputEmitterRef<boolean>;
declare const voidOutput: OutputEmitterRef<void>;
declare const callback: CallbackSubscribable<number | undefined>;

it('infers synchronous observable and Angular output values', () => {
  expectTypeOf(expectEmissionSync(of(1))).toEqualTypeOf<number>();
  expectTypeOf(expectEmissionsSync(of('a'), 1)).toEqualTypeOf<string[]>();
  expectTypeOf(expectEmissionSync(output)).toEqualTypeOf<boolean>();
  expectTypeOf(angularEmissionSync(voidOutput)).toEqualTypeOf<void>();
  expectTypeOf(expectEmissionSync(callback)).toEqualTypeOf<number | undefined>();
  expectTypeOf(expectEmissionsSync(of(1), 1, { skip: 1, until: (value) => value > 1 })).toEqualTypeOf<number[]>();
  // @ts-expect-error -- synchronous assertions cannot wait for a timeout.
  expectEmissionSync(of(1), { timeout: 1 });
  // @ts-expect-error -- expected values determine the predicate argument type.
  expectEmissionSync(of(1), { until: (value: string) => value.length > 1 });
});
