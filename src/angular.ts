/**
 * `vitest-auto-spy/angular` — optional Angular TestBed helpers.
 *
 * ```ts
 * import { provideAutoSpy, injectSpy, renderShallow, stable } from 'vitest-auto-spy/angular';
 * ```
 *
 * This entry pulls in `@angular/core/testing`; import it only from Angular test suites. The core
 * (`vitest-auto-spy`) stays framework-agnostic and never references Angular.
 *
 * Everything here wraps the standard `TestBed` / `ComponentFixture` API rather than replacing it:
 * `renderShallow` hands back a real `ComponentFixture`, `createWithAutoSpies` builds the class
 * through Angular DI, `stable` awaits `fixture.whenStable()`. Nothing stops a spec from dropping
 * back to `@angular/core/testing` for the step a helper does not cover.
 */
import { useVitestAdapter } from './lib/use-vitest-adapter';

useVitestAdapter();

export { injectSpy, provideAutoSpy, provideAutoSpyForToken, type AngularTokenProvider, type AngularValueProvider } from './lib/angular';
export { assertNgModuleScopes, overrideAutoSpy, overrideComponentProvider, type AutoSpyOverride } from './lib/angular-overrides';
export { setupAngularTestEnv, type AngularTestEnvMode, type AngularTestEnvOptions } from './lib/angular-test-env';
export { createDirectiveHost, type DirectiveHostOptions } from './lib/directive-host';
export { registerDirectiveMatchers } from './lib/directive-matchers';

export {
  mockAccessorsProp,
  mockReadonlyProp,
  mockReadonlyPropGetter,
  mockValueProp,
  countMockedProps,
  restoreMockedProps,
  type AccessorImplementations,
  type RestoreProp,
} from './lib/prop-mock';

// The half of the Angular surface `vitest-auto-spy/bun-angular` publishes verbatim — see the module
// for why it is one file rather than two identical lists.
export * from './lib/angular-portable';

export { mockResourceProp, type MockedResource, type ResourceDouble, type ResourceDoubleStatus } from './lib/resource-prop';
export { mockSignalProp } from './lib/signal-prop';
export { registerResourceMatchers, type ResourceLike } from './lib/resource-matchers';
export { registerSignalMatchers, type SignalLike } from './lib/signal-matchers';

export {
  disableTestBedDiagnostics,
  enableTestBedDiagnostics,
  formatSpecTiming,
  getTestBedTiming,
  instrumentTestBed,
  reportSpecTiming,
  type SpecTiming,
  type TestBedDiagnosticsOptions,
} from './lib/testbed-diagnostics';

export {
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
} from './lib/expect-emission';
