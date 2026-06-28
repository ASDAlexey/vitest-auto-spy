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
import { registerMockAdapter } from './lib/mock-adapter';
import { vitestMockAdapter } from './lib/vitest-adapter';

// Angular suites run on Vitest, and this entry may be imported without the core
// (`provideAutoSpy` builds spies on its own), so register the default adapter here too.
registerMockAdapter(vitestMockAdapter);

export {
  injectSpy,
  mockAccessorsProp,
  mockReadonlyProp,
  mockReadonlyPropGetter,
  provideAutoSpy,
  type AngularValueProvider,
} from './lib/angular';
