/**
 * `vitest-auto-spy/angular/diagnostics` — what a run misconfigures and where it pays.
 *
 * ```ts
 * // vitest.setup.ts
 * import { enableAngularDiagnostics, enableTestBedDiagnostics } from 'vitest-auto-spy/angular/diagnostics';
 * ```
 *
 * A companion to `vitest-auto-spy/angular`, under the same rule as `/angular-http`: a narrow entry
 * for helpers a suite calls once from its setup file rather than from every spec. They left
 * `/angular` in 6.0 so that importing spies no longer evaluates the diagnostics machinery a run
 * that never turns it on should not pay for — the checks of `angular-diagnostics` and the timing
 * half of `testbed-diagnostics`.
 *
 * Nothing here replaces `vitest-auto-spy/angular`: the spy factories and TestBed helpers stay
 * there, and a project with no diagnostics to run simply never imports this entry.
 */
export {
  assertNoPendingRequests,
  assertNoShadowedProviders,
  disableAngularDiagnostics,
  enableAngularDiagnostics,
  type AngularDiagnosticsOptions,
} from './lib/angular-diagnostics';

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
