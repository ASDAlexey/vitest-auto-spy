import { describe, expectTypeOf, it } from 'vitest';

import { type FunctionSpy, spyOnGlobal } from '../auto-spy';

describe('spyOnGlobal', () => {
  it('infers the spy helpers and signature from the selected global', () => {
    const fetchSpy = spyOnGlobal('fetch');

    expectTypeOf(fetchSpy).toEqualTypeOf<FunctionSpy<typeof fetch>>();
    expectTypeOf(fetchSpy('/status')).toEqualTypeOf<Promise<Response>>();
    expectTypeOf(fetchSpy.resolveWith).toBeCallableWith(new Response());
  });

  it('accepts known callable globals only', () => {
    // @ts-expect-error -- a non-callable global cannot be spied on
    spyOnGlobal('Math');
    // @ts-expect-error -- an undeclared global has no signature to infer
    spyOnGlobal('missingGlobalFunction');
  });
});
