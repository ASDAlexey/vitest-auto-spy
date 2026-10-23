// Observable assertions shared by the core and Angular entries.
export {
  expectAllEmissions,
  expectCompletion,
  expectEmission,
  expectEmissions,
  expectError,
  expectNoEmission,
  setEmissionTimeout,
  type CallbackSubscribable,
  type EmissionObserver,
  type EmissionOptions,
  type EmissionSource,
  type SubscribableLike,
} from './expect-emission';
export { expectNoEmissionSync } from './emission-sync';
export { expectEmissionSync, expectEmissionsSync, type SyncEmissionOptions } from './emission-positive-sync';
