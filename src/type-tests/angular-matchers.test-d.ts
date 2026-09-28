/**
 * Type-level tests for the matcher registrars of `vitest-auto-spy/angular/matchers`.
 *
 * The registrars are called once in a setup file, and the failure these guard against is an
 * argument sneaking in: a registrar that took options would accept an empty call just the same,
 * and nothing at runtime would notice the options being dropped on the floor. The signal registrar
 * is the one with a real options bag, so its test is the shape of that bag and nothing else.
 */
import { describe, expectTypeOf, it } from 'vitest';

import {
  type RegisterSignalMatchersOptions,
  registerDirectiveMatchers,
  registerResourceMatchers,
  registerSignalMatchers,
} from '../angular-matchers';

describe('matcher registrars', () => {
  it('take nothing and answer nothing', () => {
    expectTypeOf(registerDirectiveMatchers).returns.toBeVoid();
    expectTypeOf(registerResourceMatchers).returns.toBeVoid();
    expectTypeOf(registerSignalMatchers).returns.toBeVoid();
    expectTypeOf(registerDirectiveMatchers).parameters.toEqualTypeOf<[]>();
    expectTypeOf(registerResourceMatchers).parameters.toEqualTypeOf<[]>();
    expectTypeOf(registerSignalMatchers).toEqualTypeOf<(options?: RegisterSignalMatchersOptions) => void>();
  });

  it('register from the matchers entry and no other', () => {
    registerDirectiveMatchers();
    registerResourceMatchers();
    registerSignalMatchers();
    registerSignalMatchers({ strict: true });

    // @ts-expect-error -- no other option exists in the bag
    registerSignalMatchers({ quiet: true });
  });
});
