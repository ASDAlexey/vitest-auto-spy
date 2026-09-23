/**
 * An extra setup file that calls `setupAutoSpy()` again — to try `strict` on a slice — registers its
 * `beforeEach` after the first call's per-test network stubs. File scope on purpose: that is where
 * setup files put their hooks.
 */
import { setupAutoSpy } from './setup-auto-spy';

setupAutoSpy({ duplicateCopies: 'off', blockNetwork: true });
setupAutoSpy({ duplicateCopies: 'off', preset: 'strict', strict: true });

it("does not grade the first call's per-test stubs as written outside a hook", async () => {
  await expect(fetch('https://cdn.example.test/icon.svg')).rejects.toThrow(/fetch is stubbed/);
});

it('keeps doing so for the next test', async () => {
  await expect(fetch('https://cdn.example.test/other.svg')).rejects.toThrow(/fetch is stubbed/);
});
