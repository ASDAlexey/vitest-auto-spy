/**
 * The order of the hooks `setupAutoSpy()` registers is itself a guarantee: the per-test epoch has to
 * open before any hook that installs a `mock*Prop` patch, or the sweep grades the library's own
 * patches as written outside a hook. Kept in a file of its own because the grader reports each
 * patched property once per worker — in a file with other `blockNetwork` suites the first report is
 * spent before this one runs, and the ordering defect would sit behind the dedup, silent.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import '../index';
import { setupAutoSpy } from './setup-auto-spy';

describe('the epoch opens before the stub-installing hooks', () => {
  // `propsOutsideHooks: 'throw'` is the strict grade, and before the opener moved ahead of the
  // stub-installing hooks it failed on the library's own stubs: `blockNetwork`'s `beforeEach` ran
  // first, `open`, `send` and `fetch` were stamped with the previous test's epoch, and the sweep
  // reported its own patches. The first test fails on that throw and the second watches the tolerant
  // grade, so the pair holds for both reactions while the ordering holds.
  setupAutoSpy({ duplicateCopies: 'off', blockNetwork: true, propsOutsideHooks: 'throw' });

  const warnings: string[] = [];

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
  });

  it('survives a test that only lets the stubs be installed', async () => {
    await expect(fetch('https://cdn.example.test/graded.svg')).rejects.toThrow(/fetch is stubbed/);
  });

  it('said nothing about its own stubs on the way out', () => {
    expect(warnings.join('\n')).not.toMatch(/patched outside a per-test hook/);
  });
});
