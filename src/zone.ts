/**
 * `vitest-auto-spy/zone` — `fakeAsync` and `waitForAsync` on Vitest.
 *
 * ```ts
 * // vitest.setup.ts
 * import 'zone.js';
 * import 'zone.js/testing';
 * import 'vitest-auto-spy/zone';
 * ```
 *
 * Importing this entry installs the patch. It is a **separate specifier on purpose**: zone.js is a
 * `devDependency` of this package and nothing else — not a dependency, not an optional peer — and no
 * other entry of the library reaches this module, even transitively. A zoneless project that
 * installs `vitest-auto-spy` must not acquire zone.js, an import of it, or a byte of this file.
 *
 * The patch itself imports nothing from zone.js either: it reads `globalThis.Zone`, which the
 * consumer has already loaded, and says so plainly when it has not.
 */
import { installProxyZonePatch } from './lib/proxy-zone';

installProxyZonePatch();

export { installProxyZonePatch, type ProxyZonePatchOptions, type ProxyZoneScope } from './lib/proxy-zone';
