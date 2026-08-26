/**
 * Inversion-of-control registry that keeps the framework-agnostic core free of
 * any runtime rxjs import.
 *
 * The `vitest-auto-spy/rxjs` entry registers the observable spy helpers on
 * import; the core (`function-spy.ts`, `create-spy-from-class.ts`) consults this
 * registry lazily. A plain Node / Bun / React / Vue consumer that never imports
 * `vitest-auto-spy/rxjs` therefore pulls zero rxjs into its bundle, and any
 * attempt to use observable spies without it fails with a clear, actionable
 * error instead of a cryptic `undefined is not a function`.
 */
import { DOCS_LINKS, withDocs } from './docs-links';
import type { CalledWithObject, ReturnValueContainer } from './internal-types';

/** The observable helpers the `/rxjs` entry plugs into the core. */
export interface ObservableSupport {
  addToFunctionSpy(spyFunction: object, valueContainer: ReturnValueContainer): void;
  addToCalledWithObject(calledWithObject: CalledWithObject, calledWithArgs: unknown[]): void;
  createPropSpy(): object;
}

let registeredSupport: ObservableSupport | undefined;

/** Called once by `vitest-auto-spy/rxjs` on import to enable observable spies. */
export function registerObservableSupport(support: ObservableSupport): void {
  registeredSupport = support;
}

/** The registered observable support, or `undefined` when `/rxjs` was never imported. */
export function getObservableSupport(): ObservableSupport | undefined {
  return registeredSupport;
}

/**
 * Forget the registered observable support.
 *
 * Internal, and for the same reason as `resetMockAdapter`: the registry is process-wide, so the
 * spec that proves the core works with **no** rxjs layer must empty it rather than assume its file
 * ran before `vitest-auto-spy/rxjs` was ever imported.
 */
export function resetObservableSupport(): void {
  registeredSupport = undefined;
}

const MISSING_RXJS_SUPPORT = withDocs(
  "Observable spies require rxjs. Import 'vitest-auto-spy/rxjs' once (e.g. in your test setup) " +
    'to enable observablePropsToSpyOn / nextWith / nextWithValues / throwWith / complete / returnSubject.',
  DOCS_LINKS.rxjs,
);

/** Like {@link getObservableSupport}, but throws the import hint when unavailable. */
export function requireObservableSupport(): ObservableSupport {
  if (!registeredSupport) {
    throw new Error(MISSING_RXJS_SUPPORT);
  }

  return registeredSupport;
}
