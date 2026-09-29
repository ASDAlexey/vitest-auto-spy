/**
 * The setup file has already imported `vitest-auto-spy/zone`, which installs `'shared'`. An explicit
 * call after that has to take effect, or `test.concurrent` keeps sharing one `ProxyZoneSpec`.
 */
import { installProxyZonePatch } from '../zone';

// Undone after the file, so the next file gets the shared scope its setup import asks for.
afterAll(installProxyZonePatch({ scope: 'callback' }));

describe('an explicit scope: callback after the entry import', () => {
  let hookZone: unknown;

  beforeEach(() => {
    hookZone = Reflect.get(Reflect.get(globalThis, 'Zone'), 'current');
  });

  it('runs the test in a proxy zone of its own, not the hook’s', () => {
    expect(Reflect.get(Reflect.get(globalThis, 'Zone'), 'current')).not.toBe(hookZone);
  });
});
