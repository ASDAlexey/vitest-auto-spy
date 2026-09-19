/**
 * `stubResponse` exists so a stubbed `fetch` is fed without `as Response`. What is pinned here is
 * that claim: the result fits wherever the runner's `fetch` mock wants a `Response`, and the init
 * object rejects the misspellings a runtime test would only see as a silent 200.
 */
import { describe, expectTypeOf, it, vi } from 'vitest';

import { type StubResponseInit, stubResponse } from '../setup';

describe('stubResponse', () => {
  it('returns the platform Response, not a lookalike', () => {
    expectTypeOf(stubResponse()).toEqualTypeOf<Response>();
    expectTypeOf(stubResponse).parameter(0).toEqualTypeOf<StubResponseInit | undefined>();
  });

  it('feeds a fetch mock without a cast', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(stubResponse({ body: { id: 1 } }));
    vi.fn<typeof fetch>().mockImplementation(async () => stubResponse({ ok: false, status: 404 }));
  });

  it('takes any body, and headers in every shape the platform accepts', () => {
    stubResponse({ body: 'text' });
    stubResponse({ body: [1, 2], headers: [['x-trace', '1']] });
    stubResponse({ headers: new Headers({ 'content-type': 'text/plain' }), statusText: 'OK', url: 'https://api.example.test' });
  });

  it('rejects a mistyped field rather than ignoring it', () => {
    // @ts-expect-error -- a status is a number
    stubResponse({ status: '404' });
    // @ts-expect-error -- ok is a boolean
    stubResponse({ ok: 'yes' });
    // @ts-expect-error -- no such field; the body goes under `body`
    stubResponse({ json: { id: 1 } });
  });
});
