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

export { injectSpy, provideAutoSpy, type AngularValueProvider } from './lib/angular';

export {
  mockAccessorsProp,
  mockReadonlyProp,
  mockReadonlyPropGetter,
  mockValueProp,
  restoreMockedProps,
  type AccessorImplementations,
  type RestoreProp,
} from './lib/prop-mock';

export { renderShallow, type ComponentInputs, type RenderShallowOptions, type ShallowRender } from './lib/render-shallow';
export {
  createWithAutoSpies,
  type AutoSpiedInstance,
  type CreateWithAutoSpiesOptions,
  type SpyRegistry,
} from './lib/create-with-auto-spies';
