/**
 * The Angular helpers that are identical on Vitest and on Bun, in one place.
 *
 * `vitest-auto-spy/angular` and `vitest-auto-spy/bun-angular` are two entries over one Angular
 * surface: they differ in which mock adapter they register and in the few helpers that need a
 * Vitest-only primitive, and in nothing else. The overlap was written out twice, and the second
 * copy is the kind that rots quietly — a helper added to one entry and not the other is not a
 * failure anywhere, it is simply missing on Bun.
 *
 * Everything re-exported here reads Angular structurally and touches no runner API, which is
 * exactly the property that makes it portable. Anything that needs `vi` belongs in `angular.ts`.
 */
export { createWithAutoSpies, type AutoSpiedInstance, type CreateWithAutoSpiesOptions, type SpyRegistry } from './create-with-auto-spies';
export { renderShallow, type ComponentInputs, type RenderShallowOptions, type ShallowRender } from './render-shallow';
export { runEffect } from './run-effect';
export { settleResource, type ResourceStatusLike, type SettleResourceOptions } from './settle-resource';
export { flushEffects, stable, type StableOptions } from './zoneless';
