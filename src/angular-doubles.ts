import { useVitestAdapter } from './lib/use-vitest-adapter';

/**
 * `vitest-auto-spy/angular/doubles` — ready-made platform and Material dialog doubles.
 *
 * ```ts
 * import { createMatDialogRef, provideWindowDouble } from 'vitest-auto-spy/angular/doubles';
 * ```
 *
 * A companion to `vitest-auto-spy/angular`, under the same rule as `/angular-http`: a narrow entry
 * for the doubles most suites never reach — the Material dialog trio and the `Window`/`Document`
 * platform doubles — which left `/angular` in 5.21.0 so that importing spies does not evaluate them.
 *
 * The dialog ref is built through the library's own spy engine, so this entry registers the
 * Vitest mock adapter on import, exactly as `vitest-auto-spy/angular` does.
 */
export type {} from './lib/vitest-mock-types';

useVitestAdapter();

// The Material dialog trio, and the only place this package names Material at all: the token and the
// ref class are arguments precisely so that `@angular/material` stays out of its dependencies.
export {
  createMatDialogRef,
  injectMatDialogRef,
  provideMatDialogData,
  provideMatDialogRef,
  type DialogComponent,
  type DialogDataOf,
  type DialogRefLike,
  type DialogResult,
  type MatDialogRefDouble,
  type MatDialogRefInit,
} from './lib/dialog-doubles';

export {
  createDocumentDouble,
  createWindowDouble,
  provideDocumentDouble,
  provideWindowDouble,
  providePlatform,
  type PlatformFlagTokens,
  type PlatformName,
  type PlatformOverrides,
} from './lib/platform-doubles';

export { createDomSanitizerDouble, provideDomSanitizerDouble } from './lib/sanitizer-double';

export { createChangeDetectorRefDouble, provideChangeDetectorRefDouble } from './lib/change-detector-double';

// The CDK overlay, structurally: as with the dialog, the class is an argument so `@angular/cdk` stays out.
export {
  createOverlayDouble,
  injectOverlayDouble,
  provideOverlayDouble,
  type AttachedComponent,
  type OverlayDouble,
  type OverlayDoubleInit,
  type OverlayLike,
  type OverlayRefDouble,
  type OverlayRefStub,
  type PositionCall,
} from './lib/overlay-double';
