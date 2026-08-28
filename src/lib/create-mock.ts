/**
 * `createMock` — a typed stand-in built from the fields a test actually touches.
 *
 * It is one type assertion, written once, in a place a reviewer can find. That is the whole point:
 * a spec that needs an `ActivatedRouteSnapshot` with a single `data` key has to lie to the type
 * system somewhere, and the choice is between `{ data } as ActivatedRouteSnapshot` scattered
 * through the suite (which every `no-type-assertion` lint rule then has to be silenced for, one
 * `eslint-disable` at a time) and a named helper whose signature keeps the input checked.
 * Fields that do not exist on `T`, or exist with a different type, are still rejected — **at any
 * depth**, which is the half that matters after a model changes: a renamed or removed field is the
 * thing a spec fixture is least likely to notice and most likely to be lying about.
 *
 * Not a substitute for {@link createAutoMock}. The two answer different questions:
 *
 * | | `createMock<T>()` | `createAutoMock<T>()` |
 * | --- | --- | --- |
 * | Returns | `T` | `Spy<T>` |
 * | Unseeded members | `undefined` | a lazily created, decorated function spy |
 * | Use it for | data shapes — DTOs, snapshots, config objects | collaborators whose calls you assert |
 *
 * Reach for `createAutoMock` whenever the double is something the code under test *calls*; reach
 * for `createMock` when it is something the code under test *reads*.
 */
import type { DeepPartial } from './types';

/**
 * Build a `T` from the subset of its fields a test needs.
 *
 * ```ts
 * const route = createMock<ActivatedRouteSnapshot>({ data: { title: 'Report' } });
 * const config = createMock<ServerConfig>({ baseUrl: 'https://example.test' });
 * ```
 *
 * Nested objects may be partial too, so a tree the test reads one leaf of is one literal rather
 * than one call per level:
 *
 * ```ts
 * const config = createMock<FeatureFlagService>({ featureFlags: { core_retry_count: '3' } });
 * ```
 *
 * @param partial The fields to populate, checked against `T` at every depth. Everything else is
 *   `undefined` at runtime while the static type stays `T` — so an assertion on an unseeded field is
 *   a bug in the test, not in the helper.
 */
export function createMock<T>(partial?: DeepPartial<T>): T {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the single, deliberate assertion this helper exists to centralize: a partial data shape standing in for the full type in a test.
  return (partial ?? {}) as T;
}
