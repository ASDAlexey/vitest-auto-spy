/**
 * The emission family is not in either entry's Angular lists: it reaches `bun-angular` through the
 * core half (`export * from './bun'`), because nothing in it touches a runner. These cases pin that
 * chain — prune the core list or drop the star export, and the family silently vanishes from Angular
 * suites on Bun with nothing failing anywhere — and prove the waits settle on `bun test`.
 */
import { describe, expect, it } from 'bun:test';
import { Subject } from 'rxjs';

import { expectEmission, expectNoEmission } from '../bun-angular';

describe('the emission family on bun:test', () => {
  it('expectEmission is subscribed at the call, so a later emission still resolves it', async () => {
    const saved$ = new Subject<number>();
    const first = expectEmission(saved$, { timeout: 500 });

    saved$.next(21);

    await expect(first).resolves.toBe(21);
  });

  it('expectEmission rejects naming the stream when nothing arrives in time', async () => {
    await expect(expectEmission(new Subject<number>(), { timeout: 20, label: 'products$' })).rejects.toThrow(
      /products\$ did not emit within 20 ms \(0 emission\(s\) received\)/,
    );
  });

  it('expectNoEmission passes a quiet window and rejects when one value arrives', async () => {
    await expect(expectNoEmission(new Subject<number>(), { timeout: 5 })).resolves.toBe(undefined);

    const chatty$ = new Subject<number>();
    const silence = expectNoEmission(chatty$, { timeout: 5_000, label: 'chatty$' });

    chatty$.next(1);

    await expect(silence).rejects.toThrow(/chatty\$ emitted 1 but was expected to stay silent/);
  });
});
