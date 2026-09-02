/**
 * `vitest-auto-spy/observer-spy` — the `@hirez_io/observer-spy` surface, for a suite that arrives
 * carrying it.
 *
 * Its own entry rather than part of `vitest-auto-spy/rxjs`, for the same reason the jasmine
 * compatibility layer has one: `/rxjs` is what every consumer of observable spies imports, and
 * folding a migration shim into it taxed all of them ~5.5 kB for a helper most will never call.
 *
 * ```ts
 * import { subscribeSpyTo } from 'vitest-auto-spy/observer-spy';
 * ```
 *
 * Runtime-agnostic — it registers no mock adapter and touches no runner. It needs only `rxjs`, so it
 * works on Vitest, Bun and `node:test` alike.
 */
export { ObserverSpy, SubscriberSpy, subscribeSpyTo, type ObserverSpyConfig } from './lib/observer-spy';
