/**
 * `vitest-auto-spy/angular` — optional Angular TestBed helpers.
 *
 * ```ts
 * import { provideAutoSpy, injectSpy } from 'vitest-auto-spy/angular';
 * ```
 *
 * This entry pulls in `@angular/core/testing`; import it only from Angular test
 * suites. The core (`vitest-auto-spy`) stays framework-agnostic and never
 * references Angular.
 */
export {
  injectSpy,
  mockAccessorsProp,
  mockReadonlyProp,
  mockReadonlyPropGetter,
  provideAutoSpy,
  type AngularValueProvider,
} from './lib/angular';
